import { describe, expect, it } from 'vitest'
import type { Entity, PolylineProps } from '../document/types'
import type { Vec3 } from '../math'
import {
  breakBetween,
  decurvePolyline,
  fitPolyline,
  insertVertex,
  joinPolyline,
  moveVertex,
  reversePolyline,
  setClosed,
  setGlobalWidth,
  splinePolyline,
  straightenBetween,
  toPolyline,
} from './pedit'
import { polylinePoints } from '../geom/polyline'
import { polylineBand } from '../geom/plineWidth'

const L = (id: string, a: Vec3, b: Vec3): Entity => ({ id, type: 'LINE', layer: '0', props: { start: a, end: b } })
const P = (vertices: Vec3[], closed = false, extra: Partial<PolylineProps> = {}): PolylineProps => ({ vertices, closed, ...extra })
const chain = (e: Entity) => ({ id: e.id, p: toPolyline(e)! })

describe('PEDIT: conversión y Join', () => {
  it('línea y arco a polilínea (el arco como bulge)', () => {
    expect(toPolyline(L('a', [0, 0, 0], [10, 0, 0]))).toEqual({ vertices: [[0, 0, 0], [10, 0, 0]], closed: false })
    const arc: Entity = { id: 'r', type: 'ARC', layer: '0', props: { center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI / 2, normal: [0, 0, 1] } }
    const p = toPolyline(arc)!
    expect(p.vertices[1][0]).toBeCloseTo(0, 9)
    expect(p.vertices[1][1]).toBeCloseTo(10, 9)
    expect(p.bulges![0]).toBeCloseTo(Math.tan(Math.PI / 8), 9)
  })

  it('cuatro líneas en cualquier orden y sentido: una polilínea cerrada', () => {
    const main = toPolyline(L('a', [0, 0, 0], [10, 0, 0]))!
    const r = joinPolyline(main, [chain(L('c', [10, 5, 0], [0, 5, 0])), chain(L('b', [10, 5, 0], [10, 0, 0])), chain(L('d', [0, 0, 0], [0, 5, 0]))])
    expect(r.used.sort()).toEqual(['b', 'c', 'd'])
    expect(r.props.closed).toBe(true)
    expect(r.props.vertices.length).toBe(4)
    expect(r.added).toBe(3)
  })

  it('lo que no toca no se une; con fuzz: Extend prolonga hasta cortarse, Add agrega un tramo', () => {
    const main = toPolyline(L('a', [0, 0, 0], [10, 0, 0]))!
    const far = chain(L('f', [11, 1, 0], [11, 10, 0]))
    expect(joinPolyline(main, [far]).used).toEqual([])
    const ext = joinPolyline(main, [far], 2, 'Extend')
    expect(ext.props.vertices).toEqual([[0, 0, 0], [11, 0, 0], [11, 10, 0]])
    const add = joinPolyline(main, [far], 2, 'Add')
    expect(add.props.vertices).toEqual([[0, 0, 0], [10, 0, 0], [11, 1, 0], [11, 10, 0]])
    // Paralelas: Extend no puede; Both agrega.
    const par = chain(L('p', [11, 0.5, 0], [20, 0.5, 0]))
    expect(joinPolyline(main, [par], 2, 'Extend').used).toEqual([])
    expect(joinPolyline(main, [par], 2, 'Both').used).toEqual(['p'])
  })

  it('con fuzz también cierra el hueco entre el principio y el final (Extend)', () => {
    const main = toPolyline(L('a', [-20, -20, 0], [140, -20, 0]))!
    const r = joinPolyline(main, [chain(L('b', [140, -20, 0], [140, 90, 0])), chain(L('c', [140, 90, 0], [-20, 90, 0])), chain(L('d', [-20.4, 90, 0], [-20, -20, 0]))], 1, 'Extend')
    expect(r.props.closed).toBe(true)
    expect(r.props.vertices.length).toBe(4)
  })
})

describe('PEDIT: opciones', () => {
  it('Reverse invierte vértices, bulges y anchos', () => {
    const p = P([[0, 0, 0], [10, 0, 0], [10, 10, 0]], false, { bulges: [0.5, 0, 0], widths: [[1, 2], [3, 4], [0, 0]] })
    const r = reversePolyline(p)
    expect(r.vertices).toEqual([[10, 10, 0], [10, 0, 0], [0, 0, 0]])
    expect(r.bulges).toEqual([-0, -0.5, 0])
    expect(r.widths).toEqual([[4, 3], [2, 1], [0, 0]])
    expect(reversePolyline(r).vertices).toEqual(p.vertices)
  })

  it('Fit pasa por todos los vértices con tangente continua; Decurve vuelve al marco recto', () => {
    const p = P([[0, 0, 0], [10, 10, 0], [20, 0, 0], [30, 10, 0]])
    const f = fitPolyline(p)
    expect(f.fit).toBe('fit')
    expect(f.vertices.length).toBe(7) // un vértice de unión por tramo
    for (const v of p.vertices) expect(f.vertices.some((q) => Math.hypot(q[0] - v[0], q[1] - v[1]) < 1e-9)).toBe(true)
    // Continuidad de la tangente en el vértice 2 (entre los arcos de ambos lados).
    const pts = polylinePoints(f)
    const k = pts.findIndex((q) => Math.hypot(q[0] - 10, q[1] - 10) < 1e-9)
    const d1 = [pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]]
    const d2 = [pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]]
    const cos = (d1[0] * d2[0] + d1[1] * d2[1]) / (Math.hypot(d1[0], d1[1]) * Math.hypot(d2[0], d2[1]))
    expect(cos).toBeGreaterThan(0.99)
    const d = decurvePolyline(f)
    expect(d.vertices).toEqual(p.vertices)
    expect(d.bulges).toBeUndefined()
    expect(d.fit).toBeUndefined()
  })

  it('Spline: pasa por los extremos, guarda el marco y respeta SPLINESEGS', () => {
    const p = P([[0, 0, 0], [10, 10, 0], [20, 0, 0], [30, 10, 0]])
    const s = splinePolyline(p, 6, 8)
    expect(s.fit).toBe('cubic')
    expect(s.frame).toEqual(p.vertices)
    expect(s.vertices[0]).toEqual([0, 0, 0])
    expect(s.vertices[s.vertices.length - 1]).toEqual([30, 10, 0])
    expect(s.vertices.length).toBe(9) // 1 vano útil (4 puntos, grado 3) × 8 + 1
    const closed = splinePolyline({ ...p, closed: true }, 5, 8)
    expect(closed.closed).toBe(true)
    expect(closed.vertices.length).toBe(32)
    // Mover un vértice del marco vuelve a ajustar la curva.
    const m = moveVertex(s, 1, [10, 20, 0])
    expect(m.frame![1]).toEqual([10, 20, 0])
    expect(m.vertices[2][1]).toBeGreaterThan(s.vertices[2][1])
  })

  it('Width, Close/Open, Insert, Straighten y Break', () => {
    const p = P([[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]])
    expect(setGlobalWidth(p, 2).widths).toEqual([[2, 2], [2, 2], [2, 2], [2, 2]])
    expect(setGlobalWidth(setGlobalWidth(p, 2), 0).widths).toBeUndefined()
    expect(setClosed(p, true).closed).toBe(true)
    expect(insertVertex(p, 0, [5, -3, 0]).vertices[1]).toEqual([5, -3, 0])
    const st = straightenBetween(P([[0, 0, 0], [5, 5, 0], [10, 0, 0], [15, 5, 0]]), 0, 2)
    expect(st.vertices).toEqual([[0, 0, 0], [10, 0, 0], [15, 5, 0]])
    const br = breakBetween(p, 1, 2)
    expect(br.map((x) => x.vertices.length)).toEqual([2, 2])
    const brc = breakBetween({ ...p, closed: true }, 1, 1)
    expect(brc.length).toBe(1)
    expect(brc[0].closed).toBe(false)
    expect(brc[0].vertices.length).toBe(5)
  })

  it('banda de una polilínea ancha: un cuadrilátero por tramo recto, con inglete en la esquina', () => {
    const q = polylineBand(P([[0, 0, 0], [10, 0, 0], [10, 10, 0]], false, { widths: [[2, 2], [2, 2], [0, 0]] }))
    expect(q.length).toBe(2)
    // Esquina exterior del inglete en (11, -1).
    expect(q[0].some((v) => Math.abs(v[0] - 11) < 1e-9 && Math.abs(v[1] + 1) < 1e-9)).toBe(true)
  })
})
