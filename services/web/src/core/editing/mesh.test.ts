import { describe, expect, it } from 'vitest'
import { meshEdgeBox, meshEdges, meshWireframe } from './mesh'
import type { MeshProps } from '../document/types'
import type { Vec3 } from '../math'

/** Aristas únicas como se calculaban antes (por texto), para comparar. */
function wireframeByText(p: MeshProps): Vec3[][] {
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
      if (p.vertices[a] && p.vertices[b]) polys.push([p.vertices[a], p.vertices[b]])
    }
  }
  return polys
}

function randomMesh(seed: number, n: number): MeshProps {
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const vertices: Vec3[] = Array.from({ length: n }, () => [rnd() * 10, rnd() * 10, rnd() * 10])
  const faces = Array.from({ length: n * 2 }, () => Array.from({ length: rnd() < 0.3 ? 4 : 3 }, () => Math.floor(rnd() * n)))
  return { vertices, faces }
}

describe('aristas de una malla', () => {
  it('las mismas aristas, en el mismo orden y sentido, que deduplicando por texto', () => {
    for (let k = 1; k < 30; k++) {
      const m = randomMesh(k, 10 + k)
      if (k % 4 === 0) m.faces.push([1, 1, 2], [0, 9999, 3]) // arista nula y un índice sin vértice
      expect(meshWireframe(m)).toEqual(wireframeByText(m))
    }
  })

  it('índices no enteros: como antes, por texto', () => {
    const m: MeshProps = { vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faces: [[0, 1, 2], [2, 1, 0], [0.5, 1, 2]] }
    expect(meshWireframe(m)).toEqual(wireframeByText(m))
  })

  it('se calculan una vez por lista de caras (las copias de un bloque la comparten)', () => {
    const m = randomMesh(3, 20)
    const other: MeshProps = { vertices: m.vertices.map((v) => [v[0] + 5, v[1], v[2]] as Vec3), faces: m.faces }
    expect(meshEdges(other.faces)).toBe(meshEdges(m.faces))
    expect(meshWireframe(other)).toEqual(wireframeByText(other))
  })

  it('la caja de las aristas abarca lo mismo que su contorno', () => {
    const m = randomMesh(5, 25)
    m.vertices.push([100, 100, 100]) // suelto: no está en ninguna cara
    const pts = wireframeByText(m).flat()
    const b = meshEdgeBox(m)!
    expect(b).toEqual([0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i]))).concat([0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i])))))
    expect(meshEdgeBox(m)).toBe(b)
    expect(meshEdgeBox({ vertices: [[1, 1, 1]], faces: [] })).toBeNull()
  })
})
