import type { Vec3 } from '../math'
import { catmullRomBezier } from './curve'

/**
 * B-splines y NURBS del formato DXF.
 *
 * La SPLINE de Cota es una curva que **pasa** por sus puntos (Catmull-Rom centrípeta, ver `catmullRomPoint`). Una
 * SPLINE de DXF trae, en cambio, **puntos de control** con su vector de nudos (y pesos si es racional): la curva no
 * pasa por ellos. Al importar se evalúa la curva real y se guardan puntos de paso densos; al exportar, cada tramo de
 * la Catmull-Rom se escribe como su Bézier cúbica exacta.
 */
export interface NurbsDef {
  degree: number
  controlPoints: Vec3[]
  knots: number[]
  /** Pesos (uno por punto de control); sin pesos, la curva no es racional. */
  weights?: number[]
}

/** Vector de nudos válido para `nCp` puntos de grado `degree`: cantidad justa, finito, no decreciente, dominio no vacío. */
export function validKnots(degree: number, nCp: number, knots: number[]): boolean {
  if (knots.length !== nCp + degree + 1 || !knots.every((k) => Number.isFinite(k))) return false
  for (let i = 1; i < knots.length; i++) if (knots[i] < knots[i - 1]) return false
  return knots[degree] < knots[nCp]
}

/** Nudos uniformes con los extremos fijos (la curva empieza y termina en el primer y el último punto de control). */
export function clampedUniformKnots(degree: number, nCp: number): number[] {
  const inner = nCp - degree
  const out: number[] = []
  for (let i = 0; i <= degree; i++) out.push(0)
  for (let i = 1; i < inner; i++) out.push(i / inner)
  for (let i = 0; i <= degree; i++) out.push(1)
  return out
}

/** Tramo de nudos `k` (degree ≤ k < nCp) que contiene a `u` (el último no vacío para el extremo final). */
function findSpan(n: NurbsDef, u: number): number {
  const { degree: p, knots: U } = n
  const last = n.controlPoints.length - 1
  if (u >= U[last + 1]) {
    let k = last
    while (k > p && U[k] >= U[k + 1]) k--
    return k
  }
  let k = p
  while (k < last && U[k + 1] <= u) k++
  return k
}

/** Punto de la curva en el parámetro `u` (algoritmo de de Boor, en coordenadas homogéneas si hay pesos). */
export function nurbsPoint(n: NurbsDef, u: number): Vec3 {
  const { degree: p, knots: U, controlPoints: P, weights: W } = n
  const k = findSpan(n, u)
  const d: number[][] = []
  for (let j = 0; j <= p; j++) {
    const q = P[k - p + j]
    const w = W ? W[k - p + j] : 1
    d.push([q[0] * w, q[1] * w, q[2] * w, w])
  }
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const i = k - p + j
      const den = U[i + p - r + 1] - U[i]
      const a = den > 0 ? (u - U[i]) / den : 0
      for (let c = 0; c < 4; c++) d[j][c] = (1 - a) * d[j - 1][c] + a * d[j][c]
    }
  }
  const h = d[p]
  const w = h[3] !== 0 ? h[3] : 1
  return [h[0] / w, h[1] / w, h[2] / w]
}

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** Distancia de `q` a la recta `a`–`b` (a `a` si el tramo es nulo). */
function offLine(q: Vec3, a: Vec3, b: Vec3): number {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const len = Math.hypot(...ab)
  if (len < 1e-12) return dist(q, a)
  const aq: Vec3 = [q[0] - a[0], q[1] - a[1], q[2] - a[2]]
  const cx = aq[1] * ab[2] - aq[2] * ab[1]
  const cy = aq[2] * ab[0] - aq[0] * ab[2]
  const cz = aq[0] * ab[1] - aq[1] * ab[0]
  return Math.hypot(cx, cy, cz) / len
}

/** Subdivisiones mínimas (2^MIN_DEPTH) y máximas (2^MAX_DEPTH) de cada tramo de nudos al muestrear. */
const MIN_DEPTH = 2
const MAX_DEPTH = 7

/**
 * Puntos de paso de la curva: cada tramo de nudos no vacío se subdivide hasta que la cuerda se aparta de la curva
 * menos de `tol` (en 1/4, 1/2 y 3/4 de cada sub-tramo). La Catmull-Rom de Cota por estos puntos queda mucho más cerca
 * que la cuerda.
 */
export function nurbsSamples(n: NurbsDef, tol: number): Vec3[] {
  const { degree: p, knots: U } = n
  const out: Vec3[] = []
  const push = (q: Vec3) => {
    if (!out.length || dist(out[out.length - 1], q) > 1e-12) out.push(q)
  }
  const refine = (a: number, pa: Vec3, b: number, pb: Vec3, depth: number) => {
    const at = (f: number) => nurbsPoint(n, a + (b - a) * f)
    const m = at(0.5)
    const far = depth < MIN_DEPTH || (depth < MAX_DEPTH && Math.max(offLine(at(0.25), pa, pb), offLine(m, pa, pb), offLine(at(0.75), pa, pb)) > tol)
    if (!far) return push(pb)
    const um = (a + b) / 2
    refine(a, pa, um, m, depth + 1)
    refine(um, m, b, pb, depth + 1)
  }
  const nCp = n.controlPoints.length
  for (let k = p; k < nCp; k++) {
    if (U[k + 1] <= U[k]) continue
    const pa = nurbsPoint(n, U[k])
    push(pa)
    refine(U[k], pa, U[k + 1], nurbsPoint(n, U[k + 1]), 0)
  }
  return out
}

/**
 * Si la B-spline es exactamente la Catmull-Rom de Cota escrita como Béziers encadenadas (lo que escribe
 * `catmullRomBezierSpline`), sus puntos de paso; si no, `null`. Así guardar y reabrir un DXF no multiplica los puntos.
 */
export function catmullRomFromBezierSpline(n: NurbsDef): Vec3[] | null {
  const { degree, controlPoints: P, knots: U, weights: W } = n
  if (degree !== 3 || P.length < 4 || (P.length - 1) % 3 !== 0) return null
  if (W && W.some((w) => Math.abs(w - 1) > 1e-12)) return null
  const segs = (P.length - 1) / 3
  // Nudos: 4 iguales, luego cada unión 3 veces (estrictamente creciente entre uniones), 4 iguales al final.
  const values: number[] = []
  for (let i = 0; i < U.length; ) {
    let j = i
    while (j < U.length && U[j] === U[i]) j++
    const mult = j - i
    const edge = i === 0 || j === U.length
    if (mult !== (edge ? 4 : 3)) return null
    values.push(U[i])
    i = j
  }
  if (values.length !== segs + 1) return null
  const joints = Array.from({ length: segs + 1 }, (_, i) => P[3 * i])
  let scale = 0
  for (const q of P) scale = Math.max(scale, Math.abs(q[0]), Math.abs(q[1]), Math.abs(q[2]))
  const tol = 1e-9 * Math.max(1, scale)
  for (let i = 0; i < segs; i++) {
    const [, b1, b2] = catmullRomBezier(joints, i)
    if (dist(b1, P[3 * i + 1]) > tol || dist(b2, P[3 * i + 2]) > tol) return null
  }
  return joints
}

/** La Catmull-Rom de Cota por `pts` como B-spline cúbica exacta: una Bézier por tramo (nudos 0000 111 … nnnn). */
export function catmullRomBezierSpline(pts: Vec3[]): { controlPoints: Vec3[]; knots: number[] } {
  const segs = pts.length - 1
  const controlPoints: Vec3[] = [pts[0]]
  for (let i = 0; i < segs; i++) {
    const [, b1, b2, b3] = catmullRomBezier(pts, i)
    controlPoints.push(b1, b2, b3)
  }
  const knots = [0, 0, 0, 0]
  for (let i = 1; i < segs; i++) knots.push(i, i, i)
  knots.push(segs, segs, segs, segs)
  return { controlPoints, knots }
}

/**
 * Puntos de paso de una SPLINE de DXF para la SPLINE de Cota:
 * - `null` si no trae nudos (DXF que Cota escribía hasta la 2.49.3: sus puntos ya son de paso);
 * - `'polyline'` si es de grado 1 (sus puntos de control son los vértices);
 * - si no, la curva real muestreada (o los puntos de paso originales si la escribió Cota).
 * Nudos de cantidad inválida se reemplazan por uniformes con extremos fijos; pesos inválidos se ignoran.
 */
export function dxfSplineThroughPoints(degree: number, controlPoints: Vec3[], knots: number[], weights: number[]): Vec3[] | 'polyline' | null {
  if (!knots.length || controlPoints.length < 2 || !Number.isFinite(degree) || degree < 1) return null
  if (Math.round(degree) === 1) return 'polyline'
  const p = Math.min(Math.round(degree), controlPoints.length - 1)
  if (p === 1) return 'polyline'
  const U = validKnots(p, controlPoints.length, knots) ? knots : clampedUniformKnots(p, controlPoints.length)
  const W = weights.length === controlPoints.length && weights.every((w) => Number.isFinite(w) && w > 0) ? weights : undefined
  const def: NurbsDef = { degree: p, controlPoints, knots: U, weights: W }
  const own = catmullRomFromBezierSpline(def)
  if (own) return own
  // Tolerancia de cuerda relativa al tamaño del polígono de control.
  const lo: Vec3 = [Infinity, Infinity, Infinity]
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const q of controlPoints) {
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], q[i])
      hi[i] = Math.max(hi[i], q[i])
    }
  }
  const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
  const pts = nurbsSamples(def, Math.max(diag * 5e-5, 1e-9))
  return pts.length >= 2 ? pts : null
}
