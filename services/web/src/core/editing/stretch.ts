import type { Vec3 } from '../math'
import type { Entity, EntityInput } from '../document/types'
import { translateEntity } from './edit'
import { arcEndpoints, arcFrom3Points, arcMidpoint } from '../geom/arc'

/**
 * STRETCH — estira lo que cae dentro de una **ventana de cruce**.
 *
 * Regla del CAD clásico: los vértices **dentro** de la ventana se desplazan y los de afuera quedan fijos;
 * una entidad completamente contenida se mueve entera. Las entidades que no se deforman (círculos,
 * textos, bloques, sólidos, mallas) se mueven enteras si su punto de definición cae dentro.
 */
export interface StretchBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
  /** Ejes del plano de la ventana; sin ellos, el XY del mundo. X e Y son las coordenadas sobre estos ejes. */
  plane?: { u: Vec3; v: Vec3 }
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Caja a partir de dos esquinas opuestas, en el plano indicado (por defecto, el XY del mundo). */
export function stretchBox(a: Vec3, b: Vec3, plane?: { u: Vec3; v: Vec3 }): StretchBox {
  const [ax, ay, bx, by] = plane ? [dot(a, plane.u), dot(a, plane.v), dot(b, plane.u), dot(b, plane.v)] : [a[0], a[1], b[0], b[1]]
  return {
    minX: Math.min(ax, bx),
    maxX: Math.max(ax, bx),
    minY: Math.min(ay, by),
    maxY: Math.max(ay, by),
    ...(plane ? { plane } : {}),
  }
}

export function inBox(v: Vec3, box: StretchBox): boolean {
  const x = box.plane ? dot(v, box.plane.u) : v[0]
  const y = box.plane ? dot(v, box.plane.v) : v[1]
  return x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY
}

const moved = (v: Vec3, d: Vec3): Vec3 => [v[0] + d[0], v[1] + d[1], v[2] + d[2]]

/** Mueve sólo los vértices contenidos en la caja. */
function stretchPoints(vs: Vec3[], box: StretchBox, d: Vec3): { out: Vec3[]; hits: number } {
  let hits = 0
  const out = vs.map((v) => {
    if (!inBox(v, box)) return v
    hits++
    return moved(v, d)
  })
  return { out, hits }
}

/** Punto de definición de las entidades que no se deforman (se mueven enteras). */
function anchorOf(e: Entity): Vec3 | null {
  switch (e.type) {
    case 'CIRCLE':
    case 'ELLIPSE':
      return e.props.center
    case 'TEXT':
    case 'INSERT':
      return e.props.position
    case 'VIEWPORT':
      return e.props.center
    default:
      return null
  }
}

/** ¿Es un tipo que sólo se mueve entero (no se deforma)? */
function rigid(e: Entity): boolean {
  return e.type === 'CIRCLE' || e.type === 'ELLIPSE' || e.type === 'TEXT' || e.type === 'INSERT' || e.type === 'SOLID3D' || e.type === 'MESH3D' || e.type === 'VIEWPORT'
}

export type StretchOutcome =
  /** No cambia nada (ningún vértice dentro de la ventana). */
  | { kind: 'none' }
  /** Se mueve la entidad entera por `d` (mutación in-place vía `translateEntity`). */
  | { kind: 'move' }
  /** Se reemplazan las props (misma entidad) o el tipo cambió (RECTANGLE → POLYLINE). */
  | { kind: 'replace'; input: EntityInput }

/**
 * Calcula cómo responde una entidad al estiramiento. No muta nada: el comando aplica el resultado
 * (así se puede reutilizar para el preview).
 */
export function stretchEntity(e: Entity, box: StretchBox, d: Vec3): StretchOutcome {
  if (rigid(e)) {
    const a = anchorOf(e)
    if (a) return inBox(a, box) ? { kind: 'move' } : { kind: 'none' }
    // Sólidos/mallas: se mueven si TODOS sus vértices están dentro (criterio conservador: no se
    // deforma geometría paramétrica), si no quedan fijos.
    const vs = e.type === 'MESH3D' ? e.props.vertices : []
    if (vs.length > 0) return vs.every((v) => inBox(v, box)) ? { kind: 'move' } : { kind: 'none' }
    return { kind: 'none' }
  }

  switch (e.type) {
    case 'POINT':
      return stretchPoints([e.props.position], box, d).hits ? { kind: 'move' } : { kind: 'none' }
    case 'LINE': {
      const { out, hits } = stretchPoints([e.props.start, e.props.end], box, d)
      if (hits === 0) return { kind: 'none' }
      if (hits === 2) return { kind: 'move' }
      return { kind: 'replace', input: { type: 'LINE', layer: e.layer, props: { ...e.props, start: out[0], end: out[1] } } }
    }
    case 'ARC': {
      // Como en el CAD clásico: el extremo que cae en la ventana se mueve y el arco se reconstruye pasando
      // por el otro extremo y por su punto medio (conserva la curvatura visible).
      const [s0, e0] = arcEndpoints(e.props)
      const m = arcMidpoint(e.props)
      const sIn = inBox(s0, box)
      const eIn = inBox(e0, box)
      if (!sIn && !eIn) return { kind: 'none' }
      if (sIn && eIn) return { kind: 'move' }
      const arc = arcFrom3Points(sIn ? moved(s0, d) : s0, m, eIn ? moved(e0, d) : e0)
      return arc ? { kind: 'replace', input: { type: 'ARC', layer: e.layer, props: arc } } : { kind: 'none' }
    }
    case 'POLYLINE': {
      const { out, hits } = stretchPoints(e.props.vertices, box, d)
      if (hits === 0) return { kind: 'none' }
      if (hits === e.props.vertices.length) return { kind: 'move' }
      // Los bulges describen tramos, no vértices: se conservan tal cual.
      return {
        kind: 'replace',
        input: {
          type: 'POLYLINE',
          layer: e.layer,
          props: { ...e.props, vertices: out, bulges: e.props.bulges ? [...e.props.bulges] : undefined },
        },
      }
    }
    case 'SPLINE': {
      const { out, hits } = stretchPoints(e.props.controlPoints, box, d)
      if (hits === 0) return { kind: 'none' }
      if (hits === e.props.controlPoints.length) return { kind: 'move' }
      return { kind: 'replace', input: { type: 'SPLINE', layer: e.layer, props: { ...e.props, controlPoints: out } } }
    }
    case 'RECTANGLE': {
      const [x, y, z] = e.props.corner
      const w = e.props.width
      const h = e.props.height
      const corners: Vec3[] = [
        [x, y, z],
        [x + w, y, z],
        [x + w, y + h, z],
        [x, y + h, z],
      ]
      const { out, hits } = stretchPoints(corners, box, d)
      if (hits === 0) return { kind: 'none' }
      if (hits === 4) return { kind: 'move' }
      // Si el resultado sigue siendo un rectángulo axis-aligned se conserva el tipo.
      const xs = out.map((c) => c[0])
      const ys = out.map((c) => c[1])
      const stillRect =
        Math.abs(out[0][0] - out[3][0]) < 1e-9 &&
        Math.abs(out[1][0] - out[2][0]) < 1e-9 &&
        Math.abs(out[0][1] - out[1][1]) < 1e-9 &&
        Math.abs(out[2][1] - out[3][1]) < 1e-9
      if (stillRect) {
        return {
          kind: 'replace',
          input: {
            type: 'RECTANGLE',
            layer: e.layer,
            props: {
              corner: [Math.min(...xs), Math.min(...ys), z],
              width: Math.max(...xs) - Math.min(...xs),
              height: Math.max(...ys) - Math.min(...ys),
            },
          },
        }
      }
      return { kind: 'replace', input: { type: 'POLYLINE', layer: e.layer, props: { vertices: out, closed: true } } }
    }
    case 'DIMENSION': {
      const { out, hits } = stretchPoints(e.props.points, box, d)
      if (hits === 0) return { kind: 'none' }
      if (hits === e.props.points.length) return { kind: 'move' }
      // La cota se recalcula sola a partir de sus puntos de definición; el texto acompaña.
      const textPos = inBox(e.props.textPos, box) ? moved(e.props.textPos, d) : e.props.textPos
      const textAt = e.props.textAt && inBox(e.props.textAt, box) ? moved(e.props.textAt, d) : e.props.textAt
      return {
        kind: 'replace',
        input: { type: 'DIMENSION', layer: e.layer, props: { ...structuredClone(e.props), points: out, textPos, ...(textAt ? { textAt } : {}) } },
      }
    }
    default:
      return { kind: 'none' }
  }
}

/** Aplica el resultado del estiramiento sobre la entidad (mutando props o moviéndola). */
export function applyStretch(e: Entity, outcome: StretchOutcome, d: Vec3): 'moved' | 'stretched' | 'replaced' | 'none' {
  if (outcome.kind === 'none') return 'none'
  if (outcome.kind === 'move') {
    translateEntity(e, d[0], d[1], d[2])
    return 'moved'
  }
  if (outcome.input.type === e.type) {
    ;(e as { props: unknown }).props = outcome.input.props
    return 'stretched'
  }
  return 'replaced' // el llamador debe reemplazar la entidad (cambió de tipo)
}
