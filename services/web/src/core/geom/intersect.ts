import type { Vec3 } from '../math'
import {
  boxesOverlap,
  dist2,
  primBox,
  primFitParam,
  primPoint,
  primRawParam,
  PEPS,
  type Curve,
  type Prim,
} from './curve'

/**
 * Motor de intersecciones exacto en XY.
 *
 * Reemplaza el cruce de contornos tesselados por soluciones analíticas por par de primitivas:
 * recta–recta (determinante), recta–círculo (cuadrática), círculo–círculo (eje radical) y
 * recta–elipse (transformación afín al círculo unidad). Los pares con elipse y círculo/elipse —que
 * llevan a una cuártica— se resuelven por subdivisión + bisección sobre la función implícita, con
 * detección de tangencias.
 *
 * Cada primitiva se interseca como su **forma completa** (recta infinita, círculo, elipse) y después
 * se filtra por el rango de parámetros admitido, lo que da gratis el modo **extendido** (curvas
 * prolongadas) que usan `TRIM ▸ Edge=Extend`, `EXTEND`, `FILLET` y `CHAMFER`.
 */

export interface CurveHit {
  point: Vec3
  /** Parámetro sobre la primera curva (fuera de [0, n] si cae en su prolongación). */
  t1: number
  /** Parámetro sobre la segunda curva. */
  t2: number
  /** Contacto tangente (raíz doble). */
  tangent: boolean
}

/** Qué extremos de una curva abierta se pueden prolongar. */
export interface ExtendSpec {
  start: boolean
  end: boolean
}

type Hit2 = { x: number; y: number; tangent: boolean }

const REL = 1e-9
const TAU_PRIM = Math.PI * 2

function lineLine(a: Vec3, b: Vec3, c: Vec3, d: Vec3): Hit2[] {
  const rx = b[0] - a[0]
  const ry = b[1] - a[1]
  const sx = d[0] - c[0]
  const sy = d[1] - c[1]
  const den = rx * sy - ry * sx
  if (Math.abs(den) <= 1e-12 * Math.hypot(rx, ry) * Math.hypot(sx, sy)) return [] // paralelas/colineales
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den
  return [{ x: a[0] + t * rx, y: a[1] + t * ry, tangent: false }]
}

/** Recta (infinita) por a→b contra el círculo (cx, cy, r). */
function lineCircle(a: Vec3, b: Vec3, cx: number, cy: number, r: number): Hit2[] {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L = Math.hypot(dx, dy)
  if (L < 1e-15) return []
  const ux = dx / L
  const uy = dy / L
  // Pie de la perpendicular desde el centro y distancia a la recta.
  const along = (cx - a[0]) * ux + (cy - a[1]) * uy
  const fx = a[0] + along * ux
  const fy = a[1] + along * uy
  const h = Math.hypot(cx - fx, cy - fy)
  const tol = REL * Math.max(r, 1)
  if (h > r + tol) return []
  if (Math.abs(h - r) <= tol) return [{ x: fx, y: fy, tangent: true }]
  const k = Math.sqrt(r * r - h * h)
  return [
    { x: fx - k * ux, y: fy - k * uy, tangent: false },
    { x: fx + k * ux, y: fy + k * uy, tangent: false },
  ]
}

function circleCircle(c1: Vec3, r1: number, c2: Vec3, r2: number): Hit2[] {
  const dx = c2[0] - c1[0]
  const dy = c2[1] - c1[1]
  const d = Math.hypot(dx, dy)
  const tol = REL * Math.max(r1, r2, 1)
  if (d < tol) return [] // concéntricos
  if (d > r1 + r2 + tol || d < Math.abs(r1 - r2) - tol) return []
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const h2 = r1 * r1 - a * a
  const mx = c1[0] + (a * dx) / d
  const my = c1[1] + (a * dy) / d
  if (h2 <= tol * Math.max(r1, 1)) return [{ x: mx, y: my, tangent: true }]
  const h = Math.sqrt(h2)
  return [
    { x: mx - (h * dy) / d, y: my + (h * dx) / d, tangent: false },
    { x: mx + (h * dy) / d, y: my - (h * dx) / d, tangent: false },
  ]
}

/** Coordenadas locales de la elipse: el punto `q` pasa al marco donde la elipse es el círculo unidad. */
function toUnit(e: Prim & { k: 'E' }, q: Vec3): Vec3 {
  const dx = q[0] - e.c[0]
  const dy = q[1] - e.c[1]
  const ax2 = e.ax[0] ** 2 + e.ax[1] ** 2
  const ay2 = e.ay[0] ** 2 + e.ay[1] ** 2
  return [(dx * e.ax[0] + dy * e.ax[1]) / ax2, (dx * e.ay[0] + dy * e.ay[1]) / ay2, 0]
}

function lineEllipse(a: Vec3, b: Vec3, e: Prim & { k: 'E' }): Hit2[] {
  return lineCircle(toUnit(e, a), toUnit(e, b), 0, 0, 1).map((h) => ({
    x: e.c[0] + h.x * e.ax[0] + h.y * e.ay[0],
    y: e.c[1] + h.x * e.ax[1] + h.y * e.ay[1],
    tangent: h.tangent,
  }))
}

/**
 * Raíces de `g` (función implícita de la otra curva) a lo largo de la elipse completa `e`:
 * subdivisión en 256 tramos, bisección en los cambios de signo y búsqueda de mínimos de |g| para
 * las tangencias.
 */
function ellipseImplicit(e: Prim & { k: 'E' }, g: (q: Vec3) => number): Hit2[] {
  const at = (th: number): Vec3 => {
    const c = Math.cos(th)
    const s = Math.sin(th)
    return [e.c[0] + c * e.ax[0] + s * e.ay[0], e.c[1] + c * e.ax[1] + s * e.ay[1], 0]
  }
  const N = 256
  const vals: number[] = []
  for (let i = 0; i <= N; i++) vals.push(g(at((i / N) * TAU_PRIM)))
  const out: Hit2[] = []
  const push = (th: number, tangent: boolean): void => {
    const q = at(th)
    if (!out.some((o) => Math.hypot(o.x - q[0], o.y - q[1]) < 1e-9)) out.push({ x: q[0], y: q[1], tangent })
  }
  for (let i = 0; i < N; i++) {
    const lo = (i / N) * TAU_PRIM
    const hi = ((i + 1) / N) * TAU_PRIM
    const g0 = vals[i]
    const g1 = vals[i + 1]
    if (g0 === 0) push(lo, false)
    else if (g0 * g1 < 0) {
      let a = lo
      let b = hi
      let ga = g0
      for (let it = 0; it < 60; it++) {
        const m = (a + b) / 2
        const gm = g(at(m))
        if (ga * gm <= 0) b = m
        else {
          a = m
          ga = gm
        }
      }
      push((a + b) / 2, false)
    } else if (i > 0 && Math.abs(g0) < Math.abs(vals[i - 1]) && Math.abs(g0) <= Math.abs(g1) && Math.abs(g0) < 1e-2) {
      // Mínimo local de |g| sin cambio de signo: posible tangencia → sección áurea.
      let a = ((i - 1) / N) * TAU_PRIM
      let b = hi
      const f = (th: number): number => Math.abs(g(at(th)))
      for (let it = 0; it < 80; it++) {
        const m1 = b - (b - a) / 1.618033988749895
        const m2 = a + (b - a) / 1.618033988749895
        if (f(m1) < f(m2)) b = m2
        else a = m1
      }
      const th = (a + b) / 2
      if (f(th) < 1e-9) push(th, true)
    }
  }
  return out
}

/** Intersecciones de las **formas completas** de dos primitivas (recta infinita / círculo / elipse). */
export function shapeIntersections(p: Prim, q: Prim): Hit2[] {
  const rank = { L: 0, A: 1, E: 2 }
  if (rank[p.k] > rank[q.k]) return shapeIntersections(q, p)
  if (p.k === 'L' && q.k === 'L') return lineLine(p.a, p.b, q.a, q.b)
  if (p.k === 'L' && q.k === 'A') return lineCircle(p.a, p.b, q.c[0], q.c[1], q.r)
  if (p.k === 'L' && q.k === 'E') return lineEllipse(p.a, p.b, q)
  if (p.k === 'A' && q.k === 'A') return circleCircle(p.c, p.r, q.c, q.r)
  if (p.k === 'A' && q.k === 'E') return ellipseImplicit(q, (z) => ((z[0] - p.c[0]) ** 2 + (z[1] - p.c[1]) ** 2 - p.r * p.r) / (p.r * p.r))
  if (p.k === 'E' && q.k === 'E') {
    return ellipseImplicit(q, (z) => {
      const u = toUnit(p, z)
      return u[0] * u[0] + u[1] * u[1] - 1
    })
  }
  return []
}

const asSpec = (e: ExtendSpec | boolean | undefined): ExtendSpec =>
  typeof e === 'object' ? e : { start: !!e, end: !!e }

/**
 * Intersecciones entre dos curvas. `ext1`/`ext2` permiten prolongar los extremos de cada una
 * (`true` = ambos); las curvas cerradas nunca se prolongan. Ordenadas por `t1`.
 */
export function intersectCurves(c1: Curve, c2: Curve, ext1?: ExtendSpec | boolean, ext2?: ExtendSpec | boolean): CurveHit[] {
  const e1 = c1.closed ? { start: false, end: false } : asSpec(ext1)
  const e2 = c2.closed ? { start: false, end: false } : asSpec(ext2)
  const hits: CurveHit[] = []
  const boxes2 = c2.prims.map(primBox)
  c1.prims.forEach((p, i) => {
    const lo1 = e1.start && i === 0
    const hi1 = e1.end && i === c1.n - 1
    const b1 = lo1 || hi1 ? null : primBox(p)
    c2.prims.forEach((q, j) => {
      const lo2 = e2.start && j === 0
      const hi2 = e2.end && j === c2.n - 1
      if (b1 && !lo2 && !hi2 && !boxesOverlap(b1, boxes2[j])) return
      for (const h of shapeIntersections(p, q)) {
        const pt: Vec3 = [h.x, h.y, 0]
        const s = primFitParam(p, primRawParam(p, pt), lo1, hi1)
        if (s === null) continue
        const u = primFitParam(q, primRawParam(q, pt), lo2, hi2)
        if (u === null) continue
        hits.push({ point: primPoint(p, s), t1: i + s, t2: j + u, tangent: h.tangent })
      }
    })
  })
  return dedupeHits(hits, c1, c2)
}

/** Quita los cruces repetidos (un vértice de polilínea aparece en los dos tramos que lo comparten). */
function dedupeHits(hits: CurveHit[], c1: Curve, c2: Curve): CurveHit[] {
  const norm = (t: number, c: Curve): number => (c.closed && Math.abs(t - c.n) < PEPS ? 0 : t)
  const out: CurveHit[] = []
  for (const h of hits.sort((a, b) => a.t1 - b.t1)) {
    const t1 = norm(h.t1, c1)
    const t2 = norm(h.t2, c2)
    if (out.some((o) => dist2(o.point, h.point) < 1e-9 && Math.abs(o.t1 - t1) < 1e-7)) continue
    out.push({ ...h, t1, t2 })
  }
  return out
}

/**
 * Auto-intersecciones de una curva (OFFSET las usa para podar bucles). Devuelve pares de
 * parámetros `[ta, tb]` con `ta < tb`; se ignora el vértice compartido por tramos consecutivos.
 */
export function selfIntersections(c: Curve): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const boxes = c.prims.map(primBox)
  const n = c.n
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!boxesOverlap(boxes[i], boxes[j])) continue
      const adjacent = j === i + 1
      const wrap = c.closed && i === 0 && j === n - 1
      for (const h of shapeIntersections(c.prims[i], c.prims[j])) {
        const pt: Vec3 = [h.x, h.y, 0]
        const s = primFitParam(c.prims[i], primRawParam(c.prims[i], pt), false, false)
        const u = primFitParam(c.prims[j], primRawParam(c.prims[j], pt), false, false)
        if (s === null || u === null) continue
        if (adjacent && s > 1 - 1e-7 && u < 1e-7) continue
        if (wrap && s < 1e-7 && u > 1 - 1e-7) continue
        out.push([i + s, j + u])
      }
    }
  }
  return out
}
