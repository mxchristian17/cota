import { describe, expect, it } from 'vitest'
import '../../render/csg'
import { solidMesh } from '../../render/csg'
import type { SolidProps } from '../document/types'
import { viewBasis } from '../drawing/views'
import { compactShade, mapShade, orderShade, shadeRegions, shadeTriangleCount, shadeTriangles, shadeViewTriangles } from './shade'

describe('vistas sombreadas', () => {
  const box: SolidProps = { op: 'BOX', origin: [0, 0, 0], width: 20, depth: 10, height: 5 }
  it('en isométrica se ven tres caras (6 triángulos), cada una con su tono', () => {
    const s = shadeViewTriangles([solidMesh(box)], ['#ff0000'], viewBasis('ISO'))
    expect(shadeTriangleCount(s)).toBe(6)
    const tones = new Set<string>()
    for (let i = 0; i < s.colors.length; i += 3) tones.add(s.colors[i].toFixed(3))
    expect(tones.size).toBe(3) // tres caras, tres tonos de rojo
    for (let i = 1; i < s.colors.length; i += 3) expect(s.colors[i]).toBe(0) // sigue siendo rojo
  })
  it('de frente, una sola cara; los vértices quedan en el plano de la vista', () => {
    const s = shadeViewTriangles([solidMesh(box)], ['#ffffff'], viewBasis('FRONT'))
    expect(shadeTriangleCount(s)).toBe(2)
    for (let i = 2; i < s.tris.length; i += 3) expect(s.tris[i]).toBeLessThan(0) // debajo del papel (profundidad)
    const moved = mapShade(s, (v) => [v[0] + 1, v[1], v[2]])
    expect(moved.tris[0]).toBeCloseTo(s.tris[0] + 1, 12)
  })

  it('se guarda compacto: vértices compartidos y 7 cifras, sin cambiar lo que se ve (B24)', () => {
    // Una placa con un agujero, en una vista girada: números con todas sus cifras, como los de una isométrica real.
    const plate: SolidProps = { op: 'BOX', origin: [0.123456789, 0.987654321, 0], width: 120.0000001, depth: 80.3333333, height: 20.7777777 }
    const raw = shadeViewTriangles([solidMesh(plate)], ['#c0c0c0'], viewBasis('ISO'))
    const legacy = { tris: shadeTriangles(raw), colors: raw.colors.map((c) => c + 1e-9) } // el formato de 2.48
    expect(raw.index).toBeDefined()
    expect(shadeTriangleCount(raw)).toBe(shadeTriangleCount(legacy))
    // Mismos triángulos a menos de una millonésima de la vista; mismo color en 8 bits.
    const a = shadeTriangles(raw)
    for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - legacy.tris[i])).toBeLessThan(1e-4)
    for (let i = 0; i < raw.colors.length; i++) expect(Math.round(raw.colors[i] * 255)).toBe(Math.round(legacy.colors[i] * 255))
    // Pesa mucho menos guardado (antes: 9 números de 17 cifras por triángulo).
    expect(JSON.stringify({ ...raw, ordered: undefined }).length).toBeLessThan(JSON.stringify(legacy).length * 0.55)
    // Compactar otra vez no cambia nada y mover conserva los índices.
    expect(compactShade(raw)).toEqual(raw)
    expect(mapShade(raw, (v) => [v[0] + 1, v[1], v[2]]).index).toEqual(raw.index)
  })

  it('zonas: los triángulos de una cara plana se unen en un solo relleno con su agujero (B16)', () => {
    // Un cuadrado de 10 con un agujero cuadrado de 4 al medio, en 8 triángulos del mismo color, y un triángulo de otro.
    const P = [[0, 0], [10, 0], [10, 10], [0, 10], [3, 3], [7, 3], [7, 7], [3, 7]]
    const T = [[0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]
    const tris = T.flatMap((t) => t.flatMap((k) => [P[k][0], P[k][1], -0.001]))
    const colors = T.flatMap(() => [0.5, 0.5, 0.5])
    tris.push(20, 0, -0.001, 30, 0, -0.001, 20, 10, -0.001)
    colors.push(0.9, 0.2, 0.2)
    const z = shadeRegions({ tris, colors })
    expect(z).toHaveLength(2)
    expect(z[0].loops).toHaveLength(2) // el contorno y el agujero
    expect(z[0].loops.map((l) => l.length).sort()).toEqual([4, 4])
    const area = (l: number[][]) => l.reduce((s, p, i) => s + p[0] * l[(i + 1) % l.length][1] - l[(i + 1) % l.length][0] * p[1], 0) / 2
    expect(z[0].loops.map(area).sort((a, b) => a - b)).toEqual([-16, 100]) // exterior antihorario, agujero al revés
    expect(z[1].rgb).toEqual([0.9, 0.2, 0.2])
  })
  it('orden exacto: una cara detrás del frente con el centro más adelante no lo tapa, y la que no se ve sale (radiador)', () => {
    // A: el frente (10 × 10, z = −0,005). B: un costado largo que nace detrás de A y sale hacia adelante a la derecha:
    // su centro queda más adelante que el de A y, pintando por centros, tapaba a A. C: una cara entera detrás de A.
    const quad = (x0: number, y0: number, x1: number, y1: number, z: (x: number) => number) => {
      const p = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [x, y, z(x)])
      return [p[0], p[1], p[2], p[0], p[2], p[3]].flat()
    }
    const A = quad(0, 0, 10, 10, () => -0.005)
    const B = quad(5, 2, 20, 8, (x) => -0.008 + (x - 5) * 0.0005)
    const C = quad(2, 2, 4, 4, () => -0.009)
    const col = (r: number, g: number, b: number) => [r, g, b, r, g, b]
    const p = orderShade({ tris: [...C, ...A, ...B], colors: [...col(0.1, 0.1, 0.9), ...col(0.5, 0.5, 0.5), ...col(0.9, 0.2, 0.2)] })
    expect(p.ordered).toBe(true)
    const z = shadeRegions(p)
    expect(z.map((r) => r.rgb)).toEqual([[0.9, 0.2, 0.2], [0.5, 0.5, 0.5]]) // B debajo, A encima; C no se pinta
    expect(shadeTriangleCount(p)).toBe(4)
    // Ordenar otra vez no cambia nada.
    expect(orderShade(p)).toEqual(p)
  })

  it('una isométrica sale ordenada y sin caras negras (luz del observador)', () => {
    const s = shadeViewTriangles([solidMesh(box)], ['#ffffff'], viewBasis('SWISO'))
    expect(s.ordered).toBe(true)
    for (let i = 0; i < s.colors.length; i += 3) expect(s.colors[i]).toBeGreaterThan(0.45)
  })
})
