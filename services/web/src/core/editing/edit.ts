import { mapHatch } from '../hatch/edit'
import { mapShade } from '../projection/shade'
import { commonOf } from '../document/common'
import type { Vec3 } from '../math'
import type { Entity, EntityInput } from '../document/types'
import { scaleSolid, translateSolid } from './solid'
import { translateMesh } from './mesh'

/** Traslada las coordenadas de una entidad in-place (3D). */
export function translateEntity(e: Entity, dx: number, dy: number, dz = 0): void {
  const t = (v: Vec3): Vec3 => [v[0] + dx, v[1] + dy, v[2] + dz]
  switch (e.type) {
    case 'LINE':
      e.props.start = t(e.props.start)
      e.props.end = t(e.props.end)
      break
    case 'CIRCLE':
    case 'ARC':
      e.props.center = t(e.props.center) // el radio y los ángulos no cambian al trasladar
      break
    case 'ELLIPSE':
      e.props.center = t(e.props.center) // el semieje `major` es relativo: no se traslada
      break
    case 'TEXT':
      e.props.position = t(e.props.position)
      break
    case 'RECTANGLE':
      e.props.corner = t(e.props.corner)
      break
    case 'POLYLINE':
      e.props.vertices = e.props.vertices.map(t)
      if (e.props.frame) e.props.frame = e.props.frame.map(t)
      break
    case 'SPLINE':
      e.props.controlPoints = e.props.controlPoints.map(t)
      break
    case 'SOLID3D':
      translateSolid(e.props, dx, dy, dz)
      break
    case 'MESH3D':
      translateMesh(e.props, dx, dy, dz)
      break
    case 'DIMENSION':
      e.props.points = e.props.points.map(t)
      e.props.textPos = t(e.props.textPos)
      if (e.props.textAt) e.props.textAt = t(e.props.textAt)
      break
    case 'INSERT':
      e.props.position = t(e.props.position)
      break
    case 'HATCH':
      Object.assign(e.props, mapHatch(e.props, t))
      break
    case 'SHADE':
      Object.assign(e.props, mapShade(e.props, t))
      break
    case 'VIEWPORT':
      // Se mueve el marco en el papel; la vista del modelo (target) no cambia.
      e.props.center = t(e.props.center)
      if (e.props.clip) e.props.clip = e.props.clip.map(([x, y]) => [x + dx, y + dy])
      break
  }
}

/** Escala una entidad in-place respecto del punto `c` por factor `f` (3D). */
export function scaleEntity(e: Entity, c: Vec3, f: number): void {
  const s = (v: Vec3): Vec3 => [c[0] + (v[0] - c[0]) * f, c[1] + (v[1] - c[1]) * f, c[2] + (v[2] - c[2]) * f]
  switch (e.type) {
    case 'LINE':
      e.props.start = s(e.props.start)
      e.props.end = s(e.props.end)
      break
    case 'CIRCLE':
    case 'ARC':
      e.props.center = s(e.props.center)
      e.props.radius *= f
      break
    case 'ELLIPSE':
      e.props.center = s(e.props.center)
      e.props.major = [e.props.major[0] * f, e.props.major[1] * f, e.props.major[2] * f]
      break
    case 'TEXT':
      e.props.position = s(e.props.position)
      e.props.height *= f
      break
    case 'RECTANGLE':
      e.props.corner = s(e.props.corner)
      e.props.width *= f
      e.props.height *= f
      break
    case 'POLYLINE':
      e.props.vertices = e.props.vertices.map(s)
      if (e.props.widths) e.props.widths = e.props.widths.map(([a, b]) => [a * Math.abs(f), b * Math.abs(f)])
      if (e.props.frame) e.props.frame = e.props.frame.map(s)
      break
    case 'SPLINE':
      e.props.controlPoints = e.props.controlPoints.map(s)
      break
    case 'HATCH':
      Object.assign(e.props, mapHatch(e.props, s, Math.abs(f)))
      break
    case 'SHADE':
      Object.assign(e.props, mapShade(e.props, s))
      break
    case 'SOLID3D':
      scaleSolid(e.props, c, f)
      break
    case 'MESH3D':
      e.props.vertices = e.props.vertices.map(s)
      break
    case 'DIMENSION':
      e.props.points = e.props.points.map(s)
      e.props.textPos = s(e.props.textPos)
      if (e.props.textAt) e.props.textAt = s(e.props.textAt)
      break
    case 'INSERT':
      e.props.position = s(e.props.position)
      e.props.scale = [e.props.scale[0] * f, e.props.scale[1] * f, e.props.scale[2] * f]
      break
    case 'VIEWPORT':
      // Como el CAD clásico: escalar un viewport escala el marco y también su escala de vista.
      e.props.center = s(e.props.center)
      e.props.width *= f
      e.props.height *= f
      e.props.scale *= f
      if (e.props.clip) e.props.clip = e.props.clip.map(([x, y]) => [c[0] + (x - c[0]) * f, c[1] + (y - c[1]) * f])
      break
  }
}

/** Devuelve un EntityInput (sin id) copiando una entidad, para duplicar (COPY). */
export function cloneEntityInput(e: Entity): EntityInput {
  return { type: e.type, layer: e.layer, props: structuredClone(e.props), ...commonOf(e) }
}
