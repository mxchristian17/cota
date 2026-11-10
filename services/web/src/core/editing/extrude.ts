import type { Vec3 } from '../math'
import type { Entity, PolylineProps } from '../document/types'
import { ellipsePoints } from '../geom/ellipse'
import { arcSegmentCount, tessellateArc } from '../geom/arc'
import { bulgeAngle, bulgeArc, bulgeAt, polylinePoints, polylineSpans } from '../geom/polyline'

/** Polilínea cerrada, o abierta que termina donde empieza (p. ej. con un arco que vuelve al primer punto). */
export function closesOnItself(p: PolylineProps): boolean {
  const v = p.vertices
  if (p.closed) return v.length >= 2
  if (v.length < 3) return false
  const [a, b] = [v[0], v[v.length - 1]]
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= 1e-9 * (1 + Math.hypot(a[0], a[1], a[2]))
}

/**
 * Tramos curvos del perfil de `profileOf` (índices `[i, j]` sobre sus puntos, ver `ExtrudeProps.arcs`): la extrusión
 * los guarda para que sus aristas sigan siendo arcos (centro, cuadrantes, punto medio).
 */
export function profileArcs(e: Entity): Array<[number, number]> {
  if (e.type !== 'POLYLINE' || !closesOnItself(e.props)) return []
  const p = e.props
  const out: Array<[number, number]> = []
  let idx = 0
  for (const [i, j] of polylineSpans(p)) {
    const b = bulgeAt(p, i)
    // Igual que `polylinePoints`: un arco de n tramos deja n − 1 puntos intermedios.
    const n = bulgeArc(p.vertices[i], p.vertices[j], b, p.normal) ? arcSegmentCount(Math.abs(bulgeAngle(b))) : 1
    if (n > 1) out.push([idx, idx + n])
    idx += n
  }
  return out
}

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
      if (!closesOnItself(e.props)) return null
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
