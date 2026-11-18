import { describe, expect, it } from 'vitest'
import type { BlockDef, DimensionProps, Entity } from '../document/types'
import { viewDimFactor } from './viewDims'
import { dimTextContent } from '../dimension/format'
import { formatDim } from '../dimension/dimGeometry'
import { makeEngine } from '../../test/engineHarness'
import { BUILTIN_DIM_VARS } from '../dimension/style'

const block: BlockDef = { name: '*VIEW1', entities: [{ id: 'v1', type: 'LINE', layer: '0', props: { start: [-50, -10, 0], end: [50, -10, 0] } }] }
const view: Entity = {
  id: 'i1',
  type: 'INSERT',
  layer: '0',
  props: { name: '*VIEW1', position: [100, 100, 0], scale: [0.5, 0.5, 0.5], rotation: 0, view: { orientation: 'FRONT', basis: { right: [1, 0, 0], up: [0, 0, 1], out: [0, -1, 0] }, hidden: 'visibleHidden', source: null } },
} as Entity
const dim = (x: number, dimType = 'LINEAR') => ({ dimType, points: [[x, 95, 0]] }) as unknown as DimensionProps

describe('Cotas sobre vistas de dibujo', () => {
  it('una cota con su punto en una vista a escala 1:2 mide la pieza (factor 2); fuera de la vista o angular, no', () => {
    expect(viewDimFactor([view], [block], dim(80))).toBe(2)
    expect(viewDimFactor([view], [block], dim(200))).toBeNull()
    expect(viewDimFactor([view], [block], dim(80, 'ANGULAR'))).toBeNull()
  })
})

describe('Códigos de texto en cotas', () => {
  it('%%c en el texto de una cota se ve como Ø (con <> = la medida)', () => {
    const s = BUILTIN_DIM_VARS['ISO-25']
    expect(dimTextContent('20', 20, s, '%%c<>').main).toBe('Ø20')
    expect(dimTextContent('9', 9, s, '6x %%c9').main).toBe('6x Ø9')
  })
})

describe('Tolerancias y overrides de cotas sobre vistas a escala', () => {
  /** Hoja con una vista 1:2 en (100, 100) y otra 1:1 en (300, 100) de una pieza de 100 × 50. */
  async function sheet() {
    const h = makeEngine()
    h.doc.setActiveTab(h.doc.layouts[0].id)
    const c: Array<[number, number]> = [[-50, -25], [50, -25], [50, 25], [-50, 25]]
    const ents = c.map((p, i) => ({ id: `l${i}`, type: 'LINE', layer: '0', props: { start: [p[0], p[1], 0], end: [c[(i + 1) % 4][0], c[(i + 1) % 4][1], 0] } })) as Entity[]
    const view = { orientation: 'TOP', basis: { right: [1, 0, 0], up: [0, 1, 0], out: [0, 0, 1] }, hidden: 'visible', source: null }
    h.doc.setBlock({ name: '*VIEW1', entities: ents })
    h.doc.setBlock({ name: '*VIEW2', entities: ents })
    h.add('INSERT', { name: '*VIEW1', position: [100, 100, 0], scale: [0.5, 0.5, 0.5], rotation: 0, view })
    h.add('INSERT', { name: '*VIEW2', position: [300, 100, 0], scale: [1, 1, 1], rotation: 0, view })
    await h.run('DIMLINEAR', '#75,112.5', '#125,112.5', '#100,130')
    const ea = h.ofType('DIMENSION').at(-1)!
    await h.run('DIMLINEAR', '#250,125', '#350,125', '#300,140')
    const eb = h.ofType('DIMENSION').at(-1)!
    return { h, a: ea.props as DimensionProps, b: eb.props as DimensionProps, ids: [ea.id, eb.id] }
  }

  it('DIMOVERRIDE DIMTOL en una vista 1:2: 100 ±0,1 (la tolerancia no se multiplica por la escala)', async () => {
    const { h, a } = await sheet()
    expect(formatDim(a)).toBe('100')
    await h.run('DIMOVERRIDE', 'DIMTOL', '1', 'DIMTP', '0.1', 'DIMTM', '0.05', '', '#100,130', '')
    expect(formatDim(a)).toBe('100 +0,1/-0,05')
    await h.run('DIMOVERRIDE', 'DIMTP', '0.1', 'DIMTM', '0.1', '', '#100,130', '')
    expect(formatDim(a)).toBe('100 ±0,1')
  })

  it('DIMOVERRIDE Clear quita la tolerancia pero la cota sigue midiendo la pieza (no el papel)', async () => {
    const { h, a } = await sheet()
    await h.run('DIMOVERRIDE', 'DIMTOL', '1', 'DIMTP', '0.1', 'DIMTM', '0.1', '', '#100,130', '')
    expect(formatDim(a)).toBe('100 ±0,1')
    await h.run('DIMOVERRIDE', 'C', '#100,130', '')
    expect(formatDim(a)).toBe('100')
    expect(a.overrides).toEqual({ DIMLFAC: 2 })
  })

  it('MATCHPROP entre cotas de vistas de distinta escala copia la tolerancia, no el factor de medida', async () => {
    const { h, a, b, ids } = await sheet()
    await h.run('DIMOVERRIDE', 'DIMTOL', '1', 'DIMTP', '0.2', 'DIMTM', '0.2', '', '#100,130', '')
    await h.run('MATCHPROP')
    await h.click(100, 130, ids[0])
    await h.click(300, 140, ids[1])
    await h.run('')
    expect(formatDim(b)).toBe('100 ±0,2')
    expect(formatDim(a)).toBe('100 ±0,2')
  })

  it('R15: DIMLINEAR a mano sobre una vista 1:2 informa y ofrece la medida de la pieza (no la del papel)', async () => {
    const { h } = await sheet()
    h.prints.length = 0
    // Vertical sobre el lado izquierdo de la vista 1:2: 25 de papel = 50 de pieza.
    await h.run('DIMLINEAR', '#75,87.5', '#75,112.5', 'V', 'T', '', '#60,100')
    const out = h.prints.join('\n')
    expect(out).toContain('Enter dimension text <50>')
    expect(out).toContain('Dimension text = 50')
    expect(out).not.toContain('Dimension text = 25')
    expect(formatDim(h.ofType('DIMENSION').at(-1)!.props as DimensionProps)).toBe('50')
  })
})
