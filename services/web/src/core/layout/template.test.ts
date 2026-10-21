import { describe, it, expect } from 'vitest'
import { DocumentModel } from '../document/DocumentModel'
import { LayerService } from '../layers/LayerService'
import { activateTab, layoutViewports } from './layouts'
import { paperSizeMm } from './paper'
import {
  addLayoutFromBuiltin,
  addLayoutFromTemplate,
  builtinSheetInit,
  layoutToTemplate,
  parseTemplate,
  templateSheetInit,
} from './template'

/** Dibujo con un layout A2 propio: capa "Rotulo", bloque MI_ROTULO y un viewport ISO a 1:20. */
function source() {
  const doc = DocumentModel.createDefault()
  const rot = new LayerService(doc).create('Rotulo', { color: '#ff0000' })
  doc.setBlock({ name: 'MI_ROTULO', entities: [{ id: 'b1', type: 'RECTANGLE', layer: rot.id, props: { corner: [-100, 0, 0], width: 100, height: 30 } }] })
  activateTab(doc, 'L1', '0', builtinSheetInit('none')!)
  doc.setPageSetup('L1', { ...doc.layouts[0].pageSetup, paper: 'A2' })
  doc.addEntity({ type: 'INSERT', layer: rot.id, props: { name: 'MI_ROTULO', position: [589, 5, 0], scale: [1, 1, 1], rotation: 0 } })
  const [vp] = layoutViewports(doc)
  Object.assign(vp.props, { az: -Math.PI / 4, el: 0.6155, scale: 0.05, frozenLayers: [rot.id] })
  return doc
}

describe('plantillas de layout .cotat', () => {
  it('guardar como plantilla y crear desde plantilla en otro dibujo conserva hoja, rótulo y viewports (criterio 8)', () => {
    const tpl = parseTemplate(JSON.stringify(layoutToTemplate(source(), 'L1', 'Mi A2')))!
    expect(tpl.blocks.map((b) => b.name)).toEqual(['MI_ROTULO'])
    expect(tpl.layers.map((l) => l.name)).toEqual(['0', 'Rotulo'])

    const other = DocumentModel.createDefault()
    other.addEntity({ type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [1000, 0, 0] } })
    const l = addLayoutFromTemplate(other, tpl)
    expect(l.name).toBe('Mi A2')
    expect(paperSizeMm(l.pageSetup)).toEqual({ width: 594, height: 420 })
    expect(l.entities.map((e) => e.type)).toEqual(['VIEWPORT', 'INSERT'])
    const rotulo = other.layers.find((x) => x.name === 'Rotulo')!
    expect(rotulo.color).toBe('#ff0000')
    const vp = l.entities[0]
    expect(vp.type === 'VIEWPORT' && vp.props.frozenLayers).toEqual([rotulo.id])
    expect(vp.type === 'VIEWPORT' && vp.props.az).toBeCloseTo(-Math.PI / 4) // misma vista
    expect(vp.type === 'VIEWPORT' && vp.props.scale).not.toBeCloseTo(0.05) // re-encuadrado al modelo
    expect(other.getBlock('MI_ROTULO')).toBeTruthy()
    expect(l.initialized).toBe(true)
  })

  it('un bloque con el mismo nombre y distinto contenido se renombra; uno idéntico se reutiliza', () => {
    const tpl = layoutToTemplate(source(), 'L1', 'T')
    const other = DocumentModel.createDefault()
    other.setBlock({ name: 'MI_ROTULO', entities: [] })
    const l = addLayoutFromTemplate(other, tpl)
    const ins = l.entities.find((e) => e.type === 'INSERT')!
    expect(ins.type === 'INSERT' && ins.props.name).toBe('MI_ROTULO (2)')
    const again = addLayoutFromTemplate(other, tpl)
    expect(again.name).toBe('T (2)')
    expect(other.blocks.map((b) => b.name)).toEqual(['MI_ROTULO', 'MI_ROTULO (2)'])
  })

  it('plantilla predeterminada: guardada, incluida A4 vertical o ninguna', () => {
    const tpl = layoutToTemplate(source(), 'L1', 'Mi A2')
    const doc = DocumentModel.createDefault()
    activateTab(doc, 'L1', '0', templateSheetInit(tpl))
    expect(doc.layouts[0].pageSetup.paper).toBe('A2')
    expect(doc.layouts[0].entities.map((e) => e.type)).toEqual(['VIEWPORT', 'INSERT'])

    const a4 = addLayoutFromBuiltin(doc, 'builtin:A4P', '0')!
    expect(paperSizeMm(a4.pageSetup)).toEqual({ width: 210, height: 297 })
    expect(a4.entities.map((e) => e.type)).toEqual(['RECTANGLE', 'INSERT', 'VIEWPORT'])
    expect(doc.activeTab).toBe('L1') // vuelve a la pestaña anterior

    const bare = DocumentModel.createDefault()
    activateTab(bare, 'L1', '0', builtinSheetInit('none')!)
    expect(bare.layouts[0].entities.map((e) => e.type)).toEqual(['VIEWPORT'])
  })

  it('un archivo que no es plantilla se rechaza', () => {
    expect(parseTemplate('{"format":"cota"}')).toBeNull()
    expect(parseTemplate('{"format":"ccadt","pageSetup":{},"entities":[]}')?.format).toBe('cotat') // plantilla previa al nombre Cota
    expect(parseTemplate('no json')).toBeNull()
  })
})
