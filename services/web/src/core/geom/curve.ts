import type { Vec3 } from '../math'
import type { ArcProps, Entity, EntityProps, EntityType, EllipseProps } from '../document/types'
import { normAngle, sweepOf, TAU } from './arc'
import { bulgeArc, bulgeAt, normalizeBulges, polylineSpans } from './polyline'
import { ellipseMinorVec, ellipseParamSweep, isEllipseArc } from './ellipse'

/**
 * Abstracción paramétrica de curva 2D.
 *
 * Toda entidad plana (`LINE`, `ARC`, `CIRCLE`, `ELLIPSE`, `POLYLINE`, `RECTANGLE`, `SPLINE`) se
 * reduce a una **cadena de primitivas** —segmento, arco de círculo o arco de elipse— en el plano XY
 * del mundo. El parámetro global `t` recorre `[0, n]` (n = cantidad de primitivas): la parte entera
 * elige la primitiva y la fraccionaria es su parámetro local. Fuera de `[0, n]` la curva se
 * **prolonga** con su primitiva extrema (recta, mismo círculo o misma elipse), que es lo que usan
 * EXTEND, LENGTHEN y el modo `Edge=Extend` de TRIM.
 *
 * Sobre esto los comandos de edición (TRIM, EXTEND, OFFSET, JOIN, BREAK, LENGTHEN, FILLET…) son
 * lógica de prompts encima de operaciones genéricas, sin casos por tipo de entidad.
 */

/** Tolerancia de parámetro (adimensional) para comparar posiciones sobre una curva. */
export const PEPS = 1e-9
/** Tolerancia geométrica absoluta (unidades de dibujo). */
export const GEPS = 1e-7

/**
 * Primitiva en el plano XY (z constante):
 * - `L`: segmento `a → b`.
 * - `A`: arco de círculo de centro `c` y radio `r`, desde el ángulo `a0` con barrido **con signo**
 *   `sw` (positivo = antihorario visto desde +Z).
 * - `E`: arco de elipse `c + cos(p)·ax + sin(p)·ay` (ax ⟂ ay), desde `p0` con barrido con signo `sw`.
 */
export type Prim =
  | { k: 'L'; a: Vec3; b: Vec3 }
  | { k: 'A'; c: Vec3; r: number; a0: number; sw: number }
  | { k: 'E'; c: Vec3; ax: Vec3; ay: Vec3; p0: number; sw: number }

export type CurveKind = 'LINE' | 'ARC' | 'CIRCLE' | 'ELLIPSE' | 'POLYLINE' | 'RECTANGLE' | 'SPLINE'

/** Entidad resultante (sin capa): el tipo puede cambiar respecto del original (CIRCLE → ARC). */
export interface CurveEntityInput {
  type: EntityType
  props: EntityProps
}

export interface Box2 {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const dot2 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const dist2 = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1])

// --- Primitivas ----------------------------------------------------------------------------------

/** Punto de la primitiva en el parámetro local `s` (0 = inicio, 1 = fin; fuera ⇒ prolongación). */
export function primPoint(p: Prim, s: number): Vec3 {
  if (p.k === 'L') {
    return [p.a[0] + (p.b[0] - p.a[0]) * s, p.a[1] + (p.b[1] - p.a[1]) * s, p.a[2] + (p.b[2] - p.a[2]) * s]
  }
  if (p.k === 'A') {
    const t = p.a0 + p.sw * s
    return [p.c[0] + p.r * Math.cos(t), p.c[1] + p.r * Math.sin(t), p.c[2]]
  }
  const t = p.p0 + p.sw * s
  const c = Math.cos(t)
  const n = Math.sin(t)
  return [p.c[0] + c * p.ax[0] + n * p.ay[0], p.c[1] + c * p.ax[1] + n * p.ay[1], p.c[2]]
}

/** Derivada respecto de `s` (no normalizada). */
export function primDeriv(p: Prim, s: number): Vec3 {
  if (p.k === 'L') return sub(p.b, p.a)
  if (p.k === 'A') {
    const t = p.a0 + p.sw * s
    return [-p.r * p.sw * Math.sin(t), p.r * p.sw * Math.cos(t), 0]
  }
  const t = p.p0 + p.sw * s
  const c = Math.cos(t)
  const n = Math.sin(t)
  return [p.sw * (-n * p.ax[0] + c * p.ay[0]), p.sw * (-n * p.ax[1] + c * p.ay[1]), 0]
}

/** Tangente unitaria en el sentido de avance. */
export function primTangent(p: Prim, s: number): Vec3 {
  const d = primDeriv(p, s)
  const L = Math.hypot(d[0], d[1]) || 1
  return [d[0] / L, d[1] / L, 0]
}

/** Longitud de la primitiva entre `s0` y `s1` (admite valores fuera de [0,1]). */
export function primLengthBetween(p: Prim, s0: number, s1: number): number {
  const span = Math.abs(s1 - s0)
  if (p.k === 'L') return dist2(p.a, p.b) * span
  if (p.k === 'A') return p.r * Math.abs(p.sw) * span
  // Elipse: Simpson sobre |dP/ds|.
  const N = Math.max(8, Math.ceil(64 * span)) * 2
  const h = (s1 - s0) / N
  let acc = 0
  for (let i = 0; i <= N; i++) {
    const d = primDeriv(p, s0 + i * h)
    const f = Math.hypot(d[0], d[1])
    acc += f * (i === 0 || i === N ? 1 : i % 2 ? 4 : 2)
  }
  return Math.abs((acc * h) / 3)
}

export const primLength = (p: Prim): number => primLengthBetween(p, 0, 1)

/** Tramo de la primitiva entre `s0` y `s1`, re-parametrizado a [0,1]. */
export function primSub(p: Prim, s0: number, s1: number): Prim {
  if (p.k === 'L') return { k: 'L', a: primPoint(p, s0), b: primPoint(p, s1) }
  if (p.k === 'A') return { ...p, a0: p.a0 + p.sw * s0, sw: p.sw * (s1 - s0) }
  return { ...p, p0: p.p0 + p.sw * s0, sw: p.sw * (s1 - s0) }
}

export function primReverse(p: Prim): Prim {
  if (p.k === 'L') return { k: 'L', a: p.b, b: p.a }
  if (p.k === 'A') return { ...p, a0: p.a0 + p.sw, sw: -p.sw }
  return { ...p, p0: p.p0 + p.sw, sw: -p.sw }
}

/** Período en parámetro local de las primitivas cerradas por naturaleza (círculo/elipse); null en rectas. */
export function primPeriod(p: Prim): number | null {
  return p.k === 'L' ? null : TAU / Math.max(Math.abs(p.sw), 1e-15)
}

/** Ángulo (A) o parámetro de elipse (E) del punto, medido en la forma completa. */
function primAngleOf(p: Prim & { k: 'A' | 'E' }, q: Vec3): number {
  const d = sub(q, p.c)
  if (p.k === 'A') return Math.atan2(d[1], d[0])
  return Math.atan2(dot2(d, p.ay) / dot2(p.ay, p.ay), dot2(d, p.ax) / dot2(p.ax, p.ax))
}

/**
 * Parámetro local "crudo" de un punto que está sobre la forma completa de la primitiva (recta
 * infinita, círculo o elipse). En rectas puede ser cualquier real; en arcos cae en `[0, período)`,
 * medido desde el inicio en el sentido de avance.
 */
export function primRawParam(p: Prim, q: Vec3): number {
  if (p.k === 'L') {
    const d = sub(p.b, p.a)
    const L2 = dot2(d, d)
    return L2 < 1e-24 ? 0 : dot2(sub(q, p.a), d) / L2
  }
  const rel = normAngle((primAngleOf(p, q) - (p.k === 'A' ? p.a0 : p.p0)) * Math.sign(p.sw || 1))
  return rel / Math.abs(p.sw)
}

/**
 * Lleva un parámetro crudo al rango admitido: dentro de [0,1] siempre; fuera sólo si se admite
 * prolongar ese extremo (`lo` = antes del inicio, `hi` = después del fin). En arcos, un punto del
 * tramo faltante del círculo se asigna a la prolongación más corta de las admitidas.
 */
export function primFitParam(p: Prim, raw: number, lo: boolean, hi: boolean, eps = PEPS): number | null {
  const per = primPeriod(p)
  if (per === null) {
    if (raw >= -eps && raw <= 1 + eps) return Math.min(1, Math.max(0, raw))
    if (raw < 0) return lo ? raw : null
    return hi ? raw : null
  }
  if (raw <= 1 + eps) return Math.min(1, raw)
  if (raw >= per - eps) return 0 // vuelta completa: es el punto inicial
  const fwd = raw - 1
  const back = per - raw
  if (hi && lo) return fwd <= back ? raw : raw - per
  if (hi) return raw
  if (lo) return raw - per
  return null
}

/** Parámetro local en [0,1] del punto de la primitiva más cercano a `q`. */
export function primClosest(p: Prim, q: Vec3): number {
  if (p.k === 'L') return Math.min(1, Math.max(0, primRawParam(p, q)))
  if (p.k === 'A') {
    const raw = primRawParam(p, q)
    if (raw <= 1) return raw
    return dist2(q, primPoint(p, 0)) <= dist2(q, primPoint(p, 1)) ? 0 : 1
  }
  // Elipse: muestreo + Newton sobre |P(s) − q|².
  let best = 0
  let bd = Infinity
  for (let i = 0; i <= 64; i++) {
    const d = dist2(primPoint(p, i / 64), q)
    if (d < bd) {
      bd = d
      best = i / 64
    }
  }
  let s = best
  for (let it = 0; it < 20; it++) {
    const P = primPoint(p, s)
    const d1 = primDeriv(p, s)
    const h = 1e-6
    const d2 = sub(primDeriv(p, s + h), primDeriv(p, s - h)).map((v) => v / (2 * h)) as Vec3
    const r = sub(P, q)
    const f1 = dot2(r, d1)
    const f2 = dot2(d1, d1) + dot2(r, d2)
    if (Math.abs(f2) < 1e-18) break
    const next = Math.min(1, Math.max(0, s - f1 / f2))
    if (Math.abs(next - s) < 1e-13) {
      s = next
      break
    }
    s = next
  }
  return dist2(primPoint(p, s), q) <= bd ? s : best
}

/** Caja envolvente exacta (XY) de la primitiva. */
export function primBox(p: Prim): Box2 {
  const pts: Vec3[] = [primPoint(p, 0), primPoint(p, 1)]
  if (p.k !== 'L') {
    // Extremos de x(t) e y(t) dentro del barrido.
    const cand =
      p.k === 'A' ? [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2] : [Math.atan2(p.ay[0], p.ax[0]), Math.atan2(p.ay[1], p.ax[1])]
    const all = p.k === 'A' ? cand : [...cand, cand[0] + Math.PI, cand[1] + Math.PI]
    const start = p.k === 'A' ? p.a0 : p.p0
    for (const ang of all) {
      const rel = normAngle((ang - start) * Math.sign(p.sw || 1)) / Math.abs(p.sw)
      if (rel <= 1) pts.push(primPoint(p, rel))
    }
  }
  const box: Box2 = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const q of pts) {
    box.minX = Math.min(box.minX, q[0])
    box.minY = Math.min(box.minY, q[1])
    box.maxX = Math.max(box.maxX, q[0])
    box.maxY = Math.max(box.maxY, q[1])
  }
  return box
}

export function boxesOverlap(a: Box2, b: Box2, tol = GEPS): boolean {
  return a.minX <= b.maxX + tol && b.minX <= a.maxX + tol && a.minY <= b.maxY + tol && b.minY <= a.maxY + tol
}

// --- Curva ---------------------------------------------------------------------------------------

/**
 * Cadena de primitivas con el tipo de entidad de origen (para volver al modelo). `nodes` guarda los
 * parámetros (enteros) de los puntos de paso interiores de una SPLINE, para reconstruirla al recortar.
 */
export class Curve {
  constructor(
    readonly kind: CurveKind,
    readonly prims: Prim[],
    readonly closed: boolean,
    readonly nodes: number[] = [],
    readonly degree = 3,
  ) {}

  get n(): number {
    return this.prims.length
  }

  get domain(): [number, number] {
    return [0, this.prims.length]
  }

  /** Primitiva y parámetro local de `t`; fuera del dominio, prolongación de la primitiva extrema. */
  locate(t: number): [number, number] {
    const n = this.n
    if (t <= 0) return [0, t]
    if (t >= n) return [n - 1, t - (n - 1)]
    const i = Math.min(Math.floor(t), n - 1)
    return [i, t - i]
  }

  /** Igual que `locate`, pero un entero interior cae al **final** de la primitiva anterior. */
  private locateEnd(t: number): [number, number] {
    const n = this.n
    if (t <= 0) return [0, t]
    if (t >= n) return [n - 1, t - (n - 1)]
    const i = Math.max(0, Math.ceil(t) - 1)
    return [i, t - i]
  }

  pointAt(t: number): Vec3 {
    const [i, s] = this.locate(t)
    return primPoint(this.prims[i], s)
  }

  tangentAt(t: number): Vec3 {
    const [i, s] = this.locate(t)
    return primTangent(this.prims[i], s)
  }

  get start(): Vec3 {
    return primPoint(this.prims[0], 0)
  }

  get end(): Vec3 {
    return primPoint(this.prims[this.n - 1], 1)
  }

  /** Parámetro del punto de la curva más cercano a `p` (proyección). */
  paramAt(p: Vec3): number {
    let best = 0
    let bd = Infinity
    this.prims.forEach((pr, i) => {
      const s = primClosest(pr, p)
      const d = dist2(primPoint(pr, s), p)
      if (d < bd - 1e-12) {
        bd = d
        best = i + s
      }
    })
    return best
  }

  distanceTo(p: Vec3): number {
    return dist2(this.pointAt(this.paramAt(p)), p)
  }

  /** Longitud entre `t0` y `t1` (por defecto, la curva completa). */
  length(t0 = 0, t1 = this.n): number {
    if (t1 < t0) [t0, t1] = [t1, t0]
    let acc = 0
    for (let i = 0; i < this.n; i++) {
      const lo = i === 0 ? t0 : Math.max(t0, i)
      const hi = i === this.n - 1 ? t1 : Math.min(t1, i + 1)
      if (hi > lo) acc += primLengthBetween(this.prims[i], lo - i, hi - i)
    }
    return acc
  }

  /** Caja envolvente exacta en XY. */
  box(): Box2 {
    const b: Box2 = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    for (const p of this.prims) {
      const q = primBox(p)
      b.minX = Math.min(b.minX, q.minX)
      b.minY = Math.min(b.minY, q.minY)
      b.maxX = Math.max(b.maxX, q.maxX)
      b.maxY = Math.max(b.maxY, q.maxY)
    }
    return b
  }

  /** Puntos de muestra (para pertenencia a polígonos, selección por cruce, área). */
  samples(perArc = 32): Vec3[] {
    const out: Vec3[] = [this.start]
    for (const p of this.prims) {
      const k = p.k === 'L' ? 1 : Math.max(4, Math.ceil((perArc * Math.abs(p.sw)) / TAU))
      for (let j = 1; j <= k; j++) out.push(primPoint(p, j / k))
    }
    return out
  }

  /** Área con signo (positiva = antihoraria) de una curva cerrada. */
  signedArea(): number {
    const pts = this.samples(96)
    let a = 0
    for (let i = 0; i + 1 < pts.length; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
    return a / 2
  }

  /** Primitivas entre `t0 < t1` (pueden quedar fuera de [0, n] en curvas abiertas: prolongación). */
  private span(t0: number, t1: number): { prims: Prim[]; nodes: number[] } {
    const [i0, s0] = this.locate(t0)
    const [i1, s1] = this.locateEnd(t1)
    const prims =
      i0 === i1
        ? [primSub(this.prims[i0], s0, s1)]
        : [primSub(this.prims[i0], s0, 1), ...this.prims.slice(i0 + 1, i1), primSub(this.prims[i1], 0, s1)]
    const nodes = this.nodes.filter((N) => N > t0 + PEPS && N < t1 - PEPS).map((N) => N - i0)
    return { prims, nodes }
  }

  /**
   * Tramo de `t0` a `t1`. En curvas abiertas exige `t0 < t1` y admite prolongar los extremos; en
   * cerradas, si `t1 ≤ t0` el tramo da la vuelta por el punto inicial (con `t0 = t1`, la vuelta
   * completa abierta en ese punto). El resultado siempre es una curva abierta.
   */
  trimTo(t0: number, t1: number): Curve | null {
    const n = this.n
    if (!this.closed) {
      if (t1 - t0 < PEPS) return null
      const { prims, nodes } = this.span(t0, t1)
      return new Curve(this.kind, prims, false, nodes, this.degree)
    }
    const w = (t: number): number => {
      const r = ((t % n) + n) % n
      return r > n - PEPS ? 0 : r
    }
    const a = w(t0)
    const b = w(t1)
    if (b - a > PEPS) return new Curve(this.kind, this.span(a, b).prims, false, [], this.degree)
    const prims = [...(a < n - PEPS ? this.span(a, n).prims : []), ...(b > PEPS ? this.span(0, b).prims : [])]
    return prims.length ? new Curve(this.kind, prims, false, [], this.degree) : null
  }

  /** Parte la curva en los parámetros dados (TRIM, BREAK, poda de OFFSET). */
  split(ts: number[]): Curve[] {
    const n = this.n
    const inner = [...new Set(ts.map((t) => (this.closed ? ((t % n) + n) % n : t)))]
      .filter((t) => (this.closed ? true : t > PEPS && t < n - PEPS))
      .sort((x, y) => x - y)
    const uniq = inner.filter((t, i) => i === 0 || t - inner[i - 1] > PEPS)
    if (this.closed) {
      if (uniq.length === 0) return [this]
      const out: Curve[] = []
      for (let i = 0; i < uniq.length; i++) {
        const c = this.trimTo(uniq[i], uniq[(i + 1) % uniq.length])
        if (c) out.push(c)
      }
      return out
    }
    const cuts = [0, ...uniq, n]
    const out: Curve[] = []
    for (let i = 0; i + 1 < cuts.length; i++) {
      const c = this.trimTo(cuts[i], cuts[i + 1])
      if (c) out.push(c)
    }
    return out
  }

  /**
   * Lleva el extremo indicado hasta la proyección de `p` sobre la curva **prolongada** (alarga) o
   * sobre la propia curva (acorta). Null en curvas cerradas o si el resultado degenera.
   */
  extendTo(p: Vec3, end: 'start' | 'end'): Curve | null {
    if (this.closed) return null
    const n = this.n
    const tc = this.paramAt(p)
    let t = tc
    if (end === 'end' && tc >= n - PEPS) {
      const last = this.prims[n - 1]
      t = n - 1 + (primFitParam(last, primRawParam(last, p), false, true) ?? 1)
    } else if (end === 'start' && tc <= PEPS) {
      t = primFitParam(this.prims[0], primRawParam(this.prims[0], p), true, false) ?? 0
    }
    return end === 'end' ? this.trimTo(0, t) : this.trimTo(t, n)
  }

  reverse(): Curve {
    const n = this.n
    const prims = this.prims.map(primReverse).reverse()
    return new Curve(this.kind, prims, this.closed, this.nodes.map((N) => n - N).reverse(), this.degree)
  }

  /** Copia con otro tipo de origen / estado de cierre. */
  withKind(kind: CurveKind, closed = this.closed): Curve {
    return new Curve(kind, this.prims, closed, this.nodes, this.degree)
  }

  /** Vuelve al modelo de documento. El tipo puede cambiar: un CIRCLE recortado es un ARC. */
  toEntity(): CurveEntityInput | null {
    const p0 = this.prims[0]
    if (!p0) return null
    if (this.kind === 'LINE' && this.n === 1 && p0.k === 'L') {
      return { type: 'LINE', props: { start: p0.a, end: p0.b } }
    }
    if ((this.kind === 'ARC' || this.kind === 'CIRCLE') && this.n === 1 && p0.k === 'A') {
      if (this.closed) return { type: 'CIRCLE', props: { center: p0.c, radius: p0.r, normal: [0, 0, p0.sw < 0 ? -1 : 1] } }
      return { type: 'ARC', props: arcPropsOfPrim(p0) }
    }
    if (this.kind === 'ELLIPSE' && this.n === 1 && p0.k === 'E') return { type: 'ELLIPSE', props: ellipsePropsOfPrim(p0, this.closed) }
    if (this.kind === 'SPLINE' || this.prims.some((p) => p.k === 'E')) return this.toSpline()
    if (this.kind === 'RECTANGLE' && this.closed) {
      const r = rectangleOf(this.prims)
      if (r) return r
    }
    return this.toPolyline()
  }

  private toSpline(): CurveEntityInput {
    // Las elipses/arcos que pasan a spline se densifican para conservar la forma.
    if (this.kind !== 'SPLINE') {
      const dense: Vec3[] = [this.start]
      for (const p of this.prims) {
        const k = p.k === 'L' ? 1 : Math.max(4, Math.ceil((16 * Math.abs(p.sw)) / TAU))
        for (let j = 1; j <= k; j++) dense.push(primPoint(p, j / k))
      }
      return { type: 'SPLINE', props: { controlPoints: dense, degree: this.degree } }
    }
    const pts: Vec3[] = [this.start, ...this.nodes.map((N) => this.pointAt(N)), this.end]
    return { type: 'SPLINE', props: { controlPoints: pts, degree: this.degree } }
  }

  private toPolyline(): CurveEntityInput {
    const vertices: Vec3[] = []
    const bulges: number[] = []
    for (const p of this.prims) {
      if (primLength(p) < GEPS) continue
      const a = primPoint(p, 0)
      if (vertices.length === 0) vertices.push(a)
      bulges.push(p.k === 'A' ? Math.tan(p.sw / 4) : 0)
      vertices.push(primPoint(p, 1))
    }
    if (vertices.length === 0) vertices.push(this.start, this.end)
    // Una curva abierta cuyos extremos coinciden sigue abierta (BREAKATPOINT sobre una cerrada).
    const closed = this.closed
    if (closed && vertices.length > 2 && dist2(vertices[0], vertices[vertices.length - 1]) < GEPS) vertices.pop()
    if (!closed) bulges.length = Math.max(0, vertices.length - 1)
    const props: { vertices: Vec3[]; closed: boolean; bulges?: number[] } = { vertices, closed }
    const nb = normalizeBulges(vertices, bulges)
    if (nb) props.bulges = nb
    return { type: 'POLYLINE', props }
  }
}

function arcPropsOfPrim(p: Prim & { k: 'A' }): ArcProps {
  if (p.sw >= 0) {
    return { center: p.c, radius: p.r, startAngle: normAngle(p.a0), endAngle: normAngle(p.a0 + p.sw), normal: [0, 0, 1] }
  }
  return { center: p.c, radius: p.r, startAngle: normAngle(-p.a0), endAngle: normAngle(-(p.a0 + p.sw)), normal: [0, 0, -1] }
}

function ellipsePropsOfPrim(p: Prim & { k: 'E' }, closed: boolean): EllipseProps {
  const ma = Math.hypot(p.ax[0], p.ax[1])
  const mi = Math.hypot(p.ay[0], p.ay[1])
  const nz = p.ax[0] * p.ay[1] - p.ax[1] * p.ay[0] < 0 ? -1 : 1
  const props: EllipseProps = { center: p.c, major: p.ax, ratio: mi / (ma || 1), normal: [0, 0, nz] }
  if (!closed) {
    const [a, b] = p.sw >= 0 ? [p.p0, p.p0 + p.sw] : [p.p0 + p.sw, p.p0]
    props.startParam = normAngle(a)
    props.endParam = normAngle(b)
  }
  return props
}

function rectangleOf(prims: Prim[]): CurveEntityInput | null {
  if (prims.length !== 4 || prims.some((p) => p.k !== 'L')) return null
  const pts = prims.map((p) => primPoint(p, 0))
  for (const p of prims as Array<Prim & { k: 'L' }>) {
    if (Math.abs(p.a[0] - p.b[0]) > GEPS && Math.abs(p.a[1] - p.b[1]) > GEPS) return null
  }
  const xs = pts.map((q) => q[0])
  const ys = pts.map((q) => q[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return {
    type: 'RECTANGLE',
    props: { corner: [minX, minY, pts[0][2]], width: Math.max(...xs) - minX, height: Math.max(...ys) - minY },
  }
}

// --- Entidad → curva -----------------------------------------------------------------------------

/** ¿La normal es ±Z (entidad en un plano paralelo a XY)? */
const flat = (n?: Vec3): boolean => !n || Math.abs(n[2]) > 1 - 1e-9

/** Primitiva de un `ArcProps` (con normal ±Z) en coordenadas de mundo. */
export function arcPrim(a: ArcProps): Prim & { k: 'A' } {
  const sw = sweepOf(a)
  if ((a.normal?.[2] ?? 1) < 0) return { k: 'A', c: a.center, r: a.radius, a0: -a.startAngle, sw: -sw }
  return { k: 'A', c: a.center, r: a.radius, a0: a.startAngle, sw }
}

/** Segmentos por tramo al tesselar una spline (los puntos de paso caen en múltiplos exactos). */
export const SPLINE_SEGMENTS = 16

/**
 * Punto de una Catmull-Rom **centrípeta** idéntica a `THREE.CatmullRomCurve3` (la que dibuja el
 * viewport), en el tramo `i` y fracción `w`. Mantenerla igual hace que recortar/capturar coincida
 * con lo que se ve.
 */
export function catmullRomPoint(pts: Vec3[], i: number, w: number): Vec3 {
  const l = pts.length
  const ext = (a: Vec3, b: Vec3): Vec3 => [2 * a[0] - b[0], 2 * a[1] - b[1], 2 * a[2] - b[2]]
  const p0 = i > 0 ? pts[i - 1] : ext(pts[0], pts[1])
  const p1 = pts[i]
  const p2 = pts[i + 1]
  const p3 = i + 2 < l ? pts[i + 2] : ext(pts[l - 1], pts[l - 2])
  const d = (a: Vec3, b: Vec3): number => Math.pow((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2, 0.25)
  let dt1 = d(p1, p2)
  let dt0 = d(p0, p1)
  let dt2 = d(p2, p3)
  if (dt1 < 1e-4) dt1 = 1
  if (dt0 < 1e-4) dt0 = dt1
  if (dt2 < 1e-4) dt2 = dt1
  const out: Vec3 = [0, 0, 0]
  for (let k = 0; k < 3; k++) {
    const x0 = p0[k]
    const x1 = p1[k]
    const x2 = p2[k]
    const x3 = p3[k]
    const t1 = ((x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1) * dt1
    const t2 = ((x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2) * dt1
    const c2 = -3 * x1 + 3 * x2 - 2 * t1 - t2
    const c3 = 2 * x1 - 2 * x2 + t1 + t2
    out[k] = x1 + t1 * w + c2 * w * w + c3 * w * w * w
  }
  return out
}

/** Curva SPLINE que pasa por los puntos dados (tesselada en segmentos). */
export function splineCurve(points: Vec3[], degree = 3): Curve | null {
  if (points.length < 2) return null
  if (points.length === 2) return new Curve('SPLINE', [{ k: 'L', a: points[0], b: points[1] }], false, [], degree)
  const M = SPLINE_SEGMENTS
  const prims: Prim[] = []
  let prev = points[0]
  for (let i = 0; i + 1 < points.length; i++) {
    for (let j = 1; j <= M; j++) {
      const q = j === M ? points[i + 1] : catmullRomPoint(points, i, j / M)
      prims.push({ k: 'L', a: prev, b: q })
      prev = q
    }
  }
  const nodes = points.slice(1, -1).map((_, k) => (k + 1) * M)
  return new Curve('SPLINE', prims, false, nodes, degree)
}

/** Curva de una entidad plana en XY, o null si el tipo no es una curva 2D o no está en un plano XY. */
export function curveOf(e: Entity): Curve | null {
  switch (e.type) {
    case 'LINE':
      return new Curve('LINE', [{ k: 'L', a: e.props.start, b: e.props.end }], false)
    case 'CIRCLE': {
      if (!flat(e.props.normal) || e.props.radius <= 0) return null
      const sw = (e.props.normal?.[2] ?? 1) < 0 ? -TAU : TAU
      return new Curve('CIRCLE', [{ k: 'A', c: e.props.center, r: e.props.radius, a0: 0, sw }], true)
    }
    case 'ARC':
      if (!flat(e.props.normal) || e.props.radius <= 0) return null
      return new Curve('ARC', [arcPrim(e.props)], false)
    case 'ELLIPSE': {
      if (!flat(e.props.normal) || Math.abs(e.props.major[2]) > 1e-9) return null
      const p0 = isEllipseArc(e.props) ? (e.props.startParam as number) : 0
      const prim: Prim = { k: 'E', c: e.props.center, ax: e.props.major, ay: ellipseMinorVec(e.props), p0, sw: ellipseParamSweep(e.props) }
      return new Curve('ELLIPSE', [prim], !isEllipseArc(e.props))
    }
    case 'POLYLINE': {
      const p = e.props
      if (p.vertices.length < 2) return null
      const prims: Prim[] = polylineSpans(p).map(([i, j]) => {
        const arc = bulgeArc(p.vertices[i], p.vertices[j], bulgeAt(p, i))
        return arc ? arcPrim(arc) : { k: 'L', a: p.vertices[i], b: p.vertices[j] }
      })
      return new Curve('POLYLINE', prims, p.closed && p.vertices.length > 2)
    }
    case 'RECTANGLE': {
      const [x, y, z] = e.props.corner
      const { width: w, height: h } = e.props
      const c: Vec3[] = [
        [x, y, z],
        [x + w, y, z],
        [x + w, y + h, z],
        [x, y + h, z],
      ]
      return new Curve('RECTANGLE', c.map((a, i) => ({ k: 'L', a, b: c[(i + 1) % 4] })), true)
    }
    case 'SPLINE':
      return splineCurve(e.props.controlPoints, e.props.degree)
    default:
      return null
  }
}

/** Curva abierta de segmentos por los puntos dados (p. ej. la línea de Fence de TRIM). */
export function polylineCurve(points: Vec3[], closed = false): Curve | null {
  if (points.length < 2) return null
  const prims: Prim[] = []
  for (let i = 0; i + 1 < points.length; i++) prims.push({ k: 'L', a: points[i], b: points[i + 1] })
  if (closed && points.length > 2) prims.push({ k: 'L', a: points[points.length - 1], b: points[0] })
  return new Curve('POLYLINE', prims, closed && points.length > 2)
}
