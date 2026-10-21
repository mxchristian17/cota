import { hatchPoints, mapHatch } from '../hatch/edit'
import { mapShade, shadeOutline } from '../projection/shade'
import type { Vec3 } from '../math'
import type { ArcProps, AttdefProps, DimensionProps, Entity, EntityInput, PolylineProps, TextProps } from '../document/types'
import type { SolidProps } from '../document/types'
import { arcEndpoints, arcIsClockwise, arcQuadrants, normAngle } from '../geom/arc'
import { mapEdgePoints, solidProfiles, sweepStartRef } from './solid'
import { viewportRing } from '../layout/viewport'
import { rotationAbout, transformEntity } from './rigid'

/** Offsets (dx,dy) de un array rectangular, excluyendo la celda original (0,0). */
export function rectangularOffsets(rows: number, cols: number, dRow: number, dCol: number): { dx: number; dy: number }[] {
  const out: { dx: number; dy: number }[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 && c === 0) continue
      out.push({ dx: c * dCol, dy: r * dRow })
    }
  }
  return out
}

/**
 * Ángulos (radianes) de las copias de un array polar, excluyendo el original.
 * Con ángulo total 360° se reparte en `count` (evita solape); si no, en `count-1`.
 */
export function polarAngles(count: number, totalDeg: number): number[] {
  if (count < 2) return []
  const full = Math.abs(Math.abs(totalDeg) - 360) < 1e-9
  const stepDeg = full ? totalDeg / count : totalDeg / (count - 1)
  const out: number[] = []
  for (let k = 1; k < count; k++) out.push((k * stepDeg * Math.PI) / 180)
  return out
}

const rot = (v: Vec3, cx: number, cy: number, cos: number, sin: number): Vec3 => {
  const dx = v[0] - cx
  const dy = v[1] - cy
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos, v[2]]
}

/** Centroide XY (centro de la caja) de una entidad, conservando la z del primer punto. */
export function entityCentroid(e: Entity): Vec3 {
  const pts = entityPoints(e)
  if (pts.length === 0) return [0, 0, 0]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p[0])
    minY = Math.min(minY, p[1])
    maxX = Math.max(maxX, p[0])
    maxY = Math.max(maxY, p[1])
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2, pts[0][2]]
}

function entityPoints(e: Entity): Vec3[] {
  switch (e.type) {
    case 'LINE':
      return [e.props.start, e.props.end]
    case 'CIRCLE':
      return [e.props.center]
    case 'ARC':
      // Extremos + cuadrantes atravesados: dan la caja real del arco (su centroide no es el centro).
      return [...arcEndpoints(e.props), ...arcQuadrants(e.props)]
    case 'ELLIPSE':
      return [e.props.center]
    case 'TEXT':
    case 'ATTDEF':
      return [e.props.position]
    case 'RECTANGLE': {
      const [x, y, z] = e.props.corner
      return [[x, y, z], [x + e.props.width, y + e.props.height, z]]
    }
    case 'POLYLINE':
      return e.props.vertices
    case 'SPLINE':
      return e.props.controlPoints
    case 'SOLID3D':
      return solidProfiles(e.props).flat()
    case 'MESH3D':
      return e.props.vertices
    case 'DIMENSION':
      return e.props.points
    case 'INSERT':
      return [e.props.position]
    case 'VIEWPORT':
      return viewportRing(e.props)
    case 'HATCH':
      return hatchPoints(e.props)
    case 'SHADE':
      return shadeOutline(e.props)
  }
}

function rotateSolid(p: SolidProps, cx: number, cy: number, cos: number, sin: number): void {
  switch (p.op) {
    case 'EXTRUDE':
      p.profile = p.profile.map((v) => rot(v, cx, cy, cos, sin))
      if (p.axis) p.axis = rot(p.axis, 0, 0, cos, sin) // un perfil fuera de planta se extruye de lado
      break
    case 'BOX':
      // Exacta: la caja guarda sus ejes; se giran el ancla y los ejes.
      p.origin = rot(p.origin, cx, cy, cos, sin)
      p.basis = { x: rot(p.basis?.x ?? [1, 0, 0], 0, 0, cos, sin), y: rot(p.basis?.y ?? [0, 1, 0], 0, 0, cos, sin) }
      break
    case 'CYLINDER':
    case 'CONE':
      p.base = rot(p.base, cx, cy, cos, sin)
      if (p.axis) p.axis = rot(p.axis, 0, 0, cos, sin) // rota también el eje (cilindros no verticales)
      break
    case 'SPHERE':
      p.center = rot(p.center, cx, cy, cos, sin)
      break
    case 'PRISM':
      // Rota el centro y ajusta la rotación local del N-gono.
      p.center = rot(p.center, cx, cy, cos, sin)
      if (p.basis) p.basis = { x: rot(p.basis.x, 0, 0, cos, sin), y: rot(p.basis.y, 0, 0, cos, sin) }
      else p.rotation = (p.rotation ?? 0) + Math.atan2(sin, cos)
      break
    case 'REVOLVE':
      p.base = rot(p.base, cx, cy, cos, sin) // sin eje: simétrico respecto de su eje Z
      if (p.axis) p.axis = rot(p.axis, 0, 0, cos, sin)
      if (p.ref) p.ref = rot(p.ref, 0, 0, cos, sin)
      break
    case 'TORUS':
      p.center = rot(p.center, cx, cy, cos, sin)
      if (p.axis) p.axis = rot(p.axis, 0, 0, cos, sin)
      break
    case 'SWEEP':
      p.ref = rot(sweepStartRef(p), 0, 0, cos, sin) // el perfil gira con el recorrido
      p.path = p.path.map((v) => rot(v, cx, cy, cos, sin))
      break
    case 'LOFT':
      p.sections = p.sections.map((sec) => sec.map((v) => rot(v, cx, cy, cos, sin)))
      break
    case 'SHELL':
      rotateSolid(p.solid, cx, cy, cos, sin)
      break
    case 'FILLETEDGE':
    case 'CHAMFEREDGE':
      rotateSolid(p.solid, cx, cy, cos, sin)
      mapEdgePoints(p, (v) => rot(v, cx, cy, cos, sin))
      break
    default:
      for (const op of p.operands) rotateSolid(op, cx, cy, cos, sin)
  }
}

/** ¿Está en un plano paralelo al XY (normal ±Z o sin normal)? Entonces le sirve el giro de planta. */
function inPlan(e: Entity): boolean {
  const n = (e.props as { normal?: Vec3 }).normal
  return !n || (Math.abs(n[0]) < 1e-9 && Math.abs(n[1]) < 1e-9)
}

/**
 * Clona una entidad rotándola alrededor del eje Z que pasa por `center`.
 * Un RECTANGLE rotado deja de ser axis-aligned → se convierte en POLYLINE cerrada.
 */
export function rotateEntityInput(e: Entity, center: Vec3, ang: number): EntityInput {
  // Fuera de planta (un círculo vertical, un texto en otra cara, lo dibujado en planta visto desde la UCS
  // Right…): giro rígido en 3D, como el CAD clásico. El giro de planta movería sólo los puntos y la entidad quedaría
  // aplanada o deformada.
  if (!inPlan(e)) {
    const out = transformEntity(e, rotationAbout(center, [0, 0, 1], ang))
    if (out) return out
  }
  const cos = Math.cos(ang)
  const sin = Math.sin(ang)
  const [cx, cy] = center
  const props = structuredClone(e.props)
  switch (e.type) {
    case 'LINE': {
      const p = props as Entity['props'] & { start: Vec3; end: Vec3 }
      p.start = rot(e.props.start, cx, cy, cos, sin)
      p.end = rot(e.props.end, cx, cy, cos, sin)
      return { type: 'LINE', layer: e.layer, props: p }
    }
    case 'CIRCLE': {
      const p = props as { center: Vec3; radius: number; normal: Vec3 }
      p.center = rot(e.props.center, cx, cy, cos, sin)
      return { type: 'CIRCLE', layer: e.layer, props: p }
    }
    case 'ARC': {
      const p = props as ArcProps
      p.center = rot(e.props.center, cx, cy, cos, sin)
      // En el plano invertido los ángulos crecen al revés que en el mundo.
      const delta = arcIsClockwise(e.props) ? -ang : ang
      p.startAngle = normAngle(e.props.startAngle + delta)
      p.endAngle = normAngle(e.props.endAngle + delta)
      return { type: 'ARC', layer: e.layer, props: p }
    }
    case 'ELLIPSE': {
      const p = props as { center: Vec3; major: Vec3; ratio: number; normal: Vec3 }
      p.center = rot(e.props.center, cx, cy, cos, sin)
      p.major = rot(e.props.major, 0, 0, cos, sin) // `major` es dirección → rota respecto del origen
      return { type: 'ELLIPSE', layer: e.layer, props: p }
    }
    case 'TEXT': {
      const p = props as TextProps
      p.position = rot(e.props.position, cx, cy, cos, sin)
      p.rotation = e.props.rotation + ang
      return { type: 'TEXT', layer: e.layer, props: p }
    }
    case 'ATTDEF': {
      const p = props as AttdefProps
      p.position = rot(e.props.position, cx, cy, cos, sin)
      p.rotation = e.props.rotation + ang
      return { type: 'ATTDEF', layer: e.layer, props: p }
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
      ].map((v) => rot(v as Vec3, cx, cy, cos, sin))
      return { type: 'POLYLINE', layer: e.layer, props: { vertices: corners, closed: true } }
    }
    case 'POLYLINE': {
      const p = props as PolylineProps
      p.vertices = e.props.vertices.map((v) => rot(v, cx, cy, cos, sin))
      if (e.props.frame) p.frame = e.props.frame.map((v) => rot(v, cx, cy, cos, sin))
      if (e.props.tangents) {
        const delta = (e.props.normal?.[2] ?? 1) < 0 ? -ang : ang
        p.tangents = e.props.tangents.map((t) => (t === null ? null : t + delta))
      }
      return { type: 'POLYLINE', layer: e.layer, props: p }
    }
    case 'SPLINE': {
      const p = props as { controlPoints: Vec3[]; degree: number }
      p.controlPoints = e.props.controlPoints.map((v) => rot(v, cx, cy, cos, sin))
      return { type: 'SPLINE', layer: e.layer, props: p }
    }
    case 'SOLID3D': {
      const p = props as SolidProps
      rotateSolid(p, cx, cy, cos, sin)
      return { type: 'SOLID3D', layer: e.layer, props: p }
    }
    case 'MESH3D': {
      const p = props as { vertices: Vec3[]; faces: number[][] }
      p.vertices = e.props.vertices.map((v) => rot(v, cx, cy, cos, sin))
      return { type: 'MESH3D', layer: e.layer, props: p }
    }
    case 'DIMENSION': {
      const p: DimensionProps = {
        ...structuredClone(e.props),
        points: e.props.points.map((v) => rot(v, cx, cy, cos, sin)),
        textPos: rot(e.props.textPos, cx, cy, cos, sin),
        ...(e.props.textAt ? { textAt: rot(e.props.textAt, cx, cy, cos, sin) } : {}),
        ...(e.props.normal ? { normal: rot(e.props.normal, 0, 0, cos, sin) } : {}),
        // Una lineal rotada gira con la cota; una H/V queda H/V (como el CAD clásico).
        ...(e.props.rotation !== undefined ? { rotation: e.props.rotation + (Math.atan2(sin, cos) * 180) / Math.PI } : {}),
      }
      return { type: 'DIMENSION', layer: e.layer, props: p }
    }
    case 'INSERT': {
      const p = structuredClone(e.props)
      p.position = rot(e.props.position, cx, cy, cos, sin)
      p.rotation = e.props.rotation + ang
      return { type: 'INSERT', layer: e.layer, props: p }
    }
    case 'SHADE':
      return { type: 'SHADE', layer: e.layer, props: mapShade(e.props, (v) => rot(v, cx, cy, cos, sin)) }
    case 'HATCH': {
      // Giro de planta alrededor de Z: lazos, origen y semillas; el patrón gira con ellos.
      const p = mapHatch(e.props, (v) => rot(v, cx, cy, cos, sin))
      p.angle = e.props.angle + ((e.props.normal?.[2] ?? 1) < 0 ? -ang : ang)
      return { type: 'HATCH', layer: e.layer, props: p }
    }
    case 'VIEWPORT': {
      // El marco sigue alineado al papel: rota sólo su centro (como BOX); la vista no cambia.
      const p = structuredClone(e.props)
      p.center = rot(e.props.center, cx, cy, cos, sin)
      delete p.clip
      return { type: 'VIEWPORT', layer: e.layer, props: p }
    }
  }
}

/** Desplazamiento para una copia polar SIN rotar el ítem: su centroide orbita el centro. */
export function polarTranslation(e: Entity, center: Vec3, ang: number): { dx: number; dy: number } {
  const c = entityCentroid(e)
  const cos = Math.cos(ang)
  const sin = Math.sin(ang)
  const r = rot(c, center[0], center[1], cos, sin)
  return { dx: r[0] - c[0], dy: r[1] - c[1] }
}
