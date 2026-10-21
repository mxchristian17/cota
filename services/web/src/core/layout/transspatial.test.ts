import { describe, it, expect } from 'vitest'
import { makeEngine } from '../../test/engineHarness'
import { dimDisplay, measureDim } from '../dimension/dimGeometry'
import { newViewportProps } from './viewport'
import { annoScaleOf } from './scale'
import { modelToPaperEntity, paperSnapProxies, proxyId } from './transspatial'
import type { DimensionProps, Entity, LineEntity, ViewportEntity } from '../document/types'

describe('trans-espacial', () => {
  it('proxies: el modelo visto por un viewport 1:50 en coordenadas del papel', () => {
    const vp = { ...newViewportProps([100, 100, 0], 200, 150), target: [1000, 0, 0] as [number, number, number], scale: 1 / 50 }
    const line: Entity = { id: 'l', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [2000, 500, 0] } }
    const p = modelToPaperEntity(line, 'v', vp, 'mm') as LineEntity
    expect(p.id).toBe(proxyId('v', 'l'))
    expect(p.props.start).toEqual([80, 100, 0])
    expect(p.props.end).toEqual([120, 110, 0])
    const circle: Entity = { id: 'c', type: 'CIRCLE', layer: '0', props: { center: [1000, 0, 0], radius: 250, normal: [0, 0, 1] } }
    expect(modelToPaperEntity(circle, 'v', vp, 'mm')!.props).toMatchObject({ center: [100, 100, 0], radius: 5 })
    // Visto de canto (FRONT) un círculo horizontal no es un círculo: no hay proxy.
    expect(modelToPaperEntity(circle, 'v', { ...vp, az: -Math.PI / 2, el: 0 }, 'mm')).toBeNull()
    // Fuera del viewport no da snaps.
    const far: Entity = { id: 'f', type: 'LINE', layer: '0', props: { start: [90000, 0, 0], end: [91000, 0, 0] } }
    const vpe: Entity = { id: 'v', type: 'VIEWPORT', layer: '0', props: vp }
    expect(paperSnapProxies([vpe], [line, far], [], [], 'mm').map((e) => e.id)).toEqual(['v>l'])
  })

  it('cota en el papel sobre un viewport 1:50: mide el modelo y lo sigue (criterio 8)', async () => {
    const h = makeEngine()
    const l = h.add('LINE', { start: [0, 0, 0], end: [2000, 0, 0] }) as LineEntity
    h.doc.setActiveTab('L1')
    const vp = h.doc.addEntity({ type: 'VIEWPORT', layer: '0', props: { ...newViewportProps([100, 100, 0], 200, 150), target: [1000, 0, 0], scale: 1 / 50 } }) as ViewportEntity
    await h.run('DIMLINEAR')
    await h.click(80, 100, proxyId(vp.id, l.id))
    await h.click(120, 100, proxyId(vp.id, l.id))
    await h.run('#100,90')
    expect(h.prints).toContain('Dimension text = 2000')
    const d = h.ofType('DIMENSION')[0].props as DimensionProps
    expect(d.assoc?.map((r) => r && { id: r.id, vp: r.vp })).toEqual([{ id: l.id, vp: vp.id }, { id: l.id, vp: vp.id }])
    expect(measureDim(d)).toBeCloseTo(2000, 9)
    // La geometría del modelo cambia: la cota del papel la sigue.
    l.props.end = [3000, 0, 0]
    h.doc.updateAssociativeDims()
    expect(d.points[1]).toEqual([140, 100, 0])
    expect(measureDim(d)).toBeCloseTo(3000, 9)
    // Cambia la escala del viewport: la cota se reubica y sigue midiendo el modelo.
    vp.props.scale = 1 / 100
    h.doc.updateAssociativeDims()
    expect(d.points[0]).toEqual([90, 100, 0])
    expect(measureDim(d)).toBeCloseTo(3000, 9)
  })

  it('anotativa: 2,5 mm de texto en el papel a 1:50 y a 1:100; CANNOSCALE en el modelo (criterio 7)', async () => {
    const h = makeEngine()
    await h.run('DIMLINEAR', '#0,0', '#4000,0', '#2000,500')
    const p = h.ofType('DIMENSION')[0].props as DimensionProps
    p.style = { ...p.style, ANNOTATIVE: true }
    for (const [scale, k] of [[1 / 50, 50], [1 / 100, 100]]) {
      const a = annoScaleOf(scale, 'mm')
      expect(a).toBeCloseTo(k, 9)
      expect(dimDisplay(p, { annoScale: a }).text.height * scale).toBeCloseTo(p.style.DIMTXT, 9)
    }
    await h.run('CANNOSCALE', '1:50')
    expect(h.doc.cannoscale).toBeCloseTo(1 / 50, 12)
    expect(dimDisplay(p).text.height).toBeCloseTo(p.style.DIMTXT * 50, 9)
    await h.run('CANNOSCALE', '1:1')
    expect(dimDisplay(p).text.height).toBeCloseTo(p.style.DIMTXT, 9)
  })
})
