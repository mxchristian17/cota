import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import { solidGeometry } from '../../../render/csg'
import type { SolidProps } from '../../document/types'

const volume = (p: SolidProps): number => {
  const pos = solidGeometry(p).getAttribute('position')
  let v = 0
  for (let k = 0; k + 2 < pos.count; k += 3) {
    const [a, b, c] = [k, k + 1, k + 2].map((i) => [pos.getX(i), pos.getY(i), pos.getZ(i)])
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
  }
  return v
}

describe('SLICE', () => {
  const box = { op: 'BOX', origin: [0, 0, 0], width: 10, depth: 10, height: 10 }

  it('dos puntos (plano perpendicular al XY) y un lado: queda la parte elegida', async () => {
    const h = makeEngine()
    const b = h.add('SOLID3D', box)
    h.setSelection([b.id])
    await h.run('SLICE', '3,0,0', '#3,10,0', '8,5,5')
    const solids = h.ofType('SOLID3D')
    expect(solids).toHaveLength(1)
    expect(volume(solids[0].props as SolidProps)).toBeCloseTo(700, 3)
  })

  it('XY por un punto y ambos lados: dos sólidos que suman el original', async () => {
    const h = makeEngine()
    const b = h.add('SOLID3D', box)
    h.setSelection([b.id])
    await h.run('SLICE', 'XY', '0,0,4', '')
    const v = h.ofType('SOLID3D').map((e) => volume(e.props as SolidProps)).sort((x, y) => x - y)
    expect(v[0]).toBeCloseTo(400, 3)
    expect(v[1]).toBeCloseTo(600, 3)
  })
})
