import { frozenLayerIds, hiddenLayerIds } from '../layers/visibility'
import type { Vec3 } from '../math'
import type { BlockDef, Entity, Layer, ViewportProps } from '../document/types'
import { expandEntities } from '../editing/block'
import { arcEndpoints } from '../geom/arc'
import { modelToPaper, viewBasis, viewportRing } from './viewport'
import { paperPerModel } from './scale'

/**
 * Geometría del modelo vista desde el papel (*trans-espacial*): cada entidad del modelo que
 * se ve por un viewport se representa en coordenadas del papel ("proxy"), para que desde el papel los
 * snaps tomen el modelo y las cotas del papel se asocien a él. El id de un proxy es `viewport>entidad`.
 */

const SEP = '>'

export const proxyId = (vpId: string, id: string): string => `${vpId}${SEP}${id}`

/** Viewport y entidad de un id de proxy, o null si es un id común. */
export function parseProxyId(id: string): { vp: string; id: string } | null {
  const i = id.indexOf(SEP)
  return i > 0 ? { vp: id.slice(0, i), id: id.slice(i + 1) } : null
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * La entidad `e` del modelo vista por el viewport `vp`, en el papel (z = 0), o null si no se puede
 * representar con su mismo tipo (p. ej. un círculo visto de canto, o un sólido).
 */
export function modelToPaperEntity(e: Entity, vpId: string, vp: ViewportProps, units: string): Entity | null {
  const P = (p: Vec3): Vec3 => [...modelToPaper(p, vp, units), 0]
  const k = paperPerModel(vp.scale, units)
  const { out } = viewBasis(vp.az, vp.el)
  const id = proxyId(vpId, e.id)
  const base = { id, layer: e.layer }
  switch (e.type) {
    case 'LINE':
      return { ...base, type: 'LINE', props: { start: P(e.props.start), end: P(e.props.end) } }
    case 'CIRCLE':
    case 'ARC': {
      const facing = dot(e.props.normal ?? [0, 0, 1], out)
      if (Math.abs(facing) < 1 - 1e-6) return null // de canto o inclinado: sería una elipse
      const c = P(e.props.center)
      const r = e.props.radius * k
      if (e.type === 'CIRCLE') return { ...base, type: 'CIRCLE', props: { center: c, radius: r, normal: [0, 0, 1] } }
      const ang = (q: Vec3) => {
        const p = P(q)
        return Math.atan2(p[1] - c[1], p[0] - c[0])
      }
      const [s, en] = arcEndpoints(e.props)
      // Visto desde atrás el sentido se invierte: el arco del papel va del final al inicio.
      const [a0, a1] = facing > 0 ? [ang(s), ang(en)] : [ang(en), ang(s)]
      return { ...base, type: 'ARC', props: { center: c, radius: r, startAngle: a0, endAngle: a1, normal: [0, 0, 1] } }
    }
    case 'POLYLINE': {
      const flat = Math.abs(out[2]) > 1 - 1e-6
      const bulges = e.props.bulges && flat ? e.props.bulges.map((b) => (out[2] > 0 ? b : -b)) : undefined
      return { ...base, type: 'POLYLINE', props: { vertices: e.props.vertices.map(P), closed: e.props.closed, ...(bulges ? { bulges } : {}) } }
    }
    case 'RECTANGLE': {
      const [x, y, z] = e.props.corner
      const { width: w, height: h } = e.props
      const corners: Vec3[] = [[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]]
      return { ...base, type: 'POLYLINE', props: { vertices: corners.map(P), closed: true } }
    }
    case 'SPLINE':
      return { ...base, type: 'SPLINE', props: { ...e.props, controlPoints: e.props.controlPoints.map(P) } }
    default:
      return null
  }
}

/** ¿La caja del proxy toca el rectángulo del viewport? (lo de afuera no se ve, no da snaps). */
function visibleIn(e: Entity, box: [number, number, number, number]): boolean {
  const pts: Vec3[] =
    e.type === 'LINE' ? [e.props.start, e.props.end]
    : e.type === 'CIRCLE' || e.type === 'ARC' ? [[e.props.center[0] - e.props.radius, e.props.center[1] - e.props.radius, 0], [e.props.center[0] + e.props.radius, e.props.center[1] + e.props.radius, 0]]
    : e.type === 'POLYLINE' ? e.props.vertices
    : e.type === 'SPLINE' ? e.props.controlPoints
    : []
  if (!pts.length) return false
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return Math.max(...xs) >= box[0] && Math.min(...xs) <= box[2] && Math.max(...ys) >= box[1] && Math.min(...ys) <= box[3]
}

/** Proxies de todo el modelo visible por los viewports (encendidos) de un layout, para snaps desde el papel. */
export function paperSnapProxies(paper: Entity[], model: Entity[], blocks: BlockDef[], layers: Layer[], units: string): Entity[] {
  const vps = paper.filter((e): e is Extract<Entity, { type: 'VIEWPORT' }> => e.type === 'VIEWPORT' && e.props.on)
  if (!vps.length) return []
  const hidden = hiddenLayerIds(layers)
  const expanded = expandEntities(model, blocks, { skipLayers: frozenLayerIds(layers) })
  const out: Entity[] = []
  for (const vp of vps) {
    const ring = viewportRing(vp.props)
    const box: [number, number, number, number] = [Math.min(...ring.map((p) => p[0])), Math.min(...ring.map((p) => p[1])), Math.max(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[1]))]
    const frozen = new Set(vp.props.frozenLayers)
    for (const e of expanded) {
      if (hidden.has(e.layer) || frozen.has(e.layer)) continue
      const p = modelToPaperEntity(e, vp.id, vp.props, units)
      if (p && visibleIn(p, box)) out.push(p)
    }
  }
  return out
}
