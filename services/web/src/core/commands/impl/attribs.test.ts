import { describe, it, expect, afterEach } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import { attdefJustify } from './attribs'
import { resetSysvars, sysvars } from '../sysvars'
import { expandEntities } from '../../editing/block'
import { applyField, entityFields } from '../../editing/props'
import { exportDxf } from '../../io/dxf'
import { resolveFieldTexts } from '../../fields/context'
import type { Entity, InsertEntity } from '../../document/types'

afterEach(resetSysvars)

const texts = (ents: Entity[]) => ents.flatMap((e) => (e.type === 'TEXT' ? [e.props.text] : []))

/** Bloque PIEZA con 3 atributos (NOMBRE, MATERIAL constante-no, CODIGO preset) y un círculo. */
async function withBlock() {
  const h = makeEngine()
  sysvars.ATTDIA = 0
  await h.run('ATTDEF', '', 'nombre', 'Nombre de la pieza', 'S/N', '#0,10', '2.5', '0')
  await h.run('ATTDEF', '', 'material', '', 'Acero', '#0,5', '', '')
  await h.run('ATTDEF', 'P', '', 'codigo', 'Código', 'X-1', '#0,0', '', '')
  h.add('CIRCLE', { center: [20, 0, 0], radius: 5, normal: [0, 0, 1] })
  h.setSelection(h.doc.entities.map((e) => e.id))
  await h.run('BLOCK', 'PIEZA', '#0,0')
  return h
}

describe('ATTDEF / atributos de bloque', () => {
  it('ATTDEF suelto muestra su tag; BLOCK lo incorpora y la referencia toma los valores por defecto', async () => {
    const h = await withBlock()
    const def = h.doc.getBlock('PIEZA')!
    expect(def.entities.filter((e) => e.type === 'ATTDEF').map((e) => e.type === 'ATTDEF' && e.props.tag)).toEqual(['NOMBRE', 'MATERIAL', 'CODIGO'])
    const [ins] = h.ofType('INSERT') as InsertEntity[]
    expect(ins.props.attributes).toEqual([
      { tag: 'NOMBRE', value: 'S/N' },
      { tag: 'MATERIAL', value: 'Acero' },
      { tag: 'CODIGO', value: 'X-1' },
    ])
    expect(texts(expandEntities([ins], h.doc.blocks))).toEqual(['S/N', 'Acero', 'X-1'])
  })

  it('INSERT pide los valores (Preset no se pregunta); ESC cancela la inserción', async () => {
    const h = await withBlock()
    await h.run('INSERT', 'PIEZA', '#100,0', '', '', '', 'Brida', 'Bronce')
    const ins = (h.ofType('INSERT') as InsertEntity[])[1]
    expect(ins.props.attributes).toEqual([
      { tag: 'NOMBRE', value: 'Brida' },
      { tag: 'MATERIAL', value: 'Bronce' },
      { tag: 'CODIGO', value: 'X-1' },
    ])
    expect(h.prints).toContain('Enter attribute values')
    // Con el diálogo (ATTDIA=1) cancelado no se crea la referencia.
    sysvars.ATTDIA = 1
    await h.run('INSERT', 'PIEZA', '#200,0', '', '', '')
    expect(h.ofType('INSERT')).toHaveLength(2)
    // El diálogo no aparece sin aviso (R11).
    expect(h.prints).toContain('Enter the attribute values of "PIEZA" in the Edit Attributes dialog (ATTDIA = 1; set ATTDIA to 0 to type them here).')
  })

  it('invisibles, constantes y ATTDISP Normal/ON/OFF', async () => {
    const h = makeEngine()
    sysvars.ATTDIA = 0
    await h.run('ATTDEF', 'I', '', 'oculto', '', 'secreto', '#0,0', '', '')
    await h.run('ATTDEF', 'C', '', 'fijo', 'Rev A', '#0,5', '', '')
    h.setSelection(h.doc.entities.map((e) => e.id))
    await h.run('BLOCK', 'B', '#0,0')
    const [ins] = h.ofType('INSERT') as InsertEntity[]
    expect(ins.props.attributes).toEqual([{ tag: 'OCULTO', value: 'secreto' }]) // la constante no se guarda
    expect(texts(expandEntities([ins], h.doc.blocks))).toEqual(['Rev A'])
    await h.run('ATTDISP', 'ON')
    expect(texts(expandEntities([ins], h.doc.blocks, { attdisp: h.doc.attdisp }))).toEqual(['secreto', 'Rev A'])
    await h.run('ATTDISP', 'OFF')
    expect(texts(expandEntities([ins], h.doc.blocks, { attdisp: h.doc.attdisp }))).toEqual([])
  })

  it('ATTEDIT y la paleta editan valores; los campos dentro de un atributo se evalúan', async () => {
    const h = await withBlock()
    const [ins] = h.ofType('INSERT') as InsertEntity[]
    await h.run('ATTEDIT')
    await h.click(0, 10, ins.id)
    await h.run('Eje', '', '%<\\AcVar LayoutName>%')
    expect(ins.props.attributes!.map((a) => a.value)).toEqual(['Eje', 'Acero', '%<\\AcVar LayoutName>%'])
    expect(entityFields(ins).find((f) => f.key === 'attr:MATERIAL')?.value).toBe('Acero')
    applyField(ins, 'attr:MATERIAL', 'Aluminio')
    const ctx = { fileName: 'a.cota', meta: {}, layoutName: 'Layout1', sheetNumber: 1, sheetCount: 1, viewportScale: '' }
    expect(texts(resolveFieldTexts(expandEntities([ins], h.doc.blocks), ctx))).toEqual(['Eje', 'Aluminio', 'Layout1'])
  })

  it('redefinir con un atributo más + ATTSYNC lo agrega sin perder los valores (criterio 12)', async () => {
    const h = await withBlock()
    const [ins] = h.ofType('INSERT') as InsertEntity[]
    ins.props.attributes![0].value = 'Brida'
    // Redefinición: se explota, se agrega un ATTDEF y se vuelve a definir con el mismo nombre.
    h.setSelection([ins.id])
    await h.run('EXPLODE')
    expect(h.ofType('ATTDEF')).toHaveLength(3) // EXPLODE devuelve los ATTDEF (se ve el tag)
    await h.run('ATTDEF', '', 'peso', '', '0 kg', '#0,-5', '', '')
    h.setSelection(h.doc.entities.map((e) => e.id))
    await h.run('BLOCK', 'PIEZA', '#0,0')
    const other = h.add('INSERT', { name: 'PIEZA', position: [50, 0, 0], scale: [1, 1, 1], rotation: 0, attributes: [{ tag: 'NOMBRE', value: 'Tapa' }, { tag: 'VIEJO', value: 'x' }] }) as InsertEntity
    await h.run('ATTSYNC', 'N', 'pieza')
    expect(h.prints.at(-1)).toBe('ATTSYNC block PIEZA: 2 block reference(s) synchronized.')
    expect(other.props.attributes).toEqual([
      { tag: 'NOMBRE', value: 'Tapa' },
      { tag: 'MATERIAL', value: 'Acero' },
      { tag: 'CODIGO', value: 'X-1' },
      { tag: 'PESO', value: '0 kg' },
    ])
  })

  it('el DXF exporta los atributos como TEXT y un ATTDEF suelto con su tag', async () => {
    const h = await withBlock()
    h.add('ATTDEF', { position: [0, 0, 0], height: 2.5, rotation: 0, justify: 'left', normal: [0, 0, 1], tag: 'SUELTO', prompt: '', value: '' })
    const dxf = exportDxf(expandEntities(h.doc.entities, h.doc.blocks), h.doc.layers)
    for (const t of ['S/N', 'Acero', 'X-1', 'SUELTO']) expect(dxf).toContain(`\n${t}\n`)
  })
})

describe('ATTDEF en un bloque con base fuera del origen (R08) y justificación Middle (R09)', () => {
  it('BLOCK lleva el atributo a coordenadas del bloque: la inserción lo dibuja dentro del círculo', async () => {
    const h = makeEngine()
    sysvars.ATTDIA = 0
    await h.run('CIRCLE', '300,300', '5')
    await h.run('ATTDEF', '', 'TAG', 'Valor', 'X', 'J', 'C', '300,298', '3', '0')
    await h.run('BLOCK', 'L', '305,300', '', 'B1', '300,300')
    const def = h.doc.getBlock('B1')!
    const att = def.entities.find((e) => e.type === 'ATTDEF')!
    expect(att.type === 'ATTDEF' && att.props.position).toEqual([0, -2, 0])
    await h.run('INSERT', 'B1', '400,300', '1', '', '0', '7')
    const out = expandEntities(h.ofType('INSERT'), h.doc.blocks)
    const seven = out.find((e) => e.type === 'TEXT' && e.props.text === '7')!
    expect(seven.type === 'TEXT' && seven.props.position).toEqual([400, 298, 0])
  })

  it('MOVE y SCALE de un ATTDEF suelto lo mueven (antes quedaba quieto)', async () => {
    const h = makeEngine()
    sysvars.ATTDIA = 0
    await h.run('ATTDEF', '', 'N', '', '1', '10,10', '2', '0')
    await h.run('MOVE', 'L', '', '0,0', '5,0')
    const a = h.ofType('ATTDEF')[0]
    expect(a.type === 'ATTDEF' && a.props.position).toEqual([15, 10, 0])
  })

  it('Middle/MC centra el número en el punto (globo): la caja del texto queda centrada', async () => {
    const h = makeEngine()
    sysvars.ATTDIA = 0
    await h.run('ATTDEF', '', 'NUM', '', '1', 'J', 'MC', '50,50', '4', '0')
    const a = h.ofType('ATTDEF')[0]
    if (a.type !== 'ATTDEF') throw new Error('sin ATTDEF')
    expect(a.props.justify).toBe('center')
    expect(a.props.kind).toBe('text')
    // Línea base 2 por debajo del punto (la mitad del alto): el texto queda centrado en 50,50.
    expect(a.props.position[0]).toBeCloseTo(50)
    expect(a.props.position[1]).toBeCloseTo(48)
    expect(attdefJustify('M')).toEqual({ justify: 'center', drop: 0.5 })
    expect(attdefJustify('TR')).toEqual({ justify: 'right', drop: 1 })
    expect(attdefJustify('zz')).toBeNull()
  })
})
