import type { Vec3 } from '../math'

/** Operaciones vectoriales 3D mínimas (sin dependencias de three). */
export const vadd = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const vsub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const vscale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const vdot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const vcross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const vlen = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
export const vdist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** Vector unitario (o el mismo vector si es nulo). */
export function vnorm(a: Vec3): Vec3 {
  const l = vlen(a)
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : a
}

/** Punto más cercano a `p` sobre el segmento [a,b] y su parámetro (0..1). */
export function closestOnSegment(p: Vec3, a: Vec3, b: Vec3): { point: Vec3; t: number } {
  const ab = vsub(b, a)
  const l2 = vdot(ab, ab)
  const t = l2 > 0 ? Math.max(0, Math.min(1, vdot(vsub(p, a), ab) / l2)) : 0
  return { point: vadd(a, vscale(ab, t)), t }
}
