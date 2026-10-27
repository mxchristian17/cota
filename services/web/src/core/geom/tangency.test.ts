import { describe, it, expect } from 'vitest'
import type { Vec3 } from '../math'
import { circleFrom3Points, commonTangents, perpendicularFoot, resolveDeferredLine, solveCircle, tangentPointsFrom } from './tangency'

const near = (a: Vec3, b: number[], tol = 1e-7) => expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(tol)
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1])
/** ¿La recta a→b es tangente al círculo (c, r)? */
const tangentTo = (a: Vec3, b: Vec3, c: Vec3, r: number) => {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  return Math.abs(Math.abs((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / Math.hypot(dx, dy) - r) < 1e-7
}

describe('tangencias', () => {
  it('tangentes desde un punto exterior', () => {
    const [t1, t2] = tangentPointsFrom([0, 0, 0], 5, [10, 0, 0])
    for (const t of [t1, t2]) {
      expect(dist(t, [0, 0, 0])).toBeCloseTo(5, 9)
      // radio ⟂ tangente
      expect(t[0] * (10 - t[0]) + t[1] * (0 - t[1])).toBeCloseTo(0, 9)
    }
    expect(tangentPointsFrom([0, 0, 0], 5, [3, 0, 0])).toHaveLength(0)
  })

  it('tangentes comunes: 4 entre círculos separados, todas tangentes a ambos', () => {
    const sols = commonTangents([0, 0, 0], 3, [20, 0, 0], 5)
    expect(sols).toHaveLength(4)
    for (const [a, b] of sols) {
      expect(tangentTo(a, b, [0, 0, 0], 3)).toBe(true)
      expect(tangentTo(a, b, [20, 0, 0], 5)).toBe(true)
    }
  })

  it('línea con primer punto en tangente diferida: elige la tangente del lado del clic', () => {
    const seg = resolveDeferredLine({ kind: 'tangent', obj: { kind: 'circle', c: [0, 0, 0], r: 5 }, hint: [0, 5, 0] }, [20, 0, 0])!
    expect(seg[0][1]).toBeGreaterThan(0)
    expect(tangentTo(seg[0], seg[1], [0, 0, 0], 5)).toBe(true)
    near(seg[1], [20, 0])
  })

  it('tangente-tangente: la común más cercana a los dos clics (exterior de arriba)', () => {
    const seg = resolveDeferredLine(
      { kind: 'tangent', obj: { kind: 'circle', c: [0, 0, 0], r: 3 }, hint: [0, 3, 0] },
      { kind: 'tangent', obj: { kind: 'circle', c: [20, 0, 0], r: 3 }, hint: [20, 3, 0] },
    )!
    near(seg[0], [0, 3])
    near(seg[1], [20, 3])
  })

  it('perpendicular diferida a una línea', () => {
    near(perpendicularFoot({ kind: 'line', a: [0, 0, 0], b: [10, 0, 0] }, [4, 7, 0]), [4, 0])
  })

  it('círculo por 3 puntos', () => {
    const c = circleFrom3Points([0, 0, 0], [10, 0, 0], [0, 10, 0])!
    near(c.c, [5, 5])
    expect(c.r).toBeCloseTo(Math.hypot(5, 5), 9)
  })

  it('Ttr: radio 2 tangente a dos rectas perpendiculares, en el cuadrante de los clics', () => {
    const c = solveCircle(
      [
        { kind: 'line', a: [0, 0, 0], b: [10, 0, 0] },
        { kind: 'line', a: [0, 0, 0], b: [0, 10, 0] },
      ],
      [[3, 0, 0], [0, 3, 0]],
      2,
    )!
    near(c.c, [2, 2])
  })

  it('Ttr: tangente a una recta y a un círculo', () => {
    const c = solveCircle(
      [
        { kind: 'line', a: [-20, 0, 0], b: [20, 0, 0] },
        { kind: 'circle', c: [0, 5, 0], r: 2 },
      ],
      [[-3, 0, 0], [-2, 4, 0]],
      2,
    )!
    // Centro a 2 de la recta y a 2 + 2 del centro del círculo: (−√7, 2), del lado de los clics.
    near(c.c, [-Math.sqrt(7), 2])
  })

  it('Tan Tan Tan: el incírculo de un triángulo 3-4-5 (r = 1)', () => {
    const A: Vec3 = [0, 0, 0]
    const B: Vec3 = [4, 0, 0]
    const C: Vec3 = [0, 3, 0]
    const c = solveCircle(
      [
        { kind: 'line', a: A, b: B },
        { kind: 'line', a: B, b: C },
        { kind: 'line', a: C, b: A },
      ],
      [[1, 0, 0], [2, 1.5, 0], [0, 1, 0]],
    )!
    expect(c.r).toBeCloseTo(1, 7)
    near(c.c, [1, 1])
  })

  it('3P con dos puntos y una tangente', () => {
    const c = solveCircle([{ kind: 'point', p: [-5, 5, 0] }, { kind: 'point', p: [5, 5, 0] }, { kind: 'line', a: [-20, 0, 0], b: [20, 0, 0] }], [[-5, 5, 0], [5, 5, 0], [0, 0, 0]])!
    // Pasa por los dos puntos y toca y = 0: centro (0, r) con 25 + (5 − r)² = r² → r = 5.
    expect(c.r).toBeCloseTo(5, 7)
    near(c.c, [0, 5])
  })
})

describe('LINE con primer punto diferido (el bug: TAN sólo andaba para terminar)', () => {
  it('tangente al iniciar: la línea sale tangente al círculo desde el segundo punto', async () => {
    const { makeEngine } = await import('../../test/engineHarness')
    const h = makeEngine()
    const circle = h.add('CIRCLE', { center: [0, 0, 0], radius: 5, normal: [0, 0, 1] })
    await h.run('LINE')
    h.engine.submitClick({ x: 0, y: 5, z: 0 }, circle.id, true, false, undefined, {
      kind: 'tangent',
      obj: { kind: 'circle', c: [0, 0, 0], r: 5 },
      hint: [0, 5, 0],
    })
    await new Promise((r) => setTimeout(r, 0))
    await h.run('#20,0', '')
    const [ln] = h.ofType('LINE')
    const p = ln.props as { start: Vec3; end: Vec3 }
    expect(tangentTo(p.start, p.end, [0, 0, 0], 5)).toBe(true)
    expect(p.start[1]).toBeGreaterThan(0)
    near(p.end, [20, 0])
  })

  it('el snap ofrece la tangente diferida sin punto base y nada de PER/TAN normales', async () => {
    const { computeSnap } = await import('../snap/SnapService')
    const { WORLD_UCS } = await import('../ucs')
    const circle = { id: 'c', type: 'CIRCLE' as const, layer: '0', props: { center: [0, 0, 0] as Vec3, radius: 5, normal: [0, 0, 1] as Vec3 } }
    const off = { endpoint: false, midpoint: false, center: true, geometricCenter: false, quadrant: false, intersection: false, apparentIntersection: false, perpendicular: false, tangent: true, nearest: false, node: false }
    const r = computeSnap({ x: 3, y: 4.2, z: 0 }, [circle], {
      gridSnap: false, gridStep: 10, esnap: true, ucs: WORLD_UCS, osnap: off, base: null,
      cursorPx: [3, 4.2], pixelThreshold: 5, project: (p) => [p.x, p.y],
    })
    expect(r.type).toBe('tangent')
    expect(r.deferred?.kind).toBe('tangent')
    expect(Math.hypot(r.point.x, r.point.y)).toBeCloseTo(5, 9)
  })
})

describe('tangentes diferidas fuera del plano XY', () => {
  it('TAN-TAN entre dos círculos de un plano vertical: la recta queda en su plano y del lado marcado', () => {
    const n: [number, number, number] = [0, -1, 0]
    const big = { kind: 'circle' as const, c: [11, 4, 89] as [number, number, number], r: 14, n }
    const small = { kind: 'circle' as const, c: [109, 4, 70] as [number, number, number], r: 10, n }
    for (const side of [1, -1]) {
      const seg = resolveDeferredLine({ kind: 'tangent', obj: big, hint: [11, 4, 89 + side * 14] }, { kind: 'tangent', obj: small, hint: [109, 4, 70 + side * 10] })!
      expect(seg).not.toBeNull()
      const [a, b] = seg
      expect(a[1]).toBeCloseTo(4, 9)
      expect(b[1]).toBeCloseTo(4, 9)
      expect(Math.hypot(a[0] - 11, a[2] - 89)).toBeCloseTo(14, 9)
      expect(Math.hypot(b[0] - 109, b[2] - 70)).toBeCloseTo(10, 9)
      expect(Math.sign(a[2] - 89)).toBe(side) // la de arriba arriba, la de abajo abajo
    }
  })
})
