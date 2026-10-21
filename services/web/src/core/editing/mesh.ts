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
 * Aristas únicas de la malla como polilíneas de 2 puntos (para snap, selección,
 * preview y proyección a PDF). Deduplica aristas compartidas entre caras.
 */
export function meshWireframe(p: MeshProps): Vec3[][] {
  const seen = new Set<string>()
  const polys: Vec3[][] = []
  for (const f of p.faces) {
    for (let i = 0; i < f.length; i++) {
      const a = f[i]
      const b = f[(i + 1) % f.length]
      if (a === b) continue
      const key = a < b ? `${a}_${b}` : `${b}_${a}`
      if (seen.has(key)) continue
      seen.add(key)
      const va = p.vertices[a]
      const vb = p.vertices[b]
      if (va && vb) polys.push([va, vb])
    }
  }
  return polys
}
