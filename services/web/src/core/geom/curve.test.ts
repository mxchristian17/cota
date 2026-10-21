import { describe, it, expect } from 'vitest'
import type { Vec3 } from '../math'
import type { Entity } from '../document/types'
import { Curve, curveOf, polylineCurve, splineCurve } from './curve'

const ent = (type: string, props: object): Entity => ({ id: 'x', type, layer: '0', props }) as unknown as Entity
const close = (a: Vec3, b: Vec3, eps = 1e-6): void => {
  expect(a[0]).toBeCloseTo(b[0], 5)
  expect(a[1]).toBeCloseTo(b[1], 5)
  expect(Math.abs(a[2] - b[2]) < eps).toBe(true)
}
const Z = [0, 0, 1] as Vec3

describe('Curve — línea', () => {
  const c = curveOf(ent('LINE', { start: [0, 0, 0], end: [10, 0, 0] })) as Curve
  it('parámetro, largo y punto', () => {
    expect(c.n).toBe(1)
    expect(c.length()).toBeCloseTo(10)
    close(c.pointAt(0.25), [2.5, 0, 0])
    expect(c.paramAt([7, 3, 0])).toBeCloseTo(0.7)
  })
  it('trimTo admite prolongación fuera del dominio', () => {
    const e = c.trimTo(-0.5, 1.2)?.toEntity()
    expect(e).toEqual({ type: 'LINE', props: { start: [-5, 0, 0], end: [12, 0, 0] } })
  })
  it('extendTo alarga y acorta', () => {
    expect(c.extendTo([14, 2, 0], 'end')?.end[0]).toBeCloseTo(14)
    expect(c.extendTo([3, 0, 0], 'start')?.start[0]).toBeCloseTo(3)
  })
})

describe('Curve — arco y círculo', () => {
  const arc = curveOf(ent('ARC', { center: [0, 0, 0], radius: 2, startAngle: 0, endAngle: Math.PI / 2, normal: Z })) as Curve
  it('punto medio y largo del arco', () => {
    close(arc.pointAt(0.5), [Math.SQRT2, Math.SQRT2, 0])
    expect(arc.length()).toBeCloseTo(Math.PI)
  })
  it('un círculo recortado vuelve como ARC', () => {
    const circ = curveOf(ent('CIRCLE', { center: [0, 0, 0], radius: 1, normal: Z })) as Curve
    expect(circ.closed).toBe(true)
    expect(circ.signedArea()).toBeCloseTo(Math.PI)
    const e = circ.trimTo(0.25, 0.5)?.toEntity()
    expect(e?.type).toBe('ARC')
    const p = e?.props as { startAngle: number; endAngle: number }
    expect(p.startAngle).toBeCloseTo(Math.PI / 2)
    expect(p.endAngle).toBeCloseTo(Math.PI)
  })
  it('trimTo en cerrada da la vuelta por el inicio', () => {
    const circ = curveOf(ent('CIRCLE', { center: [0, 0, 0], radius: 1, normal: Z })) as Curve
    const piece = circ.trimTo(0.75, 0.25) as Curve
    expect(piece.length()).toBeCloseTo(Math.PI)
    close(piece.pointAt(piece.n / 2), [1, 0, 0])
  })
  it('arco horario (normal −Z) conserva el sentido al volver a entidad', () => {
    const cw = curveOf(ent('ARC', { center: [0, 0, 0], radius: 1, startAngle: 0, endAngle: Math.PI / 2, normal: [0, 0, -1] })) as Curve
    close(cw.pointAt(0.5), [Math.SQRT1_2, -Math.SQRT1_2, 0])
    const back = curveOf(ent('ARC', { ...(cw.toEntity()?.props as object) })) as Curve
    close(back.pointAt(0.5), [Math.SQRT1_2, -Math.SQRT1_2, 0])
  })
})

describe('Curve — polilínea, rectángulo, elipse y spline', () => {
  it('polilínea con bulge: split conserva el arco', () => {
    const pl = curveOf(ent('POLYLINE', { vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 0]], bulges: [0, 1], closed: false })) as Curve
    expect(pl.n).toBe(2)
    expect(pl.length()).toBeCloseTo(10 + Math.PI * 5)
    const [a, b] = pl.split([0.5])
    expect((a.toEntity()?.props as { vertices: Vec3[] }).vertices).toHaveLength(2)
    const pb = b.toEntity()
    expect(pb?.type).toBe('POLYLINE')
    const props = pb?.props as { vertices: Vec3[]; bulges: number[] }
    expect(props.vertices).toHaveLength(3)
    expect(props.bulges[1]).toBeCloseTo(1)
  })
  it('el rectángulo vuelve como RECTANGLE y su área es positiva', () => {
    const r = curveOf(ent('RECTANGLE', { corner: [1, 2, 0], width: 4, height: 3 })) as Curve
    expect(r.signedArea()).toBeCloseTo(12)
    expect(r.toEntity()).toEqual({ type: 'RECTANGLE', props: { corner: [1, 2, 0], width: 4, height: 3 } })
    expect(r.trimTo(0.5, 2.5)?.toEntity()?.type).toBe('POLYLINE')
  })
  it('elipse completa: largo y arco de elipse al recortar', () => {
    const el = curveOf(ent('ELLIPSE', { center: [0, 0, 0], major: [2, 0, 0], ratio: 0.5, normal: Z })) as Curve
    expect(el.closed).toBe(true)
    expect(el.length()).toBeCloseTo(9.6884, 3)
    const e = el.trimTo(0, 0.5)?.toEntity()
    expect(e?.type).toBe('ELLIPSE')
    expect((e?.props as { endParam: number }).endParam).toBeCloseTo(Math.PI)
  })
  it('spline: pasa por sus puntos y respeta los nodos al recortar', () => {
    const pts: Vec3[] = [[0, 0, 0], [5, 5, 0], [10, 0, 0]]
    const s = splineCurve(pts) as Curve
    close(s.pointAt(s.nodes[0]), [5, 5, 0])
    const e = s.trimTo(0, s.nodes[0])?.toEntity()
    expect(e?.type).toBe('SPLINE')
    const cps = (e?.props as { controlPoints: Vec3[] }).controlPoints
    close(cps[cps.length - 1], [5, 5, 0])
  })
  it('reverse invierte el recorrido', () => {
    const pl = polylineCurve([[0, 0, 0], [1, 0, 0], [1, 1, 0]]) as Curve
    const r = pl.reverse()
    close(r.start, [1, 1, 0])
    close(r.end, [0, 0, 0])
  })
  it('curveOf rechaza entidades fuera del plano XY', () => {
    expect(curveOf(ent('CIRCLE', { center: [0, 0, 0], radius: 1, normal: [1, 0, 0] }))).toBeNull()
    expect(curveOf(ent('TEXT', { position: [0, 0, 0], text: 'a', height: 1 }))).toBeNull()
  })
})
