import { describe, it, expect } from 'vitest'
import type { Vec3 } from '../math'
import type { Entity } from '../document/types'
import { Curve, curveOf, polylineCurve } from './curve'
import { intersectCurves, selfIntersections } from './intersect'

const ent = (type: string, props: object): Entity => ({ id: 'x', type, layer: '0', props }) as unknown as Entity
const cv = (type: string, props: object): Curve => curveOf(ent(type, props)) as Curve
const Z = [0, 0, 1] as Vec3
const line = (a: Vec3, b: Vec3): Curve => cv('LINE', { start: a, end: b })
const circle = (c: Vec3, r: number): Curve => cv('CIRCLE', { center: c, radius: r, normal: Z })
const xs = (hits: Array<{ point: Vec3 }>): number[] => hits.map((h) => h.point[0]).sort((a, b) => a - b)

describe('intersectCurves', () => {
  it('línea–línea: cruce y paralelas', () => {
    const h = intersectCurves(line([0, 0, 0], [10, 10, 0]), line([0, 10, 0], [10, 0, 0]))
    expect(h).toHaveLength(1)
    expect(h[0].point[0]).toBeCloseTo(5)
    expect(h[0].t1).toBeCloseTo(0.5)
    expect(intersectCurves(line([0, 0, 0], [10, 0, 0]), line([0, 1, 0], [10, 1, 0]))).toHaveLength(0)
  })
  it('línea–círculo: secante y tangente', () => {
    expect(xs(intersectCurves(line([-5, 0, 0], [5, 0, 0]), circle([0, 0, 0], 2)))).toEqual([
      expect.closeTo(-2),
      expect.closeTo(2),
    ])
    const t = intersectCurves(line([-5, 2, 0], [5, 2, 0]), circle([0, 0, 0], 2))
    expect(t).toHaveLength(1)
    expect(t[0].point[0]).toBeCloseTo(0)
  })
  it('círculo–círculo', () => {
    const h = intersectCurves(circle([0, 0, 0], 5), circle([8, 0, 0], 5))
    expect(h).toHaveLength(2)
    for (const p of h) expect(p.point[0]).toBeCloseTo(4)
  })
  it('arco: sólo los cortes dentro de su barrido', () => {
    const arc = cv('ARC', { center: [0, 0, 0], radius: 2, startAngle: 0, endAngle: Math.PI, normal: Z })
    const h = intersectCurves(line([0, -5, 0], [0, 5, 0]), arc)
    expect(h).toHaveLength(1)
    expect(h[0].point[1]).toBeCloseTo(2)
  })
  it('línea–elipse y arco–elipse', () => {
    const el = cv('ELLIPSE', { center: [0, 0, 0], major: [4, 0, 0], ratio: 0.5, normal: Z })
    expect(xs(intersectCurves(line([-10, 0, 0], [10, 0, 0]), el))).toEqual([expect.closeTo(-4), expect.closeTo(4)])
    const h = intersectCurves(circle([0, 0, 0], 3), el)
    expect(h).toHaveLength(4)
    for (const p of h) expect(Math.hypot(p.point[0], p.point[1])).toBeCloseTo(3, 4)
  })
  it('modo extendido: prolonga la abierta pero nunca la cerrada', () => {
    const l = line([5, 0, 0], [10, 0, 0])
    const c = circle([0, 0, 0], 2)
    expect(intersectCurves(l, c)).toHaveLength(0)
    const h = intersectCurves(l, c, true)
    expect(xs(h)).toEqual([expect.closeTo(-2), expect.closeTo(2)])
    expect(h.every((x) => x.t1 < 0)).toBe(true)
    expect(intersectCurves(l, c, { start: false, end: true })).toHaveLength(0)
  })
  it('polilínea con bulge contra línea', () => {
    const pl = cv('POLYLINE', { vertices: [[0, 0, 0], [10, 0, 0]], bulges: [1], closed: false })
    const h = intersectCurves(pl, line([5, -10, 0], [5, 10, 0]))
    expect(h).toHaveLength(1)
    expect(h[0].point[1]).toBeCloseTo(-5)
  })
})

describe('selfIntersections', () => {
  it('detecta el cruce de un "8" e ignora vértices compartidos', () => {
    const eight = polylineCurve([[0, 0, 0], [10, 10, 0], [10, 0, 0], [0, 10, 0]]) as Curve
    const s = selfIntersections(eight)
    expect(s).toHaveLength(1)
    const [ta, tb] = s[0]
    expect(eight.pointAt(ta)[0]).toBeCloseTo(5)
    expect(eight.pointAt(tb)[1]).toBeCloseTo(5)
    expect(selfIntersections(polylineCurve([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], true) as Curve)).toHaveLength(0)
  })
})
