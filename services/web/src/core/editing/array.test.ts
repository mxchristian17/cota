import { describe, it, expect } from 'vitest'
import { entityCentroid, polarAngles, polarTranslation, rectangularOffsets, rotateEntityInput } from './array'
import type { LineEntity, RectangleEntity } from '../document/types'

describe('rectangularOffsets', () => {
  it('genera rows×cols copias excluyendo la original', () => {
    const offs = rectangularOffsets(2, 3, 10, 20)
    expect(offs).toHaveLength(2 * 3 - 1)
    expect(offs).toContainEqual({ dx: 20, dy: 0 }) // columna 1, fila 0
    expect(offs).toContainEqual({ dx: 40, dy: 10 }) // columna 2, fila 1
    expect(offs).not.toContainEqual({ dx: 0, dy: 0 }) // no incluye el original
  })
})

describe('polarAngles', () => {
  it('360° reparte en count (evita solape)', () => {
    const a = polarAngles(4, 360)
    expect(a).toHaveLength(3) // excluye el original
    expect(a[0]).toBeCloseTo(Math.PI / 2, 6) // 90°
  })
  it('ángulo parcial reparte en count-1', () => {
    const a = polarAngles(3, 90)
    expect(a).toHaveLength(2)
    expect(a[0]).toBeCloseTo(Math.PI / 4, 6) // 45°
    expect(a[1]).toBeCloseTo(Math.PI / 2, 6) // 90°
  })
})

describe('rotateEntityInput', () => {
  it('rota una línea 90° alrededor del origen', () => {
    const e: LineEntity = { id: 'l1', type: 'LINE', layer: '0', props: { start: [10, 0, 0], end: [10, 5, 0] } }
    const out = rotateEntityInput(e, [0, 0, 0], Math.PI / 2)
    const p = out.props as LineEntity['props']
    expect(p.start[0]).toBeCloseTo(0, 6)
    expect(p.start[1]).toBeCloseTo(10, 6)
    expect(p.end[0]).toBeCloseTo(-5, 6)
    expect(p.end[1]).toBeCloseTo(10, 6)
  })

  it('un RECTANGLE rotado se convierte en POLYLINE cerrada de 4 vértices', () => {
    const e: RectangleEntity = { id: 'r1', type: 'RECTANGLE', layer: '0', props: { corner: [0, 0, 0], width: 10, height: 4 } }
    const out = rotateEntityInput(e, [0, 0, 0], Math.PI / 6)
    expect(out.type).toBe('POLYLINE')
    const p = out.props as { vertices: number[][]; closed: boolean }
    expect(p.vertices).toHaveLength(4)
    expect(p.closed).toBe(true)
  })
})

describe('entityCentroid / polarTranslation', () => {
  it('centroide de una línea = punto medio', () => {
    const e: LineEntity = { id: 'l', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [10, 4, 0] } }
    expect(entityCentroid(e)).toEqual([5, 2, 0])
  })

  it('polarTranslation orbita el centroide sin rotar el ítem', () => {
    const e: LineEntity = { id: 'l', type: 'LINE', layer: '0', props: { start: [10, 0, 0], end: [10, 0, 0] } }
    // centroide (10,0); rotado 90° sobre el origen → (0,10); traslación = (-10, 10)
    const t = polarTranslation(e, [0, 0, 0], Math.PI / 2)
    expect(t.dx).toBeCloseTo(-10, 6)
    expect(t.dy).toBeCloseTo(10, 6)
  })
})
