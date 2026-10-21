import { describe, it, expect } from 'vitest'
import { profileOf, profileNormal } from './extrude'
import { solidVertices } from './solid'
import type { LineEntity, PolylineEntity, RectangleEntity, SolidProps } from '../document/types'

describe('profileOf', () => {
  it('rectángulo -> 4 vértices', () => {
    const e: RectangleEntity = {
      id: 'r',
      type: 'RECTANGLE',
      layer: '0',
      props: { corner: [0, 0, 0], width: 10, height: 5 },
    }
    expect(profileOf(e)).toEqual([
      [0, 0, 0],
      [10, 0, 0],
      [10, 5, 0],
      [0, 5, 0],
    ])
  })

  it('polilínea cerrada -> sus vértices; abierta -> null', () => {
    const closed: PolylineEntity = {
      id: 'p',
      type: 'POLYLINE',
      layer: '0',
      props: { vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 0]], closed: true },
    }
    expect(profileOf(closed)).toHaveLength(3)
    const open: PolylineEntity = { ...closed, props: { ...closed.props, closed: false } }
    expect(profileOf(open)).toBeNull()
  })

  it('línea -> null (no es perfil)', () => {
    const e: LineEntity = { id: 'l', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [1, 0, 0] } }
    expect(profileOf(e)).toBeNull()
  })
})

describe('profileNormal', () => {
  it('perfil en el plano XY -> normal ±Z', () => {
    const n = profileNormal([[0, 0, 0], [10, 0, 0], [10, 10, 0]])
    expect(Math.abs(n[2])).toBeCloseTo(1)
    expect(n[0]).toBeCloseTo(0)
    expect(n[1]).toBeCloseTo(0)
  })

  it('perfil en el plano frontal (Y constante) -> normal ±Y', () => {
    const n = profileNormal([[0, 5, 0], [10, 5, 0], [10, 5, 8]])
    expect(Math.abs(n[1])).toBeCloseTo(1)
    expect(n[0]).toBeCloseTo(0)
    expect(n[2]).toBeCloseTo(0)
  })
})

describe('extrude sigue el eje del plano, no +Z', () => {
  it('la tapa se desplaza a lo largo de axis·height (plano frontal → +Y)', () => {
    const props: SolidProps = {
      op: 'EXTRUDE',
      profile: [[0, 0, 0], [10, 0, 0], [10, 0, 8]], // plano XZ (Y=0)
      height: 4,
      axis: [0, 1, 0],
    }
    // solidVertices intercala base/tapa por vértice: [base0, top0, base1, top1, ...].
    const vs = solidVertices(props)
    expect(vs[0]).toEqual([0, 0, 0])
    expect(vs[1]).toEqual([0, 4, 0]) // tapa desplazada en +Y, no en +Z
  })

  it('sin axis (dibujos previos) mantiene compatibilidad extruyendo en +Z', () => {
    const props: SolidProps = { op: 'EXTRUDE', profile: [[0, 0, 0], [10, 0, 0], [10, 10, 0]], height: 3 }
    const vs = solidVertices(props)
    expect(vs[1]).toEqual([0, 0, 3])
  })
})
