import { describe, it, expect } from 'vitest'
import { DocumentModel } from '../document/DocumentModel'
import { makeEngine } from '../../test/engineHarness'
import { evaluateFields, fieldCode, fieldSegments, formatDate, hasFields, type FieldContext } from './fields'
import { fieldContextFor, resolveFieldTexts } from './context'
import { activateTab, layoutViewports } from '../layout/layouts'

const ctx: FieldContext = {
  fileName: 'planta.cota',
  meta: { title: 'Casa', author: 'C. Orengia', modified: '2026-10-12T15:30:00', custom: { Obra: 'Lote 7' } },
  layoutName: 'Layout1',
  sheetNumber: 1,
  sheetCount: 3,
  viewportScale: '1:50',
}

describe('campos', () => {
  it('evalúa las variables del CAD clásico; sin valor ----, desconocido ####', () => {
    const t = 'Hoja %<\\AcVar SheetNumber>% de %<\\AcVar SheetCount>% — %<\\AcVar Title>% (%<\\AcVar Subject>%) %<\\AcVar Nope>%'
    expect(hasFields(t)).toBe(true)
    expect(evaluateFields(t, ctx)).toBe('Hoja 1 de 3 — Casa (----) ####')
    expect(evaluateFields(fieldCode('CustomDP.Obra'), ctx)).toBe('Lote 7')
    expect(evaluateFields('%<\\AcVar ctab>% %<\\AcVar ViewportScale>%', ctx)).toBe('Layout1 1:50')
    expect(evaluateFields('sin campos', ctx)).toBe('sin campos')
  })

  it('Filename con y sin extensión; fechas dd/MM/yyyy por defecto o con formato', () => {
    expect(evaluateFields(fieldCode('Filename'), ctx)).toBe('planta.cota')
    expect(evaluateFields(fieldCode('Filename', 'noext'), ctx)).toBe('planta')
    expect(evaluateFields(fieldCode('SaveDate'), ctx)).toBe('12/10/2026')
    expect(evaluateFields(fieldCode('SaveDate', 'yyyy-MM-dd HH:mm'), ctx)).toBe('2026-10-12 15:30')
    expect(evaluateFields(fieldCode('PlotDate'), ctx)).toBe('----')
    expect(formatDate('basura')).toBe('----')
  })

  it('los tramos marcan qué es campo (fondo gris en pantalla)', () => {
    expect(fieldSegments('Esc. %<\\AcVar ViewportScale>%', ctx)).toEqual([
      { text: 'Esc. ', field: false },
      { text: '1:50', field: true },
    ])
  })

  it('el contexto sale del documento: layout, hoja, escala del primer viewport; resolveFieldTexts para PLOT', () => {
    const doc = DocumentModel.createDefault()
    doc.addLayout('Cortes')
    activateTab(doc, doc.layouts[1].id, '0')
    layoutViewports(doc)[0].props.scale = 0.02
    const c = fieldContextFor(doc, 'a.cota', doc.layouts[1].id)
    expect(c).toMatchObject({ layoutName: 'Cortes', sheetNumber: 2, sheetCount: 2, viewportScale: '1:50' })
    expect(fieldContextFor(doc, 'a.cota', 'MODEL')).toMatchObject({ layoutName: 'Model', sheetNumber: 0 })
    expect(doc.meta.created).toBeTruthy() // fecha de creación del dibujo nuevo
    const [t] = resolveFieldTexts(
      [{ id: 't', type: 'TEXT', layer: '0', props: { position: [0, 0, 0], text: fieldCode('LayoutName'), height: 2.5, rotation: 0, justify: 'left', normal: [0, 0, 1] } }],
      c,
    )
    expect(t.type === 'TEXT' && t.props.text).toBe('Cortes')
  })

  it('FIELD crea un texto con el código; Object lo agrega a un texto existente', async () => {
    const h = makeEngine()
    await h.run('FIELD', 'Title', '#10,10', '5', '0')
    const [t] = h.ofType('TEXT')
    expect(t.type === 'TEXT' && t.props).toMatchObject({ text: '%<\\AcVar Title>%', height: 5 })
    await h.run('FIELD', 'SaveDate', 'yyyy', 'O')
    await h.click(10, 10, t.id)
    expect(t.type === 'TEXT' && t.props.text).toBe('%<\\AcVar Title>%%<\\AcVar SaveDate \\f "yyyy">%')
    await h.run('FIELD', 'CustomDP', 'Obra', '#0,0', '', '')
    // Enter repite TEXTSIZE (el alto 5 del primer FIELD, guardado en el dibujo).
    expect(h.ofType('TEXT')[1].props).toMatchObject({ text: '%<\\AcVar CustomDP.Obra>%', height: 5 })
  })
})
