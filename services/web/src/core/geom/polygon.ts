import type { Vec3 } from '../math'

/**
 * Polígonos regulares (`POLYGON`). `angle` es la dirección (radianes, desde +X) del punto que
 * marca el radio: un **vértice** si está inscrito en el círculo, el **punto medio de un lado** si está
 * circunscrito (el radio es entonces la apotema).
 */
export function regularPolygon(center: Vec3, sides: number, radius: number, angle: number, circumscribed: boolean): Vec3[] {
  const n = Math.max(3, Math.round(sides))
  const step = (Math.PI * 2) / n
  const r = circumscribed ? radius / Math.cos(Math.PI / n) : radius
  const a0 = circumscribed ? angle + Math.PI / n : angle
  const out: Vec3[] = []
  for (let k = 0; k < n; k++) {
    const a = a0 + k * step
    out.push([center[0] + r * Math.cos(a), center[1] + r * Math.sin(a), center[2]])
  }
  return out
}

/** Ángulo del punto de radio para que la arista inferior quede horizontal (radio tecleado en el CAD clásico). */
export function bottomEdgeAngle(sides: number, circumscribed: boolean): number {
  const n = Math.max(3, Math.round(sides))
  return circumscribed ? -Math.PI / 2 : -Math.PI / 2 - Math.PI / n
}

/** Polígono regular a partir de un lado `a → b`: se construye en sentido antihorario (queda a la izquierda). */
export function polygonFromEdge(a: Vec3, b: Vec3, sides: number): Vec3[] {
  const n = Math.max(3, Math.round(sides))
  const ext = (Math.PI * 2) / n
  const out: Vec3[] = [a, b]
  let dir = Math.atan2(b[1] - a[1], b[0] - a[0])
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  let p = b
  for (let k = 2; k < n; k++) {
    dir += ext
    p = [p[0] + len * Math.cos(dir), p[1] + len * Math.sin(dir), a[2]]
    out.push(p)
  }
  return out
}
