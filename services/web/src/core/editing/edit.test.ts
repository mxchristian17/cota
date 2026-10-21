import { describe, it, expect } from 'vitest'
import { cloneEntityInput, scaleEntity, translateEntity } from './edit'
import type { CircleEntity, DimensionEntity, LineEntity, PolylineEntity, SolidEntity } from '../document/types'
import { DEFAULT_DIM_STYLE } from '../dimension/dimGeometry'

describe('translateEntity', () => {
  it('traslada una línea', () => {
    const e: LineEntity = { id: 'e1', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [10, 0, 0] } }
    translateEntity(e, 5, 3)
    expect(e.props.start).toEqual([5, 3, 0])
    expect(e.props.end).toEqual([15, 3, 0])
  })

  it('traslada un círculo por su centro', () => {
    const e: CircleEntity = {
      id: 'e2',
      type: 'CIRCLE',
      layer: '0',
      props: { center: [0, 0, 0], radius: 5, normal: [0, 0, 1] },
    }
    translateEntity(e, -2, 4)
    expect(e.props.center).toEqual([-2, 4, 0])
    expect(e.props.radius).toBe(5)
  })

  it('traslada todos los vértices de una polilínea', () => {
    const e: PolylineEntity = {
      id: 'e3',
      type: 'POLYLINE',
      layer: '0',
      props: { vertices: [[0, 0, 0], [10, 0, 0]], closed: false },
    }
    translateEntity(e, 1, 1)
    expect(e.props.vertices).toEqual([[1, 1, 0], [11, 1, 0]])
  })

  it('traslada en 3D (dz) una línea — copiar de una diagonal a otra en altura', () => {
    const e: LineEntity = { id: 'e4', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [10, 0, 0] } }
    translateEntity(e, 5, 3, 7)
    expect(e.props.start).toEqual([5, 3, 7])
    expect(e.props.end).toEqual([15, 3, 7])
  })

  it('traslada una cota (puntos + textPos)', () => {
    const e: DimensionEntity = {
      id: 'd1',
      type: 'DIMENSION',
      layer: '0',
      props: { dimType: 'LINEAR', points: [[0, 0, 0], [10, 0, 0]], textPos: [5, 5, 0], style: DEFAULT_DIM_STYLE },
    }
    translateEntity(e, 2, 3, 0)
    expect(e.props.points).toEqual([[2, 3, 0], [12, 3, 0]])
    expect(e.props.textPos).toEqual([7, 8, 0])
  })
})

describe('scaleEntity', () => {
  it('escala un CIRCLE respecto del punto base (centro se aleja ×f, radio ×f)', () => {
    const e: CircleEntity = { id: 'c1', type: 'CIRCLE', layer: '0', props: { center: [10, 0, 0], radius: 5, normal: [0, 0, 1] } }
    scaleEntity(e, [0, 0, 0], 2)
    expect(e.props.center).toEqual([20, 0, 0])
    expect(e.props.radius).toBe(10)
  })

  it('escala un BOX (origen respecto del base + dimensiones)', () => {
    const e: SolidEntity = { id: 's1', type: 'SOLID3D', layer: '0', props: { op: 'BOX', origin: [2, 2, 0], width: 10, depth: 10, height: 4 } }
    scaleEntity(e, [0, 0, 0], 3)
    const p = e.props as { op: 'BOX'; origin: number[]; width: number; depth: number; height: number }
    expect(p.origin).toEqual([6, 6, 0])
    expect([p.width, p.depth, p.height]).toEqual([30, 30, 12])
  })

  it('con base = centro, el punto base queda fijo (factor < 1 achica)', () => {
    const e: CircleEntity = { id: 'c2', type: 'CIRCLE', layer: '0', props: { center: [4, 0, 0], radius: 8, normal: [0, 0, 1] } }
    scaleEntity(e, [4, 0, 0], 0.5)
    expect(e.props.center).toEqual([4, 0, 0])
    expect(e.props.radius).toBe(4)
  })
})

describe('cloneEntityInput', () => {
  it('copia tipo, layer y props (deep copy)', () => {
    const e: LineEntity = { id: 'e1', type: 'LINE', layer: '5', props: { start: [0, 0, 0], end: [1, 1, 0] } }
    const input = cloneEntityInput(e)
    expect(input).toEqual({ type: 'LINE', layer: '5', lineType: 'BYLAYER', ltScale: 1, props: { start: [0, 0, 0], end: [1, 1, 0] } })
    // deep copy: mutar el original no afecta la copia
    e.props.start[0] = 99
    expect((input.props as LineEntity['props']).start[0]).toBe(0)
  })
})
