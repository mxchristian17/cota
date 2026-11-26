import type { Vec3 } from '../math'
import type { HatchLoop, HatchProps, PatternLine } from '../document/types'
import { arcBasis } from '../geom/arc'
import { polylinePoints } from '../geom/polyline'
import { hatchPattern, SOLID, USER, userPattern } from './patterns'

/**
 * Geometría de un sombreado: lazos en 2D del plano, líneas del patrón recortadas con la regla
 * par-impar (como el CAD clásico) y regiones para el relleno sólido.
 */

export type P2 = [number, number]
export type Ring = P2[]

/** Base del plano del sombreado (la de arcos y textos) y su elevación. */
export interface HatchFrame {
  u: Vec3
  v: Vec3
  n: Vec3
  h: number
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export function hatchFrame(p: Pick<HatchProps, 'normal' | 'loops'>): HatchFrame {
  const { u, v, n } = arcBasis(p.normal ?? [0, 0, 1])
  const v0 = p.loops[0]?.vertices[0] ?? [0, 0, 0]
  return { u, v, n, h: dot(v0, n) }
}

export const to2 = (p: Vec3, f: HatchFrame): P2 => [dot(p, f.u), dot(p, f.v)]
export const to3 = (q: P2, f: HatchFrame): Vec3 => [0, 1, 2].map((i) => f.u[i] * q[0] + f.v[i] * q[1] + f.n[i] * f.h) as Vec3

/** Puntos (mundo) del lazo cerrado, con los arcos tesselados; el último no repite el primero. */
export function loopPoints(loop: HatchLoop, normal?: Vec3): Vec3[] {
  const pts = polylinePoints({ vertices: loop.vertices, bulges: loop.bulges, closed: true, normal })
  if (pts.length > 1) pts.pop()
  return pts
}

/** Lazos del sombreado en 2D del plano. */
export function hatchRings(p: Pick<HatchProps, 'normal' | 'loops'>, f: HatchFrame = hatchFrame(p)): Ring[] {
  return p.loops.map((l) => loopPoints(l, p.normal).map((q) => to2(q, f))).filter((r) => r.length >= 3)
}

export function ringArea(r: Ring): number {
  let a = 0
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i]
    const [x1, y1] = r[(i + 1) % r.length]
    a += x0 * y1 - x1 * y0
  }
  return a / 2
}

export function pointInRing(q: P2, r: Ring): boolean {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]
    const [xj, yj] = r[j]
    if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Nivel de anidamiento de cada lazo (cuántos otros lo contienen). */
export function ringDepths(rings: Ring[]): number[] {
  const areas = rings.map((r) => Math.abs(ringArea(r)))
  return rings.map((r, i) =>
    rings.reduce((n, o, j) => (j !== i && areas[j] > areas[i] && pointInRing(interiorPoint(r), o) ? n + 1 : n), 0),
  )
}

/** Un punto del lazo apenas desplazado hacia adentro (para las pruebas de contención). */
function interiorPoint(r: Ring): P2 {
  // Punto medio del primer lado, corrido un poco a su izquierda según la orientación del lazo.
  const [a, b] = [r[0], r[1]]
  const s = Math.sign(ringArea(r)) || 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L = Math.hypot(dx, dy) || 1
  const e = 1e-6 * L
  return [(a[0] + b[0]) / 2 - (dy / L) * e * s, (a[1] + b[1]) / 2 + (dx / L) * e * s]
}

/** Regiones par-impar: cada lazo de nivel par con sus agujeros directos (nivel impar inmediato). */
export function hatchRegions(rings: Ring[]): Array<{ outer: Ring; holes: Ring[] }> {
  const depth = ringDepths(rings)
  const areas = rings.map((r) => Math.abs(ringArea(r)))
  const out: Array<{ outer: Ring; holes: Ring[] }> = []
  rings.forEach((r, i) => {
    if (depth[i] % 2) return
    const holes = rings.filter((h, j) => depth[j] === depth[i] + 1 && areas[j] < areas[i] && pointInRing(interiorPoint(h), r))
    out.push({ outer: r, holes })
  })
  return out
}

/** Área exacta de un lazo (polígono de los vértices + el segmento circular de cada bulge), en su plano. */
export function loopArea(loop: HatchLoop, f: HatchFrame): number {
  const v = loop.vertices.map((q) => to2(q, f))
  const n = v.length
  let a = 0
  for (let i = 0; i < n; i++) {
    const [x0, y0] = v[i]
    const [x1, y1] = v[(i + 1) % n]
    a += (x0 * y1 - x1 * y0) / 2
    const b = loop.bulges?.[i] ?? 0
    if (Math.abs(b) > 1e-12) {
      const th = 4 * Math.atan(b)
      const c = Math.hypot(x1 - x0, y1 - y0)
      const r = c / (2 * Math.sin(Math.abs(th) / 2))
      a += Math.sign(th) * ((r * r) / 2) * (Math.abs(th) - Math.sin(Math.abs(th)))
    }
  }
  return a
}

/** Área sombreada (regla par-impar: cada lazo suma o resta según su anidamiento). */
export function hatchArea(p: Pick<HatchProps, 'normal' | 'loops'>): number {
  const f = hatchFrame(p)
  const rings = hatchRings(p, f)
  if (rings.length !== p.loops.length) return 0
  const depth = ringDepths(rings)
  return p.loops.reduce((s, l, i) => s + (depth[i] % 2 ? -1 : 1) * Math.abs(loopArea(l, f)), 0)
}

/** Líneas del patrón del sombreado (sin escalar ni rotar). Vacío para SOLID. */
export function patternLinesOf(p: HatchProps): PatternLine[] {
  const name = p.pattern.toUpperCase()
  if (name === SOLID) return []
  if (name === USER) return userPattern(p.spacing ?? 1, !!p.double)
  return p.custom ?? hatchPattern(name, p.imperial ? 'in' : 'mm')?.lines ?? []
}

/** Límites de generación (en el CAD clásico: "Hatch spacing too dense, or dash size too small"). */
export const MAX_HATCH_LINES = 20000
/** Tramos por sombreado: como el CAD clásico (HPMAXLINES, 1.000.000); un patrón sobre un terreno entero pasa de 300.000. */
export const MAX_HATCH_SEGMENTS = 1_000_000

export interface HatchStrokes {
  segs: Array<[Vec3, Vec3]>
  dots: Vec3[]
  /** El patrón es demasiado denso para el área: no se generó. */
  tooDense?: boolean
}

interface Edge {
  a: P2
  b: P2
  lo: number
  hi: number
}

/** Una línea del patrón ubicada en el plano del sombreado: dirección, normal, punto base, corrimiento y trazos. */
interface PatternFamily {
  D: P2
  N: P2
  B0: P2
  step: P2
  dashes: number[]
  period: number
}

const cross = (u: P2, v: P2): number => u[0] * v[1] - u[1] * v[0]
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)

/** Denominador q (≤ `maxQ`) de una fracción p/q a menos de 1e-8 (relativo) de `x`, o null (fracciones continuas). */
export function smallDenominator(x: number, maxQ = 100): number | null {
  const tol = 1e-8 * Math.max(1, Math.abs(x))
  let [h0, h1, k0, k1] = [1, Math.floor(x), 0, 1]
  let r = x - Math.floor(x)
  for (;;) {
    if (Math.abs(x - h1 / k1) <= tol) return k1
    if (r < 1e-15) return null
    const v = 1 / r
    const a = Math.floor(v)
    r = v - a
    ;[h0, h1] = [h1, a * h1 + h0]
    ;[k0, k1] = [k1, a * k1 + k0]
    if (k1 > maxQ) return null
  }
}

/** Centro de la caja de los lazos. */
function ringsCenter(rings: P2[][]): P2 {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const r of rings)
    for (const [x, y] of r) {
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
  return [(x0 + x1) / 2, (y0 + y1) / 2]
}

/**
 * Corrimiento del origen del patrón hasta el sombreado, un múltiplo de su período común: el dibujo es el
 * mismo, pero se calcula cerca y no a millones de unidades. Lejos, los números del archivo (ángulos y corrimientos con
 * 7–10 cifras) dejan cada línea del patrón corrida distinto, milímetros o centímetros: las piedras de GRAVEL no
 * cerraban. El período común sale de las líneas con trazos: el corrimiento y el período de una son combinaciones
 * racionales simples de los de las otras (y, en las continuas, de su separación). Si no lo son (o está cerca), [0, 0].
 */
export function patternShift(fams: PatternFamily[], R: P2): P2 {
  const f0 = fams.find((f) => f.dashes.length > 0 && f.period > 0)
  if (!f0) return [0, 0]
  const S0 = f0.step
  const P0: P2 = [f0.D[0] * f0.period, f0.D[1] * f0.period]
  const det = cross(S0, P0)
  const size = Math.max(Math.hypot(S0[0], S0[1]), f0.period)
  const d: P2 = [R[0] - f0.B0[0], R[1] - f0.B0[1]]
  if (Math.hypot(d[0], d[1]) < 1000 * size || Math.abs(det) < 1e-12 * size * size) return [0, 0]
  let M = 1
  for (const f of fams) {
    let xs: number[]
    if (f.dashes.length > 0 && f.period > 0) {
      // S0 y P0 en la base (corrimiento, período) de esta línea.
      const P: P2 = [f.D[0] * f.period, f.D[1] * f.period]
      const df = cross(f.step, P)
      xs = [S0, P0].flatMap((v) => [cross(v, P) / df, cross(f.step, v) / df])
    } else {
      // Línea continua: S0 y P0 en múltiplos de su separación.
      const dy = f.step[0] * f.N[0] + f.step[1] * f.N[1]
      xs = [S0, P0].map((v) => (v[0] * f.N[0] + v[1] * f.N[1]) / dy)
    }
    for (const x of xs) {
      const q = smallDenominator(x)
      if (q === null) return [0, 0]
      M = (M / gcd(M, q)) * q
      if (M > 1000) return [0, 0]
    }
  }
  const n1 = Math.round(cross(d, P0) / det / M)
  const n2 = Math.round(cross(S0, d) / det / M)
  return [M * (n1 * S0[0] + n2 * P0[0]), M * (n1 * S0[1] + n2 * P0[1])]
}

/**
 * Líneas del patrón dentro de los lazos (par-impar), en mundo. Cada familia se barre en el orden de su
 * normal; las aristas activas salen de una lista ordenada (barrido), así no se prueba cada línea contra
 * todas las aristas.
 */
export function hatchStrokes(p: HatchProps): HatchStrokes {
  const out: HatchStrokes = { segs: [], dots: [] }
  const lines = patternLinesOf(p)
  if (!lines.length) return out
  const f = hatchFrame(p)
  const rings = hatchRings(p, f)
  if (!rings.length) return out
  const user = p.pattern.toUpperCase() === USER
  const s = user ? 1 : p.scale > 0 ? p.scale : 1
  const O = to2(p.origin ?? [0, 0, 0], f)
  const th = p.angle || 0
  const rot = (x: number, y: number): P2 => [x * Math.cos(th) - y * Math.sin(th), x * Math.sin(th) + y * Math.cos(th)]
  const ringEdges: Array<[P2, P2]> = []
  for (const r of rings) for (let i = 0; i < r.length; i++) ringEdges.push([r[i], r[(i + 1) % r.length]])

  const fams: PatternFamily[] = []
  for (const pl of lines) {
    const a = (pl.angle * Math.PI) / 180 + th
    const D: P2 = [Math.cos(a), Math.sin(a)]
    const N: P2 = [-D[1], D[0]]
    const [ox, oy] = rot(pl.origin[0] * s, pl.origin[1] * s)
    // Corrimiento entre líneas sucesivas (en los ejes de la línea).
    const step: P2 = [(D[0] * pl.delta[0] + N[0] * pl.delta[1]) * s, (D[1] * pl.delta[0] + N[1] * pl.delta[1]) * s]
    if (Math.abs(step[0] * N[0] + step[1] * N[1]) < 1e-12) continue
    const dashes = pl.dashes.map((d) => d * s)
    fams.push({ D, N, B0: [O[0] + ox, O[1] + oy], step, dashes, period: dashes.reduce((t, d) => t + Math.abs(d), 0) })
  }
  // Lejos del origen del patrón (un plano en coordenadas de terreno), se lo trae al lado del sombreado.
  const G = patternShift(fams, ringsCenter(rings))
  for (const fam of fams) fam.B0 = [fam.B0[0] + G[0], fam.B0[1] + G[1]]

  for (const { D, N, B0, step, dashes, period } of fams) {
    const dn = step[0] * N[0] + step[1] * N[1]
    const nOf = (q: P2): number => q[0] * N[0] + q[1] * N[1]
    const edges: Edge[] = ringEdges.map(([ea, eb]) => ({ a: ea, b: eb, lo: Math.min(nOf(ea), nOf(eb)), hi: Math.max(nOf(ea), nOf(eb)) }))
    edges.sort((x, y) => x.lo - y.lo)
    const nMin = edges.reduce((m, e) => Math.min(m, e.lo), Infinity)
    const nMax = edges.reduce((m, e) => Math.max(m, e.hi), -Infinity)
    const n0 = nOf(B0)
    let k0 = Math.ceil((nMin - n0) / dn)
    let k1 = Math.floor((nMax - n0) / dn)
    if (k0 > k1) [k0, k1] = [k1, k0]
    if (k1 - k0 + 1 > MAX_HATCH_LINES) return { segs: [], dots: [], tooDense: true }
    const ks: number[] = []
    for (let k = k0; k <= k1; k++) ks.push(k)
    if (dn < 0) ks.reverse() // barrer en `n` creciente
    let next = 0
    let active: Edge[] = []
    for (const k of ks) {
      const B: P2 = [B0[0] + step[0] * k, B0[1] + step[1] * k]
      const c = nOf(B)
      while (next < edges.length && edges[next].lo <= c) active.push(edges[next++])
      active = active.filter((e) => e.hi >= c)
      const ts: number[] = []
      for (const e of active) {
        const ha = nOf(e.a) - c
        const hb = nOf(e.b) - c
        if (ha > 0 === hb > 0) continue
        const t = ha / (ha - hb)
        const x = e.a[0] + (e.b[0] - e.a[0]) * t
        const y = e.a[1] + (e.b[1] - e.a[1]) * t
        ts.push((x - B[0]) * D[0] + (y - B[1]) * D[1])
      }
      if (ts.length < 2) continue
      ts.sort((x, y) => x - y)
      const at = (t: number): Vec3 => to3([B[0] + D[0] * t, B[1] + D[1] * t], f)
      for (let i = 0; i + 1 < ts.length; i += 2) {
        const [ta, tb] = [ts[i], ts[i + 1]]
        if (tb - ta < 1e-12) continue
        if (!dashes.length || !(period > 0)) out.segs.push([at(ta), at(tb)])
        else {
          // El patrón arranca en el punto base de la línea (t = 0) y se repite cada `period`.
          let pos = Math.floor(ta / period) * period
          while (pos < tb) {
            for (const d of dashes) {
              const len = Math.abs(d)
              if (d > 0) {
                const s0 = Math.max(ta, pos)
                const s1 = Math.min(tb, pos + len)
                if (s1 > s0) out.segs.push([at(s0), at(s1)])
              } else if (d === 0 && pos >= ta && pos <= tb) out.dots.push(at(pos))
              pos += len
              if (pos >= tb) break
            }
            if (out.segs.length > MAX_HATCH_SEGMENTS) return { segs: [], dots: [], tooDense: true }
          }
        }
      }
      if (out.segs.length > MAX_HATCH_SEGMENTS) return { segs: [], dots: [], tooDense: true }
    }
  }
  return out
}

// Cache por contenido: las líneas se regeneran sólo si cambia el sombreado.
const cache = new Map<string, HatchStrokes>()

export function hatchStrokesCached(p: HatchProps): HatchStrokes {
  const key = JSON.stringify([p.loops, p.normal, p.pattern, p.scale, p.angle, p.origin, p.spacing, p.double, p.custom, p.imperial])
  let r = cache.get(key)
  if (!r) {
    r = hatchStrokes(p)
    if (cache.size > 300) cache.delete(cache.keys().next().value as string)
    cache.set(key, r)
  }
  return r
}

/** ¿Es un sombreado sólido? */
export const isSolidHatch = (p: HatchProps): boolean => p.pattern.toUpperCase() === SOLID
