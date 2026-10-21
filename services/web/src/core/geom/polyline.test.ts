import { describe, it, expect } from 'vitest'
import type { PolylineProps } from '../document/types'
import { sweepOf } from './arc'
import {
  angleBulge,
  bulgeAngle,
  bulgeArc,
  bulgeAt,
  hasBulges,
  normalizeBulges,
  polylineArcs,
  polylineMidpoints,
  polylinePoints,
  polylineSegments,
  polylineSpans,
} from './polyline'

/** Bulge de un cuarto de vuelta antihorario. */
const Q = angleBulge(Math.PI / 2)

describe('bulge ↔ ángulo', () => {
  it('bulge = tan(θ/4) y vuelta', () => {
    expect(Q).toBeCloseTo(Math.tan(Math.PI / 8), 9)
    expect(bulgeAngle(Q)).toBeCloseTo(Math.PI / 2, 9)
    expect(bulgeAngle(0)).toBe(0)
    expect(angleBulge(-Math.PI / 2)).toBeCloseTo(-Q, 9)
  })

  it('el tramo recto no tiene arco', () => {
    expect(bulgeArc([0, 0, 0], [10, 0, 0], 0)).toBeNull()
  })

  it('el arco del tramo respeta el barrido y el sentido', () => {
    const ccw = bulgeArc([0, 0, 0], [10, 0, 0], Q)!
    expect(sweepOf(ccw)).toBeCloseTo(Math.PI / 2, 9)
    expect(ccw.center[1]).toBeCloseTo(5, 9) // centro arriba ⇒ el arco pasa por debajo (antihorario)
    const cw = bulgeArc([0, 0, 0], [10, 0, 0], -Q)!
    expect(cw.center[1]).toBeCloseTo(-5, 9)
  })
})

describe('polilínea con tramos curvos', () => {
  const straight: PolylineProps = { vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 0]], closed: false }
  const curved: PolylineProps = { ...straight, bulges: [Q, 0] }

  it('detecta si tiene curvas y lee el bulge por tramo', () => {
    expect(hasBulges(straight)).toBe(false)
    expect(hasBulges(curved)).toBe(true)
    expect(hasBulges({ ...straight, bulges: [0, 0] })).toBe(false)
    expect(bulgeAt(curved, 0)).toBeCloseTo(Q, 9)
    expect(bulgeAt(curved, 1)).toBe(0)
    expect(bulgeAt(straight, 0)).toBe(0)
  })

  it('los tramos incluyen el de cierre sólo si la polilínea es cerrada', () => {
    expect(polylineSpans(straight)).toEqual([[0, 1], [1, 2]])
    expect(polylineSpans({ ...straight, closed: true })).toEqual([[0, 1], [1, 2], [2, 0]])
  })

  it('una polilínea recta no cambia al tesselarse', () => {
    expect(polylinePoints(straight)).toEqual(straight.vertices)
  })

  it('el tramo curvo se tessela conservando los vértices exactos', () => {
    const pts = polylinePoints(curved)
    expect(pts.length).toBeGreaterThan(straight.vertices.length)
    expect(pts[0]).toEqual([0, 0, 0])
    expect(pts[pts.length - 1]).toEqual([10, 10, 0])
    // El vértice intermedio sigue estando tal cual.
    expect(pts.some((p) => p[0] === 10 && p[1] === 0)).toBe(true)
  })

  it('una polilínea cerrada vuelve al primer punto (ya es un anillo)', () => {
    const pts = polylinePoints({ ...curved, closed: true })
    expect(pts[pts.length - 1]).toEqual(pts[0])
  })

  it('los segmentos encadenan los puntos tesselados', () => {
    const segs = polylineSegments(curved)
    expect(segs).toHaveLength(polylinePoints(curved).length - 1)
    expect(segs[0][0]).toEqual([0, 0, 0])
  })

  it('el punto medio del tramo curvo es el del arco, no el de la cuerda', () => {
    const mids = polylineMidpoints(curved)
    expect(mids).toHaveLength(2)
    // Cuerda (0,0)-(10,0) con 90° antihorario: el arco baja (sagita = r − h).
    expect(mids[0][0]).toBeCloseTo(5, 9)
    expect(mids[0][1]).toBeCloseTo(5 - 10 / 2 / Math.sin(Math.PI / 4), 6)
    // Tramo recto: punto medio de la cuerda.
    expect(mids[1]).toEqual([10, 5, 0])
  })

  it('expone los arcos de los tramos curvos con su índice', () => {
    const arcs = polylineArcs(curved)
    expect(arcs).toHaveLength(1)
    expect(arcs[0].span).toEqual([0, 1])
    expect(sweepOf(arcs[0].arc)).toBeCloseTo(Math.PI / 2, 9)
  })

  it('normaliza los bulges al largo de los vértices y descarta los nulos', () => {
    expect(normalizeBulges(straight.vertices, undefined)).toBeUndefined()
    expect(normalizeBulges(straight.vertices, [])).toBeUndefined()
    expect(normalizeBulges(straight.vertices, [0, 0])).toBeUndefined()
    expect(normalizeBulges(straight.vertices, [Q])).toEqual([Q, 0, 0])
  })
})
