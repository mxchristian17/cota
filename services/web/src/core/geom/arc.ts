import type { Vec3 } from '../math'
import type { ArcProps } from '../document/types'

/**
 * Geometría del arco de circunferencia.
 *
 * Convención **DXF**: el arco va de `startAngle` a `endAngle` **antihorario dentro de su plano**, y
 * un arco dibujado en sentido horario se guarda con `normal = [0,0,-1]` (exactamente lo que hace
 * el CAD clásico). Así el sentido de dibujo nunca se pierde y el round-trip es exacto.
 *
 * Todos los helpers resuelven el arco a través de `arcBasis`, de modo que funcionan igual con el
 * plano normal y con el invertido sin casos especiales en el resto del código.
 */

export const TAU = Math.PI * 2

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const mag = (v: Vec3): number => Math.hypot(v[0], v[1], v[2])
const normalize = (v: Vec3): Vec3 => {
  const L = mag(v) || 1
  return [v[0] / L, v[1] / L, v[2] / L]
}

/** Ángulo normalizado a [0, 2π). */
export const normAngle = (a: number): number => ((a % TAU) + TAU) % TAU

export interface ArcBasis {
  /** Eje desde el que se miden los ángulos. */
  u: Vec3
  /** Eje a 90° antihorario de `u` dentro del plano. */
  v: Vec3
  n: Vec3
}

/**
 * Base ortonormal del plano del arco. Para un plano paralelo a XY el eje de ángulos es +X (la
 * convención de la OCS del DXF y lo que espera el resto del código 2D); con la normal invertida el
 * eje `v` apunta a −Y, por lo que los ángulos crecen en sentido horario visto desde +Z.
 */
export function arcBasis(normal?: Vec3): ArcBasis {
  const n = normalize(normal && mag(normal) > 1e-9 ? normal : [0, 0, 1])
  if (Math.abs(n[2]) > 1 - 1e-9) {
    return { u: [1, 0, 0], v: [0, n[2] > 0 ? 1 : -1, 0], n }
  }
  const ref: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const u = normalize(cross(ref, n))
  return { u, v: normalize(cross(n, u)), n }
}

/** Barrido antihorario de `start` a `end`, en (0, 2π]. Un barrido nulo se toma como vuelta completa. */
export function arcSweep(startAngle: number, endAngle: number): number {
  const d = normAngle(endAngle - startAngle)
  return d < 1e-12 ? TAU : d
}

/** Barrido del arco, en radianes. */
export const sweepOf = (a: ArcProps): number => arcSweep(a.startAngle, a.endAngle)

/** Punto del arco al ángulo indicado (medido en su plano). */
export function arcPointAtAngle(a: ArcProps, angle: number): Vec3 {
  const { u, v } = arcBasis(a.normal)
  const c = Math.cos(angle) * a.radius
  const s = Math.sin(angle) * a.radius
  return [
    a.center[0] + c * u[0] + s * v[0],
    a.center[1] + c * u[1] + s * v[1],
    a.center[2] + c * u[2] + s * v[2],
  ]
}

/** Punto a la fracción `t` ∈ [0,1] del barrido (0 = inicio, 1 = fin). */
export function arcPointAt(a: ArcProps, t: number): Vec3 {
  return arcPointAtAngle(a, a.startAngle + sweepOf(a) * t)
}

/** Dirección unitaria de avance del arco en la fracción `t` (tangente). */
export function arcTangentAt(a: ArcProps, t: number): Vec3 {
  const { u, v } = arcBasis(a.normal)
  const ang = a.startAngle + sweepOf(a) * t
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  return normalize([-s * u[0] + c * v[0], -s * u[1] + c * v[1], -s * u[2] + c * v[2]])
}

/** Extremos del arco: `[inicio, fin]` en el orden de dibujo. */
export function arcEndpoints(a: ArcProps): [Vec3, Vec3] {
  return [arcPointAtAngle(a, a.startAngle), arcPointAtAngle(a, a.endAngle)]
}

/** Punto medio del arco (el del barrido, no el de la cuerda). */
export function arcMidpoint(a: ArcProps): Vec3 {
  return arcPointAt(a, 0.5)
}

/** ¿El ángulo (en el plano del arco) cae dentro del barrido? */
export function arcContainsAngle(a: ArcProps, angle: number, eps = 1e-9): boolean {
  return normAngle(angle - a.startAngle) <= sweepOf(a) + eps
}

/** Longitud del arco. */
export const arcLength = (a: ArcProps): number => a.radius * sweepOf(a)

/** Cuadrantes **dentro** del barrido (0°, 90°, 180°, 270° del plano del arco). */
export function arcQuadrants(a: ArcProps): Vec3[] {
  const out: Vec3[] = []
  for (let k = 0; k < 4; k++) {
    const ang = (k * Math.PI) / 2
    if (arcContainsAngle(a, ang)) out.push(arcPointAtAngle(a, ang))
  }
  return out
}

/**
 * Cantidad de segmentos para tesselar el arco: **proporcional al barrido**, con el mismo paso angular
 * que usa el círculo completo (96 segmentos). Un arco de 90° gasta 24 y no 96.
 */
export function arcSegmentCount(sweep: number, full = 96): number {
  return Math.max(4, Math.ceil((Math.abs(sweep) / TAU) * full))
}

/** Puntos del arco, **incluyendo los dos extremos**. */
export function tessellateArc(a: ArcProps, segments?: number): Vec3[] {
  const sweep = sweepOf(a)
  const n = Math.max(1, segments ?? arcSegmentCount(sweep))
  const out: Vec3[] = []
  for (let i = 0; i <= n; i++) out.push(arcPointAtAngle(a, a.startAngle + (i / n) * sweep))
  return out
}

/**
 * Caja envolvente **real** del arco en XY: sus dos extremos más los cuadrantes que el barrido
 * atraviesa (no la del círculo completo).
 */
export function arcBounds(a: ArcProps): { minX: number; minY: number; maxX: number; maxY: number } {
  const pts = [...arcEndpoints(a), ...arcQuadrants(a)]
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

// --- Constructores (plano XY del mundo) -------------------------------------

/** Ángulo en XY del vector `center → p`. */
const angleAt = (center: Vec3, p: Vec3): number => Math.atan2(p[1] - center[1], p[0] - center[0])

/**
 * Arco por centro, radio y los ángulos **de mundo** de sus extremos, en el sentido pedido.
 * El sentido horario se expresa invirtiendo la normal (convención DXF).
 */
export function arcFromAngles(
  center: Vec3,
  radius: number,
  startWorld: number,
  endWorld: number,
  clockwise = false,
): ArcProps | null {
  if (!(radius > 1e-9) || !isFinite(startWorld) || !isFinite(endWorld)) return null
  return clockwise
    ? { center, radius, startAngle: normAngle(-startWorld), endAngle: normAngle(-endWorld), normal: [0, 0, -1] }
    : { center, radius, startAngle: normAngle(startWorld), endAngle: normAngle(endWorld), normal: [0, 0, 1] }
}

/** ¿Es el arco horario visto desde +Z? (lo que indica su normal invertida). */
export const arcIsClockwise = (a: ArcProps): boolean => (a.normal?.[2] ?? 1) < 0

/** Arco de 3 puntos: pasa por `p1`, `p2` y `p3` (el modo por defecto del CAD clásico). */
export function arcFrom3Points(p1: Vec3, p2: Vec3, p3: Vec3): ArcProps | null {
  const ax = p1[0]
  const ay = p1[1]
  const bx = p2[0]
  const by = p2[1]
  const cx = p3[0]
  const cy = p3[1]
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
  if (Math.abs(d) < 1e-12) return null // los tres puntos son colineales
  const a2 = ax * ax + ay * ay
  const b2 = bx * bx + by * by
  const c2 = cx * cx + cy * cy
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d
  const center: Vec3 = [ux, uy, p1[2]]
  const radius = Math.hypot(ax - ux, ay - uy)
  // El signo del área orientada p1→p2→p3 da el sentido de recorrido.
  const orient = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  return arcFromAngles(center, radius, angleAt(center, p1), angleAt(center, p3), orient < 0)
}

/** Start, Center, End — el CAD clásico lo dibuja **antihorario** desde el inicio. */
export function arcFromStartCenterEnd(start: Vec3, center: Vec3, end: Vec3, clockwise = false): ArcProps | null {
  const radius = Math.hypot(start[0] - center[0], start[1] - center[1])
  return arcFromAngles(
    [center[0], center[1], start[2]],
    radius,
    angleAt(center, start),
    angleAt(center, end),
    clockwise,
  )
}

/** Start, Center, Angle — ángulo incluido en radianes; negativo = horario. */
export function arcFromStartCenterAngle(start: Vec3, center: Vec3, included: number): ArcProps | null {
  const sweep = Math.abs(included)
  if (sweep < 1e-9) return null
  const radius = Math.hypot(start[0] - center[0], start[1] - center[1])
  const a0 = angleAt(center, start)
  const cw = included < 0
  return arcFromAngles([center[0], center[1], start[2]], radius, a0, cw ? a0 - sweep : a0 + sweep, cw)
}

/**
 * Start, Center, Length of chord — la cuerda determina el barrido. Una longitud **negativa** pide el
 * arco mayor (comportamiento del CAD clásico).
 */
export function arcFromStartCenterLength(start: Vec3, center: Vec3, chord: number): ArcProps | null {
  const radius = Math.hypot(start[0] - center[0], start[1] - center[1])
  const half = Math.abs(chord) / 2
  if (!(radius > 1e-9) || half > radius + 1e-9) return null
  const minor = 2 * Math.asin(Math.min(1, half / radius))
  const sweep = chord < 0 ? TAU - minor : minor
  if (sweep < 1e-9) return null
  const a0 = angleAt(center, start)
  return arcFromAngles([center[0], center[1], start[2]], radius, a0, a0 + sweep, false)
}

/** Centro de un arco que va de `start` a `end` con el barrido indicado (signo = sentido). */
function centerFromChordSweep(start: Vec3, end: Vec3, sweep: number): { center: Vec3; radius: number } | null {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const chord = Math.hypot(dx, dy)
  const s = Math.abs(sweep)
  if (chord < 1e-9 || s < 1e-9 || s > TAU - 1e-9) return null
  const radius = chord / 2 / Math.sin(s / 2)
  const h = chord / 2
  const d = Math.sqrt(Math.max(0, radius * radius - h * h))
  // Normal izquierda de start→end; el centro queda a un lado u otro según el sentido y si pasa de 180°.
  const nx = -dy / chord
  const ny = dx / chord
  const side = (sweep > 0 ? 1 : -1) * (s < Math.PI ? 1 : -1)
  return {
    center: [start[0] + dx / 2 + nx * d * side, start[1] + dy / 2 + ny * d * side, start[2]],
    radius,
  }
}

/** Start, End, Angle — ángulo incluido en radianes; negativo = horario. */
export function arcFromStartEndAngle(start: Vec3, end: Vec3, included: number): ArcProps | null {
  const c = centerFromChordSweep(start, end, included)
  if (!c) return null
  return arcFromAngles(c.center, c.radius, angleAt(c.center, start), angleAt(c.center, end), included < 0)
}

/** Start, End, Radius — el CAD clásico dibuja el arco **menor antihorario**; un radio negativo pide el mayor. */
export function arcFromStartEndRadius(start: Vec3, end: Vec3, radius: number): ArcProps | null {
  const r = Math.abs(radius)
  const chord = Math.hypot(end[0] - start[0], end[1] - start[1])
  if (!(r > 1e-9) || chord < 1e-9 || chord > 2 * r + 1e-9) return null
  const minor = 2 * Math.asin(Math.min(1, chord / 2 / r))
  const sweep = radius < 0 ? TAU - minor : minor
  const c = centerFromChordSweep(start, end, sweep)
  if (!c) return null
  return arcFromAngles(c.center, c.radius, angleAt(c.center, start), angleAt(c.center, end), false)
}

/** Start, End, Direction — `dir` es la tangente en el punto inicial (vector en XY). */
export function arcFromStartEndDirection(start: Vec3, end: Vec3, dir: Vec3): ArcProps | null {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const chord = Math.hypot(dx, dy)
  const dl = Math.hypot(dir[0], dir[1])
  if (chord < 1e-9 || dl < 1e-9) return null
  // Ángulo firmado de la tangente a la cuerda: el barrido es su doble.
  const alpha = Math.atan2(dir[0] * dy - dir[1] * dx, dir[0] * dx + dir[1] * dy)
  const sweep = 2 * alpha
  if (Math.abs(sweep) < 1e-9 || Math.abs(sweep) > TAU - 1e-9) return null
  const c = centerFromChordSweep(start, end, sweep)
  if (!c) return null
  return arcFromAngles(c.center, c.radius, angleAt(c.center, start), angleAt(c.center, end), sweep < 0)
}

/** ¿El barrido es una vuelta completa? (el CAD clásico no admite arcos cerrados: eso es un CIRCLE). */
export function arcIsFullTurn(a: ArcProps): boolean {
  return Math.abs(sweepOf(a) - TAU) < 1e-9
}

/**
 * Arco calculado en coordenadas locales de un plano (XY local, normal ±Z) llevado a 3D: el
 * plano tiene ejes `u`, `v`, normal `n` y está a la altura `w` sobre el origen. Devuelve el arco con su
 * normal real y los ángulos medidos en la base de esa normal.
 */
export function arcFromLocal(a: ArcProps, u: Vec3, v: Vec3, n: Vec3, w: number): ArcProps {
  const toW = (q: Vec3): Vec3 => [0, 1, 2].map((i) => q[0] * u[i] + q[1] * v[i] + (q[2] + w) * n[i]) as Vec3
  const normal: Vec3 = a.normal[2] < 0 ? [-n[0], -n[1], -n[2]] : [n[0], n[1], n[2]]
  const center = toW(a.center)
  const b = arcBasis(normal)
  const ang = (q: Vec3) => {
    const d = [q[0] - center[0], q[1] - center[1], q[2] - center[2]]
    return normAngle(Math.atan2(d[0] * b.v[0] + d[1] * b.v[1] + d[2] * b.v[2], d[0] * b.u[0] + d[1] * b.u[1] + d[2] * b.u[2]))
  }
  return { center, radius: a.radius, normal, startAngle: ang(toW(arcPointAtAngle(a, a.startAngle))), endAngle: ang(toW(arcPointAtAngle(a, a.endAngle))) }
}
