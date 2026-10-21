import { describe, it, expect } from 'vitest'
import { makeEngine } from '../../test/engineHarness'
import type { DimensionProps, LineEntity } from '../document/types'
import { reassociatePoint } from './assoc'

describe('cotas asociativas (criterio 6)', () => {
  it('mover la línea arrastra la cota entera; estirarla actualiza el punto; borrarla la deja no asociativa', async () => {
    const h = makeEngine()
    const l = h.add('LINE', { start: [0, 0, 0], end: [20, 0, 0] }) as LineEntity
    await h.run('DIMLINEAR', '')
    await h.click(10, 0, l.id)
    await h.run('#10,-8')
    const d = h.ofType('DIMENSION')[0].props as DimensionProps
    // Traslación: la cota acompaña (puntos y línea de cota).
    l.props.start = [5, 5, 0]
    l.props.end = [25, 5, 0]
    h.doc.updateAssociativeDims()
    expect(d.points).toEqual([[5, 5, 0], [25, 5, 0]])
    expect(d.textPos[1]).toBeCloseTo(-3, 9)
    // Estiramiento: sólo cambia el extremo; la línea de cota queda.
    l.props.end = [35, 5, 0]
    h.doc.updateAssociativeDims()
    expect(d.points[1]).toEqual([35, 5, 0])
    expect(d.textPos[1]).toBeCloseTo(-3, 9)
    // Borrada la geometría: queda no asociativa, sin error.
    h.doc.removeEntity(l.id)
    expect(() => h.doc.updateAssociativeDims()).not.toThrow()
    expect(d.assoc).toBeUndefined()
  })

  it('DIMASSOC 1: las cotas nuevas no se asocian', async () => {
    const h = makeEngine()
    const l = h.add('LINE', { start: [0, 0, 0], end: [20, 0, 0] })
    await h.run('DIMASSOC', '1', 'DIMLINEAR', '')
    await h.click(10, 0, l.id)
    await h.run('#10,-8')
    expect((h.ofType('DIMENSION')[0].props as DimensionProps).assoc).toBeUndefined()
  })
})

describe('reassociatePoint (grip de punto de cota)', () => {
  it('soltado sobre otra línea se asocia a ella; en el vacío deja de ser asociativo', async () => {
    const h = makeEngine()
    const l = h.add('LINE', { start: [0, 0, 0], end: [20, 0, 0] }) as LineEntity
    const m = h.add('LINE', { start: [30, 0, 0], end: [30, 10, 0] }) as LineEntity
    await h.run('DIMLINEAR', '')
    await h.click(10, 0, l.id)
    await h.run('#10,-8')
    const d = h.ofType('DIMENSION')[0].props as DimensionProps
    d.points[1] = [30, 10, 0]
    reassociatePoint(d, 1, m, 2)
    expect(d.assoc?.[1]).toEqual({ id: m.id, kind: 'end' })
    m.props.end = [30, 20, 0]
    h.doc.updateAssociativeDims()
    expect(d.points[1]).toEqual([30, 20, 0])
    d.points[0] = [-5, 3, 0]
    reassociatePoint(d, 0, undefined, 2)
    expect(d.assoc?.[0]).toBeNull()
    h.doc.updateAssociativeDims()
    expect(d.points[0]).toEqual([-5, 3, 0])
  })
})
