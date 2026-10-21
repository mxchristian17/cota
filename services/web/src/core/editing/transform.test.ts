import { describe, it, expect } from 'vitest'
import type { BoxProps, Entity, SolidProps } from '../document/types'
import { boxCorners } from './solid'
import { mirrorAxis, mirrorEntityInput, mirrorPoint, mirrorSolid } from './transform'

const axisY = mirrorAxis([0, 0, 0], [0, 10, 0])! // eje vertical (x = 0)
const axisX = mirrorAxis([0, 0, 0], [10, 0, 0])! // eje horizontal (y = 0)
const axis45 = mirrorAxis([0, 0, 0], [10, 10, 0])! // oblicuo

describe('mirrorPoint', () => {
  it('refleja respecto de un eje vertical y uno horizontal', () => {
    expect(mirrorPoint([5, 3, 2], axisY)).toEqual([-5, 3, 2])
    expect(mirrorPoint([5, 3, 2], axisX)).toEqual([5, -3, 2])
  })

  it('refleja respecto de un eje a 45° (intercambia x e y)', () => {
    const r = mirrorPoint([4, 1, 0], axis45)
    expect(r[0]).toBeCloseTo(1)
    expect(r[1]).toBeCloseTo(4)
  })

  it('un punto sobre el eje no se mueve', () => {
    expect(mirrorPoint([0, 7, 0], axisY)[0]).toBeCloseTo(0)
    expect(mirrorPoint([0, 7, 0], axisY)[1]).toBeCloseTo(7)
  })
})

describe('mirrorEntityInput', () => {
  const line: Entity = { id: 'l', type: 'LINE', layer: '0', props: { start: [1, 0, 0], end: [4, 2, 0] } }
  const rect: Entity = { id: 'r', type: 'RECTANGLE', layer: '0', props: { corner: [2, 1, 0], width: 4, height: 3 } }

  it('refleja una línea', () => {
    const out = mirrorEntityInput(line, axisY)!
    expect(out.type).toBe('LINE')
    expect((out.props as { start: number[]; end: number[] }).start).toEqual([-1, 0, 0])
    expect((out.props as { start: number[]; end: number[] }).end).toEqual([-4, 2, 0])
  })

  it('un rectángulo sigue siendo RECTANGLE con eje paralelo a un eje', () => {
    const out = mirrorEntityInput(rect, axisY)!
    expect(out.type).toBe('RECTANGLE')
    const p = out.props as { corner: number[]; width: number; height: number }
    expect(p.corner).toEqual([-6, 1, 0]) // x: [2,6] → [-6,-2]
    expect(p.width).toBe(4)
    expect(p.height).toBe(3)
  })

  it('un rectángulo con eje oblicuo se convierte en POLYLINE cerrada', () => {
    const out = mirrorEntityInput(rect, axis45)!
    expect(out.type).toBe('POLYLINE')
    const p = out.props as { vertices: number[][]; closed: boolean }
    expect(p.closed).toBe(true)
    expect(p.vertices).toHaveLength(4)
    expect(p.vertices[0][0]).toBeCloseTo(1) // (2,1) → (1,2)
    expect(p.vertices[0][1]).toBeCloseTo(2)
  })

  it('el texto se refleja en posición pero conserva su rotación (MIRRTEXT = 0)', () => {
    const text: Entity = {
      id: 't',
      type: 'TEXT',
      layer: '0',
      props: { position: [3, 1, 0], text: 'A', height: 2.5, rotation: 0.5, justify: 'left', normal: [0, 0, 1] },
    }
    const out = mirrorEntityInput(text, axisY)!
    const p = out.props as { position: number[]; rotation: number }
    expect(p.position).toEqual([-3, 1, 0])
    expect(p.rotation).toBe(0.5)
  })
})

describe('mirrorSolid', () => {
  it('refleja un cilindro (base y eje)', () => {
    const cyl: SolidProps = { op: 'CYLINDER', base: [5, 0, 0], radius: 2, height: 10, segments: 32 } as SolidProps
    expect(mirrorSolid(cyl, axisY)).toBe(true)
    expect((cyl as { base: number[] }).base).toEqual([-5, 0, 0])
  })

  it('una BOX se refleja con eje paralelo a un eje; con eje oblicuo queda con ejes propios', () => {
    const box = (): SolidProps => ({ op: 'BOX', origin: [2, 1, 0], width: 4, depth: 3, height: 5 }) as SolidProps
    const ok = box()
    expect(mirrorSolid(ok, axisY)).toBe(true)
    expect((ok as { origin: number[] }).origin).toEqual([-6, 1, 0])
    const obl = box()
    expect(mirrorSolid(obl, axis45)).toBe(true)
    // Las esquinas reflejadas son las esquinas de la caja nueva (mismo conjunto).
    const key = (v: number[]) => v.map((x) => x.toFixed(6)).join(',')
    const want = boxCorners(box() as BoxProps).flat().map((v) => key(mirrorPoint(v, axis45))).sort()
    expect(boxCorners(obl as BoxProps).flat().map(key).sort()).toEqual(want)
  })
})
