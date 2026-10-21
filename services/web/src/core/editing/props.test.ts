import { describe, it, expect } from 'vitest'
import { applyField, entityFields } from './props'
import type { Entity } from '../document/types'

const line = (): Entity => ({ id: 'l', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [3, 4, 0] } })
const text = (): Entity => ({ id: 't', type: 'TEXT', layer: '0', props: { position: [0, 0, 0], text: 'AB', height: 10, rotation: 0, justify: 'left', normal: [0, 0, 1] } })
const box = (): Entity => ({ id: 'b', type: 'SOLID3D', layer: '0', props: { op: 'BOX', origin: [0, 0, 0], width: 10, depth: 10, height: 10 } })
const poly = (): Entity => ({ id: 'p', type: 'POLYLINE', layer: '0', props: { vertices: [[0, 0, 0], [1, 0, 0]], closed: false } })
const key = (e: Entity, k: string) => entityFields(e).find((f) => f.key === k)

describe('entity props', () => {
  it('la línea expone start/end X/Y/Z y largo de solo lectura', () => {
    const fs = entityFields(line())
    expect(fs.map((f) => f.key)).toEqual(expect.arrayContaining(['start.x', 'start.y', 'start.z', 'end.x', 'end.y', 'end.z']))
    const len = key(line(), '_len')!
    expect(len.kind === 'number' && len.value).toBeCloseTo(5, 6)
    expect(len.kind === 'number' && len.readOnly).toBe(true)
  })

  it('editar una componente de vector muta solo esa componente', () => {
    const e = line()
    applyField(e, 'end.y', 40)
    expect((e.props as { end: number[] }).end).toEqual([3, 40, 0])
    expect((e.props as { start: number[] }).start).toEqual([0, 0, 0])
  })

  it('ignora las claves de solo lectura (_…)', () => {
    const e = line()
    applyField(e, '_len', 999)
    expect((e.props as { end: number[] }).end).toEqual([3, 4, 0])
  })

  it('el texto edita string, alto, rotación (grados→rad) y justify', () => {
    const e = text()
    applyField(e, 'text', 'HELLO')
    applyField(e, 'height', 25)
    applyField(e, 'rotationDeg', 90)
    applyField(e, 'justify', 'center')
    const p = e.props as { text: string; height: number; rotation: number; justify: string }
    expect(p.text).toBe('HELLO')
    expect(p.height).toBe(25)
    expect(p.rotation).toBeCloseTo(Math.PI / 2, 6)
    expect(p.justify).toBe('center')
    // el campo expone la rotación en grados
    const rot = key(text(), 'rotationDeg')!
    expect(rot.kind === 'number' && rot.value).toBeCloseTo(0, 6)
  })

  it('la caja expone origin + dimensiones y las edita', () => {
    const e = box()
    expect(entityFields(e).map((f) => f.key)).toEqual(expect.arrayContaining(['_op', 'origin.x', 'width', 'depth', 'height']))
    applyField(e, 'width', 42)
    applyField(e, 'origin.z', 5)
    const p = e.props as { width: number; origin: number[] }
    expect(p.width).toBe(42)
    expect(p.origin).toEqual([0, 0, 5])
  })

  it('la polilínea alterna closed (booleano)', () => {
    const e = poly()
    applyField(e, 'closed', true)
    expect((e.props as { closed: boolean }).closed).toBe(true)
  })
})
