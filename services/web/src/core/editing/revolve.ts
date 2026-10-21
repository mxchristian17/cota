import type { Vec3 } from '../math'
import type { RevolveProps } from '../document/types'

/**
 * REVOLVE con eje cualquiera: construcción de la hoja a partir de un perfil y un eje, marco del
 * eje y malla (anillos + tapas en revoluciones parciales) con las caras hacia afuera.
 */

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const addv = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
const norm = (a: Vec3): Vec3 => scale(a, 1 / (len(a) || 1))

export const TAU = Math.PI * 2

export interface RevolveFrame {
  /** Dirección del eje. */
  a: Vec3
  /** Dirección del perfil al empezar (φ = 0), ⟂ al eje. */
  u: Vec3
  /** `a × u`: hacia donde gira la revolución con ángulo positivo. */
  w: Vec3
}

/** Marco del eje de una revolución (legado sin `axis`/`ref`: eje Z, perfil en +X). */
export function revolveFrame(p: RevolveProps): RevolveFrame {
  const a = norm(p.axis ?? [0, 0, 1])
  const r0 = p.ref ?? (Math.abs(a[2]) < 0.9 ? cross([0, 0, 1], a) : [1, 0, 0])
  const u = norm(sub(r0, scale(a, dot(r0, a))))
  return { a, u, w: cross(a, u) }
}

/** Punto del perfil `[r, h]` girado `phi` alrededor del eje. */
export function revolvePoint(base: Vec3, f: RevolveFrame, r: number, h: number, phi: number): Vec3 {
  const dir = addv(scale(f.u, Math.cos(phi)), scale(f.w, Math.sin(phi)))
  return addv(addv(base, scale(f.a, h)), scale(dir, r))
}

/** Ángulo barrido (con signo); 2π si no se indicó. */
export const revolveAngle = (p: RevolveProps): number => p.angle ?? TAU
export const isFullRevolve = (p: RevolveProps): boolean => Math.abs(revolveAngle(p)) >= TAU - 1e-9

/** Perfil sin el punto de cierre repetido. */
export function openProfile(profile: Array<[number, number]>): Array<[number, number]> {
  const n = profile.length
  if (n > 1 && Math.hypot(profile[0][0] - profile[n - 1][0], profile[0][1] - profile[n - 1][1]) < 1e-12) return profile.slice(0, -1)
  return profile
}

export type RevolveResult = { props: RevolveProps } | { error: string }

/**
 * Hoja REVOLVE para un perfil plano cerrado (puntos de mundo) y un eje `start → end`. Como en el CAD clásico,
 * el perfil y el eje deben estar en el mismo plano y el eje no puede cruzar el perfil. `angle` en
 * radianes con signo (negativo = `Reverse`); `startAngle` gira el punto de partida.
 */
export function revolveProfile(profile: Vec3[], start: Vec3, end: Vec3, angle: number, startAngle = 0, segments = 48): RevolveResult {
  const axisV = sub(end, start)
  if (len(axisV) < 1e-9) return { error: 'Invalid axis.' }
  const a = norm(axisV)
  let pts = profile
  if (pts.length > 1 && len(sub(pts[0], pts[pts.length - 1])) < 1e-12) pts = pts.slice(0, -1)
  if (pts.length < 3) return { error: 'The profile must be a closed object.' }
  const parts = pts.map((p) => {
    const d = sub(p, start)
    const h = dot(d, a)
    return { h, q: sub(d, scale(a, h)) }
  })
  const size = Math.max(1, ...parts.map((x) => Math.hypot(len(x.q), x.h)))
  const tol = 1e-7 * size
  const far = parts.reduce((m, x) => (len(x.q) > len(m.q) ? x : m))
  if (len(far.q) <= tol) return { error: 'The profile lies on the axis.' }
  const u = norm(far.q)
  // Coplanar con el eje: cada componente radial es paralela a `u`.
  if (parts.some((x) => len(cross(x.q, u)) > 1e-6 * size)) return { error: 'The profile and the axis must lie in the same plane.' }
  const rh: Array<[number, number]> = parts.map((x) => [dot(x.q, u), x.h])
  if (rh.some(([r]) => r < -tol)) return { error: 'The axis cannot cross the profile.' }
  const w = cross(a, u)
  const ref = addv(scale(u, Math.cos(startAngle)), scale(w, Math.sin(startAngle)))
  const ang = Math.abs(angle) >= TAU - 1e-9 ? undefined : angle
  return {
    props: {
      op: 'REVOLVE',
      base: start,
      axis: a,
      ref,
      profile: rh.map(([r, h]) => [Math.max(0, r), h]),
      segments,
      ...(ang !== undefined ? { angle: ang } : {}),
    },
  }
}

/** Área con signo de un polígono 2D. */
function signedArea(pts: Array<[number, number]>): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % pts.length]
    s += x0 * y1 - x1 * y0
  }
  return s / 2
}

/** Triangulación por recorte de orejas de un polígono simple **antihorario** (índices). */
export function earClip(pts: Array<[number, number]>): Array<[number, number, number]> {
  const idx = pts.map((_, i) => i)
  const out: Array<[number, number, number]> = []
  const cr = (o: number, a: number, b: number): number =>
    (pts[a][0] - pts[o][0]) * (pts[b][1] - pts[o][1]) - (pts[a][1] - pts[o][1]) * (pts[b][0] - pts[o][0])
  const inside = (p: number, a: number, b: number, c: number): boolean =>
    cr(a, b, p) >= -1e-12 && cr(b, c, p) >= -1e-12 && cr(c, a, p) >= -1e-12
  let guard = idx.length * idx.length + 10
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false
    for (let k = 0; k < idx.length; k++) {
      const a = idx[(k + idx.length - 1) % idx.length]
      const b = idx[k]
      const c = idx[(k + 1) % idx.length]
      if (cr(a, b, c) <= 1e-14) continue // reflejo o colineal
      if (idx.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue
      out.push([a, b, c])
      idx.splice(k, 1)
      clipped = true
      break
    }
    if (!clipped) idx.splice(0, 1) // polígono degenerado: se descarta un vértice y se sigue
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]])
  return out
}

/** Ángulo (grados) a partir del cual una esquina del perfil es arista viva (normales sin suavizar). */
const CREASE = Math.cos((30 * Math.PI) / 180)

/**
 * Malla de una revolución con eje: posiciones + índices (triángulos hacia afuera). Las esquinas vivas del
 * perfil duplican la columna de vértices (normales nítidas); los vértices sobre el eje se fusionan; las
 * revoluciones parciales llevan tapas planas.
 */
export function revolveMesh(p: RevolveProps): { positions: number[]; indices: number[] } {
  let prof = openProfile(p.profile)
  if (prof.length < 3) return { positions: [], indices: [] }
  if (signedArea(prof) < 0) prof = [...prof].reverse()
  const f = revolveFrame(p)
  const theta = revolveAngle(p)
  const full = isFullRevolve(p)
  const n = Number.isFinite(p.segments) ? Math.min(512, p.segments) : 48 // tope: un archivo o la IA pueden traer valores absurdos
  const segs = full ? Math.max(3, n) : Math.max(2, Math.ceil((n * Math.abs(theta)) / TAU))
  const rings = full ? segs : segs + 1
  const m = prof.length
  const size = Math.max(1, ...prof.map(([r, h]) => Math.hypot(r, h)))
  const onAxis = prof.map(([r]) => r <= 1e-9 * size)
  // ¿El vértice i es suave (sus dos aristas casi alineadas)? Entonces comparten columna.
  const smooth = prof.map((_, i) => {
    const [x0, y0] = prof[(i + m - 1) % m]
    const [x1, y1] = prof[i]
    const [x2, y2] = prof[(i + 1) % m]
    const ax = x1 - x0, ay = y1 - y0, bx = x2 - x1, by = y2 - y1
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by)
    return la > 0 && lb > 0 && (ax * bx + ay * by) / (la * lb) >= CREASE
  })
  const positions: number[] = []
  const push = (v: Vec3): number => {
    positions.push(v[0], v[1], v[2])
    return positions.length / 3 - 1
  }
  // Columna de vértices (uno por anillo) de un vértice del perfil.
  const column = (i: number): number[] => {
    const [r, h] = prof[i]
    if (onAxis[i]) {
      const v = push(revolvePoint(p.base, f, 0, h, 0))
      return Array.from({ length: rings }, () => v)
    }
    return Array.from({ length: rings }, (_, k) => push(revolvePoint(p.base, f, r, h, (theta * k) / segs)))
  }
  const shared = prof.map((_, i) => (smooth[i] ? column(i) : null))
  const indices: number[] = []
  const tri = (x: number, y: number, z: number): void => {
    if (x !== y && y !== z && x !== z) indices.push(x, y, z)
  }
  const ring = (k: number): number => (full ? k % segs : k)
  for (let i = 0; i < m; i++) {
    const i1 = (i + 1) % m
    const c0 = shared[i] ?? column(i)
    const c1 = shared[i1] ?? column(i1)
    for (let k = 0; k < segs; k++) {
      const A = c0[ring(k)], B = c1[ring(k)], C = c1[ring(k + 1)], D = c0[ring(k + 1)]
      tri(A, D, C)
      tri(A, C, B)
    }
  }
  if (!full) {
    // Tapas planas (vértices propios para normales nítidas): en φ=0 mira hacia −w, en φ=θ hacia +w(θ).
    for (const [k, flip] of [[0, false], [segs, true]] as const) {
      const base = prof.map(([r, h]) => push(revolvePoint(p.base, f, r, h, (theta * k) / segs)))
      for (const [x, y, z] of earClip(prof)) {
        if (flip) tri(base[x], base[z], base[y])
        else tri(base[x], base[y], base[z])
      }
    }
  }
  if (theta < 0) {
    for (let t = 0; t < indices.length; t += 3) [indices[t + 1], indices[t + 2]] = [indices[t + 2], indices[t + 1]]
  }
  return { positions, indices }
}
