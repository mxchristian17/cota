/**
 * Registro de la sesión para TRACEBACK: cada acción del usuario (comandos, respuestas, clics, selección, grips, vistas,
 * capas, pestañas, archivos) con su hora y sus argumentos, más instantáneas del dibujo de vez en cuando. Vive en la
 * memoria de la pestaña y se pierde al cerrarla. Con el dibujo de una instantánea y los eventos que siguen, un agente
 * puede repetir lo que pasó (cada evento es la acción del store con sus argumentos: `state[a](...args)`).
 */

export interface TraceEvent {
  /** Hora (ms desde 1970). */
  t: number
  /** Acción del store (o `view`/`selection`/`error`, informativos). */
  a: string
  args: unknown[]
}

interface Checkpoint {
  t: number
  /** Índice absoluto del primer evento posterior a la instantánea. */
  seq: number
  doc: unknown
}

const MAX_EVENTS = 50_000
const MAX_CHECKPOINTS = 8
const CHECKPOINT_EVERY_EVENTS = 150
const CHECKPOINT_EVERY_MS = 3 * 60_000
const MAX_ARG_CHARS = 4000

/** Argumentos serializables: vectores como listas, sin funciones ni objetos enormes o circulares. */
export function traceArg(v: unknown, depth = 0): unknown {
  if (v === null || v === undefined || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v
  if (typeof v === 'function') return '[fn]'
  if (depth > 4) return '[…]'
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => traceArg(x, depth + 1))
  if (ArrayBuffer.isView(v)) return '[binary]'
  if (typeof File !== 'undefined' && v instanceof File) return { file: v.name, size: v.size }
  const o = v as Record<string, unknown>
  if (typeof o.x === 'number' && typeof o.y === 'number' && Object.keys(o).length <= 4 && !('w' in o)) {
    return typeof o.z === 'number' ? { x: o.x, y: o.y, z: o.z } : { x: o.x, y: o.y }
  }
  if (Object.getPrototypeOf(o) !== Object.prototype) return `[${(o.constructor as { name?: string })?.name ?? 'object'}]`
  const out: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(o)) out[k] = traceArg(x, depth + 1)
  return out
}

export class TraceLog {
  private events: TraceEvent[] = []
  /** Índice absoluto del primer evento del anillo (los anteriores ya se descartaron). */
  private base = 0
  private checkpoints: Checkpoint[] = []
  private pendingCheckpoint = true
  private depth = 0

  constructor(private readonly snapshot: () => unknown, private readonly now: () => number = Date.now) {}

  get size(): number {
    return this.events.length
  }

  /** ¿Lo que se llame ahora es del usuario? (no dentro de otra acción ni pedido por un comando). */
  get recording(): boolean {
    return this.depth === 0
  }

  /** Ejecuta `fn` sin registrar lo que llame adentro (acciones anidadas o pedidas por un comando). */
  nested<T>(fn: () => T): T {
    this.depth++
    try {
      return fn()
    } finally {
      this.depth--
    }
  }

  /** La próxima acción toma antes una instantánea (al abrir o crear un dibujo). */
  markCheckpoint(): void {
    this.pendingCheckpoint = true
  }

  record(a: string, args: unknown[]): void {
    const t = this.now()
    const seq = this.base + this.events.length
    const last = this.checkpoints[this.checkpoints.length - 1]
    if (this.pendingCheckpoint || !last || seq - last.seq >= CHECKPOINT_EVERY_EVENTS || t - last.t >= CHECKPOINT_EVERY_MS) {
      this.checkpoints.push({ t, seq, doc: this.snapshot() })
      if (this.checkpoints.length > MAX_CHECKPOINTS) this.checkpoints.shift()
      this.pendingCheckpoint = false
    }
    let safe = args.map((x) => traceArg(x))
    if (JSON.stringify(safe).length > MAX_ARG_CHARS) safe = ['[too large]']
    this.events.push({ t, a, args: safe })
    if (this.events.length > MAX_EVENTS) {
      const drop = this.events.length - MAX_EVENTS
      this.events.splice(0, drop)
      this.base += drop
    }
  }

  /**
   * Eventos de los últimos `n` minutos o las últimas `n` líneas, desde la instantánea más cercana anterior a ese
   * comienzo (así se puede repetir exactamente). `fromCheckpoint` = eventos previos al pedido que se agregan.
   */
  window(mode: 'Lines' | 'Minutes', n: number): { doc: unknown; checkpointAt: number; events: TraceEvent[]; fromCheckpoint: number } | null {
    if (!this.events.length && !this.checkpoints.length) return null
    const total = this.base + this.events.length
    const cutoff = this.now() - n * 60_000
    const idx = this.events.findIndex((e) => e.t >= cutoff)
    const start = mode === 'Lines' ? Math.max(this.base, total - Math.max(0, Math.floor(n))) : idx < 0 ? total : this.base + idx
    // La instantánea más nueva que no sea posterior al comienzo; si no hay, la más vieja que quede.
    const cp = [...this.checkpoints].reverse().find((c) => c.seq <= start) ?? this.checkpoints[0]
    if (!cp) return null
    const from = Math.max(cp.seq, this.base)
    return { doc: cp.doc, checkpointAt: cp.t, events: this.events.slice(from - this.base), fromCheckpoint: Math.max(0, start - from) }
  }
}

const hhmmss = (t: number): string => new Date(t).toISOString().slice(11, 23)

/** Texto de TRACEBACK: encabezado, eventos (uno por línea, JSON) y el dibujo de la instantánea. */
export function formatTrace(
  w: { doc: unknown; checkpointAt: number; events: TraceEvent[]; fromCheckpoint: number },
  header: Record<string, string | number>,
): string {
  const lines = [
    '# Cota TRACEBACK',
    ...Object.entries(header).map(([k, v]) => `# ${k}: ${v}`),
    `# drawing snapshot at: ${new Date(w.checkpointAt).toISOString()} (the events below start there)`,
    `# events: ${w.events.length} (${w.fromCheckpoint} before the requested window, to start from the snapshot)`,
    '# replay: open the drawing at the end, then call each store action with its arguments in order',
    '#   (useStore.getState()[a](...args)); `view` restores a camera, `selection` and `error` are informative.',
    '',
    '== EVENTS (UTC time, action, arguments) ==',
    ...w.events.map((e) => `${hhmmss(e.t)} ${e.a} ${JSON.stringify(e.args)}`),
    '',
    '== DRAWING (JSON) ==',
    JSON.stringify(w.doc),
    '',
  ]
  return lines.join('\n')
}

/** Registro de esta pestaña; el store le da la forma de tomar la instantánea del dibujo. */
let snapshotOf: () => unknown = () => null
export const traceLog = new TraceLog(() => snapshotOf())
export function setTraceSnapshot(fn: () => unknown): void {
  snapshotOf = fn
}
