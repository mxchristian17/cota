import { describe, it, expect } from 'vitest'
import { entityPreviewShapes } from './entityPreview'
import type { CircleEntity, LineEntity, RectangleEntity } from '../document/types'

describe('entityPreviewShapes', () => {
  it('desplaza una línea', () => {
    const e: LineEntity = { id: 'e1', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [10, 0, 0] } }
    const shapes = entityPreviewShapes(e, 5, 3)
    expect(shapes).toEqual([{ kind: 'line', a: { x: 5, y: 3, z: 0 }, b: { x: 15, y: 3, z: 0 } }])
  })

  it('desplaza un rectángulo como polilínea cerrada de 5 puntos', () => {
    const e: RectangleEntity = {
      id: 'e2',
      type: 'RECTANGLE',
      layer: '0',
      props: { corner: [0, 0, 0], width: 20, height: 10 },
    }
    const shapes = entityPreviewShapes(e, 1, 1)
    expect(shapes).toHaveLength(1)
    const s = shapes[0]
    expect(s.kind).toBe('polyline')
    if (s.kind === 'polyline') {
      expect(s.points).toHaveLength(5)
      expect(s.points[0]).toEqual({ x: 1, y: 1, z: 0 })
      expect(s.points[2]).toEqual({ x: 21, y: 11, z: 0 })
      expect(s.points[4]).toEqual(s.points[0])
    }
  })

  it('un círculo dibujado en otra vista conserva su plano (no se ve de canto como una línea)', () => {
    const e: CircleEntity = { id: 'c1', type: 'CIRCLE', layer: '0', props: { center: [0, 0, 0], radius: 5, normal: [1, 0, 0] } }
    expect(entityPreviewShapes(e, 0, 2, 3)).toEqual([{ kind: 'circle', center: { x: 0, y: 2, z: 3 }, radius: 5, normal: [1, 0, 0] }])
  })
})
