import { describe, expect, it } from 'vitest'
import type { Entity } from '../document/types'
import type { Vec3 } from '../math'
import { alignDrawingViews, autoViewScale, parseScale, projectedBasis, scaleLabel, viewBasis, type DrawingViewData } from './views'

const close = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9))

describe('vistas de dibujo', () => {
  const front = viewBasis('FRONT')

  it('primer diedro (ISO E / IRAM): a la derecha de la frontal va la vista lateral izquierda; arriba, la inferior', () => {
    const right = projectedBasis(front, 100, 0, 'first')
    expect(right.align).toBe('h')
    close(right.basis.out, [-1, 0, 0]) // se mira desde la izquierda (−X)
    const above = projectedBasis(front, 0, 80, 'first')
    expect(above.align).toBe('v')
    close(above.basis.out, [0, 0, -1]) // vista inferior
    const below = projectedBasis(front, 0, -80, 'first')
    close(below.basis.out, [0, 0, 1]) // debajo de la frontal, la planta (vista superior)
    close(below.basis.right, [1, 0, 0])
    close(below.basis.up, [0, 1, 0])
  })

  it('tercer diedro (ISO A): a la derecha, la lateral derecha; arriba, la planta', () => {
    const right = projectedBasis(front, 100, 0, 'third')
    close(right.basis.out, [1, 0, 0])
    close(right.basis.right, [0, 1, 0])
    close(right.basis.up, [0, 0, 1])
    const above = projectedBasis(front, 0, 80, 'third')
    close(above.basis.out, [0, 0, 1])
  })

  it('en diagonal, isométrica', () => {
    const iso = projectedBasis(front, 90, 90, 'third')
    expect(iso.align).toBe('free')
    const o = iso.basis.out
    expect(o[0]).toBeGreaterThan(0)
    expect(o[1]).toBeLessThan(0)
    expect(o[2]).toBeGreaterThan(0)
  })

  it('escala automática: la mayor estándar que entra en un tercio del papel', () => {
    expect(autoViewScale(100, 50, 420, 297)).toBe(1) // 100 ≤ 140 y 50 ≤ 99
    expect(autoViewScale(300, 50, 420, 297)).toBe(1 / 2.5)
    expect(autoViewScale(20, 10, 420, 297)).toBe(5)
    expect(scaleLabel(0.5)).toBe('1:2')
    expect(scaleLabel(2)).toBe('2:1')
    expect(parseScale('1:5')).toBeCloseTo(0.2, 12)
    expect(parseScale('2x')).toBe(2)
    expect(parseScale('nada')).toBeNull()
  })

  it('una proyectada sigue a su madre y sólo se corre a lo largo de su alineación', () => {
    const view = (over: Partial<DrawingViewData>): DrawingViewData => ({ orientation: 'FRONT', basis: front, hidden: 'visible', source: null, ...over })
    const base = { id: 'b', type: 'INSERT', layer: '0', props: { name: '*VIEW1', position: [100, 100, 0], scale: [0.5, 0.5, 0.5], rotation: 0, view: view({}) } } as Entity
    const side = {
      id: 's',
      type: 'INSERT',
      layer: '0',
      props: { name: '*VIEW2', position: [200, 100, 0], scale: [0.5, 0.5, 0.5], rotation: 0, view: view({ orientation: 'projected', parent: 'b', align: 'h', offset: [100, 0], lastParent: [100, 100], inheritScale: true }) },
    } as Entity
    const es = [base, side]
    // Se mueve la madre: la hija la acompaña.
    ;(base.props as { position: Vec3 }).position = [120, 130, 0]
    expect(alignDrawingViews(es)).toBe(true)
    close((side.props as { position: Vec3 }).position, [220, 130, 0])
    // Se mueve la hija en diagonal: sólo vale el corrimiento horizontal.
    ;(side.props as { position: Vec3 }).position = [260, 170, 0]
    alignDrawingViews(es)
    close((side.props as { position: Vec3 }).position, [260, 130, 0])
    // La madre cambia de escala: la hija la hereda y su distancia se escala.
    ;(base.props as { scale: Vec3 }).scale = [1, 1, 1]
    alignDrawingViews(es)
    expect((side.props as { scale: Vec3 }).scale[0]).toBe(1)
    close((side.props as { position: Vec3 }).position, [400, 130, 0])
  })
})
