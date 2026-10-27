import { loopPoints } from '../hatch/geometry'
import { shadeOutline } from '../projection/shade'
import { pt, type Pt, type Vec3 } from '../math'
import type { Entity } from '../document/types'
import type { PreviewShape } from '../preview'
import { solidWireframe } from './solid'
import { meshWireframe } from './mesh'
import { ellipsePoints } from '../geom/ellipse'
import { tessellateArc } from '../geom/arc'
import { polylinePoints } from '../geom/polyline'
import { attdefText, textCorners } from '../geom/text'
import { dimDisplay } from '../dimension/dimGeometry'
import { viewportRing } from '../layout/viewport'

/**
 * Genera las formas de previsualización (fantasma) de una entidad desplazada
 * por (dx, dy, dz). Se usa en MOVE/COPY para mostrar dónde quedará lo seleccionado.
 */
export function entityPreviewShapes(e: Entity, dx: number, dy: number, dz = 0): PreviewShape[] {
  const shift = (v: readonly [number, number, number]): Pt => pt(v[0] + dx, v[1] + dy, v[2] + dz)
  switch (e.type) {
    case 'POINT': {
      // Una cruz chica en la posición nueva (el arrastre de MOVE/COPY la muestra).
      const c = shift(e.props.position)
      return [{ kind: 'circle', center: c, radius: 0.0001 }, { kind: 'line', a: c, b: c }]
    }
    case 'LINE':
      return [{ kind: 'line', a: shift(e.props.start), b: shift(e.props.end) }]
    case 'CIRCLE':
      return [{ kind: 'circle', center: shift(e.props.center), radius: e.props.radius }]
    case 'ARC':
      return [{ kind: 'polyline', points: tessellateArc(e.props).map(shift) }]
    case 'ELLIPSE':
      return [{ kind: 'polyline', points: ellipsePoints(e.props, 64, true).map(shift) }]
    case 'TEXT':
    case 'ATTDEF': {
      const c = textCorners(e.type === 'TEXT' ? e.props : attdefText(e.props)).map(shift)
      return [{ kind: 'polyline', points: [...c, c[0]] }]
    }
    case 'RECTANGLE': {
      const [x, y, z] = e.props.corner
      const w = e.props.width
      const h = e.props.height
      const c = (px: number, py: number): Pt => pt(px + dx, py + dy, z + dz)
      return [
        {
          kind: 'polyline',
          points: [c(x, y), c(x + w, y), c(x + w, y + h), c(x, y + h), c(x, y)],
        },
      ]
    }
    case 'POLYLINE':
      // `polylinePoints` ya cierra el anillo cuando la polilínea es cerrada.
      return [{ kind: 'polyline', points: polylinePoints(e.props).map(shift) }]
    case 'SPLINE':
      return [{ kind: 'polyline', points: e.props.controlPoints.map(shift) }]
    case 'SOLID3D':
      return solidWireframe(e.props).map((poly) => ({ kind: 'polyline', points: poly.map(shift) }))
    case 'MESH3D':
      return meshWireframe(e.props).map((poly) => ({ kind: 'polyline', points: poly.map(shift) }))
    case 'DIMENSION': {
      const off = (v: Vec3): Vec3 => [v[0] + dx, v[1] + dy, v[2] + dz]
      const moved = { ...e.props, points: e.props.points.map(off), textPos: off(e.props.textPos) }
      return dimDisplay(moved).lines.map(([s, en]) => ({
        kind: 'polyline',
        points: [pt(s[0], s[1], s[2]), pt(en[0], en[1], en[2])],
      }))
    }
    case 'INSERT':
      // Ghost simple del punto de inserción (la geometría del bloque se expande en el render).
      return [{ kind: 'line', a: shift(e.props.position), b: shift(e.props.position) }]
    case 'VIEWPORT':
      return [{ kind: 'polyline', points: viewportRing(e.props).map(shift) }]
    case 'SHADE':
      return [{ kind: 'polyline', points: shadeOutline(e.props).map(shift) }]
    case 'HATCH':
      return e.props.loops.map((l) => {
        const pts = loopPoints(l, e.props.normal)
        return { kind: 'polyline', points: [...pts, pts[0]].map(shift) }
      })
  }
}
