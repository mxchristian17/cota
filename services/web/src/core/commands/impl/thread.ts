import { toVec3, type Pt, type Vec3 } from '../../math'
import type { ArcEntity, ArcProps, CircleEntity, DimensionProps, Entity, SolidEntity, SolidThread } from '../../document/types'
import type { Command, CommandContext } from '../types'
import type { PreviewShape } from '../../preview'
import { askKeyword } from '../ask'
import { visibleEntities } from '../selectionSets'
import { dimNormal } from './dim'
import { mleaderPreview } from './mleader'
import { dimScaleFactor } from '../../dimension/dimGeometry'
import { arcPointAt } from '../../geom/arc'
import { vadd, vdist, vdot, vlen, vnorm, vscale, vsub } from '../../geom/vec3'
import { rayFaces, solidTopology } from '../../editing/topology'
import { isDrawingView } from '../../drawing/views'
import { SERIES_LABEL, closestIndex, fmtThread, nearestThreads, type ThreadSpec } from '../../thread/tables'
import { cylinderOfFace, leaderOfArc, leaderOfSolidThread, solidThreadFor, solidThreads, threadArcFor, threadOnFace, threadSurfacePoint, type CylFace } from '../../thread/geometry'

/** Grosor de la línea fina de la rosca (mm). */
export const THREAD_LW = 0.18

const toPt = (v: Vec3): Pt => ({ x: v[0], y: v[1], z: v[2] })

/** Punto proyectado al plano (centro, normal). */
const inPlane = (p: Vec3, c: Vec3, n: Vec3): Vec3 => vsub(p, vscale(n, vdot(vsub(p, c), n)))

/** Normal del círculo del lado del observador (así el cuadrante abierto queda arriba a la derecha). */
function facing(ctx: CommandContext, n: Vec3): Vec3 {
  const f = dimNormal(ctx)
  return vdot(n, f) < 0 ? [-n[0], -n[1], -n[2]] : [...n]
}

const annoScale = (ctx: CommandContext): number => dimScaleFactor(ctx.doc.newDimStyleProps().style)

function arcPreview(a: ArcProps): PreviewShape[] {
  const pts: Pt[] = []
  for (let i = 0; i <= 48; i++) pts.push(toPt(arcPointAt(a, i / 48)))
  return [{ kind: 'polyline', points: pts }]
}

/** Lista las roscas más próximas y pide una; null = cancelado. */
async function chooseThread(ctx: CommandContext, dia: number, internal: boolean): Promise<ThreadSpec | null> {
  const list = nearestThreads(dia, internal)
  const def = closestIndex(list, dia, internal)
  ctx.print(`Nearest standard threads for Ø${fmtThread(dia)} (${internal ? 'hole: minor diameter' : 'shaft: major diameter'}):`)
  list.forEach((t, i) => {
    const ref = internal ? `D1=${fmtThread(t.D1)}` : `d=${fmtThread(t.d)}`
    ctx.print(`  ${i + 1}  ${t.designation}  —  ${SERIES_LABEL[t.series]}, ${ref}, P=${fmtThread(t.pitch)}${t.tpi ? ` (${t.tpi} tpi)` : ''}`)
  })
  const keys = list.map((_, i) => String(i + 1))
  const k = await askKeyword(ctx, `Select thread [${keys.join('/')}] <${def + 1}>: `, keys, String(def + 1))
  return k === null ? null : list[Number(k) - 1]
}

/**
 * Línea de referencia con el designativo: la flecha va al diámetro nominal, del lado del cursor
 * (`arrowFor`). El texto se cambia después en Propiedades (Text override).
 */
async function placeLeader(ctx: CommandContext, arrowFor: (cursor: Vec3) => Vec3, text: string): Promise<boolean> {
  const base = { normal: dimNormal(ctx), ...ctx.doc.newDimStyleProps(), dimType: 'MLEADER' as const }
  const props = (c: Vec3): DimensionProps => ({ ...base, points: [arrowFor(c)], leaderSizes: [1], textPos: c, textOverride: text })
  const l = await ctx.getPoint('Specify leader landing location: ', { base: null, preview: (c) => mleaderPreview(props(toVec3(c))) })
  if (l.kind !== 'point') return false
  ctx.doc.addEntity({ type: 'DIMENSION', layer: ctx.currentLayerId(), props: props(toVec3(l.point)) })
  return true
}

/** Flecha sobre el círculo (centro, normal, radio) en la dirección del cursor. */
const ringArrow = (c: Vec3, n: Vec3, r: number) => (cursor: Vec3): Vec3 => {
  const d = vsub(inPlane(cursor, c, n), c)
  const dir = vlen(d) > 1e-9 ? vnorm(d) : ([Math.SQRT1_2, Math.SQRT1_2, 0] as Vec3)
  return vadd(c, vscale(dir, r))
}

/** Radio nominal de una rosca 2D: el del círculo del eje (d/2 a escala) o el del arco del agujero. */
const nominalR = (a: ArcProps, scale = 1): number => (a.thread && !a.thread.internal ? (a.thread.d / 2) * scale : a.radius)

/** Rosca ya definida: agrega la cota si no la tiene; si ya la tiene, no hace nada. */
async function addMissingLeader(ctx: CommandContext, a: ArcProps, nominal: number): Promise<void> {
  const info = a.thread!
  if (leaderOfArc(ctx.doc.entities, a)) {
    ctx.print(`Thread ${info.designation} is already dimensioned.`)
    return
  }
  const yes = await askKeyword(ctx, `Thread ${info.designation} has no dimension. Add dimension? [Yes/No] <Yes>: `, ['Yes', 'No'], 'Yes')
  if (yes === 'Yes') await placeLeader(ctx, ringArrow(a.center, vnorm(a.normal), nominal), info.designation)
}

/** Arco de rosca concéntrico a un círculo (la rosca que ya tiene). */
function threadArcOf(ctx: CommandContext, c: CircleEntity): ArcEntity | null {
  for (const e of ctx.doc.entities) {
    if (e.type !== 'ARC' || !e.props.thread) continue
    if (vdist(e.props.center, c.props.center) > 1e-6 * Math.max(1, c.props.radius)) continue
    if (Math.abs(Math.abs(vdot(vnorm(e.props.normal), vnorm(c.props.normal))) - 1) > 1e-6) continue
    if (e.props.radius > 0.6 * c.props.radius && e.props.radius < 1.5 * c.props.radius) return e
  }
  return null
}

async function thread2d(ctx: CommandContext, circle: CircleEntity): Promise<void> {
  const prev = threadArcOf(ctx, circle)
  if (prev) return addMissingLeader(ctx, prev.props, prev.props.thread!.internal ? prev.props.radius : circle.props.radius)
  const { center, radius } = circle.props
  const n = facing(ctx, circle.props.normal)
  const scale = annoScale(ctx)
  const dia = 2 * radius
  const isOut = (p: Pt) => vdist(inPlane(toVec3(p), center, n), center) > radius
  const guess = (internal: boolean) => nearestThreads(dia, internal)[closestIndex(nearestThreads(dia, internal), dia, internal)]
  const side = await ctx.getPoint('Specify point on side to thread (inside = shaft, outside = hole) or [Inside/Outside]: ', {
    keywords: ['Inside', 'Outside'],
    base: null,
    preview: (p) => arcPreview(threadArcFor(center, n, radius, guess(isOut(p)), isOut(p), scale)),
  })
  if (side.kind === 'cancel') return
  const internal = side.kind === 'keyword' ? side.keyword === 'Outside' : isOut(side.point)
  const spec = await chooseThread(ctx, dia, internal)
  if (!spec) return
  const props = threadArcFor(center, n, radius, spec, internal, scale)
  const arc = ctx.doc.addEntity({ type: 'ARC', layer: circle.layer, props, lineWeight: THREAD_LW })
  ctx.print(`Thread ${spec.designation} (${internal ? 'internal' : 'external'}) created.`)
  const yes = await askKeyword(ctx, 'Add dimension? [Yes/No] <Yes>: ', ['Yes', 'No'], 'Yes')
  if (yes === 'Yes' && arc) await placeLeader(ctx, ringArrow(center, n, internal ? props.radius : radius), spec.designation)
}

interface FaceHit {
  solid: SolidEntity
  cyl: CylFace
  point: Vec3
}

/** Cara de sólido bajo el punto: la cilíndrica, `'flat'` si no es cilíndrica, null si no hay cara. */
function faceHit(ctx: CommandContext, p: Pt): FaceHit | 'flat' | null {
  const ray = ctx.app.viewRay?.(p)
  const o: Vec3 = ray ? ray.origin : [p.x, p.y, p.z + 1e6]
  const d: Vec3 = ray ? ray.dir : [0, 0, -1]
  let best: { e: SolidEntity; face: number; t: number; point: Vec3 } | null = null
  for (const e of visibleEntities(ctx.doc)) {
    if (e.type !== 'SOLID3D') continue
    const topo = solidTopology(e.props)
    const h = topo ? rayFaces(topo, o, d)[0] : undefined
    if (h && (!best || h.t < best.t)) best = { e, face: h.face, t: h.t, point: h.point }
  }
  if (!best) return null
  const cyl = cylinderOfFace(solidTopology(best.e.props)!, best.face)
  return cyl ? { solid: best.e, cyl, point: best.point } : 'flat'
}

async function thread3d(ctx: CommandContext, hit: FaceHit): Promise<void> {
  const { solid, cyl, point } = hit
  const prev = solidThreads(solid.props).find((t) => threadOnFace(t, cyl))
  if (prev) {
    if (leaderOfSolidThread(ctx.doc.entities, prev)) return ctx.print(`Thread ${prev.info.designation} is already dimensioned.`)
    const yes = await askKeyword(ctx, `Thread ${prev.info.designation} has no dimension. Add dimension? [Yes/No] <Yes>: `, ['Yes', 'No'], 'Yes')
    if (yes === 'Yes') await placeLeader(ctx, () => threadSurfacePoint(prev, point), prev.info.designation)
    return
  }
  const internal = !cyl.shaft
  ctx.print(`Cylindrical face Ø${fmtThread(2 * cyl.radius)}, length ${fmtThread(vdist(cyl.a, cyl.b))} (${internal ? 'hole' : 'shaft'}).`)
  const spec = await chooseThread(ctx, 2 * cyl.radius, internal)
  if (!spec) return
  const t: SolidThread = solidThreadFor(cyl, spec)
  solid.props = { ...solid.props, threads: [...(solid.props.threads ?? []), t] }
  ctx.doc.touch()
  ctx.print(`Thread ${spec.designation} (${internal ? 'internal' : 'external'}) created.`)
  const yes = await askKeyword(ctx, 'Add dimension? [Yes/No] <Yes>: ', ['Yes', 'No'], 'Yes')
  if (yes === 'Yes') await placeLeader(ctx, () => threadSurfacePoint(t, point), spec.designation)
}

/** Arco de rosca de una vista de dibujo bajo el punto (en coordenadas de la hoja). */
function viewThreadArc(ins: Entity, blockEntities: Entity[], p: Pt): { arc: ArcProps; nominal: number } | null {
  if (ins.type !== 'INSERT') return null
  const s = ins.props.scale[0]
  const at = ins.props.position
  let best: { arc: ArcProps; nominal: number; d: number } | null = null
  for (const e of blockEntities) {
    if (e.type !== 'ARC' || !e.props.thread) continue
    const c: Vec3 = [at[0] + e.props.center[0] * s, at[1] + e.props.center[1] * s, at[2]]
    const arc: ArcProps = { ...e.props, center: c, radius: e.props.radius * s, normal: [0, 0, 1] }
    const d = Math.abs(Math.hypot(p.x - c[0], p.y - c[1]) - arc.radius)
    if (d < arc.radius && (!best || d < best.d)) best = { arc, nominal: nominalR(arc, s), d }
  }
  return best
}

/**
 * THREAD: representación de roscas según ISO 6410 / IRAM. Sobre un círculo, el arco fino de 3/4 adentro
 * (eje) o afuera (agujero), elegido como el lado de OFFSET; sobre la cara cilíndrica de un sólido, la textura
 * de rosca (eje o agujero según la cara). Ofrece la rosca más próxima de cada serie (métrica gruesa y fina,
 * Whitworth, BSP y trapezoidal) y la cota opcional con su designativo. Sobre una rosca ya hecha (también la
 * de una vista de dibujo), agrega la cota si le falta.
 */
export const threadCommand: Command = {
  name: 'THREAD',
  aliases: ['COSMETICTHREAD'],
  description: 'Cosmetic thread (ISO/IRAM): 3/4 arc on a circle or thread texture on a cylindrical face, nearest standard size and optional leader',
  async run(ctx) {
    for (;;) {
      const r = await ctx.getPoint('Select circle, thread or cylindrical face: ', { base: null })
      if (r.kind !== 'point') return
      const e = r.pick?.id ? ctx.doc.getEntity(r.pick.id) : undefined
      if (e?.type === 'ARC' && e.props.thread) {
        return addMissingLeader(ctx, e.props, e.props.thread.internal ? e.props.radius : nominalAround(ctx, e.props, e.props.thread.d / 2))
      }
      if (e?.type === 'CIRCLE') return thread2d(ctx, e)
      if (isDrawingView(e)) {
        const hit = viewThreadArc(e, ctx.doc.blocks.find((b) => b.name === e.props.name)?.entities ?? [], r.point)
        if (hit) return addMissingLeader(ctx, hit.arc, hit.nominal)
      }
      const f = faceHit(ctx, r.point)
      if (f && f !== 'flat') return thread3d(ctx, f)
      ctx.print(f === 'flat' ? 'The face must be cylindrical.' : 'Select a circle, a thread or a cylindrical face of a solid.')
    }
  },
}

/** Radio nominal de una rosca exterior 2D: el del círculo concéntrico (si está), si no el de la tabla. */
function nominalAround(ctx: CommandContext, a: ArcProps, fallback: number): number {
  const n = vnorm(a.normal)
  let best = fallback
  for (const e of ctx.doc.entities) {
    if (e.type !== 'CIRCLE' || vdist(e.props.center, a.center) > 1e-6 * Math.max(1, a.radius)) continue
    if (Math.abs(Math.abs(vdot(vnorm(e.props.normal), n)) - 1) > 1e-6) continue
    if (e.props.radius > a.radius && e.props.radius < 1.6 * a.radius) best = e.props.radius
  }
  return best
}
