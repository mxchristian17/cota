import { describe, it, expect, beforeEach } from 'vitest'
import type { Vec3 } from '../math'
import type { ArcProps, Entity, LineProps, PolylineProps } from '../document/types'
import { Curve, curveOf } from '../geom/curve'
import { lengthenTo, targetLength } from './lengthen'
import { alignPlan, alignPoint } from './align'
import { resetSysvars } from '../commands/sysvars'
import { makeEngine } from '../../test/engineHarness'

const Z: Vec3 = [0, 0, 1]
const cv = (type: string, props: object): Curve => curveOf({ id: 'x', type, layer: '0', props } as unknown as Entity) as Curve
const arcProps = { center: [0, 0, 0], radius: 2, startAngle: 0, endAngle: Math.PI / 2, normal: Z }

describe('lengthenTo / targetLength', () => {
  it('línea: alarga o acorta el extremo pedido', () => {
    const l = cv('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    expect((lengthenTo(l, 'end', 15)?.toEntity()?.props as LineProps).end[0]).toBeCloseTo(15)
    expect((lengthenTo(l, 'start', 4)?.toEntity()?.props as LineProps).start[0]).toBeCloseTo(6)
    expect(lengthenTo(l, 'end', 0)).toBeNull()
  })
  it('arco: sigue su círculo y no puede dar la vuelta', () => {
    const a = cv('ARC', arcProps)
    const L = targetLength(a, 'DElta', 90, true) as number
    expect(L).toBeCloseTo(Math.PI * 2)
    expect((lengthenTo(a, 'end', L)?.toEntity()?.props as ArcProps).endAngle).toBeCloseTo(Math.PI)
    expect(lengthenTo(a, 'end', 4 * Math.PI)).toBeNull()
    expect(targetLength(cv('LINE', { start: [0, 0, 0], end: [1, 0, 0] }), 'Total', 30, true)).toBeNull()
  })
  it('polilínea: prolonga el tramo extremo; Percent sobre el total', () => {
    const pl = cv('POLYLINE', { vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 0]], bulges: [0, 0], closed: false })
    expect(targetLength(pl, 'Percent', 50)).toBeCloseTo(10)
    const r = lengthenTo(pl, 'end', 25)?.toEntity()?.props as PolylineProps
    expect(r.vertices[2][1]).toBeCloseTo(15)
    const s = lengthenTo(pl, 'end', 5)?.toEntity()?.props as PolylineProps
    expect(s.vertices).toHaveLength(2)
    expect(s.vertices[1][0]).toBeCloseTo(5)
  })
})

describe('alignPlan', () => {
  it('2 pares: traslada, rota y escala opcionalmente', () => {
    const pairs = [
      { src: [0, 0, 0] as Vec3, dst: [5, 5, 0] as Vec3 },
      { src: [1, 0, 0] as Vec3, dst: [5, 7, 0] as Vec3 },
    ]
    const p = alignPlan(pairs) as NonNullable<ReturnType<typeof alignPlan>>
    expect(p.angle).toBeCloseTo(Math.PI / 2)
    expect(alignPoint(p, [1, 0, 0])[1]).toBeCloseTo(6)
    const k = alignPlan(pairs, true) as NonNullable<ReturnType<typeof alignPlan>>
    expect(alignPoint(k, [1, 0, 0])[1]).toBeCloseTo(7)
  })
  it('3 pares: espejo si el tercero cambia de lado; puntos coincidentes → null', () => {
    const base = [
      { src: [0, 0, 0] as Vec3, dst: [0, 0, 0] as Vec3 },
      { src: [1, 0, 0] as Vec3, dst: [1, 0, 0] as Vec3 },
    ]
    expect(alignPlan([...base, { src: [0, 1, 0], dst: [0, -1, 0] }])?.flip).not.toBeNull()
    expect(alignPlan([...base, { src: [0, 1, 0], dst: [0, 3, 0] }])?.flip).toBeNull()
    expect(alignPlan([base[0], { src: [0, 0, 0], dst: [1, 0, 0] }])).toBeNull()
  })
})

describe('comandos LENGTHEN y ALIGN', () => {
  let h: ReturnType<typeof makeEngine>
  beforeEach(() => {
    resetSysvars()
    h = makeEngine()
  })
  it('LEN mide y, con DElta, alarga el extremo más cercano; Undo lo revierte', async () => {
    const l = h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    await h.run('LEN')
    await h.click(9, 0, l.id)
    expect(h.prints).toContain('Current length: 10.0000')
    await h.run('DE', '5')
    await h.click(9, 0, l.id)
    expect((h.ofType('LINE')[0].props as LineProps).end[0]).toBeCloseTo(15)
    await h.run('U')
    expect((h.ofType('LINE')[0].props as LineProps).end[0]).toBeCloseTo(10)
  })
  it('LEN Total con Angle sobre un arco y DYnamic sobre una línea', async () => {
    const a = h.add('ARC', arcProps)
    await h.run('LEN', 'T', 'A', '180')
    await h.click(0, 2, a.id)
    expect((h.ofType('ARC')[0].props as ArcProps).endAngle).toBeCloseTo(Math.PI)
    await h.run('')
    const l = h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    await h.run('LEN', 'DY')
    await h.click(1, 0, l.id)
    await h.run('#-3,4')
    expect((h.ofType('LINE')[0].props as LineProps).start[0]).toBeCloseTo(-3)
  })
  it('AL con 2 pares y escala alinea una línea', async () => {
    const l = h.add('LINE', { start: [0, 0, 0], end: [2, 0, 0] })
    h.setSelection([l.id])
    await h.run('AL', '#0,0', '#5,5', '#2,0', '#5,9', '', 'Y')
    const p = h.ofType('LINE')[0].props as LineProps
    expect(p.start[0]).toBeCloseTo(5)
    expect(p.end[0]).toBeCloseTo(5)
    expect(p.end[1]).toBeCloseTo(9)
  })
})
