// Tipos y utilidades geométricas básicas (framework-agnostic).

export interface Pt {
  x: number
  y: number
  z: number
}

export type Vec3 = [number, number, number]

export const pt = (x: number, y: number, z = 0): Pt => ({ x, y, z })

export const toVec3 = (p: Pt): Vec3 => [p.x, p.y, p.z]

export const fromVec3 = (v: Vec3): Pt => ({ x: v[0], y: v[1], z: v[2] })

/** Distancia en el plano XY (vista TOP del MVP). */
export const dist2d = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y)

/** Ángulo en grados (positivo antihorario) de la dirección `a` → `b`, en el plano XY. */
export const angleDeg = (a: Pt, b: Pt): number => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
