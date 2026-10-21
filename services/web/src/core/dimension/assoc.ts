import type { Vec3 } from '../math'
import type { DimAssocRef, DimensionProps, Entity } from '../document/types'
import { arcBasis, arcEndpoints, arcMidpoint, arcPointAtAngle } from '../geom/arc'

/**
 * Asociatividad de cotas (`DIMASSOC` = 2): cada punto definitorio puede apuntar a un punto
 * de una entidad (extremo, medio, centro, cuadrante, vértice o punto sobre la curva). Al cambiar la
 * geometría se recalculan; si la entidad desaparece, ese punto deja de ser asociativo.
 */

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

function rectCorners(e: Extract<Entity, { type: 'RECTANGLE' }>): Vec3[] {
  const [x, y, z] = e.props.corner
  const { width: w, height: h } = e.props
  return [[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]]
}

/** Ángulo (en el plano del círculo/arco) de un punto respecto del centro. */
function angleOn(c: Vec3, normal: Vec3 | undefined, p: Vec3): number {
  const { u, v } = arcBasis(normal)
  const d = sub(p, c)
  return Math.atan2(dot(d, v), dot(d, u))
}

/** Punto de la entidad que indica la referencia, o null si ya no aplica. */
export function refPoint(e: Entity, r: DimAssocRef): Vec3 | null {
  switch (e.type) {
    case 'LINE': {
      const { start: a, end: b } = e.props
      if (r.kind === 'start') return a
      if (r.kind === 'end') return b
      if (r.kind === 'mid') return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
      if (r.kind === 'on' && r.t !== undefined) return add(a, [(b[0] - a[0]) * r.t, (b[1] - a[1]) * r.t, (b[2] - a[2]) * r.t])
      return null
    }
    case 'ARC':
    case 'CIRCLE': {
      const p = e.props
      const arc = e.type === 'ARC' ? e.props : { ...p, startAngle: 0, endAngle: Math.PI * 2 }
      if (r.kind === 'center') return p.center
      if (e.type === 'ARC' && r.kind === 'start') return arcEndpoints(e.props)[0]
      if (e.type === 'ARC' && r.kind === 'end') return arcEndpoints(e.props)[1]
      if (e.type === 'ARC' && r.kind === 'mid') return arcMidpoint(e.props)
      if (r.kind === 'quadrant' && r.index !== undefined) return arcPointAtAngle(arc, (r.index * Math.PI) / 2)
      if (r.kind === 'on' && r.t !== undefined) return arcPointAtAngle(arc, r.t)
      return null
    }
    case 'POLYLINE': {
      if (r.kind === 'vertex' && r.index !== undefined) return e.props.vertices[r.index] ?? null
      return null
    }
    case 'RECTANGLE':
      return r.kind === 'vertex' && r.index !== undefined ? (rectCorners(e)[r.index] ?? null) : null
    case 'ELLIPSE':
      return r.kind === 'center' ? e.props.center : null
    default:
      return null
  }
}

/**
 * Referencia para un punto `p` tomado sobre la entidad (por snap o clic): el punto característico que
 * coincide, o un punto sobre la curva. Null si `p` no está sobre la entidad.
 */
export function refFor(e: Entity, p: Vec3, tol = 1e-6): DimAssocRef | null {
  const near = (q: Vec3) => len(sub(q, p)) <= tol * Math.max(1, len(q))
  switch (e.type) {
    case 'LINE': {
      const { start: a, end: b } = e.props
      if (near(a)) return { id: e.id, kind: 'start' }
      if (near(b)) return { id: e.id, kind: 'end' }
      const ab = sub(b, a)
      const t = dot(sub(p, a), ab) / (dot(ab, ab) || 1)
      const q = add(a, [ab[0] * t, ab[1] * t, ab[2] * t])
      if (!near(q) || t < -1e-9 || t > 1 + 1e-9) return null
      if (Math.abs(t - 0.5) < 1e-9) return { id: e.id, kind: 'mid' }
      return { id: e.id, kind: 'on', t }
    }
    case 'ARC':
    case 'CIRCLE': {
      const c = e.props.center
      if (near(c)) return { id: e.id, kind: 'center' }
      if (e.type === 'ARC') {
        const [s, en] = arcEndpoints(e.props)
        if (near(s)) return { id: e.id, kind: 'start' }
        if (near(en)) return { id: e.id, kind: 'end' }
        if (near(arcMidpoint(e.props))) return { id: e.id, kind: 'mid' }
      }
      if (Math.abs(len(sub(p, c)) - e.props.radius) > tol * Math.max(1, e.props.radius)) return null
      const a = angleOn(c, e.props.normal, p)
      for (let i = 0; i < 4; i++) if (Math.abs(Math.atan2(Math.sin(a - (i * Math.PI) / 2), Math.cos(a - (i * Math.PI) / 2))) < 1e-9) return { id: e.id, kind: 'quadrant', index: i }
      return { id: e.id, kind: 'on', t: a }
    }
    case 'POLYLINE': {
      const i = e.props.vertices.findIndex(near)
      return i >= 0 ? { id: e.id, kind: 'vertex', index: i } : null
    }
    case 'RECTANGLE': {
      const i = rectCorners(e).findIndex(near)
      return i >= 0 ? { id: e.id, kind: 'vertex', index: i } : null
    }
    case 'ELLIPSE':
      return near(e.props.center) ? { id: e.id, kind: 'center' } : null
    default:
      return null
  }
}

/**
 * Recalcula los puntos de una cota asociativa. Si todos sus puntos asociados se movieron lo mismo (la
 * geometría se trasladó), la línea de cota y el texto acompañan; si no (se estiró), quedan en su lugar.
 * Devuelve true si algo cambió.
 */
export function updateDimension(p: DimensionProps, resolve: (r: DimAssocRef) => Entity | undefined): boolean {
  if (!p.assoc) return false
  let changed = false
  const deltas: Vec3[] = []
  let refs = 0
  p.assoc = p.assoc.map((r, i) => {
    if (!r) return null
    const e = resolve(r)
    const q = e ? refPoint(e, r) : null
    if (!q) {
      changed = true
      return null // la entidad desapareció o cambió de tipo: punto no asociativo
    }
    refs++
    const old = p.points[i]
    if (old && len(sub(q, old)) > 1e-12) {
      deltas.push(sub(q, old))
      p.points[i] = [q[0], q[1], q[2]]
      changed = true
    } else deltas.push([0, 0, 0])
    return r
  })
  if (refs === 0) delete p.assoc
  const moved = deltas.filter((d) => len(d) > 1e-12)
  // Traslación rígida: todos los puntos asociados se movieron igual → la cota entera acompaña.
  if (moved.length > 0 && moved.length === deltas.length && deltas.every((d) => len(sub(d, deltas[0])) < 1e-9)) {
    const d = deltas[0]
    p.textPos = add(p.textPos, d)
    if (p.textAt) p.textAt = add(p.textAt, d)
    // Puntos no asociados (p. ej. el centro desplazado de un DIMJOGGED) también acompañan.
    p.points = p.points.map((q, i) => (p.assoc?.[i] ? q : add(q, d)))
  }
  return changed
}

/**
 * Tras mover el punto definitorio `i` de una cota (grip): si quedó sobre la entidad `e` (snap) se
 * asocia a ella, si no deja de ser asociativo (como el CAD clásico).
 */
export function reassociatePoint(p: DimensionProps, i: number, e: Entity | undefined, dimAssoc: number): void {
  const r = e && e.type !== 'DIMENSION' && dimAssoc === 2 ? refFor(e, p.points[i]) : null
  if (!r && !p.assoc) return
  const assoc = p.assoc ?? p.points.map(() => null)
  assoc[i] = r
  if (assoc.some(Boolean)) p.assoc = assoc
  else delete p.assoc
}

/** ¿Qué tan asociativa es la cota? (para la paleta) */
export function assocState(p: DimensionProps): 'Yes' | 'Partial' | 'No' {
  const refs = p.assoc?.filter(Boolean).length ?? 0
  if (refs === 0) return 'No'
  return refs >= Math.min(p.points.length, p.assoc!.length) ? 'Yes' : 'Partial'
}
