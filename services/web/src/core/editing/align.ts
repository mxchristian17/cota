import type { Vec3 } from '../math'
import type { Entity, EntityInput } from '../document/types'
import { scaleEntity, translateEntity } from './edit'
import { rotateEntityInput } from './array'
import { mirrorAxis, mirrorEntityInput, type EntityTransform } from './transform'
import { transformEntity, type Rigid } from './rigid'

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

// --- ALIGN en 3D --------------------------------------------------------------------------------

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
const unit = (a: Vec3): Vec3 => {
  const l = norm(a)
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** ¿Los pares definen el ALIGN en el plano XY (direcciones sin componente Z)? Si no, va en 3D. */
export function alignIsPlanar(pairs: AlignPair[]): boolean {
  const [p1] = pairs
  if (!p1) return true
  const flat = (v: Vec3) => Math.abs(v[2]) <= 1e-9 * Math.max(1, norm(v))
  return pairs.slice(1).every((p) => flat(sub(p.src, p1.src)) && flat(sub(p.dst, p1.dst)))
}

/** Rotación (matriz por filas) que lleva la dirección unitaria `a` a `b` por el camino más corto. */
function rotationBetween(a: Vec3, b: Vec3): number[][] {
  const v = cross(a, b)
  const c = dot(a, b)
  if (norm(v) < 1e-12) {
    if (c > 0) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    // Opuestas: media vuelta alrededor de un eje perpendicular (el Z si se puede, así lo plano sigue plano).
    const k: Vec3 = Math.abs(a[2]) < 1e-9 ? [0, 0, 1] : unit(Math.abs(a[2]) < 0.9 ? cross(a, [0, 0, 1]) : cross(a, [1, 0, 0]))
    return [0, 1, 2].map((i) => [0, 1, 2].map((j) => 2 * k[i] * k[j] - (i === j ? 1 : 0)))
  }
  const K = [
    [0, -v[2], v[1]],
    [v[2], 0, -v[0]],
    [-v[1], v[0], 0],
  ]
  const K2 = [0, 1, 2].map((i) => [0, 1, 2].map((j) => K[i][0] * K[0][j] + K[i][1] * K[1][j] + K[i][2] * K[2][j]))
  const f = 1 / (1 + c)
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? 1 : 0) + K[i][j] + K2[i][j] * f))
}

/**
 * ALIGN en 3D, como el CAD clásico: 1 par traslada; 2 pares además giran (lo mínimo) para que la dirección origen
 * apunte como la destino, y escalan si se pide; 3 pares giran para que el plano de los tres puntos origen caiga en el
 * de los destino. null si los puntos origen o destino coinciden. Con direcciones verticales (`0,0,0 → 0,0,40`) el plan
 * de XY no servía y respondía «Alignment points coincide» aunque bastaba trasladar (B10).
 */
export function alignRigid(pairs: AlignPair[], scale = false): { rigid: Rigid; scale: number; center: Vec3 } | null {
  const [p1, p2, p3] = pairs
  if (!p1) return null
  let R: number[][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  let k = 1
  if (p2) {
    const vs = sub(p2.src, p1.src)
    const vd = sub(p2.dst, p1.dst)
    if (norm(vs) < 1e-9 || norm(vd) < 1e-9) return null
    R = rotationBetween(unit(vs), unit(vd))
    if (p3) {
      // Giro alrededor de la dirección destino que lleva el tercer punto al semiplano del tercer destino.
      const d = unit(vd)
      const ws = sub(p3.src, p1.src)
      const rs: Vec3 = [0, 1, 2].map((i) => R[i][0] * ws[0] + R[i][1] * ws[1] + R[i][2] * ws[2]) as Vec3
      const perp = (w: Vec3): Vec3 => sub(w, [d[0] * dot(w, d), d[1] * dot(w, d), d[2] * dot(w, d)])
      const a = perp(rs)
      const b = perp(sub(p3.dst, p1.dst))
      if (norm(a) > 1e-9 && norm(b) > 1e-9) R = mul(rotationBetweenAbout(unit(a), unit(b), d), R)
    } else if (scale) k = norm(vd) / norm(vs)
  }
  // p' = R·(p − src1) + dst1; `m` lleva por filas las imágenes de los ejes (las columnas de R).
  const m = [0, 1, 2].map((j) => [R[0][j], R[1][j], R[2][j]]) as [Vec3, Vec3, Vec3]
  const r1: Vec3 = [0, 1, 2].map((i) => R[i][0] * p1.src[0] + R[i][1] * p1.src[1] + R[i][2] * p1.src[2]) as Vec3
  return { rigid: { m, t: sub(p1.dst, r1) }, scale: k, center: p1.dst }
}

function mul(A: number[][], B: number[][]): number[][] {
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]))
}

/** Rotación alrededor del eje unitario `axis` que lleva `a` a `b` (ambos unitarios y perpendiculares al eje). */
function rotationBetweenAbout(a: Vec3, b: Vec3, axis: Vec3): number[][] {
  const ang = Math.atan2(dot(cross(a, b), axis), dot(a, b))
  const [c, s, t] = [Math.cos(ang), Math.sin(ang), 1 - Math.cos(ang)]
  const [x, y, z] = axis
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ]
}

/** Transformación de entidades del ALIGN en 3D (movimiento rígido y, con 2 pares, escala opcional). */
export function alignRigidTransform(plan: { rigid: Rigid; scale: number; center: Vec3 }): EntityTransform {
  return (e) => {
    const moved = transformEntity(e, plan.rigid)
    if (!moved || plan.scale === 1) return moved
    const w = { ...moved, id: e.id } as Entity
    scaleEntity(w, plan.center, plan.scale)
    return { ...moved, props: w.props } as EntityInput
  }
}
