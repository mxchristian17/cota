import polygonClipping, { type MultiPolygon, type Pair } from 'polygon-clipping'
import type { Vec3 } from '../math'
import type { HatchLoop, RegionProps } from '../document/types'
import { hatchFrame, hatchRegions, to2, to3, type HatchFrame, type P2, type Ring } from '../hatch/geometry'

/**
 * Booleanas 2D de regiones (UNION, SUBTRACT, INTERSECT) en su plano. El recorte se hace sobre los lazos teselados
 * (polygon-clipping); después cada vértice vuelve a la intersección exacta de las rectas y arcos de origen que toca, y
 * los tramos sobre un mismo círculo vuelven a ser un arco: el resultado conserva centros y cuadrantes exactos.
 */

export type RegionOp = 'union' | 'subtract' | 'intersect'

/** Recta o arco de origen, en 2D del plano. */
type Prim = { k: 'L'; a: P2; b: P2 } | { k: 'A'; c: P2; r: number }

const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]]
const len = (a: P2): number => Math.hypot(a[0], a[1])
const cross = (a: P2, b: P2): number => a[0] * b[1] - a[1] * b[0]

/** Clave del plano de una región (normal y elevación redondeadas): las booleanas sólo combinan regiones coplanares. */
export function regionPlaneKey(p: RegionProps): string {
  const f = hatchFrame(p)
  const q = (x: number): number => Math.round(x * 1e6) / 1e6 + 0
  return [...f.n.map(q), q(f.h)].join(',')
}

/** Resultado de combinar regiones coplanares: los lazos de la región resultante (vacío = región nula). */
export function regionBoolean(base: RegionProps[], tools: RegionProps[], op: RegionOp): RegionProps | null {
  const all = [...base, ...tools]
  if (!all.length) return null
  const frame = hatchFrame(all[0])
  const size = Math.max(1e-9, ...all.flatMap((r) => r.loops.flatMap((l) => l.vertices.map((v) => len(to2(v, frame))))))
  const tolT = 1e-6 * Math.max(1, size)
  const prims: Prim[] = []
  const geoms = (rs: RegionProps[]): MultiPolygon[] => rs.map((r) => toMulti(r, frame, tolT, prims))
  let out: MultiPolygon
  if (op === 'union') out = polygonClipping.union(...(geoms(all) as [MultiPolygon, ...MultiPolygon[]]))
  else if (op === 'intersect') out = polygonClipping.intersection(...(geoms(all) as [MultiPolygon, ...MultiPolygon[]]))
  else {
    const b = geoms(base)
    const t = geoms(tools)
    const merged = b.length > 1 ? polygonClipping.union(...(b as [MultiPolygon, ...MultiPolygon[]])) : b[0]
    out = t.length ? polygonClipping.difference(merged, ...t) : merged
  }
  const loops: HatchLoop[] = []
  for (const poly of out) for (const ring of poly) {
    const loop = ringLoop(ring, prims, frame, tolT)
    if (loop) loops.push(loop)
  }
  if (!loops.length) return null
  const n = all[0].normal
  return { loops, ...(n ? { normal: [...n] as Vec3 } : {}) }
}

/** La región como MultiPolygon (cada contorno con sus agujeros), anotando sus rectas y arcos en `prims`. */
function toMulti(r: RegionProps, f: HatchFrame, tolT: number, prims: Prim[]): MultiPolygon {
  const rings: Ring[] = r.loops.map((l) => tessellate(l, f, tolT, prims)).filter((x) => x.length >= 3)
  return hatchRegions(rings).map((g) => [g.outer, ...g.holes].map((ring) => ring.map((q): Pair => [q[0], q[1]])))
}

/** Puntos del lazo (2D) con los arcos divididos fino, y sus rectas y arcos exactos. */
function tessellate(loop: HatchLoop, f: HatchFrame, tolT: number, prims: Prim[]): Ring {
  const v = loop.vertices.map((q) => to2(q, f))
  const out: Ring = []
  for (let i = 0; i < v.length; i++) {
    const a = v[i]
    const b = v[(i + 1) % v.length]
    const bulge = loop.bulges?.[i] ?? 0
    out.push(a)
    if (Math.abs(bulge) < 1e-12) {
      if (len(sub(b, a)) > 0) prims.push({ k: 'L', a, b })
      continue
    }
    const sw = 4 * Math.atan(bulge)
    const ch = len(sub(b, a))
    const r = ch / (2 * Math.sin(Math.abs(sw) / 2))
    // Centro a la izquierda de la cuerda para un arco antihorario (bulge > 0).
    const m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const d = Math.sqrt(Math.max(0, r * r - (ch * ch) / 4))
    const nrm: P2 = [-(b[1] - a[1]) / ch, (b[0] - a[0]) / ch]
    const s = Math.sign(bulge) * (Math.abs(sw) > Math.PI ? -1 : 1)
    const c: P2 = [m[0] + nrm[0] * d * s, m[1] + nrm[1] * d * s]
    prims.push({ k: 'A', c, r })
    const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tolT / r)))
    const n = Math.min(2048, Math.max(4, Math.ceil(Math.abs(sw) / Math.max(step, 1e-4))))
    const a0 = Math.atan2(a[1] - c[1], a[0] - c[0])
    for (let k = 1; k < n; k++) {
      const t = a0 + (sw * k) / n
      out.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)])
    }
  }
  return out
}

/** Distancia de un punto a una recta o arco de origen. */
function primDist(p: P2, q: Prim): number {
  if (q.k === 'A') return Math.abs(len(sub(p, q.c)) - q.r)
  const ab = sub(q.b, q.a)
  const L = len(ab)
  if (L === 0) return len(sub(p, q.a))
  const t = Math.max(0, Math.min(1, ((p[0] - q.a[0]) * ab[0] + (p[1] - q.a[1]) * ab[1]) / (L * L)))
  return len(sub(p, [q.a[0] + ab[0] * t, q.a[1] + ab[1] * t]))
}

/** Intersecciones exactas de dos rectas o arcos (como curvas completas). */
function primCross(p: Prim, q: Prim): P2[] {
  if (p.k === 'L' && q.k === 'L') {
    const d1 = sub(p.b, p.a)
    const d2 = sub(q.b, q.a)
    const den = cross(d1, d2)
    if (Math.abs(den) < 1e-15 * len(d1) * len(d2)) return []
    const t = cross(sub(q.a, p.a), d2) / den
    return [[p.a[0] + d1[0] * t, p.a[1] + d1[1] * t]]
  }
  if (p.k === 'A' && q.k === 'L') return primCross(q, p)
  if (p.k === 'L' && q.k === 'A') {
    const d = sub(p.b, p.a)
    const f = sub(p.a, q.c)
    const A = d[0] * d[0] + d[1] * d[1]
    const B = 2 * (f[0] * d[0] + f[1] * d[1])
    const C = f[0] * f[0] + f[1] * f[1] - q.r * q.r
    const disc = B * B - 4 * A * C
    if (disc < 0 || A === 0) return []
    const sq = Math.sqrt(disc)
    return [(-B - sq) / (2 * A), (-B + sq) / (2 * A)].map((t): P2 => [p.a[0] + d[0] * t, p.a[1] + d[1] * t])
  }
  if (p.k === 'A' && q.k === 'A') {
    const dv = sub(q.c, p.c)
    const D = len(dv)
    if (D < 1e-15 || D > p.r + q.r || D < Math.abs(p.r - q.r)) return []
    const a = (p.r * p.r - q.r * q.r + D * D) / (2 * D)
    const h = Math.sqrt(Math.max(0, p.r * p.r - a * a))
    const m: P2 = [p.c[0] + (dv[0] * a) / D, p.c[1] + (dv[1] * a) / D]
    return [
      [m[0] - (dv[1] * h) / D, m[1] + (dv[0] * h) / D],
      [m[0] + (dv[1] * h) / D, m[1] - (dv[0] * h) / D],
    ]
  }
  return []
}

/** Lleva el punto a su lugar exacto: sobre la única pieza que toca o a la intersección de dos. */
function snap(p: P2, on: Prim[], tolS: number): P2 {
  if (on.length === 1) {
    const q = on[0]
    if (q.k === 'A') {
      const d = sub(p, q.c)
      const L = len(d) || 1
      return [q.c[0] + (d[0] / L) * q.r, q.c[1] + (d[1] / L) * q.r]
    }
    const ab = sub(q.b, q.a)
    const L2 = ab[0] * ab[0] + ab[1] * ab[1] || 1
    const t = ((p[0] - q.a[0]) * ab[0] + (p[1] - q.a[1]) * ab[1]) / L2
    return [q.a[0] + ab[0] * t, q.a[1] + ab[1] * t]
  }
  let best: P2 = p
  let bd = 50 * tolS
  for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) {
    for (const x of primCross(on[i], on[j])) {
      const d = len(sub(x, p))
      if (d < bd) [bd, best] = [d, x]
    }
  }
  return best
}

const sameCircle = (p: Prim, q: Prim, tol: number): boolean =>
  p.k === 'A' && q.k === 'A' && len(sub(p.c, q.c)) <= tol && Math.abs(p.r - q.r) <= tol

/** Un anillo del resultado como lazo: vértices exactos, arcos recuperados y rectas sin vértices intermedios. */
function ringLoop(ring: Pair[], prims: Prim[], f: HatchFrame, tolT: number): HatchLoop | null {
  const pts = ring.map((q): P2 => [q[0], q[1]])
  if (pts.length > 1 && len(sub(pts[0], pts[pts.length - 1])) <= tolT) pts.pop()
  if (pts.length < 3) return null
  const tolS = 4 * tolT
  const on = pts.map((p) => prims.filter((q) => primDist(p, q) <= tolS))
  const exact = pts.map((p, i) => snap(p, on[i], tolS))
  // Pieza de cada tramo: un arco que contenga a los dos extremos (y al medio de la cuerda, si es un tramo largo) o recta.
  const n = exact.length
  const segArc: Array<Prim | null> = exact.map((p, i) => {
    const j = (i + 1) % n
    const arc = on[i].find((q) => q.k === 'A' && on[j].some((o) => sameCircle(o, q, tolS)))
    if (!arc || arc.k !== 'A') return null
    const m: P2 = [(p[0] + exact[j][0]) / 2, (p[1] + exact[j][1]) / 2]
    const sag = arc.r - len(sub(m, arc.c))
    // Una cuerda corta del teselado o con flecha de arco: es el arco. Una cuerda larga sin flecha: es una recta.
    return len(sub(exact[j], p)) < 0.2 * arc.r || sag > tolS ? arc : null
  })
  // Arranca en un vértice donde cambia la pieza, para no partir un arco ni una recta en dos.
  let start = 0
  for (let i = 0; i < n; i++) {
    const prev = segArc[(i + n - 1) % n]
    const cur = segArc[i]
    if (!(prev && cur && sameCircle(prev, cur, tolS)) && !(!prev && !cur && collinear(exact[(i + n - 1) % n], exact[i], exact[(i + 1) % n], tolS))) {
      start = i
      break
    }
  }
  const vertices: Vec3[] = []
  const bulges: number[] = []
  let i = start
  let guard = 0
  do {
    const arc = segArc[i]
    let j = (i + 1) % n
    if (arc && arc.k === 'A') {
      // Barrido con signo sumando los pasos, hasta que cambie de círculo.
      let sw = turn(exact[i], exact[j], arc.c)
      while (j !== start && segArc[j] && sameCircle(segArc[j]!, arc, tolS)) {
        const k = (j + 1) % n
        sw += turn(exact[j], exact[k], arc.c)
        j = k
      }
      const parts = Math.max(1, Math.ceil(Math.abs(sw) / (Math.PI / 2) - 1e-9))
      const a0 = Math.atan2(exact[i][1] - arc.c[1], exact[i][0] - arc.c[0])
      for (let k = 0; k < parts; k++) {
        const t = a0 + (sw * k) / parts
        vertices.push(to3(k === 0 ? exact[i] : [arc.c[0] + arc.r * Math.cos(t), arc.c[1] + arc.r * Math.sin(t)], f))
        bulges.push(Math.tan(sw / parts / 4))
      }
    } else {
      while (j !== start && !segArc[j] && collinear(exact[i], exact[j], exact[(j + 1) % n], tolS)) j = (j + 1) % n
      vertices.push(to3(exact[i], f))
      bulges.push(0)
    }
    i = j
  } while (i !== start && ++guard <= n)
  if (vertices.length < 2 || (vertices.length < 3 && bulges.every((b) => b === 0))) return null
  return bulges.some((b) => b !== 0) ? { vertices, bulges } : { vertices }
}

/** Ángulo con signo de `a` a `b` alrededor de `c`. */
function turn(a: P2, b: P2, c: P2): number {
  const u = sub(a, c)
  const v = sub(b, c)
  return Math.atan2(cross(u, v), u[0] * v[0] + u[1] * v[1])
}

/** ¿`b` está sobre la recta de `a` a `c` (dentro de la tolerancia)? */
function collinear(a: P2, b: P2, c: P2, tol: number): boolean {
  const d = sub(c, a)
  const L = len(d)
  return L > 0 && Math.abs(cross(d, sub(b, a))) / L <= tol
}
