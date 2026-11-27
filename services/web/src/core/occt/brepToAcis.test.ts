import { beforeAll, describe, expect, it } from 'vitest'
import { OcctKernel, type ShapeHandle } from 'occt-wasm'
import { acisRecords, kindOf } from '../io/acis'
import { acisToStep } from '../io/acisStep'
import { writeSab, writeSat } from '../io/acisWrite'
import { brepToAcis, unperiodize, parseBrep, type Bspl } from './brepToAcis'

const V = (x: number, y: number, z: number) => ({ x, y, z })

let k: OcctKernel
beforeAll(async () => {
  k = await OcctKernel.init()
}, 30_000)

/** La forma del núcleo pasada a ACIS y vuelta a leer como la lee Cota al abrir un DWG/DXF (ACIS → STEP → núcleo). */
function roundTrip(s: ShapeHandle, format: 'sab' | 'sat', sheet = false) {
  const model = brepToAcis(k.toBREP(k.copy(s)), sheet)
  const data = format === 'sab' ? writeSab(model.recs) : writeSat(model.recs)
  const step = acisToStep(data)
  expect(step, 'el lector de Cota lee el modelo').not.toBeNull()
  expect(step!.stats.polylines).toBe(0)
  expect(step!.stats.issues).toEqual({})
  const back = k.importStep(step!.step)
  return { model, data, back, step: step! }
}

function expectSame(s: ShapeHandle, sheet = false) {
  for (const f of ['sab', 'sat'] as const) {
    const { back, model } = roundTrip(s, f, sheet)
    expect(k.isValid(back), f).toBe(true)
    expect(k.subShapeCount(back, 'face')).toBe(model.faces)
    const [got, want] = sheet ? [k.getSurfaceArea(back), k.getSurfaceArea(s)] : [k.getVolume(back), k.getVolume(s)]
    // Las caras B-spline se integran numéricamente, y un barrido trae aristas con tolerancia de 1e-4 que el ACIS escrito
    // no lleva (sin curvas sobre las caras, el núcleo las vuelve a proyectar): hasta unas millonésimas.
    expect(Math.abs(got - want) / want, f).toBeLessThan(1e-5)
    const [a, b] = [k.getBoundingBox(back), k.getBoundingBox(s)]
    for (const key of ['xmin', 'ymin', 'zmin', 'xmax', 'ymax', 'zmax'] as const) expect(a[key]).toBeCloseTo(b[key], 5)
  }
}

describe('sólidos del núcleo como ACIS', () => {
  it('caja, caja con agujero, esfera, cono truncado, toro', () => {
    const box = k.makeBox(10, 20, 30)
    expectSame(box)
    expectSame(k.cut(box, k.translate(k.makeCylinder(3, 40), 5, 10, -5)))
    expectSame(k.makeSphere(5))
    expectSame(k.makeCone(5, 2, 10))
    expectSame(k.makeCone(5, 0, 10)) // con vértice
    expectSame(k.makeTorus(10, 2))
  })

  it('ubicada (girada) y reflejada: las caras siguen mirando afuera', () => {
    const box = k.cut(k.makeBox(10, 20, 30), k.translate(k.makeCylinder(3, 40), 5, 10, -5))
    const c = Math.cos(0.5)
    const s = Math.sin(0.5)
    expectSame(k.transform(box, [c, -s, 0, 5, s, c, 0, 6, 0, 0, 1, 7]))
    expectSame(k.transform(box, [-1, 0, 0, 5, 0, 1, 0, 0, 0, 0, 1, 0]))
  })

  it('empalmes, extrusión con arco, revolución entera y parcial y un barrido por una curva suave (B-splines)', () => {
    const box = k.makeBox(10, 20, 30)
    expectSame(k.fillet(box, k.getSubShapes(box, 'edge').slice(0, 3), 2))
    // Perfil como los de Cota: rectas y un arco.
    const wire = k.makeWire([
      k.makeLineEdge(V(0, 0, 0), V(8, 0, 0)),
      k.makeArcEdge(V(8, 0, 0), V(10, 3, 0), V(8, 6, 0)),
      k.makeLineEdge(V(8, 6, 0), V(0, 6, 0)),
      k.makeLineEdge(V(0, 6, 0), V(0, 0, 0)),
    ])
    const face = k.makeFace(wire)
    expectSame(k.extrude(face, 1, 2, 5)) // oblicua: el arco da un cilindro elíptico
    const off = k.translate(face, 3, 0, 0)
    expectSame(k.revolve(off, { point: V(0, 0, 0), direction: V(0, 1, 0) }, Math.PI * 2))
    expectSame(k.revolve(off, { point: V(0, 0, 0), direction: V(0, 1, 0) }, Math.PI * 0.75))
    const spine = k.makeWire([k.interpolatePoints([V(0, 0, 0), V(10, 5, 3), V(20, 0, 8), V(30, 6, 10)])])
    const tri = k.makeWire([k.makeLineEdge(V(0, -1, -1), V(0, 1, -1)), k.makeLineEdge(V(0, 1, -1), V(0, 0, 1.5)), k.makeLineEdge(V(0, 0, 1.5), V(0, -1, -1))])
    expectSame(k.sweep(tri, spine))
  })

  it('una lámina plana es una región y sus caras van de dos lados', () => {
    const face = k.getSubShapes(k.makeBox(10, 20, 30), 'face')[0]
    const { model, data } = roundTrip(face, 'sat', true)
    expect(model.kind).toBe('region')
    expect(String(data)).toContain('double out')
    expectSame(face, true)
  })

  it('el SAB y el SAT llevan los mismos registros, con el encabezado ASM', () => {
    const model = brepToAcis(k.toBREP(k.makeCylinder(2, 5)))
    const sab = acisRecords(writeSab(model.recs))
    const sat = acisRecords(writeSat(model.recs))
    expect(sab.map((r) => r.type)).toEqual(['asmheader', ...model.recs.map((r) => r.type)])
    expect(sat.map((r) => r.type)).toEqual(sab.map((r) => r.type))
    // Un cilindro: tres caras (sin costura), dos aristas circulares y dos vértices.
    expect(sab.filter((r) => kindOf(r) === 'face')).toHaveLength(3)
    expect(sab.filter((r) => kindOf(r) === 'edge')).toHaveLength(2)
    expect(sab.filter((r) => kindOf(r) === 'vertex')).toHaveLength(2)
    expect(writeSat(model.recs)).toMatch(/^20800 0 2 0 \n@4 Cota @14 ACIS 208.00 NT @24 .+ \n1 9.9999999999999995e-007 1e-010 \nasmheader \$-1 -1 @12 208.0.4.7009 #\n/)
  })
})

describe('B-splines periódicas de OpenCascade', () => {
  it('pasan a sujetas sin cambiar la curva, también en un tramo que cruza el período', () => {
    const e = k.makeBSplineEdge([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, -3, 5, 2], [1, 2, 1, 1, 0.5], [0, 1, 2.5, 4], [2, 1, 2, 2], 3, true)
    const c = parseBrep(k.toBREP(e)).curves.find((x) => x.k === 'bspline') as { s: Bspl }
    for (const [a, b] of [
      [0, 4],
      [1.5, 5],
    ]) {
      const u = unperiodize(c.s, a, b)
      expect(u.periodic).toBe(false)
      for (let i = 0; i <= 8; i++) {
        const t = a + ((b - a) * i) / 8
        const q = evalBspl(u, t)
        const r = k.curvePointAtParam(e, t >= 4 ? t - 4 : t) as unknown as { x: number; y: number; z: number }
        expect(Math.hypot(q[0] - r.x, q[1] - r.y, q[2] - r.z)).toBeLessThan(1e-9)
      }
    }
  })
})

/** Punto de una B-spline sujeta (de Boor). */
function evalBspl(s: Bspl, t: number): number[] {
  const U: number[] = []
  s.knots.forEach((kn, i) => {
    for (let m = 0; m < s.mults[i]; m++) U.push(kn)
  })
  const p = s.deg
  let span = p
  while (span + 1 < U.length - p - 1 && U[span + 1] <= t) span++
  const w = s.weights
  const d = Array.from({ length: p + 1 }, (_, j) => {
    const q = s.poles[span - p + j]
    const wi = w ? w[span - p + j] : 1
    return [q[0] * wi, q[1] * wi, q[2] * wi, wi]
  })
  for (let r = 1; r <= p; r++)
    for (let j = p; j >= r; j--) {
      const i = span - p + j
      const a = (t - U[i]) / (U[i + p - r + 1] - U[i])
      d[j] = d[j].map((v, c) => (1 - a) * d[j - 1][c] + a * v)
    }
  return [d[p][0] / d[p][3], d[p][1] / d[p][3], d[p][2] / d[p][3]]
}
