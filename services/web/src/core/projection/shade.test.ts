import { describe, expect, it } from 'vitest'
import '../../render/csg'
import { solidMesh } from '../../render/csg'
import type { SolidProps } from '../document/types'
import { viewBasis } from '../drawing/views'
import { mapShade, shadeViewTriangles } from './shade'

describe('vistas sombreadas', () => {
  const box: SolidProps = { op: 'BOX', origin: [0, 0, 0], width: 20, depth: 10, height: 5 }
  it('en isométrica se ven tres caras (6 triángulos), cada una con su tono', () => {
    const s = shadeViewTriangles([solidMesh(box)], ['#ff0000'], viewBasis('ISO'))
    expect(s.tris.length / 9).toBe(6)
    const tones = new Set<string>()
    for (let i = 0; i < s.colors.length; i += 3) tones.add(s.colors[i].toFixed(3))
    expect(tones.size).toBe(3) // tres caras, tres tonos de rojo
    for (let i = 1; i < s.colors.length; i += 3) expect(s.colors[i]).toBe(0) // sigue siendo rojo
  })
  it('de frente, una sola cara; los vértices quedan en el plano de la vista', () => {
    const s = shadeViewTriangles([solidMesh(box)], ['#ffffff'], viewBasis('FRONT'))
    expect(s.tris.length / 9).toBe(2)
    for (let i = 2; i < s.tris.length; i += 3) expect(s.tris[i]).toBeLessThan(0) // debajo del papel (profundidad)
    const moved = mapShade(s, (v) => [v[0] + 1, v[1], v[2]])
    expect(moved.tris[0]).toBeCloseTo(s.tris[0] + 1, 12)
  })
})
