import { describe, expect, it } from 'vitest'
import { importedView } from '../../test/importedView'
import { exportDxf, importDxf, mtextIndent, plainMtext, shownDecimals } from './dxf'
import { textTop } from '../geom/text'
import type { TextProps } from '../document/types'
import { DEFAULT_DIM_STYLE } from '../dimension/dimGeometry'
import type { DimensionProps, Entity, ImageProps, Layer } from '../document/types'
import { formatDim, measureDim } from '../dimension/dimGeometry'
import { BUILTIN_DIM_VARS } from '../dimension/style'

const layers: Layer[] = [
  {
    id: 'l0',
    name: '0',
    color: '#ffffff',
    lineWeight: 0.25,
    lineType: 'CONTINUOUS',
    locked: false,
    visible: true,
    printable: true,
  },
  {
    id: 'l1',
    name: 'WALLS',
    color: '#ff0000',
    lineWeight: 0.5,
    lineType: 'DASHED',
    locked: false,
    visible: true,
    printable: true,
  },
]

const entities: Entity[] = [
  { id: 'e1', type: 'LINE', layer: 'l0', props: { start: [0, 0, 0], end: [10, 5, 0] } },
  { id: 'e2', type: 'CIRCLE', layer: 'l1', props: { center: [3, 4, 0], radius: 2, normal: [0, 0, 1] } },
  { id: 'e3', type: 'RECTANGLE', layer: 'l1', props: { corner: [0, 0, 0], width: 4, height: 2 } },
  { id: 'e4', type: 'POLYLINE', layer: 'l0', props: { vertices: [[0, 0, 0], [1, 1, 0], [2, 0, 0]], closed: false } },
  { id: 'e5', type: 'ELLIPSE', layer: 'l0', props: { center: [5, 5, 0], major: [3, 0, 0], ratio: 0.5, normal: [0, 0, 1] } },
  { id: 'e6', type: 'TEXT', layer: 'l0', props: { position: [1, 2, 0], text: 'HELLO', height: 2.5, rotation: 0, justify: 'left', normal: [0, 0, 1] } },
]

const dimension: Entity = {
  id: 'd1',
  type: 'DIMENSION',
  layer: 'l0',
  props: {
    dimType: 'LINEAR',
    points: [[0, 0, 0], [10, 0, 0]],
    textPos: [5, -2, 0],
    style: { ...DEFAULT_DIM_STYLE, DIMASZ: 1 },
  },
}

describe('DXF export', () => {
  it('escribe tabla de layers y entidades soportadas', () => {
    const dxf = exportDxf(entities, layers)
    expect(dxf).toContain('LAYER')
    expect(dxf).toContain('WALLS')
    expect(dxf).toContain('LINE')
    expect(dxf).toContain('CIRCLE')
    expect(dxf).toContain('ELLIPSE')
    expect(dxf).toContain('TEXT')
    expect(dxf).toContain('HELLO')
    expect(dxf).toContain('LWPOLYLINE')
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true)
  })

  it('cota LINEAR nativa: DIMENSION + bloque *D1 con su geometría + tabla DIMSTYLE', () => {
    const dxf = exportDxf([dimension], layers)
    expect(dxf).toContain('\nDIMENSION\n')
    expect(dxf).toContain('\nBLOCKS\n')
    expect(dxf).toContain('\n2\n*D1\n')
    expect(dxf).toContain('\nDIMSTYLE\n')
    expect(dxf).toContain('\n1\n10\n') // texto del bloque: valor medido con IRAM 4513 (sin ceros finales)
    expect(dxf).toContain('\nSOLID\n') // flechas rellenas
    // Orden de secciones: TABLES, BLOCKS, ENTITIES.
    expect(dxf.indexOf('TABLES')).toBeLessThan(dxf.indexOf('BLOCKS'))
    expect(dxf.indexOf('BLOCKS')).toBeLessThan(dxf.indexOf('ENTITIES'))
  })

  it('las cotas sin equivalente R12 (longitud de arco, fuera del plano XY) se explotan', () => {
    const arclen: Entity = { id: 'a', type: 'DIMENSION', layer: 'l0', props: { dimType: 'ARCLEN', angMode: 'arc', points: [[0, 0, 0], [10, 0, 0], [0, 10, 0]], textPos: [9, 9, 0], style: DEFAULT_DIM_STYLE } }
    const front: Entity = { ...dimension, id: 'f', props: { ...(dimension.props as DimensionProps), normal: [0, -1, 0] } }
    const dxf = exportDxf([arclen, front], layers)
    expect(dxf).not.toContain('\nDIMENSION\n')
    expect(dxf).toContain('\nLINE\n')
  })
})

describe('DXF import (round-trip)', () => {
  it('reimporta layers con color/lineweight/linetype', () => {
    const { layers: outL } = importDxf(exportDxf(entities, layers))
    const walls = outL.find((l) => l.name === 'WALLS')
    expect(walls).toBeDefined()
    expect(walls?.color.toLowerCase()).toBe('#ff0000')
    expect(walls?.lineWeight).toBeCloseTo(0.5)
    expect(walls?.lineType).toBe('DASHED')
  })

  it('conserva on/lock/plot de las capas y la capa actual ($CLAYER)', () => {
    const states: Layer[] = [layers[0], { ...layers[1], visible: false, locked: true, printable: false }]
    const dxf = exportDxf(entities, states, 'l1')
    expect(dxf.startsWith('0\nSECTION\n2\nHEADER\n9\n$CLAYER\n8\nWALLS\n')).toBe(true)
    const back = importDxf(dxf)
    expect(back.currentLayer).toBe('WALLS')
    expect(back.layers.find((l) => l.name === 'WALLS')).toMatchObject({ visible: false, locked: true, printable: false })
    expect(back.layers.find((l) => l.name === '0')?.printable).toBe(true)
    expect(importDxf(exportDxf(entities, layers)).currentLayer).toBeUndefined()
  })

  it('reimporta entidades con geometría equivalente', () => {
    const { entities: out } = importDxf(exportDxf(entities, layers))
    const line = out.find((e) => e.type === 'LINE')
    expect(line).toBeDefined()
    const lp = line?.props as { start: number[]; end: number[] }
    expect(lp.start).toEqual([0, 0, 0])
    expect(lp.end).toEqual([10, 5, 0])

    const circle = out.find((e) => e.type === 'CIRCLE')
    const cp = circle?.props as { center: number[]; radius: number }
    expect(cp.radius).toBe(2)
    expect(cp.center).toEqual([3, 4, 0])

    // RECTANGLE (polígono cerrado de 4 vértices alineado) round-trips como RECTANGLE.
    const rect = out.find((e) => e.type === 'RECTANGLE')
    const rp = rect?.props as { corner: number[]; width: number; height: number }
    expect(rp.width).toBeCloseTo(4)
    expect(rp.height).toBeCloseTo(2)
    // La POLYLINE abierta sigue siendo POLYLINE.
    expect(out.filter((e) => e.type === 'POLYLINE')).toHaveLength(1)

    // ELLIPSE round-trips con centro/major/ratio.
    const ell = out.find((e) => e.type === 'ELLIPSE')
    const ep = ell?.props as { center: number[]; major: number[]; ratio: number }
    expect(ep.center).toEqual([5, 5, 0])
    expect(ep.major).toEqual([3, 0, 0])
    expect(ep.ratio).toBeCloseTo(0.5)

    // TEXT round-trips con contenido y altura.
    const txt = out.find((e) => e.type === 'TEXT')
    const tp = txt?.props as { text: string; height: number }
    expect(tp.text).toBe('HELLO')
    expect(tp.height).toBeCloseTo(2.5)

    expect(circle?.layerName).toBe('WALLS')
  })

  it('reporta entidades no soportadas y tolera DXF malformado', () => {
    const dxf = '0\nSECTION\n2\nENTITIES\n0\nHATCH\n8\n0\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n1\n21\n1\n0\nENDSEC\n0\nEOF\n'
    const res = importDxf(dxf)
    expect(res.unsupported).toContain('HATCH')
    expect(res.entities.filter((e) => e.type === 'LINE')).toHaveLength(1)
    expect(() => importDxf('garbage\nnot dxf\n\n')).not.toThrow()
  })
})

describe('DXF: cotas nativas ida y vuelta', () => {
  const S = BUILTIN_DIM_VARS['ISO-25']
  const mk = (id: string, props: Partial<DimensionProps>): Entity => ({ id, type: 'DIMENSION', layer: 'l1', props: { textPos: [0, 0, 0], points: [], style: S, styleName: 'ISO-25', ...props } as DimensionProps })
  const dims: Entity[] = [
    mk('lin', { dimType: 'LINEAR', points: [[0, 0, 0], [30, 10, 0]], textPos: [15, -8, 0] }),
    mk('rot', { dimType: 'LINEAR', points: [[0, 0, 0], [30, 10, 0]], textPos: [15, -8, 0], rotation: 30, textOverride: '<> TYP' }),
    mk('ali', { dimType: 'ALIGNED', points: [[0, 0, 0], [30, 40, 0]], textPos: [10, 30, 0] }),
    mk('ang', { dimType: 'ANGULAR', angMode: 'points', points: [[0, 0, 0], [10, 0, 0], [0, 10, 0]], textPos: [6, 6, 0] }),
    mk('rad', { dimType: 'RADIUS', points: [[50, 50, 0], [60, 50, 0]], textPos: [70, 55, 0] }),
    mk('dia', { dimType: 'DIAMETER', points: [[50, 50, 0], [50, 62, 0]], textPos: [55, 70, 0] }),
    mk('ord', { dimType: 'ORDINATE', points: [[25, 12, 0]], textPos: [25, 30, 0], axis: 'X' }),
    mk('tick', { dimType: 'LINEAR', points: [[0, 100, 0], [40, 100, 0]], textPos: [20, 110, 0], styleName: 'IRAM 4511', style: BUILTIN_DIM_VARS['IRAM 4511'] }),
  ]

  it('cada tipo vuelve con su medida, su texto y su estilo', () => {
    const dxf = exportDxf(dims, layers, undefined, [{ name: 'ISO-25', vars: S }, { name: 'IRAM 4511', vars: BUILTIN_DIM_VARS['IRAM 4511'] }])
    expect(dxf).toContain('\n1\n<> TYP\n')
    expect(dxf).toContain('%%c') // ⌀ del diámetro en el bloque
    const r = importDxf(dxf)
    expect(r.unsupported).toEqual([])
    const back = r.entities.filter((e) => e.type === 'DIMENSION').map((e) => e.props as DimensionProps)
    expect(back.map((d) => d.dimType)).toEqual(['LINEAR', 'LINEAR', 'ALIGNED', 'ANGULAR', 'RADIUS', 'DIAMETER', 'ORDINATE', 'LINEAR'])
    dims.forEach((e, i) => {
      const a = e.props as DimensionProps
      expect(measureDim(back[i])).toBeCloseTo(measureDim(a), 6)
      expect(formatDim(back[i])).toBe(formatDim(a))
    })
    expect(back[1].textOverride).toBe('<> TYP')
    expect(back.map((d) => d.styleName)).toEqual(['ISO-25', 'ISO-25', 'ISO-25', 'ISO-25', 'ISO-25', 'ISO-25', 'ISO-25', 'IRAM_4511'])
    const iram = r.dimStyles.find((s) => s.name === 'IRAM_4511')!
    expect(iram.vars.DIMBLK1).toBe('_OBLIQUE')
    expect(iram.vars.DIMTXT).toBe(BUILTIN_DIM_VARS['IRAM 4511'].DIMTXT)
    expect(iram.vars.DIMDSEP).toBe(BUILTIN_DIM_VARS['IRAM 4511'].DIMDSEP)
  })

  it('una cota con overrides exporta un estilo derivado que los conserva', () => {
    const ov = mk('ov', { dimType: 'LINEAR', points: [[0, 0, 0], [30, 0, 0]], textPos: [15, -8, 0], overrides: { DIMTXT: 5 }, style: { ...S, DIMTXT: 5 } })
    const r = importDxf(exportDxf([ov], layers, undefined, [{ name: 'ISO-25', vars: S }]))
    const d = r.entities[0].props as DimensionProps
    expect(d.styleName).toBe('ISO-25_ov')
    expect(d.style.DIMTXT).toBe(5)
  })

  it('importa DIMSTYLE y DIMENSION de un DXF R2000 del CAD clásico (flechas por handle de BLOCK_RECORD)', () => {
    const dxf = [
      '0', 'SECTION', '2', 'TABLES',
      '0', 'TABLE', '2', 'BLOCK_RECORD', '5', '1', '70', '2',
      '0', 'BLOCK_RECORD', '5', '1F', '100', 'AcDbSymbolTableRecord', '100', 'AcDbBlockTableRecord', '2', '_ARCHTICK',
      '0', 'ENDTAB',
      '0', 'TABLE', '2', 'DIMSTYLE', '5', 'A', '70', '1', '100', 'AcDbDimStyleTable', '71', '1',
      '0', 'DIMSTYLE', '105', '27', '100', 'AcDbSymbolTableRecord', '100', 'AcDbDimStyleTableRecord', '2', 'Arq', '70', '0',
      '41', '2.0', '140', '3.0', '147', '1.0', '77', '1', '78', '0', '271', '1', '278', '44', '173', '0', '342', '1F',
      '0', 'ENDTAB',
      '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'DIMENSION', '5', '2A', '100', 'AcDbEntity', '8', '0', '100', 'AcDbDimension', '2', '*D1',
      '10', '100.0', '20', '20.0', '30', '0.0', '11', '50.0', '21', '22.0', '31', '0.0', '70', '32', '3', 'Arq',
      '100', 'AcDbAlignedDimension', '13', '0.0', '23', '0.0', '33', '0.0', '14', '100.0', '24', '0.0', '34', '0.0',
      '50', '0.0', '100', 'AcDbRotatedDimension',
      '0', 'ENDSEC', '0', 'EOF',
    ].join('\n')
    const r = importDxf(dxf)
    const st = r.dimStyles[0]
    expect(st.name).toBe('Arq')
    expect(st.vars.DIMBLK1).toBe('_ARCHTICK')
    expect(st.vars.DIMTXT).toBe(3)
    expect(st.vars.DIMDSEP).toBe(',')
    expect(st.vars.DIMDEC).toBe(1)
    const d = r.entities[0].props as DimensionProps
    expect(d.dimType).toBe('LINEAR')
    expect(d.styleName).toBe('Arq')
    expect(measureDim(d)).toBeCloseTo(100, 9)
    expect(formatDim(d)).toBe('100,0')
  })
})

describe('DXF con OCS del CAD clásico', () => {
  const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9))
  const ent = (type: string, props: object): Entity => ({ id: type, type, layer: '0', props }) as unknown as Entity
  const roundTrip = (e: Entity) => importDxf(exportDxf([e], layers)).entities[0] as unknown as { type: string; props: Record<string, unknown> }

  it('un círculo en el plano FRONT se escribe con el centro en el OCS y vuelve igual', () => {
    const c = ent('CIRCLE', { center: [20, 0, 10], radius: 5, normal: [0, -1, 0] })
    const dxf = exportDxf([c], layers)
    // OCS de (0,−1,0): X = (1,0,0), Y = (0,0,1) → centro (20, 10, 0).
    expect(dxf).toMatch(/CIRCLE[\s\S]*\n10\n20(\.0+)?\n20\n10(\.0+)?\n30\n0(\.0+)?\n40\n5(\.0+)?\n210\n0\n220\n-1\n230\n0/)
    const back = roundTrip(c)
    near(back.props.center as number[], [20, 0, 10])
    near(back.props.normal as number[], [0, -1, 0])
  })

  it('un arco horario (normal −Z) sale con los ángulos del OCS y vuelve con los mismos extremos', () => {
    const a = ent('ARC', { center: [3, 4, 0], radius: 2, startAngle: 0.2, endAngle: 1.4, normal: [0, 0, -1] })
    const back = roundTrip(a)
    expect(back.type).toBe('ARC')
    near(back.props.center as number[], [3, 4, 0])
    expect(back.props.startAngle as number).toBeCloseTo(0.2, 9)
    expect(back.props.endAngle as number).toBeCloseTo(1.4, 9)
  })

  it('una polilínea con arco en el plano FRONT y un texto girado conservan su lugar', () => {
    const pl = ent('POLYLINE', { vertices: [[0, 2, 0], [10, 2, 0], [10, 2, 5]], bulges: [0, 0.5, 0], closed: false, normal: [0, -1, 0] })
    const back = roundTrip(pl)
    expect(back.type).toBe('POLYLINE')
    ;(back.props.vertices as number[][]).forEach((v, i) => near(v, (pl.props as { vertices: number[][] }).vertices[i]))
    near(back.props.normal as number[], [0, -1, 0])
    // Un texto anclado arriba (dibujos anteriores) vuelve como TEXT sobre su línea base, en el mismo lugar.
    const t = ent('TEXT', { position: [1, 0, 2], text: 'A', height: 2.5, rotation: 0.3, justify: 'left', normal: [0, -1, 0] })
    const bt = roundTrip(t)
    expect(bt.props.kind).toBe('text')
    near(textTop(bt.props as unknown as TextProps), [1, 0, 2])
    expect(bt.props.rotation as number).toBeCloseTo(0.3, 9)
    const b = ent('TEXT', { position: [1, 0, 2], text: 'A', height: 2.5, rotation: 0.3, justify: 'left', normal: [0, -1, 0], kind: 'text' })
    near(roundTrip(b).props.position as number[], [1, 0, 2])
  })
})

describe('DXF: TEXT y MTEXT del CAD clásico', () => {
  const ent = (props: Partial<TextProps>): Entity =>
    ({ id: 't', type: 'TEXT', layer: '0', props: { position: [0, 0, 0], text: 'A', height: 2, rotation: 0, justify: 'left', normal: [0, 0, 1], ...props } }) as Entity
  const one = (dxf: string) => importDxf(dxf).entities[0].props as unknown as TextProps
  const body = (codes: Array<[number, string | number]>) =>
    ['0', 'SECTION', '2', 'ENTITIES', ...codes.flatMap(([c, v]) => [String(c), String(v)]), '0', 'ENDSEC', '0', 'EOF'].join('\n')

  it('TEXT centrado o a la derecha guarda el punto en 11/21/31 y vuelve igual; los símbolos van como %%c %%d %%p', () => {
    for (const justify of ['center', 'right'] as const) {
      const dxf = exportDxf([ent({ position: [10, 5, 0], justify, kind: 'text', text: 'Ø20 ±0.1 45°' })], [])
      expect(dxf).toContain('%%c20 %%p0.1 45%%d')
      const back = one(dxf)
      expect(back.justify).toBe(justify)
      expect(back.position).toEqual([10, 5, 0])
      expect(back.text).toBe('Ø20 ±0.1 45°')
    }
  })

  it('TEXT con justificación vertical (73) se baja a la línea base; MTEXT anclado al medio o abajo se sube', () => {
    const top = one(body([[0, 'TEXT'], [10, 0], [20, 0], [30, 0], [40, 2], [1, 'X'], [72, 0], [11, 5], [21, 8], [31, 0], [73, 3]]))
    expect(top.position).toEqual([5, 6, 0])
    const mid = one(body([[0, 'MTEXT'], [10, 0], [20, 10], [30, 0], [40, 2], [71, 5], [1, 'A\\PB']]))
    expect(mid.justify).toBe('center')
    expect(mid.kind).toBe('mtext')
    expect(mid.position[1]).toBeCloseTo(10 + 2 * 2 * 1.667 * 0.5, 9) // interlineado de MTEXT: 5/3
  })

  it('el MTEXT llega como texto plano: sin códigos de formato, con renglones y Unicode', () => {
    expect(plainMtext('{\\fArial|b1|i0;\\H2.5;Hola}\\Pmundo \\U+2205 20 \\S1/2; \\{x\\}')).toBe('Hola\nmundo ∅ 20 1/2 {x}')
    // \p…; (sangría y tabulaciones del párrafo) no es un salto ni se ve; \A (alineación) y \C (color) tampoco.
    expect(plainMtext('\\pxi4.5;{\\C7;TITULO}')).toBe('TITULO')
    expect(plainMtext('\\pxt0;{\\T1.1;\\C7;Director:\\PIng. Pérez}')).toBe('Director:\nIng. Pérez')
    expect(plainMtext('\\A1;32.90')).toBe('32.90')
    expect(plainMtext('Escalas: ^JIndicadas ^Iy x^ 2')).toBe('Escalas: \nIndicadas     y x^2')
    // La sangría del párrafo (en altos de texto) corre el texto alineado a la izquierda: 2 × 5 = 10.
    expect(mtextIndent('\\pxi1.5,l0.5,t4;{\\C7;A}')).toEqual({ first: 1.5, left: 0.5 })
    const m = one(body([[0, 'MTEXT'], [10, 0], [20, 0], [30, 0], [40, 2], [1, '%%c10\\P{\\C1;rojo}']]))
    expect(m.text).toBe('Ø10\nrojo')
  })
})

describe('DXF: tipos de línea, anchos y HATCH', () => {
  const lay: Layer = { id: '0', name: '0', color: '#ffffff', lineWeight: 0.25, lineType: 'HIDDEN', locked: false, visible: true, printable: true }
  it('tabla LTYPE, tipo y escala por objeto, variables del HEADER: ida y vuelta', () => {
    const e: Entity = { id: 'a', type: 'LINE', layer: '0', lineType: 'CENTER', ltScale: 2, props: { start: [0, 0, 0], end: [10, 0, 0] } }
    const txt = exportDxf([e], [lay], '0', undefined, {
      linetypes: [
        { name: 'CONTINUOUS', description: 'Solid line', pattern: [] },
        { name: 'HIDDEN', description: 'Hidden', pattern: [6.35, -3.175] },
        { name: 'CENTER', description: 'Center', pattern: [31.75, -6.35, 6.35, -6.35] },
      ],
      vars: { LTSCALE: 10, CELTYPE: 'HIDDEN', PSLTSCALE: 0, LWDISPLAY: 1 },
    })
    expect(txt).toContain('LTYPE')
    const r = importDxf(txt)
    expect(r.linetypes.map((d) => d.name)).toEqual(['HIDDEN', 'CENTER'])
    expect(r.linetypes[1].pattern).toEqual([31.75, -6.35, 6.35, -6.35])
    expect(r.layers[0].lineType).toBe('HIDDEN')
    expect(r.entities[0].lineType).toBe('CENTER')
    expect(r.entities[0].ltScale).toBe(2)
    expect(r.vars).toEqual({ LTSCALE: 10, CELTYPE: 'HIDDEN', PSLTSCALE: 0, LWDISPLAY: 1 })
  })

  it('LWPOLYLINE con ancho constante (43) y por tramo (40/41)', () => {
    const c: Entity = { id: 'p', type: 'POLYLINE', layer: '0', props: { vertices: [[0, 0, 0], [10, 0, 0]], closed: false, widths: [[2, 2], [2, 2]] } }
    const v: Entity = { id: 'q', type: 'POLYLINE', layer: '0', props: { vertices: [[0, 0, 0], [10, 0, 0], [20, 5, 0]], closed: false, widths: [[0, 3], [3, 1], [0, 0]] } }
    const txt = exportDxf([c, v], [lay])
    expect(txt).toMatch(/\n43\n2\n/)
    const r = importDxf(txt)
    expect((r.entities[0].props as { widths: unknown }).widths).toEqual([[2, 2], [2, 2]])
    expect((r.entities[1].props as { widths: unknown }).widths).toEqual([[0, 3], [3, 1], [0, 0]])
  })

  it('HATCH: lazos con bulges, patrón, escala, ángulo, origen e islas', () => {
    const h: Entity = {
      id: 'h',
      type: 'HATCH',
      layer: '0',
      props: {
        loops: [
          { vertices: [[0, 0, 0], [100, 0, 0], [100, 50, 0], [0, 50, 0]] },
          { vertices: [[40, 25, 0], [60, 25, 0]], bulges: [1, 1] },
        ],
        pattern: 'ANSI37',
        scale: 2,
        angle: Math.PI / 6,
        origin: [3, 4, 0],
        island: 'normal',
      },
    }
    const r = importDxf(exportDxf([h], [lay]))
    const p = r.entities[0].props as typeof h.props
    expect(r.entities[0].type).toBe('HATCH')
    expect(p.pattern).toBe('ANSI37')
    expect(p.scale).toBeCloseTo(2, 9)
    expect(p.angle).toBeCloseTo(Math.PI / 6, 9)
    expect(p.island).toBe('normal')
    expect(p.loops[1].bulges).toEqual([1, 1])
    expect(p.origin[0]).toBeCloseTo(3, 6)
    expect(p.origin[1]).toBeCloseTo(4, 6)
  })

  it('HATCH sólido y uno con bordes de arco (como los que escribe el CAD clásico)', () => {
    const solid: Entity = { id: 's', type: 'HATCH', layer: '0', props: { loops: [{ vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 0]] }], pattern: 'SOLID', scale: 1, angle: 0, origin: [0, 0, 0], island: 'outer' } }
    expect(importDxf(exportDxf([solid], [lay])).entities[0].props).toMatchObject({ pattern: 'SOLID', loops: [{ vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 0]] }] })
    const edge = ['0', 'SECTION', '2', 'ENTITIES', '0', 'HATCH', '8', '0', '10', '0', '20', '0', '30', '0', '2', 'SOLID', '70', '1', '71', '0', '91', '1',
      '92', '1', '93', '1', '72', '2', '10', '5', '20', '5', '40', '5', '50', '0', '51', '360', '73', '1', '97', '0', '75', '1', '76', '1', '98', '0', '0', 'ENDSEC', '0', 'EOF'].join('\n')
    const c = importDxf(edge).entities[0].props as { loops: Array<{ vertices: number[][]; bulges?: number[] }> }
    expect(c.loops[0].vertices.length).toBe(4)
    for (const b of c.loops[0].bulges!) expect(b).toBeCloseTo(Math.tan(Math.PI / 8), 9)
  })
})

describe('importDxf ▸ bloques', () => {
  const dxf = (pairs: Array<[number, string | number]>) => pairs.map(([c, v]) => `${c}\n${v}`).join('\n') + '\n'
  it('expande las inserciones (punto base, rotación, escala, anidadas y capa 0 que flota)', () => {
    const text = dxf([
      [0, 'SECTION'], [2, 'BLOCKS'],
      [0, 'BLOCK'], [2, 'Tuerca'], [10, 5], [20, 0], [30, 0],
      [0, 'LINE'], [8, '0'], [10, 5], [20, 0], [30, 0], [11, 15], [21, 0], [31, 0],
      [0, 'ENDBLK'],
      [0, 'BLOCK'], [2, 'Grupo'], [10, 0], [20, 0], [30, 0],
      [0, 'INSERT'], [8, '0'], [2, 'Tuerca'], [10, 0], [20, 0], [30, 0],
      [0, 'CIRCLE'], [8, 'Fija'], [10, 0], [20, 0], [30, 0], [40, 2],
      [0, 'ENDBLK'],
      [0, 'ENDSEC'],
      [0, 'SECTION'], [2, 'ENTITIES'],
      [0, 'INSERT'], [8, 'Piezas'], [2, 'Grupo'], [10, 100], [20, 50], [30, 0], [41, 2], [42, 2], [43, 2], [50, 90],
      [0, 'ENDSEC'], [0, 'EOF'],
    ])
    const r = importDxf(text)
    // Bloques de Cota: la inserción del modelo y la anidada referencian sus definiciones.
    expect(r.entities.map((e) => e.type)).toEqual(['INSERT'])
    expect(r.blocks?.map((b) => b.name).sort()).toEqual(['Grupo', 'Tuerca'])
    const grupo = r.blocks!.find((b) => b.name === 'Grupo')!
    expect(grupo.entities.map((e) => e.type).sort()).toEqual(['CIRCLE', 'INSERT'])
    // Dibujada por Cota, la geometría queda donde quedaba desarmada.
    const shown = importedView(r)
    const line = shown.find((e) => e.type === 'LINE')!
    const { start, end } = line.props as unknown as { start: number[]; end: number[] }
    // La línea del bloque va de 0 a 10 respecto de su base; escalada ×2 y girada 90° desde (100, 50).
    expect(start[0]).toBeCloseTo(100, 9)
    expect(start[1]).toBeCloseTo(50, 9)
    expect(end[0]).toBeCloseTo(100, 9)
    expect(end[1]).toBeCloseTo(70, 9)
    expect(line.layerName).toBe('Piezas') // estaba en la capa 0 dentro del bloque
    const c = shown.find((e) => e.type === 'CIRCLE')!
    expect((c.props as unknown as { radius: number }).radius).toBeCloseTo(4, 9)
    expect(c.layerName).toBe('Fija')
    expect(r.unsupported).not.toContain('INSERT')
  })
  it('un rectángulo del bloque insertado girado o fuera de planta queda como polilínea (se puede dibujar)', () => {
    const rect: Array<[number, string | number]> = [[0, 'LWPOLYLINE'], [8, '0'], [90, 4], [70, 1], [10, 0], [20, 0], [10, 4], [20, 0], [10, 4], [20, 2], [10, 0], [20, 2]]
    const text = dxf([
      [0, 'SECTION'], [2, 'BLOCKS'],
      [0, 'BLOCK'], [2, 'Caja'], [10, 0], [20, 0], [30, 0], ...rect, [0, 'ENDBLK'],
      [0, 'ENDSEC'],
      [0, 'SECTION'], [2, 'ENTITIES'],
      [0, 'INSERT'], [8, 'A'], [2, 'Caja'], [10, 10], [20, 0], [30, 0],
      [0, 'INSERT'], [8, 'B'], [2, 'Caja'], [10, 0], [20, 0], [30, 0], [50, 30],
      [0, 'INSERT'], [8, 'C'], [2, 'Caja'], [10, 0], [20, 0], [30, 0], [210, -1], [220, 0], [230, 0],
      [0, 'ENDSEC'], [0, 'EOF'],
    ])
    const shown = importedView(importDxf(text))
    const byLayer = (l: string) => shown.find((e) => e.layerName === l)!
    expect(byLayer('A').type).toBe('RECTANGLE') // sin giro sigue siendo rectángulo
    for (const l of ['B', 'C']) {
      const e = byLayer(l)
      expect(e.type).toBe('POLYLINE')
      expect((e.props as unknown as { vertices: number[][] }).vertices).toHaveLength(4)
    }
  })
  it('un bloque insertado de costado: el punto y el giro vienen en el OCS de la inserción', () => {
    // Normal −X: el OCS tiene X = (0, −1, 0) e Y = (0, 0, 1); el punto (−188, 0, 126) del OCS es (−126, 188, 0).
    const text = dxf([
      [0, 'SECTION'], [2, 'BLOCKS'],
      [0, 'BLOCK'], [2, 'Eje'], [10, 0], [20, 0], [30, 0], [0, 'LINE'], [8, '0'], [10, 0], [20, 0], [30, 0], [11, 10], [21, 0], [31, 0], [0, 'ENDBLK'],
      [0, 'ENDSEC'],
      [0, 'SECTION'], [2, 'ENTITIES'],
      [0, 'INSERT'], [8, 'A'], [2, 'Eje'], [10, -188], [20, 0], [30, 126], [50, 180], [210, -1], [220, 0], [230, 0],
      [0, 'ENDSEC'], [0, 'EOF'],
    ])
    const line = importedView(importDxf(text))[0].props as unknown as { start: number[]; end: number[] }
    ;[-126, 188, 0].forEach((v, i) => expect(line.start[i]).toBeCloseTo(v))
    ;[-126, 198, 0].forEach((v, i) => expect(line.end[i]).toBeCloseTo(v))
  })
  it('un bloque insertado espejado da vuelta las caras de sus mallas (siguen mirando afuera)', () => {
    const face: Array<[number, string | number]> = [[0, '3DFACE'], [8, '0'], [10, 0], [20, 0], [30, 0], [11, 1], [21, 0], [31, 0], [12, 0], [22, 1], [32, 0], [13, 0], [23, 1], [33, 0]]
    const text = dxf([
      [0, 'SECTION'], [2, 'BLOCKS'],
      [0, 'BLOCK'], [2, 'Cara'], [10, 0], [20, 0], [30, 0], ...face, [0, 'ENDBLK'],
      [0, 'ENDSEC'],
      [0, 'SECTION'], [2, 'ENTITIES'],
      [0, 'INSERT'], [8, 'A'], [2, 'Cara'], [10, 0], [20, 0], [30, 0],
      [0, 'INSERT'], [8, 'B'], [2, 'Cara'], [10, 0], [20, 0], [30, 0], [41, -1],
      [0, 'ENDSEC'], [0, 'EOF'],
    ])
    for (const e of importedView(importDxf(text))) {
      const m = e.props as unknown as { vertices: number[][]; faces: number[][] }
      const [a, b, c] = m.faces[0].map((i) => m.vertices[i])
      const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
      expect(nz).toBeGreaterThan(0)
    }
  })
})

describe('importDxf ▸ POLYLINE con VERTEX (3D, mallas y 2D del formato viejo)', () => {
  const dxf = (pairs: Array<[number, string | number]>) =>
    [[0, 'SECTION'], [2, 'ENTITIES'], ...pairs, [0, 'ENDSEC'], [0, 'EOF']].map(([c, v]) => `${c}\n${v}`).join('\n') + '\n'
  const vtx = (x: number, y: number, z: number, flags = 0, extra: Array<[number, number]> = []): Array<[number, string | number]> => [
    [0, 'VERTEX'], [8, '0'], [10, x], [20, y], [30, z], [70, flags], ...extra,
  ]
  it('polilínea 3D: los vértices en el mundo', () => {
    const r = importDxf(dxf([[0, 'POLYLINE'], [8, 'A'], [66, 1], [70, 8], ...vtx(0, 0, 0, 32), ...vtx(10, 0, 5, 32), ...vtx(10, 10, 20, 32), [0, 'SEQEND'], [8, 'A']]))
    expect(r.entities).toHaveLength(1)
    const e = r.entities[0]
    expect(e.type).toBe('POLYLINE')
    expect((e.props as unknown as { vertices: number[][] }).vertices).toEqual([[0, 0, 0], [10, 0, 5], [10, 10, 20]])
    expect(r.unsupported).toEqual([])
  })
  it('malla de caras (polyface): vértices y caras → MESH3D', () => {
    const r = importDxf(
      dxf([
        [0, 'POLYLINE'], [8, '0'], [66, 1], [70, 64], [71, 4], [72, 2],
        ...vtx(0, 0, 0, 192), ...vtx(1, 0, 0, 192), ...vtx(1, 1, 0, 192), ...vtx(0, 1, 1, 192),
        ...vtx(0, 0, 0, 128, [[71, 1], [72, 2], [73, 3]]), ...vtx(0, 0, 0, 128, [[71, 1], [72, -3], [73, 4]]),
        [0, 'SEQEND'],
      ]),
    )
    const m = r.entities[0]
    expect(m.type).toBe('MESH3D')
    const p = m.props as unknown as { vertices: number[][]; faces: number[][] }
    expect(p.vertices).toHaveLength(4)
    expect(p.faces).toEqual([[0, 1, 2], [0, 2, 3]])
  })
  it('malla de M×N vértices → MESH3D de cuadriláteros', () => {
    const verts = [0, 1, 2].flatMap((i) => [0, 1].flatMap((j) => vtx(i, j, i * j, 64)))
    const r = importDxf(dxf([[0, 'POLYLINE'], [8, '0'], [66, 1], [70, 16], [71, 3], [72, 2], ...verts, [0, 'SEQEND']]))
    const p = r.entities[0].props as unknown as { faces: number[][] }
    expect(r.entities[0].type).toBe('MESH3D')
    expect(p.faces).toEqual([[0, 1, 3, 2], [2, 3, 5, 4]])
  })
  it('polilínea 2D del formato viejo: elevación y tramo curvo (bulge)', () => {
    const r = importDxf(dxf([[0, 'POLYLINE'], [8, '0'], [66, 1], [10, 0], [20, 0], [30, 3], [70, 0], ...vtx(0, 0, 0, 0, [[42, 1]]), ...vtx(10, 0, 0), [0, 'SEQEND']]))
    const p = r.entities[0].props as unknown as { vertices: number[][]; bulges: number[] }
    expect(r.entities[0].type).toBe('POLYLINE')
    expect(p.vertices).toEqual([[0, 0, 3], [10, 0, 3]])
    expect(p.bulges).toEqual([1, 0])
  })
})

describe('importDxf ▸ SOLID, 3DFACE y LEADER', () => {
  const dxf = (pairs: Array<[number, string | number]>) =>
    [[0, 'SECTION'], [2, 'ENTITIES'], ...pairs, [0, 'ENDSEC'], [0, 'EOF']].map(([c, v]) => `${c}\n${v}`).join('\n') + '\n'
  it('SOLID: las esquinas en orden de moño (1, 2, 3, 4) dan el contorno 1, 2, 4, 3 relleno', () => {
    const r = importDxf(dxf([[0, 'SOLID'], [8, '0'], [10, 0], [20, 0], [30, 0], [11, 10], [21, 0], [31, 0], [12, 0], [22, 5], [32, 0], [13, 10], [23, 5], [33, 0]]))
    const h = r.entities[0]
    expect(h.type).toBe('HATCH')
    const p = h.props as unknown as { pattern: string; loops: { vertices: number[][] }[] }
    expect(p.pattern).toBe('SOLID')
    expect(p.loops[0].vertices).toEqual([[0, 0, 0], [10, 0, 0], [10, 5, 0], [0, 5, 0]])
  })
  it('3DFACE de tres esquinas: un triángulo', () => {
    const r = importDxf(dxf([[0, '3DFACE'], [8, '0'], [10, 0], [20, 0], [30, 0], [11, 1], [21, 0], [31, 0], [12, 0], [22, 1], [32, 1], [13, 0], [23, 1], [33, 1]]))
    expect(r.entities[0].type).toBe('MESH3D')
    expect((r.entities[0].props as unknown as { faces: number[][] }).faces).toEqual([[0, 1, 2]])
  })
  it('LEADER: sus vértices como polilínea', () => {
    const r = importDxf(dxf([[0, 'LEADER'], [8, '0'], [71, 1], [76, 3], [10, 0], [20, 0], [30, 0], [10, 5], [20, 5], [30, 0], [10, 12], [20, 5], [30, 0]]))
    expect(r.entities[0].type).toBe('POLYLINE')
    expect((r.entities[0].props as unknown as { vertices: number[][] }).vertices).toEqual([[0, 0, 0], [5, 5, 0], [12, 5, 0]])
  })
})

describe('importDxf ▸ orden de dibujo (como el CAD clásico)', () => {
  const dxf = (pairs: Array<[number, string | number]>) => pairs.map(([c, v]) => `${c}\n${v}`).join('\n') + '\n'
  const line = (h: string, y: number): Array<[number, string | number]> => [[0, 'LINE'], [5, h], [330, '1F'], [8, '0'], [10, 0], [20, y], [30, 0], [11, 10], [21, y], [31, 0]]
  const blocks: Array<[number, string | number]> = [[0, 'SECTION'], [2, 'BLOCKS'], [0, 'BLOCK'], [5, 'B1'], [330, 'B0'], [2, 'P'], [10, 0], [20, 0], [30, 0], [0, 'CIRCLE'], [5, 'B2'], [330, 'B0'], [8, '0'], [10, 0], [20, 0], [30, 0], [40, 1], [0, 'ENDBLK'], [0, 'ENDSEC']]
  const ents: Array<[number, string | number]> = [[0, 'SECTION'], [2, 'ENTITIES'], ...line('A1', 1), [0, 'INSERT'], [5, 'A2'], [330, '1F'], [8, '0'], [2, 'P'], [10, 5], [20, 5], [30, 0], ...line('A3', 3), [0, 'ENDSEC']]
  const order = (text: string) => importDxf(text).entities.map((e) => (e.type === 'LINE' ? `L${(e.props as { start: number[] }).start[1]}` : e.type))

  it('las inserciones se dibujan en su lugar del archivo, no al final', () => {
    expect(order(dxf([...blocks, ...ents, [0, 'EOF']]))).toEqual(['L1', 'INSERT', 'L3'])
  })

  it('la SORTENTSTABLE del espacio reordena por handle de orden (el propio si no está en la tabla)', () => {
    const sortents: Array<[number, string | number]> = [[0, 'SECTION'], [2, 'OBJECTS'], [0, 'SORTENTSTABLE'], [5, 'C1'], [330, 'C0'], [100, 'AcDbSortentsTable'], [330, '1F'], [331, 'A3'], [5, '10'], [331, 'A1'], [5, 'A5'], [0, 'ENDSEC']]
    // A3 → 10 (atrás de todo); A1 → A5 (después del INSERT A2).
    expect(order(dxf([...blocks, ...ents, ...sortents, [0, 'EOF']]))).toEqual(['L3', 'INSERT', 'L1'])
    // La de otro dueño no afecta al modelo.
    const other = sortents.map(([c, v]): [number, string | number] => (c === 330 && v === '1F' ? [330, '99'] : [c, v]))
    expect(order(dxf([...blocks, ...ents, ...other, [0, 'EOF']]))).toEqual(['L1', 'INSERT', 'L3'])
  })
})

describe('importDxf ▸ bloques de Cota con atributos', () => {
  type P = Array<[number, string | number]>
  const dxf = (pairs: P) => pairs.map(([c, v]) => `${c}\n${v}`).join('\n') + '\n'
  const attdef = (tag: string, value: string, x: number, y: number, h: number, flags = 0): P => [[0, 'ATTDEF'], [8, '0'], [10, x], [20, y], [30, 0], [40, h], [1, value], [3, `${tag}?`], [2, tag], [70, flags]]
  const attrib = (tag: string, value: string, x: number, y: number, h: number, rot = 0, flags = 0): P => [[0, 'ATTRIB'], [8, '0'], [10, x], [20, y], [30, 0], [40, h], [1, value], [2, tag], [70, flags], [50, rot]]
  // Tuerca: base (5, 5); círculo en la capa 0, línea ByBlock, atributos visible, invisible y constante.
  const tuerca: P = [
    [0, 'BLOCK'], [8, '0'], [2, 'Tuerca'], [70, 2], [10, 5], [20, 5], [30, 0],
    [0, 'CIRCLE'], [8, '0'], [10, 5], [20, 5], [30, 0], [40, 3],
    [0, 'LINE'], [8, '0'], [62, 0], [10, 2], [20, 5], [30, 0], [11, 8], [21, 5], [31, 0],
    ...attdef('MARCA', 'M8', 5, 9, 2.5), ...attdef('CODIGO', 'X', 9, 5, 1.5, 1), ...attdef('NORMA', 'ISO 4032', 1, 0.5, 1, 2),
    [0, 'ENDBLK'],
  ]
  const file = (blocks: P, ents: P) => dxf([[0, 'SECTION'], [2, 'BLOCKS'], ...blocks, [0, 'ENDSEC'], [0, 'SECTION'], [2, 'ENTITIES'], ...ents, [0, 'ENDSEC'], [0, 'EOF']])
  const seqend: P = [[0, 'SEQEND'], [8, '0']]

  it('la definición queda relativa al punto base, con sus ATTDEF; la inserción, con los valores de sus ATTRIB', () => {
    const r = importDxf(file(tuerca, [[0, 'INSERT'], [8, 'Piezas'], [66, 1], [2, 'Tuerca'], [10, 100], [20, 50], [30, 0], ...attrib('MARCA', 'M12', 100, 54, 2.5), ...attrib('CODIGO', 'X-1', 104, 50, 1.5, 0, 1), ...seqend]))
    expect(r.entities).toHaveLength(1)
    expect(r.entities[0]).toMatchObject({ type: 'INSERT', layerName: 'Piezas', props: { name: 'Tuerca', position: [100, 50, 0], scale: [1, 1, 1], rotation: 0 } })
    // El invisible también guarda su valor; el constante no se pide (sale de la definición).
    expect((r.entities[0].props as unknown as { attributes: unknown }).attributes).toEqual([{ tag: 'MARCA', value: 'M12' }, { tag: 'CODIGO', value: 'X-1' }])
    const def = r.blocks!.find((b) => b.name === 'Tuerca')!
    expect(def.entities.find((e) => e.type === 'CIRCLE')?.props).toMatchObject({ center: [0, 0, 0], radius: 3 })
    expect(def.entities.find((e) => e.type === 'LINE')?.color).toBe('BYBLOCK')
    const defs = def.entities.filter((e) => e.type === 'ATTDEF').map((e) => e.props as unknown as Record<string, unknown>)
    expect(defs.map((a) => [a.tag, a.prompt, a.value, !!a.invisible, !!a.constant])).toEqual([['MARCA', 'MARCA?', 'M8', false, false], ['CODIGO', 'CODIGO?', 'X', true, false], ['NORMA', 'NORMA?', 'ISO 4032', false, true]])
    expect(defs[0].position).toEqual([0, 4, 0])
    // Dibujada por Cota: el atributo donde estaba, el invisible no y el constante sí.
    const texts = importedView(r).filter((e) => e.type === 'TEXT').map((e) => [(e.props as unknown as TextProps).text, (e.props as unknown as TextProps).position])
    expect(texts).toEqual([['M12', [100, 54, 0]], ['ISO 4032', [96, 45.5, 0]]])
  })

  it('girada y escalada: el atributo que cae donde lo pone la definición se conserva', () => {
    const a = Math.PI / 6
    const at = (x: number, y: number) => [100 + 1.5 * (x * Math.cos(a) - y * Math.sin(a)), 50 + 1.5 * (x * Math.sin(a) + y * Math.cos(a))]
    const [x, y] = at(0, 4)
    const r = importDxf(file(tuerca, [[0, 'INSERT'], [8, 'Piezas'], [66, 1], [2, 'Tuerca'], [10, 100], [20, 50], [30, 0], [41, 1.5], [42, 1.5], [43, 1.5], [50, 30], ...attrib('MARCA', 'M16', x, y, 3.75, 30), ...seqend]))
    expect(r.entities.map((e) => e.type)).toEqual(['INSERT'])
    const t = importedView(r).find((e) => (e.props as unknown as TextProps).text === 'M16')!.props as unknown as TextProps
    expect(t.position[0]).toBeCloseTo(x, 9)
    expect(t.position[1]).toBeCloseTo(y, 9)
    expect(t.height).toBeCloseTo(3.75, 9)
    expect(t.rotation).toBeCloseTo(a, 9)
  })

  it('un atributo movido a mano, o sin su ATTDEF, desarma la inserción como antes', () => {
    const moved = importDxf(file(tuerca, [[0, 'INSERT'], [8, 'Piezas'], [66, 1], [2, 'Tuerca'], [10, 100], [20, 50], [30, 0], ...attrib('MARCA', 'MOVIDO', 105, 57, 2.5), ...seqend]))
    expect(moved.entities.some((e) => e.type === 'INSERT')).toBe(false)
    const t = moved.entities.find((e) => e.type === 'TEXT' && (e.props as unknown as TextProps).text === 'MOVIDO')!
    expect((t.props as unknown as TextProps).position).toEqual([105, 57, 0])
    expect(moved.entities.find((e) => e.type === 'CIRCLE')?.props).toMatchObject({ center: [100, 50, 0] })
    // El bloque igual queda definido (se puede insertar).
    expect(moved.blocks?.map((b) => b.name)).toEqual(['Tuerca'])
    const orphan = importDxf(file(tuerca, [[0, 'INSERT'], [8, 'Piezas'], [66, 1], [2, 'Tuerca'], [10, 0], [20, 0], [30, 0], ...attrib('OTRO', 'x', 0, 0, 1), ...seqend]))
    expect(orphan.entities.some((e) => e.type === 'INSERT')).toBe(false)
  })

  it('anidados: la inserción de adentro, con su atributo, también es de Cota; lo ByBlock toma lo de la inserción', () => {
    const grupo: P = [
      [0, 'BLOCK'], [8, '0'], [2, 'Grupo'], [70, 0], [10, 0], [20, 0], [30, 0],
      [0, 'INSERT'], [8, '0'], [62, 0], [66, 1], [2, 'Tuerca'], [10, 0], [20, 0], [30, 0], ...attrib('MARCA', 'M10', 0, 4, 2.5), ...seqend,
      [0, 'ENDBLK'],
    ]
    const r = importDxf(file([...tuerca, ...grupo], [[0, 'INSERT'], [8, 'Piezas'], [62, 1], [2, 'Grupo'], [10, 0], [20, 200], [30, 0], [50, 90]]))
    const g = r.blocks!.find((b) => b.name === 'Grupo')!
    expect(g.entities).toHaveLength(1)
    expect(g.entities[0]).toMatchObject({ type: 'INSERT', props: { name: 'Tuerca', attributes: [{ tag: 'MARCA', value: 'M10' }] } })
    const shown = importedView(r)
    // Girada 90° desde (0, 200): el atributo (4 arriba de la base de la tuerca) queda 4 a la izquierda.
    const m10 = shown.find((e) => (e.props as unknown as TextProps).text === 'M10')!.props as unknown as TextProps
    expect(m10.position[0]).toBeCloseTo(-4, 9)
    expect(m10.position[1]).toBeCloseTo(200, 9)
    // La línea ByBlock de la tuerca (insertada ByBlock) sale del color de la inserción de afuera (roja); el círculo, de
    // la capa. Desarmada en el archivo con la de adentro ByLayer, sería del color de la capa.
    expect(g.entities[0].color).toBe('BYBLOCK')
    expect(shown.find((e) => e.type === 'LINE')?.color).toBe('#ff0000')
    expect(shown.find((e) => e.type === 'CIRCLE')?.color).toBeUndefined()
    expect(shown.find((e) => e.type === 'CIRCLE')?.layerName).toBe('Piezas')
  })

  it('MINSERT: una inserción por celda (columnas y filas, giradas con ella)', () => {
    const r = importDxf(file(tuerca, [[0, 'INSERT'], [8, 'Piezas'], [2, 'Tuerca'], [10, 10], [20, 20], [30, 0], [50, 90], [70, 3], [71, 2], [44, 50], [45, 40]]))
    const at = r.entities.map((e) => (e.props as unknown as { position: number[] }).position.map((v) => Math.round(v)))
    expect(r.entities.every((e) => e.type === 'INSERT')).toBe(true)
    expect(at).toEqual([[10, 20, 0], [10, 70, 0], [10, 120, 0], [-30, 20, 0], [-30, 70, 0], [-30, 120, 0]])
  })

  it('los anónimos (bloques dinámicos) y las referencias externas se desarman como antes', () => {
    const anon: P = [[0, 'BLOCK'], [8, '0'], [2, '*U3'], [70, 1], [10, 0], [20, 0], [30, 0], [0, 'LINE'], [8, '0'], [10, 0], [20, 0], [30, 0], [11, 10], [21, 0], [31, 0], [0, 'ENDBLK']]
    const xref: P = [[0, 'BLOCK'], [8, '0'], [2, 'Plano|Marco'], [70, 16], [10, 0], [20, 0], [30, 0], [0, 'LINE'], [8, '0'], [10, 0], [20, 0], [30, 0], [11, 0], [21, 5], [31, 0], [0, 'ENDBLK']]
    const r = importDxf(file([...anon, ...xref], [[0, 'INSERT'], [8, 'A'], [2, '*U3'], [10, 1], [20, 1], [30, 0], [0, 'INSERT'], [8, 'A'], [2, 'Plano|Marco'], [10, 0], [20, 0], [30, 0]]))
    expect(r.entities.map((e) => e.type)).toEqual(['LINE', 'LINE'])
    expect(r.blocks).toBeUndefined()
  })

  it('escala no uniforme y extrusión: la inserción las guarda y la geometría cae donde caía desarmada', () => {
    const placa: P = [[0, 'BLOCK'], [8, '0'], [2, 'Placa'], [70, 0], [10, 0], [20, 0], [30, 0], [0, 'LINE'], [8, '0'], [10, 0], [20, 0], [30, 0], [11, 40], [21, 20], [31, 0], [0, 'ENDBLK']]
    const r = importDxf(file(placa, [[0, 'INSERT'], [8, 'A'], [2, 'Placa'], [10, 300], [20, 0], [30, 0], [41, 2], [42, 0.5], [0, 'INSERT'], [8, 'B'], [2, 'Placa'], [10, -400], [20, 0], [30, 0], [210, 0], [220, 0], [230, -1]]))
    expect(r.entities[0].props).toMatchObject({ scale: [2, 0.5, 1] })
    expect(r.entities[1].props).toMatchObject({ position: [400, 0, 0], normal: [0, 0, -1] })
    const lines = importedView(r).map((e) => e.props as unknown as { start: number[]; end: number[] })
    expect(lines[0].end).toEqual([380, 10, 0])
    ;[360, 20, 0].forEach((v, i) => expect(lines[1].end[i]).toBeCloseTo(v, 9))
  })

  it('ATTRIB y ATTDEF: la justificación vertical va en el 74 (arriba: el punto 11 baja un alto)', () => {
    const r = importDxf(dxf([[0, 'SECTION'], [2, 'ENTITIES'], [0, 'ATTDEF'], [8, '0'], [10, 0], [20, 0], [30, 0], [11, 3], [21, 10], [31, 0], [40, 2], [1, ''], [2, 'TAG'], [3, ''], [70, 0], [72, 0], [73, 0], [74, 3], [0, 'ENDSEC'], [0, 'EOF']]))
    expect((r.entities[0].props as unknown as TextProps).position).toEqual([3, 8, 0])
  })
})

describe('importDxf ▸ capas congeladas (como en el CAD clásico)', () => {
  it('lo que hay dentro de una inserción en una capa congelada queda en esa capa (se oculta entero)', () => {
    const pairs: Array<[number, string | number]> = [
      [0, 'SECTION'], [2, 'TABLES'], [0, 'TABLE'], [2, 'LAYER'],
      [0, 'LAYER'], [2, 'Pieza'], [70, 1], [62, 1], [6, 'CONTINUOUS'],
      [0, 'LAYER'], [2, 'Ejes'], [70, 0], [62, 2], [6, 'CONTINUOUS'],
      [0, 'ENDTAB'], [0, 'ENDSEC'],
      [0, 'SECTION'], [2, 'BLOCKS'],
      [0, 'BLOCK'], [2, 'Eje'], [10, 0], [20, 0], [30, 0],
      [0, 'LINE'], [8, 'Ejes'], [10, 0], [20, 0], [30, 0], [11, 5], [21, 0], [31, 0],
      [0, 'ENDBLK'], [0, 'ENDSEC'],
      [0, 'SECTION'], [2, 'ENTITIES'],
      [0, 'INSERT'], [8, 'Pieza'], [2, 'Eje'], [10, 0], [20, 0], [30, 0],
      [0, 'INSERT'], [8, 'Ejes'], [2, 'Eje'], [10, 10], [20, 0], [30, 0],
      [0, 'ENDSEC'], [0, 'EOF'],
    ]
    const r = importDxf(pairs.map(([c, v]) => `${c}\n${v}`).join('\n') + '\n')
    expect(r.layers.find((l) => l.name === 'Pieza')?.frozen).toBe(true)
    expect(r.entities.map((e) => `${e.type} ${e.layerName}`).sort()).toEqual(['INSERT Ejes', 'INSERT Pieza'])
    // Al dibujar, la inserción en la capa congelada no se ve (su línea está en otra capa); al exportar, va a esa capa.
    expect(importedView(r, { skipLayers: new Set(['Pieza']) }).map((e) => e.layerName)).toEqual(['Ejes'])
    expect(importedView(r, { frozenInto: new Set(['Pieza']) }).map((e) => e.layerName).sort()).toEqual(['Ejes', 'Pieza'])
  })
})

describe('entidades de DWG/DXF que Cota dibuja con piezas simples', () => {
  const dxf = (...recs: string[]) => `0\nSECTION\n2\nENTITIES\n${recs.join('')}0\nENDSEC\n0\nEOF\n`
  const rec = (type: string, ...pairs: Array<[number, string | number]>) => `0\n${type}\n8\nA\n${pairs.map(([k, v]) => `${k}\n${v}\n`).join('')}`
  const lineLayer: Layer = { id: 'A', name: 'A', color: '#ffffff', lineWeight: 0.25, lineType: 'CONTINUOUS', locked: false, visible: true, printable: true }

  it('XLINE y RAY son líneas infinitas y salen como lo que son al exportar', () => {
    const r = importDxf(dxf(rec('XLINE', [10, 1], [20, 2], [30, 0], [11, 0], [21, 1], [31, 0]), rec('RAY', [10, 0], [20, 0], [30, 0], [11, 1], [21, 0], [31, 0])))
    expect(r.entities.map((e) => (e.props as { extend?: string }).extend)).toEqual(['both', 'end'])
    expect(r.entities[0].props).toMatchObject({ start: [1, 2, 0], end: [1, 3, 0] })
    const out = exportDxf(r.entities.map((e, i) => ({ id: `e${i}`, type: e.type, layer: 'A', props: e.props }) as Entity), [lineLayer])
    const back = importDxf(out)
    expect(back.entities.map((e) => (e.props as { extend?: string }).extend)).toEqual(['both', 'end'])
    expect(back.entities[0].props).toMatchObject({ start: [1, 2, 0], end: [1, 3, 0] })
  })

  it('MLINE: una polilínea por elemento, con los ingletes', () => {
    const v = (x: number, y: number, dx: number, dy: number, mx: number, my: number, a: number, b: number): Array<[number, number]> => [[11, x], [21, y], [31, 0], [12, dx], [22, dy], [32, 0], [13, mx], [23, my], [33, 0], [74, 2], [41, a], [41, 0], [75, 0], [74, 2], [41, b], [41, 0], [75, 0]]
    const r = importDxf(dxf(rec('MLINE', [71, 1], [72, 2], [73, 2], [10, 0], [20, 0], [30, 0], ...v(0, 0, 1, 0, 0, 1, 1, -1), ...v(10, 0, 1, 0, 0, 1, 1, -1))))
    expect(r.entities.map((e) => (e.props as { vertices: number[][] }).vertices)).toEqual([[[0, 1, 0], [10, 1, 0]], [[0, -1, 0], [10, -1, 0]]])
  })

  it('MULTILEADER: la directriz con su flecha y el texto', () => {
    const r = importDxf(
      dxf(rec('MULTILEADER', [300, 'CONTEXT_DATA{'], [41, 3], [140, 2], [304, 'Nota \\Puno'], [12, 20], [22, 10], [32, 0], [302, 'LEADER{'], [10, 15], [20, 10], [30, 0], [304, 'LEADER_LINE{'], [10, 0], [20, 0], [30, 0], [305, '}'], [303, '}'], [301, '}'])),
    )
    expect(r.entities.map((e) => e.type)).toEqual(['POLYLINE', 'HATCH', 'TEXT'])
    expect((r.entities[0].props as { vertices: number[][] }).vertices).toEqual([[0, 0, 0], [15, 10, 0]])
    expect(r.entities[2].props).toMatchObject({ text: 'Nota \nuno', height: 3, position: [20, 10, 0] })
  })

  it('TOLERANCE: marco con una casilla por valor y el símbolo dibujado', () => {
    const r = importDxf(dxf(rec('TOLERANCE', [3, 'Standard'], [10, 0], [20, 0], [30, 0], [1, '{\\Fgdt;j}%%v0.2%%vA'], [11, 1], [21, 0], [31, 0])))
    const types = r.entities.map((e) => e.type)
    expect(types.filter((t) => t === 'POLYLINE')).toHaveLength(3) // tres casillas
    expect(types).toContain('CIRCLE') // el círculo del símbolo de posición
    expect(r.entities.filter((e) => e.type === 'TEXT').map((e) => (e.props as { text: string }).text)).toEqual(['0.2', 'A'])
  })

  it('MTEXT con sangría de párrafo: alineado a la izquierda, el texto empieza corrido (en altos de texto)', () => {
    const r = importDxf(dxf(rec('MTEXT', [10, 100], [20, 50], [30, 0], [40, 5], [71, 1], [1, '\\pxi2;Celda'])))
    expect((r.entities[0].props as { position: number[] }).position[0]).toBeCloseTo(110)
  })

  it('fuente y ancho de los textos: del estilo (STYLE), del código 41 y del formato del MTEXT; vuelven al exportar', () => {
    const tables =
      '0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nSTYLE\n' +
      '0\nSTYLE\n2\nAngosta\n70\n0\n40\n0\n41\n1\n3\nARIALN.TTF\n' +
      '0\nSTYLE\n2\nTitulo\n70\n0\n40\n0\n41\n1\n3\narialbd.ttf\n' +
      '0\nSTYLE\n2\nTrazo\n70\n0\n40\n0\n41\n0.8\n3\nsimplex.shx\n0\nENDTAB\n0\nENDSEC\n'
    const r = importDxf(
      tables +
        dxf(
          rec('TEXT', [7, 'Angosta'], [10, 0], [20, 0], [30, 0], [40, 2], [1, 'A']),
          rec('TEXT', [7, 'Trazo'], [10, 0], [20, 0], [30, 0], [40, 2], [41, 1.5], [1, 'B']),
          rec('MTEXT', [7, 'Titulo'], [10, 0], [20, 0], [30, 0], [40, 4], [1, 'Obra']),
          rec('MTEXT', [7, 'Standard'], [10, 0], [20, 0], [30, 0], [40, 4], [1, '{\\fArial Narrow|b1|i0;\\H0.5x;Celda}']),
        ),
    )
    const look = (i: number) => {
      const { font, bold, widthFactor, height } = r.entities[i].props as TextProps
      return { font, bold, widthFactor, height }
    }
    expect(look(0)).toEqual({ font: 'Arial', bold: undefined, widthFactor: 0.82, height: 2 })
    expect(look(1)).toEqual({ font: undefined, bold: undefined, widthFactor: 1.5, height: 2 }) // el 41 del texto manda
    expect((r.entities[1].props as TextProps).stroke).toBe(true) // SHX: con la fuente de un trazo
    expect(look(2)).toEqual({ font: 'Arial', bold: true, widthFactor: undefined, height: 4 })
    expect(look(3)).toEqual({ font: 'Arial', bold: true, widthFactor: 0.82, height: 2 })
    expect((r.entities[2].props as TextProps).runs).toBeUndefined() // un solo formato: no hacen falta tramos
    const mixed = importDxf(dxf(rec('MTEXT', [10, 0], [20, 0], [30, 0], [40, 4], [1, '{\\fArial|b1;Obra\\fArial|b0;: \\H0.5x;Nombre}'])))
    expect((mixed.entities[0].props as TextProps).runs).toEqual([{ s: 'Obra', b: true, f: 'Arial' }, { s: ': ', f: 'Arial' }, { s: 'Nombre', f: 'Arial', h: 0.5 }])
    const back = importDxf(exportDxf(r.entities.map((e, i) => ({ id: `t${i}`, type: 'TEXT', layer: 'A', props: e.props })) as never, [lineLayer]))
    expect(back.entities.map((e) => [(e.props as TextProps).font, (e.props as TextProps).bold, (e.props as TextProps).widthFactor])).toEqual([
      [undefined, undefined, 0.82],
      [undefined, undefined, 1.5],
      ['Arial', true, undefined],
      ['Arial', true, 0.82],
    ])
  })

  it('cotas: los cambios propios de cada una (DSTYLE) y los decimales con que se veía (el texto de su bloque)', () => {
    expect(shownDecimals('\\A1;32.90', 32.89999)).toBeNull() // sin decodificar no es el número
    expect(shownDecimals('32.90', 32.89999)).toBe(2)
    expect(shownDecimals('12', 12.0004)).toBe(0)
    expect(shownDecimals('33.10', 32.9)).toBeNull()
    const dim = (blk: string, m: number, ...xd: Array<[number, string | number]>) =>
      rec('DIMENSION', [2, blk], [3, 'Standard'], [70, 32], [10, 10], [20, 5], [30, 0], [13, 0], [23, 0], [33, 0], [14, m], [24, 0], [34, 0], [42, m], ...xd)
    const blocks = '0\nSECTION\n2\nBLOCKS\n0\nBLOCK\n2\n*D1\n10\n0\n20\n0\n30\n0\n0\nMTEXT\n8\n0\n10\n5\n20\n1\n30\n0\n40\n1\n1\n\\A1;32.90\n0\nENDBLK\n0\nENDSEC\n'
    const r = importDxf(blocks + dxf(dim('*D1', 32.89999), dim('*D9', 12, [1001, 'ACAD'], [1000, 'DSTYLE'], [1002, '{'], [1070, 271], [1070, 1], [1070, 140], [1040, 0.4], [1002, '}'])))
    const dims = r.entities.filter((e) => e.type === 'DIMENSION').map((e) => e.props as { overrides?: Record<string, unknown>; style: { DIMDEC: number; DIMTXT: number } })
    expect(dims[0].overrides).toEqual({ DIMDEC: 2 })
    expect(dims[0].style.DIMDEC).toBe(2)
    expect(dims[1].overrides).toEqual({ DIMDEC: 1, DIMTXT: 0.4 })
    expect(dims[1].style.DIMTXT).toBe(0.4)
    // Un texto propio con formato: plano, y su alto relativo agranda el de la cota (0.2 × 20 = 4).
    const o = importDxf(dxf(dim('*D9', 12, [1, '{\\H20x;90.00}'], [1001, 'ACAD'], [1000, 'DSTYLE'], [1002, '{'], [1070, 140], [1040, 0.2], [1002, '}'])))
    const od = o.entities[0].props as { textOverride: string; style: { DIMTXT: number } }
    expect(od.textOverride).toBe('90.00')
    expect(od.style.DIMTXT).toBeCloseTo(4)
  })

  it('cotas: la fuente de su texto sale del estilo de texto del estilo de cota, o del suyo propio', () => {
    const tables =
      '0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nSTYLE\n' +
      '0\nSTYLE\n5\nA1\n2\nTT\n70\n0\n40\n0\n41\n1\n3\narial.ttf\n' +
      '0\nSTYLE\n5\nA2\n2\nTR\n70\n0\n40\n0\n41\n1\n3\ntimes.ttf\n0\nENDTAB\n' +
      '0\nTABLE\n2\nDIMSTYLE\n0\nDIMSTYLE\n2\nStandard\n70\n0\n340\nA1\n0\nENDTAB\n0\nENDSEC\n'
    const dim = (...xd: Array<[number, string | number]>) =>
      rec('DIMENSION', [3, 'Standard'], [70, 32], [10, 10], [20, 5], [30, 0], [13, 0], [23, 0], [33, 0], [14, 10], [24, 0], [34, 0], [42, 10], ...xd)
    const r = importDxf(tables + dxf(dim(), dim([1001, 'ACAD'], [1000, 'DSTYLE'], [1002, '{'], [1070, 340], [1005, 'A2'], [1002, '}'])))
    expect(r.entities.map((e) => (e.props as { textFont?: string }).textFont)).toEqual(['Arial', 'Times New Roman'])
  })

  it('cotas: su color propio (420/62), grosor y transparencia se leen y vuelven al exportar', () => {
    const dim = (...own: Array<[number, string | number]>) =>
      rec('DIMENSION', [8, 'A'], ...own, [3, 'Standard'], [70, 32], [10, 10], [20, 5], [30, 0], [13, 0], [23, 0], [33, 0], [14, 10], [24, 0], [34, 0], [42, 10])
    const r = importDxf(dxf(dim([420, 0]), dim([62, 3], [370, 40], [440, 0x02000080]), dim()))
    const own = (es: typeof r.entities) => es.map((e) => [e.color, e.lineWeight, e.transparency])
    expect(own(r.entities)).toEqual([['#000000', undefined, undefined], ['#00ff00', 0.4, 0.498], [undefined, undefined, undefined]])
    const back = importDxf(exportDxf(r.entities.map((e, i) => ({ id: `d${i}`, type: e.type, layer: 'A', props: e.props, color: e.color, lineWeight: e.lineWeight, transparency: e.transparency })) as never, [lineLayer]))
    expect(own(back.entities)).toEqual(own(r.entities))
  })

  it('WIPEOUT: una máscara con su contorno (rectángulo o polígono), del color del fondo; vuelve como WIPEOUT', () => {
    const r = importDxf(dxf(rec('WIPEOUT', [10, 0], [20, 0], [30, 0], [11, 4], [21, 0], [31, 0], [12, 0], [22, 2], [32, 0], [13, 1], [23, 1], [280, 1], [71, 2], [91, 3], [14, -0.5], [24, 0.5], [14, 0.5], [24, 0.5], [14, 0], [24, -0.5])))
    expect(r.entities).toHaveLength(1)
    const h = r.entities[0].props as { wipeout?: boolean; pattern: string; loops: Array<{ vertices: number[][] }> }
    expect(h.wipeout).toBe(true)
    expect(h.pattern).toBe('SOLID')
    expect(h.loops[0].vertices).toEqual([[0, 0, 0], [4, 0, 0], [2, 2, 0]])
    expect(r.simplified).toBeUndefined()
    const back = importDxf(exportDxf([{ id: 'w', type: 'HATCH', layer: 'A', props: r.entities[0].props } as never], [lineLayer]))
    const bh = back.entities[0].props as typeof h
    expect(bh.wipeout).toBe(true)
    expect(bh.loops[0].vertices.slice(0, 3).map((q) => q.map((x) => Math.round(x * 1e9) / 1e9))).toEqual([[0, 0, 0], [4, 0, 0], [2, 2, 0]])
  })

  it('transparencia (440): la opacidad del objeto se lee como su transparencia y vuelve igual al exportar', () => {
    const r = importDxf(dxf(rec('LINE', [10, 0], [20, 0], [30, 0], [11, 1], [21, 0], [31, 0], [440, 0x02000033]), rec('LINE', [10, 0], [20, 0], [30, 0], [11, 1], [21, 0], [31, 0], [440, 0x020000ff])))
    expect(r.entities.map((e) => e.transparency)).toEqual([0.8, undefined])
    const back = importDxf(exportDxf(r.entities.map((e, i) => ({ id: `l${i}`, type: e.type, layer: 'A', props: e.props, ...(e.transparency ? { transparency: e.transparency } : {}) })) as never, [lineLayer]))
    expect(back.entities.map((e) => e.transparency)).toEqual([0.8, undefined])
  })

  it('SPLINE definida sólo por los puntos por donde pasa (11/21/31): se dibuja por ellos', () => {
    const r = importDxf(dxf(rec('SPLINE', [70, 0], [71, 3], [74, 3], [12, 1], [22, 0], [32, 0], [11, 0], [21, 0], [31, 0], [11, 5], [21, 2], [31, 0], [11, 10], [21, 0], [31, 0])))
    expect(r.entities[0].props).toEqual({ controlPoints: [[0, 0, 0], [5, 2, 0], [10, 0, 0]], degree: 3 })
  })

  it('IMAGE: la imagen con su lugar, su tamaño y el archivo; vuelve igual al exportar', () => {
    const r = importDxf(
      `${dxf(rec('IMAGE', [10, 1], [20, 1], [30, 0], [11, 0.5], [21, 0], [31, 0], [12, 0], [22, 0.5], [32, 0], [13, 20], [23, 10], [340, 'AB'], [280, 1], [71, 1], [91, 2], [14, 1.5], [24, 2.5], [14, 9.5], [24, 7.5], [283, 30]))}0\nSECTION\n2\nOBJECTS\n0\nIMAGEDEF\n5\nAB\n1\nC:\\fotos\\logo.png\n0\nENDSEC\n`,
    )
    expect(r.entities).toHaveLength(1)
    const e = r.entities[0]
    expect(e.type).toBe('IMAGE')
    expect(e.props).toEqual({ origin: [1, 1, 0], u: [0.5, 0, 0], v: [0, 0.5, 0], size: [20, 10], file: 'C:\\fotos\\logo.png', clip: [[1.5, 2.5], [9.5, 7.5]], fade: 30 })
    expect(r.simplified).toBeUndefined()
    const back = importDxf(exportDxf([{ id: 'i', type: 'IMAGE', layer: 'A', props: { ...(e.props as ImageProps), data: 'data:image/png;base64,AAAA' } }], [lineLayer]))
    expect(back.entities[0].props).toEqual(e.props) // los píxeles no viajan: el DXF guarda la ruta
  })

  it('una malla se exporta como caras 3D', () => {
    const mesh = { id: 'm', type: 'MESH3D', layer: 'A', props: { vertices: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 1]], faces: [[0, 1, 2, 3]] } } as unknown as Entity
    const back = importDxf(exportDxf([mesh], [lineLayer]))
    expect(back.entities[0].type).toBe('MESH3D')
    expect((back.entities[0].props as { vertices: number[][] }).vertices).toEqual([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 1]])
  })

  it('el espacio papel no se mezcla con el modelo: va a su hoja, con sus viewports y en mm desde la esquina', () => {
    const paper = [
      rec('LINE', [67, 1], [10, 0], [20, 0], [30, 0], [11, 10], [21, 0], [31, 0]),
      rec('VIEWPORT', [67, 1], [10, 100], [20, 50], [30, 0], [40, 400], [41, 200], [69, 1]),
      rec('VIEWPORT', [67, 1], [10, 50], [20, 40], [30, 0], [40, 80], [41, 60], [12, 5], [22, 7], [16, 0], [26, 0], [36, 1], [17, 1000], [27, 2000], [37, 0], [45, 120], [69, 2]),
    ]
    const r = importDxf(
      `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nBLOCK_RECORD\n0\nBLOCK_RECORD\n5\nB1\n2\n*Paper_Space\n0\nENDTAB\n0\nENDSEC\n` +
        dxf(rec('LINE', [10, 1], [20, 1], [30, 0], [11, 2], [21, 2], [31, 0]), ...paper) +
        `0\nSECTION\n2\nOBJECTS\n0\nLAYOUT\n5\nC1\n100\nAcDbPlotSettings\n40\n5\n41\n6\n42\n7\n43\n8\n44\n420\n45\n297\n72\n1\n73\n0\n100\nAcDbLayout\n1\nPlano\n71\n1\n330\nB1\n0\nENDSEC\n`,
    )
    expect(r.entities).toHaveLength(1)
    const [l] = r.layouts!
    expect(l).toMatchObject({ name: 'Plano', width: 420, height: 297, margins: [8, 7, 6, 5] })
    expect(l.entities[0].props).toMatchObject({ start: [5, 6, 0], end: [15, 6, 0] })
    expect(l.viewports).toHaveLength(1)
    expect(l.viewports[0]).toMatchObject({ center: [55, 46, 0], width: 80, height: 60, target: [1005, 2007, 0], mmPerUnit: 0.5 })
  })
})

describe('atributos invisibles', () => {
  it('un ATTRIB con 70 bit 1 no se dibuja; uno visible sí', () => {
    const rec = (flags: number, text: string) => `0\nATTRIB\n8\n0\n10\n0\n20\n0\n30\n0\n40\n2\n1\n${text}\n2\nTAG\n70\n${flags}\n`
    const r = importDxf(`0\nSECTION\n2\nENTITIES\n${rec(1, 'oculto')}${rec(0, 'visible')}0\nENDSEC\n0\nEOF\n`)
    expect(r.entities.map((e) => (e.props as { text: string }).text)).toEqual(['visible'])
  })
})
