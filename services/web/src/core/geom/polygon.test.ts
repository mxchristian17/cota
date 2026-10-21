import { describe, it, expect } from 'vitest'
import { bottomEdgeAngle, polygonFromEdge, regularPolygon } from './polygon'
import { makeEngine } from '../../test/engineHarness'

const near = (a: number[], b: number[]) => expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-9)

describe('POLYGON', () => {
  it('inscrito: el punto de radio es un vértice', () => {
    const p = regularPolygon([0, 0, 0], 6, 10, 0, false)
    expect(p).toHaveLength(6)
    near(p[0], [10, 0])
    near(p[1], [5, 10 * Math.sin(Math.PI / 3)])
  })

  it('circunscrito: el radio es la apotema y el punto es el medio de un lado', () => {
    const p = regularPolygon([0, 0, 0], 4, 10, 0, true)
    near(p[0], [10, 10])
    near(p[3], [10, -10])
  })

  it('radio tecleado: la arista inferior queda horizontal', () => {
    for (const circ of [false, true]) {
      const p = regularPolygon([0, 0, 0], 5, 10, bottomEdgeAngle(5, circ), circ)
      const ys = p.map((v) => v[1])
      const min = Math.min(...ys)
      expect(ys.filter((y) => Math.abs(y - min) < 1e-9)).toHaveLength(2)
    }
  })

  it('Edge: el polígono queda a la izquierda del lado', () => {
    const p = polygonFromEdge([0, 0, 0], [10, 0, 0], 4)
    near(p[2], [10, 10])
    near(p[3], [0, 10])
  })

  it('comando: recuerda POLYSIDES y el modo; Edge', async () => {
    const h = makeEngine()
    await h.run('POLYGON', '6', '#0,0', 'C', '5')
    await h.run('POLYGON', '', '#50,0', '', '5')
    await h.run('POLYGON', '3', 'E', '#100,0', '#110,0')
    const pl = h.ofType('POLYLINE').map((e) => e.props as { vertices: number[][]; closed: boolean })
    expect(pl.map((p) => p.vertices.length)).toEqual([6, 6, 3])
    expect(pl.every((p) => p.closed)).toBe(true)
    // Circunscrito (recordado): la apotema es 5 → el lado inferior está en y = −5.
    expect(Math.min(...pl[1].vertices.map((v) => v[1]))).toBeCloseTo(-5, 9)
  })
})
