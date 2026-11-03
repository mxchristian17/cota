import { describe, expect, it } from 'vitest'
import { acisEdges, satFromDxf } from './acis'

/** Un cuerpo con una recta y un arco de 90° de radio 10 en el origen, trasladado por su `transform` a (100, 0, 0). */
const SAT = `400 2 1 0
9 Cota test 8 ASM 1.0 0
1 1e-06 1e-10
body $-1 $1 $-1 $2 #
lump $-1 $-1 $-1 $0 #
transform $-1 1 0 0 0 1 0 0 0 1 100 0 0 1 no_rotate no_reflect no_shear #
edge $-1 $6 $7 $-1 $10 forward #
edge $-1 $7 $8 $-1 $11 forward #
edge $-1 $9 $9 $-1 $12 forward #
vertex $-1 $3 $13 #
vertex $-1 $3 $14 #
vertex $-1 $4 $15 #
vertex $-1 $5 $16 #
straight-curve $-1 0 0 0 1 0 0 I I #
ellipse-curve $-1 0 0 0 0 0 1 10 0 0 1 I I #
ellipse-curve $-1 50 0 0 0 0 1 5 0 0 1 I I #
point $-1 0 0 0 #
point $-1 10 0 0 #
point $-1 0 10 0 #
point $-1 55 0 0 #
End-of-ACIS-data
`

describe('ACIS', () => {
  const edges = acisEdges(SAT)

  it('una recta queda con sus dos vértices, transformada', () => {
    expect(edges[0]).toEqual([[100, 0, 0], [110, 0, 0]])
  })
  it('un arco se muestrea desde un vértice hasta el otro, a su radio', () => {
    const arc = edges[1]
    expect(arc[0]).toEqual([110, 0, 0])
    expect(arc[arc.length - 1][0]).toBeCloseTo(100)
    expect(arc[arc.length - 1][1]).toBeCloseTo(10)
    for (const p of arc) expect(Math.hypot(p[0] - 100, p[1])).toBeCloseTo(10)
  })
  it('un borde con un solo vértice es la curva cerrada', () => {
    const circle = edges[2]
    expect(circle[0]).toEqual([155, 0, 0])
    expect(circle[circle.length - 1][0]).toBeCloseTo(155)
    expect(circle.length).toBeGreaterThan(32)
  })
  it('un modelo ilegible no rompe la apertura', () => {
    expect(acisEdges(new Uint8Array([65, 83, 77, 32, 66, 105, 110, 97, 114, 121, 70, 105, 108, 101, 52, 0, 1, 2]))).toEqual([])
  })
  it('el SAT de un DXF viene con cada carácter invertido, y el grupo 3 continúa el renglón', () => {
    const enc = (s: string) => [...s].map((c) => (c === ' ' ? ' ' : String.fromCharCode(159 - c.charCodeAt(0)))).join('').replace(/\^/g, '^ ')
    expect(satFromDxf([[8, 'capa'], [1, enc('Autodesk #')], [3, enc('body ')], [1, enc('$-1 #')]])).toBe('Autodesk #\nbody $-1 #\n')
  })
})
