import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../math'
import { catmullRomPoint } from './curve'
import {
  catmullRomBezierSpline,
  catmullRomFromBezierSpline,
  clampedUniformKnots,
  dxfSplineThroughPoints,
  nurbsPoint,
  nurbsSamples,
  validKnots,
} from './nurbs'

const bezier = (P: Vec3[], t: number): Vec3 => {
  const a = (1 - t) ** 3
  const b = 3 * t * (1 - t) ** 2
  const c = 3 * t * t * (1 - t)
  const d = t ** 3
  return [0, 1, 2].map((k) => a * P[0][k] + b * P[1][k] + c * P[2][k] + d * P[3][k]) as Vec3
}

/** Mayor distancia de la Catmull-Rom de Cota por `pts` a la polilínea densa `ref`. */
const deviation = (pts: Vec3[], ref: Vec3[]): number => {
  let worst = 0
  for (let i = 0; i + 1 < pts.length; i++) {
    for (let j = 0; j <= 16; j++) {
      const q = catmullRomPoint(pts, i, j / 16)
      let m = Infinity
      for (let k = 0; k + 1 < ref.length; k++) {
        const A = ref[k]
        const B = ref[k + 1]
        const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]]
        const L = d[0] ** 2 + d[1] ** 2 + d[2] ** 2
        const t = L > 0 ? Math.max(0, Math.min(1, ((q[0] - A[0]) * d[0] + (q[1] - A[1]) * d[1] + (q[2] - A[2]) * d[2]) / L)) : 0
        m = Math.min(m, Math.hypot(q[0] - A[0] - t * d[0], q[1] - A[1] - t * d[1], q[2] - A[2] - t * d[2]))
      }
      worst = Math.max(worst, m)
    }
  }
  return worst
}

// Una Bézier en forma de «U» (como el recorte de una plantilla): la curva no pasa por los puntos de control.
const U_SHAPE: Vec3[] = [[0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0]]

describe('nurbs', () => {
  it('nudos: válidos, inválidos y uniformes con extremos fijos', () => {
    expect(validKnots(3, 4, [0, 0, 0, 0, 1, 1, 1, 1])).toBe(true)
    expect(validKnots(3, 4, [0, 0, 0, 1, 1, 1, 1])).toBe(false) // falta uno
    expect(validKnots(3, 4, [0, 0, 0, 0, 1, 0.5, 1, 1])).toBe(false) // decrece
    expect(validKnots(3, 4, [1, 1, 1, 1, 1, 1, 1, 1])).toBe(false) // dominio vacío
    expect(clampedUniformKnots(3, 6)).toEqual([0, 0, 0, 0, 1 / 3, 2 / 3, 1, 1, 1, 1])
    expect(validKnots(3, 6, clampedUniformKnots(3, 6))).toBe(true)
  })

  it('una Bézier (4 puntos, nudos 0000 1111) es la Bézier, cualquiera sea el rango de los nudos', () => {
    for (const knots of [[0, 0, 0, 0, 1, 1, 1, 1], [0.93, 0.93, 0.93, 0.93, 1, 1, 1, 1], [0, 0, 0, 0, 0.078, 0.078, 0.078, 0.078]]) {
      const a = knots[0]
      const b = knots[7]
      for (const t of [0, 0.1, 0.5, 0.77, 1]) {
        const q = nurbsPoint({ degree: 3, controlPoints: U_SHAPE, knots }, a + (b - a) * t)
        const r = bezier(U_SHAPE, t)
        q.forEach((v, i) => expect(v).toBeCloseTo(r[i], 9))
      }
    }
  })

  it('NURBS racional: un cuarto de círculo exacto (grado 2, pesos 1, √2/2, 1)', () => {
    const def = { degree: 2, controlPoints: [[1, 0, 0], [1, 1, 0], [0, 1, 0]] as Vec3[], knots: [0, 0, 0, 1, 1, 1], weights: [1, Math.SQRT1_2, 1] }
    for (let i = 0; i <= 20; i++) expect(Math.hypot(...nurbsPoint(def, i / 20))).toBeCloseTo(1, 12)
    const pts = nurbsSamples(def, 1e-4)
    for (const q of pts) expect(Math.hypot(...q)).toBeCloseTo(1, 12)
    // La Catmull-Rom de Cota por esos puntos queda sobre el círculo.
    const ref = Array.from({ length: 2001 }, (_, i) => [Math.cos((i / 2000) * Math.PI / 2), Math.sin((i / 2000) * Math.PI / 2), 0] as Vec3)
    expect(deviation(pts, ref)).toBeLessThan(1e-4)
  })

  it('puntos de paso de una SPLINE de DXF: la forma real, no los puntos de control', () => {
    const pts = dxfSplineThroughPoints(3, U_SHAPE, [0, 0, 0, 0, 1, 1, 1, 1], []) as Vec3[]
    expect(pts[0]).toEqual([0, 0, 0])
    expect(pts[pts.length - 1]).toEqual([0, 20, 0])
    const ref = Array.from({ length: 4001 }, (_, i) => bezier(U_SHAPE, i / 4000))
    // Tamaño ≈ 28: el desvío de Cota respecto de la curva real queda en centésimas de milésima.
    expect(deviation(pts, ref)).toBeLessThan(28 * 5e-5)
    // Tomar los puntos de control como de paso (lo de antes) se aparta varias unidades.
    expect(deviation(U_SHAPE, ref)).toBeGreaterThan(1)
  })

  it('casos especiales: grado 1, sin nudos (DXF viejos de Cota), nudos inválidos, pesos inválidos', () => {
    expect(dxfSplineThroughPoints(1, U_SHAPE, [0, 0, 1, 2, 3, 3], [])).toBe('polyline')
    expect(dxfSplineThroughPoints(3, U_SHAPE.slice(0, 2), [0, 0, 1, 1], [])).toBe('polyline') // grado de más: recta
    expect(dxfSplineThroughPoints(3, U_SHAPE, [], [])).toBeNull()
    // Cantidad de nudos inválida → uniformes con extremos fijos: la misma Bézier.
    const bad = dxfSplineThroughPoints(3, U_SHAPE, [0, 0, 1, 1], []) as Vec3[]
    const good = dxfSplineThroughPoints(3, U_SHAPE, [0, 0, 0, 0, 1, 1, 1, 1], []) as Vec3[]
    expect(bad).toEqual(good)
    // Pesos de otra cantidad o no positivos se ignoran.
    expect(dxfSplineThroughPoints(3, U_SHAPE, [0, 0, 0, 0, 1, 1, 1, 1], [1, 0, 1, 1])).toEqual(good)
  })

  it('exportación: las Béziers encadenadas son exactamente la Catmull-Rom de Cota y se reconocen al volver', () => {
    const pts: Vec3[] = [[0, 0, 0], [10, 5, 0], [12, 30, 2], [40, 31, 0], [41, 0, 0]]
    const { controlPoints, knots } = catmullRomBezierSpline(pts)
    expect(controlPoints).toHaveLength(3 * (pts.length - 1) + 1)
    expect(knots).toEqual([0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4])
    expect(validKnots(3, controlPoints.length, knots)).toBe(true)
    const def = { degree: 3, controlPoints, knots }
    for (let i = 0; i + 1 < pts.length; i++) {
      for (const w of [0, 0.25, 0.5, 0.9]) {
        const a = nurbsPoint(def, i + w)
        const b = catmullRomPoint(pts, i, w)
        a.forEach((v, k) => expect(v).toBeCloseTo(b[k], 9))
      }
    }
    expect(catmullRomFromBezierSpline(def)).toEqual(pts)
    expect(dxfSplineThroughPoints(3, controlPoints, knots, [])).toEqual(pts)
    // Dos puntos: un tramo recto.
    expect(catmullRomFromBezierSpline({ degree: 3, ...catmullRomBezierSpline([[0, 0, 0], [9, 3, 0]]) })).toEqual([[0, 0, 0], [9, 3, 0]])
  })

  it('una Bézier cualquiera no se confunde con una de Cota', () => {
    expect(catmullRomFromBezierSpline({ degree: 3, controlPoints: U_SHAPE, knots: [0, 0, 0, 0, 1, 1, 1, 1] })).toBeNull()
    const { controlPoints, knots } = catmullRomBezierSpline([[0, 0, 0], [10, 5, 0], [20, 0, 0]])
    const moved = controlPoints.map((q, i) => (i === 2 ? ([q[0] + 0.01, q[1], q[2]] as Vec3) : q))
    expect(catmullRomFromBezierSpline({ degree: 3, controlPoints: moved, knots })).toBeNull()
    expect(catmullRomFromBezierSpline({ degree: 3, controlPoints, knots, weights: controlPoints.map(() => 2) })).toBeNull()
  })
})
