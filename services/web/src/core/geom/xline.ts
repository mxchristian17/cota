import type { Vec3 } from '../math'
import type { LineProps } from '../document/types'

/** Hasta dónde se dibuja una línea infinita desde su punto base: más allá de cualquier vista razonable. */
const REACH = 1e6

/** Extremos que se dibujan de una línea: los suyos, o prolongados si es una línea constructiva (XLINE) o un rayo (RAY). */
export function lineSpan(p: LineProps): [Vec3, Vec3] {
  if (!p.extend) return [p.start, p.end]
  const d = [p.end[0] - p.start[0], p.end[1] - p.start[1], p.end[2] - p.start[2]]
  const l = Math.hypot(d[0], d[1], d[2]) || 1
  const far = (k: number): Vec3 => [p.start[0] + (d[0] / l) * k, p.start[1] + (d[1] / l) * k, p.start[2] + (d[2] / l) * k]
  return [p.extend === 'both' ? far(-REACH) : p.start, far(REACH)]
}
