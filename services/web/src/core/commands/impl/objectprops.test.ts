import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import { exportDxf, importDxf } from '../../io/dxf'
import { strokeStyleOps } from '../../io/pdf'
import { matchProperties } from './matchprop'
import type { Entity, Layer } from '../../document/types'

describe('Color y grosor por objeto', () => {
  it('COLOR y LWEIGHT fijan CECOLOR/CELWEIGHT; los objetos nuevos los toman y las copias conservan los suyos', async () => {
    const h = makeEngine()
    await h.run('COLOR', 'red', 'LWEIGHT', '0.5')
    expect(h.doc.vars.CECOLOR).toBe('#ff0000')
    expect(h.doc.vars.CELWEIGHT).toBe(0.5)
    await h.run('LINE', '0,0', '@10,0', '')
    const l = h.doc.entities.at(-1)!
    expect([l.color, l.lineWeight]).toEqual(['#ff0000', 0.5])
    await h.run('COLOR', 'ByLayer', 'LWEIGHT', 'ByLayer')
    await h.run('COPY', 'L', '', '0,0', '@0,5', '')
    const c = h.doc.entities.at(-1)!
    expect([c.color, c.lineWeight]).toEqual(['#ff0000', 0.5]) // la copia es igual al original
    await h.run('LINE', '0,0', '@0,10', '')
    const n = h.doc.entities.at(-1)!
    expect([n.color, n.lineWeight]).toEqual([undefined, undefined]) // ByLayer
  })

  it('LWEIGHT redondea al estándar más cercano; COLOR acepta índice, #rrggbb y r,g,b', async () => {
    const h = makeEngine()
    await h.run('LWEIGHT', '0.33', 'COLOR', '30')
    expect(h.doc.vars.CELWEIGHT).toBe(0.35)
    expect(h.doc.vars.CECOLOR).toMatch(/^#[0-9a-f]{6}$/)
    await h.run('COLOR', '10,20,30')
    expect(h.doc.vars.CECOLOR).toBe('#0a141e')
  })

  it('DXF lleva 62/420/370 y vuelve igual; el PDF usa el color y el grosor del objeto', () => {
    const layers: Layer[] = [{ id: '0', name: '0', color: '#ffffff', lineWeight: 0.25, lineType: 'CONTINUOUS', locked: false, visible: true, printable: true }]
    const e: Entity = { id: 'a', type: 'LINE', layer: '0', color: '#123456', lineWeight: 0.7, props: { start: [0, 0, 0], end: [1, 0, 0] } }
    const dxf = exportDxf([e], layers)
    expect(dxf).toMatch(/\n370\n70\n/)
    expect(dxf).toMatch(/\n420\n/)
    const back = importDxf(dxf).entities[0]
    expect([back.color, back.lineWeight]).toEqual(['#123456', 0.7])
    expect(strokeStyleOps(layers[0], undefined, e)).toContain('0.071 0.204 0.337 RG')
    expect(strokeStyleOps(layers[0], undefined, e)).toContain(`${(0.7 * 72 / 25.4).toFixed(3).replace(/0+$/, '')} w`)
  })

  it('MATCHPROP copia color y grosor', () => {
    const h = makeEngine()
    const src = h.add('LINE', { start: [0, 0, 0], end: [1, 0, 0] })
    src.color = '#00ff00'
    src.lineWeight = 0.3
    const dst = h.add('LINE', { start: [0, 1, 0], end: [1, 1, 0] })
    expect(matchProperties(h.doc, src, dst)).toBe(true)
    expect([dst.color, dst.lineWeight]).toEqual(['#00ff00', 0.3])
  })
})
