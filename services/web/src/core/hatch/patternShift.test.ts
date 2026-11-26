import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../math'
import type { HatchProps, PatternLine } from '../document/types'
import { hatchStrokes, smallDenominator } from './geometry'

/**
 * Patrón lejos de su origen (plano en coordenadas de terreno, millones de unidades): se calcula al lado del
 * sombreado, corriendo el origen un múltiplo de su período común. Así sus elementos cierran aunque los números del
 * archivo dejen cada línea del patrón apenas girada distinto (7–10 cifras), y el dibujo queda en el mismo lugar.
 */

// Cuadrados de lado 1 en una grilla de 2: abajo, arriba, izquierda y derecha. `eps`: giro (rad) de cada línea.
const squares = (eps: number[] = [0, 0, 0, 0]): PatternLine[] => {
  const deg = (r: number) => (r * 180) / Math.PI
  return [
    { angle: 0 + deg(eps[0]), origin: [0, 0], delta: [0, 2], dashes: [1, -1] },
    { angle: 0 + deg(eps[1]), origin: [0, 1], delta: [0, 2], dashes: [1, -1] },
    { angle: 90 + deg(eps[2]), origin: [0, 0], delta: [0, -2], dashes: [1, -1] },
    { angle: 90 + deg(eps[3]), origin: [1, 0], delta: [0, -2], dashes: [1, -1] },
  ]
}

const hatchAt = (x: number, y: number, custom: PatternLine[], w = 20): HatchProps => ({
  loops: [{ vertices: [[x + 0.5, y + 0.5, 0], [x + 0.5 + w, y + 0.5, 0], [x + 0.5 + w, y + 0.5 + w, 0], [x + 0.5, y + 0.5 + w, 0]] }],
  pattern: 'X',
  scale: 1,
  angle: 0,
  origin: [0, 0, 0],
  island: 'outer',
  custom,
})

/** Puntas interiores sin otra punta a menos de `tol` (un cuadrado abierto). */
function looseEnds(p: HatchProps, x: number, y: number, w: number, tol: number): number {
  const ends: Vec3[] = hatchStrokes(p).segs.flatMap((s) => [s[0], s[1]])
  const inner = ends.filter((q) => q[0] > x + 1 && q[0] < x + w && q[1] > y + 1 && q[1] < y + w)
  expect(inner.length).toBeGreaterThan(100)
  return inner.filter((q) => ends.filter((o) => Math.hypot(q[0] - o[0], q[1] - o[1]) < tol).length < 2).length
}

describe('Patrón de sombreado lejos de su origen', () => {
  it('fracciones simples dentro de la precisión del archivo', () => {
    expect(smallDenominator(-8.0000000006)).toBe(1)
    expect(smallDenominator(0.5)).toBe(2)
    expect(smallDenominator(-7 / 3)).toBe(3)
    expect(smallDenominator(Math.SQRT2)).toBeNull()
    expect(smallDenominator(Math.PI / 10)).toBeNull()
  })

  it('con cada línea apenas girada distinto, a millones de unidades los cuadrados siguen cerrados', () => {
    const [X, Y] = [5_000_000, 6_000_000]
    // Giros como los de un DWG (ángulos con 7–8 decimales): a esta distancia, sin traer el patrón, centímetros.
    const p = hatchAt(X, Y, squares([0, 2e-9, -3e-9, 1.5e-9]))
    expect(looseEnds(p, X, Y, 20, 1e-5)).toBe(0)
  })

  it('el dibujo queda en su lugar: las puntas caen en la grilla exacta del patrón', () => {
    const [X, Y] = [5_000_000, 6_000_000]
    const ends = hatchStrokes(hatchAt(X, Y, squares())).segs.flatMap((s) => [s[0], s[1]])
    const inner = ends.filter((q) => q[0] > X + 1 && q[0] < X + 20 && q[1] > Y + 1 && q[1] < Y + 20)
    expect(inner.length).toBeGreaterThan(100)
    for (const q of inner) {
      expect(Math.abs(q[0] - Math.round(q[0]))).toBeLessThan(1e-6)
      expect(Math.abs(q[1] - Math.round(q[1]))).toBeLessThan(1e-6)
    }
  })

  it('cerca del origen no cambia nada', () => {
    const p = hatchAt(3, 4, squares([0, 2e-9, -3e-9, 1.5e-9]))
    const ends = hatchStrokes(p).segs.flatMap((s) => [s[0], s[1]])
    // Esquina de un cuadrado de la grilla original (sin correr): (4, 6) y (5, 6).
    expect(ends.some((q) => Math.hypot(q[0] - 4, q[1] - 6) < 1e-9)).toBe(true)
    expect(looseEnds(p, 3, 4, 20, 1e-6)).toBe(0)
  })
})
