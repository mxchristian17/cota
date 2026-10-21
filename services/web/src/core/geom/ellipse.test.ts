import { describe, it, expect } from 'vitest'
import { ellipseMinorVec, ellipsePoints, ellipseQuadrants } from './ellipse'
import type { EllipseProps } from '../document/types'

// Elipse en XY: semieje mayor 10 en X, ratio 0.5 → semieje menor 5 en Y.
const E: EllipseProps = { center: [0, 0, 0], major: [10, 0, 0], ratio: 0.5, normal: [0, 0, 1] }

describe('ellipse geom', () => {
  it('el semieje menor es perpendicular al mayor con longitud |major|·ratio', () => {
    const m = ellipseMinorVec(E)
    expect(Math.hypot(m[0], m[1], m[2])).toBeCloseTo(5, 6)
    // perpendicular a major (producto punto ≈ 0)
    expect(m[0] * E.major[0] + m[1] * E.major[1] + m[2] * E.major[2]).toBeCloseTo(0, 6)
  })

  it('cuadrantes: ±major y ±menor', () => {
    const q = ellipseQuadrants(E)
    expect(q[0]).toEqual([10, 0, 0])
    expect(q[1]).toEqual([-10, 0, 0])
    expect(q[2][1]).toBeCloseTo(5, 6)
    expect(q[3][1]).toBeCloseTo(-5, 6)
  })

  it('los puntos caen sobre la elipse (x/a)²+(y/b)²=1', () => {
    for (const [x, y] of ellipsePoints(E, 16, false)) {
      expect((x / 10) ** 2 + (y / 5) ** 2).toBeCloseTo(1, 6)
    }
  })

  it('close repite el primer punto', () => {
    const open = ellipsePoints(E, 8, false)
    const closed = ellipsePoints(E, 8, true)
    expect(closed.length).toBe(open.length + 1)
    expect(closed[closed.length - 1]).toEqual(closed[0])
  })
})
