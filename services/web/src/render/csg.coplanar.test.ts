import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { solidGeometry } from './csg'
import type { SolidProps } from '../core/document/types'

function volume(g: THREE.BufferGeometry): number {
  const p = g.getAttribute('position')
  const idx = g.getIndex()
  const n = (idx ? idx.count : p.count) / 3
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  let v = 0
  for (let t = 0; t < n; t++) {
    const at = (k: number) => (idx ? idx.getX(3 * t + k) : 3 * t + k)
    a.fromBufferAttribute(p, at(0))
    b.fromBufferAttribute(p, at(1))
    c.fromBufferAttribute(p, at(2))
    v += a.dot(b.cross(c)) / 6
  }
  return v
}

const plate: SolidProps = { op: 'BOX', origin: [-70, -55, 0], width: 300, depth: 110, height: 12 }
const cyl = (x: number, y: number, z0 = 0, h = 12, r = 6): SolidProps => ({ op: 'CYLINDER', base: [x, y, z0], radius: r, height: h, segments: 48, axis: [0, 0, 1] })

describe('booleanas con caras coplanares', () => {
  it('agujeros de la altura justa de la placa: rápido, exacto y con los vértices en sus caras', () => {
    const t = performance.now()
    const g = solidGeometry({ op: 'SUBTRACT', operands: [plate, cyl(-55, -40), cyl(215, -40), cyl(215, 40), cyl(-55, 40)] })
    expect(performance.now() - t).toBeLessThan(2000) // antes ~6,6 s y 72 000 vértices
    expect(g.getAttribute('position').count).toBeLessThan(15_000)
    expect(volume(g)).toBeCloseTo(300 * 110 * 12 - 4 * volume(solidGeometry(cyl(0, 0))), 1)
    const p = g.getAttribute('position')
    for (let i = 0; i < p.count; i++) expect(Math.min(Math.abs(p.getZ(i)), Math.abs(p.getZ(i) - 12))).toBeLessThan(1e-6)
  })

  it('una pieza apoyada sobre otra se une sin escalón; un bolsillo con la tapa al ras queda exacto', () => {
    const support: SolidProps = { op: 'BOX', origin: [-20, 24, 12], width: 40, depth: 14, height: 58 }
    expect(volume(solidGeometry({ op: 'UNION', operands: [plate, support] }))).toBeCloseTo(300 * 110 * 12 + 40 * 14 * 58, 1)
    const pocket = cyl(0, 0, 6, 6, 20)
    expect(volume(solidGeometry({ op: 'SUBTRACT', operands: [plate, pocket] }))).toBeCloseTo(300 * 110 * 12 - volume(solidGeometry(pocket)), 1)
  })
})

describe('operandos con triángulos aguja', () => {
  it('un cigüeñal real (brazos, muñón, volante con alivianados y chaflán) se une sin perder operandos', async () => {
    const props = (await import('./__fixtures__/crankshaft.json')).default as SolidProps
    const warn = console.warn
    const warnings: unknown[] = []
    console.warn = (...a: unknown[]) => void warnings.push(a[0])
    try {
      const t = performance.now()
      const g = solidGeometry(props)
      expect(warnings).toEqual([]) // antes: "boolean operation failed; one operand is skipped" (null.dot en el raycast)
      expect(g.getAttribute('position').count / 3).toBeGreaterThan(7000)
      expect(performance.now() - t).toBeLessThan(20_000)
    } finally {
      console.warn = warn
    }
  }, 30_000)
})
