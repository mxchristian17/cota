import { describe, it, expect, beforeEach } from 'vitest'
import type { Vec3 } from '../math'
import type { ArcProps, Entity, LineProps, PolylineProps } from '../document/types'
import { Curve, curveOf } from '../geom/curve'
import { breakCurve } from './breakCurve'
import { makeEngine } from '../../test/engineHarness'

const Z: Vec3 = [0, 0, 1]
const cv = (type: string, props: object): Curve => curveOf({ id: 'x', type, layer: '0', props } as unknown as Entity) as Curve

describe('breakCurve', () => {
  const line = cv('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
  it('abierta: quita el tramo o parte en un punto', () => {
    expect(breakCurve(line, 0.7, 0.3)?.map((c) => c.toEntity()?.props)).toEqual([
      { start: [0, 0, 0], end: [3, 0, 0] },
      { start: [7, 0, 0], end: [10, 0, 0] },
    ])
    expect(breakCurve(line, 0.5, 0.5)).toHaveLength(2)
    expect(breakCurve(line, 0.5, 1)).toHaveLength(1)
  })
  it('círculo: se quita el tramo antihorario del 1º al 2º punto y queda un arco', () => {
    const ccw = cv('CIRCLE', { center: [0, 0, 0], radius: 5, normal: Z })
    const [a] = breakCurve(ccw, 0, 0.25) as Curve[] // quita de 0° a 90°
    const p = a.toEntity()?.props as ArcProps
    expect(p.startAngle).toBeCloseTo(Math.PI / 2)
    expect(p.endAngle).toBeCloseTo(0)
    const cw = cv('CIRCLE', { center: [0, 0, 0], radius: 5, normal: [0, 0, -1] })
    // En el círculo horario t=0.25 está en 270°: el tramo antihorario 0°→270° se quita.
    const [b] = breakCurve(cw, 0, 0.25) as Curve[]
    expect(b.length()).toBeCloseTo((Math.PI * 10) / 4)
    expect(breakCurve(ccw, 0.3, 0.3)).toBeNull()
  })
  it('polilínea cerrada con un solo punto: se abre ahí', () => {
    const sq = cv('RECTANGLE', { corner: [0, 0, 0], width: 4, height: 4 })
    const [o] = breakCurve(sq, 0.5, 0.5) as Curve[]
    const e = o.toEntity()
    expect(e?.type).toBe('POLYLINE')
    expect((e?.props as PolylineProps).closed).toBe(false)
    expect((e?.props as PolylineProps).vertices[0]).toEqual([2, 0, 0])
  })
})

describe('comandos BREAK y BREAKATPOINT', () => {
  let h: ReturnType<typeof makeEngine>
  beforeEach(() => {
    h = makeEngine()
  })
  it('BR con dos puntos sobre un círculo deja un arco', async () => {
    const c = h.add('CIRCLE', { center: [0, 0, 0], radius: 5, normal: Z })
    await h.run('BR')
    await h.click(5, 0, c.id)
    await h.run('#0,5')
    expect(h.ofType('CIRCLE')).toHaveLength(0)
    const [a] = h.ofType('ARC')
    expect((a.props as ArcProps).startAngle).toBeCloseTo(Math.PI / 2)
  })
  it('BR con "@" y BREAKATPOINT parten sin quitar material', async () => {
    const l = h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    await h.run('BR')
    await h.click(4, 0, l.id)
    await h.run('@')
    expect(h.ofType('LINE').map((e) => (e.props as LineProps).end[0]).sort((a, b) => a - b)).toEqual([4, 10])
    const [second] = h.ofType('LINE').filter((e) => (e.props as LineProps).start[0] === 4)
    await h.run('BREAKATPOINT')
    await h.click(6, 0, second.id)
    await h.run('#8,0')
    expect(h.ofType('LINE')).toHaveLength(3)
  })
})
