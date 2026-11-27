import { describe, expect, it } from 'vitest'
import { importDxf } from './dxf'
import { attachXref, xrefCandidates, xrefFileName, xrefsOf } from './xref'

type P = Array<[number, string | number]>
const dxf = (pairs: P) => pairs.map(([c, v]) => `${c}\n${v}`).join('\n') + '\n'
const file = (blocks: P, ents: P, tables: P = []) =>
  dxf([...tables, [0, 'SECTION'], [2, 'BLOCKS'], ...blocks, [0, 'ENDSEC'], [0, 'SECTION'], [2, 'ENTITIES'], ...ents, [0, 'ENDSEC'], [0, 'EOF']])

// Plano que usa una referencia externa «Base» (un DWG guardado en otra carpeta) insertada dos veces.
const host = file(
  [[0, 'BLOCK'], [8, '0'], [2, 'Base'], [70, 4], [10, 0], [20, 0], [30, 0], [1, 'C:\\proyectos\\planta\\base.dwg'], [0, 'ENDBLK']],
  [
    [0, 'INSERT'], [8, 'Refs'], [2, 'Base'], [10, 100], [20, 0], [30, 0],
    [0, 'INSERT'], [8, 'Refs'], [2, 'Base'], [10, 300], [20, 0], [30, 0], [50, 90],
    [0, 'LINE'], [8, '0'], [10, 0], [20, 0], [30, 0], [11, 10], [21, 0], [31, 0],
  ],
)
// El archivo de la referencia: una línea en «Muros», un círculo en la capa 0 y un bloque propio «Perno».
const child = file(
  [[0, 'BLOCK'], [8, '0'], [2, 'Perno'], [70, 0], [10, 0], [20, 0], [30, 0], [0, 'CIRCLE'], [8, 'Muros'], [10, 0], [20, 0], [30, 0], [40, 2], [0, 'ENDBLK']],
  [
    [0, 'LINE'], [8, 'Muros'], [10, 0], [20, 0], [30, 0], [11, 50], [21, 0], [31, 0],
    [0, 'CIRCLE'], [8, '0'], [10, 10], [20, 10], [30, 0], [40, 5],
    [0, 'INSERT'], [8, 'Muros'], [2, 'Perno'], [10, 20], [20, 0], [30, 0],
  ],
  [[0, 'SECTION'], [2, 'TABLES'], [0, 'TABLE'], [2, 'LAYER'], [0, 'LAYER'], [2, 'Muros'], [70, 0], [62, 1], [6, 'CONTINUOUS'], [0, 'ENDTAB'], [0, 'ENDSEC']],
)

describe('referencias externas (XREF)', () => {
  it('el bloque de una referencia llega vacío, con su ruta, y sus inserciones quedan como inserciones', () => {
    const r = importDxf(host)
    expect(xrefsOf(r)).toEqual([{ name: 'Base', path: 'C:\\proyectos\\planta\\base.dwg' }])
    expect(r.blocks?.find((b) => b.name === 'Base')).toMatchObject({ entities: [], xref: { path: 'C:\\proyectos\\planta\\base.dwg' } })
    const inserts = r.entities.filter((e) => e.type === 'INSERT')
    expect(inserts.map((e) => (e.props as unknown as { name: string; position: number[] }).position)).toEqual([[100, 0, 0], [300, 0, 0]])
  })

  it('con el archivo elegido, el bloque toma su modelo: capas NOMBRE|capa (la 0 sigue igual) y bloques NOMBRE|bloque', () => {
    const r = importDxf(host)
    attachXref(r, 'Base', importDxf(child))
    const base = r.blocks!.find((b) => b.name === 'Base')!
    expect(base.entities.map((e) => [e.type, e.layerName])).toEqual([['LINE', 'Base|Muros'], ['CIRCLE', '0'], ['INSERT', 'Base|Muros']])
    expect((base.entities[2].props as unknown as { name: string }).name).toBe('Base|Perno')
    expect(r.blocks!.find((b) => b.name === 'Base|Perno')?.entities.map((e) => e.layerName)).toEqual(['Base|Muros'])
    // Los modelos de los sólidos importados de la referencia viajan con el dibujo.
    const x = importDxf(child)
    x.breps = { 'sab-1-x': { fmt: 'sab', bytes: new Uint8Array([1]), box: [[0, 0, 0], [1, 1, 1]], display: {} as never } }
    const r2 = importDxf(host)
    attachXref(r2, 'Base', x)
    expect(Object.keys(r2.breps ?? {})).toEqual(['sab-1-x'])
    expect(r.layers.map((l) => l.name)).toContain('Base|Muros')
    expect(r.layers.map((l) => l.name)).not.toContain('Base|0')
    expect(xrefsOf(r)).toEqual([])
  })

  it('busca el archivo por la ruta relativa guardada y, si no, junto al dibujo; una ruta absoluta vale sólo por el nombre', () => {
    expect(xrefFileName('C:\\proyectos\\planta\\base.dwg')).toBe('base.dwg')
    expect(xrefCandidates('C:\\proyectos\\planta\\base.dwg', 'obra/planos')).toEqual([{ folder: 'obra/planos', file: 'base.dwg' }])
    expect(xrefCandidates('.\\piezas\\base.dwg', 'obra')).toEqual([{ folder: 'obra/piezas', file: 'base.dwg' }, { folder: 'obra', file: 'base.dwg' }])
    expect(xrefCandidates('..\\comun\\base.dxf', 'obra/planos')).toEqual([{ folder: 'obra/comun', file: 'base.dxf' }, { folder: 'obra/planos', file: 'base.dxf' }])
    expect(xrefCandidates('base.dwg', '')).toEqual([{ folder: '', file: 'base.dwg' }])
  })
})
