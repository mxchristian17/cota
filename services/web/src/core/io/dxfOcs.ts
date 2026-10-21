import type { Vec3 } from '../math'
import { arcBasis } from '../geom/arc'
import { arbitraryAxis } from '../ucs'

/**
 * OCS de DXF (sistema de coordenadas del objeto, *Arbitrary Axis Algorithm* del CAD clásico).
 * CIRCLE, ARC, LWPOLYLINE y TEXT guardan sus puntos y ángulos en el OCS de su extrusión (210/220/230).
 * Cota guarda puntos de mundo y mide los ángulos en `arcBasis(normal)`: estas funciones convierten.
 */

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** Ejes del OCS de una extrusión. */
export function ocsAxes(normal: Vec3): { x: Vec3; y: Vec3; z: Vec3 } {
  const z = unit(normal)
  const x = arbitraryAxis(z)
  const y: Vec3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]]
  return { x, y, z }
}

/** ¿La extrusión es la del mundo (+Z)? Entonces OCS = WCS y no se escribe 210. */
export const isWorldExtrusion = (n: Vec3): boolean => Math.abs(n[0]) < 1e-12 && Math.abs(n[1]) < 1e-12 && n[2] > 0

/** Punto de mundo → OCS. */
export function toOcs(p: Vec3, normal: Vec3): Vec3 {
  const { x, y, z } = ocsAxes(normal)
  return [dot(p, x), dot(p, y), dot(p, z)]
}

/** Punto en OCS → mundo. */
export function fromOcs(q: Vec3, normal: Vec3): Vec3 {
  const { x, y, z } = ocsAxes(normal)
  return [0, 1, 2].map((i) => q[0] * x[i] + q[1] * y[i] + q[2] * z[i]) as Vec3
}

/** Ángulo (rad) medido en `arcBasis(normal)` → el mismo ángulo medido en el OCS. */
export function angleToOcs(a: number, normal: Vec3): number {
  const b = arcBasis(normal)
  const d: Vec3 = [0, 1, 2].map((i) => b.u[i] * Math.cos(a) + b.v[i] * Math.sin(a)) as Vec3
  const { x, y } = ocsAxes(normal)
  return Math.atan2(dot(d, y), dot(d, x))
}

/** Ángulo (rad) en el OCS → el mismo ángulo en `arcBasis(normal)`. */
export function angleFromOcs(a: number, normal: Vec3): number {
  const { x, y } = ocsAxes(normal)
  const d: Vec3 = [0, 1, 2].map((i) => x[i] * Math.cos(a) + y[i] * Math.sin(a)) as Vec3
  const b = arcBasis(normal)
  return Math.atan2(dot(d, b.v), dot(d, b.u))
}
