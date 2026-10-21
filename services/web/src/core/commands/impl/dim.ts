import { paperPerModel } from '../../layout/scale'
import { parseProxyId } from '../../layout/transspatial'
import { toVec3, type Pt, type Vec3 } from '../../math'
import type { DimAssocRef, DimensionEntity, DimensionProps, DimType, Entity } from '../../document/types'
import { dimDisplay, dimScaleFactor, formatDim, hAxes, planeAxes } from '../../dimension/dimGeometry'
import { arcEndpoints } from '../../geom/arc'
import { bulgeArc, bulgeAt, polylineSpans } from '../../geom/polyline'
import type { PreviewShape } from '../../preview'
import type { Command, CommandContext, PointResult } from '../types'
import { refFor } from '../../dimension/assoc'

/**
 * Comandos de cota (/E6) con los prompts del CAD clásico: selección de objeto (Enter), opciones
 * `Mtext/Text/Angle/Horizontal/Vertical/Rotated`, `DIM` inteligente, `DIMBASELINE`/`DIMCONTINUE`
 * completos (base = última cota o `Select`) y `QDIM`. Las cotas nacen en el plano de la vista.
 */

const toPt = (v: Vec3): Pt => ({ x: v[0], y: v[1], z: v[2] })
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scl = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
const norm = (a: Vec3): Vec3 => {
  const l = len(a)
  return l < 1e-12 ? [1, 0, 0] : scl(a, 1 / l)
}

/** Plano de las cotas nuevas: el de la vista (hacia el observador), como el UCS de vista del CAD clásico. */
export const dimNormal = (ctx: CommandContext): Vec3 => ctx.app.facingNormal?.() ?? [0, 0, 1]

/** Props base de una cota nueva: plano de la vista, estilo actual y overrides pendientes. */
function baseProps(ctx: CommandContext): Pick<DimensionProps, 'normal' | 'style' | 'styleName' | 'overrides' | 'hdir'> {
  const normal = dimNormal(ctx)
  // La horizontal de la cota es la X de la UCS, medida en la base del plano.
  const u = ctx.app.getUcs?.()
  const [px, py] = planeAxes(normal)
  const hdir = u ? (Math.atan2(dot(u.x, py), dot(u.x, px)) * 180) / Math.PI : 0
  return { normal, ...(Math.abs(hdir) > 1e-9 && Math.abs(dot(u!.x, normal)) < 1e-9 ? { hdir } : {}), ...ctx.doc.newDimStyleProps() }
}

/** Vista previa de una cota: líneas, texto y contorno de las flechas. */
function preview(p: DimensionProps): PreviewShape[] {
  const d = dimDisplay(p)
  const segs: Array<[Vec3, Vec3]> = [...d.lines]
  for (const st of d.textStrokes) for (let i = 0; i + 1 < st.length; i++) segs.push([st[i], st[i + 1]])
  for (const f of d.fills) for (let i = 0; i < f.length; i++) segs.push([f[i], f[(i + 1) % f.length]])
  return segs.map(([a, b]) => ({ kind: 'polyline', points: [toPt(a), toPt(b)] }))
}

/** DIMLAYER: capa de las cotas nuevas (vacío = la actual). */
let dimLayer: string | null = null

function addDim(ctx: CommandContext, p: DimensionProps): DimensionEntity {
  const layer = dimLayer && ctx.doc.layers.some((l) => l.id === dimLayer) ? dimLayer : ctx.currentLayerId()
  const e = ctx.doc.addEntity({ type: 'DIMENSION', layer, props: p }) as DimensionEntity
  lastDimId = e.id
  return e
}

/**
 * Referencia asociativa de un punto marcado: si cae sobre un punto característico (o sobre
 * la curva) de la entidad bajo el cursor. Con DIMASSOC = 1 no se asocia nada.
 */
function pickRef(ctx: CommandContext, r: PointResult): DimAssocRef | null {
  if (r.kind !== 'point' || ctx.doc.dimAssoc !== 2 || !r.pick?.id) return null
  return refOn(ctx, r.pick.id, toVec3(r.point))
}

/**
 * Referencia de `p` sobre la entidad tocada `id`. Desde el papel, un id `viewport>entidad` es geometría
 * del modelo vista por un viewport: la referencia apunta a la entidad del modelo (trans-espacial).
 */
function refOn(ctx: CommandContext, id: string, p: Vec3): DimAssocRef | null {
  const e = ctx.doc.pickTarget(id)
  if (!e || e.type === 'DIMENSION') return null
  const r = refFor(e, p)
  const px = parseProxyId(id)
  return r && px ? { ...r, id: px.id, vp: px.vp } : r
}

/** Referencias de puntos de una entidad (centro, punto sobre la curva…). */
function refsOn(ctx: CommandContext, id: string, pts: Vec3[]): Array<DimAssocRef | null> | undefined {
  if (ctx.doc.dimAssoc !== 2 || !ctx.doc.pickTarget(id)) return undefined
  const refs = pts.map((p) => refOn(ctx, id, p))
  return refs.some(Boolean) ? refs : undefined
}

/** Asociatividad de la cota nueva; si se asoció al modelo desde el papel, la escala para medir el modelo. */
function withAssoc(ctx: CommandContext, assoc: Array<DimAssocRef | null> | undefined): Partial<DimensionProps> {
  if (!assoc || !assoc.some(Boolean)) return {}
  const vp = assoc.find((r) => r?.vp)?.vp
  const e = vp ? ctx.doc.getEntity(vp) : undefined
  return e?.type === 'VIEWPORT' ? { assoc, transScale: 1 / paperPerModel(e.props.scale, ctx.doc.units) } : { assoc }
}

/** Última cota creada (base de DIMBASELINE/DIMCONTINUE, como el CAD clásico). */
let lastDimId: string | null = null

// --- Objetos -----------------------------------------------------------------------------------

interface ObjPoints {
  pts: [Vec3, Vec3]
  assoc?: Array<DimAssocRef | null>
  circle?: { c: Vec3; r: number; id: string }
}

/** Tramo de una polilínea (o lado de un rectángulo) más cercano al punto. */
function nearestSpan(e: Entity, at: Vec3): { a: Vec3; b: Vec3; i: number; j: number; arc: ReturnType<typeof bulgeArc> } | null {
  let verts: Vec3[]
  let spans: Array<[number, number]>
  let bulge: (i: number) => number = () => 0
  if (e.type === 'POLYLINE') {
    verts = e.props.vertices
    spans = polylineSpans(e.props)
    bulge = (i) => bulgeAt(e.props, i)
  } else if (e.type === 'RECTANGLE') {
    const [x, y, z] = e.props.corner
    verts = [[x, y, z], [x + e.props.width, y, z], [x + e.props.width, y + e.props.height, z], [x, y + e.props.height, z]]
    spans = [[0, 1], [1, 2], [2, 3], [3, 0]]
  } else return null
  let best: { a: Vec3; b: Vec3; i: number; j: number; arc: ReturnType<typeof bulgeArc> } | null = null
  let bd = Infinity
  for (const [i, j] of spans) {
    const a = verts[i]
    const b = verts[j]
    const arc = bulgeArc(a, b, bulge(i))
    let d: number
    if (arc) d = Math.abs(Math.hypot(at[0] - arc.center[0], at[1] - arc.center[1]) - arc.radius)
    else {
      const ab = sub(b, a)
      const t = Math.max(0, Math.min(1, dot(sub(at, a), ab) / (dot(ab, ab) || 1)))
      d = len(sub(at, add(a, scl(ab, t))))
    }
    if (d < bd) {
      bd = d
      best = { a, b, i, j, arc }
    }
  }
  return best
}

/** Puntos de una línea/arco/tramo elegido para una cota lineal o alineada (con su asociatividad). */
function objectPoints(e: Entity, at: Vec3): ObjPoints | null {
  switch (e.type) {
    case 'LINE':
      return { pts: [e.props.start, e.props.end], assoc: [{ id: e.id, kind: 'start' }, { id: e.id, kind: 'end' }] }
    case 'ARC': {
      const [s, en] = arcEndpoints(e.props)
      return { pts: [s, en], assoc: [{ id: e.id, kind: 'start' }, { id: e.id, kind: 'end' }] }
    }
    case 'CIRCLE': {
      const c = e.props.center
      const u = norm(sub(at, c))
      const r = e.props.radius
      return { pts: [sub(c, scl(u, r)), add(c, scl(u, r))], circle: { c, r, id: e.id } }
    }
    case 'POLYLINE':
    case 'RECTANGLE': {
      const sp = nearestSpan(e, at)
      if (!sp) return null
      return { pts: [sp.a, sp.b], assoc: [{ id: e.id, kind: 'vertex', index: sp.i }, { id: e.id, kind: 'vertex', index: sp.j }] }
    }
    default:
      return null
  }
}

/** Círculo (o arco) elegido: centro, radio, normal y si es un arco con sus extremos. */
function circleOf(e: Entity, at: Vec3): { c: Vec3; r: number; n: Vec3; arc?: [Vec3, Vec3]; id: string } | null {
  if (e.type === 'CIRCLE') return { c: e.props.center, r: e.props.radius, n: e.props.normal, id: e.id }
  if (e.type === 'ARC') return { c: e.props.center, r: e.props.radius, n: e.props.normal, arc: arcEndpoints(e.props), id: e.id }
  if (e.type === 'POLYLINE') {
    const sp = nearestSpan(e, at)
    if (sp?.arc) return { c: sp.arc.center, r: sp.arc.radius, n: sp.arc.normal, arc: arcEndpoints(sp.arc), id: e.id }
  }
  return null
}

async function pickEntity(ctx: CommandContext, prompt: string, ok: (e: Entity, at: Vec3) => boolean, fail: string): Promise<{ e: Entity; at: Vec3 } | null> {
  for (;;) {
    const r = await ctx.getPoint(prompt, { base: null })
    if (r.kind !== 'point') return null
    const e = r.pick?.id ? ctx.doc.pickTarget(r.pick.id) : undefined
    const at = toVec3(r.point)
    if (e && ok(e, at)) return { e, at }
    ctx.print(fail)
  }
}

// --- Ubicación con opciones de texto -----------------------------------------------------------

type LocKw = 'Mtext' | 'Text' | 'Angle' | 'Horizontal' | 'Vertical' | 'Rotated' | 'Xdatum' | 'Ydatum' | 'Partial'

/**
 * Pide la ubicación de la línea de cota con vista previa, atendiendo las opciones del CAD clásico (texto,
 * ángulo del texto, H/V/rotada, dato de ordenada). `build(cursor)` arma la cota para ese cursor.
 */
async function askLocation(
  ctx: CommandContext,
  prompt: string,
  keywords: LocKw[],
  build: (cursor: Vec3) => DimensionProps,
  extra?: (kw: LocKw, props: DimensionProps) => Promise<boolean>,
): Promise<DimensionProps | null> {
  const opts: Partial<DimensionProps> = {}
  let last: Vec3 | null = null // último cursor: la medida que ofrece `Text` es la de la cota en pantalla
  for (;;) {
    const make = (c: Vec3): DimensionProps => ({ ...build(c), ...opts })
    const r = await ctx.getPoint(`${prompt} or [${keywords.join('/')}]: `, {
      keywords,
      base: null,
      preview: (cur) => {
        last = toVec3(cur)
        return preview(make(last))
      },
    })
    if (r.kind === 'cancel') return null
    if (r.kind === 'point') return make(toVec3(r.point))
    const kw = r.keyword as LocKw
    if (kw === 'Mtext' || kw === 'Text') {
      const measured = formatDim({ ...make(last ?? build([0, 0, 0]).points[0]), textOverride: null })
      const t = await ctx.getString(`Enter dimension text <${measured}>: `, { default: '' })
      if (t === null) return null
      opts.textOverride = t === '' ? null : t
    } else if (kw === 'Angle') {
      const a = await ctx.getString('Specify angle of dimension text: ')
      if (a === null) return null
      const v = Number(a.replace(',', '.'))
      if (Number.isFinite(v)) opts.textAngle = v
    } else if (kw === 'Horizontal') opts.rotation = 0
    else if (kw === 'Vertical') opts.rotation = 90
    else if (kw === 'Rotated') {
      const a = await ctx.getString('Specify angle of dimension line <0>: ', { default: '0' })
      if (a === null) return null
      const v = Number(a.replace(',', '.'))
      if (Number.isFinite(v)) opts.rotation = v
    } else if (kw === 'Xdatum') opts.axis = 'X'
    else if (kw === 'Ydatum') opts.axis = 'Y'
    else if (extra && !(await extra(kw, make([0, 0, 0])))) return null
  }
}

// --- LINEAR / ALIGNED --------------------------------------------------------------------------

/** Para un círculo elegido con DIMLINEAR: los cuadrantes en la dirección H/V que marca el cursor. */
function circleLinearPoints(circle: { c: Vec3; r: number }, cursor: Vec3, n: Vec3, hdir?: number): [Vec3, Vec3] {
  const [x, y] = hAxes(n, hdir)
  const d = sub(cursor, circle.c)
  const ax = Math.abs(dot(d, y)) >= Math.abs(dot(d, x)) ? x : y
  return [sub(circle.c, scl(ax, circle.r)), add(circle.c, scl(ax, circle.r))]
}

async function twoPointFlow(ctx: CommandContext, dimType: 'LINEAR' | 'ALIGNED'): Promise<DimensionEntity | null> {
  const first = await ctx.getPoint('Specify first extension line origin or <select object>: ', { enterKeyword: 'Select', keywords: ['Select'] })
  if (first.kind === 'cancel') return null
  let pts: [Vec3, Vec3]
  let assoc: ObjPoints['assoc']
  let circle: ObjPoints['circle']
  if (first.kind === 'keyword') {
    const o = await pickEntity(ctx, 'Select object to dimension: ', (e, at) => objectPoints(e, at) !== null, 'Select a line, arc, circle or polyline segment.')
    if (!o) return null
    const op = objectPoints(o.e, o.at)!
    pts = op.pts
    assoc = op.assoc
    circle = op.circle
  } else {
    const second = await ctx.getPoint('Specify second extension line origin: ', { base: first.point })
    if (second.kind !== 'point') return null
    pts = [toVec3(first.point), toVec3(second.point)]
    assoc = [pickRef(ctx, first), pickRef(ctx, second)]
  }
  if (ctx.doc.dimAssoc !== 2) assoc = undefined
  const base = baseProps(ctx)
  const keywords: LocKw[] = dimType === 'LINEAR' ? ['Mtext', 'Text', 'Angle', 'Horizontal', 'Vertical', 'Rotated'] : ['Mtext', 'Text', 'Angle']
  const props = await askLocation(ctx, 'Specify dimension line location', keywords, (cursor) => ({
    ...base,
    dimType,
    points: circle && dimType === 'LINEAR' ? circleLinearPoints(circle, cursor, base.normal ?? [0, 0, 1], base.hdir) : pts,
    textPos: cursor,
    ...withAssoc(ctx, assoc),
  }))
  if (!props) return null
  const e = addDim(ctx, props)
  ctx.print(`Dimension text = ${formatDim({ ...props, textOverride: null })}`)
  return e
}

export const dimLinearCommand: Command = {
  name: 'DIMLINEAR',
  aliases: ['DLI', 'DIMLIN'],
  description: 'Linear dimension (horizontal, vertical or rotated) [Mtext/Text/Angle/Horizontal/Vertical/Rotated]',
  async run(ctx) {
    await twoPointFlow(ctx, 'LINEAR')
  },
}

export const dimAlignedCommand: Command = {
  name: 'DIMALIGNED',
  aliases: ['DAL', 'DIMALI'],
  description: 'Aligned dimension [Mtext/Text/Angle]',
  async run(ctx) {
    await twoPointFlow(ctx, 'ALIGNED')
  },
}

// --- RADIUS / DIAMETER / JOGGED ----------------------------------------------------------------

/** Normal de la curva orientada hacia el observador (para que el texto no quede espejado). */
function facing(n: Vec3 | undefined, view: Vec3): Vec3 {
  const nn = n ?? [0, 0, 1]
  return dot(nn, view) < 0 ? scl(nn, -1) : nn
}

async function radialFlow(ctx: CommandContext, dimType: 'RADIUS' | 'DIAMETER' | 'JOGGED'): Promise<DimensionEntity | null> {
  const o = await pickEntity(ctx, 'Select arc or circle: ', (e, at) => circleOf(e, at) !== null, 'Object selected is not a circle or arc.')
  if (!o) return null
  const ci = circleOf(o.e, o.at)!
  const base = baseProps(ctx)
  const normal = facing(ci.n, base.normal ?? [0, 0, 1])
  const on = add(ci.c, scl(norm(sub(o.at, ci.c)), ci.r))
  let override: Vec3 | null = null
  if (dimType === 'JOGGED') {
    const r = await ctx.getPoint('Specify center location override: ', { base: null })
    if (r.kind !== 'point') return null
    override = toVec3(r.point)
  }
  const measured = formatDim({ ...base, dimType, points: [ci.c, on], textPos: on })
  ctx.print(`Dimension text = ${measured}`)
  const props = await askLocation(ctx, 'Specify dimension line location', ['Mtext', 'Text', 'Angle'], (cursor) => ({
    ...base,
    normal,
    dimType,
    points: override ? [ci.c, on, override] : [ci.c, on],
    textPos: cursor,
    ...withAssoc(ctx, refsOn(ctx, ci.id, [ci.c, on])),
  }))
  return props ? addDim(ctx, props) : null
}

export const dimRadiusCommand: Command = {
  name: 'DIMRADIUS',
  aliases: ['DRA', 'DIMRAD'],
  description: 'Radius dimension of an arc or circle [Mtext/Text/Angle]',
  async run(ctx) {
    await radialFlow(ctx, 'RADIUS')
  },
}
export const dimDiameterCommand: Command = {
  name: 'DIMDIAMETER',
  aliases: ['DDI', 'DIMDIA'],
  description: 'Diameter dimension of an arc or circle [Mtext/Text/Angle]',
  async run(ctx) {
    await radialFlow(ctx, 'DIAMETER')
  },
}
export const dimJoggedCommand: Command = {
  name: 'DIMJOGGED',
  aliases: ['DJO', 'JOG'],
  description: 'Jogged radius dimension (center location override) [Mtext/Text/Angle]',
  async run(ctx) {
    await radialFlow(ctx, 'JOGGED')
  },
}

// --- ARC LENGTH ---------------------------------------------------------------------------------

export const dimArcCommand: Command = {
  name: 'DIMARC',
  aliases: ['DAR'],
  description: 'Arc length dimension [Mtext/Text/Angle/Partial]',
  async run(ctx) {
    const o = await pickEntity(ctx, 'Select arc or polyline arc segment: ', (e, at) => !!circleOf(e, at)?.arc, 'Object selected is not an arc or polyline arc segment.')
    if (!o) return
    const ci = circleOf(o.e, o.at)!
    const base = baseProps(ctx)
    const normal = base.normal ?? [0, 0, 1]
    // Extremos en sentido antihorario visto desde el observador (barrido del arco).
    let [a, b] = ci.arc!
    if (dot(ci.n, normal) < 0) [a, b] = [b, a]
    let pts: Vec3[] = [ci.c, a, b]
    const props = await askLocation(
      ctx,
      'Specify arc length dimension location',
      ['Mtext', 'Text', 'Angle', 'Partial'],
      (cursor) => ({ ...base, normal, dimType: 'ARCLEN', angMode: 'arc', points: pts, textPos: cursor, ...withAssoc(ctx, refsOn(ctx, ci.id, pts)) }),
      async (kw) => {
        if (kw !== 'Partial') return true
        const p1 = await ctx.getPoint('Specify first point for arc length dimension: ', { base: null })
        if (p1.kind !== 'point') return false
        const p2 = await ctx.getPoint('Specify second point for arc length dimension: ', { base: null })
        if (p2.kind !== 'point') return false
        const onArc = (p: Pt): Vec3 => add(ci.c, scl(norm(sub(toVec3(p), ci.c)), ci.r))
        pts = [ci.c, onArc(p1.point), onArc(p2.point)]
        return true
      },
    )
    if (props) addDim(ctx, props.points === pts ? props : { ...props, points: pts })
  },
}

// --- ANGULAR ------------------------------------------------------------------------------------

/** Intersección (XY) de dos rectas infinitas, o null si son paralelas. */
function lineX(a1: Vec3, b1: Vec3, a2: Vec3, b2: Vec3): Vec3 | null {
  const r = sub(b1, a1)
  const s = sub(b2, a2)
  const den = r[0] * s[1] - r[1] * s[0]
  if (Math.abs(den) < 1e-12 * (len(r) * len(s) || 1)) return null
  const t = ((a2[0] - a1[0]) * s[1] - (a2[1] - a1[1]) * s[0]) / den
  return [a1[0] + t * r[0], a1[1] + t * r[1], a1[2]]
}

export const dimAngularCommand: Command = {
  name: 'DIMANGULAR',
  aliases: ['DAN'],
  description: 'Angular dimension: two lines, an arc, a circle or a vertex and two points [Mtext/Text/Angle]',
  async run(ctx) {
    const base = baseProps(ctx)
    const r = await ctx.getPoint('Select arc, circle, line, or <specify vertex>: ', { base: null, enterKeyword: 'Vertex', keywords: ['Vertex'] })
    if (r.kind === 'cancel') return
    let pts: Vec3[]
    let mode: DimensionProps['angMode'] = 'points'
    let normal = base.normal ?? [0, 0, 1]
    const e = r.kind === 'point' && r.pick?.id ? ctx.doc.pickTarget(r.pick.id) : undefined
    if (r.kind === 'keyword') {
      const v = await ctx.getPoint('Specify angle vertex: ', { base: null })
      if (v.kind !== 'point') return
      const a = await ctx.getPoint('Specify first angle endpoint: ', { base: v.point })
      if (a.kind !== 'point') return
      const b = await ctx.getPoint('Specify second angle endpoint: ', { base: v.point })
      if (b.kind !== 'point') return
      pts = [toVec3(v.point), toVec3(a.point), toVec3(b.point)]
    } else if (e && (e.type === 'ARC' || (e.type === 'POLYLINE' && circleOf(e, toVec3((r as Extract<PointResult, { kind: 'point' }>).point))?.arc))) {
      const ci = circleOf(e, toVec3(r.point))!
      let [a, b] = ci.arc!
      if (dot(ci.n, normal) < 0) [a, b] = [b, a]
      pts = [ci.c, a, b]
      mode = 'arc'
    } else if (e?.type === 'CIRCLE') {
      const c = e.props.center
      const a = add(c, scl(norm(sub(toVec3(r.point), c)), e.props.radius))
      const b = await ctx.getPoint('Specify second angle endpoint: ', { base: toPt(c) })
      if (b.kind !== 'point') return
      pts = [c, a, toVec3(b.point)]
      normal = facing(e.props.normal, normal)
    } else if (e && (e.type === 'LINE' || e.type === 'POLYLINE' || e.type === 'RECTANGLE')) {
      const l1 = objectPoints(e, toVec3(r.point))
      const o2 = await pickEntity(ctx, 'Select second line: ', (x, at) => (x.type === 'LINE' || x.type === 'POLYLINE' || x.type === 'RECTANGLE') && !!objectPoints(x, at), 'Select a line.')
      if (!l1 || !o2) return
      const l2 = objectPoints(o2.e, o2.at)!
      const vtx = lineX(l1.pts[0], l1.pts[1], l2.pts[0], l2.pts[1])
      if (!vtx) return ctx.print('Lines are parallel.')
      // Cada rama, del lado del vértice donde se marcó la línea.
      const side = (p: [Vec3, Vec3], at: Vec3): Vec3 => {
        const d = norm(sub(p[1], p[0]))
        return dot(sub(at, vtx), d) >= 0 ? add(vtx, d) : sub(vtx, d)
      }
      pts = [vtx, side(l1.pts, toVec3(r.point)), side(l2.pts, o2.at)]
      mode = 'lines'
    } else {
      ctx.print('Select an arc, circle or line, or press Enter to specify the vertex.')
      return
    }
    const props = await askLocation(ctx, 'Specify dimension arc line location', ['Mtext', 'Text', 'Angle'], (cursor) => ({
      ...base,
      normal,
      dimType: 'ANGULAR',
      angMode: mode,
      points: pts,
      textPos: cursor,
    }))
    if (props) {
      addDim(ctx, props)
      ctx.print(`Dimension text = ${formatDim({ ...props, textOverride: null })}`)
    }
  },
}

// --- ORDINATE / CENTER / LEADER -----------------------------------------------------------------

/** Dato de una ordenada: si el líder va más hacia la "horizontal" del plano, mide Y (como el CAD clásico). */
function ordinateAxis(n: Vec3, f: Vec3, c: Vec3, hdir?: number): 'X' | 'Y' {
  const [px, py] = hAxes(n, hdir)
  const d = sub(c, f)
  return Math.abs(dot(d, px)) > Math.abs(dot(d, py)) ? 'Y' : 'X'
}

async function ordinateAt(ctx: CommandContext, f: Vec3, lockAxis?: 'X' | 'Y', ref?: DimAssocRef | null): Promise<DimensionEntity | null> {
  const base = baseProps(ctx)
  const n = base.normal ?? [0, 0, 1]
  let locked = lockAxis
  const props = await askLocation(
    ctx,
    'Specify leader endpoint',
    ['Xdatum', 'Ydatum', 'Mtext', 'Text', 'Angle'],
    (cursor) => ({ ...base, dimType: 'ORDINATE', points: [f], textPos: cursor, axis: locked ?? ordinateAxis(n, f, cursor, base.hdir), ...withAssoc(ctx, ref ? [ref] : undefined) }),
  )
  if (!props) return null
  if (props.axis) locked = props.axis
  return addDim(ctx, props)
}

export const dimOrdinateCommand: Command = {
  name: 'DIMORDINATE',
  aliases: ['DOR'],
  description: 'Ordinate dimension (X or Y datum from the UCS origin) [Xdatum/Ydatum/Mtext/Text/Angle]',
  async run(ctx) {
    const f = await ctx.getPoint('Specify feature location: ')
    if (f.kind !== 'point') return
    await ordinateAt(ctx, toVec3(f.point), undefined, pickRef(ctx, f))
  },
}

export const dimCenterCommand: Command = {
  name: 'DIMCENTER',
  aliases: ['DCE', 'CENTERMARK', 'CM'],
  description: 'Center mark (and center lines with DIMCEN < 0) of an arc or circle',
  async run(ctx) {
    const o = await pickEntity(ctx, 'Select arc or circle: ', (e, at) => circleOf(e, at) !== null, 'Object selected is not a circle or arc.')
    if (!o) return
    const ci = circleOf(o.e, o.at)!
    const base = baseProps(ctx)
    addDim(ctx, { ...base, normal: facing(ci.n, base.normal ?? [0, 0, 1]), dimType: 'CENTER', points: [ci.c], textPos: add(ci.c, [ci.r, 0, 0]), ...withAssoc(ctx, refsOn(ctx, ci.id, [ci.c])) })
  },
}

export const leaderCommand: Command = {
  name: 'LEADER',
  aliases: ['LEAD'],
  description: 'Leader with annotation text (see MLEADER)',
  async run(ctx) {
    const start = await ctx.getPoint('Specify leader start point: ')
    if (start.kind !== 'point') return
    const pts: Vec3[] = [toVec3(start.point)]
    const base = baseProps(ctx)
    for (;;) {
      const prev = pts[pts.length - 1]
      const r = await ctx.getPoint('Specify next point: ', {
        base: toPt(prev),
        preview: (cur) => preview({ ...base, dimType: 'LEADER', points: [...pts, toVec3(cur)], textPos: toVec3(cur) }),
      })
      if (r.kind !== 'point') break
      pts.push(toVec3(r.point))
    }
    if (pts.length < 2) return
    const t = await ctx.getString('Enter first line of annotation text <none>: ', { default: '' })
    if (t === null) return
    addDim(ctx, { ...base, dimType: 'LEADER', points: pts, textPos: pts[pts.length - 1], textOverride: t || null })
  },
}

// --- BASELINE / CONTINUE ------------------------------------------------------------------------

const CHAINABLE: DimType[] = ['LINEAR', 'ALIGNED', 'ANGULAR', 'ORDINATE']

function lastChainable(ctx: CommandContext): DimensionEntity | null {
  const byId = lastDimId ? ctx.doc.getEntity(lastDimId) : undefined
  if (byId?.type === 'DIMENSION' && CHAINABLE.includes(byId.props.dimType)) return byId
  const found = [...ctx.doc.entities].reverse().find((e) => e.type === 'DIMENSION' && CHAINABLE.includes(e.props.dimType))
  return (found as DimensionEntity | undefined) ?? null
}

/** Siguiente cota de una cadena desde `prev` hasta `p` (continua o de línea base). */
function chained(prev: DimensionProps, p: Vec3, baseline: boolean, k: number): DimensionProps {
  const step = prev.style.DIMDLI * k
  if (prev.dimType === 'ORDINATE') {
    const [px, py] = hAxes(prev.normal ?? [0, 0, 1], prev.hdir)
    const along = prev.axis === 'Y' ? px : py
    const f = prev.points[0]
    const end = add(p, scl(along, dot(sub(prev.textPos, f), along)))
    return { ...prev, points: [p], textPos: end, textAt: undefined, textOverride: null, assoc: undefined }
  }
  if (prev.dimType === 'ANGULAR') {
    const [c, a, b] = prev.points
    const r = len(sub(prev.textPos, c))
    const first = baseline ? a : b
    const mid = norm(add(norm(sub(first, c)), norm(sub(p, c))))
    const rad = baseline ? r + step : r
    return { ...prev, angMode: 'points', points: [c, first, p], textPos: add(c, scl(mid, rad)), textAt: undefined, textOverride: null, assoc: undefined }
  }
  // LINEAR / ALIGNED: misma dirección; la base se aleja DIMDLI del objeto.
  const [a, b] = prev.points
  const n = prev.normal ?? [0, 0, 1]
  const d = norm(sub(b, a))
  const perp = norm([n[1] * d[2] - n[2] * d[1], n[2] * d[0] - n[0] * d[2], n[0] * d[1] - n[1] * d[0]])
  const side = Math.sign(dot(sub(prev.textPos, a), perp)) || 1
  const first = baseline ? a : b
  const textPos = baseline ? add(prev.textPos, scl(perp, side * step)) : prev.textPos
  return { ...prev, points: [first, p], textPos, textAt: undefined, textOverride: null, assoc: undefined }
}

async function chainFlow(ctx: CommandContext, baseline: boolean): Promise<void> {
  let base = lastChainable(ctx)
  const created: string[] = []
  for (;;) {
    if (!base) {
      const o = await pickEntity(ctx, baseline ? 'Select base dimension: ' : 'Select continued dimension: ', (e) => e.type === 'DIMENSION' && CHAINABLE.includes(e.props.dimType), 'Select a linear, aligned, angular or ordinate dimension.')
      if (!o) return
      base = o.e as DimensionEntity
      // `Select`: el origen es la línea de referencia más cercana al clic (como el CAD clásico).
      if ((base.props.dimType === 'LINEAR' || base.props.dimType === 'ALIGNED') && len(sub(o.at, base.props.points[0])) < len(sub(o.at, base.props.points[1]))) {
        base = { ...base, props: { ...base.props, points: [base.props.points[1], base.props.points[0]] } }
      }
    }
    const prev = base.props
    const k = dimScaleFactor(prev.style)
    const isOrd = prev.dimType === 'ORDINATE'
    const r = await ctx.getPoint(isOrd ? 'Specify feature location or [Select/Undo] <Select>: ' : 'Specify a second extension line origin or [Select/Undo] <Select>: ', {
      keywords: ['Select', 'Undo'],
      enterKeyword: 'Select',
      base: null,
      preview: (cur) => preview(chained(prev, toVec3(cur), baseline, k)),
    })
    if (r.kind === 'cancel') return
    if (r.kind === 'keyword') {
      if (r.keyword === 'Undo') {
        const id = created.pop()
        if (id) {
          ctx.doc.removeEntity(id)
          const last = created.length ? ctx.doc.getEntity(created[created.length - 1]) : undefined
          base = (last as DimensionEntity | undefined) ?? lastChainable(ctx)
        } else ctx.print('Nothing to undo.')
        continue
      }
      if (created.length > 0) return // Enter tras crear cotas: termina (como el CAD clásico)
      base = null
      continue
    }
    const next = chained(prev, toVec3(r.point), baseline, k)
    // La cadena hereda la referencia del punto compartido y asocia el nuevo si cae sobre un objeto.
    const shared = baseline ? prev.assoc?.[0] : prev.assoc?.[1]
    const ref = pickRef(ctx, r)
    if (next.dimType === 'LINEAR' || next.dimType === 'ALIGNED') Object.assign(next, withAssoc(ctx, [shared ?? null, ref]))
    else if (next.dimType === 'ORDINATE') Object.assign(next, withAssoc(ctx, [ref]))
    const e = addDim(ctx, next)
    created.push(e.id)
    ctx.print(`Dimension text = ${formatDim({ ...next, textOverride: null })}`)
    base = e
  }
}

export const dimBaselineCommand: Command = {
  name: 'DIMBASELINE',
  aliases: ['DBA', 'DIMBASE'],
  description: 'Baseline dimensions from the last (or a selected) dimension, spaced by DIMDLI [Select/Undo]',
  async run(ctx) {
    await chainFlow(ctx, true)
  },
}
export const dimContinueCommand: Command = {
  name: 'DIMCONTINUE',
  aliases: ['DCO', 'DIMCONT'],
  description: 'Continued dimensions from the last (or a selected) dimension [Select/Undo]',
  async run(ctx) {
    await chainFlow(ctx, false)
  },
}

// --- DIM inteligente ----------------------------------------------------------------------------

/** Tipo de cota de un objeto según dónde está el cursor: alineada a su lado, H/V más allá de sus extremos. */
function smartLine(pts: [Vec3, Vec3], cursor: Vec3): 'ALIGNED' | 'LINEAR' {
  const [a, b] = pts
  const ab = sub(b, a)
  const t = dot(sub(cursor, a), ab) / (dot(ab, ab) || 1)
  return t >= 0 && t <= 1 ? 'ALIGNED' : 'LINEAR'
}

export const dimCommand: Command = {
  name: 'DIM',
  aliases: [],
  description: 'Smart dimension: pick an object (line → linear/aligned, arc → radius, circle → diameter) [Angular/Baseline/Continue/Ordinate/aLign/LAyer/Undo]',
  async run(ctx) {
    for (;;) {
      const r = await ctx.getPoint('Select objects or specify first extension line origin or [Angular/Baseline/Continue/Ordinate/aLign/LAyer/Undo]: ', {
        keywords: ['Angular', 'Baseline', 'Continue', 'Ordinate', 'aLign', 'LAyer', 'Undo'],
        base: null,
      })
      if (r.kind === 'cancel') return
      if (r.kind === 'keyword') {
        switch (r.keyword) {
          case 'Angular':
            await dimAngularCommand.run(ctx)
            break
          case 'Baseline':
            await chainFlow(ctx, true)
            break
          case 'Continue':
            await chainFlow(ctx, false)
            break
          case 'Ordinate': {
            const f = await ctx.getPoint('Specify feature location: ')
            if (f.kind === 'point') await ordinateAt(ctx, toVec3(f.point))
            break
          }
          case 'aLign':
            await alignDims(ctx)
            break
          case 'LAyer': {
            const names = ctx.doc.layers.map((l) => l.name)
            const t = await ctx.getString(`Enter layer name or select an object for DIMLAYER <${dimLayer ? (ctx.doc.layers.find((l) => l.id === dimLayer)?.name ?? '.') : 'use current'}>: `, { default: '' })
            if (t === null) break
            if (t.trim() === '.' || t.trim() === '') dimLayer = null
            else {
              const l = ctx.doc.layers.find((x) => x.name.toLowerCase() === t.trim().toLowerCase())
              if (l) dimLayer = l.id
              else ctx.print(`Layer "${t.trim()}" not found. Layers: ${names.join(', ')}`)
            }
            break
          }
          case 'Undo':
            if (lastDimId && ctx.doc.getEntity(lastDimId)) ctx.doc.removeEntity(lastDimId)
            lastDimId = null
            break
        }
        continue
      }
      const at = toVec3(r.point)
      const e = r.pick?.id ? ctx.doc.pickTarget(r.pick.id) : undefined
      const base = baseProps(ctx)
      if (e && (e.type === 'CIRCLE' || e.type === 'ARC' || (e.type === 'POLYLINE' && circleOf(e, at)?.arc))) {
        const ci = circleOf(e, at)!
        const dimType: DimType = e.type === 'CIRCLE' ? 'DIAMETER' : 'RADIUS'
        const on = add(ci.c, scl(norm(sub(at, ci.c)), ci.r))
        const props = await askLocation(ctx, `Specify ${dimType === 'DIAMETER' ? 'diameter' : 'radius'} dimension location`, ['Mtext', 'Text', 'Angle'], (cursor) => ({
          ...base,
          normal: facing(ci.n, base.normal ?? [0, 0, 1]),
          dimType,
          points: [ci.c, on],
          textPos: cursor,
          ...withAssoc(ctx, refsOn(ctx, ci.id, [ci.c, on])),
        }))
        if (props) addDim(ctx, props)
        continue
      }
      const op = e ? objectPoints(e, at) : null
      if (op && !op.circle) {
        const props = await askLocation(ctx, 'Specify dimension line location', ['Mtext', 'Text', 'Angle'], (cursor) => ({
          ...base,
          dimType: smartLine(op.pts, cursor),
          points: op.pts,
          textPos: cursor,
          ...withAssoc(ctx, ctx.doc.dimAssoc === 2 ? op.assoc : undefined),
        }))
        if (props) addDim(ctx, props)
        continue
      }
      // Punto libre: primer origen de una lineal.
      const second = await ctx.getPoint('Specify second extension line origin: ', { base: r.point })
      if (second.kind !== 'point') continue
      const pts: [Vec3, Vec3] = [at, toVec3(second.point)]
      const refs = [pickRef(ctx, r), pickRef(ctx, second)]
      const props = await askLocation(ctx, 'Specify dimension line location', ['Mtext', 'Text', 'Angle', 'Horizontal', 'Vertical', 'Rotated'], (cursor) => ({ ...base, dimType: 'LINEAR', points: pts, textPos: cursor, ...withAssoc(ctx, refs) }))
      if (props) addDim(ctx, props)
    }
  },
}

/** DIM ▸ aLign: alinea cotas lineales/alineadas con la línea de cota de una cota base. */
async function alignDims(ctx: CommandContext): Promise<void> {
  const b = await pickEntity(ctx, 'Select base dimension: ', (e) => e.type === 'DIMENSION' && (e.props.dimType === 'LINEAR' || e.props.dimType === 'ALIGNED'), 'Select a linear or aligned dimension.')
  if (!b) return
  const ids = await ctx.getSelection('Select dimensions to align: ')
  const base = (b.e as DimensionEntity).props
  let n = 0
  for (const id of ids ?? []) {
    const e = ctx.doc.getEntity(id)
    if (e?.type !== 'DIMENSION' || e.id === b.e.id || (e.props.dimType !== 'LINEAR' && e.props.dimType !== 'ALIGNED')) continue
    e.props.textPos = base.textPos
    n++
  }
  ctx.doc.touch()
  ctx.print(`${n} dimension(s) aligned.`)
}

// --- QDIM ---------------------------------------------------------------------------------------

export const qdimCommand: Command = {
  name: 'QDIM',
  aliases: [],
  description: 'Quick dimension: chain the selected geometry [Continuous/Staggered/Baseline/Ordinate/Radius/Diameter]',
  async run(ctx) {
    const ids = await ctx.getSelection('Select geometry to dimension: ')
    if (!ids?.length) return
    const ents = ids.map((id) => ctx.doc.getEntity(id)).filter((e): e is Entity => !!e)
    const pts: Vec3[] = []
    const circles: Array<{ c: Vec3; r: number; id: string; n: Vec3 }> = []
    for (const e of ents) {
      if (e.type === 'LINE') pts.push(e.props.start, e.props.end)
      else if (e.type === 'POLYLINE') pts.push(...e.props.vertices)
      else if (e.type === 'RECTANGLE') {
        const [x, y, z] = e.props.corner
        pts.push([x, y, z], [x + e.props.width, y, z], [x + e.props.width, y + e.props.height, z], [x, y + e.props.height, z])
      } else if (e.type === 'CIRCLE' || e.type === 'ARC') {
        circles.push({ c: e.props.center, r: e.props.radius, id: e.id, n: e.props.normal })
        pts.push(e.props.center)
      }
    }
    const base = baseProps(ctx)
    const n = base.normal ?? [0, 0, 1]
    const [px, py] = hAxes(n, base.hdir)
    let mode = 'Continuous'
    for (;;) {
      const r = await ctx.getPoint(`Specify dimension line position, or [Continuous/Staggered/Baseline/Ordinate/Radius/Diameter] <${mode}>: `, {
        keywords: ['Continuous', 'Staggered', 'Baseline', 'Ordinate', 'Radius', 'Diameter'],
        base: null,
        preview: (cur) => quick(toVec3(cur)).flatMap(preview),
      })
      if (r.kind === 'cancel') return
      if (r.kind === 'keyword') {
        mode = r.keyword
        continue
      }
      const made = quick(toVec3(r.point))
      for (const p of made) addDim(ctx, p)
      ctx.print(`${made.length} dimension(s) created.`)
      return
    }
    /** Cotas de QDIM para la posición `cur` de la línea de cota. */
    function quick(cur: Vec3): DimensionProps[] {
      if (mode === 'Radius' || mode === 'Diameter') {
        const t: DimType = mode === 'Radius' ? 'RADIUS' : 'DIAMETER'
        return circles.map((c) => {
          const d = norm(sub(cur, c.c))
          const on = add(c.c, scl(d, c.r))
          return { ...base, normal: facing(c.n, n), dimType: t, points: [c.c, on], textPos: add(c.c, scl(d, c.r * 1.6)), ...withAssoc(ctx, refsOn(ctx, c.id, [c.c, on])) }
        })
      }
      if (pts.length < 2) return []
      const mid = scl(pts.reduce((s, q) => add(s, q), [0, 0, 0] as Vec3), 1 / pts.length)
      const off = sub(cur, mid)
      const horizontal = Math.abs(dot(off, py)) >= Math.abs(dot(off, px))
      const ax = horizontal ? px : py
      // Puntos únicos ordenados a lo largo de la dirección de la cota.
      const sorted = [...pts].sort((a, b) => dot(a, ax) - dot(b, ax))
      const uniq: Vec3[] = []
      for (const q of sorted) if (!uniq.length || Math.abs(dot(q, ax) - dot(uniq[uniq.length - 1], ax)) > 1e-6) uniq.push(q)
      const rot = horizontal ? 0 : 90
      const k = dimScaleFactor(base.style)
      if (mode === 'Ordinate') return uniq.map((q) => ({ ...base, dimType: 'ORDINATE', points: [q], textPos: add(q, scl(horizontal ? py : px, dot(sub(cur, q), horizontal ? py : px))), axis: horizontal ? 'X' : 'Y' }))
      const out: DimensionProps[] = []
      for (let i = 1; i < uniq.length; i++) {
        const first = mode === 'Baseline' ? uniq[0] : uniq[i - 1]
        const stepped = mode === 'Baseline' ? (i - 1) : mode === 'Staggered' ? (i % 2) : 0
        const sideDir = horizontal ? py : px
        const sideSign = Math.sign(dot(off, sideDir)) || 1
        out.push({ ...base, dimType: 'LINEAR', rotation: rot, points: [first, uniq[i]], textPos: add(cur, scl(sideDir, sideSign * stepped * base.style.DIMDLI * k)) })
      }
      return out
    }
  },
}

export const dimTextSizeCommand: Command = {
  name: 'DIMTEXTSIZE',
  aliases: [],
  description: 'Set the dimension text height for new dimensions (DIMTXT override)',
  async run(ctx) {
    const cur = ctx.doc.currentDimVars.DIMTXT
    const r = await ctx.getDistance(`Enter new value for DIMTXT <${cur}>: `, { base: { x: 0, y: 0, z: 0 }, default: cur })
    if (r.kind === 'distance' && r.value > 0) {
      ctx.doc.setDimOverride('DIMTXT', r.value)
      ctx.print(`DIMTXT = ${r.value}`)
    }
  },
}

/** Base de la próxima DIMBASELINE/DIMCONTINUE (menú contextual *Continue/Baseline Dimension*). */
export function setChainBase(id: string): void {
  lastDimId = id
}

/** Para tests: olvida la última cota y DIMLAYER (cada harness es una sesión nueva). */
export function resetDimSession(): void {
  lastDimId = null
  dimLayer = null
}

