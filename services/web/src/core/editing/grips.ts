import { hatchCenter } from '../hatch/edit'
import type { Vec3 } from '../math'
import type { Entity } from '../document/types'
import { translateEntity } from './edit'
import { ellipseAxisPoints } from '../geom/ellipse'
import { arcBasis, arcEndpoints, arcMidpoint, arcPointAtAngle, normAngle } from '../geom/arc'
import { solidWireframe } from './solid'
import { meshWireframe } from './mesh'
import { coverClip, viewportCorners } from '../layout/viewport'
import { dimDisplay, fixLinearRotation } from '../dimension/dimGeometry'

/**
 * Grips (puntos de anclaje editables, estilo CAD clásico). Cada entidad expone su conjunto de grips y una
 * regla (`role`) que describe cómo se deforma al arrastrar ese grip a un nuevo punto de mundo.
 */
export type GripRole =
  | { t: 'move' } // mueve toda la entidad por (to − grip)
  | { t: 'line'; which: 'start' | 'end' } // extremo de línea
  | { t: 'circle-radius' } // cuadrante de círculo → cambia el radio
  | { t: 'arc-end'; which: 'start' | 'end' } // extremo de arco → cambia ese ángulo (radio fijo)
  | { t: 'arc-radius' } // punto medio del arco → cambia el radio (ángulos fijos)
  | { t: 'ellipse-major' } // extremo del semieje mayor → cambia largo/dirección del mayor
  | { t: 'ellipse-minor' } // extremo del semieje menor → cambia la relación (ratio)
  | { t: 'rect-corner'; corner: 0 | 1 | 2 | 3 } // esquina de rectángulo (esquina opuesta fija)
  | { t: 'vertex'; index: number } // vértice de polilínea / punto de control de spline
  | { t: 'dim-point'; index: number } // punto definitorio de cota
  | { t: 'dim-textpos' } // posición del texto de la cota
  | { t: 'dim-line' } // extremo de la línea de cota lineal: la desplaza en paralelo
  | { t: 'dim-text' } // texto de la cota: lo mueve según DIMTMOVE

export interface Grip {
  point: Vec3
  role: GripRole
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const mag = (v: Vec3): number => Math.hypot(v[0], v[1], v[2])
const normalize = (v: Vec3): Vec3 => {
  const L = mag(v) || 1
  return [v[0] / L, v[1] / L, v[2] / L]
}
const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]

/** Centroide (promedio de vértices) de un conjunto de polilíneas 3D, para anclar el grip de mover. */
function centroidOf(polys: Vec3[][]): Vec3 | null {
  let n = 0
  let sx = 0
  let sy = 0
  let sz = 0
  for (const poly of polys)
    for (const v of poly) {
      sx += v[0]
      sy += v[1]
      sz += v[2]
      n++
    }
  return n ? [sx / n, sy / n, sz / n] : null
}

/** Conjunto de grips (puntos de anclaje) de una entidad, según su tipo (como el CAD clásico). */
export function entityGrips(e: Entity): Grip[] {
  switch (e.type) {
    case 'POINT':
      return [{ point: e.props.position, role: { t: 'move' } }]
    case 'LINE': {
      const s = e.props.start
      const en = e.props.end
      return [
        { point: s, role: { t: 'line', which: 'start' } },
        { point: en, role: { t: 'line', which: 'end' } },
        { point: mid(s, en), role: { t: 'move' } },
      ]
    }
    case 'CIRCLE': {
      // Cuadrantes en el plano del círculo.
      const full = { ...e.props, startAngle: 0, endAngle: 0 }
      return [
        { point: e.props.center, role: { t: 'move' } },
        ...[0, 1, 2, 3].map((k) => ({ point: arcPointAtAngle(full, (k * Math.PI) / 2), role: { t: 'circle-radius' as const } })),
      ]
    }
    case 'ARC': {
      const [s, en] = arcEndpoints(e.props)
      return [
        { point: e.props.center, role: { t: 'move' } },
        { point: s, role: { t: 'arc-end', which: 'start' } },
        { point: en, role: { t: 'arc-end', which: 'end' } },
        { point: arcMidpoint(e.props), role: { t: 'arc-radius' } },
      ]
    }
    case 'ELLIPSE': {
      const q = ellipseAxisPoints(e.props) // [major+, major−, minor+, minor−]
      return [
        { point: e.props.center, role: { t: 'move' } },
        { point: q[0], role: { t: 'ellipse-major' } },
        { point: q[1], role: { t: 'ellipse-major' } },
        { point: q[2], role: { t: 'ellipse-minor' } },
        { point: q[3], role: { t: 'ellipse-minor' } },
      ]
    }
    case 'RECTANGLE': {
      const [x, y, z] = e.props.corner
      const w = e.props.width
      const h = e.props.height
      const grips: Grip[] = [
        { point: [x, y, z], role: { t: 'rect-corner', corner: 0 } },
        { point: [x + w, y, z], role: { t: 'rect-corner', corner: 1 } },
        { point: [x + w, y + h, z], role: { t: 'rect-corner', corner: 2 } },
        { point: [x, y + h, z], role: { t: 'rect-corner', corner: 3 } },
        { point: [x + w / 2, y + h / 2, z], role: { t: 'move' } },
      ]
      return grips
    }
    case 'POLYLINE':
      return e.props.vertices.map((v, i) => ({ point: v, role: { t: 'vertex', index: i } }))
    case 'SPLINE':
      return e.props.controlPoints.map((v, i) => ({ point: v, role: { t: 'vertex', index: i } }))
    case 'TEXT':
    case 'ATTDEF':
      return [{ point: e.props.position, role: { t: 'move' } }]
    case 'DIMENSION': {
      const p = e.props
      const g: Grip[] = p.points.map((q, i) => ({ point: q, role: { t: 'dim-point', index: i } }))
      if (DIM_TEXT_AT_TEXTPOS.has(p.dimType)) {
        g.push({ point: p.textPos, role: { t: 'dim-textpos' } })
        return g
      }
      const d = dimDisplay(p)
      // Como el CAD clásico: las lineales tienen grips en los extremos de la línea de cota y uno en el texto.
      if (d.handles) for (const h of d.handles) g.push({ point: h, role: { t: 'dim-line' } })
      else g.push({ point: p.textPos, role: { t: 'dim-textpos' } })
      if (d.text.value) g.push({ point: d.text.pos, role: { t: 'dim-text' } })
      return g
    }
    case 'SOLID3D': {
      const c = centroidOf(solidWireframe(e.props))
      return c ? [{ point: c, role: { t: 'move' } }] : []
    }
    case 'MESH3D': {
      const c = centroidOf(meshWireframe(e.props))
      return c ? [{ point: c, role: { t: 'move' } }] : []
    }
    case 'INSERT':
      return [{ point: e.props.position, role: { t: 'move' } }]
    case 'HATCH':
      return [{ point: hatchCenter(e.props), role: { t: 'move' } }]
    case 'SHADE':
      return []
    case 'VIEWPORT':
      // Recortado: un grip por vértice del contorno (VPCLIP), como el CAD clásico.
      if (e.props.clip && e.props.clip.length >= 3) {
        return [
          { point: e.props.center, role: { t: 'move' } },
          ...e.props.clip.map(([x, y], index): Grip => ({ point: [x, y, 0], role: { t: 'vertex', index } })),
        ]
      }
      // Esquinas redimensionan (la opuesta queda fija) y el centro mueve, como el CAD clásico.
      return [
        { point: e.props.center, role: { t: 'move' } },
        ...viewportCorners(e.props).map(
          ([x, y], i): Grip => ({ point: [x, y, 0], role: { t: 'rect-corner', corner: i as 0 | 1 | 2 | 3 } }),
        ),
      ]
  }
}

/** Cotas cuyo texto está en `textPos` (un solo grip para texto y ubicación). */
const DIM_TEXT_AT_TEXTPOS = new Set(['RADIUS', 'DIAMETER', 'JOGGED', 'ORDINATE', 'LEADER', 'MLEADER', 'CENTER', 'CENTERLINE'])

/**
 * Desplaza en paralelo la línea de una cota lineal/alineada según el arrastre `from → to` (sólo la
 * componente perpendicular a la línea, dentro del plano de la cota). Una DIMLINEAR sin rotación fija su
 * orientación actual para que el arrastre no la cambie de horizontal a vertical.
 */
function shiftDimLine(p: Extract<Entity, { type: 'DIMENSION' }>['props'], from: Vec3, to: Vec3): void {
  const d = dimDisplay(p)
  if (!d.handles) return
  const n = d.normal
  const ld = normalize([d.handles[1][0] - d.handles[0][0], d.handles[1][1] - d.handles[0][1], d.handles[1][2] - d.handles[0][2]])
  const m: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
  const a = m[0] * ld[0] + m[1] * ld[1] + m[2] * ld[2]
  const b = m[0] * n[0] + m[1] * n[1] + m[2] * n[2]
  const perp: Vec3 = [m[0] - ld[0] * a - n[0] * b, m[1] - ld[1] * a - n[1] * b, m[2] - ld[2] * a - n[2] * b]
  fixLinearRotation(p)
  p.textPos = [p.textPos[0] + perp[0], p.textPos[1] + perp[1], p.textPos[2] + perp[2]]
}

/** Aplica el arrastre de un grip: deforma la entidad in-place llevando ese grip al punto `to`. */
export function applyGrip(e: Entity, grip: Grip, to: Vec3): void {
  const r = grip.role
  if (r.t === 'move') {
    translateEntity(e, to[0] - grip.point[0], to[1] - grip.point[1], to[2] - grip.point[2])
    return
  }
  switch (e.type) {
    case 'LINE':
      if (r.t === 'line') {
        if (r.which === 'start') e.props.start = [to[0], to[1], to[2]]
        else e.props.end = [to[0], to[1], to[2]]
      }
      break
    case 'CIRCLE':
      if (r.t === 'circle-radius') {
        const c = e.props.center
        e.props.radius = Math.max(1e-6, Math.hypot(to[0] - c[0], to[1] - c[1], to[2] - c[2]))
      }
      break
    case 'ARC': {
      const c = e.props.center
      if (r.t === 'arc-radius') {
        e.props.radius = Math.max(1e-6, Math.hypot(to[0] - c[0], to[1] - c[1], to[2] - c[2]))
      } else if (r.t === 'arc-end') {
        // El ángulo se mide en el plano del arco (así funciona igual con la normal invertida).
        const { u, v } = arcBasis(e.props.normal)
        const d: Vec3 = [to[0] - c[0], to[1] - c[1], to[2] - c[2]]
        const ang = Math.atan2(
          d[0] * v[0] + d[1] * v[1] + d[2] * v[2],
          d[0] * u[0] + d[1] * u[1] + d[2] * u[2],
        )
        if (r.which === 'start') e.props.startAngle = normAngle(ang)
        else e.props.endAngle = normAngle(ang)
      }
      break
    }
    case 'ELLIPSE': {
      const c = e.props.center
      if (r.t === 'ellipse-major') {
        e.props.major = [to[0] - c[0], to[1] - c[1], to[2] - c[2]]
      } else if (r.t === 'ellipse-minor') {
        const majLen = mag(e.props.major)
        if (majLen > 1e-9) {
          const minorUnit = normalize(cross(e.props.normal ?? [0, 0, 1], e.props.major))
          const d: Vec3 = [to[0] - c[0], to[1] - c[1], to[2] - c[2]]
          const proj = Math.abs(d[0] * minorUnit[0] + d[1] * minorUnit[1] + d[2] * minorUnit[2])
          e.props.ratio = Math.max(1e-4, proj / majLen)
        }
      }
      break
    }
    case 'RECTANGLE':
      if (r.t === 'rect-corner') {
        const [x, y, z] = e.props.corner
        const w = e.props.width
        const h = e.props.height
        const corners: Vec3[] = [
          [x, y, z],
          [x + w, y, z],
          [x + w, y + h, z],
          [x, y + h, z],
        ]
        const opp = corners[(r.corner + 2) % 4] // la esquina opuesta queda fija
        e.props.corner = [Math.min(opp[0], to[0]), Math.min(opp[1], to[1]), z]
        e.props.width = Math.abs(to[0] - opp[0])
        e.props.height = Math.abs(to[1] - opp[1])
      }
      break
    case 'POLYLINE':
      if (r.t === 'vertex' && e.props.vertices[r.index]) e.props.vertices[r.index] = [to[0], to[1], to[2]]
      break
    case 'SPLINE':
      if (r.t === 'vertex' && e.props.controlPoints[r.index]) e.props.controlPoints[r.index] = [to[0], to[1], to[2]]
      break
    case 'DIMENSION':
      if (r.t === 'dim-point' && e.props.points[r.index]) e.props.points[r.index] = [to[0], to[1], to[2]]
      else if (r.t === 'dim-textpos') e.props.textPos = [to[0], to[1], to[2]]
      else if (r.t === 'dim-line') shiftDimLine(e.props, grip.point, to)
      else if (r.t === 'dim-text') {
        // DIMTMOVE 0: la línea de cota acompaña al texto; 1 y 2: el texto se mueve solo.
        if (e.props.style.DIMTMOVE === 0 && dimDisplay(e.props).handles) shiftDimLine(e.props, grip.point, to)
        e.props.textAt = [to[0], to[1], to[2]]
      }
      break
    case 'VIEWPORT':
      if (r.t === 'rect-corner') {
        const opp = viewportCorners(e.props)[(r.corner + 2) % 4]
        e.props.width = Math.max(1e-3, Math.abs(to[0] - opp[0]))
        e.props.height = Math.max(1e-3, Math.abs(to[1] - opp[1]))
        e.props.center = [(to[0] + opp[0]) / 2, (to[1] + opp[1]) / 2, 0]
      } else if (r.t === 'vertex' && e.props.clip?.[r.index]) {
        e.props.clip[r.index] = [to[0], to[1]]
        coverClip(e.props)
      }
      break
    case 'TEXT':
    case 'ATTDEF':
    case 'SOLID3D':
    case 'MESH3D':
    case 'INSERT':
    case 'HATCH':
      break // sólo grip de mover (ya resuelto arriba)
  }
}
