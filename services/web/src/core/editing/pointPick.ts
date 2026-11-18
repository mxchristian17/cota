import type { BlockDef, Entity, MeshProps } from '../document/types'
import { expandEntities } from './block'
import type { Vec3 } from '../math'
import { curveOf } from '../geom/curve'
import { entityBounds, type Bounds } from './bounds'

/** Malla de triángulos de un sólido o de una malla (la da la app: `AppHooks.solidMesh`); el core no arma mallas. */
export type MeshOf = (e: Entity) => MeshProps | null | undefined

/**
 * Objeto por el que pasa un punto TECLEADO (como el CAD clásico: en "Select object…" una coordenada sobre la curva
 * la elige). Sólo curvas y puntos, a menos de `tol`; el más cercano gana. Así los multicomandos y el agente eligen
 * objetos sin clic.
 */
export function entityAtPoint(entities: Entity[], p: Vec3, tol = 1e-3, blocks?: BlockDef[]): string | null {
  let best: string | null = null
  let bd = tol * Math.max(1, Math.hypot(p[0], p[1], p[2]) * 1e-3)
  const distTo = (e: Entity): number => {
    if (e.type === 'POINT') return Math.hypot(e.props.position[0] - p[0], e.props.position[1] - p[1], e.props.position[2] - p[2])
    const c = curveOf(e)
    if (!c) return Infinity
    const q = c.pointAt(c.paramAt(p))
    return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])
  }
  for (const e of entities) {
    // Una inserción (bloque, rótulo, vista de dibujo) se elige por las curvas de su geometría de mundo.
    const d = e.type === 'INSERT' && blocks ? Math.min(Infinity, ...expandEntities([e], blocks).map(distTo)) : distTo(e)
    if (d <= bd) {
      best = e.id
      bd = d
    }
  }
  return best
}

/** Caja de una entidad en planta; la de una inserción, la de su geometría de mundo (con `blocks`). */
function planBounds(e: Entity, blocks?: BlockDef[]): Bounds {
  if (e.type !== 'INSERT' || !blocks) return entityBounds(e)
  const out = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const part of expandEntities([e], blocks)) {
    const b = entityBounds(part)
    out.minX = Math.min(out.minX, b.minX)
    out.minY = Math.min(out.minY, b.minY)
    out.maxX = Math.max(out.maxX, b.maxX)
    out.maxY = Math.max(out.maxY, b.maxY)
  }
  return out
}

/**
 * Objeto elegido con un punto TECLEADO en "Select objects:": el que pasa por el punto (curvas y puntos); si no hay,
 * el sólido o la malla que está EN el punto, en 3D (`meshOf`, ver `bodyAtPoint`); si tampoco, el de caja más chica
 * (en planta) que lo contiene (textos, cotas, sombreados, regiones, inserciones; sin `meshOf`, también sólidos y
 * mallas). Con `blocks`, las inserciones cuentan por su geometría (sin ellos no tenían ni curvas ni caja).
 */
export function selectAtPoint(entities: Entity[], p: Vec3, meshOf?: MeshOf, blocks?: BlockDef[]): string | null {
  const on = entityAtPoint(entities, p, undefined, blocks)
  if (on) return on
  const body = meshOf ? bodyAtPoint(entities, p, meshOf) : null
  if (body) return body
  let best: string | null = null
  let ba = Infinity
  for (const e of entities) {
    if (curveOf(e) || e.type === 'POINT') continue
    if (meshOf && (e.type === 'SOLID3D' || e.type === 'MESH3D')) continue // ya se miraron en 3D
    const b = planBounds(e, blocks)
    if (p[0] < b.minX - 1e-9 || p[0] > b.maxX + 1e-9 || p[1] < b.minY - 1e-9 || p[1] > b.maxY + 1e-9) continue
    const a = (b.maxX - b.minX) * (b.maxY - b.minY)
    if (a < ba) {
      best = e.id
      ba = a
    }
  }
  return best
}

/** Holgura de un cuerpo, relativa a su tamaño: cubre el facetado de las caras curvas (un punto de la superficie real). */
const BODY_TOL = 0.005

/**
 * Sólido o malla que está EN el punto tecleado, en 3D: el de superficie más cercana (a menos de la holgura) o, en un
 * sólido, el que lo contiene; con empate (caras compartidas, sólidos que se interfieren), el de caja más chica. Un
 * punto con coordenadas 3D no se proyecta a la pantalla: lo que tape la vista no cuenta (el clic sí elige lo visible).
 */
export function bodyAtPoint(entities: Entity[], p: Vec3, meshOf: MeshOf): string | null {
  let best: string | null = null
  let bd = Infinity
  let bv = Infinity
  const abs = 1e-3 * Math.max(1, Math.hypot(p[0], p[1], p[2]) * 1e-3)
  for (const e of entities) {
    if (e.type !== 'SOLID3D' && e.type !== 'MESH3D') continue
    const m = meshOf(e)
    if (!m || m.vertices.length === 0 || m.faces.length === 0) continue
    const lo: Vec3 = [Infinity, Infinity, Infinity]
    const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
    for (const v of m.vertices)
      for (let k = 0; k < 3; k++) {
        if (v[k] < lo[k]) lo[k] = v[k]
        if (v[k] > hi[k]) hi[k] = v[k]
      }
    const tol = Math.max(abs, BODY_TOL * Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]))
    if ([0, 1, 2].some((k) => p[k] < lo[k] - tol || p[k] > hi[k] + tol)) continue
    let d = meshDistance(m, p)
    if (d > tol && e.type === 'SOLID3D' && insideMesh(m, p)) d = 0
    if (d > tol) continue
    const vol = (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2])
    if (d < bd - 1e-9 || (d <= bd + 1e-9 && vol < bv)) {
      best = e.id
      bd = d
      bv = vol
    }
  }
  return best
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** Triángulos de una malla (las caras de más de tres vértices, en abanico). */
function forTriangles(m: MeshProps, fn: (a: Vec3, b: Vec3, c: Vec3) => void): void {
  for (const f of m.faces) for (let i = 1; i + 1 < f.length; i++) fn(m.vertices[f[0]], m.vertices[f[i]], m.vertices[f[i + 1]])
}

/** Distancia mínima de `p` a la superficie de la malla. */
function meshDistance(m: MeshProps, p: Vec3): number {
  let best = Infinity
  forTriangles(m, (a, b, c) => {
    best = Math.min(best, triangleDistance(p, a, b, c))
  })
  return best
}

/** Distancia de `p` al triángulo abc (punto más cercano, Ericson, «Real-Time Collision Detection» §5.1.5). */
function triangleDistance(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const ab = sub(b, a)
  const ac = sub(c, a)
  const ap = sub(p, a)
  const at = (u: number, v: number): number => {
    const q: Vec3 = [a[0] + ab[0] * u + ac[0] * v, a[1] + ab[1] * u + ac[1] * v, a[2] + ab[2] * u + ac[2] * v]
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
  }
  const d1 = dot(ab, ap)
  const d2 = dot(ac, ap)
  if (d1 <= 0 && d2 <= 0) return at(0, 0)
  const bp = sub(p, b)
  const d3 = dot(ab, bp)
  const d4 = dot(ac, bp)
  if (d3 >= 0 && d4 <= d3) return at(1, 0)
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(d1 / (d1 - d3), 0)
  const cp = sub(p, c)
  const d5 = dot(ab, cp)
  const d6 = dot(ac, cp)
  if (d6 >= 0 && d5 <= d6) return at(0, 1)
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(0, d2 / (d2 - d6))
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6))
    return at(1 - w, w)
  }
  const den = 1 / (va + vb + vc)
  return at(vb * den, vc * den)
}

/** Direcciones de los rayos de `insideMesh`: oblicuas, para no rozar aristas ni caras alineadas a los ejes. */
const RAYS: Vec3[] = [
  [0.5773, 0.5779, 0.5769],
  [-0.6234, 0.4471, 0.6414],
  [0.3127, -0.7581, 0.5723],
]

/** ¿`p` está dentro de la malla cerrada? Paridad de cruces de tres rayos (vota la mayoría, por si uno roza un borde). */
function insideMesh(m: MeshProps, p: Vec3): boolean {
  let votes = 0
  for (const d of RAYS) {
    let n = 0
    forTriangles(m, (a, b, c) => {
      if (rayHits(p, d, a, b, c)) n++
    })
    if (n % 2 === 1) votes++
  }
  return votes >= 2
}

/** ¿El rayo (o, d) corta al triángulo abc hacia adelante? (Möller–Trumbore.) */
function rayHits(o: Vec3, d: Vec3, a: Vec3, b: Vec3, c: Vec3): boolean {
  const e1 = sub(b, a)
  const e2 = sub(c, a)
  const pv = cross(d, e2)
  const det = dot(e1, pv)
  if (Math.abs(det) < 1e-12) return false
  const inv = 1 / det
  const tv = sub(o, a)
  const u = dot(tv, pv) * inv
  if (u < 0 || u > 1) return false
  const qv = cross(tv, e1)
  const v = dot(d, qv) * inv
  if (v < 0 || u + v > 1) return false
  return dot(e2, qv) * inv > 0
}
