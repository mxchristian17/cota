import { viewZ } from './primitives'
import { fromVec3, toVec3, type Pt, type Vec3 } from '../../math'
import type { PreviewShape } from '../../preview'
import { circleFrom3Points, solveCircle, tanObjectOf, type TanObject } from '../../geom/tangency'
import type { Command, CommandContext, PointResult } from '../types'
import { askDistance } from '../ask'
import { recall, remember } from '../memory'

/**
 * Normal del plano de dibujo: la Z de la vista hacia el observador (TOP → +Z, FRONT → −Y…). El círculo
 * se dibuja en el plano que se está mirando, como con la UCS de la vista en el CAD clásico.
 */
let plane: Vec3 = [0, 0, 1]
const flatXY = () => plane[2] > 1 - 1e-9
const circlePreview = (c: Pt, r: number): PreviewShape[] => (r > 1e-9 ? [{ kind: 'circle', center: c, radius: r, normal: plane }] : [])

/** Distancia medida en el plano de dibujo (sin la componente de profundidad). */
function planeDist(a: Pt, b: Pt): number {
  const d = [b.x - a.x, b.y - a.y, b.z - a.z]
  const k = d[0] * plane[0] + d[1] * plane[1] + d[2] * plane[2]
  return Math.hypot(d[0] - k * plane[0], d[1] - k * plane[1], d[2] - k * plane[2])
}

function addCircle(ctx: CommandContext, c: Vec3, r: number): void {
  ctx.doc.addEntity({ type: 'CIRCLE', layer: ctx.currentLayerId(), props: { center: c, radius: r, normal: [...plane] as Vec3 } })
  remember('CIRCLERAD', r) // como el CAD clásico: cualquier círculo nuevo fija CIRCLERAD
}

/** Círculo por tres puntos en 3D (en su propio plano). */
function circle3D(a: Vec3, b: Vec3, c: Vec3): { c: Vec3; r: number } | null {
  const sub = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]]
  const dot = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2]
  const cross = (p: Vec3, q: Vec3): Vec3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]
  const u = sub(b, a)
  const v = sub(c, a)
  const w = cross(u, v)
  const ww = dot(w, w)
  if (ww < 1e-18) return null
  // Circuncentro: a + (|u|²(v×w) + |v|²(w×u)) / (2|w|²)
  const t1 = cross(v, w).map((x) => x * dot(u, u)) as Vec3
  const t2 = cross(w, u).map((x) => x * dot(v, v)) as Vec3
  const center: Vec3 = [a[0] + (t1[0] + t2[0]) / (2 * ww), a[1] + (t1[1] + t2[1]) / (2 * ww), a[2] + (t1[2] + t2[2]) / (2 * ww)]
  return { c: center, r: Math.hypot(...sub(a, center)) }
}

/** Restricción de un punto de `3P`: un punto, o una tangente si el clic fue una tangente diferida. */
function constraintOf(r: Extract<PointResult, { kind: 'point' }>): { obj: TanObject; hint: Vec3 } {
  const d = r.pick?.deferred
  if (d && d.kind === 'tangent') return { obj: d.obj, hint: d.hint }
  return { obj: { kind: 'point', p: toVec3(r.point) }, hint: toVec3(r.point) }
}

function solveFrom(cons: Array<{ obj: TanObject; hint: Vec3 }>, fixedR?: number): { c: Vec3; r: number } | null {
  if (fixedR === undefined && cons.every((x) => x.obj.kind === 'point')) {
    const [a, b, c] = cons.map((x) => (x.obj as { p: Vec3 }).p)
    return flatXY() ? circleFrom3Points(a, b, c) : circle3D(a, b, c)
  }
  if (!flatXY()) return null // tangentes: sólo en el plano XY (vista en planta)
  return solveCircle(
    cons.map((x) => x.obj),
    cons.map((x) => x.hint),
    fixedR,
  )
}

/** 3P: tres puntos sobre el círculo; cualquiera puede ser una tangente (TAN) → *Tan, Tan, Tan*. */
async function threePoints(ctx: CommandContext): Promise<void> {
  const cons: Array<{ obj: TanObject; hint: Vec3 }> = []
  const prompts = ['Specify first point on circle: ', 'Specify second point on circle: ', 'Specify third point on circle: ']
  for (const [i, prompt] of prompts.entries()) {
    const r = await ctx.getPoint(prompt, {
      base: null, // sin base: TAN se ofrece como tangente diferida sobre cualquier curva
      preview: (cur) => {
        if (i < 2) return i === 1 ? [{ kind: 'line', a: fromVec3(cons[0].hint), b: cur }] : []
        const sol = solveFrom([...cons, { obj: { kind: 'point', p: toVec3(cur) }, hint: toVec3(cur) }])
        return sol ? circlePreview(fromVec3(sol.c), sol.r) : []
      },
    })
    if (r.kind !== 'point') return
    cons.push(constraintOf(r))
  }
  const sol = solveFrom(cons)
  if (!sol) return ctx.print('Circle does not exist.')
  addCircle(ctx, sol.c, sol.r)
}

/** 2P: los extremos de un diámetro. */
async function twoPoints(ctx: CommandContext): Promise<void> {
  const a = await ctx.getPoint("Specify first end point of circle's diameter: ")
  if (a.kind !== 'point') return
  const mid = (p: Pt): Pt => ({ x: (a.point.x + p.x) / 2, y: (a.point.y + p.y) / 2, z: flatXY() ? a.point.z : (a.point.z + p.z) / 2 })
  const b = await ctx.getPoint("Specify second end point of circle's diameter: ", {
    base: a.point,
    preview: (cur) => circlePreview(mid(cur), planeDist(a.point, cur) / 2),
  })
  if (b.kind !== 'point') return
  const r = planeDist(a.point, b.point) / 2
  if (!(r > 0)) return ctx.print('Invalid diameter.')
  addCircle(ctx, toVec3(mid(b.point)), r)
}

/** Objeto tangente bajo el clic (línea, círculo, arco, tramo de polilínea o lado de rectángulo). */
async function pickTangent(ctx: CommandContext, prompt: string): Promise<{ obj: TanObject; hint: Vec3 } | null> {
  for (;;) {
    const r = await ctx.getPoint(prompt, { base: null })
    if (r.kind !== 'point') return null
    const hint = toVec3(r.point)
    const deferred = r.pick?.deferred
    if (deferred) return { obj: deferred.obj, hint }
    const e = r.pick?.id ? ctx.doc.getEntity(r.pick.id) : undefined
    const obj = e ? tanObjectOf(e, hint) : null
    if (obj) return { obj, hint }
    ctx.print('Select a line, circle, arc or polyline.')
  }
}

/** Ttr: tangente a dos objetos con un radio (el más cercano a los puntos marcados). */
async function tanTanRadius(ctx: CommandContext): Promise<void> {
  const t1 = await pickTangent(ctx, 'Specify point on object for first tangent of circle: ')
  if (!t1) return
  const t2 = await pickTangent(ctx, 'Specify point on object for second tangent of circle: ')
  if (!t2) return
  const r = await askDistance(ctx, 'CIRCLERAD', 'Specify radius of circle', { base: fromVec3(t2.hint), valid: (v) => v > 0 })
  if (r.kind !== 'distance' || !(r.value > 0)) return
  const sol = solveFrom([t1, t2], r.value)
  if (!sol) return ctx.print('Circle does not exist.')
  addCircle(ctx, sol.c, sol.r)
}

/**
 * CIRCLE: todos los modos del CAD clásico — centro + radio (`CIRCLERAD`, Enter repite) o
 * `Diameter`, `3P` (puntos o tangentes: *Tan, Tan, Tan*), `2P` y `Ttr` (tangente, tangente, radio).
 */
export const circleCommand: Command = {
  name: 'CIRCLE',
  planar: true,
  aliases: ['C'],
  description: 'Draw a circle: center + radius/Diameter, 3P (points or tangents), 2P or Ttr (tan tan radius)',
  async run(ctx) {
    plane = viewZ(ctx)
    const first = await ctx.getPoint('Specify center point for circle or [3P/2P/Ttr (tan tan radius)]: ', {
      keywords: ['3P', '2P', 'Ttr'],
    })
    if (first.kind === 'cancel') return
    if (first.kind === 'keyword') {
      if (first.keyword === '3P') return threePoints(ctx)
      if (first.keyword === '2P') return twoPoints(ctx)
      if (!flatXY()) return ctx.print('Ttr works in a plan view (TOP); use 3P or a center and radius in this view.')
      return tanTanRadius(ctx)
    }
    const center = first.point
    // CIRCLERAD: el último radio usado, como en el CAD clásico (Enter lo repite).
    const radius = await askDistance(ctx, 'CIRCLERAD', 'Specify radius of circle or [Diameter]', {
      base: center,
      keywords: ['Diameter'],
      valid: (v) => v > 0,
      preview: (cursor) => circlePreview(center, planeDist(center, cursor)),
    })
    if (radius.kind === 'cancel') return
    let r: number
    if (radius.kind === 'keyword') {
      const last = recall('CIRCLERAD')
      const d = await askDistance(ctx, 'CIRCLE.diameter', 'Specify diameter of circle', {
        base: center,
        initial: last !== undefined ? 2 * last : undefined,
        store: { get: () => (recall('CIRCLERAD') !== undefined ? 2 * (recall('CIRCLERAD') as number) : undefined), set: () => {} },
        valid: (v) => v > 0,
        preview: (cursor) => circlePreview(center, planeDist(center, cursor) / 2),
      })
      if (d.kind !== 'distance') return
      r = d.value / 2
    } else r = radius.value
    if (!(r > 0)) {
      ctx.print('Invalid radius.')
      return
    }
    addCircle(ctx, toVec3(center), r)
  },
}
