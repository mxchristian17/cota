import type { Vec3 } from '../math'
import { Curve, GEPS, PEPS, dist2, primFitParam, primPoint, primRawParam, primSub, primTangent, splineCurve, type Prim } from '../geom/curve'
import { selfIntersections, shapeIntersections } from '../geom/intersect'

/**
 * OFFSET en 2D: paralela a una curva a distancia `d`. Línea → paralela; arco/círculo →
 * radio ± d; elipse y spline → spline por puntos desplazados (como el CAD clásico); polilínea → tramos
 * desplazados unidos según `OFFSETGAPTYPE` y **poda de los bucles invertidos**: la curva bruta se
 * parte en sus autointersecciones y se descartan los trozos que quedan a menos de |d| del original.
 */

/** OFFSETGAPTYPE: 0 = prolongar hasta cortarse, 1 = arco (esquina redondeada), 2 = chaflán. */
export type GapType = 0 | 1 | 2

const left = (t: Vec3): Vec3 => [-t[1], t[0], 0]
const addS = (p: Vec3, v: Vec3, s: number): Vec3 => [p[0] + v[0] * s, p[1] + v[1] * s, p[2] + v[2] * s]
const cross2 = (a: Vec3, b: Vec3): number => a[0] * b[1] - a[1] * b[0]
const dot2 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1]

/** Primitiva desplazada `d` hacia la izquierda de su sentido de avance; null si degenera. */
export function offsetPrim(p: Prim, d: number): Prim | null {
  if (p.k === 'L') {
    if (dist2(p.a, p.b) < GEPS) return null
    const n = left(primTangent(p, 0))
    return { k: 'L', a: addS(p.a, n, d), b: addS(p.b, n, d) }
  }
  if (p.k === 'A') {
    const r = p.r - d * Math.sign(p.sw)
    return r > GEPS ? { ...p, r } : null
  }
  return null
}

/** Arco de centro `c` desde `from` hasta `to`, en el sentido indicado. */
function arcAround(c: Vec3, from: Vec3, to: Vec3, ccw: boolean): Prim {
  const a0 = Math.atan2(from[1] - c[1], from[0] - c[0])
  let sw = Math.atan2(to[1] - c[1], to[0] - c[0]) - a0
  if (ccw) while (sw <= 0) sw += 2 * Math.PI
  else while (sw >= 0) sw -= 2 * Math.PI
  return { k: 'A', c: [c[0], c[1], from[2]], r: dist2(c, from), a0, sw }
}

/** Intersección de las formas completas de P y Q más cercana a `v`. */
function nearestHit(P: Prim, Q: Prim, v: Vec3): Vec3 | null {
  let best: Vec3 | null = null
  let bd = Infinity
  for (const h of shapeIntersections(P, Q)) {
    const x: Vec3 = [h.x, h.y, v[2]]
    const dd = dist2(x, v)
    if (dd < bd) {
      bd = dd
      best = x
    }
  }
  return best
}

interface Joined {
  P: Prim
  mid: Prim[]
  Q: Prim
}

/** Une el final de P con el inicio de Q (desplazadas de dos tramos que se encuentran en `v`). */
function joinPrims(P: Prim, Q: Prim, v: Vec3, d: number, gap: GapType): Joined {
  const pe = primPoint(P, 1)
  const qs = primPoint(Q, 0)
  if (dist2(pe, qs) < GEPS * Math.max(1, Math.abs(d))) return { P, mid: [], Q }
  const tP = primTangent(P, 1)
  const tQ = primTangent(Q, 0)
  const cr = cross2(tP, tQ)
  const cusp = Math.abs(cr) < 1e-12
  const convex = cr * d < 0 || cusp
  const X = cusp ? null : nearestHit(P, Q, v)
  if (!convex) {
    // Esquina cóncava: los tramos se solapan → se recortan en su intersección.
    const sP = X ? primFitParam(P, primRawParam(P, X), false, false) : null
    const sQ = X ? primFitParam(Q, primRawParam(Q, X), false, false) : null
    if (sP !== null && sQ !== null && sP > PEPS && sQ < 1 - PEPS) return { P: primSub(P, 0, sP), mid: [], Q: primSub(Q, sQ, 1) }
    return { P, mid: [{ k: 'L', a: pe, b: qs }], Q } // el bucle que queda se poda después
  }
  if (gap === 0 && X) {
    const sP = primFitParam(P, primRawParam(P, X), false, true)
    const sQ = primFitParam(Q, primRawParam(Q, X), true, false)
    if (sP !== null && sQ !== null && sP >= 1 - PEPS && sQ <= PEPS) return { P: primSub(P, 0, sP), mid: [], Q: primSub(Q, sQ, 1) }
  }
  if (gap === 2 && !cusp) {
    const e = Math.abs(d) * Math.tan(Math.abs(Math.atan2(cr, dot2(tP, tQ))) / 4)
    const pe2 = addS(pe, tP, e)
    const qs2 = addS(qs, tQ, -e)
    const mid: Prim[] = []
    let P2 = P
    let Q2 = Q
    if (P.k === 'L') P2 = { k: 'L', a: P.a, b: pe2 }
    else mid.push({ k: 'L', a: pe, b: pe2 })
    mid.push({ k: 'L', a: pe2, b: qs2 })
    if (Q.k === 'L') Q2 = { k: 'L', a: qs2, b: Q.b }
    else mid.push({ k: 'L', a: qs2, b: qs })
    return { P: P2, mid, Q: Q2 }
  }
  // Esquina redondeada (OFFSETGAPTYPE=1, o respaldo): arco centrado en el vértice original.
  return { P, mid: [arcAround(v, pe, qs, d < 0)], Q }
}

/** Elipses y splines: spline por puntos desplazados sobre la normal. */
function offsetSampled(c: Curve, d: number): Curve | null {
  const ts: number[] = []
  if (c.kind === 'SPLINE') {
    for (let t = 0; t < c.n; t += 4) ts.push(t)
  } else {
    for (let i = 0; i < c.n; i++) {
      const p = c.prims[i]
      const N = p.k === 'E' ? Math.max(8, Math.ceil((48 * Math.abs(p.sw)) / (2 * Math.PI))) : 1
      for (let j = 0; j < N; j++) ts.push(i + j / N)
    }
  }
  ts.push(c.n)
  const pts = ts.map((t) => addS(c.pointAt(t), left(c.tangentAt(t)), d))
  if (c.closed) pts[pts.length - 1] = pts[0]
  return splineCurve(pts)
}

/** Curva bruta: tramos desplazados y unidos (puede tener bucles). */
function rawOffset(c: Curve, d: number, gap: GapType): Curve | null {
  const offs: Array<{ o: Prim; i: number }> = []
  c.prims.forEach((p, i) => {
    const o = offsetPrim(p, d)
    if (o) offs.push({ o, i })
  })
  const m = offs.length
  if (!m) return null
  const cur = offs.map((x) => x.o)
  const mids: Prim[][] = offs.map(() => [])
  const joins = c.closed ? m : m - 1
  for (let j = 0; j < joins; j++) {
    const k = (j + 1) % m
    if (c.closed && m === 1) break
    const a = offs[j].i
    const b = offs[k].i
    const v = primPoint(c.prims[a], 1)
    const contiguous = b === (a + 1) % c.n
    if (!contiguous) {
      mids[j] = [{ k: 'L', a: primPoint(cur[j], 1), b: primPoint(cur[k], 0) }]
      continue
    }
    const r = joinPrims(cur[j], cur[k], v, d, gap)
    cur[j] = r.P
    cur[k] = r.Q
    mids[j] = r.mid
  }
  const prims: Prim[] = []
  for (let j = 0; j < m; j++) prims.push(cur[j], ...mids[j])
  return new Curve(c.kind, prims, c.closed)
}

/** Encadena trozos consecutivos cuyos extremos coinciden. */
function chain(pieces: Curve[], kind: Curve['kind'], closed: boolean, tol: number): Curve[] {
  const chains: Prim[][] = []
  const endOf = (ps: Prim[]): Vec3 => primPoint(ps[ps.length - 1], 1)
  for (const p of pieces) {
    const last = chains[chains.length - 1]
    if (last && dist2(endOf(last), p.start) < tol) last.push(...p.prims)
    else chains.push([...p.prims])
  }
  if (closed && chains.length > 1 && dist2(endOf(chains[chains.length - 1]), primPoint(chains[0][0], 0)) < tol) {
    const last = chains.pop() as Prim[]
    chains[0] = [...last, ...chains[0]]
  }
  return chains.map((ps) => new Curve(kind, ps, closed && dist2(endOf(ps), primPoint(ps[0], 0)) < tol))
}

/**
 * Paralelas de `c` a distancia firmada `d` (d > 0 = a la izquierda del sentido de avance). Puede
 * devolver varias curvas (la poda separa partes) o ninguna (el desplazamiento colapsa la curva).
 */
export function offsetCurve(c: Curve, d: number, gap: GapType = 0): Curve[] {
  if (Math.abs(d) < GEPS) return []
  if (c.kind === 'SPLINE' || c.prims.some((p) => p.k === 'E')) {
    const s = offsetSampled(c, d)
    return s ? [s] : []
  }
  const raw = rawOffset(c, d, gap)
  if (!raw) return []
  const tol = 1e-6 * Math.max(1, Math.abs(d))
  const cuts = selfIntersections(raw).flat()
  for (let i = raw.closed ? 0 : 1; i < raw.n; i++) cuts.push(i)
  const valid = raw.split(cuts).filter((p) => c.distanceTo(p.pointAt(p.n / 2)) >= Math.abs(d) - tol)
  return chain(valid, c.kind, raw.closed, tol)
}

/** Punto dentro de una curva cerrada (par/impar sobre su muestreo). */
function insideClosed(c: Curve, p: Vec3): boolean {
  const pts = c.samples(32)
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Lado de `c` donde cae `p`: +1 = izquierda del sentido de avance (signo de `d` en `offsetCurve`). */
export function offsetSide(c: Curve, p: Vec3): 1 | -1 {
  if (c.closed) return insideClosed(c, p) === c.signedArea() > 0 ? 1 : -1
  const t = c.paramAt(p)
  const q = c.pointAt(t)
  return cross2(c.tangentAt(t), [p[0] - q[0], p[1] - q[1], 0]) >= 0 ? 1 : -1
}
