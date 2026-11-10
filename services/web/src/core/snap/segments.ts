import { lineSpan } from '../geom/xline'
import { splineCurve } from '../geom/curve'
import { imageRing } from '../geom/image'
import { fromVec3, pt, type Pt } from '../math'
import type { Entity } from '../document/types'
import { arcEndpoints, tessellateArc } from '../geom/arc'
import { ellipseEndpoints } from '../geom/ellipse'
import { polylinePoints } from '../geom/polyline'
import { solidSnapWireframe, solidVertices } from '../editing/solid'
import { attdefText, textSnapPoints } from '../geom/text'
import { meshVertices, meshWireframe } from '../editing/mesh'
import { dimDisplay } from '../dimension/dimGeometry'
import { viewportRing } from '../layout/viewport'

/**
 * Descomposición de entidades en puntos y segmentos de mundo. Vive aparte de `SnapService` porque
 * la usan tanto el esnap como el object snap tracking.
 */
export function endpointsOfEntity(e: Entity): Pt[] {
  switch (e.type) {
    case 'POINT':
      return [] // el punto da snap NODE, no extremo
    case 'LINE':
      return [fromVec3(e.props.start), fromVec3(e.props.end)]
    case 'RECTANGLE': {
      const [x, y, z] = e.props.corner
      const w = e.props.width
      const h = e.props.height
      return [pt(x, y, z), pt(x + w, y, z), pt(x + w, y + h, z), pt(x, y + h, z)]
    }
    case 'ARC':
      return arcEndpoints(e.props).map(fromVec3)
    case 'POLYLINE':
      return e.props.vertices.map(fromVec3)
    case 'SPLINE': {
      // Extremos de la curva; los puntos de ajuste intermedios dan NODE, no END.
      const cp = e.props.controlPoints
      return cp.length ? [fromVec3(cp[0]), fromVec3(cp[cp.length - 1])] : []
    }
    case 'SOLID3D':
      return solidVertices(e.props).map(fromVec3)
    case 'MESH3D':
      return meshVertices(e.props).map(fromVec3)
    case 'DIMENSION':
      return e.props.points.map(fromVec3)
    case 'TEXT':
      return textSnapPoints(e.props).map(fromVec3)
    case 'ATTDEF':
      return textSnapPoints(attdefText(e.props)).map(fromVec3)
    case 'ELLIPSE':
      // Un arco de elipse sí tiene extremos; la elipse completa, no.
      return ellipseEndpoints(e.props).map(fromVec3)
    case 'VIEWPORT':
      return viewportRing(e.props).slice(0, -1).map(fromVec3)
    case 'IMAGE':
      return imageRing(e.props).slice(0, -1).map(fromVec3)
    case 'CIRCLE':
    case 'INSERT': // las inserciones se expanden a geometría de mundo antes de llegar aquí
    case 'HATCH': // los sombreados no dan object snaps (OSOPTIONS del CAD clásico)
    case 'SHADE':
      return []
  }
}

export function segmentsOfEntity(e: Entity): [Pt, Pt][] {
  const segs: [Pt, Pt][] = []
  if (e.type === 'LINE') {
    const [a, b] = lineSpan(e.props)
    segs.push([fromVec3(a), fromVec3(b)])
  } else if (e.type === 'RECTANGLE') {
    const c = endpointsOfEntity(e)
    for (let i = 0; i < 4; i++) segs.push([c[i], c[(i + 1) % 4]])
  } else if (e.type === 'ARC') {
    // El arco se muestrea: así el nearest/intersection/midpoint lo ven como el resto de las curvas.
    const v = tessellateArc(e.props).map(fromVec3)
    for (let i = 0; i < v.length - 1; i++) segs.push([v[i], v[i + 1]])
  } else if (e.type === 'POLYLINE') {
    const v = polylinePoints(e.props).map(fromVec3) // ya viene cerrada si corresponde
    for (let i = 0; i < v.length - 1; i++) segs.push([v[i], v[i + 1]])
  } else if (e.type === 'SPLINE') {
    // La curva (como se dibuja), no la poligonal de sus puntos: NEA, INT y PER caen sobre ella.
    for (const q of splineCurve(e.props.controlPoints, e.props.degree)?.prims ?? []) if (q.k === 'L') segs.push([fromVec3(q.a), fromVec3(q.b)])
  } else if (e.type === 'SOLID3D') {
    for (const poly of solidSnapWireframe(e.props)) {
      const v = poly.map(fromVec3)
      for (let i = 0; i < v.length - 1; i++) segs.push([v[i], v[i + 1]])
    }
  } else if (e.type === 'MESH3D') {
    for (const poly of meshWireframe(e.props)) {
      const v = poly.map(fromVec3)
      for (let i = 0; i < v.length - 1; i++) segs.push([v[i], v[i + 1]])
    }
  } else if (e.type === 'DIMENSION') {
    for (const [s, en] of dimDisplay(e.props).lines) segs.push([fromVec3(s), fromVec3(en)])
  } else if (e.type === 'VIEWPORT' || e.type === 'IMAGE') {
    const v = (e.type === 'VIEWPORT' ? viewportRing(e.props) : imageRing(e.props)).map(fromVec3)
    for (let i = 0; i < v.length - 1; i++) segs.push([v[i], v[i + 1]])
  }
  return segs
}

