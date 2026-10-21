import type { Vec3 } from '../math'
import type { Entity } from '../document/types'
import { ellipsePoints } from '../geom/ellipse'
import { tessellateArc } from '../geom/arc'
import { polylinePoints } from '../geom/polyline'

/**
 * Extrae el polígono base de un perfil 2D cerrado apto para extrusión.
 * Devuelve null si la entidad no es un perfil cerrado válido.
 */
/** Normal del plano de un perfil cerrado (fórmula de Newell). [0,0,1] si es degenerado. */
export function profileNormal(profile: Vec3[]): Vec3 {
  let nx = 0
  let ny = 0
  let nz = 0
  const n = profile.length
  for (let i = 0; i < n; i++) {
    const a = profile[i]
    const b = profile[(i + 1) % n]
    nx += (a[1] - b[1]) * (a[2] + b[2])
    ny += (a[2] - b[2]) * (a[0] + b[0])
    nz += (a[0] - b[0]) * (a[1] + b[1])
  }
  const L = Math.hypot(nx, ny, nz)
  return L < 1e-9 ? [0, 0, 1] : [nx / L, ny / L, nz / L]
}

export function profileOf(e: Entity): Vec3[] | null {
  switch (e.type) {
    case 'RECTANGLE': {
      const [x, y, z] = e.props.corner
      const w = e.props.width
      const h = e.props.height
      return [
        [x, y, z],
        [x + w, y, z],
        [x + w, y + h, z],
        [x, y + h, z],
      ]
    }
    case 'POLYLINE': {
      if (!e.props.closed || e.props.vertices.length < 2) return null
      // Los tramos curvos (bulge) se teselan: el perfil conserva sus arcos (en su plano).
      const pts = polylinePoints(e.props).map((v) => [v[0], v[1], v[2]] as Vec3)
      const [a, b] = [pts[0], pts[pts.length - 1]]
      if (pts.length > 1 && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-9) pts.pop()
      return pts.length >= 3 ? pts : null
    }
    case 'CIRCLE':
      // En el plano de su normal (un círculo dibujado en FRONT se extruye en FRONT).
      return tessellateArc({ ...e.props, startAngle: 0, endAngle: 0 }, 48).slice(0, 48)
    case 'ELLIPSE':
      return ellipsePoints(e.props, 48, false)
    default:
      return null
  }
}
