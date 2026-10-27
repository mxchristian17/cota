import { BYBLOCK, BYLAYER_OF } from '../linetype/linetypes'
import { mapShade } from '../projection/shade'
import { mapHatch } from '../hatch/edit'
import type { Vec3 } from '../math'
import type { AttDisp, AttdefProps, AttributeValue, BlockDef, EdgeRef, Entity, InsertProps, SolidProps } from '../document/types'
import { attdefText } from '../geom/text'
import { arcBasis, arcEndpoints, arcFromAngles, arcIsClockwise } from '../geom/arc'
import { sweepStartRef } from './solid'

/**
 * Bloques: transformación de la geometría de una definición al mundo según un INSERT
 * (world = position + Rz(rot) · (scale ⊙ p)) y expansión recursiva (bloques anidados).
 *
 * Las inserciones son referencias REALES: la geometría se deriva de la definición compartida cada vez
 * que se dibuja/consulta, por lo que redefinir el bloque actualiza todas las inserciones.
 * Framework-agnostic y testeable.
 */

const MAX_DEPTH = 8 // corta recursión de bloques mutuamente anidados

/** Escala representativa para dimensiones radiales/planas (escala uniforme = exacta; no uniforme ≈). */
const planarScale = (s: Vec3): number => (Math.abs(s[0]) + Math.abs(s[1])) / 2

/**
 * Plano de la inserción (OCS del CAD clásico): base (u, v, n) de su normal, o null si está en planta
 * (normal +Z). Con normal, el bloque se dibuja en ese plano: world = position + OCS · Rz(rot) · (scale ⊙ p).
 */
export function insertOcs(ins: Pick<InsertProps, 'normal'>): { u: Vec3; v: Vec3; n: Vec3 } | null {
  const n = ins.normal
  if (!n || (Math.abs(n[0]) < 1e-12 && Math.abs(n[1]) < 1e-12 && n[2] > 0)) return null
  return arcBasis(n)
}

/** Mapa dirección→mundo (sin traslación): escala, rota en su plano y lleva al plano de la inserción. */
function dirMap(ins: InsertProps): (d: Vec3) => Vec3 {
  const cos = Math.cos(ins.rotation)
  const sin = Math.sin(ins.rotation)
  const [sx, sy, sz] = ins.scale
  const o = insertOcs(ins)
  return (d) => {
    const x = d[0] * sx
    const y = d[1] * sy
    const r: Vec3 = [x * cos - y * sin, x * sin + y * cos, d[2] * sz]
    if (!o) return r
    return [0, 1, 2].map((i) => o.u[i] * r[0] + o.v[i] * r[1] + o.n[i] * r[2]) as Vec3
  }
}

/** Dirección de la X del bloque de una inserción (en su plano, girada `rotation`). */
export function insertXDir(ins: Pick<InsertProps, 'rotation' | 'normal'>): Vec3 {
  const o = insertOcs(ins)
  const c = Math.cos(ins.rotation)
  const s = Math.sin(ins.rotation)
  if (!o) return [c, s, 0]
  return [0, 1, 2].map((i) => o.u[i] * c + o.v[i] * s) as Vec3
}

/** Mapa punto→mundo del INSERT. */
function pointMap(ins: InsertProps): (p: Vec3) => Vec3 {
  const D = dirMap(ins)
  const [px, py, pz] = ins.position
  return (p) => {
    const d = D(p)
    return [px + d[0], py + d[1], pz + d[2]]
  }
}

const unit = (v: Vec3): Vec3 => {
  const L = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / L, v[1] / L, v[2] / L]
}
const isPlusZ = (n: Vec3) => Math.abs(n[0]) < 1e-12 && Math.abs(n[1]) < 1e-12 && n[2] > 0
/** Ángulo de la dirección `d` en el plano de normal `n` (base `arcBasis`). */
const angleIn = (n: Vec3, d: Vec3): number => {
  const b = arcBasis(n)
  return Math.atan2(d[0] * b.v[0] + d[1] * b.v[1] + d[2] * b.v[2], d[0] * b.u[0] + d[1] * b.u[1] + d[2] * b.u[2])
}
/** Dirección de ángulo `a` en el plano de normal `n`. */
const dirAt = (n: Vec3, a: number): Vec3 => {
  const b = arcBasis(n)
  return [0, 1, 2].map((i) => b.u[i] * Math.cos(a) + b.v[i] * Math.sin(a)) as Vec3
}

/** Transforma un sólido paramétrico al mundo (anclas por `P`, escalas radiales/de altura ≈). */
/** Transforma los puntos de referencia de aristas de un FILLETEDGE/CHAMFEREDGE. */
const mapRefs = (edges: EdgeRef[], P: (v: Vec3) => Vec3): EdgeRef[] =>
  edges.map((e) => (e.base ? { at: P(e.at), base: P(e.base) } : { at: P(e.at) }))

/** Dirección transformada por la parte lineal de `P` (normalizada). */
function dirBy(P: (v: Vec3) => Vec3, d: Vec3): Vec3 {
  const o = P([0, 0, 0])
  const q = P(d)
  const v: Vec3 = [q[0] - o[0], q[1] - o[1], q[2] - o[2]]
  const L = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / L, v[1] / L, v[2] / L]
}

function transformSolid(p: SolidProps, P: (v: Vec3) => Vec3, sr: number, sz: number, plan = true, flip = false): SolidProps {
  // Ejes: los que el sólido guarda se llevan por `P`; fuera de planta también el +Z implícito.
  const ax = (a: Vec3 | undefined): Vec3 | undefined => (a ? dirBy(P, a) : plan ? undefined : dirBy(P, [0, 0, 1]))
  const withAxis = (a: Vec3 | undefined) => {
    const v = ax(a)
    return v ? { axis: v } : {}
  }
  switch (p.op) {
    case 'EXTRUDE':
      return { ...p, profile: p.profile.map(P), height: p.height * sz, ...withAxis(p.axis) }
    case 'BOX': {
      // Los ejes de la caja siguen a la inserción (girada): se mapean como direcciones.
      const o = P(p.origin)
      const axis = (d: Vec3): Vec3 => {
        const q = P([p.origin[0] + d[0], p.origin[1] + d[1], p.origin[2] + d[2]])
        const v: Vec3 = [q[0] - o[0], q[1] - o[1], q[2] - o[2]]
        const l = Math.hypot(v[0], v[1], v[2]) || 1
        return [v[0] / l, v[1] / l, v[2] / l]
      }
      const x = axis(p.basis?.x ?? [1, 0, 0])
      const y = axis(p.basis?.y ?? [0, 1, 0])
      const world = Math.abs(x[0] - 1) < 1e-12 && Math.abs(y[1] - 1) < 1e-12
      const { basis: _drop, ...rest } = p
      void _drop
      return { ...rest, origin: o, width: p.width * sr, depth: p.depth * sr, height: p.height * sz, ...(world ? {} : { basis: { x, y } }) }
    }
    case 'CYLINDER':
      return { ...p, base: P(p.base), radius: p.radius * sr, height: p.height * sz, ...withAxis(p.axis) }
    case 'CONE':
      return { ...p, base: P(p.base), radius: p.radius * sr, radiusTop: (p.radiusTop ?? 0) * sr, height: p.height * sz, ...withAxis(p.axis) }
    case 'SPHERE':
      return { ...p, center: P(p.center), radius: p.radius * sr }
    case 'PRISM': {
      // Los ejes del N-gono siguen a la inserción (girada o en otro plano), como los de la caja.
      const x = dirBy(P, p.basis?.x ?? [1, 0, 0])
      const y = dirBy(P, p.basis?.y ?? [0, 1, 0])
      const world = Math.abs(x[0] - 1) < 1e-12 && Math.abs(y[1] - 1) < 1e-12
      const { basis: _b, ...rest } = p
      void _b
      return { ...rest, center: P(p.center), radius: p.radius * sr, height: p.height * sz, ...(world ? {} : { basis: { x, y } }) }
    }
    case 'REVOLVE':
      if ((!p.axis || !p.ref) && plan) return { ...p, base: P(p.base) }
      return { ...p, base: P(p.base), axis: dirBy(P, p.axis ?? [0, 0, 1]), ref: dirBy(P, p.ref ?? [1, 0, 0]), profile: p.profile.map(([r, h]) => [r * sr, h * sr]) }
    case 'TORUS':
      return { ...p, center: P(p.center), radius: p.radius * sr, tube: p.tube * sr, ...withAxis(p.axis) }
    case 'SWEEP':
      return { ...p, path: p.path.map(P), ref: dirBy(P, sweepStartRef(p)), ...(flip ? { mirror: !p.mirror } : {}) }
    case 'LOFT':
      return { ...p, sections: p.sections.map((sec) => sec.map(P)) }
    case 'SHELL':
      return { ...p, solid: transformSolid(p.solid, P, sr, sz, plan, flip) }
    case 'FILLETEDGE':
      return { ...p, solid: transformSolid(p.solid, P, sr, sz, plan, flip), edges: mapRefs(p.edges, P), radius: p.radius * sr }
    case 'CHAMFEREDGE':
      return { ...p, solid: transformSolid(p.solid, P, sr, sz, plan, flip), edges: mapRefs(p.edges, P), d1: p.d1 * sr, d2: p.d2 * sr }
    default:
      return { ...p, operands: p.operands.map((o) => transformSolid(o, P, sr, sz, plan, flip)) }
  }
}

/** Devuelve una copia de `e` con su geometría transformada al mundo según el INSERT `ins`. */
export function transformEntity(e: Entity, ins: InsertProps): Entity {
  const P = pointMap(ins)
  const D = dirMap(ins)
  const sr = planarScale(ins.scale)
  const sz = Math.abs(ins.scale[2])
  const plan = !insertOcs(ins)
  const flip = ins.scale[0] * ins.scale[1] * ins.scale[2] < 0
  /** Normal transformada; una escala con signo negativo invierte el sentido de giro (y con él la normal). */
  const N = (n: Vec3 | undefined): Vec3 => {
    const m = unit(D(n ?? [0, 0, 1]))
    return flip ? [-m[0], -m[1], -m[2]] : m
  }
  /** Ángulo "en el plano" transformado (textos, sombreados, inserciones anidadas) fuera de planta. */
  const turn = (n: Vec3 | undefined, a: number): number => angleIn(N(n), D(dirAt(n ?? [0, 0, 1], a)))
  if (!plan) {
    // Fuera de planta: todo en 3D; los casos de planta de abajo se conservan tal cual.
    switch (e.type) {
      case 'ARC': {
        const n = N(e.props.normal)
        const c = P(e.props.center)
        const ang = (q: Vec3) => angleIn(n, [q[0] - c[0], q[1] - c[1], q[2] - c[2]])
        const [s0, e0] = arcEndpoints(e.props)
        return { ...e, props: { ...e.props, center: c, radius: e.props.radius * sr, normal: n, startAngle: ang(P(s0)), endAngle: ang(P(e0)) } }
      }
      case 'RECTANGLE': {
        const [x, y, z] = e.props.corner
        const { width: w, height: h } = e.props
        const verts = ([[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]] as Vec3[]).map(P)
        return { id: e.id, type: 'POLYLINE', layer: e.layer, props: { vertices: verts, closed: true, normal: N([0, 0, 1]) } }
      }
      case 'TEXT':
      case 'ATTDEF':
        return { ...e, props: { ...e.props, position: P(e.props.position), height: e.props.height * sr, rotation: turn(e.props.normal, e.props.rotation), normal: N(e.props.normal) } } as Entity
      case 'HATCH': {
        const props = mapHatch(e.props, P, sr, flip)
        props.normal = N(e.props.normal)
        props.angle = turn(e.props.normal, e.props.angle)
        return { ...e, props }
      }
      case 'INSERT': {
        const n = N(e.props.normal)
        const props: InsertProps = {
          ...e.props,
          position: P(e.props.position),
          scale: [e.props.scale[0] * ins.scale[0], e.props.scale[1] * ins.scale[1], e.props.scale[2] * ins.scale[2]],
          rotation: angleIn(n, D(insertXDir(e.props))),
          normal: n,
        }
        if (isPlusZ(n)) delete props.normal
        return { ...e, props }
      }
    }
  }
  switch (e.type) {
    case 'SHADE':
      return { ...e, props: mapShade(e.props, P) }
    case 'POINT':
      return { ...e, props: { position: P(e.props.position) } }
    case 'LINE':
      return { ...e, props: { start: P(e.props.start), end: P(e.props.end) } }
    case 'CIRCLE':
      return { ...e, props: { center: P(e.props.center), radius: e.props.radius * sr, normal: D(e.props.normal) } }
    case 'ARC': {
      // Se transforman centro y extremos; una escala con un eje negativo invierte el sentido.
      const [s0, e0] = arcEndpoints(e.props)
      const c = P(e.props.center)
      const s = P(s0)
      const en = P(e0)
      const flipped = ins.scale[0] * ins.scale[1] < 0
      const cw = arcIsClockwise(e.props) !== flipped
      const arc = arcFromAngles(
        c,
        e.props.radius * sr,
        Math.atan2(s[1] - c[1], s[0] - c[0]),
        Math.atan2(en[1] - c[1], en[0] - c[0]),
        cw,
      )
      return { ...e, props: arc ?? e.props }
    }
    case 'ELLIPSE':
      return { ...e, props: { center: P(e.props.center), major: D(e.props.major), ratio: e.props.ratio, normal: D(e.props.normal) } }
    case 'RECTANGLE': {
      // Con rotación pasa a POLILÍNEA (deja de ser axis-aligned); sin rotación se re-escala.
      const [x, y, z] = e.props.corner
      const w = e.props.width
      const h = e.props.height
      if (Math.abs(ins.rotation) < 1e-9) {
        return { ...e, props: { corner: P(e.props.corner), width: w * Math.abs(ins.scale[0]), height: h * Math.abs(ins.scale[1]) } }
      }
      const verts: Vec3[] = [[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]].map((v) => P(v as Vec3))
      return { id: e.id, type: 'POLYLINE', layer: e.layer, props: { vertices: verts, closed: true } }
    }
    case 'POLYLINE': {
      // Conserva arcos (bulges), anchos y normal (antes se perdían dentro de los bloques).
      const n = N(e.props.normal)
      const props = { ...structuredClone(e.props), vertices: e.props.vertices.map(P), normal: n }
      if (e.props.frame) props.frame = e.props.frame.map(P)
      if (e.props.widths) props.widths = e.props.widths.map(([a, b]): [number, number] => [a * sr, b * sr])
      if (isPlusZ(n)) delete (props as { normal?: Vec3 }).normal
      return { ...e, props }
    }
    case 'SPLINE':
      return { ...e, props: { controlPoints: e.props.controlPoints.map(P), degree: e.props.degree } }
    case 'TEXT':
      return { ...e, props: { ...e.props, position: P(e.props.position), height: e.props.height * sr, rotation: e.props.rotation + ins.rotation, normal: D(e.props.normal) } }
    case 'ATTDEF':
      return { ...e, props: { ...e.props, position: P(e.props.position), height: e.props.height * sr, rotation: e.props.rotation + ins.rotation, normal: D(e.props.normal) } }
    case 'DIMENSION':
      // La escala de la inserción agranda la cota entera (como DIMSCALE).
      return { ...e, props: { ...structuredClone(e.props), points: e.props.points.map(P), textPos: P(e.props.textPos), ...(e.props.textAt ? { textAt: P(e.props.textAt) } : {}), ...(e.props.normal ? { normal: dirBy(P, e.props.normal) } : {}), style: { ...e.props.style, DIMSCALE: (e.props.style.DIMSCALE || 1) * sr } } }
    case 'SOLID3D':
      return { ...e, props: transformSolid(e.props, P, sr, sz, plan, flip) }
    case 'MESH3D':
      return { ...e, props: { vertices: e.props.vertices.map(P), faces: e.props.faces } }
    case 'INSERT':
      // Inserción anidada: compone la transform (posición y escala) — la recursión se hace en expandInsert.
      return { ...e, props: { ...e.props, position: P(e.props.position), scale: [e.props.scale[0] * ins.scale[0], e.props.scale[1] * ins.scale[1], e.props.scale[2] * ins.scale[2]], rotation: e.props.rotation + ins.rotation } }
    case 'HATCH': {
      // Lazos, origen y semillas; el patrón escala con la inserción y gira con ella.
      const props = mapHatch(e.props, P, sr, ins.scale[0] * ins.scale[1] < 0)
      const n = D(e.props.normal ?? [0, 0, 1])
      if (Math.abs(n[0]) < 1e-12 && Math.abs(n[1]) < 1e-12 && n[2] > 0) delete props.normal
      else props.normal = n
      props.angle = e.props.angle + ins.rotation * ((e.props.normal?.[2] ?? 1) < 0 ? -1 : 1)
      return { ...e, props }
    }
    case 'VIEWPORT':
      return e // los viewports no se incluyen en bloques (BLOCK los descarta)
  }
}

export interface ExpandOptions {
  /** ATTDISP (por defecto `normal`: los atributos invisibles no se generan). */
  attdisp?: AttDisp
  /** EXPLODE: los ATTDEF de la definición quedan como ATTDEF (se pierden los valores, como el CAD clásico). */
  attdefs?: boolean
  /** EXPLODE: cada objeto vuelve a su capa (sin heredar la de la inserción). */
  keepLayers?: boolean
  /** Capas congeladas: se omiten las inserciones en ellas y lo que el bloque tenga en ellas. */
  skipLayers?: Set<string>
}

/** Id de la capa `0`: lo que un bloque tiene en ella toma la capa de la inserción (como el CAD clásico). */
const LAYER0 = '0'

/** ATTDEF de la definición → texto del atributo de una inserción (valor de la inserción o constante). */
function attributeText(child: Extract<Entity, { type: 'ATTDEF' }>, ins: InsertProps, attdisp: AttDisp): Entity | null {
  const a = child.props
  if (attdisp === 'off' || (attdisp === 'normal' && a.invisible)) return null
  const value = a.constant ? a.value : ins.attributes?.find((v) => v.tag === a.tag)?.value
  if (value === undefined) return null // tag nuevo de una redefinición: aparece con ATTSYNC
  return { id: child.id, type: 'TEXT', layer: child.layer, props: { ...attdefText(a), text: value } }
}

/**
 * Expande una inserción a entidades de mundo (recursivo). Cada entidad lleva el id de la inserción; lo
 * que está en la capa `0` toma la capa `layer` de la inserción (color, On/Off y Freeze, como el CAD clásico).
 */
/**
 * Tipo de línea de un objeto del bloque: ByBlock toma el de la inserción (y si la inserción es
 * ByLayer, el de su capa); la escala propia se multiplica por la de la inserción.
 */
function byBlockCommon(child: Entity, ins: { lineType?: string; ltScale?: number; layer: string }, sr: number): Pick<Entity, 'lineType' | 'ltScale'> {
  const out: Pick<Entity, 'lineType' | 'ltScale'> = {}
  const lt = child.lineType?.toUpperCase()
  if (lt === BYBLOCK) out.lineType = ins.lineType && ins.lineType.toUpperCase() !== BYBLOCK ? ins.lineType : BYLAYER_OF + ins.layer
  else if (child.lineType !== undefined) out.lineType = child.lineType
  const s = (child.ltScale ?? 1) * (lt === BYBLOCK ? (ins.ltScale ?? 1) : 1) * sr
  if (s !== 1) out.ltScale = s
  return out
}

function expandInsert(props: InsertProps, byName: Map<string, BlockDef>, ownerId: string, depth: number, opts: ExpandOptions, layer: string, insCommon: { lineType?: string; ltScale?: number } = {}): Entity[] {
  if (depth > MAX_DEPTH) return []
  const def = byName.get(props.name)
  if (!def) return []
  const out: Entity[] = []
  const sr = planarScale(props.scale)
  const ins = { ...insCommon, layer }
  for (const child of def.entities) {
    const lay = child.layer === LAYER0 && !opts.keepLayers ? layer : child.layer
    if (opts.skipLayers?.has(lay)) continue
    // EXPLODE (keepLayers) conserva las propiedades tal cual; al dibujar, ByBlock toma las de la inserción.
    const common = opts.keepLayers ? {} : byBlockCommon(child, ins, sr)
    if (child.type === 'INSERT') {
      // Expande el bloque anidado y luego aplica la transform de ESTA inserción.
      for (const ge of expandInsert(child.props, byName, ownerId, depth + 1, opts, lay, { lineType: common.lineType, ltScale: common.ltScale })) {
        out.push({ ...transformEntity(ge, props), id: ownerId })
      }
    } else if (child.type === 'ATTDEF' && !opts.attdefs) {
      const t = attributeText(child, props, opts.attdisp ?? 'normal')
      if (t) out.push({ ...transformEntity(t, props), id: ownerId, layer: lay })
    } else {
      out.push({ ...transformEntity(child, props), id: ownerId, layer: lay, ...common })
    }
  }
  return out
}

/** Expande la lista de entidades reemplazando cada INSERT por su geometría de mundo (bloques anidados
 *  incluidos) y sus atributos como textos. Las entidades no-INSERT pasan sin cambios. Devuelve la misma
 *  lista si no hay inserciones. */
export function expandEntities(entities: Entity[], blocks: BlockDef[] | undefined, opts: ExpandOptions = {}): Entity[] {
  const skip = opts.skipLayers?.size ? opts.skipLayers : null
  const list = skip ? entities.filter((e) => !skip.has(e.layer)) : entities
  if (!blocks || blocks.length === 0 || !list.some((e) => e.type === 'INSERT')) return list
  const byName = new Map(blocks.map((b) => [b.name, b]))
  const out: Entity[] = []
  for (const e of list) {
    if (e.type === 'INSERT') out.push(...expandInsert(e.props, byName, e.id, 0, opts, e.layer, { lineType: e.lineType, ltScale: e.ltScale }))
    else out.push(e)
  }
  return out
}

/** ATTDEF de primer nivel de una definición (los que piden valor al insertar), en orden. */
export function blockAttdefs(def: BlockDef | undefined): AttdefProps[] {
  return (def?.entities ?? []).flatMap((e) => (e.type === 'ATTDEF' ? [e.props] : []))
}

/** Valores por defecto de los atributos variables (no constantes) de un bloque. */
export function defaultAttributes(def: BlockDef | undefined): AttributeValue[] {
  return blockAttdefs(def)
    .filter((a) => !a.constant)
    .map((a) => ({ tag: a.tag, value: a.value }))
}

/**
 * ATTSYNC: atributos de una inserción según la definición actual — conserva los valores de los tags
 * que siguen, agrega los nuevos con su valor por defecto y quita los que ya no existen.
 */
export function syncAttributes(current: AttributeValue[] | undefined, def: BlockDef | undefined): AttributeValue[] {
  return defaultAttributes(def).map((d) => current?.find((c) => c.tag === d.tag) ?? d)
}
