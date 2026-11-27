import { beforeAll, describe, expect, it } from 'vitest'
import { OcctKernel } from 'occt-wasm'
import { acisSamples } from '../../test/acisSamples'
import type { Vec3 } from '../math'
import { acisEdges, acisRecords, kindOf } from './acis'
import { acisToStep, curvePiece, type Bs3Curve } from './acisStep'

let k: OcctKernel
beforeAll(async () => {
  k = await OcctKernel.init()
}, 30_000)

describe('ACIS → STEP → OpenCascade', () => {
  for (const name of ['sample_AC1015.dwg', 'sample_AC1032.dwg', 'sample_AC1032_binary.dxf']) {
    it(`los sólidos y la región de ${name} salen exactos: válidos, con todas sus caras y sobre sus aristas`, () => {
      const list = acisSamples(name)
      expect(list.map((m) => m.type).sort()).toEqual(['Region', 'Solid3D', 'Solid3D'])
      for (const { type, data } of list) {
        const st = acisToStep(data)!
        expect(st).not.toBeNull()
        expect(st.stats.issues).toEqual({})
        const shape = k.importStep(st.step)
        expect(k.isValid(shape)).toBe(true)
        const faces = acisRecords(data).filter((r) => kindOf(r) === 'face').length
        expect(k.subShapeCount(shape, 'face')).toBe(faces)
        // La caja exacta es la de las aristas del ACIS (geometría sin teselar).
        const bb = k.getBoundingBox(shape)
        const lo: Vec3 = [Infinity, Infinity, Infinity]
        const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
        for (const pl of acisEdges(data))
          for (const p of pl)
            for (let i = 0; i < 3; i++) {
              lo[i] = Math.min(lo[i], p[i])
              hi[i] = Math.max(hi[i], p[i])
            }
        const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
        const got = [bb.xmin, bb.ymin, bb.zmin, bb.xmax, bb.ymax, bb.zmax]
        ;[...lo, ...hi].forEach((v, i) => expect(Math.abs(got[i] - v)).toBeLessThan(diag * 0.01))
        if (type === 'Region') {
          expect(st.sheets).toBe(1)
          expect(k.getSurfaceArea(shape)).toBeGreaterThan(0)
        } else {
          expect(st.solids).toBe(1)
          expect(k.getVolume(shape)).toBeGreaterThan(0)
        }
        k.releaseAll()
      }
    })
  }

  it('un modelo sin caras (vacío o de alambre) no da STEP', () => {
    const wire = `400 2 1 0
9 Cota test 8 ASM 1.0 0
1 1e-06 1e-10
body $-1 $1 $-1 $-1 #
lump $-1 $-1 $-1 $0 #
End-of-ACIS-data
`
    expect(acisToStep(wire)).toBeNull()
  })
})

/** Punto de una B-spline (de Boor), con sus nudos completos. */
function at(bs: Bs3Curve, t: number): Vec3 {
  const U = bs.knots.flatMap((u, i) => Array<number>(bs.mults[i]).fill(u))
  const d = bs.deg
  let s = d
  while (s < bs.ctrl.length - 1 && U[s + 1] <= t) s++
  const P = bs.ctrl.slice(s - d, s + 1).map((p) => [...p])
  for (let r = 1; r <= d; r++)
    for (let j = d; j >= r; j--) {
      const i = s - d + j
      const a = (t - U[i]) / (U[i + d - r + 1] - U[i])
      P[j] = P[j].map((v, c) => (1 - a) * P[j - 1][c] + a * v)
    }
  return P[d] as Vec3
}

describe('tramo de una curva B-spline', () => {
  // Cerrada (el último punto de control es el primero), de grado 2, parámetro de 0 a 4.
  const closed: Bs3Curve = {
    deg: 2,
    knots: [0, 1, 2, 3, 4],
    mults: [3, 1, 1, 1, 3],
    ctrl: [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
      [0, 10, 0],
      [-5, 5, 2],
      [0, 0, 0],
    ],
  }
  const near = (a: Vec3, b: Vec3) => expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(1e-9)

  it('dentro de una vuelta, es la misma curva entre sus extremos', () => {
    const pc = curvePiece(closed, 0.5, 2.5)!
    near(pc.ctrl[0], at(closed, 0.5))
    near(pc.ctrl[pc.ctrl.length - 1], at(closed, 2.5))
    for (const t of [0.7, 1, 1.5, 2.2]) near(at(pc, t), at(closed, t))
  })

  it('pasando por el inicio de la curva, sigue por la vuelta siguiente (los parámetros de ACIS siguen de largo)', () => {
    const pc = curvePiece(closed, 3.5, 4.5)!
    near(pc.ctrl[0], at(closed, 3.5))
    near(pc.ctrl[pc.ctrl.length - 1], at(closed, 0.5))
    near(at(pc, 3.8), at(closed, 3.8))
    near(at(pc, 4.3), at(closed, 0.3))
    // Igual, con los dos parámetros ya en la vuelta siguiente.
    const next = curvePiece(closed, 7.5, 8.5)!
    near(next.ctrl[0], at(closed, 3.5))
    near(next.ctrl[next.ctrl.length - 1], at(closed, 0.5))
  })

  it('una curva abierta no se continúa en otra vuelta', () => {
    const open: Bs3Curve = {
      ...closed,
      ctrl: [...closed.ctrl.slice(0, 5), [3, 3, 3]],
    }
    expect(curvePiece(open, 3.5, 4.5)).toBeNull()
  })
})
