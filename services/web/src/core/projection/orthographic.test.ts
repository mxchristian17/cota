import { describe, it, expect } from 'vitest'
import { layoutViews, mergeSegments, orthoProject, segmentsBounds, snapToHints, solidCircleHints, viewHints, type Mesh, type ProjSegment } from './orthographic'
import type { Vec3 } from '../math'

/** Caja como malla (8 vértices, 6 caras quad). */
function boxMesh(min: Vec3, max: Vec3): Mesh {
  const [x0, y0, z0] = min
  const [x1, y1, z1] = max
  const vertices: Vec3[] = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ]
  const faces = [
    [0, 1, 2, 3], [4, 5, 6, 7], // z-, z+
    [0, 1, 5, 4], [2, 3, 7, 6], // y-, y+
    [1, 2, 6, 5], [0, 3, 7, 4], // x+, x-
  ]
  return { vertices, faces }
}

describe('orthographic projection', () => {
  it('una caja sola: contorno visible 10×10 (las aristas traseras quedan ocultas tras la cara frontal)', () => {
    const segs = orthoProject([boxMesh([0, 0, 0], [10, 10, 10])], 'front')
    const visible = segs.filter((s) => !s.hidden)
    expect(visible.length).toBeGreaterThan(0)
    // El contorno VISIBLE es un cuadrado de 10×10 en (u=x, v=z).
    const b = segmentsBounds(visible)
    expect(b.maxU - b.minU).toBeCloseTo(10, 3)
    expect(b.maxV - b.minV).toBeCloseTo(10, 3)
  })

  it('una caja detrás de un ocluctor grande: genera aristas ocultas', () => {
    const occluder = boxMesh([0, 5, 0], [3, 6, 3]) // cerca (y grande), tapa la huella x0..3,z0..3
    const target = boxMesh([1, 0, 1], [2, 1, 2]) // lejos (y chico), dentro de la huella
    const segs = orthoProject([occluder, target], 'front')
    expect(segs.some((s) => s.hidden)).toBe(true) // el target queda oculto
    expect(segs.some((s) => !s.hidden)).toBe(true) // el occluder es visible
  })

  it('layout ISO A (tercer diedro): TOP arriba, RIGHT a la derecha del front', () => {
    const box = [boxMesh([0, 0, 0], [10, 10, 10])]
    const front = orthoProject(box, 'front')
    const top = orthoProject(box, 'top')
    const right = orthoProject(box, 'right')
    const laid = layoutViews(front, top, right, false)
    // Debe contener todos los segmentos de las tres vistas.
    expect(laid.length).toBe(front.length + top.length + right.length)
    const all = segmentsBounds(laid)
    const fb = segmentsBounds(front)
    expect(all.maxV).toBeGreaterThan(fb.maxV) // el TOP quedó por encima
    expect(all.maxU).toBeGreaterThan(fb.maxU) // el RIGHT quedó a la derecha
  })

  it('layout ISO E (primer diedro): TOP debajo, RIGHT a la izquierda', () => {
    const box = [boxMesh([0, 0, 0], [10, 10, 10])]
    const laid = layoutViews(orthoProject(box, 'front'), orthoProject(box, 'top'), orthoProject(box, 'right'), true)
    const all = segmentsBounds(laid)
    const fb = segmentsBounds(orthoProject(box, 'front'))
    expect(all.minV).toBeLessThan(fb.minV) // TOP debajo
    expect(all.minU).toBeLessThan(fb.minU) // RIGHT a la izquierda
  })
})

describe('FLATSHOT: fusión de tramos y círculos exactos (revisión 2026-10-13)', () => {
  const seg = (a: [number, number], b: [number, number], hidden = false): ProjSegment => ({ a, b, hidden })

  it('tramos colineales y encadenados quedan en una sola línea', () => {
    const items = mergeSegments([seg([0, 0], [3, 0]), seg([3, 0], [7, 0]), seg([6.5, 0], [10, 0])], 1e-3)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'line', hidden: false })
    const l = items[0] as { a: number[]; b: number[] }
    expect([l.a[0], l.b[0]].sort((x, y) => x - y)).toEqual([0, 10])
  })

  it('un polígono de 48 cuerdas es un círculo; un cuarto de vuelta, un arco', () => {
    const ring = (n: number, sweep: number) =>
      Array.from({ length: n }, (_, i) => {
        const [t0, t1] = [(sweep * i) / n, (sweep * (i + 1)) / n]
        return seg([5 + 20 * Math.cos(t0), 7 + 20 * Math.sin(t0)], [5 + 20 * Math.cos(t1), 7 + 20 * Math.sin(t1)])
      })
    const [c] = mergeSegments(ring(48, 2 * Math.PI), 1e-3)
    expect(c).toMatchObject({ kind: 'circle' })
    const circ = c as { c: number[]; r: number }
    expect(circ.c[0]).toBeCloseTo(5, 1)
    expect(circ.r).toBeCloseTo(20, 0)
    const [a] = mergeSegments(ring(12, Math.PI / 2), 1e-3)
    expect(a).toMatchObject({ kind: 'arc' })
  })

  it('la oculta que cae sobre una visible no se dibuja', () => {
    const items = mergeSegments([seg([0, 0], [10, 0]), seg([0, 0], [10, 0], true), seg([0, 5], [10, 5], true)], 1e-3)
    expect(items.filter((i) => i.hidden)).toHaveLength(1)
    expect(items).toHaveLength(2)
  })

  it('el círculo de una primitiva vista de frente fija centro y radio exactos', () => {
    const hints = solidCircleHints({ op: 'CYLINDER', base: [0, 25, 56], axis: [0, -1, 0], radius: 20, height: 50, segments: 48 })
    // FRONT (x, z) con la vista corrida a (250, 0): el círculo queda en (250, 56).
    const front = viewHints(hints, 'front', [250, 0])
    expect(front).toEqual([{ c: [250, 56], r: 20 }, { c: [250, 56], r: 20 }])
    expect(viewHints(hints, 'top')).toEqual([]) // de canto en planta
    const [snapped] = snapToHints([{ kind: 'circle', c: [250.04, 55.97], r: 19.95, hidden: false }], front)
    expect(snapped).toMatchObject({ c: [250, 56], r: 20 })
  })
})

