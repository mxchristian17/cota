import { describe, it, expect, beforeEach } from 'vitest'
import type { Vec3 } from '../math'
import type { ArcProps, CircleProps, Entity, LineProps, PolylineProps, RectangleProps } from '../document/types'
import { Curve, curveOf } from '../geom/curve'
import { selfIntersections } from '../geom/intersect'
import { offsetCurve, offsetSide } from './offset'
import { makeEngine } from '../../test/engineHarness'
import { resetSysvars } from '../commands/sysvars'

const Z: Vec3 = [0, 0, 1]
const ent = (type: string, props: object): Entity => ({ id: 'x', type, layer: '0', props }) as unknown as Entity
const cv = (type: string, props: object): Curve => curveOf(ent(type, props)) as Curve
const square = cv('RECTANGLE', { corner: [0, 0, 0], width: 10, height: 10 })

describe('offsetCurve', () => {
  it('línea → paralela del lado indicado', () => {
    const l = cv('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    expect(offsetCurve(l, 2)[0].toEntity()).toEqual({ type: 'LINE', props: { start: [0, 2, 0], end: [10, 2, 0] } })
    expect(offsetSide(l, [5, -3, 0])).toBe(-1)
  })
  it('arco y círculo: radio ± d; si se anula, nada', () => {
    const a = cv('ARC', { center: [0, 0, 0], radius: 5, startAngle: 0, endAngle: 1, normal: Z })
    expect((offsetCurve(a, 1)[0].toEntity()?.props as ArcProps).radius).toBeCloseTo(4)
    expect(offsetCurve(a, 6)).toEqual([])
    const c = cv('CIRCLE', { center: [0, 0, 0], radius: 5, normal: Z })
    const out = offsetCurve(c, -1)[0].toEntity()
    expect(out?.type).toBe('CIRCLE')
    expect((out?.props as CircleProps).radius).toBeCloseTo(6)
  })
  it('rectángulo: hacia adentro sigue siendo RECTANGLE; si colapsa, nada', () => {
    expect(offsetSide(square, [5, 5, 0])).toBe(1)
    expect(offsetCurve(square, 1)[0].toEntity()).toEqual({ type: 'RECTANGLE', props: { corner: [1, 1, 0], width: 8, height: 8 } })
    expect(offsetCurve(square, 6)).toEqual([])
  })
  it('OFFSETGAPTYPE hacia afuera: 0 esquina viva, 1 redondeada, 2 chaflán', () => {
    const r0 = offsetCurve(square, -1, 0)[0].toEntity()?.props as RectangleProps
    expect(r0).toEqual({ corner: [-1, -1, 0], width: 12, height: 12 })
    const r1 = offsetCurve(square, -1, 1)[0]
    expect(r1.closed).toBe(true)
    expect(r1.prims.filter((p) => p.k === 'A')).toHaveLength(4)
    expect(r1.length()).toBeCloseTo(40 + 2 * Math.PI)
    const r2 = offsetCurve(square, -1, 2)[0].toEntity()?.props as PolylineProps
    expect(r2.vertices).toHaveLength(8)
  })
  it('polilínea cerrada con curvas: paralela sin bucles', () => {
    const stadium = cv('POLYLINE', {
      vertices: [[0, 0, 0], [40, 0, 0], [40, 40, 0], [0, 40, 0]],
      bulges: [0, 1, 0, 1],
      closed: true,
    })
    const [o] = offsetCurve(stadium, 10)
    expect(o.closed).toBe(true)
    expect(selfIntersections(o)).toHaveLength(0)
    expect(o.length()).toBeCloseTo(80 + 2 * Math.PI * 10)
  })
  it('poda de bucles: una ranura angosta separa el resultado en dos', () => {
    const u = cv('POLYLINE', {
      vertices: [[0, 0, 0], [40, 0, 0], [40, 40, 0], [25, 40, 0], [25, 10, 0], [15, 10, 0], [15, 40, 0], [0, 40, 0]],
      closed: true,
    })
    const out = offsetCurve(u, 6)
    expect(out).toHaveLength(2)
    for (const c of out) {
      expect(c.closed).toBe(true)
      expect(Math.abs(c.signedArea())).toBeCloseTo(84)
    }
  })
  it('elipse → spline', () => {
    const el = cv('ELLIPSE', { center: [0, 0, 0], major: [4, 0, 0], ratio: 0.5, normal: Z })
    const s = offsetCurve(el, -1)[0]
    expect(s.toEntity()?.type).toBe('SPLINE')
    expect(s.distanceTo([5, 0, 0])).toBeLessThan(0.05)
  })
})

describe('comando OFFSET', () => {
  let h: ReturnType<typeof makeEngine>
  beforeEach(() => {
    resetSysvars()
    h = makeEngine()
  })
  it('distancia + lado, Multiple y Through', async () => {
    const c = h.add('CIRCLE', { center: [0, 0, 0], radius: 5, normal: Z })
    await h.run('O', '2')
    await h.click(5, 0, c.id)
    await h.run('M', '#0,9', '#0,11', '', '')
    const radii = h.ofType('CIRCLE').map((e) => (e.props as CircleProps).radius)
    expect(radii.sort((a, b) => a - b)).toEqual([5, 7, 9].map((r) => expect.closeTo(r)))
    const l = h.add('LINE', { start: [20, 0, 0], end: [30, 0, 0] })
    await h.run('O', 'T')
    await h.click(25, 0, l.id)
    await h.run('#25,-4', '')
    expect(h.ofType('LINE').some((e) => (e.props as LineProps).start[1] === -4)).toBe(true)
  })
  it('Erase borra el origen y Layer=Current usa la capa actual', async () => {
    const l = h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] }, 'L1')
    await h.run('O', 'E', 'Y', 'L', 'C', '3')
    await h.click(5, 0, l.id)
    await h.run('#5,1', '')
    expect(h.doc.getEntity(l.id)).toBeUndefined()
    const [n] = h.ofType('LINE')
    expect(n.layer).toBe('0')
    expect((n.props as LineProps).start).toEqual([0, 3, 0])
  })
})
