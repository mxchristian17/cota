import { pt, type Pt, type Vec3 } from './math'
import { vcross, vdot, vlen, vnorm, vscale, vsub } from './geom/vec3'

/**
 * Sistema de coordenadas de usuario 3D, como la UCS del CAD clásico: origen y ejes X/Y unitarios y
 * ortogonales en coordenadas de mundo; Z = X × Y (mano derecha). El XY de la UCS es el plano de dibujo.
 */
export interface Ucs {
  origin: Pt
  /** Eje X (unitario, mundo). */
  x: Vec3
  /** Eje Y (unitario, ortogonal a X). */
  y: Vec3
}

export const WORLD_UCS: Ucs = { origin: { x: 0, y: 0, z: 0 }, x: [1, 0, 0], y: [0, 1, 0] }

/** Eje Z de la UCS (normal del plano de dibujo). */
export const ucsZ = (u: Ucs): Vec3 => vnorm(vcross(u.x, u.y))

const v3 = (p: Pt): Vec3 => [p.x, p.y, p.z]

/** Punto de mundo → coordenadas de la UCS. */
export function worldToUcs(p: Pt, u: Ucs): Pt {
  const d: Vec3 = [p.x - u.origin.x, p.y - u.origin.y, p.z - u.origin.z]
  return pt(vdot(d, u.x), vdot(d, u.y), vdot(d, ucsZ(u)))
}

/** Coordenadas de la UCS → punto de mundo. */
export function ucsToWorld(p: Pt, u: Ucs): Pt {
  const z = ucsZ(u)
  return pt(
    u.origin.x + p.x * u.x[0] + p.y * u.y[0] + p.z * z[0],
    u.origin.y + p.x * u.x[1] + p.y * u.y[1] + p.z * z[1],
    u.origin.z + p.x * u.x[2] + p.y * u.y[2] + p.z * z[2],
  )
}

/** Dirección de la UCS → mundo (sin trasladar). */
export function ucsDirToWorld(v: Vec3, u: Ucs): Vec3 {
  const z = ucsZ(u)
  return [0, 1, 2].map((i) => v[0] * u.x[i] + v[1] * u.y[i] + v[2] * z[i]) as Vec3
}

/** Dirección de mundo → UCS. */
export function worldDirToUcs(v: Vec3, u: Ucs): Vec3 {
  return [vdot(v, u.x), vdot(v, u.y), vdot(v, ucsZ(u))]
}

const near = (a: Vec3, b: Vec3, tol = 1e-9) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol && Math.abs(a[2] - b[2]) < tol

/** ¿Es la UCS universal (WCS)? */
export function isWorldUcs(u: Ucs): boolean {
  return near(v3(u.origin), [0, 0, 0]) && near(u.x, [1, 0, 0]) && near(u.y, [0, 1, 0])
}

/** ¿Tiene la UCS los mismos ejes que la universal (XY del mundo, sin giro)? El origen puede diferir. */
export const isWorldAligned = (u: Ucs): boolean => near(u.x, [1, 0, 0]) && near(u.y, [0, 1, 0])

/** ¿El plano XY de la UCS es paralelo al XY del mundo (Z = ±Z del mundo)? */
export const isPlanUcs = (u: Ucs): boolean => Math.abs(ucsZ(u)[2]) > 1 - 1e-9

/** Ángulo de la X de la UCS en el XY del mundo (sólo significativo si `isPlanUcs`). */
export const ucsPlanAngle = (u: Ucs): number => Math.atan2(u.x[1], u.x[0])

/** UCS en planta girada `angle` (rad) alrededor de Z: la UCS 2D de antes. */
export function ucsFromAngle(origin: Pt, angle: number): Ucs {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { origin: { ...origin }, x: [c, s, 0], y: [-s, c, 0] }
}

/**
 * UCS a partir de cualquier forma guardada: la 3D, la 2D vieja `{ origin, angle }` o la de la tabla del
 * documento (`{ origin: Vec3, xAxis, yAxis }`). Ortonormaliza los ejes; si son inválidos, World.
 */
export function normalizeUcs(raw: unknown): Ucs {
  const r = raw as { origin?: Pt | Vec3; x?: Vec3; y?: Vec3; xAxis?: Vec3; yAxis?: Vec3; angle?: number } | null
  if (!r || typeof r !== 'object') return { ...WORLD_UCS }
  const o = r.origin
  const origin: Pt = Array.isArray(o) ? pt(o[0], o[1], o[2] ?? 0) : o ? pt(o.x ?? 0, o.y ?? 0, o.z ?? 0) : pt(0, 0, 0)
  if (typeof r.angle === 'number' && !r.x && !r.xAxis) return ucsFromAngle(origin, r.angle)
  const x = r.x ?? r.xAxis
  const y = r.y ?? r.yAxis
  if (!x || !y) return { ...WORLD_UCS, origin }
  return orthonormal(origin, x, y) ?? { ...WORLD_UCS, origin }
}

/** Ejes ortonormales a partir de una X y un vector del plano XY (Gram-Schmidt). null si son paralelos. */
export function orthonormal(origin: Pt, x: Vec3, inPlane: Vec3): Ucs | null {
  if (vlen(x) < 1e-12) return null
  const ux = vnorm(x)
  const yRaw = vsub(inPlane, vscale(ux, vdot(inPlane, ux)))
  if (vlen(yRaw) < 1e-9 * Math.max(1, vlen(inPlane))) return null
  return { origin: { ...origin }, x: ux, y: vnorm(yRaw) }
}

/** Forma de guardado en el documento (`UcsDef` sin id/nombre). */
export const ucsToDef = (u: Ucs): { origin: Vec3; xAxis: Vec3; yAxis: Vec3 } => ({ origin: v3(u.origin), xAxis: [...u.x], yAxis: [...u.y] })

// --- UCS ortogonales (UCSBASE = World) ---------------------------------------------------------------

export type OrthoUcsName = 'TOP' | 'BOTTOM' | 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT'

/** Ejes X/Y de las UCS ortogonales del CAD clásico respecto del mundo. */
export const ORTHO_UCS: Record<OrthoUcsName, { x: Vec3; y: Vec3 }> = {
  TOP: { x: [1, 0, 0], y: [0, 1, 0] },
  BOTTOM: { x: [1, 0, 0], y: [0, -1, 0] },
  FRONT: { x: [1, 0, 0], y: [0, 0, 1] },
  BACK: { x: [-1, 0, 0], y: [0, 0, 1] },
  LEFT: { x: [0, -1, 0], y: [0, 0, 1] },
  RIGHT: { x: [0, 1, 0], y: [0, 0, 1] },
}

/** UCS ortogonal con origen en el de la UCS base (World: 0,0,0). */
export function orthoUcs(name: OrthoUcsName): Ucs {
  const a = ORTHO_UCS[name]
  return { origin: pt(0, 0, 0), x: [...a.x], y: [...a.y] }
}

// --- Construcción (opciones del comando UCS) ----------------------------------------------------------

/** Mueve el origen sin cambiar los ejes. */
export const ucsWithOrigin = (u: Ucs, origin: Pt): Ucs => ({ origin: { ...origin }, x: [...u.x], y: [...u.y] })

/**
 * UCS por tres puntos (CAD clásico): origen, un punto del +X y un punto del XY con Y positiva. Sin `px` se
 * conserva la orientación; sin `pxy`, la X gira a `px` dejando la Z tan cerca de la actual como se pueda.
 */
export function ucsFrom3Points(cur: Ucs, origin: Pt, px?: Pt | null, pxy?: Pt | null): Ucs | null {
  if (!px) return ucsWithOrigin(cur, origin)
  const x = vsub(v3(px), v3(origin))
  if (vlen(x) < 1e-12) return null
  if (pxy) return orthonormal(origin, x, vsub(v3(pxy), v3(origin)))
  // Sólo X: Y = Z_actual × X (o, si X es paralela a la Z actual, la Y actual).
  const z = ucsZ(cur)
  const y = vcross(z, vnorm(x))
  return orthonormal(origin, x, vlen(y) > 1e-9 ? y : cur.y)
}

/**
 * Arbitrary Axis Algorithm del CAD clásico (OCS): la X que corresponde a una normal. Se usa para la UCS
 * `ZAxis` y para el OCS de DXF.
 */
export function arbitraryAxis(n: Vec3): Vec3 {
  const z = vnorm(n)
  const ref: Vec3 = Math.abs(z[0]) < 1 / 64 && Math.abs(z[1]) < 1 / 64 ? [0, 1, 0] : [0, 0, 1]
  return vnorm(vcross(ref, z))
}

/** UCS con origen `origin` y +Z hacia `pz` (opción `ZAxis`); la X sale del Arbitrary Axis Algorithm. */
export function ucsFromZAxis(origin: Pt, pz: Pt): Ucs | null {
  const z = vsub(v3(pz), v3(origin))
  if (vlen(z) < 1e-12) return null
  const x = arbitraryAxis(z)
  return { origin: { ...origin }, x, y: vnorm(vcross(vnorm(z), x)) }
}

/** UCS con el XY perpendicular a la vista (opción `View`): X a la derecha y Y hacia arriba de la pantalla. */
export function ucsFromView(origin: Pt, right: Vec3, up: Vec3): Ucs | null {
  return orthonormal(origin, right, up)
}

/** Gira la UCS `deg` grados alrededor de su eje X, Y o Z (mano derecha), como `UCS X/Y/Z`. */
export function rotateUcs(u: Ucs, axis: 'X' | 'Y' | 'Z', deg: number): Ucs {
  const t = (deg * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  const z = ucsZ(u)
  const comb = (a: Vec3, b: Vec3, ka: number, kb: number): Vec3 => vnorm([a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb])
  if (axis === 'X') return { origin: { ...u.origin }, x: [...u.x], y: comb(u.y, z, c, s) }
  if (axis === 'Y') {
    // Alrededor de Y: Z → X. X' = X·cos − Z·sin.
    return { origin: { ...u.origin }, x: comb(u.x, z, c, -s), y: [...u.y] }
  }
  return { origin: { ...u.origin }, x: comb(u.x, u.y, c, s), y: comb(u.y, u.x, c, -s) }
}

/** Matriz 4×4 (column-major, como THREE) de UCS → mundo. */
export function ucsMatrix(u: Ucs): number[] {
  const z = ucsZ(u)
  return [u.x[0], u.x[1], u.x[2], 0, u.y[0], u.y[1], u.y[2], 0, z[0], z[1], z[2], 0, u.origin.x, u.origin.y, u.origin.z, 1]
}

/** Igualdad con tolerancia (evita reasignar la misma UCS). */
export function sameUcs(a: Ucs, b: Ucs, tol = 1e-9): boolean {
  return near(v3(a.origin), v3(b.origin), tol) && near(a.x, b.x, tol) && near(a.y, b.y, tol)
}
