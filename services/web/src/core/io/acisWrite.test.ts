import { beforeAll, describe, expect, it } from 'vitest'
import { OcctKernel } from 'occt-wasm'
import { acisSamples } from '../../test/acisSamples'
import { affinePoint, type Affine } from '../geom/affine'
import { brepToAcis } from '../occt/brepToAcis'
import { acisRecords, satFromDxf } from './acis'
import { acisToStep } from './acisStep'
import { composeAcisTransform, sabWithTransform, satDxfGroups, satWithTransform, writeSab, writeSat } from './acisWrite'

let k: OcctKernel
beforeAll(async () => {
  k = await OcctKernel.init()
}, 30_000)

const sab = acisSamples('sample_AC1032.dwg').find((s) => s.type === 'Solid3D')!.data
const sat = acisSamples('sample_AC1015.dwg').find((s) => s.type === 'Solid3D')!.data

/** Caja del sólido como lo lee Cota (ACIS → STEP → núcleo). */
function boxOf(data: Uint8Array | string) {
  const step = acisToStep(data)
  expect(step).not.toBeNull()
  const s = k.importStep(step!.step)
  const b = k.getBoundingBox(s)
  return { lo: [b.xmin, b.ymin, b.zmin], hi: [b.xmax, b.ymax, b.zmax], volume: k.getVolume(s) }
}

/** Caja de una caja movida con una matriz (sus 8 esquinas). */
function movedBox(b: { lo: number[]; hi: number[] }, m: Affine) {
  const pts = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => affinePoint(m, [i & 1 ? b.hi[0] : b.lo[0], i & 2 ? b.hi[1] : b.lo[1], i & 4 ? b.hi[2] : b.lo[2]]))
  return { lo: [0, 1, 2].map((c) => Math.min(...pts.map((p) => p[c]))), hi: [0, 1, 2].map((c) => Math.max(...pts.map((p) => p[c]))) }
}

const c = Math.cos(Math.PI / 2)
const MOVES: Record<string, Affine> = {
  trasladar: [1, 0, 0, 100, 0, 1, 0, -50, 0, 0, 1, 7],
  girar: [c, -1, 0, 3, 1, c, 0, 4, 0, 0, 1, 0],
  escalar: [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0],
  reflejar: [-1, 0, 0, 10, 0, 1, 0, 0, 0, 0, 1, 0],
}

describe('modelo original de una pieza importada con otra ubicación', () => {
  for (const [label, data] of [
    ['SAB del CAD clásico (ASM, con transformación)', sab],
    ['SAT de un DWG 2000 (con transformación)', sat],
  ] as const)
    it(`${label}: trasladar, girar, escalar y reflejar mueven la pieza como la matriz`, () => {
      const before = boxOf(data)
      for (const [name, m] of Object.entries(MOVES)) {
        const out = typeof data === 'string' || data[0] !== 0x41 ? satWithTransform(new TextDecoder().decode(data), m) : sabWithTransform(data, m)
        expect(out, name).not.toBeNull()
        const after = boxOf(out!)
        const want = movedBox(before, m)
        for (let i = 0; i < 3; i++) {
          expect(after.lo[i], `${name} lo ${i}`).toBeCloseTo(want.lo[i], 6)
          expect(after.hi[i], `${name} hi ${i}`).toBeCloseTo(want.hi[i], 6)
        }
        const det = Math.abs(m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]))
        expect(after.volume, name).toBeCloseTo(before.volume * det, 6)
      }
    })

  it('sin transformación (como los que escribe Cota): se agrega una y el resto queda igual', () => {
    const recs = brepToAcis(k.toBREP(k.makeBox(1, 2, 3))).recs
    const m = MOVES.trasladar
    for (const data of [writeSab(recs), writeSat(recs)]) {
      const out = typeof data === 'string' ? satWithTransform(data, m) : sabWithTransform(data, m)
      const after = boxOf(out!)
      expect(after.lo).toEqual([100, -50, 7].map((v) => expect.closeTo(v, 9)))
      expect(after.hi).toEqual([101, -48, 10].map((v) => expect.closeTo(v, 9)))
      // Un registro más (la transformación) y los demás, iguales.
      const [a, b] = [acisRecords(data), acisRecords(out!)]
      expect(b.length).toBe(a.length + 1)
      expect(b.at(-1)!.type).toBe('transform')
      expect(b.slice(1).map((r) => r.type)).toEqual(
        a
          .slice(1)
          .map((r) => r.type)
          .concat(['transform'])
          .slice(0),
      )
    }
  })

  it('una matriz que no es una semejanza no se compone (va por el núcleo)', () => {
    expect(composeAcisTransform(null, [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0])).toBeNull()
    expect(sabWithTransform(sab, [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0])).toBeNull()
  })
})

describe('SAT en un DXF', () => {
  it('cada renglón cifrado en grupos 1 y 3 de hasta 255 caracteres, y vuelve igual', () => {
    // Un barrido por una curva suave: caras B-spline, de renglones largos.
    const V = (x: number, y: number, z: number) => ({ x, y, z })
    const spine = k.makeWire([k.interpolatePoints([V(0, 0, 0), V(10, 5, 3), V(20, 0, 8)])])
    const tri = k.makeWire([k.makeLineEdge(V(0, -1, -1), V(0, 1, -1)), k.makeLineEdge(V(0, 1, -1), V(0, 0, 1.5)), k.makeLineEdge(V(0, 0, 1.5), V(0, -1, -1))])
    const recs = brepToAcis(k.toBREP(k.sweep(tri, spine))).recs
    const text = writeSat(recs)
    const groups = satDxfGroups(text)
    const codes: Array<[number, string]> = []
    const lines = groups.split('\n')
    for (let i = 0; i + 1 < lines.length; i += 2) codes.push([Number(lines[i]), lines[i + 1]])
    expect(codes.every(([, v]) => v.length <= 255)).toBe(true)
    expect(codes.some(([g]) => g === 3)).toBe(true)
    expect(satFromDxf(codes)).toBe(text)
  })
})
