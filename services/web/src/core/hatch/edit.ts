import type { Vec3 } from '../math'
import type { HatchProps } from '../document/types'
import { loopPoints } from './geometry'

/**
 * Edición geométrica de sombreados: MOVE, SCALE, MIRROR, bloques y grips. Los lazos, el origen
 * del patrón y los puntos internos (asociatividad) se mueven juntos.
 */

/** Puntos de los lazos (con los arcos tesselados), para la caja, la ventana de selección y la vista previa. */
export function hatchPoints(p: HatchProps): Vec3[] {
  return p.loops.flatMap((l) => loopPoints(l, p.normal))
}

/**
 * Copia del sombreado con sus puntos llevados por `P`. `scale` multiplica la escala del patrón (SCALE y la
 * escala de una inserción); `mirror` invierte el sentido de los arcos. Con MIRRHATCH = 0 el patrón no se
 * refleja: el ángulo no cambia.
 */
export function mapHatch(p: HatchProps, P: (v: Vec3) => Vec3, scale = 1, mirror = false): HatchProps {
  const q = structuredClone(p)
  q.loops = p.loops.map((l) => ({
    vertices: l.vertices.map(P),
    ...(l.bulges ? { bulges: mirror ? l.bulges.map((b) => -b) : [...l.bulges] } : {}),
  }))
  q.origin = P(p.origin)
  if (scale !== 1) {
    q.scale = p.scale * scale
    if (p.spacing !== undefined) q.spacing = p.spacing * scale
  }
  if (p.assoc?.seeds) q.assoc = { ...p.assoc, seeds: p.assoc.seeds.map(P) }
  return q
}

/** Centro de la caja de los lazos (el grip de un sombreado, como el del CAD clásico). */
export function hatchCenter(p: HatchProps): Vec3 {
  const pts = hatchPoints(p)
  if (!pts.length) return p.origin
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (const q of pts) for (let i = 0; i < 3; i++) {
    lo[i] = Math.min(lo[i], q[i])
    hi[i] = Math.max(hi[i], q[i])
  }
  return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
}
