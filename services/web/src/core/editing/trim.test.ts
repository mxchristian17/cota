import { describe, it, expect, beforeEach } from 'vitest'
import type { Vec3 } from '../math'
import type { ArcProps, Entity, LineProps, PolylineProps } from '../document/types'
import { Curve, curveOf } from '../geom/curve'
import { extendCurve, trimCurve } from './trim'
import { makeEngine } from '../../test/engineHarness'
import { resetSysvars } from '../commands/sysvars'

const Z: Vec3 = [0, 0, 1]
const ent = (type: string, props: object): Entity => ({ id: 'x', type, layer: '0', props }) as unknown as Entity
const cv = (type: string, props: object): Curve => curveOf(ent(type, props)) as Curve
const line = (a: Vec3, b: Vec3): Curve => cv('LINE', { start: a, end: b })

describe('trimCurve', () => {
  const vertical = (x: number): Curve => line([x, -5, 0], [x, 5, 0])
  it('el tramo central de una línea deja dos líneas', () => {
    const l = line([0, 0, 0], [10, 0, 0])
    const out = trimCurve(l, [vertical(3), vertical(7)], 0.5) as Curve[]
    expect(out.map((c) => c.toEntity()?.props)).toEqual([
      { start: [0, 0, 0], end: [3, 0, 0] },
      { start: [7, 0, 0], end: [10, 0, 0] },
    ])
  })
  it('sin cortes devuelve null; el extremo deja un solo trozo', () => {
    const l = line([0, 0, 0], [10, 0, 0])
    expect(trimCurve(l, [vertical(20)], 0.5)).toBeNull()
    expect(trimCurve(l, [vertical(3)], 0.1)?.map((c) => c.start[0])).toEqual([3])
  })
  it('un círculo cortado dos veces queda como arco (se quita el lado del pick)', () => {
    const c = cv('CIRCLE', { center: [0, 0, 0], radius: 5, normal: Z })
    const out = trimCurve(c, [vertical(0)], 0) as Curve[] // pick en (5,0): se quita la mitad derecha
    expect(out).toHaveLength(1)
    const e = out[0].toEntity()
    expect(e?.type).toBe('ARC')
    const p = e?.props as ArcProps
    expect(p.startAngle).toBeCloseTo(Math.PI / 2)
    expect(p.endAngle).toBeCloseTo((3 * Math.PI) / 2)
  })
  it('Edge=Extend corta con la arista prolongada', () => {
    const l = line([0, 0, 0], [10, 0, 0])
    const short = line([5, 2, 0], [5, 4, 0])
    expect(trimCurve(l, [short], 0.9)).toBeNull()
    expect(trimCurve(l, [short], 0.9, { extend: true, proj: 'Ucs' })?.[0].end[0]).toBeCloseTo(5)
  })
  it('PROJMODE=None ignora cortes a distinta cota', () => {
    const l = line([0, 0, 0], [10, 0, 0])
    const high = line([5, -5, 3], [5, 5, 3])
    expect(trimCurve(l, [high], 0.9, { extend: false, proj: 'None' })).toBeNull()
    expect(trimCurve(l, [high], 0.9)).not.toBeNull()
  })
})

describe('extendCurve', () => {
  it('la línea se prolonga recta hasta el contorno más cercano', () => {
    const l = line([0, 0, 0], [4, 0, 0])
    const res = extendCurve(l, [line([6, -5, 0], [6, 5, 0]), line([9, -5, 0], [9, 5, 0])], 'end')
    expect(res?.toEntity()?.props).toEqual({ start: [0, 0, 0], end: [6, 0, 0] })
  })
  it('el arco sigue su círculo', () => {
    const a = cv('ARC', { center: [0, 0, 0], radius: 5, startAngle: 0, endAngle: Math.PI / 4, normal: Z })
    const p = extendCurve(a, [line([0, 0, 0], [0, 10, 0])], 'end')?.toEntity()?.props as ArcProps
    expect(p.radius).toBeCloseTo(5)
    expect(p.endAngle).toBeCloseTo(Math.PI / 2)
  })
  it('sin contorno en esa dirección devuelve null', () => {
    expect(extendCurve(line([0, 0, 0], [4, 0, 0]), [line([-2, -5, 0], [-2, 5, 0])], 'end')).toBeNull()
  })
})

describe('comandos TRIM y EXTEND', () => {
  let h: ReturnType<typeof makeEngine>
  beforeEach(() => {
    resetSysvars()
    h = makeEngine()
  })

  it('TR con un círculo cortante recorta un arco y una polilínea', async () => {
    const circ = h.add('CIRCLE', { center: [0, 0, 0], radius: 5, normal: Z })
    const arc = h.add('ARC', { center: [0, -10, 0], radius: 12, startAngle: Math.PI / 6, endAngle: (5 * Math.PI) / 6, normal: Z })
    const pl = h.add('POLYLINE', { vertices: [[-10, 0, 0], [0, 0, 0], [10, 0, 0]], bulges: [0, 0], closed: false })
    h.setSelection([circ.id]) // preselección = aristas de corte
    await h.run('TR')
    await h.click(0, 2, arc.id) // tramo del arco dentro del círculo
    await h.click(-1, 0, pl.id) // tramo de la polilínea dentro del círculo
    await h.run('')
    expect(h.ofType('ARC')).toHaveLength(2)
    const pls = h.ofType('POLYLINE').map((e) => (e.props as PolylineProps).vertices)
    expect(pls).toHaveLength(2)
    expect(pls.map((v) => v.map((p) => Math.round(p[0])))).toEqual([[-10, -5], [5, 10]])
  })

  it('shift-select en TRIM extiende; Undo deshace; eRase borra', async () => {
    const wall = h.add('LINE', { start: [10, -5, 0], end: [10, 5, 0] })
    const l = h.add('LINE', { start: [0, 0, 0], end: [4, 0, 0] })
    const other = h.add('LINE', { start: [0, 3, 0], end: [4, 3, 0] })
    await h.run('TR', '')
    await h.click(3.5, 0, l.id, true)
    const ext = h.ofType('LINE').find((e) => (e.props as LineProps).start[1] === 0 && e.id !== wall.id)
    expect((ext?.props as LineProps).end[0]).toBeCloseTo(10)
    await h.run('U')
    expect(h.doc.getEntity(l.id)).toBeDefined()
    await h.run('R')
    await h.click(2, 3, other.id)
    await h.run('', '')
    expect(h.doc.getEntity(other.id)).toBeUndefined()
  })

  it('EX alarga; Edge=Extend usa el contorno prolongado; Fence recorta varias', async () => {
    h.add('LINE', { start: [10, 2, 0], end: [10, 5, 0] })
    const l = h.add('LINE', { start: [0, 0, 0], end: [4, 0, 0] })
    await h.run('EX', '')
    await h.click(3.9, 0, l.id)
    expect(h.prints).toContain('No edge in that direction.')
    await h.run('E', 'E')
    await h.click(3.9, 0, l.id)
    await h.run('')
    const done = h.ofType('LINE').find((e) => (e.props as LineProps).start[1] === 0)
    expect((done?.props as LineProps).end[0]).toBeCloseTo(10)

    resetSysvars()
    const g = makeEngine()
    g.add('LINE', { start: [5, -10, 0], end: [5, 10, 0] })
    g.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    g.add('LINE', { start: [0, 2, 0], end: [10, 2, 0] })
    await g.run('TR', '', 'F', '#7,-1', '#7,3', '', '')
    const right = g.ofType('LINE').filter((e) => (e.props as LineProps).start[1] !== -10)
    expect(right).toHaveLength(2)
    for (const e of right) expect((e.props as LineProps).end[0]).toBeCloseTo(5)
  })
})
