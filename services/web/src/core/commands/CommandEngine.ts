import { entityAtPoint, selectAtPoint } from '../editing/pointPick'
import { byFence, inPolygon, rectPolygon, selectableEntities } from './selectionSets'
import type { Entity } from '../document/types'
import type { Deferred } from '../geom/tangency'
import { angleDeg, type Pt } from '../math'
import type { DocumentModel } from '../document/DocumentModel'
import { constrainOrtho, type PreviewShape } from '../preview'
import { isWorldAligned, ucsToWorld, worldToUcs, type Ucs } from '../ucs'
import { flushFrame, frameContext } from './ucsFrame'
import { expandGroups } from '../document/groups'
import { sysvars } from './sysvars'
import { parseCoordinate, parseNumber } from './coords'
import { matchOsnapOverride } from '../snap/osnap'
import type { OsnapKind } from '../snap/osnap'
import { matchKeyword } from './keywords'
import { reportError } from '../errors'
import type {
  AngleResult,
  AppHooks,
  Command,
  CommandContext,
  DistanceResult,
  GetAngleOptions,
  GetDistanceOptions,
  GetPointOptions,
  PointPick,
  PointResult,
} from './types'


/** Resultado de un lote de multicomandos. */
export interface ScriptResult {
  ok: boolean
  /** Entradas procesadas. */
  ran: number
  /** Índice de la entrada rechazada. */
  failedAt?: number
  error?: string
  /** Todo lo que se imprimió (prompts con su respuesta y mensajes). */
  transcript: string[]
  /** Prompt en el que quedó esperando un comando (`finish: 'leave'`). */
  waitingAt?: string
  /** Prompt del comando que se canceló al terminar el lote (`finish: 'cancel'`). */
  cancelledAt?: string
}

/** Mensajes con los que un comando rechaza una entrada y la vuelve a pedir. */
const SCRIPT_ERROR = /invalid|requires|cannot|not found|unknown|must be|out of range|not allowed|no .*found/i

export interface CommandEngineDeps {
  doc: DocumentModel
  currentLayerId: () => string
  isOrtho: () => boolean
  /** Entrada dinámica (F12): coordenadas tecleadas relativas al punto anterior sin `@`. */
  isDynInput?: () => boolean
  currentCursor: () => Pt
  currentUcs: () => Ucs
  currentSelection: () => string[]
  onSelectionChange: (ids: string[]) => void
  /** Objetos tomados por el comando en curso (sólo para resaltarlos). */
  onPicked?: (ids: string[]) => void
  app: AppHooks
  onPrompt: (prompt: string) => void
  onPrint: (line: string) => void
  onChange: () => void
  onOpenHelp: () => void
  onBeforeCommand: (name: string) => void
  onAfterCommand: (name: string) => void
}

type PreviewFn = (cursor: Pt) => PreviewShape[]

/** Opciones de `Select objects:` del CAD clásico (además de las del comando). */
const SELECT_KEYWORDS = ['ALL', 'Last', 'Previous', 'Window', 'Crossing', 'WPolygon', 'CPolygon', 'Fence', 'Add', 'Remove', 'Undo']
type SelArea = 'Window' | 'Crossing' | 'WPolygon' | 'CPolygon' | 'Fence'

/**
 * Quita el `_` inicial (uno o varios) con el que el CAD clásico prefija comandos y keywords en macros y
 * scripts para forzar el nombre en inglés (`_LINE`, `_C`, `_Close`). El resto del texto no se altera.
 */
export function stripUnderscore(text: string): string {
  return text.trim().replace(/^_+/, '')
}

type Pending =
  | {
      type: 'point'
      base: Pt | null
      keywords: string[]
      /** Keyword que devuelve un Enter vacío (en vez de cancelar). */
      enterKeyword?: string
      /** Texto libre aceptado como keyword (p. ej. `1/50xp` en ZOOM). */
      textKeyword?: RegExp
      preview?: PreviewFn
      /** Esquina de ventana: sin ortho. */
      corner?: boolean
      snapEntities?: Entity[]
      resolve: (r: PointResult) => void
    }
  | {
      type: 'distance'
      base: Pt
      measure?: (p: Pt) => number
      keywords: string[]
      def?: number
      enterKeyword?: string
      preview?: PreviewFn
      resolve: (r: DistanceResult) => void
    }
  | {
      type: 'angle'
      base: Pt
      /** Si está, el ángulo indicado con el cursor se mide desde `base → relativeTo` (ángulo incluido). */
      relativeTo?: Pt
      keywords: string[]
      def?: number
      enterKeyword?: string
      preview?: PreviewFn
      resolve: (r: AngleResult) => void
    }
  | {
      type: 'selection'
      ids: Set<string>
      resolve: (r: string[] | null) => void
      /** Opciones que se pueden teclear en lugar de seleccionar (p. ej. `MATCHPROP [Settings]`). */
      keywords?: string[]
      onKeyword?: (kw: string) => void
      /** Prompt de la selección (se vuelve a él tras una ventana/polígono). */
      prompt: string
      /** Modo `Remove` (los objetos tocados se quitan) en vez de `Add`. */
      remove?: boolean
      /** Pasos para `Undo` (lo agregado o quitado en cada uno). */
      steps: Array<{ ids: string[]; removed: boolean }>
      /** Ventana, cruce, polígonos o borde en curso: sus puntos. */
      sub?: { kind: SelArea; pts: Pt[] }
    }
  | {
      type: 'string'
      def: string | null
      resolve: (r: string | null) => void
    }

/**
 * Motor de comandos tipo CAD clásico: registry + máquina de prompts secuenciales.
 * Framework-agnostic: la UI le entrega texto (línea de comandos) o puntos
 * (clicks del viewport) y el engine resuelve el prompt pendiente.
 */
/** Esc durante un comando: el comando que vuelva a preguntar algo se corta (como el CAD clásico, Esc cancela todo). */
class CommandCancelled extends Error {}

export class CommandEngine {
  private readonly commands: Command[] = []
  private readonly lookup = new Map<string, Command>()
  private pending: Pending | null = null
  private activeCommand: Command | null = null
  private lastPoint: Pt | null = null
  private dyn = () => this.deps.isDynInput?.() ?? false
  /** Base de lo relativo: la del prompt; sin ella, `@` sigue siendo relativo al último punto (LASTPOINT). */
  private relBase = (base: Pt | null, text: string): Pt | null => base ?? (text.startsWith('@') ? this.lastPoint : null)
  /** Override de snap de un solo uso (tecleado en el prompt: cen/end/mid/…). */
  private osnapOverrideKind: OsnapKind | null = null
  /** Historial de comandos ejecutados (para recuperar con ↑/↓) y repetir con Enter. */
  private history: string[] = []
  private lastCmdName: string | null = null
  private readonly ctx: CommandContext
  /**
   * UCS dinámica: entradas del comando en curso (para repetirlas al reiniciarlo en la UCS de
   * una cara), puntos ya dados, si pidió objetos, y la cola de repetición del reinicio.
   */
  private runInputs: string[] = []
  private runPoints = 0
  private runSelected = false
  private ducsRun = false
  private replay: Array<string | Pt> = []
  private restart: { name: string; ucs: Ucs; replay: Array<string | Pt> } | null = null
  /** Hubo Esc en el comando en curso: un prompt más lo termina (ver `CommandCancelled`). */
  private escaped = false

  /** Un prompt del comando en curso, salvo que ya se haya cancelado con Esc. */
  private ask<T>(f: () => Promise<T>): Promise<T> {
    return this.escaped && this.activeCommand ? Promise.reject(new CommandCancelled()) : f()
  }

  constructor(private readonly deps: CommandEngineDeps) {
    this.ctx = {
      getPoint: (prompt, opts) => this.ask(() => this.requestPoint(prompt, opts)),
      getDistance: (prompt, opts) => this.ask(() => this.requestDistance(prompt, opts)),
      getAngle: (prompt, opts) => this.ask(() => this.requestAngle(prompt, opts)),
      getSelection: (prompt) => this.ask(() => this.requestSelection(prompt)),
      markPicked: (ids) => {
        for (const id of ids) if (!this.picked.includes(id)) this.picked.push(id)
        this.deps.onPicked?.([...this.picked])
      },
      highlight: (ids) => {
        this.selectionUsed = true // se suelta al terminar el comando
        this.deps.onSelectionChange(ids)
      },
      getSelectionOrKeyword: (prompt, keywords) =>
        this.ask(() => new Promise((resolve) => {
          this.selectionUsed = true
          this.pending = {
            type: 'selection',
            ids: new Set(),
            prompt,
            steps: [],
            keywords,
            resolve: (ids) => resolve(ids ? { kind: 'selection', ids } : null),
            onKeyword: (keyword) => resolve({ kind: 'keyword', keyword }),
          }
          this.setPrompt(prompt)
        })),
      getString: (prompt, opts) => this.ask(() => this.requestString(prompt, opts)),
      print: (msg) => this.deps.onPrint(msg),
      openHelp: () => this.deps.onOpenHelp(),
      app: this.deps.app,
      doc: this.deps.doc,
      currentLayerId: this.deps.currentLayerId,
    }
  }

  register(cmd: Command): void {
    this.commands.push(cmd)
    this.lookup.set(cmd.name.toUpperCase(), cmd)
    for (const a of cmd.aliases) this.lookup.set(a.toUpperCase(), cmd)
  }

  getCommands(): Command[] {
    return [...this.commands]
  }

  get busy(): boolean {
    return this.activeCommand !== null
  }

  /** Para el menú contextual: el último comando (Repeat), los recientes y las opciones del prompt actual. */
  menuInfo(): { last: string | null; recent: string[]; keywords: string[] } {
    const p = this.pending
    const keywords = p && 'keywords' in p && Array.isArray(p.keywords) ? [...p.keywords] : []
    return { last: this.lastCmdName, recent: [...this.history].reverse().slice(0, 8), keywords }
  }

  get hasPending(): boolean {
    return this.pending !== null
  }

  get isSelecting(): boolean {
    const p = this.pending
    // Un borde o un polígono en curso (F/WP/CP) pide puntos: los clics no eligen objetos ni abren ventanas.
    return p?.type === 'selection' && !(p.sub && (p.sub.kind === 'Fence' || p.sub.kind === 'WPolygon' || p.sub.kind === 'CPolygon'))
  }

  /**
   * Ventana o cruce pedidos con `W`/`C` en "Select objects": el visor la abre en pantalla con ese tipo, aunque el
   * primer clic caiga sobre un objeto y sin importar el sentido (null = ventana implícita, por el sentido).
   */
  get selectionArea(): 'window' | 'crossing' | null {
    const p = this.pending
    if (p?.type !== 'selection' || !p.sub) return null
    return p.sub.kind === 'Window' ? 'window' : p.sub.kind === 'Crossing' ? 'crossing' : null
  }

  /** Cierra la ventana `W`/`C` con los objetos que encerró en pantalla. */
  completeArea(ids: string[]): void {
    const sel = this.pending
    if (sel?.type !== 'selection' || !sel.sub) return
    sel.sub = undefined
    this.applySel(sel, ids, !!sel.remove)
    this.setPrompt(sel.prompt)
  }

  /** ¿Hay un prompt esperando un punto/distancia? (para activar el object snap solo entonces). */
  get awaitingPoint(): boolean {
    const t = this.pending?.type
    return t === 'point' || t === 'distance' || t === 'angle'
  }

  /** Override de snap de un solo uso activo (o null). Lo consume la próxima captura. */
  osnapOverride(): OsnapKind | null {
    return this.osnapOverrideKind
  }

  /** Geometría en curso del comando que da snaps (ver `GetPointOptions.snapEntities`). */
  snapEntities(): Entity[] | undefined {
    const p = this.pending
    return p?.type === 'point' && p.snapEntities?.length ? p.snapEntities : undefined
  }

  /** Punto base del prompt actual (rubber-band), para osnaps deferred (perpendicular/tangent). */
  snapBase(): Pt | null {
    const p = this.pending
    if (p?.type === 'point') return p.base
    if (p?.type === 'distance' || p?.type === 'angle') return p.base
    return null
  }

  // --- API para la UI -------------------------------------------------------

  /** Prompt visible y su eco en el historial (el CAD clásico repite cada prompt con lo que se respondió). */
  private currentPrompt = ''
  private setPrompt(prompt: string): void {
    this.currentPrompt = prompt
    this.deps.onPrompt(prompt)
    // Reinicio por UCS dinámica: se vuelven a dar las entradas que el usuario ya había dado.
    if (this.pending && this.replay.length) {
      const next = this.replay.shift()!
      // El texto se vuelve a teclear; el clic se repite como punto (sin eco, como un clic).
      setTimeout(() => (typeof next === 'string' ? this.submitText(next) : this.submitPoint(next, true)), 0)
    }
  }

  /** Comandos de dibujo en los que actúa la UCS dinámica (el CAD clásico DUCS). */
  private static readonly DUCS = new Set(['LINE', 'PLINE', 'CIRCLE', 'ARC', 'RECTANGLE', 'POLYGON', 'ELLIPSE', 'TEXT', 'MTEXT', 'BOX', 'CYLINDER', 'CONE', 'SPHERE', 'TORUS', 'SPLINE'])

  /** ¿Se puede alinear la UCS a una cara ahora? Primer punto de un comando de dibujo con UCSDETECT. */
  get ducsEligible(): boolean {
    return (
      sysvars.UCSDETECT === 1 &&
      !!this.activeCommand &&
      CommandEngine.DUCS.has(this.activeCommand.name) &&
      this.pending?.type === 'point' &&
      this.runPoints === 0 &&
      !this.runSelected &&
      !this.ducsRun
    )
  }
  private echo(answer = ''): void {
    const line = (this.currentPrompt + answer).trimEnd()
    if (line) this.deps.onPrint(line)
  }

  /** Entrada rechazada por el motor (punto, valor, opción o comando inválido): el lote de comandos se corta ahí. */
  private rejected = false
  private reject(msg: string): void {
    this.rejected = true
    this.deps.onPrint(msg)
  }

  /** ¿Hay un comando en curso? */
  isBusy(): boolean {
    return this.activeCommand !== null
  }

  /**
   * Multicomandos: da cada entrada al prompt que toque, como un script del CAD clásico (al terminar un comando, la
   * siguiente entrada arranca otro; `''` es Enter y en la línea de comandos vacía no repite el último). Si una
   * entrada no sirve se cancela el comando y el lote se corta ahí. Al final, `finish: 'cancel'` cancela el comando
   * que haya quedado esperando (el agente); `'leave'`, lo deja para seguir a mano.
   */
  async runScript(inputs: string[], opts: { finish?: 'cancel' | 'leave'; timeoutMs?: number } = {}): Promise<ScriptResult> {
    const lines: string[] = []
    const print = this.deps.onPrint
    this.deps.onPrint = (msg) => {
      lines.push(msg)
      print(msg)
    }
    const tick = () => new Promise<void>((r) => setTimeout(r, 0))
    const timeout = opts.timeoutMs ?? 20000
    const settle = async () => {
      const t0 = Date.now()
      await tick()
      while (this.activeCommand && !this.pending) {
        if (Date.now() - t0 > timeout) return false
        await tick()
      }
      return true
    }
    try {
      for (let i = 0; i < inputs.length; i++) {
        const text = inputs[i]
        if (!this.activeCommand && text.trim() === '') continue
        const prompt = this.currentPrompt
        const from = lines.length
        this.rejected = false
        this.submitText(text)
        if (!(await settle())) {
          this.cancel()
          return { ok: false, ran: i, failedAt: i, error: 'The command did not answer (it may be waiting for a dialog).', transcript: lines }
        }
        const fresh = lines.slice(from).filter((l) => !(prompt && l.startsWith(prompt)))
        const asksAgain = !!this.pending && this.currentPrompt === prompt && fresh.some((l) => SCRIPT_ERROR.test(l))
        if (this.rejected || asksAgain) {
          const error = fresh.filter((l) => SCRIPT_ERROR.test(l)).at(-1) ?? fresh.at(-1) ?? 'Input rejected.'
          this.cancel()
          await settle()
          return { ok: false, ran: i, failedAt: i, error, transcript: lines }
        }
      }
      if (this.activeCommand && opts.finish === 'cancel') {
        const waiting = this.currentPrompt
        this.cancel()
        await settle()
        return { ok: true, ran: inputs.length, transcript: lines, cancelledAt: waiting }
      }
      return { ok: true, ran: inputs.length, transcript: lines, ...(this.activeCommand ? { waitingAt: this.currentPrompt } : {}) }
    } finally {
      this.deps.onPrint = print
    }
  }

  /** Texto tecleado en la línea de comandos. */
  submitText(text: string): void {
    if (this.pending) {
      this.runInputs.push(text)
      this.echo(text.trim())
      this.resolveFromText(text)
      return
    }
    if (this.activeCommand) return // en transición entre prompts; ignorar
    const name = text.trim()
    if (name) {
      void this.executeByName(name)
      return
    }
    // Enter vacío sin comando en curso: repite el último comando (CAD clásico).
    if (this.lastCmdName) void this.executeByName(this.lastCmdName)
  }

  /** Historial de comandos ejecutados (más reciente al final), para recuperar con ↑/↓. */
  commandHistory(): string[] {
    return [...this.history]
  }

  /** Punto indicado con click en el viewport (ya en coordenadas de mundo). `snapped` = el punto
   *  quedó fijado por un object snap → tiene prioridad sobre ORTHO (no se reconstriñe), como el CAD clásico. */
  submitPoint(p: Pt, snapped = false, pick?: PointPick): void {
    const pending = this.pending
    if (!pending) return
    this.osnapOverrideKind = null // el override se consume con la captura
    if (pending.type !== 'selection' && pending.type !== 'string') this.echo()
    if (pending.type === 'point') {
      const point = !snapped && this.deps.isOrtho() && pending.base && !pending.corner ? this.orthoConstrain(pending.base, p) : p
      if (this.outsideLimits(point)) return
      this.lastPoint = point
      this.pending = null
      pending.resolve(pick ? { kind: 'point', point, pick } : { kind: 'point', point })
    } else if (pending.type === 'distance') {
      this.pending = null
      // Distancia real en 3D (como el CAD clásico): en FRONT/LEFT el cursor se mueve en un plano vertical.
      pending.resolve({ kind: 'distance', value: pending.measure ? pending.measure(p) : Math.hypot(p.x - pending.base.x, p.y - pending.base.y, p.z - pending.base.z) })
    } else if (pending.type === 'angle') {
      const deg = this.directedAngle(pending.base, p, pending.relativeTo)
      this.pending = null
      pending.resolve({ kind: 'angle', deg })
    }
  }

  /**
   * Ángulo base→p en el plano XY de la UCS (el CAD clásico mide los ángulos desde la X de la UCS), medido desde
   * `base → relativeTo` cuando el prompt pidió un ángulo incluido.
   */
  private directedAngle(base: Pt, p: Pt, relativeTo?: Pt): number {
    const u = this.deps.currentUcs()
    const [b, q] = [worldToUcs(base, u), worldToUcs(p, u)]
    const a = angleDeg(b, q)
    return relativeTo ? a - angleDeg(b, worldToUcs(relativeTo, u)) : a
  }

  /**
   * LIMCHECK: con los límites activados (`LIMITS ON`), un punto del modelo fuera de ellos (XY del
   * mundo) se rechaza con `**Outside limits` y el prompt sigue esperando, como el CAD clásico.
   */
  private outsideLimits(p: Pt): boolean {
    const doc = this.deps.doc
    const v = doc.vars
    if (!v.LIMCHECK || doc.inPaperSpace) return false
    const out = p.x < v.LIMMIN[0] - 1e-9 || p.y < v.LIMMIN[1] - 1e-9 || p.x > v.LIMMAX[0] + 1e-9 || p.y > v.LIMMAX[1] + 1e-9
    if (out) this.deps.onPrint('**Outside limits')
    return out
  }

  /** Formas de previsualización para la posición actual del cursor (rubber-band). */
  computePreview(cursor: Pt): PreviewShape[] {
    const pending = this.pending
    if (pending?.type === 'selection' && pending.sub?.pts.length) {
      // Ventana / cruce / polígono / borde en curso.
      const { kind, pts } = pending.sub
      if (kind === 'Window' || kind === 'Crossing') return [{ kind: 'polyline', points: [...rectPolygon(pts[0], cursor), pts[0]] }]
      return [{ kind: 'polyline', points: kind === 'Fence' ? [...pts, cursor] : [...pts, cursor, pts[0]] }]
    }
    if (!pending || pending.type === 'selection' || pending.type === 'string' || !pending.preview) return []
    let c = cursor
    if (pending.type === 'point' && pending.base && !pending.corner && this.deps.isOrtho()) {
      c = this.orthoConstrain(pending.base, cursor)
    }
    return pending.preview(c)
  }

  /**
   * Click en el viewport: aporta un punto de mundo y (si aplica) la entidad pickeada.
   * En un prompt `Select objects:` el click **suma** a la selección y con Shift la **resta**
   * (CAD clásico); la selección sólo se vacía con ESC. En un prompt de punto, el resultado lleva el
   * `pick` (entidad, punto sin snap y Shift) para comandos que eligen objetos por click (TRIM…).
   */
  submitClick(world: Pt, pickedId: string | null, snapped = false, subtract = false, raw?: Pt, deferred?: Deferred, face?: Ucs): void {
    if (!this.pending) return
    // UCS dinámica: el primer punto sobre una cara plana reinicia el comando en la UCS de esa cara (el
    // punto y lo ya tecleado se repiten); al terminar vuelve la UCS anterior.
    if (face && this.ducsEligible && this.activeCommand) {
      this.restart = { name: this.activeCommand.name, ucs: face, replay: [...this.runInputs, { ...world }] }
      this.cancel(true)
      return
    }
    if (this.pending.type === 'selection') {
      const sel = this.pending
      if (sel.sub) return this.addSelPoint(sel, world)
      if (pickedId) this.applySel(sel, [pickedId], subtract || !!sel.remove, true, this.currentPrompt)
      return
    }
    this.submitPoint(world, snapped, { id: pickedId, raw: raw ?? world, shift: subtract, ...(deferred ? { deferred } : {}) })
  }

  /** Con PICKSTYLE, los ids más los demás miembros de sus grupos seleccionables. */
  withGroups(ids: string[]): string[] {
    return sysvars.PICKSTYLE ? expandGroups(this.deps.doc.groups, ids) : ids
  }

  /** Agrega varios ids a la selección pendiente (selección por ventana). */
  addPicks(ids: string[]): void {
    if (!this.pending || this.pending.type !== 'selection') return
    for (const id of this.withGroups(ids)) this.pending.ids.add(id)
    this.deps.onSelectionChange([...this.pending.ids])
  }

  /** Quita varios ids de la selección pendiente (Shift + ventana). */
  removePicks(ids: string[]): void {
    if (!this.pending || this.pending.type !== 'selection') return
    for (const id of this.withGroups(ids)) this.pending.ids.delete(id)
    this.deps.onSelectionChange([...this.pending.ids])
  }

  /** Tipo del prompt pendiente (`null` si no hay ninguno). La UI lo usa, p. ej., para saber si el
   *  espacio confirma (como Enter) o es un carácter literal del texto que se está tecleando. */
  pendingKind(): 'point' | 'distance' | 'angle' | 'selection' | 'string' | null {
    return this.pending?.type ?? null
  }

  /** Cancelación (ESC); `quiet` = sin `*Cancel*` (el reinicio de la UCS dinámica). */
  cancel(quiet = false): void {
    const pending = this.pending
    if (!pending) return
    this.osnapOverrideKind = null
    this.pending = null
    if (this.activeCommand && !this.escaped) {
      this.escaped = true
      if (!quiet) this.deps.onPrint('*Cancel*')
    }
    if (pending.type === 'selection') pending.resolve(null)
    else if (pending.type === 'string') pending.resolve(null)
    else pending.resolve({ kind: 'cancel' })
  }

  // --- Internos -------------------------------------------------------------

  async executeByName(input: string, opts: { silent?: boolean } = {}): Promise<void> {
    const cmd = this.lookup.get(stripUnderscore(input).toUpperCase())
    if (!cmd) {
      this.reject(`Unknown command: ${input}`)
      this.setPrompt('')
      return
    }
    this.activeCommand = cmd
    this.escaped = false
    this.lastPoint = null
    this.lastCmdName = cmd.name
    if (this.history[this.history.length - 1] !== cmd.name) this.history.push(cmd.name)
    if (this.history.length > 100) this.history.shift()
    if (!opts.silent) this.deps.onPrint(`Command: ${cmd.name}`)
    this.deps.onBeforeCommand(cmd.name)
    this.selectionUsed = false
    this.preselectionTaken = false
    this.runInputs = []
    this.runPoints = 0
    this.runSelected = false
    const u = this.deps.currentUcs()
    const ctx = cmd.planar && !isWorldAligned(u) ? frameContext(this.ctx, u) : this.ctx
    try {
      try {
        await cmd.run(ctx)
      } catch (err) {
        if (!(err instanceof CommandCancelled)) throw err
      }
      if (ctx !== this.ctx) flushFrame(ctx)
    } catch (err) {
      this.deps.onPrint(`Error: ${err instanceof Error ? err.message : String(err)}`)
      reportError(`${cmd.name} failed`, err)
    } finally {
      this.activeCommand = null
      this.escaped = false
      this.pending = null
      // Como el CAD clásico: terminado un comando que pidió objetos, la selección se vacía (sigue disponible
      // como `Previous`); SELECT la deja armada para el comando siguiente.
      if (this.selectionUsed && cmd.name !== 'SELECT' && cmd.name !== 'SELECTSIMILAR') this.deps.onSelectionChange([])
      // Sin ruido de punto flotante en lo que quedó guardado (1 y no 0.9999999999995453).
      this.ctx.doc.cleanNumbers()
      if (this.picked.length) {
        this.picked = []
        this.deps.onPicked?.([])
      }
      this.deps.onAfterCommand(cmd.name)
      this.setPrompt('')
      this.deps.onChange()
    }
    const r = this.restart
    if (r) {
      this.restart = null
      await this.runInFaceUcs(r)
    }
  }

  /** Corre el comando de nuevo en la UCS de una cara (temporal) y restaura la anterior al terminar. */
  private async runInFaceUcs(r: { name: string; ucs: Ucs; replay: Array<string | Pt> }): Promise<void> {
    const app = this.ctx.app
    const before = app.getUcs?.() ?? null
    const beforeName = app.ucsName?.() ?? undefined
    app.setUcs(r.ucs, undefined, true)
    this.ducsRun = true
    this.replay = [...r.replay]
    try {
      await this.executeByName(r.name, { silent: true })
    } finally {
      this.ducsRun = false
      this.replay = []
      if (before) app.setUcs(before, beforeName, true)
    }
  }

  /**
   * Pide un punto FUERA de un comando (para edición de grips): el usuario lo fija con click o tecleando
   * coordenadas (absolutas/relativas), con ORTHO/snap y preview del fantasma. ESC lo cancela. Al
   * resolverse limpia el prompt. Reutiliza toda la maquinaria de `getPoint`.
   */
  async requestGripPoint(prompt: string, base: Pt, preview: PreviewFn, opts: { keywords?: string[]; enterKeyword?: string } = {}): Promise<PointResult> {
    const r = await this.requestPoint(prompt, { base, preview, ...opts })
    this.setPrompt('')
    return r
  }

  /** Como `requestGripPoint`, para un ángulo (ROTATE de los grips) o un factor/distancia (SCALE). */
  async requestGripValue<K extends 'angle' | 'distance'>(
    kind: K,
    prompt: string,
    base: Pt,
    preview: PreviewFn,
    opts: { keywords?: string[]; enterKeyword?: string } = {},
  ): Promise<K extends 'angle' ? AngleResult : DistanceResult> {
    const o = { base, preview, ...opts }
    const r = kind === 'angle' ? await this.requestAngle(prompt, o) : await this.requestDistance(prompt, o)
    this.setPrompt('')
    return r as K extends 'angle' ? AngleResult : DistanceResult
  }

  private requestPoint(prompt: string, opts?: GetPointOptions): Promise<PointResult> {
    return new Promise<PointResult>((resolve) => {
      this.pending = {
        type: 'point',
        base: opts && 'base' in opts ? (opts.base ?? null) : this.lastPoint,
        keywords: opts?.keywords ?? [],
        enterKeyword: opts?.enterKeyword,
        textKeyword: opts?.textKeyword,
        preview: opts?.preview,
        corner: opts?.corner,
        snapEntities: opts?.snapEntities,
        resolve: (r) => {
          if (r.kind === 'point') this.runPoints++
          resolve(r)
        },
      }
      this.setPrompt(prompt)
    })
  }

  private requestAngle(prompt: string, opts: GetAngleOptions): Promise<AngleResult> {
    return new Promise<AngleResult>((resolve) => {
      this.pending = {
        type: 'angle',
        base: opts.base,
        relativeTo: opts.relativeTo,
        keywords: opts.keywords ?? [],
        def: opts.default,
        enterKeyword: opts.enterKeyword,
        preview: opts.preview,
        resolve,
      }
      this.setPrompt(prompt)
    })
  }

  private requestDistance(prompt: string, opts: GetDistanceOptions): Promise<DistanceResult> {
    return new Promise<DistanceResult>((resolve) => {
      this.pending = {
        type: 'distance',
        base: opts.base,
        measure: opts.measure,
        keywords: opts.keywords ?? [],
        def: opts.default,
        enterKeyword: opts.enterKeyword,
        preview: opts.preview,
        resolve,
      }
      this.setPrompt(prompt)
    })
  }

  /** Restringe `p` a los ejes del UCS respecto de `base` (modo ORTHO). */
  private orthoConstrain(base: Pt, p: Pt): Pt {
    const u = this.deps.currentUcs()
    const r = ucsToWorld(constrainOrtho(worldToUcs(base, u), worldToUcs(p, u)), u)
    // La coordenada que ortho deja fija se copia exacta del punto base (el ida y vuelta por la UCS deja ruido).
    const fix = (a: number, b: number) => (Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)) ? b : a)
    return { x: fix(r.x, base.x), y: fix(r.y, base.y), z: fix(r.z, base.z) }
  }

  /** Punto a `dist` desde `base` en la dirección del cursor (ortho si aplica). */
  private directDistancePoint(base: Pt, dist: number): Pt | null {
    let cursor = this.deps.currentCursor()
    if (this.deps.isOrtho()) cursor = this.orthoConstrain(base, cursor)
    // En 3D: el cursor se mueve en el plano de la UCS (en FRONT, vertical), la dirección conserva la Z.
    const dx = cursor.x - base.x
    const dy = cursor.y - base.y
    const dz = cursor.z - base.z
    const len = Math.hypot(dx, dy, dz)
    if (len < 1e-9) return null
    return { x: base.x + (dx / len) * dist, y: base.y + (dy / len) * dist, z: base.z + (dz / len) * dist }
  }

  private matchKeyword(text: string, keywords: string[]): string | null {
    return matchKeyword(stripUnderscore(text), keywords)
  }

  private requestSelection(prompt: string): Promise<string[] | null> {
    // Pre-selección (noun-verb, estilo CAD clásico): si ya hay objetos seleccionados,
    // el comando los toma directamente sin volver a pedir la selección.
    this.selectionUsed = true
    this.runSelected = true
    // La pre-selección se usa una sola vez por comando: si el comando vuelve a pedir objetos (p. ej. porque los
    // elegidos no sirven) se espera una selección nueva; si no, quedaba en un bucle sin fin y la app se colgaba.
    const pre = this.preselectionTaken ? [] : this.deps.currentSelection()
    if (this.preselectionTaken && this.deps.currentSelection().length) this.deps.onSelectionChange([])
    if (pre.length > 0) {
      this.preselectionTaken = true
      this.previousSet = [...pre]
      return Promise.resolve([...pre])
    }
    return new Promise<string[] | null>((resolve) => {
      this.pending = {
        type: 'selection',
        ids: new Set(),
        prompt,
        steps: [],
        resolve: (ids) => {
          if (ids?.length) this.previousSet = [...ids]
          resolve(ids)
        },
      }
      this.setPrompt(prompt)
    })
  }

  /** Último conjunto de selección usado (opción `Previous`). */
  private previousSet: string[] = []
  /** ¿El comando en curso pidió una selección? (para vaciarla al terminar). */
  private selectionUsed = false
  private picked: string[] = []
  private preselectionTaken = false

  /** Agrega (o quita) ids a la selección en curso, como un paso deshacible; informa "N found". */
  private applySel(sel: Extract<Pending, { type: 'selection' }>, picked: string[], remove: boolean, report = true, prefix = ''): void {
    const ids = this.withGroups(picked)
    const changed = ids.filter((id) => (remove ? sel.ids.has(id) : !sel.ids.has(id)))
    for (const id of changed) {
      if (remove) sel.ids.delete(id)
      else sel.ids.add(id)
    }
    if (changed.length) sel.steps.push({ ids: changed, removed: remove })
    if (report) this.deps.onPrint(prefix + (remove ? `${ids.length} found, ${changed.length} removed, ${sel.ids.size} total` : `${ids.length} found${ids.length !== changed.length ? ` (${ids.length - changed.length} duplicate)` : ''}, ${sel.ids.size} total`))
    this.deps.onSelectionChange([...sel.ids])
  }

  /** Como el CAD clásico: cuántos de los que tomaría la ventana o el borde quedaron afuera por estar bloqueados. */
  private reportLocked(pick: (ents: Entity[]) => string[]): void {
    const layers = new Map(this.deps.doc.layers.map((l) => [l.id, l]))
    const locked = this.deps.doc.entities.filter((e) => {
      const l = layers.get(e.layer)
      return !!l && l.locked && l.visible && !l.frozen
    })
    const n = locked.length ? pick(locked).length : 0
    if (n) this.deps.onPrint(`${n} ${n === 1 ? 'was' : 'were'} on a locked layer.`)
  }

  /** Punto de una ventana/cruce/polígono/borde en curso; al completarse, selecciona. */
  private addSelPoint(sel: Extract<Pending, { type: 'selection' }>, p: Pt): void {
    const sub = sel.sub!
    sub.pts.push(p)
    const ents = selectableEntities(this.deps.doc)
    if ((sub.kind === 'Window' || sub.kind === 'Crossing') && sub.pts.length === 2) {
      sel.sub = undefined
      const pick = (list: Entity[]) => inPolygon(list, rectPolygon(sub.pts[0], sub.pts[1]), sub.kind === 'Crossing')
      this.applySel(sel, pick(ents), !!sel.remove)
      this.reportLocked(pick)
      this.setPrompt(sel.prompt)
      return
    }
    this.setPrompt(sub.kind === 'Window' || sub.kind === 'Crossing' ? 'Specify opposite corner: ' : sub.kind === 'Fence' ? 'Specify endpoint of line or [Undo]: ' : 'Specify endpoint of line or [Undo]: ')
  }

  /** Texto en un prompt de selección: Enter, opciones del comando u opciones del CAD clásico. */
  private selectionText(sel: Extract<Pending, { type: 'selection' }>, trimmed: string): void {
    if (sel.sub) {
      const sub = sel.sub
      if (trimmed === '') {
        // Fin del polígono / borde.
        sel.sub = undefined
        const ents = selectableEntities(this.deps.doc)
        const pick =
          sub.kind === 'Fence' && sub.pts.length >= 2
            ? (list: Entity[]) => byFence(list, sub.pts)
            : (sub.kind === 'WPolygon' || sub.kind === 'CPolygon') && sub.pts.length >= 3
              ? (list: Entity[]) => inPolygon(list, sub.pts, sub.kind === 'CPolygon')
              : null
        if (pick) {
          this.applySel(sel, pick(ents), !!sel.remove)
          this.reportLocked(pick)
        }
        this.setPrompt(sel.prompt)
        return
      }
      if (/^u(ndo)?$/i.test(trimmed) && sub.pts.length) {
        sub.pts.pop()
        return
      }
      const p = parseCoordinate(trimmed, sub.pts[sub.pts.length - 1] ?? this.lastPoint, this.deps.currentUcs(), this.dyn())
      if (p) this.addSelPoint(sel, p)
      else this.reject('*Invalid point*')
      return
    }
    if (trimmed === '') {
      this.pending = null
      sel.resolve([...sel.ids])
      return
    }
    const kw = sel.keywords ? this.matchKeyword(trimmed, sel.keywords) : null
    if (kw && sel.ids.size === 0) {
      this.pending = null
      sel.onKeyword?.(kw)
      return
    }
    const opt = this.matchKeyword(trimmed, SELECT_KEYWORDS)
    const ents = () => selectableEntities(this.deps.doc)
    // Un punto tecleado elige el objeto que pasa por él (o el sólido, texto o bloque que lo contiene).
    const at = opt ? null : parseCoordinate(trimmed, this.lastPoint, this.deps.currentUcs(), false)
    if (at) {
      const id = selectAtPoint(ents(), [at.x, at.y, at.z])
      if (!id) return this.reject('0 found: no object at that point.')
      return this.applySel(sel, [id], !!sel.remove)
    }
    switch (opt) {
      case 'ALL':
        return this.applySel(sel, ents().map((e) => e.id), !!sel.remove)
      case 'Last': {
        const last = ents().at(-1)
        return this.applySel(sel, last ? [last.id] : [], !!sel.remove)
      }
      case 'Previous': {
        const alive = new Set(ents().map((e) => e.id))
        return this.applySel(sel, this.previousSet.filter((id) => alive.has(id)), !!sel.remove)
      }
      case 'Window':
      case 'Crossing':
      case 'WPolygon':
      case 'CPolygon':
      case 'Fence':
        sel.sub = { kind: opt, pts: [] }
        this.setPrompt(opt === 'Window' || opt === 'Crossing' ? 'Specify first corner: ' : opt === 'Fence' ? 'Specify first fence point: ' : 'First polygon point: ')
        return
      case 'Add':
        sel.remove = false
        sel.prompt = 'Select objects: '
        this.setPrompt(sel.prompt)
        return
      case 'Remove':
        sel.remove = true
        sel.prompt = 'Remove objects: '
        this.setPrompt(sel.prompt)
        return
      case 'Undo': {
        const step = sel.steps.pop()
        if (!step) return this.deps.onPrint('All selection steps have been undone.')
        for (const id of step.ids) {
          if (step.removed) sel.ids.add(id)
          else sel.ids.delete(id)
        }
        this.deps.onSelectionChange([...sel.ids])
        return
      }
      default:
        this.reject('*Invalid selection*')
        this.deps.onPrint('Expects a point or Window/Last/Crossing/ALL/Fence/WPolygon/CPolygon/Add/Remove/Previous/Undo')
    }
  }

  private requestString(prompt: string, opts?: { default?: string }): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      this.pending = { type: 'string', def: opts?.default ?? null, resolve }
      this.setPrompt(prompt)
    })
  }

  private resolveFromText(text: string): void {
    const pending = this.pending
    if (!pending) return
    const trimmed = text.trim()

    // Texto libre (p. ej. nombre de archivo): Enter vacío usa el valor por defecto.
    if (pending.type === 'string') {
      this.pending = null
      pending.resolve(trimmed === '' ? pending.def : trimmed)
      return
    }

    // Selección: Enter finaliza con los ids acumulados; opciones del CAD clásico (ALL, Last, Window…).
    if (pending.type === 'selection') {
      this.selectionText(pending, trimmed)
      return
    }

    // Enter vacío = finalizar/cancelar el prompt actual, salvo que el comando le haya asignado una
    // opción (`enterKeyword`), como el "Continue" de ARC, o un valor por defecto (`<valor>` recordado,
    // ): entonces lo devuelve. ESC sigue cancelando siempre.
    if (trimmed === '') {
      this.pending = null
      if (pending.type === 'distance' && pending.def !== undefined) pending.resolve({ kind: 'distance', value: pending.def })
      else if (pending.type === 'angle' && pending.def !== undefined) pending.resolve({ kind: 'angle', deg: pending.def })
      else {
        const enterKw = pending.type === 'point' || pending.type === 'distance' || pending.type === 'angle' ? pending.enterKeyword : undefined
        pending.resolve(enterKw ? { kind: 'keyword', keyword: enterKw } : { kind: 'cancel' })
      }
      return
    }

    const kw = this.matchKeyword(trimmed, pending.keywords)
    if (kw) {
      this.pending = null
      pending.resolve({ kind: 'keyword', keyword: kw })
      return
    }

    // Override de snap de un solo uso (cen/end/mid/quad/int/per/tan/nea/nod): no resuelve
    // el prompt, sólo fija el snap que usará la próxima captura del cursor.
    const ov = matchOsnapOverride(trimmed)
    if (ov) {
      this.osnapOverrideKind = ov
      this.deps.onPrint(`<${ov}>`)
      return
    }
    this.osnapOverrideKind = null // cualquier otra entrada explícita limpia el override

    if (pending.type === 'point' && pending.textKeyword?.test(trimmed)) {
      this.pending = null
      pending.resolve({ kind: 'keyword', keyword: trimmed })
      return
    }

    if (pending.type === 'point') {
      // Direct distance entry: número simple + punto base -> distancia en la
      // dirección que marca el cursor (o el eje ortogonal si ORTHO está activo).
      const num = parseNumber(trimmed)
      if (num !== null && pending.base) {
        const dd = this.directDistancePoint(pending.base, num)
        if (dd === null) {
          this.deps.onPrint('Move the cursor to set a direction, then type the distance.')
          return
        }
        this.lastPoint = dd
        this.pending = null
        pending.resolve({ kind: 'point', point: dd })
        return
      }

      const p = parseCoordinate(trimmed, this.relBase(pending.base, trimmed), this.deps.currentUcs(), this.dyn())
      if (!p) {
        // Mensajes del CAD clásico: con opciones, pide punto u opción; sin ellas, sólo punto.
        this.reject(pending.keywords?.length ? 'Point or option keyword required.' : 'Invalid point.')
        return // mantiene el prompt pendiente
      }
      if (this.outsideLimits(p)) return
      this.lastPoint = p
      this.pending = null
      // Un punto tecleado sobre un objeto lo elige (THREAD, DIMRADIUS, UNGROUP… sin clic), como el CAD clásico.
      const id = entityAtPoint(selectableEntities(this.deps.doc), [p.x, p.y, p.z])
      pending.resolve(id ? { kind: 'point', point: p, pick: { id, raw: p, shift: false } } : { kind: 'point', point: p })
      return
    }

    if (pending.type === 'angle') {
      // Ángulo: número en grados, o una coordenada que marca la dirección desde la base.
      const deg = parseNumber(trimmed)
      if (deg !== null) {
        this.pending = null
        pending.resolve({ kind: 'angle', deg })
        return
      }
      const ap = parseCoordinate(trimmed, this.relBase(pending.base, trimmed), this.deps.currentUcs(), this.dyn())
      if (ap) {
        const next = this.directedAngle(pending.base, ap, pending.relativeTo)
        this.pending = null
        pending.resolve({ kind: 'angle', deg: next })
        return
      }
      this.reject(`Invalid angle: ${text}`)
      return
    }

    // distancia: número directo o coordenada (distancia a la base)
    const n = parseNumber(trimmed)
    if (n !== null) {
      this.pending = null
      pending.resolve({ kind: 'distance', value: n })
      return
    }
    const p = parseCoordinate(trimmed, this.relBase(pending.base, trimmed), this.deps.currentUcs(), this.dyn())
    if (p) {
      const base = pending.base
      this.pending = null
      pending.resolve({ kind: 'distance', value: pending.measure ? pending.measure(p) : Math.hypot(p.x - base.x, p.y - base.y, p.z - base.z) })
      return
    }
    this.reject(`Invalid value: ${text}`)
  }
}
