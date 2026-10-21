import { describe, it, expect } from 'vitest'
import type { Entity } from '../document/types'
import { stretchBox, stretchEntity } from './stretch'

// Ventana de cruce que cubre x ∈ [8,12], y ∈ [-2,2]
const box = stretchBox([8, -2, 0], [12, 2, 0])
const d: [number, number, number] = [0, 5, 0]

describe('stretchEntity', () => {
  it('mueve sólo el extremo de la línea que cae dentro de la ventana', () => {
    const line: Entity = { id: 'l', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [10, 0, 0] } }
    const out = stretchEntity(line, box, d)
    expect(out.kind).toBe('replace')
    if (out.kind !== 'replace') return
    const p = out.input.props as { start: number[]; end: number[] }
    expect(p.start).toEqual([0, 0, 0]) // fuera: no se mueve
    expect(p.end).toEqual([10, 5, 0]) // dentro: se desplaza
  })

  it('mueve la entidad entera cuando está toda dentro', () => {
    const line: Entity = { id: 'l', type: 'LINE', layer: '0', props: { start: [9, 0, 0], end: [11, 1, 0] } }
    expect(stretchEntity(line, box, d).kind).toBe('move')
  })

  it('no toca lo que queda fuera', () => {
    const line: Entity = { id: 'l', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [4, 0, 0] } }
    expect(stretchEntity(line, box, d).kind).toBe('none')
  })

  it('un rectángulo con dos esquinas dentro sigue siendo RECTANGLE', () => {
    // Rectángulo (6,-1)-(10,1): las esquinas x=10 caen dentro de la ventana.
    const rect: Entity = { id: 'r', type: 'RECTANGLE', layer: '0', props: { corner: [6, -1, 0], width: 4, height: 2 } }
    const out = stretchEntity(rect, box, [3, 0, 0])
    expect(out.kind).toBe('replace')
    if (out.kind !== 'replace') return
    expect(out.input.type).toBe('RECTANGLE')
    const p = out.input.props as { corner: number[]; width: number; height: number }
    expect(p.corner).toEqual([6, -1, 0])
    expect(p.width).toBe(7) // 4 + 3 de estiramiento
  })

  it('un rectángulo deformado en diagonal pasa a POLYLINE', () => {
    const rect: Entity = { id: 'r', type: 'RECTANGLE', layer: '0', props: { corner: [6, -1, 0], width: 4, height: 2 } }
    // Sólo la esquina (10,-1) cae en la ventana (y=1 queda fuera por poco).
    const narrow = stretchBox([9, -2, 0], [12, -0.5, 0])
    const out = stretchEntity(rect, narrow, [2, 2, 0])
    expect(out.kind).toBe('replace')
    if (out.kind !== 'replace') return
    expect(out.input.type).toBe('POLYLINE')
  })

  it('un círculo se mueve entero si su centro está dentro, y no se deforma', () => {
    const circle: Entity = { id: 'c', type: 'CIRCLE', layer: '0', props: { center: [10, 0, 0], radius: 50, normal: [0, 0, 1] } }
    expect(stretchEntity(circle, box, d).kind).toBe('move')
    const far: Entity = { id: 'c2', type: 'CIRCLE', layer: '0', props: { center: [0, 0, 0], radius: 50, normal: [0, 0, 1] } }
    expect(stretchEntity(far, box, d).kind).toBe('none')
  })

  it('mueve sólo los vértices contenidos de una polilínea', () => {
    const pl: Entity = {
      id: 'p',
      type: 'POLYLINE',
      layer: '0',
      props: { vertices: [[0, 0, 0], [10, 0, 0], [20, 0, 0]], closed: false },
    }
    const out = stretchEntity(pl, box, d)
    expect(out.kind).toBe('replace')
    if (out.kind !== 'replace') return
    const p = out.input.props as { vertices: number[][] }
    expect(p.vertices).toEqual([[0, 0, 0], [10, 5, 0], [20, 0, 0]])
  })
})
