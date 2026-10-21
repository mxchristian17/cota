import type { Vec3 } from '../math'
import type { Entity, EntityInput } from '../document/types'
import { normAngle, TAU } from '../geom/arc'
import {
  Curve,
  GEPS,
  PEPS,
  dist2,
  primFitParam,
  primLength,
  primPeriod,
  primPoint,
  primRawParam,
  primSub,
  primTangent,
  type Prim,
} from '../geom/curve'
import { shapeIntersections } from '../geom/intersect'
import type { CurvePick } from './pickCurve'

/**
 * FILLET: resolución tangencial entre dos curvas y la edición que la acompaña. La esquina
 * (`Corner`) es común con CHAMFER: dónde se corta cada curva, qué lado se conserva y la pieza que
 * las une (arco o segmento).
 *
 * - Rectas y arcos: los centros candidatos son las intersecciones **exactas** de las formas
 *   desplazadas ±r (recta paralela, círculo concéntrico).
 * - Elipses: semilla por muestreo de las curvas desplazadas + Newton sobre los dos parámetros.
 * - Splines: se trabaja sobre su tesselado (tangencia numérica, anotada en el PRD).
 *
 * Entre las soluciones gana el centro más cercano a los dos picks (criterio del CAD clásico); el arco es
 * el menor de los dos que unen los puntos de tangencia, y su sentido decide qué lado de cada curva
 * se conserva.
 */

export type CornerError = 'tooLarge' | 'noSolution' | 'parallel' | 'coplanar' | 'same' | 'notLine'

export interface Corner {
  /** Picks ordenados (en una misma polilínea, el primero es el tramo anterior). */
  a: CurvePick
  b: CurvePick
  /** Primitiva y parámetro local del corte sobre cada curva. */
  i1: number
  s1: number
  i2: number
  s2: number
  /** La curva 1 llega al corte avanzando: se conserva su tramo inicial `[0, t1]`. */
  fwd1: boolean
  /** La curva 2 sale del corte avanzando: se conserva su tramo final `[t2, n]`. */
  fwd2: boolean
  /** Arco (FILLET) o segmento (CHAMFER) del corte 1 al corte 2; null = esquina viva. */
  link: Prim | null
}

export type CornerResult = Corner | { error: CornerError }

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const addS = (p: Vec3, v: Vec3, s: number): Vec3 => [p[0] + v[0] * s, p[1] + v[1] * s, p[2] + v[2] * s]
const left = (v: Vec3): Vec3 => [-v[1], v[0], 0]
export const dot2 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1]
export const cross2 = (a: Vec3, b: Vec3): number => a[0] * b[1] - a[1] * b[0]

// --- Par de objetos ------------------------------------------------------------------------------

/** Un lado del par: el pick, las primitivas candidatas y qué prolongaciones admite cada una. */
export interface Side {
  pick: CurvePick
  prims: number[]
  lo: (i: number) => boolean
  hi: (i: number) => boolean
  /** Holgura de parámetro admitida en tesselados (spline), que después se recorta a [0, 1]. */
  slack: number
}

export interface Pair {
  A: Side
  B: Side
  /** Dos tramos de la misma polilínea. */
  same: boolean
}

const primIndex = (c: Curve, t: number): number => Math.min(c.n - 1, Math.max(0, Math.floor(t)))

function freeSide(pick: CurvePick): Side {
  const c = pick.curve
  const open = !c.closed
  return {
    pick,
    prims: c.kind === 'SPLINE' ? c.prims.map((_, i) => i) : [primIndex(c, pick.t)],
    lo: (i) => open && i === 0,
    hi: (i) => open && i === c.n - 1,
    slack: c.kind === 'SPLINE' ? 0.25 : 0,
  }
}

const zRange = (cs: Curve[]): number => {
  const zs = cs.flatMap((c) => [c.start[2], c.end[2]])
  return Math.max(...zs) - Math.min(...zs)
}

/** Prepara el par. En una misma polilínea ordena los tramos y fija qué prolongaciones valen. */
export function makePair(a: CurvePick, b: CurvePick): Pair | { error: CornerError } {
  if (zRange([a.curve, b.curve]) > 1e-6) return { error: 'coplanar' }
  if (a.entity.id !== b.entity.id) return { A: freeSide(a), B: freeSide(b), same: false }
  const c = a.curve
  let i = primIndex(c, a.t)
  let j = primIndex(c, b.t)
  if (c.n < 2 || c.kind === 'SPLINE' || i === j) return { error: 'same' }
  let [pa, pb] = [a, b]
  const n = c.n
  const gapOf = (x: number, y: number): number => (c.closed ? (y - x + n) % n : y - x)
  if (c.closed ? gapOf(i, j) > n - gapOf(i, j) : i > j) {
    ;[i, j, pa, pb] = [j, i, b, a]
  }
  const joined = gapOf(i, j) === 1
  return {
    A: { pick: pa, prims: [i], lo: () => false, hi: () => !joined, slack: 0 },
    B: { pick: pb, prims: [j], lo: () => !joined, hi: () => false, slack: 0 },
    same: true,
  }
}

/** Parámetro local admitido de un punto de la forma completa de la primitiva `i`; null si no vale. */
export function fitSide(sd: Side, i: number, raw: number): number | null {
  const p = sd.pick.curve.prims[i]
  const s = primFitParam(p, raw, sd.lo(i), sd.hi(i))
  if (s !== null) return s
  if (sd.slack && p.k === 'L' && raw > -sd.slack && raw < 1 + sd.slack) return Math.min(1, Math.max(0, raw))
  return null
}

/** ¿Queda algo de la curva al conservar su tramo inicial (`before`) o final desde `t`? */
function keeps(c: Curve, t: number, before: boolean): boolean {
  if (c.closed) return true
  return before ? t > PEPS && c.length(0, t) > GEPS : t < c.n - PEPS && c.length(t, c.n) > GEPS
}

/** Valida que los recortes de un par de objetos distintos no se coman una curva entera. */
export function checkKeeps(k: Corner): CornerResult {
  if (k.a.entity.id === k.b.entity.id) return k
  const ok = keeps(k.a.curve, k.i1 + k.s1, k.fwd1) && keeps(k.b.curve, k.i2 + k.s2, !k.fwd2)
  return ok ? k : { error: 'tooLarge' }
}

// --- Esquina viva --------------------------------------------------------------------------------

/** Intersección (de las formas prolongadas) más cercana a los dos picks. */
export function cornerPoint(pr: Pair): { i1: number; s1: number; i2: number; s2: number; x: Vec3 } | null {
  const { A, B } = pr
  let best = null
  let bestD = Infinity
  for (const i of A.prims) {
    for (const j of B.prims) {
      const p = A.pick.curve.prims[i]
      const q = B.pick.curve.prims[j]
      for (const h of shapeIntersections(p, q)) {
        const x: Vec3 = [h.x, h.y, primPoint(p, 0)[2]]
        const s1 = fitSide(A, i, primRawParam(p, x))
        const s2 = fitSide(B, j, primRawParam(q, x))
        const d = dist2(x, A.pick.at) + dist2(x, B.pick.at)
        if (s1 !== null && s2 !== null && d < bestD) {
          bestD = d
          best = { i1: i, s1, i2: j, s2, x }
        }
      }
    }
  }
  return best
}

/** Radio 0 / shift-select: lleva las dos curvas hasta su intersección, conservando el lado del pick. */
export function sharpCorner(pr: Pair): CornerResult {
  const x = cornerPoint(pr)
  if (!x) return { error: 'noSolution' }
  const { A, B, same } = pr
  return checkKeeps({
    a: A.pick,
    b: B.pick,
    i1: x.i1,
    s1: x.s1,
    i2: x.i2,
    s2: x.s2,
    fwd1: same || A.pick.t < x.i1 + x.s1,
    fwd2: same || B.pick.t > x.i2 + x.s2,
    link: null,
  })
}

// --- Círculos tangentes --------------------------------------------------------------------------

/** Forma completa desplazada `d` a la izquierda (recta paralela o círculo concéntrico). */
function offsetShape(p: Prim, d: number): Prim | null {
  if (p.k === 'L') {
    if (dist2(p.a, p.b) < GEPS) return null
    const n = left(primTangent(p, 0))
    return { k: 'L', a: addS(p.a, n, d), b: addS(p.b, n, d) }
  }
  if (p.k === 'A') {
    const r = Math.abs(p.r - d * Math.sign(p.sw))
    return r > GEPS ? { k: 'A', c: p.c, r, a0: 0, sw: TAU } : null
  }
  return null
}

/** Parámetro crudo, sobre `p`, del pie de un centro `c` que está a distancia `d` (a la izquierda). */
function footRaw(p: Prim, d: number, c: Vec3): number {
  if (p.k !== 'A') return primRawParam(p, c)
  const k = p.r / (p.r - d * Math.sign(p.sw))
  return primRawParam(p, [p.c[0] + (c[0] - p.c[0]) * k, p.c[1] + (c[1] - p.c[1]) * k, p.c[2]])
}

const offPt = (p: Prim, d: number, s: number): Vec3 => addS(primPoint(p, s), left(primTangent(p, s)), d)

/** Lleva un parámetro de arco/elipse a `[0, período)`; en rectas lo deja igual. */
function wrapParam(p: Prim, s: number): number {
  const per = primPeriod(p)
  return per === null ? s : ((s % per) + per) % per
}

/** Muestras `[punto desplazado, parámetro]` de la forma completa (la recta, como un tramo muy largo). */
function offsetSamples(p: Prim, d: number): Array<[Vec3, number]> {
  if (p.k === 'L') {
    const R = 1e4
    return [
      [offPt(p, d, -R), -R],
      [offPt(p, d, R), R],
    ]
  }
  const per = primPeriod(p) as number
  const M = 128
  return Array.from({ length: M + 1 }, (_, k): [Vec3, number] => {
    const s = (per * k) / M
    return [offPt(p, d, s), s]
  })
}

function segHit(a: Vec3, b: Vec3, c: Vec3, d: Vec3): [number, number] | null {
  const r = sub(b, a)
  const s = sub(d, c)
  const den = cross2(r, s)
  if (Math.abs(den) < 1e-18) return null
  const w = sub(c, a)
  const u = cross2(w, s) / den
  const v = cross2(w, r) / den
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? [u, v] : null
}

/** Newton sobre `offPt(p, d1, s1) = offPt(q, d2, s2)`. */
function refine(p: Prim, d1: number, q: Prim, d2: number, s1: number, s2: number): [number, number] | null {
  const h = 1e-7
  for (let it = 0; it < 40; it++) {
    const F = sub(offPt(p, d1, s1), offPt(q, d2, s2))
    if (Math.hypot(F[0], F[1]) < 1e-11) return [s1, s2]
    const A = sub(offPt(p, d1, s1 + h), offPt(p, d1, s1 - h)).map((v) => v / (2 * h))
    const B = sub(offPt(q, d2, s2 - h), offPt(q, d2, s2 + h)).map((v) => v / (2 * h))
    const det = A[0] * B[1] - A[1] * B[0]
    if (Math.abs(det) < 1e-15) return null
    s1 -= (F[0] * B[1] - F[1] * B[0]) / det
    s2 -= (A[0] * F[1] - A[1] * F[0]) / det
  }
  const F = sub(offPt(p, d1, s1), offPt(q, d2, s2))
  return Math.hypot(F[0], F[1]) < 1e-7 ? [s1, s2] : null
}

/** Centros a distancia `d1` de `p` y `d2` de `q`, con los parámetros crudos de los pies. */
function centers(p: Prim, d1: number, q: Prim, d2: number): Array<[Vec3, number, number]> {
  const z = primPoint(p, 0)[2]
  if (p.k !== 'E' && q.k !== 'E') {
    const P = offsetShape(p, d1)
    const Q = offsetShape(q, d2)
    if (!P || !Q) return []
    return shapeIntersections(P, Q).map((h): [Vec3, number, number] => {
      const c: Vec3 = [h.x, h.y, z]
      return [c, footRaw(p, d1, c), footRaw(q, d2, c)]
    })
  }
  const P = offsetSamples(p, d1)
  const Q = offsetSamples(q, d2)
  const out: Array<[Vec3, number, number]> = []
  for (let k = 0; k + 1 < P.length; k++) {
    for (let m = 0; m + 1 < Q.length; m++) {
      const hit = segHit(P[k][0], P[k + 1][0], Q[m][0], Q[m + 1][0])
      if (!hit) continue
      const s = refine(p, d1, q, d2, P[k][1] + (P[k + 1][1] - P[k][1]) * hit[0], Q[m][1] + (Q[m + 1][1] - Q[m][1]) * hit[1])
      if (!s) continue
      const c = offPt(p, d1, s[0])
      if (out.some(([o]) => dist2(o, c) < 1e-7)) continue
      out.push([[c[0], c[1], z], wrapParam(p, s[0]), wrapParam(q, s[1])])
    }
  }
  return out
}

/** Arco menor de centro `c` y radio `r` desde `t1` hasta `t2`. */
function minorArc(c: Vec3, r: number, t1: Vec3, t2: Vec3): Prim {
  const a0 = Math.atan2(t1[1] - c[1], t1[0] - c[0])
  let sw = normAngle(Math.atan2(t2[1] - c[1], t2[0] - c[0]) - a0)
  if (sw > Math.PI) sw -= TAU
  return { k: 'A', c: [c[0], c[1], t1[2]], r, a0, sw }
}

/** Esquina con `link` de `p(s1)` a `q(s2)`: cada curva conserva el lado que empalma con él. */
function linkCorner(pr: Pair, i1: number, s1: number, i2: number, s2: number, link: Prim): Corner {
  const p = pr.A.pick.curve.prims[i1]
  const q = pr.B.pick.curve.prims[i2]
  return {
    a: pr.A.pick,
    b: pr.B.pick,
    i1,
    s1,
    i2,
    s2,
    fwd1: dot2(primTangent(link, 0), primTangent(p, s1)) > 0,
    fwd2: dot2(primTangent(link, 1), primTangent(q, s2)) > 0,
    link,
  }
}

/** Dos rectas paralelas: semicírculo en el extremo de la primera más cercano a su pick (sin FILLETRAD). */
function parallelFillet(pr: Pair): CornerResult | null {
  const { A, B } = pr
  if (pr.same || A.prims.length !== 1 || B.prims.length !== 1) return null
  const [i, j] = [A.prims[0], B.prims[0]]
  const p = A.pick.curve.prims[i]
  const q = B.pick.curve.prims[j]
  if (p.k !== 'L' || q.k !== 'L' || dist2(p.a, p.b) < GEPS || dist2(q.a, q.b) < GEPS) return null
  const u = primTangent(p, 0)
  if (Math.abs(cross2(u, primTangent(q, 0))) > 1e-9) return null
  const h = cross2(u, sub(q.a, p.a))
  if (Math.abs(h) < GEPS || A.pick.curve.closed) return { error: 'parallel' }
  const s1 = primRawParam(p, A.pick.at) > 0.5 ? 1 : 0
  const e1 = primPoint(p, s1)
  const s2 = fitSide(B, j, primRawParam(q, addS(e1, left(u), h)))
  if (s2 === null) return { error: 'tooLarge' }
  const f = primPoint(q, s2)
  const m: Vec3 = [(e1[0] + f[0]) / 2, (e1[1] + f[1]) / 2, e1[2]]
  const out = s1 === 1 ? u : addS([0, 0, 0], u, -1)
  const a0 = Math.atan2(e1[1] - m[1], e1[0] - m[0])
  const sw = cross2(sub(e1, m), out) > 0 ? Math.PI : -Math.PI
  return checkKeeps(linkCorner(pr, i, s1, j, s2, { k: 'A', c: m, r: Math.abs(h) / 2, a0, sw }))
}

/** Redondeo de radio `r` entre dos picks (radio 0 = esquina viva). */
export function filletCorner(a: CurvePick, b: CurvePick, r: number): CornerResult {
  const pr = makePair(a, b)
  if ('error' in pr) return pr
  const par = parallelFillet(pr)
  if (par) return par
  if (r <= GEPS) return sharpCorner(pr)
  const { A, B, same } = pr
  let best: Corner | null = null
  let bestD = Infinity
  let found = false
  for (const i of A.prims) {
    for (const j of B.prims) {
      const p = A.pick.curve.prims[i]
      const q = B.pick.curve.prims[j]
      for (const d1 of [r, -r]) {
        for (const d2 of [r, -r]) {
          for (const [c, u1, u2] of centers(p, d1, q, d2)) {
            const s1 = fitSide(A, i, u1)
            const s2 = fitSide(B, j, u2)
            if (s1 === null || s2 === null) continue
            const t1 = primPoint(p, s1)
            const t2 = primPoint(q, s2)
            if (dist2(t1, t2) < GEPS) continue
            found = true
            const k = linkCorner(pr, i, s1, j, s2, minorArc(c, r, t1, t2))
            if (same && !(k.fwd1 && k.fwd2)) continue
            const d = dist2(c, A.pick.at) + dist2(c, B.pick.at)
            if (d < bestD) {
              bestD = d
              best = k
            }
          }
        }
      }
    }
  }
  if (!best) return { error: found ? 'tooLarge' : 'noSolution' }
  return checkKeeps(best)
}

// --- Edición resultante --------------------------------------------------------------------------

export type CurveInput = Omit<EntityInput, 'layer'>

export interface CornerEdit {
  /** Entidades que cambian (lista vacía = se borran). */
  replace: Array<{ entity: Entity; inputs: CurveInput[] }>
  /** Entidades nuevas (el arco o el chaflán); la capa la decide el comando. */
  add: CurveInput[]
  /** Curvas resultantes, para la previsualización. */
  preview: Curve[]
}

const inputs = (c: Curve): CurveInput[] => {
  const e = c.toEntity()
  return e ? [e as CurveInput] : []
}

/** La polilínea con los tramos de la esquina cortados y unidos por `link` (quita los intermedios). */
function samePolyline(k: Corner): Curve {
  const c = k.a.curve
  const P = c.prims
  const n = c.n
  const head = primSub(P[k.i1], 0, k.s1)
  const tail = primSub(P[k.i2], k.s2, 1)
  const mid = k.link ? [k.link] : []
  if (!c.closed) return new Curve('POLYLINE', [...P.slice(0, k.i1), head, ...mid, tail, ...P.slice(k.i2 + 1)], false)
  const rest: Prim[] = []
  for (let m = (k.i2 + 1) % n; m !== k.i1; m = (m + 1) % n) rest.push(P[m])
  return new Curve('POLYLINE', [tail, ...rest, head, ...mid], true)
}

const JOINABLE = new Set(['LINE', 'ARC', 'POLYLINE'])

/**
 * Cambios que produce la esquina. Con `trim`: recorta/alarga cada curva abierta hasta su corte (las
 * cerradas no se tocan); si una de las dos es polilínea, todo se une en una sola polilínea; dos tramos
 * de la misma polilínea se resuelven dentro de ella. Sin `trim` sólo se agrega la pieza de unión.
 */
export function cornerEdit(k: Corner, trim: boolean): CornerEdit {
  const { a, b, link } = k
  const linkCurve = link ? new Curve(link.k === 'A' ? 'ARC' : 'LINE', [link], false) : null
  const add = linkCurve ? inputs(linkCurve) : []
  if (!trim) return { replace: [], add, preview: linkCurve ? [linkCurve] : [] }
  if (a.entity.id === b.entity.id) {
    const c = samePolyline(k)
    return { replace: [{ entity: a.entity, inputs: inputs(c) }], add: [], preview: [c] }
  }
  const t1 = k.i1 + k.s1
  const t2 = k.i2 + k.s2
  const k1 = a.curve.closed ? null : k.fwd1 ? a.curve.trimTo(0, t1) : a.curve.trimTo(t1, a.curve.n)
  const k2 = b.curve.closed ? null : k.fwd2 ? b.curve.trimTo(t2, b.curve.n) : b.curve.trimTo(0, t2)
  const kinds = [a.curve.kind, b.curve.kind]
  if (k1 && k2 && kinds.every((x) => JOINABLE.has(x)) && kinds.includes('POLYLINE')) {
    const prims = [...(k.fwd1 ? k1 : k1.reverse()).prims, ...(link ? [link] : []), ...(k.fwd2 ? k2 : k2.reverse()).prims]
    const joined = new Curve('POLYLINE', prims, false)
    const [keep, drop] = a.curve.kind === 'POLYLINE' ? [a, b] : [b, a]
    return {
      replace: [
        { entity: keep.entity, inputs: inputs(joined) },
        { entity: drop.entity, inputs: [] },
      ],
      add: [],
      preview: [joined],
    }
  }
  const replace: CornerEdit['replace'] = []
  const preview: Curve[] = []
  for (const [pick, kept] of [
    [a, k1],
    [b, k2],
  ] as Array<[CurvePick, Curve | null]>) {
    if (!kept) continue
    replace.push({ entity: pick.entity, inputs: inputs(kept) })
    preview.push(kept)
  }
  if (linkCurve) preview.push(linkCurve)
  return { replace, add, preview }
}

// --- Polilínea completa --------------------------------------------------------------------------

/** Corte de un vértice: distancias sobre el tramo entrante y el saliente, y la pieza que los une. */
export interface VertexCut {
  d1: number
  d2: number
  link: (p1: Vec3, p2: Vec3) => Prim
}

export type VertexRule = (uIn: Vec3, uOut: Vec3) => VertexCut | null

/**
 * Aplica `rule` a cada vértice entre dos tramos rectos (FILLET/CHAMFER ▸ Polyline). Avanza en orden
 * y descuenta lo que cada vértice consume de sus tramos; si un tramo no alcanza, ese vértice cuenta
 * como "too short". Devuelve una sola polilínea (O(N)).
 */
export function cutVertices(c: Curve, rule: VertexRule): { curve: Curve; done: number; short: number } {
  const P = c.prims
  const n = c.n
  const startUse = new Array<number>(n).fill(0)
  const endUse = new Array<number>(n).fill(0)
  const links: Array<Prim | null> = new Array<Prim | null>(n).fill(null)
  let done = 0
  let short = 0
  for (let k = c.closed ? 0 : 1; k < n; k++) {
    const pv = (k - 1 + n) % n
    const p = P[pv]
    const q = P[k]
    if (p.k !== 'L' || q.k !== 'L' || primLength(p) < GEPS || primLength(q) < GEPS) continue
    const uIn = primTangent(p, 0)
    const uOut = primTangent(q, 0)
    const cut = rule(uIn, uOut)
    if (!cut) continue
    if (cut.d1 > primLength(p) - startUse[pv] + GEPS || cut.d2 > primLength(q) - endUse[k] + GEPS) {
      short++
      continue
    }
    endUse[pv] = cut.d1
    startUse[k] = cut.d2
    links[k] = cut.link(addS(q.a, uIn, -cut.d1), addS(q.a, uOut, cut.d2))
    done++
  }
  const out: Prim[] = []
  P.forEach((p, k) => {
    const lk = links[k]
    if (lk) out.push(lk)
    if (p.k !== 'L' || (!startUse[k] && !endUse[k])) {
      out.push(p)
      return
    }
    const u = primTangent(p, 0)
    out.push({ k: 'L', a: addS(p.a, u, startUse[k]), b: addS(p.b, u, -endUse[k]) })
  })
  return { curve: new Curve('POLYLINE', out, c.closed), done, short }
}

/** Ángulo con signo de `uIn` a `uOut` (deflexión del vértice); null si son colineales. */
export function deflection(uIn: Vec3, uOut: Vec3): number | null {
  const d = Math.atan2(cross2(uIn, uOut), dot2(uIn, uOut))
  return Math.abs(d) < 1e-9 || Math.abs(d) > Math.PI - 1e-9 ? null : d
}

/** Regla de FILLET ▸ Polyline: arco de radio `r` tangente a los dos tramos. */
export function filletVertex(r: number): VertexRule {
  return (uIn, uOut) => {
    const d = deflection(uIn, uOut)
    if (d === null || r <= GEPS) return null
    const e = r * Math.tan(Math.abs(d) / 2)
    return {
      d1: e,
      d2: e,
      link: (p1) => {
        const c = addS(p1, left(uIn), r * Math.sign(d))
        return { k: 'A', c, r, a0: Math.atan2(p1[1] - c[1], p1[0] - c[0]), sw: d }
      },
    }
  }
}
