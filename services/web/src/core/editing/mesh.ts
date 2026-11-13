import type { Vec3 } from '../math'
import type { MeshProps } from '../document/types'

/** Traslada (in-place) todos los vértices de la malla en 3D. */
export function translateMesh(p: MeshProps, dx: number, dy: number, dz = 0): void {
  p.vertices = p.vertices.map((v) => [v[0] + dx, v[1] + dy, v[2] + dz] as Vec3)
}

/** Vértices de la malla (para snap/selección). */
export function meshVertices(p: MeshProps): Vec3[] {
  return p.vertices
}

/**
 * Las ediciones reemplazan las listas de vértices de las mallas, así que lo calculado por lista vale mientras la lista
 * sea la misma. La única excepción es la limpieza del ruido numérico (`cleanNumbers`), que las corrige en el lugar:
 * avisa con `meshVerticesCleaned` y lo recordado por lista se descarta (una vez por dibujo abierto).
 */
let cleanedRev = 0
export const meshVerticesRev = (): number => cleanedRev
export function meshVerticesCleaned(): void {
  cleanedRev++
}

/** Aristas de cada lista de caras: las caras no se modifican en el lugar (ver `cloneDocument`), así que se calculan una vez. */
const edgesOf = new WeakMap<number[][], ArrayLike<number>>()

/**
 * Aristas únicas de una lista de caras, como pares de índices seguidos (a0, b0, a1, b1…) en el orden y el sentido en que
 * aparecen por primera vez. Las copias de un bloque comparten sus caras: un ensamble con cientos de mallas no vuelve a
 * recorrerlas en cada snap, ventana o redibujo.
 */
export function meshEdges(faces: number[][]): ArrayLike<number> {
  let out = edgesOf.get(faces)
  if (out) return out
  // Índices enteros (lo normal): la clave de la arista es un número; si no, texto (como siempre).
  let max = 0
  let ints = true
  for (const f of faces)
    for (const i of f) {
      if (Number.isInteger(i) && i >= 0) max = Math.max(max, i)
      else ints = false
    }
  const span = max + 1
  ints &&= span * span < Number.MAX_SAFE_INTEGER
  const seen = new Set<number | string>()
  const pairs: number[] = []
  for (const f of faces) {
    for (let i = 0; i < f.length; i++) {
      const a = f[i]
      const b = f[(i + 1) % f.length]
      if (a === b) continue
      const key = ints ? (a < b ? a * span + b : b * span + a) : a < b ? `${a}_${b}` : `${b}_${a}`
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push(a, b)
    }
  }
  out = ints && max < 2 ** 32 ? Uint32Array.from(pairs) : pairs
  edgesOf.set(faces, out)
  return out
}

/**
 * Aristas únicas de la malla como polilíneas de 2 puntos (para snap, selección,
 * preview y proyección a PDF). Deduplica aristas compartidas entre caras.
 */
export function meshWireframe(p: MeshProps): Vec3[][] {
  const pairs = meshEdges(p.faces)
  const polys: Vec3[][] = []
  for (let k = 0; k < pairs.length; k += 2) {
    const va = p.vertices[pairs[k]]
    const vb = p.vertices[pairs[k + 1]]
    if (va && vb) polys.push([va, vb])
  }
  return polys
}

/** Caja de las aristas de una malla (lo que abarca `meshWireframe`), por su lista de vértices; null si no tiene. */
const boxOf = new WeakMap<Vec3[], { faces: number[][]; rev: number; box: [number, number, number, number, number, number] | null }>()
export function meshEdgeBox(p: MeshProps): [number, number, number, number, number, number] | null {
  const hit = boxOf.get(p.vertices)
  if (hit && hit.faces === p.faces && hit.rev === cleanedRev) return hit.box
  const pairs = meshEdges(p.faces)
  let [x0, y0, z0, x1, y1, z1] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
  // Cada vértice de una arista una vez (los comparten varias).
  const seen = new Uint8Array(p.vertices.length)
  for (let k = 0; k < pairs.length; k += 2) {
    const [a, b] = [pairs[k], pairs[k + 1]]
    if (!p.vertices[a] || !p.vertices[b]) continue
    for (let j = 0; j < 2; j++) {
      const i = j ? b : a
      if (seen[i]) continue
      seen[i] = 1
      const v = p.vertices[i]
      x0 = Math.min(x0, v[0]); y0 = Math.min(y0, v[1]); z0 = Math.min(z0, v[2])
      x1 = Math.max(x1, v[0]); y1 = Math.max(y1, v[1]); z1 = Math.max(z1, v[2])
    }
  }
  const box: [number, number, number, number, number, number] | null = isFinite(x0) ? [x0, y0, z0, x1, y1, z1] : null
  boxOf.set(p.vertices, { faces: p.faces, rev: cleanedRev, box })
  return box
}
