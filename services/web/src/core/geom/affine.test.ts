import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../math'
import { affineDet, affineDir, affineOf, affinePoint, composeAffine, isIdentityAffine, isSimilarity } from './affine'

const near = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9))
const rotZ =
  (ang: number, c: Vec3) =>
  (p: Vec3): Vec3 => {
    const [x, y] = [p[0] - c[0], p[1] - c[1]]
    return [c[0] + x * Math.cos(ang) - y * Math.sin(ang), c[1] + x * Math.sin(ang) + y * Math.cos(ang), p[2]]
  }

describe('matriz afín 3×4', () => {
  it('la matriz de una función de puntos la reproduce en cualquier punto', () => {
    const f = rotZ(0.7, [3, -2, 0])
    const m = affineOf(f)
    for (const p of [
      [0, 0, 0],
      [10, 5, -3],
      [-7, 1, 2],
    ] as Vec3[])
      near(affinePoint(m, p), f(p))
    near(affineDir(m, [1, 0, 0]), [Math.cos(0.7), Math.sin(0.7), 0])
  })

  it('componer es aplicar una después de la otra (ausente = identidad)', () => {
    const a = rotZ(0.3, [1, 1, 0])
    const b = (p: Vec3): Vec3 => [p[0] * 2 + 5, p[1] * 2, p[2] * 2 - 1]
    const ab = composeAffine(affineOf(a), affineOf(b))
    for (const p of [
      [1, 2, 3],
      [-4, 0, 9],
    ] as Vec3[])
      near(affinePoint(ab, p), a(b(p)))
    expect(composeAffine(affineOf(a), undefined)).toEqual(affineOf(a))
  })

  it('distingue la identidad, una reflexión y una escala distinta por eje', () => {
    expect(isIdentityAffine(undefined)).toBe(true)
    expect(isIdentityAffine(affineOf((p) => p))).toBe(true)
    expect(isIdentityAffine(affineOf((p) => [p[0] + 1e-3, p[1], p[2]]))).toBe(false)
    const mirror = affineOf((p) => [-p[0], p[1], p[2]])
    expect(affineDet(mirror)).toBeLessThan(0)
    expect(isSimilarity(mirror)).toBe(true)
    expect(isSimilarity(affineOf((p) => [p[0] * 3, p[1] * 3, p[2] * 3]))).toBe(true)
    expect(isSimilarity(affineOf((p) => [p[0] * 2, p[1], p[2]]))).toBe(false)
  })
})
