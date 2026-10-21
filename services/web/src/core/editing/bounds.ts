import { hatchPoints } from '../hatch/edit'
import { shadeOutline } from '../projection/shade'
import { loopPoints } from '../hatch/geometry'
import type { Entity } from '../document/types'
import { fromVec3, type Pt } from '../math'
import { solidProfiles, solidWireframe } from './solid'
import { meshWireframe } from './mesh'
import { ellipsePoints } from '../geom/ellipse'
import { arcBounds, tessellateArc } from '../geom/arc'
import { polylinePoints } from '../geom/polyline'
import { attdefText, textCorners } from '../geom/text'
import { dimDisplay } from '../dimension/dimGeometry'
import { viewportRing } from '../layout/viewport'

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Caja envolvente (AABB) de una entidad en el plano XY. */
export function entityBounds(e: Entity): Bounds {
  const pts: [number, number][] = []
  switch (e.type) {
    case 'LINE':
      pts.push([e.props.start[0], e.props.start[1]], [e.props.end[0], e.props.end[1]])
      break
    case 'CIRCLE': {
      const b = arcBounds({ ...e.props, startAngle: 0, endAngle: 0 })
      pts.push([b.minX, b.minY], [b.maxX, b.maxY])
      break
    }
    case 'ARC': {
      // Caja del arco, no la del círculo: extremos + cuadrantes atravesados.
      const b = arcBounds(e.props)
      pts.push([b.minX, b.minY], [b.maxX, b.maxY])
      break
    }
    case 'ELLIPSE':
      for (const v of ellipsePoints(e.props, 32, false)) pts.push([v[0], v[1]])
      break
    case 'TEXT':
      for (const v of textCorners(e.props)) pts.push([v[0], v[1]])
      break
    case 'ATTDEF':
      for (const v of textCorners(attdefText(e.props))) pts.push([v[0], v[1]])
      break
    case 'RECTANGLE': {
      const [x, y] = e.props.corner
      pts.push([x, y], [x + e.props.width, y + e.props.height])
      break
    }
    case 'POLYLINE':
      // Con tramos curvos la caja la fija el arco, no sólo los vértices.
      for (const v of polylinePoints(e.props)) pts.push([v[0], v[1]])
      break
    case 'SPLINE':
      for (const v of e.props.controlPoints) pts.push([v[0], v[1]])
      break
    case 'SOLID3D':
      for (const poly of solidProfiles(e.props)) for (const v of poly) pts.push([v[0], v[1]])
      break
    case 'MESH3D':
      for (const v of e.props.vertices) pts.push([v[0], v[1]])
      break
    case 'DIMENSION':
      for (const [s, en] of dimDisplay(e.props).lines) pts.push([s[0], s[1]], [en[0], en[1]])
      break
    case 'INSERT':
      break // las inserciones se expanden a geometría de mundo antes de calcular bounds
    case 'VIEWPORT':
      for (const v of viewportRing(e.props)) pts.push([v[0], v[1]])
      break
    case 'HATCH':
      for (const v of hatchPoints(e.props)) pts.push([v[0], v[1]])
      break
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of pts) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return { minX, minY, maxX, maxY }
}

/** ¿La entidad está totalmente contenida en la caja? (selección por ventana). */
export function boundsInside(b: Bounds, box: Box): boolean {
  return b.minX >= box.minX && b.maxX <= box.maxX && b.minY >= box.minY && b.maxY <= box.maxY
}

/** ¿La entidad interseca la caja? (selección por cruce). */
export function boundsIntersect(b: Bounds, box: Box): boolean {
  return !(b.maxX < box.minX || b.minX > box.maxX || b.maxY < box.minY || b.minY > box.maxY)
}

/**
 * Ids de entidades seleccionadas por una caja (en coordenadas de mundo XY; usado en vista TOP/tests).
 * `crossing` (derecha→izquierda) selecciona lo que toca; si no, sólo lo contenido.
 */
export function entitiesInBox(entities: Entity[], box: Box, crossing: boolean): string[] {
  const ids: string[] = []
  for (const e of entities) {
    const b = entityBounds(e)
    if (crossing ? boundsIntersect(b, box) : boundsInside(b, box)) ids.push(e.id)
  }
  return ids
}

// --- Selección en píxeles de pantalla (funciona en cualquier vista 3D) ---

/** Rectángulo de selección en píxeles de pantalla. */
export interface RectPx {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Proyección de un punto de mundo a píxeles (o null si no es visible). */
export type Projector = (p: Pt) => [number, number] | null

const CIRCLE_STEPS = 48

/**
 * Poli­líneas de contorno de la entidad en mundo (para proyectar y testear en pantalla).
 * Cada sublista es un tramo continuo (cerrado o abierto).
 */
export function entityOutline(e: Entity): Pt[][] {
  switch (e.type) {
    case 'LINE':
      return [[fromVec3(e.props.start), fromVec3(e.props.end)]]
    case 'CIRCLE':
      return [tessellateArc({ ...e.props, startAngle: 0, endAngle: 0 }, CIRCLE_STEPS).map(fromVec3)]
    case 'ARC':
      return [tessellateArc(e.props).map(fromVec3)]
    case 'ELLIPSE':
      return [ellipsePoints(e.props, CIRCLE_STEPS, true).map(fromVec3)]
    case 'TEXT':
    case 'ATTDEF': {
      const c = textCorners(e.type === 'TEXT' ? e.props : attdefText(e.props)).map(fromVec3)
      return [[...c, c[0]]]
    }
    case 'RECTANGLE': {
      const [x, y, z] = e.props.corner
      const w = e.props.width
      const h = e.props.height
      return [
        [
          { x, y, z },
          { x: x + w, y, z },
          { x: x + w, y: y + h, z },
          { x, y: y + h, z },
          { x, y, z },
        ],
      ]
    }
    case 'POLYLINE':
      return [polylinePoints(e.props).map(fromVec3)] // ya viene cerrada si corresponde
    case 'SPLINE':
      return [e.props.controlPoints.map(fromVec3)]
    case 'SOLID3D':
      // Wireframe 3D (base + tapa + verticales); ya viene con los loops cerrados.
      return solidWireframe(e.props).map((poly) => poly.map(fromVec3))
    case 'MESH3D':
      return meshWireframe(e.props).map((poly) => poly.map(fromVec3))
    case 'DIMENSION':
      return dimDisplay(e.props).lines.map(([s, en]) => [fromVec3(s), fromVec3(en)])
    case 'INSERT':
      return [] // las inserciones se expanden a geometría de mundo antes de trazar el contorno
    case 'VIEWPORT':
      return [viewportRing(e.props).map(fromVec3)]
    case 'SHADE':
      return [shadeOutline(e.props).map(fromVec3)]
    case 'HATCH':
      return e.props.loops.map((l) => {
        const pts = loopPoints(l, e.props.normal).map(fromVec3)
        return [...pts, pts[0]]
      })
  }
}

const inRect = (p: [number, number], r: RectPx): boolean =>
  p[0] >= r.minX && p[0] <= r.maxX && p[1] >= r.minY && p[1] <= r.maxY

/** ¿Se cruzan los segmentos p1p2 y p3p4? */
function segsCross(p1: [number, number], p2: [number, number], p3: [number, number], p4: [number, number]): boolean {
  const d = (a: [number, number], b: [number, number], c: [number, number]): number =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const d1 = d(p3, p4, p1)
  const d2 = d(p3, p4, p2)
  const d3 = d(p1, p2, p3)
  const d4 = d(p1, p2, p4)
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))
}

/** ¿El segmento (en px) toca el rectángulo (algún extremo dentro o cruza un borde)? */
function segTouchesRect(a: [number, number], b: [number, number], r: RectPx): boolean {
  if (inRect(a, r) || inRect(b, r)) return true
  const c1: [number, number] = [r.minX, r.minY]
  const c2: [number, number] = [r.maxX, r.minY]
  const c3: [number, number] = [r.maxX, r.maxY]
  const c4: [number, number] = [r.minX, r.maxY]
  return segsCross(a, b, c1, c2) || segsCross(a, b, c2, c3) || segsCross(a, b, c3, c4) || segsCross(a, b, c4, c1)
}

/**
 * Ids seleccionados por una caja en píxeles de pantalla.
 * `crossing` (derecha→izquierda): la entidad se selecciona si su contorno **toca** el rectángulo.
 * Si no (izquierda→derecha, window): sólo si está **totalmente contenida**.
 */
export function entitiesInScreenBox(
  entities: Entity[],
  rect: RectPx,
  crossing: boolean,
  project: Projector,
): string[] {
  const ids: string[] = []
  for (const e of entities) {
    const polys = entityOutline(e)
    let anyPoint = false
    let allInside = true
    let touches = false
    for (const poly of polys) {
      const proj = poly.map(project).filter((p): p is [number, number] => p !== null)
      for (const p of proj) {
        anyPoint = true
        if (!inRect(p, rect)) allInside = false
      }
      if (crossing) {
        for (let i = 0; i < proj.length - 1; i++) {
          if (segTouchesRect(proj[i], proj[i + 1], rect)) {
            touches = true
            break
          }
        }
      }
      if (touches) break
    }
    if (!anyPoint) continue
    if (crossing ? touches : allInside) ids.push(e.id)
  }
  return ids
}
