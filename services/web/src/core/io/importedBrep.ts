import type { Vec3 } from '../math'
import type { BrepModel } from '../document/types'
import { brepRef } from '../document/brepStore'
import { cleanNumber } from '../geom/clean'
import { acisMesh, type AcisMesh } from './acisMesh'

/**
 * Lo que se dibuja de un sólido importado mientras no lo calcula el núcleo exacto: su malla y sus aristas, sin la
 * matriz de la hoja. Se arma en el hilo de lectura junto con el resto del archivo y viaja como buffers transferidos.
 */
export interface BrepDisplay {
  /** Vértices seguidos (x, y, z). */
  pos: Float64Array
  /** Triángulos (tres índices cada uno), mirando hacia afuera. */
  tri: Uint32Array
  /** Cara del modelo de cada triángulo: las aristas y las vistas separan las caras del B-rep. */
  faceOf: Uint32Array
  /** Aristas del modelo: cantidad de puntos de cada polilínea y sus puntos seguidos. */
  wireCounts: Uint32Array
  wirePts: Float64Array
}

/** Un modelo leído del archivo: sus bytes (sin comprimir), su caja y lo que se dibuja. */
export interface ImportedBrep {
  fmt: BrepModel['fmt']
  bytes: Uint8Array
  box: [Vec3, Vec3]
  display: BrepDisplay
}

/** Sólidos ACIS de un archivo: el `ref` de cada uno (por posición) y los modelos, una vez por `ref`. */
export interface ImportedSolids {
  refs: string[]
  breps: Record<string, ImportedBrep>
}

const SAB_SIGNATURES = ['ACIS BinaryFile', 'ASM BinaryFile']

/** SAB (binario) o SAT (texto). */
export function acisFormat(bytes: Uint8Array): 'sab' | 'sat' {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 15))
  return SAB_SIGNATURES.some((s) => head.startsWith(s)) ? 'sab' : 'sat'
}

/**
 * Caja de un modelo ACIS: la de sus aristas, más lo que las caras se abomban cerca de ellas (una cúpula sobre su
 * borde). De la malla se toma sólo lo que queda a menos de un cuarto de la diagonal de las aristas: en algunos modelos
 * la malla se sale de la pieza. Sin aristas (una esfera entera), la caja de la malla.
 */
export function boxOf(edges: Vec3[][], verts: ArrayLike<Vec3> | Float64Array): [Vec3, Vec3] | null {
  let [x0, y0, z0, x1, y1, z1] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
  for (const pl of edges)
    for (const v of pl) {
      if (v[0] < x0) x0 = v[0]
      if (v[0] > x1) x1 = v[0]
      if (v[1] < y0) y0 = v[1]
      if (v[1] > y1) y1 = v[1]
      if (v[2] < z0) z0 = v[2]
      if (v[2] > z1) z1 = v[2]
    }
  const packed = verts instanceof Float64Array
  const n = packed ? verts.length / 3 : verts.length
  const hasEdges = Number.isFinite(x0)
  const margin = hasEdges ? Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 4 : Infinity
  const [ex0, ey0, ez0, ex1, ey1, ez1] = [x0 - margin, y0 - margin, z0 - margin, x1 + margin, y1 + margin, z1 + margin]
  for (let k = 0; k < n; k++) {
    let x: number, y: number, z: number
    if (packed) [x, y, z] = [verts[k * 3], verts[k * 3 + 1], verts[k * 3 + 2]]
    else [x, y, z] = verts[k]
    if (hasEdges && !(x >= ex0 && x <= ex1 && y >= ey0 && y <= ey1 && z >= ez0 && z <= ez1)) continue
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
    if (z < z0) z0 = z
    if (z > z1) z1 = z
  }
  // Sin el ruido de punto flotante (ver `transformBrep`).
  return Number.isFinite(x0) ? [[x0, y0, z0].map(cleanNumber) as Vec3, [x1, y1, z1].map(cleanNumber) as Vec3] : null
}

/** Malla y aristas ya empaquetadas. */
export function packDisplay(mesh: Pick<AcisMesh, 'vertices' | 'faces' | 'faceOf'>, edges: Vec3[][]): BrepDisplay {
  const pos = new Float64Array(mesh.vertices.length * 3)
  for (let i = 0; i < mesh.vertices.length; i++) pos.set(mesh.vertices[i], i * 3)
  let nt = 0
  for (const f of mesh.faces) nt += Math.max(0, f.length - 2)
  const tri = new Uint32Array(nt * 3)
  const faceOf = new Uint32Array(nt)
  let w = 0
  mesh.faces.forEach((f, k) => {
    for (let i = 1; i + 1 < f.length; i++) {
      faceOf[w / 3] = mesh.faceOf[k] ?? 0
      tri[w++] = f[0]
      tri[w++] = f[i]
      tri[w++] = f[i + 1]
    }
  })
  const wireCounts = new Uint32Array(edges.length)
  let np = 0
  edges.forEach((pl, i) => {
    wireCounts[i] = pl.length
    np += pl.length
  })
  const wirePts = new Float64Array(np * 3)
  let o = 0
  for (const pl of edges) for (const v of pl) wirePts.set(v, o++ * 3)
  return { pos, tri, faceOf, wireCounts, wirePts }
}

/** Polilíneas de las aristas de lo que se dibuja. */
export function displayWire(d: BrepDisplay): Vec3[][] {
  const out: Vec3[][] = []
  let o = 0
  for (const n of d.wireCounts) {
    const pl: Vec3[] = []
    for (let i = 0; i < n; i++, o++) pl.push([d.wirePts[o * 3], d.wirePts[o * 3 + 1], d.wirePts[o * 3 + 2]])
    out.push(pl)
  }
  return out
}

/** Buffers de lo que se dibuja (para transferirlos de hilo sin copiarlos). */
export const displayBuffers = (d: BrepDisplay): ArrayBuffer[] => [d.pos, d.tri, d.faceOf, d.wireCounts, d.wirePts].map((a) => a.buffer as ArrayBuffer)

/**
 * Lo que se dibuja de un modelo ACIS y su caja; null si no tiene caras legibles (sin caras, el sólido entra como sus
 * aristas, como antes). `light`: malla con menos triángulos (teléfonos).
 */
export function acisDisplay(bytes: Uint8Array, light = false): { display: BrepDisplay; box: [Vec3, Vec3] } | null {
  const mesh = acisMesh(bytes, light, true)
  if (!mesh) return null
  const edges = mesh.edges ?? []
  const display = packDisplay(mesh, edges)
  const box = boxOf(edges, display.pos)
  return box ? { display, box } : null
}

/**
 * Un modelo ACIS del archivo como sólido importado: su `ref` y lo que viaja con él. Los bytes se copian (los del lector
 * suelen ser una vista sobre el archivo entero, que no se puede transferir por partes). `known`: los ya leídos de este
 * archivo, por `ref` (el mismo modelo dos veces se arma una sola).
 */
export function importedBrep(data: Uint8Array | string, light = false, known?: Record<string, ImportedBrep>): { ref: string; brep: ImportedBrep } | null {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data.slice()
  const fmt = acisFormat(bytes)
  const ref = brepRef(bytes, fmt)
  const seen = known?.[ref]
  if (seen) return { ref, brep: seen }
  const d = acisDisplay(bytes, light)
  if (!d) return null
  return { ref, brep: { fmt, bytes, box: d.box, display: d.display } }
}
