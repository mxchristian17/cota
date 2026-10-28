import { describe, it, expect } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import { LayerService } from '../../layers/LayerService'
import { layerShown } from '../../layers/visibility'
import { importDxf, exportDxf } from '../../io/dxf'
import { matchLayers, parseColor } from './layertools'

/** Dibujo con capas A, B y MUROS-1, y una línea en cada una. */
function setup() {
  const h = makeEngine()
  const svc = new LayerService(h.doc)
  const a = svc.create('A')
  const b = svc.create('B')
  const m = svc.create('MUROS-1')
  const la = h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] }, a.id)
  const lb = h.add('LINE', { start: [0, 10, 0], end: [10, 10, 0] }, b.id)
  const lay = (name: string) => h.doc.layers.find((l) => l.name === name)!
  return { h, a, b, m, la, lb, lay }
}

describe('Freeze de capas', () => {
  it('layerShown: apagada o congelada ocultan; la capa actual no se congela', async () => {
    const { h, lay } = setup()
    expect(layerShown(lay('A'))).toBe(true)
    await h.run('-LAYER', 'F', 'A', '')
    expect(lay('A').frozen).toBe(true)
    expect(layerShown(lay('A'))).toBe(false)
    await h.run('-LAYER', 'F', '0', '')
    expect(lay('0').frozen).toBeUndefined()
    expect(h.prints.some((l) => /Cannot freeze layer "0"\. It is the CURRENT layer/.test(l))).toBe(true)
    await h.run('-LAYER', 'T', '*', '')
    expect(lay('A').frozen).toBeUndefined()
  })

  it('-LAYER Set no hace actual una capa congelada; Make crea y hace actual', async () => {
    const { h, lay } = setup()
    await h.run('-LAYER', 'F', 'B', 'S', 'B', '')
    expect(h.currentLayer()).toBe('0')
    expect(h.prints.some((l) => /Cannot set frozen layer "B" current/.test(l))).toBe(true)
    await h.run('-LAYER', 'M', 'COTAS', '')
    expect(h.currentLayer()).toBe(lay('COTAS').id)
  })

  it('-LAYER: listas con comodines, ON/OFF, LOck/Unlock, Color, LWeight, Plot y ?', async () => {
    const { h, lay } = setup()
    await h.run('-LAYER', 'OFF', 'A,MUROS*', '')
    expect([lay('A').visible, lay('MUROS-1').visible, lay('B').visible]).toEqual([false, false, true])
    await h.run('-LAYER', 'ON', '*', 'LO', 'B', 'C', 'red', 'B', 'LW', '0.5', 'B', 'P', 'N', 'B', '')
    expect(lay('A').visible).toBe(true)
    expect(lay('B')).toMatchObject({ locked: true, color: '#ff0000', lineWeight: 0.5, printable: false })
    await h.run('-LAYER', '?', '*', '')
    expect(h.prints.some((l) => /MUROS-1/.test(l) && /Thawed/.test(l))).toBe(true)
    // Apagar la actual pregunta; con No queda encendida.
    await h.run('-LAYER', 'OFF', '0', 'N', '')
    expect(lay('0').visible).toBe(true)
  })

  it('LAYFRZ / LAYOFF con Undo, LAYTHW, LAYON, LAYLCK, LAYULK y LAYMCUR', async () => {
    const { h, la, lb, lay } = setup()
    await h.run('LAYFRZ')
    await h.click(5, 0, la.id)
    await h.click(5, 10, lb.id)
    await h.run('U', '')
    expect([lay('A').frozen, lay('B').frozen]).toEqual([true, undefined])
    await h.run('LAYTHW')
    expect(lay('A').frozen).toBeUndefined()
    await h.run('LAYOFF')
    await h.click(5, 0, la.id)
    await h.run('')
    expect(lay('A').visible).toBe(false)
    await h.run('LAYON')
    expect(lay('A').visible).toBe(true)
    await h.run('LAYLCK')
    await h.click(5, 10, lb.id)
    await h.run('')
    expect(lay('B').locked).toBe(true)
    await h.run('LAYULK')
    await h.click(5, 10, lb.id)
    await h.run('')
    expect(lay('B').locked).toBe(false)
    await h.run('LAYMCUR')
    await h.click(5, 10, lb.id)
    expect(h.currentLayer()).toBe(lay('B').id)
  })

  it('LAYISO aísla las capas de la selección (y hace actual la primera); LAYUNISO restaura', async () => {
    const { h, la, lay } = setup()
    new LayerService(h.doc).setLocked(lay('B').id, true)
    h.setSelection([la.id])
    await h.run('LAYISO')
    expect(h.doc.layers.map((l) => [l.name, l.visible])).toEqual([['0', false], ['A', true], ['B', false], ['MUROS-1', false]])
    expect(h.currentLayer()).toBe(lay('A').id)
    await h.run('LAYUNISO')
    expect(h.doc.layers.every((l) => l.visible)).toBe(true)
    expect(lay('B').locked).toBe(true)
    await h.run('LAYUNISO')
    expect(h.prints.at(-1)).toMatch(/No layers have been isolated/)
  })

  it('una ventana sobre objetos de una capa bloqueada no los toma y lo avisa', async () => {
    const { h, lay } = setup()
    new LayerService(h.doc).setLocked(lay('B').id, true)
    await h.run('ERASE', 'C', '-1,-1', '20,30')
    expect(h.prints.some((p) => /1 was on a locked layer/.test(p))).toBe(true)
    await h.run('')
    expect(h.doc.entities.filter((e) => e.layer === lay('B').id)).toHaveLength(1)
  })

  it('el estado congelado viaja en el DXF (bit 1 del código 70)', () => {
    const { h } = setup()
    const svc = new LayerService(h.doc)
    svc.setFrozen(h.doc.layers.find((l) => l.name === 'A')!.id, true)
    const back = importDxf(exportDxf([], h.doc.layers)).layers
    expect(back.find((l) => l.name === 'A')?.frozen).toBe(true)
    expect(back.find((l) => l.name === 'B')?.frozen).toBe(false)
  })

  it('matchLayers y parseColor', () => {
    const { h } = setup()
    expect(matchLayers(h.doc.layers, 'a, mu*').map((l) => l.name)).toEqual(['A', 'MUROS-1'])
    expect(matchLayers(h.doc.layers, '?').map((l) => l.name)).toEqual(['0', 'A', 'B'])
    expect(parseColor('1')).toBe('#ff0000')
    expect(parseColor('#00FF00')).toBe('#00ff00')
    expect(parseColor('0,128,255')).toBe('#0080ff')
    expect(parseColor('azul')).toBeNull()
  })
})
