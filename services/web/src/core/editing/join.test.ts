import { describe, it, expect, beforeEach } from 'vitest'
import type { Vec3 } from '../math'
import type { ArcProps, Entity, LineProps, PolylineProps, SplineProps } from '../document/types'
import { coverIntervals, joinEntities } from './join'
import { makeEngine } from '../../test/engineHarness'

const Z: Vec3 = [0, 0, 1]
let seq = 0
const ent = (type: string, props: object): Entity => ({ id: `j${++seq}`, type, layer: '0', props }) as unknown as Entity
const arc = (a0: number, a1: number, r = 5): Entity => ent('ARC', { center: [0, 0, 0], radius: r, startAngle: a0, endAngle: a1, normal: Z })
const H = Math.PI / 2

describe('coverIntervals', () => {
  it('cubre con el complemento del hueco mayor y detecta la vuelta completa', () => {
    const [s, w] = coverIntervals([[2.5, H], [0, H]]) as [number, number]
    expect(s).toBeCloseTo(0)
    expect(w).toBeCloseTo(2.5 + H)
    expect(coverIntervals([[0, Math.PI], [Math.PI, Math.PI]])).toBeNull()
    expect(coverIntervals([[3 * H, Math.PI], [H, Math.PI]])).toBeNull()
  })
})

describe('joinEntities', () => {
  it('líneas colineales (con hueco) → una línea', () => {
    const g = joinEntities([ent('LINE', { start: [0, 0, 0], end: [4, 0, 0] }), ent('LINE', { start: [6, 0, 0], end: [10, 0, 0] })])
    expect(g).toHaveLength(1)
    expect(g[0].result).toEqual({ type: 'LINE', props: { start: [0, 0, 0], end: [10, 0, 0] } })
  })
  it('arcos del mismo círculo → un arco; si lo completan → círculo', () => {
    const g = joinEntities([arc(0, H), arc(H, Math.PI)])
    expect(g[0].result.type).toBe('ARC')
    const p = g[0].result.props as ArcProps
    expect(p.startAngle).toBeCloseTo(0)
    expect(p.endAngle).toBeCloseTo(Math.PI)
    expect(joinEntities([arc(0, Math.PI), arc(Math.PI, 0)])[0].result.type).toBe('CIRCLE')
  })
  it('curvas contiguas → polilínea (cerrada si se cierra), conservando el arco', () => {
    const g = joinEntities([
      ent('LINE', { start: [0, 0, 0], end: [10, 0, 0] }),
      ent('LINE', { start: [10, 10, 0], end: [0, 10, 0] }),
      ent('ARC', { center: [10, 5, 0], radius: 5, startAngle: -H, endAngle: H, normal: Z }),
      ent('LINE', { start: [0, 0, 0], end: [0, 10, 0] }),
    ])
    expect(g).toHaveLength(1)
    const p = g[0].result.props as PolylineProps
    expect(g[0].result.type).toBe('POLYLINE')
    expect(p.closed).toBe(true)
    expect(p.vertices).toHaveLength(4)
    expect(p.bulges?.some((b) => Math.abs(Math.abs(b) - 1) < 1e-9)).toBe(true)
  })
  it('con una spline el resultado es spline; lo que no toca no se une', () => {
    const g = joinEntities([
      ent('SPLINE', { controlPoints: [[0, 0, 0], [5, 5, 0], [10, 0, 0]], degree: 3 }),
      ent('LINE', { start: [10, 0, 0], end: [20, 0, 0] }),
      ent('LINE', { start: [50, 50, 0], end: [60, 60, 0] }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].result.type).toBe('SPLINE')
    const cps = (g[0].result.props as SplineProps).controlPoints
    expect(cps[cps.length - 1]).toEqual([20, 0, 0])
  })
})

describe('comando JOIN', () => {
  let h: ReturnType<typeof makeEngine>
  beforeEach(() => {
    h = makeEngine()
  })
  it('origen + objetos a unir; capa del origen', async () => {
    const a = h.add('LINE', { start: [0, 0, 0], end: [5, 0, 0] }, 'A')
    const b = h.add('LINE', { start: [5, 0, 0], end: [9, 0, 0] }, 'B')
    h.setSelection([a.id])
    await h.run('J')
    await h.click(7, 0, b.id)
    await h.run('')
    const lines = h.ofType('LINE')
    expect(lines).toHaveLength(1)
    expect(lines[0].layer).toBe('A')
    expect((lines[0].props as LineProps).end).toEqual([9, 0, 0])
    expect(h.prints).toContain('2 objects joined into 1 line.')
  })
  it('arco + cLose → círculo', async () => {
    const a = h.add('ARC', { center: [0, 0, 0], radius: 3, startAngle: 0, endAngle: 1, normal: Z })
    h.setSelection([a.id])
    await h.run('J', 'L')
    expect(h.ofType('CIRCLE')).toHaveLength(1)
    expect(h.ofType('ARC')).toHaveLength(0)
  })
})
