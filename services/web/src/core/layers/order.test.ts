import { describe, it, expect } from 'vitest'
import type { Entity, Layer } from '../document/types'
import { DocumentModel } from '../document/DocumentModel'
import { exportPdf } from '../io/pdf'
import { byLayerOrder, drawOrder, moveLayerTo } from './order'

const layer = (id: string, color = '#ffffff'): Layer => ({ id, name: id, color, lineWeight: 0.25, lineType: 'CONTINUOUS', locked: false, visible: true, printable: true })
const line = (id: string, layerId: string): Entity => ({ id, type: 'LINE', layer: layerId, props: { start: [0, 0, 0], end: [10, 0, 0] } })

describe('orden de capas', () => {
  it('la primera capa de la lista es la de más arriba', () => {
    const o = drawOrder([layer('A'), layer('B'), layer('C')])
    expect(o.get('A')).toBeGreaterThan(o.get('B')!)
    expect(o.get('B')).toBeGreaterThan(o.get('C')!)
  })

  it('byLayerOrder emite de abajo hacia arriba y es estable dentro de la capa', () => {
    const ls = [layer('A'), layer('B')]
    const es = [line('1', 'A'), line('2', 'B'), line('3', 'A'), line('4', 'B')]
    expect(byLayerOrder(es, ls).map((e) => e.id)).toEqual(['2', '4', '1', '3'])
  })

  it('moveLayerTo reordena y la capa de respaldo sigue siendo la 0', () => {
    const doc = DocumentModel.createDefault()
    const data = doc.toJSON()
    data.layers.push(layer('L1'), layer('L2'))
    doc.load(data)
    expect(moveLayerTo(doc.layers, 'L2', 0)).toBe(true)
    expect(doc.layers.map((l) => l.id)).toEqual(['L2', '0', 'L1'])
    expect(doc.firstLayerId).toBe('0')
    expect(moveLayerTo(doc.layers, 'L2', 0)).toBe(false)
    moveLayerTo(doc.layers, 'L2', 99)
    expect(doc.layers.map((l) => l.id)).toEqual(['0', 'L1', 'L2'])
  })

  it('el PDF pinta la capa de arriba al final', () => {
    const ls = [layer('A', '#ff0000'), layer('B', '#0000ff')]
    const pdf = new TextDecoder('latin1').decode(exportPdf([line('1', 'A'), line('2', 'B')], ls).bytes)
    const red = pdf.indexOf('1 0 0 RG')
    const blue = pdf.indexOf('0 0 1 RG')
    expect(red).toBeGreaterThan(-1)
    expect(blue).toBeGreaterThan(-1)
    expect(blue).toBeLessThan(red) // B (abajo) primero, A (arriba) encima
  })
})
