import { describe, it, expect } from 'vitest'
import { dimDisplay, measureDim, DEFAULT_DIM_STYLE } from './dimGeometry'
import { setJog, spaceDimensions } from './edit'
import { dimBreakPoints } from './breaks'
import type { DimensionProps, Entity } from '../document/types'
import type { Vec3 } from '../math'

/** Cota vertical en FRONT (plano XZ, normal hacia el observador −Y): mide 40 en Z. */
const front = (x: number): DimensionProps => ({
  dimType: 'LINEAR',
  points: [[0, 0, 0], [0, 0, 40]],
  textPos: [x, 0, 20],
  normal: [0, -1, 0],
  style: { ...DEFAULT_DIM_STYLE },
})

describe('edición de cotas en un plano vertical (FRONT)', () => {
  it('DIMBREAK: el cruce se toma en el plano XZ de la cota', () => {
    const p = front(-10)
    const l: Entity = { id: 'l', type: 'LINE', layer: '0', props: { start: [-30, 0, 15], end: [10, 0, 15] } }
    const pts = dimBreakPoints(p, [l])
    expect(pts).toHaveLength(1)
    const q = pts[0]
    expect(q[0]).toBeCloseTo(-10, 9)
    expect(q[1]).toBeCloseTo(0, 9)
    expect(q[2]).toBeCloseTo(15, 9)
    p.autoBreaks = pts
    const onLine = (z: number) => dimDisplay(p).lines.some(([a, b]: Vec3[]) => Math.abs(a[0] + 10) < 1e-9 && Math.abs(b[0] + 10) < 1e-9 && Math.min(a[2], b[2]) <= z && Math.max(a[2], b[2]) >= z)
    expect(onLine(15)).toBe(false)
    expect(onLine(30)).toBe(true)
  })

  it('DIMSPACE y DIMJOGLINE quedan en el plano y no cambian la medida', () => {
    const base = front(-10)
    const o = front(-12)
    expect(spaceDimensions(base, [o], 8)).toBe(1)
    const h = dimDisplay(o).handles!
    expect(h[0][0]).toBeCloseTo(-18, 9)
    expect(h[0][1]).toBeCloseTo(0, 9)
    expect(measureDim(o)).toBeCloseTo(40, 9)
    expect(setJog(o, [-18, 0, 30])).toBe(true)
    expect(o.jog).toBeCloseTo(30, 9)
    for (const [a, b] of dimDisplay(o).lines) {
      expect(a[1]).toBeCloseTo(0, 9)
      expect(b[1]).toBeCloseTo(0, 9)
    }
  })
})
