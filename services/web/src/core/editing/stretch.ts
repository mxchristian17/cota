import type { Vec3 } from '../math'
import type { BoxProps, Entity, EntityInput, ExtrudeProps, SolidProps } from '../document/types'
import { boxCorners, solidVertices, translateSolid } from './solid'
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
  if (e.type === 'SOLID3D') {
    const r = stretchSolid(e.props, box, d)
    if (!r.hits) return { kind: 'none' }
    if (r.hits === r.total) return { kind: 'move' }
    return { kind: 'replace', input: { type: 'SOLID3D', layer: e.layer, props: r.props } }
  }
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

const scaled = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const unitOf = (a: Vec3): Vec3 => scaled(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1))

/** Una caja como extrusión de su base (así se puede estirar como cualquier otra). */
function boxAsExtrude(b: BoxProps): ExtrudeProps {
  const [bottom, top] = boxCorners(b)
  return { op: 'EXTRUDE', profile: bottom, height: b.height, axis: unitOf([top[0][0] - bottom[0][0], top[0][1] - bottom[0][1], top[0][2] - bottom[0][2]]) }
}

/**
 * Extrusión: los vértices de la base y de la tapa que caen en la ventana. Una arista lateral entera adentro mueve su
 * vértice del perfil (en el plano del perfil); la tapa entera adentro cambia la altura y la base entera adentro la
 * corre (la tapa queda). Así, en una vista que mira a lo largo de la extrusión se estira el perfil, y en una que la ve
 * de costado, la pieza se alarga.
 */
function stretchExtrude(p: ExtrudeProps, box: StretchBox, d: Vec3): { props: ExtrudeProps; hits: number; total: number } {
  const a = unitOf(p.axis ?? [0, 0, 1])
  const top = p.profile.map((v) => moved(v, scaled(a, p.height)))
  const inB = p.profile.map((v) => inBox(v, box))
  const inT = top.map((v) => inBox(v, box))
  const hits = inB.filter(Boolean).length + inT.filter(Boolean).length
  const total = p.profile.length * 2
  if (!hits || hits === total) return { props: p, hits, total }
  const along = dot(d, a)
  const across = moved(d, scaled(a, -along))
  let profile = p.profile.map((v, i) => (inB[i] && inT[i] ? moved(v, across) : v))
  let height = p.height
  const allTop = inT.every(Boolean)
  const allBase = inB.every(Boolean)
  if (allTop && !allBase) height += along
  else if (allBase && !allTop) {
    profile = profile.map((v) => moved(v, scaled(a, along)))
    height -= along
  }
  return { props: { ...p, profile, height }, hits, total }
}

/**
 * STRETCH de un sólido: se recorre su árbol (booleanas, vaciados, empalmes) y se estira cada extrusión o caja; las
 * demás primitivas se mueven si todos sus vértices caen en la ventana. `hits`/`total`: vértices adentro / todos.
 */
export function stretchSolid(p: SolidProps, box: StretchBox, d: Vec3): { props: SolidProps; hits: number; total: number } {
  if (p.op !== 'UNION' && p.op !== 'SUBTRACT' && p.op !== 'INTERSECT' && p.op !== 'SHELL' && p.op !== 'FILLETEDGE' && p.op !== 'CHAMFEREDGE') {
    if (p.op === 'EXTRUDE' || p.op === 'BOX') {
      const r = stretchExtrude(p.op === 'BOX' ? boxAsExtrude(p) : p, box, d)
      return r.hits && r.hits < r.total ? r : { props: p, hits: r.hits, total: r.total }
    }
    const vs = solidVertices(p)
    const hits = vs.filter((v) => inBox(v, box)).length
    if (!vs.length || hits < vs.length) return { props: p, hits: 0, total: Math.max(1, vs.length) }
    return { props: p, hits, total: hits }
  }
  const whole = (q: SolidProps, r: { hits: number; total: number }): SolidProps => {
    if (r.hits !== r.total || !r.hits) return q
    const c = structuredClone(q)
    translateSolid(c, d[0], d[1], d[2])
    return c
  }
  if (p.op === 'SHELL' || p.op === 'FILLETEDGE' || p.op === 'CHAMFEREDGE') {
    const r = stretchSolid(p.solid, box, d)
    const edges = 'edges' in p ? p.edges.map((ed) => ({ ...ed, at: inBox(ed.at, box) ? moved(ed.at, d) : ed.at })) : undefined
    return { props: { ...p, solid: r.hits === r.total ? whole(p.solid, r) : r.props, ...(edges ? { edges } : {}) } as SolidProps, hits: r.hits, total: r.total }
  }
  let hits = 0
  let total = 0
  const operands = p.operands.map((o) => {
    const r = stretchSolid(o, box, d)
    hits += r.hits
    total += r.total
    return r.hits === r.total ? whole(o, r) : r.props
  })
  return { props: { ...p, operands } as SolidProps, hits, total }
}
