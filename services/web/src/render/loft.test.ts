import { describe, expect, it } from 'vitest'
import { solidMesh } from './csg'
import type { SolidProps } from '../core/document/types'

/** Volumen con signo de una malla cerrada (positivo = caras hacia afuera). */
function signedVolume(m: { vertices: number[][]; faces: number[][] }): number {
  let v = 0
  for (const f of m.faces) {
    for (let i = 1; i + 1 < f.length; i++) {
      const [a, b, c] = [m.vertices[f[0]], m.vertices[f[i]], m.vertices[f[i + 1]]]
      v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
    }
  }
  return v
}

describe('LOFT (EXTRUDE con Taper)', () => {
  it('las caras miran hacia afuera con el perfil en cualquier sentido', () => {
    const ccw = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]]
    for (const ring of [ccw, [...ccw].reverse()]) {
      const top = ring.map(([x, y]) => [x * 0.8 + 1, y * 0.8 + 1, 5])
      const m = solidMesh({ op: 'LOFT', sections: [ring, top] } as unknown as SolidProps) as unknown as { vertices: number[][]; faces: number[][] }
      expect(signedVolume(m)).toBeCloseTo(193.333, 2) // tronco de pirámide: h/3·(A1 + A2 + √(A1·A2))
    }
  })
})
