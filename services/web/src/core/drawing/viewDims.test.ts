import { describe, expect, it } from 'vitest'
import type { BlockDef, DimensionProps, Entity } from '../document/types'
import { viewDimFactor } from './viewDims'
import { dimTextContent } from '../dimension/format'
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
