import { mapHatch } from '../hatch/edit'
import { mapShade } from '../projection/shade'
import { commonOf } from '../document/common'
import type { Vec3 } from '../math'
import type { ArcProps, DimensionProps, Entity, EntityInput, PolylineProps, SolidProps, TextProps, AttdefProps } from '../document/types'
import type { DocumentModel } from '../document/DocumentModel'
import { rotateEntityInput } from './array'
import { mapEdgePoints, sweepStartRef } from './solid'
import { arcEndpoints, arcFromAngles, arcIsClockwise, normAngle } from '../geom/arc'
import { planeAngle } from './rigid'
import { insertXDir } from './block'
import { mapOwnThreads } from '../thread/geometry'

/**
 * ROTATE / MIRROR.
 *
 * Ambas operaciones producen un `EntityInput` (igual que el array polar): cuando el tipo resultante
 * coincide con el original se **mutan las props conservando el id** (la selección y los grips siguen
 * siendo válidos); si cambia de tipo (un RECTANGLE rotado/espejado en oblicuo pasa a POLYLINE) se
 * reemplaza la entidad y se devuelve el id nuevo.
 */
export type EntityTransform = (e: Entity) => EntityInput | null

/** Aplica una transformación a varias entidades del documento. Devuelve los ids resultantes. */
export function applyTransform(doc: DocumentModel, ids: string[], fn: EntityTransform): { ids: string[]; skipped: number } {
  const out: string[] = []
  let skipped = 0
  for (const id of ids) {
    const e = doc.getEntity(id)
    if (!e) continue
    const next = fn(e)
    if (!next) {
      skipped++
      continue
    }
    if (next.type === e.type) {
      // Mismo tipo: se mutan las props y el id se conserva.
      ;(e as { props: unknown }).props = next.props
      out.push(e.id)
    } else {
      doc.removeEntity(id)
      out.push(doc.addEntity({ ...next, ...commonOf(e) }).id)
    }
  }
  if (out.length > 0 || skipped > 0) doc.touch()
  return { ids: out, skipped }
}

/** Copia transformada (para las variantes "Copy" de ROTATE y para MIRROR sin borrar el origen). */
export function addTransformed(doc: DocumentModel, ids: string[], fn: EntityTransform): { ids: string[]; skipped: number } {
  const out: string[] = []
  let skipped = 0
  for (const id of ids) {
    const e = doc.getEntity(id)
    if (!e) continue
    const next = fn(e)
    if (!next) {
      skipped++
      continue
    }
    out.push(doc.addEntity({ ...next, ...commonOf(e) }).id)
  }
  if (out.length > 0) doc.touch()
  return { ids: out, skipped }
}

/** Transformación de rotación alrededor del eje Z por `center`, en radianes. */
export function rotateTransform(center: Vec3, angle: number): EntityTransform {
  return (e) => rotateEntityInput(e, center, angle)
}

// --- MIRROR ----------------------------------------------------------------

export interface MirrorAxis {
  /** Punto del eje. */
  p: Vec3
  /** Dirección unitaria del eje (en XY). */
  d: [number, number]
}

/** Construye el eje de espejo a partir de dos puntos (null si coinciden). */
export function mirrorAxis(a: Vec3, b: Vec3): MirrorAxis | null {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return null
  return { p: a, d: [dx / len, dy / len] }
}

/** Refleja un punto respecto del eje (la Z no cambia: el espejo es en el plano XY). */
export function mirrorPoint(v: Vec3, ax: MirrorAxis): Vec3 {
  const rx = v[0] - ax.p[0]
  const ry = v[1] - ax.p[1]
  const dot = rx * ax.d[0] + ry * ax.d[1]
  // reflexión: 2·(proyección sobre el eje) − vector
  return [ax.p[0] + 2 * dot * ax.d[0] - rx, ax.p[1] + 2 * dot * ax.d[1] - ry, v[2]]
}

/** Refleja una dirección (sin trasladar), p. ej. el semieje de una elipse. */
export function mirrorDirection(v: Vec3, ax: MirrorAxis): Vec3 {
  const dot = v[0] * ax.d[0] + v[1] * ax.d[1]
  return [2 * dot * ax.d[0] - v[0], 2 * dot * ax.d[1] - v[1], v[2]]
}

/** Ángulo del eje de espejo (para reflejar rotaciones: `ang' = 2·θ − ang`). */
export function mirrorAngle(ang: number, ax: MirrorAxis): number {
  return 2 * Math.atan2(ax.d[1], ax.d[0]) - ang
}

/** ¿El eje es paralelo a X o a Y? (los únicos casos en que una caja/rectángulo sigue axis-aligned). */
export function axisAligned(ax: MirrorAxis): boolean {
  return Math.abs(ax.d[0]) < 1e-9 || Math.abs(ax.d[1]) < 1e-9
}

/** Refleja un árbol de sólido in-place. Devuelve false si alguna hoja no admite reflexión exacta. */
export function mirrorSolid(p: SolidProps, ax: MirrorAxis): boolean {
  mapOwnThreads(p, (v) => mirrorPoint(v, ax))
  switch (p.op) {
    case 'EXTRUDE':
      p.profile = p.profile.map((v) => mirrorPoint(v, ax))
      if (p.axis) p.axis = mirrorDirection(p.axis, ax)
      return true
    case 'BOX': {
      if (p.basis || !axisAligned(ax)) {
        // Caja con ejes: los ejes reflejados quedan zurdos; se toma Z = X' × Y' y el ancla pasa
        // a la cara opuesta en esa Z.
        const x = mirrorDirection(p.basis?.x ?? [1, 0, 0], ax)
        const y = mirrorDirection(p.basis?.y ?? [0, 1, 0], ax)
        const z: Vec3 = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]
        const o = mirrorPoint(p.origin, ax)
        p.origin = [o[0] - z[0] * p.height, o[1] - z[1] * p.height, o[2] - z[2] * p.height]
        p.basis = { x, y }
        return true
      }
      const o = mirrorPoint(p.origin, ax)
      const flipX = Math.abs(ax.d[0]) < 1e-9 // eje ∥ Y → se invierte X
      const flipY = Math.abs(ax.d[1]) < 1e-9 // eje ∥ X → se invierte Y
      // El origen reflejado pasa a ser la esquina opuesta en el eje invertido: se renormaliza.
      p.origin = [flipX ? o[0] - p.width : o[0], flipY ? o[1] - p.depth : o[1], o[2]]
      return true
    }
    case 'CYLINDER':
    case 'CONE':
      p.base = mirrorPoint(p.base, ax)
      if (p.axis) p.axis = mirrorDirection(p.axis, ax)
      return true
    case 'SPHERE':
      p.center = mirrorPoint(p.center, ax)
      return true
    case 'PRISM':
      p.center = mirrorPoint(p.center, ax)
      if (p.basis) {
        // Los ejes reflejados quedan zurdos: con (X', −Y') vuelven a ser derechos y su Z es la Z reflejada;
        // el N-gono, simétrico, se describe con la rotación cambiada de signo.
        const y = mirrorDirection(p.basis.y, ax)
        p.basis = { x: mirrorDirection(p.basis.x, ax), y: [-y[0], -y[1], -y[2]] }
        p.rotation = -(p.rotation ?? 0)
      } else p.rotation = mirrorAngle(p.rotation ?? 0, ax)
      return true
    case 'REVOLVE':
      p.base = mirrorPoint(p.base, ax)
      if (p.axis && p.ref) {
        p.axis = mirrorDirection(p.axis, ax)
        p.ref = mirrorDirection(p.ref, ax)
        if (p.angle !== undefined) p.angle = -p.angle // el espejo invierte el sentido de giro
      }
      return true
    case 'TORUS':
      p.center = mirrorPoint(p.center, ax)
      if (p.axis) p.axis = mirrorDirection(p.axis, ax)
      return true
    case 'SWEEP':
      // El perfil se espeja con el recorrido: se fija su X inicial reflejada y se invierte su Y.
      p.ref = mirrorDirection(sweepStartRef(p), ax)
      p.mirror = !p.mirror
      p.path = p.path.map((v) => mirrorPoint(v, ax))
      return true
    case 'LOFT':
      p.sections = p.sections.map((sec) => sec.map((v) => mirrorPoint(v, ax)))
      return true
    case 'SHELL':
      return mirrorSolid(p.solid, ax)
    case 'FILLETEDGE':
    case 'CHAMFEREDGE':
      mapEdgePoints(p, (v) => mirrorPoint(v, ax))
      return mirrorSolid(p.solid, ax)
    case 'UNION':
    case 'SUBTRACT':
    case 'INTERSECT': {
      let ok = true
      for (const operand of p.operands) ok = mirrorSolid(operand, ax) && ok
      return ok
    }
  }
}

/** ¿Plano paralelo al XY (normal ±Z)? */
const isPlanNormal = (n: Vec3 | undefined): boolean => !n || (Math.abs(n[0]) < 1e-9 && Math.abs(n[1]) < 1e-9)

/**
 * Arco fuera de planta reflejado: la reflexión invierte el sentido de giro, así que con la normal
 * −M·n el recorrido sigue yendo del inicio reflejado al fin reflejado.
 */
function mirrorArc3d(a: ArcProps, ax: MirrorAxis): ArcProps {
  const m = mirrorDirection(a.normal, ax)
  const n: Vec3 = [-m[0], -m[1], -m[2]]
  const c = mirrorPoint(a.center, ax)
  const [s, e] = arcEndpoints(a).map((q) => mirrorPoint(q, ax))
  const ang = (q: Vec3) => planeAngle(n, [q[0] - c[0], q[1] - c[1], q[2] - c[2]])
  return { ...a, center: c, normal: n, startAngle: ang(s), endAngle: ang(e) }
}

/**
 * Entidad reflejada respecto del plano perpendicular al XY que contiene el eje (en 3D: la Z no cambia).
 * Devuelve `null` cuando la entidad no admite reflexión exacta; el comando las informa y las deja sin tocar.
 *
 * El texto se refleja en **posición** pero conserva su rotación, que es el comportamiento del CAD clásico
 * con `MIRRTEXT = 0` (texto legible).
 */
export function mirrorEntityInput(e: Entity, ax: MirrorAxis): EntityInput | null {
  const props = structuredClone(e.props)
  switch (e.type) {
    case 'POINT':
      return { type: 'POINT', layer: e.layer, props: { position: mirrorPoint(e.props.position, ax) } }
    case 'LINE': {
      const p = props as { start: Vec3; end: Vec3 }
      p.start = mirrorPoint(e.props.start, ax)
      p.end = mirrorPoint(e.props.end, ax)
      return { type: 'LINE', layer: e.layer, props: p }
    }
    case 'CIRCLE': {
      const p = props as { center: Vec3; radius: number; normal: Vec3 }
      p.center = mirrorPoint(e.props.center, ax)
      p.normal = mirrorDirection(e.props.normal, ax)
      return { type: 'CIRCLE', layer: e.layer, props: p }
    }
    case 'ARC': {
      if (!isPlanNormal(e.props.normal)) return { type: 'ARC', layer: e.layer, props: mirrorArc3d(e.props, ax) }
      // El espejo invierte el sentido de recorrido: se reflejan centro y extremos y se da vuelta el
      // sentido, conservando cuál era el inicio.
      const [s0, e0] = arcEndpoints(e.props)
      const c = mirrorPoint(e.props.center, ax)
      const s = mirrorPoint(s0, ax)
      const en = mirrorPoint(e0, ax)
      const arc = arcFromAngles(
        c,
        e.props.radius,
        Math.atan2(s[1] - c[1], s[0] - c[0]),
        Math.atan2(en[1] - c[1], en[0] - c[0]),
        !arcIsClockwise(e.props),
      )
      return arc ? { type: 'ARC', layer: e.layer, props: arc } : null
    }
    case 'ELLIPSE': {
      const p = props as { center: Vec3; major: Vec3; ratio: number; normal: Vec3; startParam?: number; endParam?: number }
      p.center = mirrorPoint(e.props.center, ax)
      p.major = mirrorDirection(e.props.major, ax)
      p.normal = mirrorDirection(e.props.normal, ax)
      // El eje menor queda invertido: el punto de parámetro t pasa a ser el de −t (arco elíptico).
      if (e.props.startParam !== undefined && e.props.endParam !== undefined) {
        p.startParam = normAngle(-e.props.endParam)
        p.endParam = normAngle(-e.props.startParam)
      }
      return { type: 'ELLIPSE', layer: e.layer, props: p }
    }
    case 'SHADE':
      return { type: 'SHADE', layer: e.layer, props: mapShade(e.props, (v) => mirrorPoint(v, ax)) }
    case 'HATCH': {
      // MIRRHATCH = 0: el contorno se refleja, el patrón conserva su dirección.
      const p = mapHatch(e.props, (v) => mirrorPoint(v, ax), 1, true)
      if (!isPlanNormal(e.props.normal)) p.normal = mirrorDirection(e.props.normal!, ax)
      return { type: 'HATCH', layer: e.layer, props: p }
    }
    case 'TEXT': {
      const p = props as TextProps
      p.position = mirrorPoint(e.props.position, ax)
      return { type: 'TEXT', layer: e.layer, props: p } // MIRRTEXT = 0: no se voltea
    }
    case 'ATTDEF': {
      const p = props as AttdefProps
      p.position = mirrorPoint(e.props.position, ax)
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
      ].map((v) => mirrorPoint(v as Vec3, ax))
      if (axisAligned(ax)) {
        // Sigue siendo axis-aligned: se conserva como RECTANGLE (esquina inferior izquierda).
        const xs = corners.map((c) => c[0])
        const ys = corners.map((c) => c[1])
        return {
          type: 'RECTANGLE',
          layer: e.layer,
          props: { corner: [Math.min(...xs), Math.min(...ys), z], width: w, height: h },
        }
      }
      return { type: 'POLYLINE', layer: e.layer, props: { vertices: corners, closed: true } }
    }
    case 'POLYLINE': {
      // La reflexión invierte el sentido de giro de los tramos curvos: bulges con el signo cambiado.
      const p = props as PolylineProps
      p.vertices = e.props.vertices.map((v) => mirrorPoint(v, ax))
      if (e.props.bulges) p.bulges = e.props.bulges.map((b) => (b === 0 ? 0 : -b))
      if (e.props.normal) p.normal = mirrorDirection(e.props.normal, ax)
      if (e.props.frame) p.frame = e.props.frame.map((v) => mirrorPoint(v, ax))
      if (e.props.tangents && isPlanNormal(e.props.normal)) p.tangents = e.props.tangents.map((t) => (t === null ? null : mirrorAngle(t, ax)))
      return { type: 'POLYLINE', layer: e.layer, props: p }
    }
    case 'SPLINE': {
      const p = props as { controlPoints: Vec3[]; degree: number }
      p.controlPoints = e.props.controlPoints.map((v) => mirrorPoint(v, ax))
      return { type: 'SPLINE', layer: e.layer, props: p }
    }
    case 'SOLID3D': {
      const p = props as SolidProps
      if (!mirrorSolid(p, ax)) return null
      return { type: 'SOLID3D', layer: e.layer, props: p }
    }
    case 'MESH3D': {
      const p = props as { vertices: Vec3[]; faces: number[][] }
      p.vertices = e.props.vertices.map((v) => mirrorPoint(v, ax))
      // La reflexión invierte la orientación de las caras: se revierte para conservar las normales.
      p.faces = p.faces.map((f) => [...f].reverse())
      return { type: 'MESH3D', layer: e.layer, props: p }
    }
    case 'DIMENSION': {
      const p: DimensionProps = {
        ...structuredClone(e.props),
        points: e.props.points.map((v) => mirrorPoint(v, ax)),
        textPos: mirrorPoint(e.props.textPos, ax),
        ...(e.props.textAt ? { textAt: mirrorPoint(e.props.textAt, ax) } : {}),
        ...(e.props.normal ? { normal: mirrorDirection(e.props.normal, ax) } : {}),
        ...(e.props.rotation !== undefined ? { rotation: (mirrorAngle((e.props.rotation * Math.PI) / 180, ax) * 180) / Math.PI } : {}),
      }
      return { type: 'DIMENSION', layer: e.layer, props: p }
    }
    case 'INSERT': {
      const p = structuredClone(e.props)
      p.position = mirrorPoint(e.props.position, ax)
      p.scale = [-p.scale[0], p.scale[1], p.scale[2]] // el espejo invierte un eje del bloque
      if (isPlanNormal(e.props.normal)) {
        p.rotation = mirrorAngle(e.props.rotation, ax)
        return { type: 'INSERT', layer: e.layer, props: p }
      }
      // Fuera de planta: normal reflejada y la X del bloque (con su eje invertido) reflejada.
      const n = mirrorDirection(e.props.normal!, ax)
      const x = mirrorDirection(insertXDir(e.props), ax)
      p.normal = n
      p.rotation = planeAngle(n, [-x[0], -x[1], -x[2]])
      return { type: 'INSERT', layer: e.layer, props: p }
    }
    case 'VIEWPORT': {
      // Se refleja el marco (centro y recorte); la vista del modelo no se espeja, como en el CAD clásico.
      const p = structuredClone(e.props)
      p.center = mirrorPoint(e.props.center, ax)
      if (p.clip) p.clip = p.clip.map(([x, y]): [number, number] => {
        const q = mirrorPoint([x, y, 0], ax)
        return [q[0], q[1]]
      })
      return { type: 'VIEWPORT', layer: e.layer, props: p }
    }
  }
}

/** Transformación de espejo, para `applyTransform`/`addTransformed`. */
export function mirrorTransform(ax: MirrorAxis): EntityTransform {
  return (e) => mirrorEntityInput(e, ax)
}
