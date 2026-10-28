import type { NamedView } from '../view'
import { cleanNumbersDeep } from '../geom/clean'
import { modelToPaperEntity, parseProxyId } from '../layout/transspatial'
import { setModelAnnoScale } from '../dimension/dimGeometry'
import { annoScaleOf, paperPerModel } from '../layout/scale'
import { refreshBreaks } from '../dimension/breaks'
import type { AttDisp, BlockDef, DimAssocRef, DimensionProps, DocumentData, DrawingVars, Entity, EntityInput, Layer, LayoutDef, LinetypeDefData, PageSetup, UcsDef } from './types'
import { loopsSignature, rebuildHatchLoops, sourceSignature } from '../hatch/assoc'
import { BYBLOCK, BYLAYER, CONTINUOUS, CONTINUOUS_DEF, isSpecialLinetype, libraryLinetype, type LinetypeContext } from '../linetype/linetypes'
import { defaultPageSetup } from '../layout/paper'
import { updateDimension } from '../dimension/assoc'
import {
  builtinDimStyles,
  BUILTIN_DIM_VARS,
  DEFAULT_DIM_STYLE_NAME,
  isLegacyStyle,
  legacyOverrides,
  resolveDimVars,
  type DimStyleDef,
  type DimVars,
  type DimVarName,
} from '../dimension/style'

export const SCHEMA_VERSION = 1

/** Id de la pestaña del espacio modelo (los layouts usan su propio id). */
export const MODEL_TAB = 'MODEL'

/**
 * Fuente de verdad del dibujo. Contiene entidades paramétricas, layers y UCS,
 * serializable a/desde JSON. No conoce Three.js ni React (testeable en Node).
 *
 * Espacios: el modelo y un espacio papel por layout. `entities` devuelve el **espacio de
 * edición**: el papel del layout activo, o el modelo si la pestaña es Model o si se trabaja a través
 * de un viewport (MSPACE). Los ids son únicos en todo el documento.
 */
export class DocumentModel {
  private data: DocumentData
  private seq = 0
  private _rev = 0
  /** Viewport del layout activo por el que se edita el modelo (MSPACE); null = papel. No se persiste. */
  private msVp: string | null = null
  /** Último viewport de MSPACE por layout (MSPACE / botón MODEL vuelven a él). */
  private lastMs = new Map<string, string>()
  /** Viewport maximizado temporalmente (VPMAX); siempre es el de MSPACE. */
  private maxVp: string | null = null
  /** Firmas de los sombreados asociativos (contorno y lazos) desde la última actualización. */
  private hatchSigs = new Map<string, { src: string; self: string }>()
  private ltMemo = new Map<string, LinetypeContext>()

  constructor(data: DocumentData) {
    this.data = data
    this.normalize()
    this.reseed()
    setModelAnnoScale(this.annoScale)
  }

  /** Contador de mutaciones; el viewport lo consulta para re-sincronizar. */
  get revision(): number {
    return this._rev
  }

  /** Marca el documento como modificado (invocado por servicios que mutan capas, etc.). */
  touch(): void {
    this._rev++
  }

  /** `.cota` previos a no traen layouts: se agrega `Layout1` (A3 apaisado). */
  private normalize(): void {
    if (!this.data.layouts || this.data.layouts.length === 0) {
      this.data.layouts = [{ id: 'L1', name: 'Layout1', pageSetup: defaultPageSetup(), entities: [] }]
    }
    if (this.data.activeLayout && !this.getLayout(this.data.activeLayout)) delete this.data.activeLayout
    this.normalizeDimStyles()
    this.normalizeLinetypes()
  }

  // --- Tipos de línea -----------------------------------------------------------------------

  /**
   * Tabla de tipos de línea: `CONTINUOUS` siempre; los nombres que usan capas y objetos se cargan de la
   * biblioteca (`DOTTED`, de antes de , pasa a `DOT`); uno desconocido queda continuo.
   */
  private normalizeLinetypes(): void {
    if (!this.data.linetypes) this.data.linetypes = []
    const table = this.data.linetypes
    if (!table.some((d) => d.name === CONTINUOUS)) table.unshift({ ...CONTINUOUS_DEF, pattern: [] })
    const fix = (name: string | undefined): string | undefined => {
      if (name === undefined) return undefined
      const up = name.toUpperCase() === 'DOTTED' ? 'DOT' : name.toUpperCase()
      // Uno desconocido (sin definición en la biblioteca) queda cargado como continuo.
      if (!isSpecialLinetype(up) && !this.loadLinetype(up)) table.push({ name: up, description: '', pattern: [] })
      return up
    }
    for (const l of this.data.layers) l.lineType = fix(l.lineType) ?? CONTINUOUS
    for (const list of [this.data.entities, ...(this.data.layouts ?? []).map((l) => l.entities), ...(this.data.blocks ?? []).map((b) => b.entities)]) {
      for (const e of list) if (e.lineType !== undefined) e.lineType = fix(e.lineType)
    }
    const cel = this.data.vars?.CELTYPE
    if (cel && !isSpecialLinetype(cel) && !this.loadLinetype(cel)) table.push({ name: cel.toUpperCase(), description: '', pattern: [] })
  }

  /** Tipos de línea cargados en el dibujo. */
  get linetypes(): LinetypeDefData[] {
    return this.data.linetypes ?? []
  }

  linetype(name: string): LinetypeDefData | undefined {
    const up = name.toUpperCase()
    return this.linetypes.find((d) => d.name === up)
  }

  /**
   * Carga un tipo de línea (de `def` o de la biblioteca según las unidades). Devuelve la definición, o
   * undefined si no existe. Uno ya cargado se conserva (como `Load` sin recargar).
   */
  loadLinetype(name: string, def?: LinetypeDefData, reload = false): LinetypeDefData | undefined {
    const up = name.trim().toUpperCase()
    if (!up || isSpecialLinetype(up)) return undefined
    const table = (this.data.linetypes ??= [])
    const i = table.findIndex((d) => d.name === up)
    if (i >= 0 && !reload) return table[i]
    const d = def ? { name: up, description: def.description, pattern: [...def.pattern] } : libraryLinetype(up, this.data.units)
    if (!d) return i >= 0 ? table[i] : undefined
    if (i >= 0) table[i] = d
    else table.push(d)
    this._rev++
    return d
  }

  /** ¿Lo usa alguna capa u objeto (o es el actual)? Los usados no se pueden borrar (como PURGE). */
  linetypeInUse(name: string): boolean {
    const up = name.toUpperCase()
    if (up === CONTINUOUS || this.vars.CELTYPE?.toUpperCase() === up) return true
    if (this.data.layers.some((l) => l.lineType.toUpperCase() === up)) return true
    const lists = [this.data.entities, ...(this.data.layouts ?? []).map((l) => l.entities), ...(this.data.blocks ?? []).map((b) => b.entities)]
    return lists.some((list) => list.some((e) => e.lineType?.toUpperCase() === up))
  }

  /** Borra un tipo de línea que no se usa. */
  deleteLinetype(name: string): boolean {
    const up = name.toUpperCase()
    if (this.linetypeInUse(up)) return false
    const table = this.data.linetypes ?? []
    const i = table.findIndex((d) => d.name === up)
    if (i < 0) return false
    table.splice(i, 1)
    this._rev++
    return true
  }

  /** Variables del dibujo con sus valores iniciales del CAD clásico. */
  get vars(): Required<Omit<DrawingVars, 'HPORIGIN'>> & Pick<DrawingVars, 'HPORIGIN'> {
    const v = this.data.vars ?? {}
    const inch = /^(in|inch|inches|ft|feet)$/i.test(this.data.units)
    return {
      LIMMIN: v.LIMMIN ?? [0, 0],
      LIMMAX: v.LIMMAX ?? (inch ? [12, 9] : [420, 297]),
      LIMCHECK: v.LIMCHECK ?? 0,
      VIEWPROJECTION: v.VIEWPROJECTION ?? 'first',
      LTSCALE: v.LTSCALE ?? 1,
      CELTYPE: v.CELTYPE ?? BYLAYER,
      CELTSCALE: v.CELTSCALE ?? 1,
      PSLTSCALE: v.PSLTSCALE ?? 1,
      MSLTSCALE: v.MSLTSCALE ?? 1,
      PLINEGEN: v.PLINEGEN ?? 0,
      HPNAME: v.HPNAME ?? 'ANSI31',
      HPSCALE: v.HPSCALE ?? 1,
      HPANG: v.HPANG ?? 0,
      HPASSOC: v.HPASSOC ?? 1,
      HPISLANDDETECTION: v.HPISLANDDETECTION ?? 1,
      HPSPACE: v.HPSPACE ?? 1,
      HPDOUBLE: v.HPDOUBLE ?? 0,
      HPORIGIN: v.HPORIGIN,
    }
  }

  // --- Vistas guardadas -------------------------------------------------------------------------

  namedViews(): NamedView[] {
    return this.data.views ?? []
  }

  getNamedView(name: string): NamedView | undefined {
    const up = name.trim().toUpperCase()
    return this.namedViews().find((v) => v.name.toUpperCase() === up)
  }

  /** Guarda (o reemplaza) una vista con ese nombre. */
  saveNamedView(v: NamedView): void {
    const list = (this.data.views ??= [])
    const i = list.findIndex((x) => x.name.toUpperCase() === v.name.toUpperCase())
    if (i >= 0) list[i] = structuredClone(v)
    else list.push(structuredClone(v))
    this._rev++
  }

  deleteNamedView(name: string): boolean {
    const list = this.data.views ?? []
    const i = list.findIndex((x) => x.name.toUpperCase() === name.trim().toUpperCase())
    if (i < 0) return false
    list.splice(i, 1)
    this._rev++
    return true
  }

  /** Cambia una variable del dibujo (sin validar: lo hace el comando). */
  setVar<K extends keyof DrawingVars>(name: K, value: DrawingVars[K]): void {
    const v = (this.data.vars ??= {})
    if (value === undefined) delete v[name]
    else v[name] = value
    if (name === 'CELTYPE' && typeof value === 'string' && !isSpecialLinetype(value)) this.loadLinetype(value)
    this._rev++
  }

  /**
   * Contexto para generar los trazos de los tipos de línea. `space`: el modelo (LTSCALE × MSLTSCALE), el
   * papel (LTSCALE) o un viewport del layout a `paperPerModel` mm por unidad (PSLTSCALE).
   */
  linetypeContext(space: 'model' | 'paper' | { paperPerModel: number }): LinetypeContext {
    // Memo por revisión y espacio: el viewport lo pide en cada cuadro.
    const key = `${this._rev}|${typeof space === 'string' ? space : space.paperPerModel}`
    const hit = this.ltMemo.get(key)
    if (hit) return hit
    if (this.ltMemo.size > 16) this.ltMemo.clear()
    const ctx = this.computeLinetypeContext(space)
    this.ltMemo.set(key, ctx)
    return ctx
  }

  private computeLinetypeContext(space: 'model' | 'paper' | { paperPerModel: number }): LinetypeContext {
    const v = this.vars
    let factor = v.LTSCALE
    if (space === 'model') factor *= v.MSLTSCALE ? 1 / (this.cannoscale || 1) : 1
    else if (space !== 'paper' && v.PSLTSCALE) factor /= space.paperPerModel || 1
    return { patterns: new Map(this.linetypes.map((d) => [d.name, d.pattern])), factor, plinegen: v.PLINEGEN === 1, psltscale: v.PSLTSCALE === 1 }
  }

  /**
   * Estilos de cota: un `.cota` previo recibe los incluidos y sus cotas pasan a `Standard` con
   * overrides que reproducen su aspecto; si tenía cotas, `Standard` queda como estilo actual.
   */
  private normalizeDimStyles(): void {
    const legacyDoc = !this.data.dimStyles
    if (legacyDoc) this.data.dimStyles = builtinDimStyles()
    const styles = this.data.dimStyles as DimStyleDef[]
    let hadDims = false
    for (const d of this.allDimensionProps()) {
      hadDims = true
      if (isLegacyStyle(d.style)) {
        d.styleName = 'Standard'
        d.overrides = legacyOverrides(d.style)
      }
      if (!d.styleName) d.styleName = 'Standard'
      if (!styles.some((s) => s.name === d.styleName)) {
        styles.push({ name: d.styleName, vars: { ...(BUILTIN_DIM_VARS[d.styleName] ?? BUILTIN_DIM_VARS.Standard) } })
      }
      d.style = resolveDimVars(styles.find((s) => s.name === d.styleName)?.vars, d.overrides)
    }
    if (!this.data.dimStyle || !styles.some((s) => s.name === this.data.dimStyle)) {
      this.data.dimStyle = legacyDoc && hadDims ? 'Standard' : styles.some((s) => s.name === DEFAULT_DIM_STYLE_NAME) ? DEFAULT_DIM_STYLE_NAME : styles[0]?.name
    }
  }

  /** Props de todas las cotas del dibujo: modelo, papeles y bloques. */
  allDimensionProps(): DimensionProps[] {
    const out: DimensionProps[] = []
    const lists = [this.data.entities, ...(this.data.layouts ?? []).map((l) => l.entities), ...(this.data.blocks ?? []).map((b) => b.entities)]
    for (const list of lists) for (const e of list) if (e.type === 'DIMENSION') out.push(e.props)
    return out
  }

  // ── Estilos de cota ───────────────────────────────────────────────

  get dimStyles(): DimStyleDef[] {
    return this.data.dimStyles ?? []
  }

  dimStyleDef(name: string): DimStyleDef | undefined {
    return this.dimStyles.find((s) => s.name.toLowerCase() === name.toLowerCase())
  }

  /** Estilo actual (`DIMSTYLE`). */
  get currentDimStyle(): string {
    return this.data.dimStyle ?? DEFAULT_DIM_STYLE_NAME
  }

  setCurrentDimStyle(name: string): boolean {
    const def = this.dimStyleDef(name)
    if (!def) return false
    this.data.dimStyle = def.name
    delete this.data.dimOverrides // como el CAD clásico: cambiar de estilo descarta los overrides pendientes
    this._rev++
    return true
  }

  /** Overrides del estilo actual para las cotas nuevas (`DIMTXT 3.5` en la línea de comandos). */
  get dimOverrides(): Partial<DimVars> {
    return this.data.dimOverrides ?? {}
  }

  setDimOverride<K extends keyof DimVars>(name: K, value: DimVars[K]): void {
    const base = this.dimStyleDef(this.currentDimStyle)?.vars
    const next = { ...this.dimOverrides, [name]: value }
    if (base && base[name] === value) delete next[name]
    if (Object.keys(next).length > 0) this.data.dimOverrides = next
    else delete this.data.dimOverrides
    this._rev++
  }

  clearDimOverrides(): void {
    delete this.data.dimOverrides
    this._rev++
  }

  /** Reemplaza los overrides del estilo actual (`DIMSTYLE ▸ Override`); se guardan sólo las diferencias. */
  replaceDimOverrides(vars: DimVars): void {
    const base = this.dimStyleDef(this.currentDimStyle)?.vars
    const diff: Partial<DimVars> = {}
    if (base) for (const k of Object.keys(vars) as Array<keyof DimVars>) if (vars[k] !== base[k]) (diff as Record<string, unknown>)[k] = vars[k]
    if (Object.keys(diff).length > 0) this.data.dimOverrides = diff
    else delete this.data.dimOverrides
    this._rev++
  }

  /** Variables vigentes para una cota nueva: estilo actual + overrides pendientes. */
  get currentDimVars(): DimVars {
    return resolveDimVars(this.dimStyleDef(this.currentDimStyle)?.vars, this.data.dimOverrides)
  }

  /** Estilo, overrides y variables resueltas para una cota nueva. */
  newDimStyleProps(): Pick<DimensionProps, 'styleName' | 'overrides' | 'style'> {
    const overrides = this.data.dimOverrides ? { ...this.data.dimOverrides } : undefined
    return { styleName: this.currentDimStyle, ...(overrides ? { overrides } : {}), style: this.currentDimVars }
  }

  /** Crea o reemplaza un estilo y vuelve a resolver las cotas que lo usan. */
  saveDimStyle(def: DimStyleDef): void {
    const styles = (this.data.dimStyles ??= [])
    const i = styles.findIndex((s) => s.name.toLowerCase() === def.name.toLowerCase())
    if (i >= 0) styles[i] = { name: styles[i].name, vars: { ...def.vars } }
    else styles.push({ name: def.name, vars: { ...def.vars } })
    this.restyleDimensions()
  }

  /** Renombra un estilo (y sus cotas). Error si el nombre nuevo ya existe. */
  renameDimStyle(from: string, to: string): void {
    const def = this.dimStyleDef(from)
    const name = to.trim()
    if (!def) throw new Error(`Dimension style "${from}" not found.`)
    if (!name) throw new Error('Invalid style name.')
    if (this.dimStyleDef(name) && name.toLowerCase() !== from.toLowerCase()) throw new Error(`Dimension style "${name}" already exists.`)
    for (const d of this.allDimensionProps()) if (d.styleName === def.name) d.styleName = name
    if (this.data.dimStyle === def.name) this.data.dimStyle = name
    def.name = name
    this._rev++
  }

  /** Borra un estilo que no esté en uso ni sea el actual. */
  deleteDimStyle(name: string): void {
    const def = this.dimStyleDef(name)
    if (!def) throw new Error(`Dimension style "${name}" not found.`)
    if (def.name === this.currentDimStyle) throw new Error('The current dimension style cannot be deleted.')
    if (this.allDimensionProps().some((d) => d.styleName === def.name)) throw new Error(`Dimension style "${def.name}" is in use.`)
    this.data.dimStyles = this.dimStyles.filter((s) => s !== def)
    this._rev++
  }

  /** Vuelve a resolver `style` de todas las cotas (tras cambiar un estilo). */
  restyleDimensions(): void {
    for (const d of this.allDimensionProps()) d.style = resolveDimVars(this.dimStyleDef(d.styleName ?? 'Standard')?.vars, d.overrides)
    this._rev++
  }

  /** Cambia el estilo o los overrides de una cota y la vuelve a resolver. */
  restyleDimension(d: DimensionProps, styleName: string | undefined, overrides: Partial<DimVars> | undefined): void {
    if (styleName) d.styleName = styleName
    if (overrides && Object.keys(overrides).length > 0) d.overrides = overrides
    else delete d.overrides
    d.style = resolveDimVars(this.dimStyleDef(d.styleName ?? 'Standard')?.vars, d.overrides)
    this._rev++
  }

  /** Override de una variable en una cota; si coincide con su estilo, vuelve a "ByStyle". */
  setDimensionVar(d: DimensionProps, name: DimVarName, value: unknown): void {
    const base = this.dimStyleDef(d.styleName ?? 'Standard')?.vars as unknown as Record<string, unknown> | undefined
    const next: Record<string, unknown> = { ...(d.overrides ?? {}) }
    if (base && base[name] === value) delete next[name]
    else next[name] = value
    this.restyleDimension(d, undefined, next as Partial<DimVars>)
  }

  /** Estado de las capas guardado por `LAYISO` (null si no hay aislamiento activo). */
  get layIso(): DocumentData['layIso'] | null {
    return this.data.layIso ?? null
  }
  setLayIso(v: DocumentData['layIso'] | null): void {
    if (v) this.data.layIso = v
    else delete this.data.layIso
  }

  // --- UCS -----------------------------------------------------------------------------

  /** Vistas guardadas con el dibujo (se anotan al guardar; no cuentan como un cambio). */
  get savedViews(): DocumentData['viewState'] | null {
    return this.data.viewState ?? null
  }
  setSavedViews(v: DocumentData['viewState'] | null): void {
    if (v) this.data.viewState = structuredClone(v)
    else delete this.data.viewState
  }

  /** UCS actual del modelo guardada en el dibujo (null = World). */
  get modelUcs(): DocumentData['modelUcs'] | null {
    return this.data.modelUcs ?? null
  }
  setModelUcs(v: DocumentData['modelUcs'] | null): void {
    if (v) this.data.modelUcs = structuredClone(v)
    else delete this.data.modelUcs
  }

  /** UCS con nombre (`UCS NAmed`): la tabla del dibujo sin la entrada `World`. */
  namedUcs(): UcsDef[] {
    return this.data.ucs.filter((u) => u.id !== 'world')
  }
  getNamedUcs(name: string): UcsDef | undefined {
    const n = name.trim().toLowerCase()
    return this.namedUcs().find((u) => u.name.toLowerCase() === n)
  }
  /** Guarda (o reemplaza) una UCS con nombre. */
  saveNamedUcs(name: string, def: Omit<UcsDef, 'id' | 'name'>): UcsDef {
    const prev = this.getNamedUcs(name)
    const entry: UcsDef = { id: prev?.id ?? `ucs-${name.trim().toLowerCase()}`, name: name.trim(), ...structuredClone(def) }
    this.data.ucs = prev ? this.data.ucs.map((u) => (u === prev ? entry : u)) : [...this.data.ucs, entry]
    this._rev++
    return entry
  }
  deleteNamedUcs(name: string): boolean {
    const prev = this.getNamedUcs(name)
    if (!prev) return false
    this.data.ucs = this.data.ucs.filter((u) => u !== prev)
    this._rev++
    return true
  }

  /** DIMASSOC: 2 = las cotas nuevas se asocian a la geometría (por defecto), 1 = no. */
  get dimAssoc(): 1 | 2 {
    return this.data.dimAssoc ?? 2
  }
  setDimAssoc(v: 1 | 2): void {
    if (v === 2) delete this.data.dimAssoc
    else this.data.dimAssoc = v
    this._rev++
  }

  /**
   * Recalcula las cotas asociativas a partir de la geometría actual. Se llama después de cada
   * cambio (comandos, grips, paleta); devuelve true si alguna cota cambió.
   */
  updateAssociativeDims(): boolean {
    let changed = false
    const dims = this.allDimensionProps().filter((d) => d.assoc || d.breakWith)
    if (!dims.length) return false
    // Índice por id armado una vez (getEntity es lineal: con miles de cotas sería cuadrático).
    const byId = new Map<string, Entity>()
    for (const list of [this.entities, ...this.allLists()]) for (const e of list) if (!byId.has(e.id)) byId.set(e.id, e)
    const get = (id: string) => byId.get(id)
    const resolve = (r: DimAssocRef) => (r.vp ? this.paperProxy(r.vp, r.id, get) : get(r.id))
    for (const d of dims) {
      if (d.assoc && updateDimension(d, resolve)) changed = true
      if (d.breakWith && refreshBreaks(d, get)) changed = true
      // Trans-espacial: la medida es la del modelo, a la escala actual del viewport.
      const vpId = d.assoc?.find((r) => r?.vp)?.vp
      const vp = vpId ? get(vpId) : undefined
      if (vp?.type === 'VIEWPORT') {
        const ts = 1 / paperPerModel(vp.props.scale, this.units)
        if (d.transScale !== ts) {
          d.transScale = ts
          changed = true
        }
      }
    }
    if (changed) this._rev++
    return changed
  }

  /**
   * Sombreados asociativos: si cambió algún objeto de su contorno, se recalculan; si no se puede
   * (o si se movió el sombreado solo), dejan de ser asociativos. Devuelve true si alguno cambió.
   */
  updateAssociativeHatches(): boolean {
    let changed = false
    const byId = new Map<string, Entity>()
    for (const list of [this.entities, ...this.allLists()]) for (const e of list) if (!byId.has(e.id)) byId.set(e.id, e)
    const get = (id: string) => byId.get(id)
    const alive = new Set<string>()
    for (const list of [this.entities, ...this.allLists()]) {
      for (const e of list) {
        if (e.type !== 'HATCH' || !e.props.assoc) continue
        alive.add(e.id)
        const src = sourceSignature(e, get)
        const self = loopsSignature(e)
        const prev = this.hatchSigs.get(e.id)
        if (prev && prev.src === src) {
          if (prev.self !== self) {
            delete e.props.assoc // se movió el sombreado sin su contorno
            changed = true
          }
        } else if (prev) {
          const sources = e.props.assoc.ids.map(get)
          const loops = sources.every((x): x is Entity => !!x) ? rebuildHatchLoops(e.props, sources) : null
          if (loops) e.props.loops = loops
          else delete e.props.assoc
          changed = true
        }
        if (e.props.assoc) this.hatchSigs.set(e.id, { src, self: loopsSignature(e) })
      }
    }
    for (const id of [...this.hatchSigs.keys()]) if (!alive.has(id)) this.hatchSigs.delete(id)
    if (changed) this._rev++
    return changed
  }

  /** Olvida la firma de un sombreado (sus lazos cambiaron a propósito: HATCH, HATCHEDIT). */
  forgetHatch(id: string): void {
    this.hatchSigs.delete(id)
  }

  /**
   * La entidad que se tocó (por clic o snap): una del documento o, con un id `viewport>entidad`, la
   * entidad del modelo vista desde el papel por ese viewport (trans-espacial).
   */
  pickTarget(id: string): Entity | undefined {
    const px = parseProxyId(id)
    return px ? this.paperProxy(px.vp, px.id) : this.getEntity(id)
  }

  /** La entidad `id` del modelo vista por el viewport `vpId`, en coordenadas del papel. */
  paperProxy(vpId: string, id: string, get: (id: string) => Entity | undefined = (x) => this.getEntity(x)): Entity | undefined {
    const vp = get(vpId)
    const e = get(id)
    if (vp?.type !== 'VIEWPORT' || !e) return undefined
    return modelToPaperEntity(e, vpId, vp.props, this.units) ?? undefined
  }

  /** Escala de anotación del modelo (`CANNOSCALE`), relación papel:modelo como la de los viewports. */
  get cannoscale(): number {
    return this.data.cannoscale ?? 1
  }

  setCannoscale(v: number): void {
    if (!(v > 0)) return
    this.data.cannoscale = v
    setModelAnnoScale(this.annoScale)
    this._rev++
  }

  /** Unidades de modelo por mm de papel a la escala de anotación (tamaño de las cotas anotativas). */
  get annoScale(): number {
    return annoScaleOf(this.cannoscale, this.units)
  }

  /** Recalcula el contador de ids a partir de las entidades existentes (modelo y papeles). */
  private reseed(): void {
    let max = 0
    for (const list of this.allLists()) {
      for (const e of list) {
        const m = /^e(\d+)$/.exec(e.id)
        if (m) max = Math.max(max, Number(m[1]))
      }
    }
    this.seq = max
  }

  private allLists(): Entity[][] {
    return [this.data.entities, ...this.layouts.map((l) => l.entities)]
  }

  static createDefault(name = 'drawing1'): DocumentModel {
    const layer0: Layer = {
      id: '0',
      name: '0',
      color: '#ffffff',
      lineWeight: 0.25,
      lineType: 'CONTINUOUS',
      locked: false,
      visible: true,
      printable: true,
    }
    return new DocumentModel({
      schemaVersion: SCHEMA_VERSION,
      id: 'doc',
      name,
      units: 'mm',
      layers: [layer0],
      ucs: [{ id: 'world', name: 'World', origin: [0, 0, 0], xAxis: [1, 0, 0], yAxis: [0, 1, 0] }],
      entities: [],
      meta: { created: new Date().toISOString() },
    })
  }

  get name(): string {
    return this.data.name
  }

  get units(): string {
    return this.data.units
  }

  /** Unidades del dibujo (UNITS): no escala lo dibujado, como el CAD clásico. */
  setUnits(units: string): void {
    if (this.data.units === units) return
    this.data.units = units
    this._rev++
  }

  get meta(): DocumentData['meta'] {
    return this.data.meta
  }

  setMeta(patch: Partial<DocumentData['meta']>): void {
    this.data.meta = { ...this.data.meta, ...patch }
    this._rev++
  }

  get layers(): Layer[] {
    return this.data.layers
  }

  /** Entidades del espacio de edición (papel del layout activo, o modelo). */
  get entities(): Entity[] {
    const l = this.activeLayout
    return l && !this.msVp ? l.entities : this.data.entities
  }

  /** Entidades del espacio modelo, sin importar la pestaña activa. */
  get modelEntities(): Entity[] {
    return this.data.entities
  }

  /** Entidades del papel de un layout (vacío si no existe). */
  layoutEntities(id: string): Entity[] {
    return this.getLayout(id)?.entities ?? []
  }

  // ── Layouts y espacio activo ────────────────────────────────────────────────

  get layouts(): LayoutDef[] {
    return this.data.layouts ?? []
  }

  getLayout(id: string): LayoutDef | undefined {
    return this.data.layouts?.find((l) => l.id === id)
  }

  findLayoutByName(name: string): LayoutDef | undefined {
    const n = name.trim().toLowerCase()
    return this.layouts.find((l) => l.name.toLowerCase() === n)
  }

  /** Pestaña activa: `MODEL_TAB` o el id del layout. */
  get activeTab(): string {
    return this.data.activeLayout ?? MODEL_TAB
  }

  /** Layout activo, o undefined en Model. */
  get activeLayout(): LayoutDef | undefined {
    return this.data.activeLayout ? this.getLayout(this.data.activeLayout) : undefined
  }

  /** Viewport por el que se edita el modelo dentro del layout (MSPACE), o null. */
  get msViewportId(): string | null {
    return this.msVp
  }

  /** Último viewport por el que se entró al modelo en el layout activo (puede ya no existir). */
  get lastMsViewportId(): string | null {
    const l = this.activeLayout
    return (l && this.lastMs.get(l.id)) ?? null
  }

  /** Viewport maximizado con VPMAX, o null. */
  get maximizedViewportId(): string | null {
    return this.maxVp
  }

  /** ¿Los comandos operan sobre el papel? (layout activo y sin viewport en MSPACE). */
  get inPaperSpace(): boolean {
    return !!this.activeLayout && !this.msVp
  }

  /** Cambia de pestaña (`MODEL_TAB` o id de layout). Vuelve a PSPACE. */
  setActiveTab(id: string): void {
    const next = id === MODEL_TAB || !this.getLayout(id) ? undefined : id
    if (next === this.data.activeLayout && !this.msVp) return
    if (next) this.data.activeLayout = next
    else delete this.data.activeLayout
    this.msVp = null
    this.maxVp = null
    this._rev++
  }

  /** Entra al modelo por un viewport del layout activo (MSPACE) o vuelve al papel (null). */
  setMsViewport(id: string | null): void {
    const l = this.activeLayout
    const ok = id && l?.entities.some((e) => e.id === id && e.type === 'VIEWPORT')
    const next = ok ? id : null
    if (next === this.msVp) return
    this.msVp = next
    if (l && next) this.lastMs.set(l.id, next)
    if (next !== this.maxVp) this.maxVp = null // VPMAX termina al cambiar de viewport o volver al papel
    this._rev++
  }

  /** Maximiza un viewport (entrando a MSPACE por él) o restaura (null), como VPMAX/VPMIN. */
  setMaximizedViewport(id: string | null): void {
    if (id) this.setMsViewport(id)
    const next = id && this.msVp === id ? id : null
    if (next === this.maxVp) return
    this.maxVp = next
    this._rev++
  }

  /** Nombre libre `LayoutN` para un layout nuevo. */
  nextLayoutName(): string {
    for (let n = this.layouts.length + 1; ; n++) {
      const name = `Layout${n}`
      if (!this.findLayoutByName(name)) return name
    }
  }

  private nextLayoutId(): string {
    let max = 0
    for (const l of this.layouts) {
      const m = /^L(\d+)$/.exec(l.id)
      if (m) max = Math.max(max, Number(m[1]))
    }
    return `L${max + 1}`
  }

  private checkLayoutName(name: string, except?: string): string {
    const n = name.trim()
    if (!n) throw new Error('Layout name cannot be empty.')
    if (n.toLowerCase() === 'model') throw new Error('"Model" is a reserved name.')
    if (/[<>/\\":;?*|,=`]/.test(n)) throw new Error('The layout name has invalid characters.')
    const dup = this.findLayoutByName(n)
    if (dup && dup.id !== except) throw new Error(`Layout "${n}" already exists.`)
    return n
  }

  /** Crea un layout al final (o desde una definición de plantilla, con ids nuevos). */
  addLayout(name?: string, pageSetup?: PageSetup, entities: Entity[] = []): LayoutDef {
    const layout: LayoutDef = {
      id: this.nextLayoutId(),
      name: this.checkLayoutName(name ?? this.nextLayoutName()),
      pageSetup: structuredClone(pageSetup ?? defaultPageSetup()),
      entities: entities.map((e) => ({ ...structuredClone(e), id: this.nextEntityId() })),
      ...(entities.length > 0 ? { initialized: true } : {}),
    }
    this.data.layouts = [...this.layouts, layout]
    this._rev++
    return layout
  }

  /** Duplica un layout (hoja, configuración y entidades) a continuación del original. */
  copyLayout(id: string, name?: string): LayoutDef {
    const src = this.getLayout(id)
    if (!src) throw new Error('Layout not found.')
    let n = name
    for (let i = 2; !n; i++) if (!this.findLayoutByName(`${src.name} (${i})`)) n = `${src.name} (${i})`
    const copy = this.addLayout(n, src.pageSetup, src.entities)
    const list = this.layouts.filter((l) => l.id !== copy.id)
    list.splice(list.indexOf(src) + 1, 0, copy)
    this.data.layouts = list
    return copy
  }

  renameLayout(id: string, name: string): void {
    const l = this.getLayout(id)
    if (!l) throw new Error('Layout not found.')
    l.name = this.checkLayoutName(name, id)
    this._rev++
  }

  /** Borra un layout (debe quedar al menos uno, como el CAD clásico). Si era el activo, pasa a Model. */
  removeLayout(id: string): void {
    if (!this.getLayout(id)) throw new Error('Layout not found.')
    if (this.layouts.length <= 1) throw new Error('A drawing must keep at least one layout.')
    this.data.layouts = this.layouts.filter((l) => l.id !== id)
    if (this.data.activeLayout === id) {
      delete this.data.activeLayout
      this.msVp = null
    }
    this._rev++
  }

  /** Mueve un layout `delta` posiciones en el orden de pestañas (acotado a los extremos). */
  moveLayout(id: string, delta: number): void {
    const list = [...this.layouts]
    const i = list.findIndex((l) => l.id === id)
    if (i < 0) return
    const j = Math.max(0, Math.min(list.length - 1, i + delta))
    if (i === j) return
    const [l] = list.splice(i, 1)
    list.splice(j, 0, l)
    this.data.layouts = list
    this._rev++
  }

  setPageSetup(id: string, ps: PageSetup): void {
    const l = this.getLayout(id)
    if (!l) return
    l.pageSetup = structuredClone(ps)
    this._rev++
  }

  /** Marca que el layout ya tiene su viewport inicial (o que el usuario no lo quiere). */
  markLayoutInitialized(id: string): void {
    const l = this.getLayout(id)
    if (l) l.initialized = true
  }

  // ── Entidades ──────────────────────────────────────────────────────────────

  /** Cantidad de viewports del layout (1–4); persistido en el documento. */
  get viewportLayout(): number {
    return this.data.viewportLayout ?? 1
  }
  setViewportLayout(n: number): void {
    this.data.viewportLayout = n
    this._rev++
  }

  /** ATTDISP: visibilidad de los atributos de bloque. */
  get attdisp(): AttDisp {
    return this.data.attdisp ?? 'normal'
  }
  setAttdisp(mode: AttDisp): void {
    if (mode === 'normal') delete this.data.attdisp
    else this.data.attdisp = mode
    this._rev++
  }

  /**
   * Capa actual guardada con el dibujo (CLAYER): el id si la capa sigue existiendo, o la
   * primera capa. La capa actual de trabajo vive en el store; se vuelca aquí al guardar.
   */
  get currentLayer(): string {
    const id = this.data.currentLayer
    return id && this.data.layers.some((l) => l.id === id) ? id : this.firstLayerId
  }
  setCurrentLayer(id: string): void {
    this.data.currentLayer = id // sin revisión: cambiar de capa no modifica el dibujo
  }

  /** TEXTSIZE: alto por defecto de TEXT/MTEXT/ATTDEF/FIELD, guardado con el dibujo. */
  get textSize(): number {
    const v = this.data.textSize
    return v !== undefined && v > 0 ? v : 2.5
  }
  setTextSize(v: number): void {
    if (v > 0) this.data.textSize = v
  }

  nextEntityId(): string {
    return 'e' + ++this.seq
  }

  /**
   * Agrega una entidad al espacio de edición. Sin `lineType`/`ltScale` es un objeto nuevo y toma
   * `CELTYPE`/`CELTSCALE`; `BYLAYER` y 1 explícitos (copias, importación) no se guardan.
   */
  addEntity(input: EntityInput): Entity {
    const entity = { id: this.nextEntityId(), ...input } as Entity
    const v = this.data.vars
    if (input.lineType === undefined && v?.CELTYPE && v.CELTYPE.toUpperCase() !== BYLAYER) entity.lineType = v.CELTYPE.toUpperCase() === BYBLOCK ? BYBLOCK : v.CELTYPE.toUpperCase()
    else if (entity.lineType !== undefined && entity.lineType.toUpperCase() === BYLAYER) delete entity.lineType
    if (input.ltScale === undefined && v?.CELTSCALE !== undefined && v.CELTSCALE !== 1) entity.ltScale = v.CELTSCALE
    else if (entity.ltScale === 1) delete entity.ltScale
    if (entity.lineType === undefined) delete entity.lineType
    if (entity.ltScale === undefined) delete entity.ltScale
    this.entities.push(entity)
    this._rev++
    return entity
  }

  /** Quita el ruido de punto flotante de todas las entidades (modelo, layouts y bloques); ver `cleanNumber`. */
  cleanNumbers(): number {
    const lists: Entity[][] = [this.data.entities, ...(this.data.layouts ?? []).map((l) => l.entities), ...(this.data.blocks ?? []).map((b) => b.entities)]
    let n = 0
    for (const list of lists) for (const e of list) n += cleanNumbersDeep(e.props)
    if (n) this._rev++
    return n
  }

  /** Vuelve a insertar una entidad conservando su id (deshacer dentro de un comando). */
  restoreEntity(entity: Entity): void {
    if (this.getEntity(entity.id)) return
    this.entities.push(structuredClone(entity))
    this._rev++
  }

  /** Lista y posición de una entidad en cualquier espacio (el de edición primero). */
  private locate(id: string): { list: Entity[]; i: number } | null {
    const lists = [this.entities, ...this.allLists().filter((l) => l !== this.entities)]
    for (const list of lists) {
      const i = list.findIndex((e) => e.id === id)
      if (i >= 0) return { list, i }
    }
    return null
  }

  getEntity(id: string): Entity | undefined {
    const at = this.locate(id)
    return at ? at.list[at.i] : undefined
  }

  /** Tabla de definiciones de bloque (vacía si no hay). */
  get blocks(): BlockDef[] {
    return this.data.blocks ?? []
  }

  getBlock(name: string): BlockDef | undefined {
    return this.data.blocks?.find((b) => b.name === name)
  }

  /** Crea o REDEFINE un bloque; redefinir actualiza todas las inserciones (referencia real). */
  /** Quita una definición de bloque (las vistas de dibujo descartadas). */
  removeBlock(name: string): void {
    if (!this.data.blocks) return
    const i = this.data.blocks.findIndex((b) => b.name === name)
    if (i < 0) return
    this.data.blocks.splice(i, 1)
    this._rev++
  }

  setBlock(def: BlockDef): void {
    if (!this.data.blocks) this.data.blocks = []
    const i = this.data.blocks.findIndex((b) => b.name === def.name)
    if (i >= 0) this.data.blocks[i] = def
    else this.data.blocks.push(def)
    this._rev++
  }

  removeEntity(id: string): void {
    const at = this.locate(id)
    if (!at) return
    at.list.splice(at.i, 1)
    if (id === this.msVp) this.msVp = this.maxVp = null
    this._rev++
  }

  /** Serializa a un objeto plano (deep copy). */
  toJSON(): DocumentData {
    return structuredClone(this.data)
  }

  static fromJSON(data: DocumentData): DocumentModel {
    return new DocumentModel(structuredClone(data))
  }

  /**
   * Reemplaza el contenido del documento in-place (OPEN/NEW/undo sin cambiar la instancia). El MSPACE
   * (y VPMAX) se conserva si la pestaña es la misma y el viewport sigue existiendo (undo dentro de un viewport).
   */
  load(data: DocumentData): void {
    const tab = this.activeTab
    const ms = this.msVp
    const max = this.maxVp
    this.data = structuredClone(data)
    this.hatchSigs.clear()
    this.normalize()
    this.reseed()
    setModelAnnoScale(this.annoScale)
    this.msVp = this.maxVp = null
    if (ms && this.activeTab === tab) this.setMsViewport(ms)
    if (max && max === this.msVp) this.maxVp = max
    this._rev++
  }

  /** Restaura el documento a un dibujo vacío por defecto. */
  reset(name = 'drawing1'): void {
    this.load(DocumentModel.createDefault(name).toJSON())
  }

  /** Capa de respaldo: la `0` si existe (no depende del orden de dibujo de las capas), si no la primera. */
  get firstLayerId(): string {
    return this.data.layers.find((l) => l.id === '0')?.id ?? this.data.layers[0]?.id ?? '0'
  }
}
