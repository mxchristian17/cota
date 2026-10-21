import { describe, it, expect } from 'vitest'
import { computeTracking, type TrackingSettings } from './tracking'
import { pt, type Pt } from '../math'
import type { Entity } from '../document/types'

// Proyección identidad (1 unidad = 1 píxel) y ejes del UCS mundo.
const settings = (cursor: Pt, over: Partial<TrackingSettings> = {}): TrackingSettings => ({
  cursorPx: [cursor.x, cursor.y],
  project: (p) => [p.x, p.y],
  pixelThreshold: 5,
  axes: [pt(1, 0, 0), pt(0, 1, 0)],
  lineLength: 100,
  ...over,
})

describe('computeTracking (OTRACK)', () => {
  const acquired = pt(10, 20, 0)

  it('sin puntos adquiridos no captura nada', () => {
    const c = pt(10, 60)
    expect(computeTracking(c, [], settings(c))).toBeNull()
  })

  it('captura sobre la alineación vertical del punto adquirido', () => {
    const c = pt(12, 60) // 2 px a la derecha de x = 10
    const r = computeTracking(c, [acquired], settings(c))
    expect(r).not.toBeNull()
    expect(r!.point.x).toBeCloseTo(10)
    expect(r!.point.y).toBeCloseTo(60)
    expect(r!.lines).toHaveLength(1)
  })

  it('no captura si el cursor está lejos de las alineaciones', () => {
    const c = pt(40, 60)
    expect(computeTracking(c, [acquired], settings(c))).toBeNull()
  })

  it('captura el cruce de dos alineaciones (X de un punto, Y de otro)', () => {
    const second = pt(70, 90, 0)
    const c = pt(12, 88) // cerca de x=10 (vertical de A) y de y=90 (horizontal de B)
    const r = computeTracking(c, [acquired, second], settings(c))
    expect(r).not.toBeNull()
    expect(r!.point.x).toBeCloseTo(10)
    expect(r!.point.y).toBeCloseTo(90)
    expect(r!.lines).toHaveLength(2)
  })

  it('captura el cruce de una alineación con un objeto existente', () => {
    // Línea oblicua que cruza x = 10 en y = 55.
    const e: Entity = { id: 'l', type: 'LINE', layer: '0', props: { start: [0, 45, 0], end: [20, 65, 0] } }
    const c = pt(11, 56)
    const r = computeTracking(c, [acquired], settings(c, { entities: [e] }))
    expect(r).not.toBeNull()
    expect(r!.point.x).toBeCloseTo(10)
    expect(r!.point.y).toBeCloseTo(55)
  })

  it('usa los ejes que se le pasen (plano de construcción frontal: X/Z)', () => {
    const c = pt(10, 0)
    const r = computeTracking(pt(10, 0, 40), [pt(10, 0, 0)], {
      ...settings(c),
      axes: [pt(1, 0, 0), pt(0, 0, 1)],
      project: (p) => [p.x, p.z], // vista frontal: la pantalla muestra X/Z
      cursorPx: [12, 40],
    })
    expect(r).not.toBeNull()
    expect(r!.point.z).toBeCloseTo(40)
    expect(r!.point.x).toBeCloseTo(10)
  })
})
