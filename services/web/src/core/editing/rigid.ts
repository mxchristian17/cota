import { keepCommon } from '../document/common'
import { mapShade } from '../projection/shade'
import type { Vec3 } from '../math'
import type { ArcProps, DimensionProps, Entity, EntityInput, PolylineProps, SolidProps } from '../document/types'
import { arcBasis, arcPointAtAngle } from '../geom/arc'
import { vcross, vdot, vlen, vnorm } from '../geom/vec3'
import { ucsZ, type Ucs } from '../ucs'
import { linearDir } from '../dimension/dimGeometry'
import { sweepStartRef } from './solid'
import { insertXDir } from './block'
import { mapOwnThreads } from '../thread/geometry'

/**
 * Transformaciones rígidas (rotación + traslación) de entidades y sólidos en 3D. Son la base
 * de ROTATE alrededor de la Z de la UCS y del adaptador "en el marco de la UCS": se lleva la geometría al
 * plano XY de la UCS, se usa el algoritmo 2D de siempre y se la devuelve a su lugar.
 */

/** Matriz 3×3 por columnas (imágenes de X, Y, Z) + traslación. Sólo rotaciones propias (det = +1). */
export interface Rigid {
  m: [Vec3, Vec3, Vec3]
  t: Vec3
}

export const IDENTITY: Rigid = { m: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] }

export const rigidDir = (r: Rigid, d: Vec3): Vec3 => [0, 1, 2].map((i) => r.m[0][i] * d[0] + r.m[1][i] * d[1] + r.m[2][i] * d[2]) as Vec3

export function rigidPoint(r: Rigid, p: Vec3): Vec3 {
  const d = rigidDir(r, p)
  return [d[0] + r.t[0], d[1] + r.t[1], d[2] + r.t[2]]
}

/** Inversa: Rᵀ y −Rᵀ·t (las columnas de Rᵀ son las filas de R). */
export function invertRigid(r: Rigid): Rigid {
  const inv: Rigid = {
    m: [
      [r.m[0][0], r.m[1][0], r.m[2][0]],
      [r.m[0][1], r.m[1][1], r.m[2][1]],
      [r.m[0][2], r.m[1][2], r.m[2][2]],
    ],
    t: [0, 0, 0],
  }
  const tt = rigidDir(inv, r.t)
  inv.t = [-tt[0], -tt[1], -tt[2]]
  return inv
}

/** a ∘ b (primero b, después a). */
export function composeRigid(a: Rigid, b: Rigid): Rigid {
  return { m: [rigidDir(a, b.m[0]), rigidDir(a, b.m[1]), rigidDir(a, b.m[2])], t: rigidPoint(a, b.t) }
}

/** Coordenadas de la UCS → mundo. */
export function rigidFromUcs(u: Ucs): Rigid {
  return { m: [[...u.x], [...u.y], ucsZ(u)], t: [u.origin.x, u.origin.y, u.origin.z] }
}

/** Mundo → coordenadas de la UCS. */
export const rigidToUcs = (u: Ucs): Rigid => invertRigid(rigidFromUcs(u))

/** Rotación de `ang` radianes alrededor del eje que pasa por `p` con dirección `axis` (mano derecha). */
export function rotationAbout(p: Vec3, axis: Vec3, ang: number): Rigid {
  const k = vnorm(axis)
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const rot = (v: Vec3): Vec3 => {
    const kv = vcross(k, v)
    const kd = vdot(k, v)
    return [0, 1, 2].map((i) => v[i] * c + kv[i] * s + k[i] * kd * (1 - c)) as Vec3
  }
  const r: Rigid = { m: [rot([1, 0, 0]), rot([0, 1, 0]), rot([0, 0, 1])], t: [0, 0, 0] }
  const rp = rigidDir(r, p)
  r.t = [p[0] - rp[0], p[1] - rp[1], p[2] - rp[2]]
  return r
}

const isZ = (v: Vec3) => Math.abs(v[0]) < 1e-9 && Math.abs(v[1]) < 1e-9 && v[2] > 0
const eqV = (a: Vec3, b: Vec3) => Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12 && Math.abs(a[2] - b[2]) < 1e-12

/** ¿Deja el plano XY en su lugar (gira sólo alrededor de Z)? Entonces sirven las entidades "de planta". */
export const isPlanRigid = (r: Rigid): boolean => isZ(r.m[2])

/** Ángulo de la dirección `d` en el plano de `normal` (base `arcBasis`). */
function angleIn(normal: Vec3, d: Vec3): number {
  const b = arcBasis(normal)
  return Math.atan2(vdot(d, b.v), vdot(d, b.u))
}

/** Dirección de ángulo `a` en el plano de `normal`. */
function dirAt(normal: Vec3, a: number): Vec3 {
  const b = arcBasis(normal)
  return [0, 1, 2].map((i) => b.u[i] * Math.cos(a) + b.v[i] * Math.sin(a)) as Vec3
}

/** Cuánto gira la base del plano al transformarlo (radianes): para los ángulos guardados "en el plano". */
function basisTurn(r: Rigid, normal: Vec3): { normal: Vec3; turn: number } {
  const n2 = vnorm(rigidDir(r, normal))
  return { normal: n2, turn: angleIn(n2, rigidDir(r, arcBasis(normal).u)) }
}

const tp = (r: Rigid, p: Vec3) => rigidPoint(r, p)

/** Transforma un árbol de sólido. null si alguna hoja no se puede representar transformada. */
export function transformSolid(p: SolidProps, r: Rigid): SolidProps | null {
  const q = transformNode(p, r)
  if (q) mapOwnThreads(q, (v) => tp(r, v))
  return q
}

function transformNode(p: SolidProps, r: Rigid): SolidProps | null {
  const q = structuredClone(p) as SolidProps
  const dir = (v: Vec3 | undefined, def: Vec3): Vec3 => vnorm(rigidDir(r, v ?? def))
  switch (q.op) {
    case 'EXTRUDE':
      q.profile = q.profile.map((v) => tp(r, v))
      q.axis = dir(q.axis, [0, 0, 1])
      return q
    case 'BOX':
    case 'PRISM': {
      if (q.op === 'BOX') q.origin = tp(r, q.origin)
      else q.center = tp(r, q.center)
      const bx = dir(q.basis?.x, [1, 0, 0])
      const by = dir(q.basis?.y, [0, 1, 0])
      if (eqV(bx, [1, 0, 0]) && eqV(by, [0, 1, 0])) delete q.basis
      else q.basis = { x: bx, y: by }
      return q
    }
    case 'CYLINDER':
    case 'CONE':
      q.base = tp(r, q.base)
      q.axis = dir(q.axis, [0, 0, 1])
      return q
    case 'SPHERE':
      q.center = tp(r, q.center)
      return q
    case 'TORUS':
      q.center = tp(r, q.center)
      q.axis = dir(q.axis, [0, 0, 1])
      return q
    case 'REVOLVE':
      q.base = tp(r, q.base)
      q.axis = dir(q.axis, [0, 0, 1])
      q.ref = dir(q.ref, [1, 0, 0])
      return q
    case 'SWEEP':
      q.ref = dir(sweepStartRef(p as typeof q), [1, 0, 0])
      q.path = q.path.map((v) => tp(r, v))
      return q
    case 'LOFT':
      q.sections = q.sections.map((s) => s.map((v) => tp(r, v)))
      return q
    case 'SHELL': {
      const inner = transformSolid(q.solid, r)
      if (!inner) return null
      q.solid = inner
      return q
    }
    case 'FILLETEDGE':
    case 'CHAMFEREDGE': {
      const inner = transformSolid(q.solid, r)
      if (!inner) return null
      q.solid = inner
      q.edges = q.edges.map((e) => ({ at: tp(r, e.at), ...(e.base ? { base: tp(r, e.base) } : {}) }))
      return q
    }
    case 'UNION':
    case 'SUBTRACT':
    case 'INTERSECT': {
      const ops = q.operands.map((o) => transformSolid(o, r))
      if (ops.some((o) => !o)) return null
      q.operands = ops as SolidProps[]
      return q
    }
  }
}

/** Arco transformado: centro, normal y ángulos recalculados desde los extremos. */
function transformArc(a: ArcProps, r: Rigid): ArcProps {
  const n = vnorm(rigidDir(r, a.normal))
  const c = tp(r, a.center)
  const s = tp(r, arcPointAtAngle(a, a.startAngle))
  const e = tp(r, arcPointAtAngle(a, a.endAngle))
  const ang = (p: Vec3) => angleIn(n, [p[0] - c[0], p[1] - c[1], p[2] - c[2]])
  return { ...a, center: c, normal: n, startAngle: ang(s), endAngle: ang(e) }
}

/**
 * Entidad transformada (nueva, sin id). null si el tipo no admite la transformación (p. ej. un INSERT
 * fuera de su plano o un VIEWPORT).
 */
export function transformEntity(e: Entity, r: Rigid): EntityInput | null {
  const out = transformEntityProps(e, r)
  return out && keepCommon(out, e)
}

function transformEntityProps(e: Entity, r: Rigid): EntityInput | null {
  const layer = e.layer
  switch (e.type) {
    case 'POINT':
      return { type: 'POINT', layer, props: { position: tp(r, e.props.position) } }
    case 'LINE':
      return { type: 'LINE', layer, props: { ...e.props, start: tp(r, e.props.start), end: tp(r, e.props.end) } }
    case 'CIRCLE':
      return { type: 'CIRCLE', layer, props: { ...e.props, center: tp(r, e.props.center), normal: vnorm(rigidDir(r, e.props.normal)) } }
    case 'ARC':
      return { type: 'ARC', layer, props: transformArc(e.props, r) }
    case 'ELLIPSE':
      return {
        type: 'ELLIPSE',
        layer,
        props: { ...e.props, center: tp(r, e.props.center), major: rigidDir(r, e.props.major), normal: vnorm(rigidDir(r, e.props.normal)) },
      }
    case 'POLYLINE': {
      const n = vnorm(rigidDir(r, e.props.normal ?? [0, 0, 1]))
      const props: PolylineProps = { ...structuredClone(e.props), vertices: e.props.vertices.map((v) => tp(r, v)), normal: n }
      if (e.props.frame) props.frame = e.props.frame.map((v) => tp(r, v))
      if (e.props.tangents) {
        const { turn } = basisTurn(r, e.props.normal ?? [0, 0, 1])
        props.tangents = e.props.tangents.map((t) => (t === null ? null : t + turn))
      }
      if (isZ(n)) delete props.normal
      return { type: 'POLYLINE', layer, props }
    }
    case 'RECTANGLE': {
      const [x, y, z] = e.props.corner
      const { width: w, height: h } = e.props
      const pts = ([[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]] as Vec3[]).map((v) => tp(r, v))
      const xs = pts.map((p) => p[0])
      const ys = pts.map((p) => p[1])
      // Sigue siendo un rectángulo de planta alineado a los ejes: RECTANGLE; si no, polilínea cerrada.
      const aligned = isPlanRigid(r) && (Math.abs(r.m[0][0]) < 1e-12 || Math.abs(r.m[0][1]) < 1e-12)
      if (aligned) {
        return { type: 'RECTANGLE', layer, props: { corner: [Math.min(...xs), Math.min(...ys), pts[0][2]], width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) } }
      }
      const n = vnorm(rigidDir(r, [0, 0, 1]))
      return { type: 'POLYLINE', layer, props: { vertices: pts, closed: true, ...(isZ(n) ? {} : { normal: n }) } }
    }
    case 'SPLINE':
      return { type: 'SPLINE', layer, props: { ...e.props, controlPoints: e.props.controlPoints.map((v) => tp(r, v)) } }
    case 'TEXT':
    case 'ATTDEF': {
      const { normal, turn } = basisTurn(r, e.props.normal)
      const props = { ...structuredClone(e.props), position: tp(r, e.props.position), normal, rotation: e.props.rotation + turn }
      return { type: e.type, layer, props } as EntityInput
    }
    case 'SOLID3D': {
      const props = transformSolid(e.props, r)
      return props ? { type: 'SOLID3D', layer, props } : null
    }
    case 'MESH3D':
      return { type: 'MESH3D', layer, props: { ...e.props, vertices: e.props.vertices.map((v) => tp(r, v)) } }
    case 'DIMENSION': {
      const d = e.props
      const { normal, turn } = basisTurn(r, d.normal ?? [0, 0, 1])
      const deg = (turn * 180) / Math.PI
      const props: DimensionProps = {
        ...structuredClone(d),
        points: d.points.map((v) => tp(r, v)),
        textPos: tp(r, d.textPos),
        normal,
        ...(d.textAt ? { textAt: tp(r, d.textAt) } : {}),
        ...(d.autoBreaks ? { autoBreaks: d.autoBreaks.map((v) => tp(r, v)) } : {}),
      }
      if (isZ(normal) && !d.normal) delete props.normal
      if (Math.abs(turn) > 1e-12) {
        // Los ángulos guardados en el plano giran con su base. Una lineal H/V automática se fija en la
        // dirección que medía (si no, al girar la base pasaría a medir otra cosa).
        if (d.dimType === 'LINEAR' || d.rotation !== undefined) props.rotation = (angleIn(normal, rigidDir(r, linearDir(d))) * 180) / Math.PI
        if (d.textAngle !== undefined) props.textAngle = d.textAngle + deg
        // La horizontal de la cota (X de la UCS) gira con ella.
        const h = (((d.hdir ?? 0) + deg) % 360 + 360) % 360
        if (Math.abs(h) < 1e-9 || Math.abs(h - 360) < 1e-9) delete props.hdir
        else props.hdir = h
      }
      return { type: 'DIMENSION', layer, props }
    }
    case 'SHADE':
      return { type: 'SHADE', layer, props: mapShade(e.props, (v) => tp(r, v)) }
    case 'HATCH': {
      // Lazos, origen y semillas se mueven; el ángulo del patrón gira con la base del plano.
      const h = e.props
      const { normal, turn } = basisTurn(r, h.normal ?? [0, 0, 1])
      const props = structuredClone(h)
      props.loops = h.loops.map((l) => ({ ...l, vertices: l.vertices.map((v) => tp(r, v)) }))
      props.origin = tp(r, h.origin)
      props.angle = h.angle + turn
      if (isZ(normal)) delete props.normal
      else props.normal = normal
      if (h.assoc?.seeds) props.assoc = { ...h.assoc, seeds: h.assoc.seeds.map((v) => tp(r, v)) }
      return { type: 'HATCH', layer, props }
    }
    case 'INSERT': {
      // El plano de la inserción (OCS) gira con ella: normal y X del bloque transformadas.
      const p = structuredClone(e.props)
      p.position = tp(r, e.props.position)
      const n = vnorm(rigidDir(r, e.props.normal ?? [0, 0, 1]))
      p.rotation = angleIn(n, rigidDir(r, insertXDir(e.props)))
      if (isZ(n)) delete p.normal
      else p.normal = n
      return { type: 'INSERT', layer, props: p }
    }
    default:
      return null
  }
}

/** Dirección de un ángulo "de plano" (para quien la necesite fuera de este módulo). */
export { angleIn as planeAngle, dirAt as planeDir }

/** Longitud de la traslación (para tests y diagnósticos). */
export const rigidShift = (r: Rigid): number => vlen(r.t)
