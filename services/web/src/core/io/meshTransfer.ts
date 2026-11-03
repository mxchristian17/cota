import type { Vec3 } from '../math'
import type { MeshProps } from '../document/types'
import type { DxfEntitySpec, DxfImportResult } from './dxf'

/**
 * Malla lista para cruzar de hilo sin copiarse: las coordenadas seguidas y las caras como (cantidad de vértices,
 * índices…). Un ensamble 3D trae millones de vértices y caras: como listas sueltas el hilo principal recibía una copia
 * de cientos de MB mientras el lector todavía tenía la suya, y el teléfono se quedaba sin memoria.
 */
export interface PackedMesh {
  packed: { pos: Float64Array; faces: Uint32Array }
}

/** ¿Propiedades de una malla empaquetada? */
export const packedOf = (props: unknown): PackedMesh['packed'] | undefined => (props as Partial<PackedMesh> | null)?.packed

/** Caras como (cantidad de vértices, índices…). */
const packFaces = (faces: ArrayLike<ArrayLike<number>>): Uint32Array => {
  let size = 0
  for (let i = 0; i < faces.length; i++) size += faces[i].length + 1
  const out = new Uint32Array(size)
  let w = 0
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i]
    out[w++] = f.length
    for (let j = 0; j < f.length; j++) out[w++] = f[j]
  }
  return out
}

/** Una malla empaquetada (la de cada sólido leído, apenas se arma: así ocupa la cuarta parte mientras se lee el resto). */
export function packMesh(m: { vertices: ArrayLike<ArrayLike<number>>; faces: ArrayLike<ArrayLike<number>> }): PackedMesh {
  const pos = new Float64Array(m.vertices.length * 3)
  for (let i = 0; i < m.vertices.length; i++) pos.set(m.vertices[i], i * 3)
  return { packed: { pos, faces: packFaces(m.faces) } }
}

const specsOf = (r: DxfImportResult): DxfEntitySpec[][] => [r.entities, ...(r.layouts ?? []).map((l) => l.entities)]

/** Empaqueta (en el lugar) las mallas del resultado y devuelve los buffers a transferir. */
export function packMeshes(r: DxfImportResult): ArrayBuffer[] {
  // Las copias de un mismo bloque comparten sus caras: se empaquetan una vez.
  const facesOf = new Map<unknown, Uint32Array>()
  const transfer = new Set<ArrayBuffer>()
  for (const list of specsOf(r))
    for (const e of list) {
      if (e.type !== 'MESH3D') continue
      const ready = packedOf(e.props)
      if (ready) {
        transfer.add(ready.pos.buffer as ArrayBuffer)
        transfer.add(ready.faces.buffer as ArrayBuffer)
        continue
      }
      const m = e.props as MeshProps
      const pos = packMesh({ vertices: m.vertices, faces: [] }).packed.pos
      let faces = facesOf.get(m.faces)
      if (!faces) {
        faces = packFaces(m.faces)
        facesOf.set(m.faces, faces)
      }
      e.props = { packed: { pos, faces } } as unknown as DxfEntitySpec['props']
      transfer.add(pos.buffer as ArrayBuffer)
      transfer.add(faces.buffer as ArrayBuffer)
    }
  return [...transfer]
}

/** Vuelve a armar (en el lugar) las mallas empaquetadas; las caras compartidas siguen compartidas. */
export function unpackMeshes(r: DxfImportResult): void {
  const facesOf = new Map<Uint32Array, number[][]>()
  for (const list of specsOf(r))
    for (const e of list) {
      const p = packedOf(e.props)
      if (e.type !== 'MESH3D' || !p) continue
      const vertices: Vec3[] = new Array(p.pos.length / 3)
      for (let i = 0; i < vertices.length; i++) vertices[i] = [p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]]
      let faces = facesOf.get(p.faces)
      if (!faces) {
        faces = []
        for (let w = 0; w < p.faces.length; ) {
          const n = p.faces[w++]
          faces.push(Array.from(p.faces.subarray(w, w + n)))
          w += n
        }
        facesOf.set(p.faces, faces)
      }
      e.props = { vertices, faces } as MeshProps
    }
}
