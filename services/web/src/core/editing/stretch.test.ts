import { describe, it, expect } from 'vitest'
import type { Entity, SolidProps } from '../document/types'
import type { Vec3 } from '../math'
import { stretchBox, stretchEntity, stretchSolid } from './stretch'

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

describe('STRETCH de sólidos (vista Front, ventana en el plano XZ)', () => {
  const front = { u: [1, 0, 0] as Vec3, v: [0, 0, 1] as Vec3 }
  const board = (x0: number, x1: number): SolidProps => ({ op: 'EXTRUDE', profile: [[x0, 0, 0], [x1, 0, 0], [x1, 0, 18], [x0, 0, 18]], height: 80, axis: [0, -1, 0] })
  it('un tablero que cruza la ventana se alarga; uno adentro se mueve; uno afuera queda', () => {
    const box = stretchBox([90, 0, -10], [130, 0, 30], front)
    const long = stretchSolid(board(0, 100), box, [20, 0, 0])
    expect(long.hits).toBe(4)
    expect((long.props as { profile: Vec3[] }).profile.map((v) => v[0])).toEqual([0, 120, 120, 0])
    expect(stretchSolid(board(100, 120), box, [20, 0, 0])).toMatchObject({ hits: 8, total: 8 })
    expect(stretchSolid(board(0, 50), box, [20, 0, 0]).hits).toBe(0)
  })
  it('una unión estira cada pieza y la entidad responde como reemplazo', () => {
    const e = { id: 's', type: 'SOLID3D', layer: '0', props: { op: 'UNION', operands: [board(0, 100), board(100, 120)] } } as unknown as Entity
    const out = stretchEntity(e, stretchBox([90, 0, -10], [130, 0, 30], front), [20, 0, 0])
    expect(out.kind).toBe('replace')
    const ops = ((out as { input: { props: { operands: Array<{ profile: Vec3[] }> } } }).input.props.operands).map((o) => o.profile.map((v) => v[0]))
    expect(ops).toEqual([[0, 120, 120, 0], [120, 140, 140, 120]])
  })
  it('vista de costado: la tapa adentro cambia la altura de la extrusión', () => {
    const top = { u: [1, 0, 0] as Vec3, v: [0, 1, 0] as Vec3 }
    const r = stretchSolid(board(0, 100), stretchBox([-10, -100, -5], [110, -60, 30], top), [0, -20, 0])
    expect((r.props as { height: number }).height).toBe(100)
  })
})
