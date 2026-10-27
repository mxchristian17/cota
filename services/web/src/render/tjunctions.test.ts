import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { closeTJunctions } from './tjunctions'
import { solidGeometry } from './csg'

/** Aristas abiertas (usadas por un solo triángulo) y repetidas (por más de dos). */
function openEdges(g: THREE.BufferGeometry): { open: number; over: number } {
  const p = g.getAttribute('position')
  const idx = g.getIndex()
  const n = (idx ? idx.count : p.count) / 3
  const key = (i: number) => [p.getX(i), p.getY(i), p.getZ(i)].map((v) => Math.round(v * 1e4)).join(',')
  const edges = new Map<string, number>()
  for (let t = 0; t < n; t++)
    for (let k = 0; k < 3; k++) {
      const at = (j: number) => (idx ? idx.getX(3 * t + j) : 3 * t + j)
      const [a, b] = [key(at(k)), key(at((k + 1) % 3))]
      const e = a < b ? `${a}|${b}` : `${b}|${a}`
      edges.set(e, (edges.get(e) ?? 0) + 1)
    }
  let open = 0
  let over = 0
  for (const c of edges.values()) if (c === 1) open++
    else if (c > 2) over++
  return { open, over }
}

describe('closeTJunctions', () => {
  it('inserta el vértice en T en el triángulo vecino', () => {
    // Un triángulo grande (0,0)-(2,0)-(1,1) por arriba de la arista y dos chicos por abajo con un vértice en (1,0).
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0, 1, 1, 0, 0, 0, 0, 1, -1, 0, 1, 0, 0, 1, 0, 0, 1, -1, 0, 2, 0, 0], 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(27).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3))
    const before = openEdges(g)
    const out = closeTJunctions(g)
    expect(before.open).toBeGreaterThan(0)
    expect(out.getAttribute('position').count / 3).toBe(4)
    const p = out.getAttribute('position')
    const cut = Array.from({ length: p.count }, (_, i) => [p.getX(i), p.getY(i)]).filter(([x, y]) => x === 1 && y === 0).length
    expect(cut).toBeGreaterThanOrEqual(4) // el (1,0) quedó en los dos triángulos de arriba y en los dos de abajo
    expect(out.getAttribute('normal').getZ(0)).toBe(1)
  })

  it('la placa con agujeros de la CSG queda casi cerrada (antes: miles de aristas abiertas)', () => {
    const cyl = (x: number, y: number) => ({ op: 'CYLINDER' as const, base: [x, y, 0] as [number, number, number], radius: 6, height: 12, segments: 48, axis: [0, 0, 1] as [number, number, number] })
    const g = solidGeometry({ op: 'SUBTRACT', operands: [{ op: 'BOX', origin: [-70, -55, 0], width: 300, depth: 110, height: 12 }, cyl(-55, -40), cyl(215, -40), cyl(215, 40), cyl(-55, 40)] })
    const { open, over } = openEdges(g)
    expect(open).toBeLessThan(40)
    expect(over).toBeLessThan(10)
  })
})
