import type { Vec3 } from '../math'
import { GEPS, dist2, primPoint, primRawParam, primTangent } from '../geom/curve'
import { shapeIntersections } from '../geom/intersect'
import { checkKeeps, cross2, deflection, dot2, fitSide, makePair, type CornerResult, type VertexRule } from './fillet'
import type { CurvePick } from './pickCurve'

/**
 * CHAMFER. Sólo tramos rectos (líneas y segmentos rectos de polilínea/rectángulo), como
 * el CAD clásico. Las distancias se miden desde la intersección —real o prolongada— de las dos rectas;
 * `Dist1` (o la longitud del método Angle) va sobre el **primer** objeto elegido.
 */

export type ChamferSpec =
  | { method: 'Distance'; d1: number; d2: number }
  /** `angle` en radianes, medido desde la primera recta. */
  | { method: 'Angle'; length: number; angle: number }

/** Distancias sobre la primera y la segunda recta para un ángulo interior `alpha`; null si no cabe. */
export function chamferDistances(spec: ChamferSpec, alpha: number): [number, number] | null {
  if (spec.method === 'Distance') return [spec.d1, spec.d2]
  const th = spec.angle
  if (th <= 0 || th + alpha >= Math.PI - 1e-12) return null
  return [spec.length, (spec.length * Math.sin(th)) / Math.sin(th + alpha)]
}

const CHAMFERABLE = new Set(['LINE', 'POLYLINE', 'RECTANGLE'])

const scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, 0]
const addS = (p: Vec3, v: Vec3, s: number): Vec3 => [p[0] + v[0] * s, p[1] + v[1] * s, p[2] + v[2] * s]

/** Chaflán entre dos picks (distancias 0 = esquina viva). */
export function chamferCorner(a: CurvePick, b: CurvePick, spec: ChamferSpec): CornerResult {
  if (![a, b].every((k) => CHAMFERABLE.has(k.curve.kind))) return { error: 'notLine' }
  const pr = makePair(a, b)
  if ('error' in pr) return pr
  const { A, B, same } = pr
  const [i, j] = [A.prims[0], B.prims[0]]
  const p = A.pick.curve.prims[i]
  const q = B.pick.curve.prims[j]
  if (p.k !== 'L' || q.k !== 'L') return { error: 'notLine' }
  if (dist2(p.a, p.b) < GEPS || dist2(q.a, q.b) < GEPS) return { error: 'parallel' }
  const up = primTangent(p, 0)
  const uq = primTangent(q, 0)
  const [hit] = shapeIntersections(p, q)
  if (!hit || Math.abs(cross2(up, uq)) < 1e-9) return { error: 'parallel' }
  const x: Vec3 = [hit.x, hit.y, p.a[2]]
  // Dirección, desde la esquina, hacia el lado que se conserva de cada recta.
  const side = (u: Vec3, at: Vec3, fixed: number): Vec3 => {
    const s = same ? fixed : Math.sign(dot2([at[0] - x[0], at[1] - x[1], 0], u)) || 1
    return scale(u, s)
  }
  const w1 = side(up, A.pick.at, -1)
  const w2 = side(uq, B.pick.at, 1)
  const d = chamferDistances(spec, Math.acos(Math.max(-1, Math.min(1, dot2(w1, w2)))))
  if (!d) return { error: 'tooLarge' }
  const p1 = addS(x, w1, d[0])
  const p2 = addS(x, w2, d[1])
  const s1 = fitSide(A, i, primRawParam(p, p1))
  const s2 = fitSide(B, j, primRawParam(q, p2))
  if (s1 === null || s2 === null) return { error: 'tooLarge' }
  const e1 = primPoint(p, s1)
  const e2 = primPoint(q, s2)
  return checkKeeps({
    a: A.pick,
    b: B.pick,
    i1: i,
    s1,
    i2: j,
    s2,
    fwd1: dot2(w1, up) < 0,
    fwd2: dot2(w2, uq) > 0,
    link: dist2(e1, e2) > GEPS ? { k: 'L', a: e1, b: e2 } : null,
  })
}

/** Regla de CHAMFER ▸ Polyline: `Dist1`/longitud sobre el tramo entrante de cada vértice. */
export function chamferVertex(spec: ChamferSpec): VertexRule {
  return (uIn, uOut) => {
    const def = deflection(uIn, uOut)
    if (def === null) return null
    const d = chamferDistances(spec, Math.PI - Math.abs(def))
    if (!d) return { d1: Infinity, d2: Infinity, link: (p1, p2) => ({ k: 'L', a: p1, b: p2 }) }
    if (d[0] <= GEPS && d[1] <= GEPS) return null
    return { d1: d[0], d2: d[1], link: (p1, p2) => ({ k: 'L', a: p1, b: p2 }) }
  }
}
