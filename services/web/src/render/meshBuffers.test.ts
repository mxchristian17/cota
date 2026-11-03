import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../core/math'
import { meshRender } from './meshBuffers'

describe('mallas indexadas para dibujar', () => {
  it('un cubo con las esquinas compartidas: cada esquina se abre en tres (aristas vivas)', () => {
    const v: Vec3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]
    const f = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    const m = meshRender(v, f)
    expect(m.idx.length).toBe(36)
    expect(m.pos.length / 3).toBe(24)
    // Todas las normales son de un eje (ninguna promediada entre dos caras).
    for (let i = 0; i < m.nor.length; i += 3) expect(Math.max(...[0, 1, 2].map((k) => Math.abs(m.nor[i + k])))).toBeCloseTo(1)
  })

  it('una superficie curva suave comparte los vértices y promedia la normal', () => {
    // Medio cilindro en 12 tramos: 10 grados entre caras vecinas.
    const v: Vec3[] = []
    for (let i = 0; i <= 12; i++) {
      const a = (i * Math.PI) / 18
      v.push([Math.cos(a), Math.sin(a), 0], [Math.cos(a), Math.sin(a), 1])
    }
    const f: number[][] = []
    for (let i = 0; i < 12; i++) f.push([2 * i, 2 * i + 2, 2 * i + 3], [2 * i, 2 * i + 3, 2 * i + 1])
    const m = meshRender(v, f)
    expect(m.pos.length / 3).toBe(v.length)
    // En el medio, la normal apunta hacia afuera del eje (radial).
    const k = m.idx[3 * 12] // un vértice del tramo central
    const [x, y] = [m.pos[k * 3], m.pos[k * 3 + 1]]
    expect(m.nor[k * 3] * x + m.nor[k * 3 + 1] * y).toBeCloseTo(1, 2)
  })

  it('polígonos en abanico y caras degeneradas no rompen la malla', () => {
    const m = meshRender([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0]], [[0, 1, 2, 3], [0, 4, 1]])
    expect(m.idx.length).toBe(9)
    expect(Array.from(m.idx).every((i) => i < m.pos.length / 3)).toBe(true)
  })
})
