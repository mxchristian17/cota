import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../math'
import { acisSamples } from '../../test/acisSamples'
import { DocumentModel } from '../document/DocumentModel'
import type { BrepProps } from '../document/types'
import { brepLeafFromAcis, transformBrep } from './brepLeaf'
import { arcOfCircle, exactEdges, transformEdges, type ExactEdge } from './exactEdges'
import { solidSnapEdges, solidVertices } from './solid'

const doc = DocumentModel.createDefault('t')
const cube = brepLeafFromAcis(doc, acisSamples('sample_AC1032.dwg').find((s) => s.type === 'Solid3D')!.data)!
const [lo, hi] = cube.box

describe('aristas exactas de una pieza importada (sin núcleo)', () => {
  it('las del modelo ACIS: las 12 rectas del cubo y sus 8 vértices, con los valores del modelo', () => {
    const edges = exactEdges(cube)!
    expect(edges).toHaveLength(12)
    expect(edges.every((e) => e.kind === 'line' && e.pts.length === 2)).toBe(true)
    const vs = solidVertices(cube)
    expect(vs).toHaveLength(8)
    for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) expect(vs).toContainEqual([x, y, z])
    // Los snaps toman las mismas: medio de cada recta.
    expect(solidSnapEdges(cube)).toHaveLength(12)
  })

  it('con la matriz de la hoja (movida, reflejada)', () => {
    const moved = transformBrep(cube, (v) => [v[0] + 10, v[1], v[2]])
    expect(solidVertices(moved)).toContainEqual([hi[0] + 10, hi[1], hi[2]])
    const mirrored = transformBrep(cube, (v) => [-v[0], v[1], v[2]])
    expect(solidVertices(mirrored)).toContainEqual([-hi[0], hi[1], hi[2]])
  })
})

describe('arcos exactos', () => {
  const pts = (a0: number, a1: number, n = 9): Vec3[] =>
    Array.from({ length: n }, (_, i) => [Math.cos(a0 + ((a1 - a0) * i) / (n - 1)) * 2, Math.sin(a0 + ((a1 - a0) * i) / (n - 1)) * 2, 0])
  it('el sentido sale de la polilínea; una circunferencia cerrada va de 0 a 0', () => {
    const ccw = arcOfCircle([0, 0, 0], [0, 0, 1], 2, pts(0, Math.PI / 2), false)
    expect(ccw.startAngle).toBeCloseTo(0, 12)
    expect(ccw.endAngle).toBeCloseTo(Math.PI / 2, 12)
    const cw = arcOfCircle([0, 0, 0], [0, 0, 1], 2, pts(Math.PI / 2, 0), false)
    expect(cw.startAngle).toBeCloseTo(0, 12)
    expect(cw.endAngle).toBeCloseTo(Math.PI / 2, 12)
    expect(arcOfCircle([0, 0, 0], [0, 0, 5], 2, pts(0, 2 * Math.PI), true)).toMatchObject({ startAngle: 0, endAngle: 0, normal: [0, 0, 1] })
  })

  it('con una matriz: escala pareja escala el radio; distinta por eje, el círculo pasa a curva', () => {
    const e: ExactEdge = { pts: pts(0, Math.PI), closed: false, kind: 'circle', arc: arcOfCircle([0, 0, 0], [0, 0, 1], 2, pts(0, Math.PI), false) }
    const [scaled] = transformEdges([e], [3, 0, 0, 1, 0, 3, 0, 0, 0, 0, 3, 0])
    expect(scaled.arc?.radius).toBeCloseTo(6, 12)
    expect(scaled.arc?.center).toEqual([1, 0, 0])
    const [stretched] = transformEdges([e], [3, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0])
    expect(stretched.kind).toBe('curve')
    expect(stretched.arc).toBeUndefined()
  })

  it('sin modelo (o sin hoja BREP) no hay aristas exactas de la pieza', () => {
    expect(exactEdges({ ...cube, ref: 'sab-0-nada' } as BrepProps)).toBeNull()
    expect(exactEdges({ op: 'BOX', origin: [0, 0, 0], width: 1, depth: 1, height: 1 })).toBeNull()
  })
})
