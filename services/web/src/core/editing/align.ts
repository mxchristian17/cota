import type { Vec3 } from '../math'
import type { Entity, EntityInput } from '../document/types'
import { scaleEntity, translateEntity } from './edit'
import { rotateEntityInput } from './array'
import { mirrorAxis, mirrorEntityInput, type EntityTransform } from './transform'

/**
 * ALIGN, en el plano XY: 1 par de puntos traslada; 2 pares trasladan y rotan alrededor de
 * Z (y escalan si se pide); con 3 pares, si el tercero queda del otro lado del eje destino, el
 * objeto se da vuelta (en 2D, un espejo sobre ese eje). La rotación 3D fuera del plano queda fuera.
 */

export interface AlignPair {
  src: Vec3
  dst: Vec3
}

export interface AlignPlan {
  /** Traslación que lleva el primer punto origen al primer destino. */
  move: Vec3
  /** Centro de la rotación/escala/espejo (primer destino). */
  center: Vec3
  angle: number
  scale: number
  /** Eje del espejo (primer y segundo destino) o null. */
  flip: [Vec3, Vec3] | null
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross2 = (a: Vec3, b: Vec3): number => a[0] * b[1] - a[1] * b[0]
const len2 = (v: Vec3): number => Math.hypot(v[0], v[1])

/** Plan de ALIGN; null si los puntos origen o destino coinciden (no definen una dirección). */
export function alignPlan(pairs: AlignPair[], scale = false): AlignPlan | null {
  const [p1, p2, p3] = pairs
  if (!p1) return null
  const plan: AlignPlan = { move: sub(p1.dst, p1.src), center: p1.dst, angle: 0, scale: 1, flip: null }
  if (!p2) return plan
  const vs = sub(p2.src, p1.src)
  const vd = sub(p2.dst, p1.dst)
  if (len2(vs) < 1e-9 || len2(vd) < 1e-9) return null
  plan.angle = Math.atan2(vd[1], vd[0]) - Math.atan2(vs[1], vs[0])
  if (scale && !p3) plan.scale = len2(vd) / len2(vs)
  if (p3) {
    const s3 = alignPoint(plan, p3.src)
    const a = cross2(vd, sub(s3, p1.dst))
    const b = cross2(vd, sub(p3.dst, p1.dst))
    if (a * b < 0) plan.flip = [p1.dst, p2.dst]
  }
  return plan
}

/** Imagen de un punto por el plan (sin el espejo). */
export function alignPoint(plan: AlignPlan, p: Vec3): Vec3 {
  const q = sub([p[0] + plan.move[0], p[1] + plan.move[1], p[2] + plan.move[2]], plan.center)
  const c = Math.cos(plan.angle) * plan.scale
  const s = Math.sin(plan.angle) * plan.scale
  return [plan.center[0] + c * q[0] - s * q[1], plan.center[1] + s * q[0] + c * q[1], plan.center[2] + q[2] * plan.scale]
}

/** Transformación de entidades del plan (traslación → rotación → escala → espejo). */
export function alignTransform(plan: AlignPlan): EntityTransform {
  return (e) => {
    let w = structuredClone(e)
    translateEntity(w, plan.move[0], plan.move[1], plan.move[2])
    if (Math.abs(plan.angle) > 1e-12) w = { ...w, ...rotateEntityInput(w, plan.center, plan.angle) } as Entity
    if (plan.scale !== 1) scaleEntity(w, plan.center, plan.scale)
    if (plan.flip) {
      const ax = mirrorAxis(plan.flip[0], plan.flip[1])
      return ax ? mirrorEntityInput(w, ax) : null
    }
    return { type: w.type, layer: w.layer, props: w.props } as EntityInput
  }
}
