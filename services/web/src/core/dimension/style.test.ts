import { describe, it, expect } from 'vitest'
import { DocumentModel } from '../document/DocumentModel'
import type { DimensionProps, DocumentData } from '../document/types'
import { makeEngine } from '../../test/engineHarness'
import { BUILTIN_DIM_VARS, DEFAULT_DIM_STYLE_NAME, parseDimVar } from './style'

const dimOf = (h: ReturnType<typeof makeEngine>, i = 0) => h.ofType('DIMENSION')[i].props as DimensionProps

describe('estilos de cota (/E4)', () => {
  it('un dibujo nuevo trae los estilos incluidos e IRAM 4513 como actual', () => {
    const doc = DocumentModel.createDefault()
    expect(doc.dimStyles.map((s) => s.name)).toEqual(['IRAM 4513', 'IRAM 4511', 'ISO-25', 'Standard'])
    expect(doc.currentDimStyle).toBe(DEFAULT_DIM_STYLE_NAME)
  })

  it('criterio 11: un .cota previo migra sus cotas a Standard con overrides y mismo valor', () => {
    const data = DocumentModel.createDefault().toJSON()
    delete data.dimStyles
    delete data.dimStyle
    data.entities.push({
      id: 'e1',
      type: 'DIMENSION',
      layer: '0',
      props: { dimType: 'LINEAR', points: [[0, 0, 0], [10, 0, 0]], textPos: [5, 5, 0], style: { textHeight: 5, arrowSize: 3, precision: 1, unitScale: 1 } },
    } as unknown as DocumentData['entities'][number])
    const doc = DocumentModel.fromJSON(data)
    const d = doc.entities[0].props as DimensionProps
    expect(d.styleName).toBe('Standard')
    expect(d.style.DIMTXT).toBe(5)
    expect(d.style.DIMASZ).toBe(3)
    expect(d.style.DIMDEC).toBe(1)
    expect(d.style.DIMDSEP).toBe('.')
    expect(doc.currentDimStyle).toBe('Standard') // las cotas nuevas se ven como las viejas
  })

  it('criterio 1: modificar el estilo actualiza sus cotas; la que tiene override lo conserva', async () => {
    const h = makeEngine()
    await h.run('DIMLINEAR', '#0,0', '#10,0', '#5,5')
    await h.run('DIMLINEAR', '#0,10', '#10,10', '#5,15')
    h.doc.restyleDimension(dimOf(h, 1), undefined, { DIMTXT: 5 })
    const def = h.doc.dimStyleDef('IRAM 4513')!
    h.doc.saveDimStyle({ name: def.name, vars: { ...def.vars, DIMTXT: 3.5, DIMBLK1: '_OBLIQUE', DIMBLK2: '_OBLIQUE' } })
    expect(dimOf(h, 0).style.DIMTXT).toBe(3.5)
    expect(dimOf(h, 1).style.DIMTXT).toBe(5)
    expect(dimOf(h, 1).style.DIMBLK1).toBe('_OBLIQUE')
  })

  it('variables DIM* como comandos: override del estilo actual para las cotas nuevas', async () => {
    const h = makeEngine()
    await h.run('DIMTXT', '3.5')
    await h.run('DIMLINEAR', '#0,0', '#10,0', '#5,5')
    expect(dimOf(h).style.DIMTXT).toBe(3.5)
    expect(dimOf(h).overrides).toEqual({ DIMTXT: 3.5 })
    await h.run('DIMBLK1', 'oblique')
    expect(h.doc.dimOverrides.DIMBLK1).toBe('_OBLIQUE')
    await h.run('DIMTAD', '7')
    expect(h.prints.some((p) => p.includes('Invalid value for DIMTAD'))).toBe(true)
  })

  it('-DIMSTYLE: Save, Restore y Apply', async () => {
    const h = makeEngine()
    await h.run('DIMLINEAR', '#0,0', '#10,0', '#5,5')
    await h.run('DIMDEC', '3')
    await h.run('-DIMSTYLE', 'S', 'Mio')
    expect(h.doc.currentDimStyle).toBe('Mio')
    expect(h.doc.dimStyleDef('Mio')!.vars.DIMDEC).toBe(3)
    await h.run('-DIMSTYLE', 'R', 'ISO-25')
    expect(h.doc.currentDimStyle).toBe('ISO-25')
    const id = h.ofType('DIMENSION')[0].id
    h.setSelection([id])
    await h.run('-DIMSTYLE', 'A')
    expect(dimOf(h).styleName).toBe('ISO-25')
  })

  it('borrar un estilo en uso o el actual falla; renombrar arrastra sus cotas', async () => {
    const h = makeEngine()
    await h.run('DIMLINEAR', '#0,0', '#10,0', '#5,5')
    expect(() => h.doc.deleteDimStyle('IRAM 4513')).toThrow()
    h.doc.renameDimStyle('IRAM 4513', 'Mecánica')
    expect(dimOf(h).styleName).toBe('Mecánica')
    expect(h.doc.currentDimStyle).toBe('Mecánica')
    h.doc.deleteDimStyle('ISO-25')
    expect(h.doc.dimStyleDef('ISO-25')).toBeUndefined()
  })

  it('parseDimVar valida tipos', () => {
    expect(parseDimVar('DIMTXT', '2,5')).toEqual({ value: 2.5 })
    expect(parseDimVar('DIMTIX', 'on')).toEqual({ value: true })
    expect(parseDimVar('DIMCLRD', 'ByLayer')).toEqual({ value: null })
    expect(parseDimVar('DIMTAD', '3')).toBeNull()
    expect(BUILTIN_DIM_VARS['ISO-25'].DIMDSEP).toBe(',')
  })
})
