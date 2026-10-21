import { describe, expect, it } from 'vitest'
import { exportDxf, importDxf } from './dxf'
import { DEFAULT_DIM_STYLE } from '../dimension/dimGeometry'
import type { DimensionProps, Entity, Layer } from '../document/types'
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
    const t = ent('TEXT', { position: [1, 0, 2], text: 'A', height: 2.5, rotation: 0.3, justify: 'left', normal: [0, -1, 0] })
    const bt = roundTrip(t)
    near(bt.props.position as number[], [1, 0, 2])
    expect(bt.props.rotation as number).toBeCloseTo(0.3, 9)
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
      vars: { LTSCALE: 10, CELTYPE: 'HIDDEN', PSLTSCALE: 0 },
    })
    expect(txt).toContain('LTYPE')
    const r = importDxf(txt)
    expect(r.linetypes.map((d) => d.name)).toEqual(['HIDDEN', 'CENTER'])
    expect(r.linetypes[1].pattern).toEqual([31.75, -6.35, 6.35, -6.35])
    expect(r.layers[0].lineType).toBe('HIDDEN')
    expect(r.entities[0].lineType).toBe('CENTER')
    expect(r.entities[0].ltScale).toBe(2)
    expect(r.vars).toEqual({ LTSCALE: 10, CELTYPE: 'HIDDEN', PSLTSCALE: 0 })
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
