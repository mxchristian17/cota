import { describe, expect, it } from 'vitest'
import '../../render/csg'
import type { SolidProps } from '../document/types'
import { edgeChain, edgeLoop, edgeMidpoint, nearestEdge, rayEdge, solidTopology } from './topology'

const box: SolidProps = { op: 'BOX', origin: [0, 0, 0], width: 10, depth: 10, height: 10 }
const cyl: SolidProps = { op: 'CYLINDER', base: [0, 0, 0], radius: 5, height: 10, segments: 48 }

describe('topología derivada de la malla', () => {
  it('caja: 6 caras y 12 aristas rectas convexas', () => {
    const t = solidTopology(box)
    expect(t).not.toBeNull()
    expect(t?.faceCount).toBe(6)
    expect(t?.edges).toHaveLength(12)
    expect(t?.edges.every((e) => e.kind === 'line' && e.convex)).toBe(true)
  })

  it('cilindro: 3 caras y 2 bordes circulares', () => {
    const t = solidTopology(cyl)
    expect(t?.faceCount).toBe(3)
    expect(t?.edges).toHaveLength(2)
    expect(t?.edges.every((e) => e.kind === 'circle' && e.closed && e.convex)).toBe(true)
  })

  it('caja menos caja: aristas cóncavas en el escalón y T-junctions resueltas', () => {
    const step: SolidProps = {
      op: 'SUBTRACT',
      operands: [box, { op: 'BOX', origin: [5, -1, 5], width: 6, depth: 12, height: 6 }],
    }
    const t = solidTopology(step)
    expect(t?.faceCount).toBe(8)
    expect(t?.edges).toHaveLength(18)
    expect(t?.edges.filter((e) => !e.convex)).toHaveLength(1)
    const inner = t?.edges.find((e) => !e.convex)
    expect(inner?.kind).toBe('line')
  })

  it('picking por punto y por rayo, punto medio y lazo de cara', () => {
    const t = solidTopology(box)
    if (!t) throw new Error('sin topología')
    const near = nearestEdge(t, [5, 0.3, 10.2])
    expect(near?.dist).toBeCloseTo(Math.hypot(0.3, 0.2))
    const mid = edgeMidpoint(t.edges[near?.edge ?? 0])
    expect(mid).toEqual([5, 0, 10])
    // Rayo vertical desde arriba sobre el borde y = 0: la arista superior (z = 10) es la más cercana.
    const hit = rayEdge(t, [5, 0.05, 50], [0, 0, -1], 0.1)
    expect(hit?.point[2]).toBeCloseTo(10)
    const e = t.edges[hit?.edge ?? 0]
    const top = e.faces.find((f) => t.edges.filter((x) => x.faces.includes(f)).length === 4) ?? -1
    expect(edgeLoop(t, hit?.edge ?? 0, top)).toHaveLength(4)
    expect(edgeChain(t, hit?.edge ?? 0)).toHaveLength(1)
  })
})

describe('picking de aristas como el pickbox del CAD clásico (revisión 2026-10-13)', () => {
  it('gana la arista más cercana al cursor aunque otra dentro de la tolerancia esté más cerca de la cámara', () => {
    const t = solidTopology(box)
    if (!t) throw new Error('sin topología')
    // Vista ISO SE: el cursor está exactamente sobre la arista vertical (10, 10, z) a media altura; la
    // arista superior (x = 10, z = 10) pasa a menos de la tolerancia y más cerca del observador.
    const d: [number, number, number] = [-1 / Math.sqrt(3), 1 / Math.sqrt(3), -1 / Math.sqrt(3)]
    const p: [number, number, number] = [10, 10, 5]
    const o: [number, number, number] = [p[0] - d[0] * 100, p[1] - d[1] * 100, p[2] - d[2] * 100]
    const hit = rayEdge(t, o, d, 6)
    const e = t.edges[hit?.edge ?? 0]
    expect(edgeMidpoint(e)).toEqual([10, 10, 5])
  })

  it('en estilos sombreados no se toma una arista tapada por el sólido; en alambre, sí', () => {
    const t = solidTopology(box)
    if (!t) throw new Error('sin topología')
    // Desde SE (+x, −y, +z) la arista vertical trasera (0, 10, z) queda detrás de la caja.
    const d: [number, number, number] = [-1 / Math.sqrt(3), 1 / Math.sqrt(3), -1 / Math.sqrt(3)]
    const p: [number, number, number] = [0, 10, 5]
    const o: [number, number, number] = [p[0] - d[0] * 100, p[1] - d[1] * 100, p[2] - d[2] * 100]
    const shaded = rayEdge(t, o, d, 0.5)
    if (shaded) expect(edgeMidpoint(t.edges[shaded.edge])).not.toEqual([0, 10, 5])
    const wire = rayEdge(t, o, d, 0.5, true)
    expect(edgeMidpoint(t.edges[wire?.edge ?? 0])).toEqual([0, 10, 5])
  })

  it('el borde de un agujero en una caja es una sola arista cerrada (tramos unidos por bridgeGaps)', () => {
    const holed: SolidProps = {
      op: 'SUBTRACT',
      operands: [
        { op: 'BOX', origin: [-20, -20, 0], width: 40, depth: 40, height: 10 },
        { op: 'CYLINDER', base: [0, 0, -5], radius: 6, height: 20, segments: 48 },
      ],
    }
    const t = solidTopology(holed)
    if (!t) throw new Error('sin topología')
    const rims = t.edges.filter((e) => e.closed && e.pts.every((q) => Math.abs(Math.hypot(q[0], q[1]) - 6) < 0.1))
    expect(rims).toHaveLength(2) // arriba y abajo, cada uno entero
  })
})

