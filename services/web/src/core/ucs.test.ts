import { describe, it, expect } from 'vitest'
import {
  arbitraryAxis,
  normalizeUcs,
  orthoUcs,
  rotateUcs,
  ucsFrom3Points,
  ucsFromAngle,
  ucsFromZAxis,
  ucsToWorld,
  ucsZ,
  worldToUcs,
  WORLD_UCS,
  type Ucs,
} from './ucs'
import { pt, type Pt, type Vec3 } from './math'

const close = (a: Pt, b: Pt) => {
  expect(a.x).toBeCloseTo(b.x, 9)
  expect(a.y).toBeCloseTo(b.y, 9)
  expect(a.z).toBeCloseTo(b.z, 9)
}
const closeV = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9))

describe('UCS transforms', () => {
  it('WORLD es identidad', () => {
    expect(ucsToWorld(pt(5, 7), WORLD_UCS)).toEqual(pt(5, 7, 0))
    expect(worldToUcs(pt(5, 7), WORLD_UCS)).toEqual(pt(5, 7, 0))
  })

  it('traslada por el origen', () => {
    const u: Ucs = ucsFromAngle(pt(10, 20), 0)
    expect(ucsToWorld(pt(1, 2), u)).toEqual(pt(11, 22, 0))
    expect(worldToUcs(pt(11, 22), u)).toEqual(pt(1, 2, 0))
  })

  it('rota 90 grados en planta', () => {
    const w = ucsToWorld(pt(1, 0), ucsFromAngle(pt(0, 0), Math.PI / 2)) // la X de la UCS apunta a +Y
    close(w, pt(0, 1, 0))
  })

  it('round-trip mundo ↔ UCS en una UCS 3D cualquiera', () => {
    const u = ucsFrom3Points(WORLD_UCS, pt(3, -4, 2), pt(4, -3, 3), pt(0, 0, 9))!
    close(worldToUcs(ucsToWorld(pt(2, 5, -1), u), u), pt(2, 5, -1))
  })

  it('la UCS Front pone la Y en +Z del mundo y la Z hacia el observador (−Y)', () => {
    const f = orthoUcs('FRONT')
    close(ucsToWorld(pt(10, 20, 0), f), pt(10, 0, 20))
    closeV(ucsZ(f), [0, -1, 0])
    closeV(ucsZ(orthoUcs('LEFT')), [-1, 0, 0])
    closeV(ucsZ(orthoUcs('RIGHT')), [1, 0, 0])
    closeV(ucsZ(orthoUcs('BACK')), [0, 1, 0])
    closeV(ucsZ(orthoUcs('BOTTOM')), [0, 0, -1])
  })

  it('UCS X 90 desde World = Front; Z 90 gira la X a +Y; Y 90 lleva la X a −Z', () => {
    const x90 = rotateUcs(WORLD_UCS, 'X', 90)
    closeV(x90.y, [0, 0, 1])
    closeV(ucsZ(x90), [0, -1, 0])
    closeV(rotateUcs(WORLD_UCS, 'Z', 90).x, [0, 1, 0])
    closeV(rotateUcs(WORLD_UCS, 'Y', 90).x, [0, 0, -1])
  })

  it('3 puntos: origen, +X y un punto del XY con Y positiva', () => {
    const u = ucsFrom3Points(WORLD_UCS, pt(0, 0, 0), pt(0, 0, 5), pt(0, 3, 0))!
    closeV(u.x, [0, 0, 1])
    closeV(u.y, [0, 1, 0])
    closeV(ucsZ(u), [-1, 0, 0]) // mano derecha: +Z × +Y = −X
    expect(ucsFrom3Points(WORLD_UCS, pt(0, 0, 0), pt(1, 0, 0), pt(2, 0, 0))).toBeNull() // colineales
  })

  it('ZAxis usa el Arbitrary Axis Algorithm para la X', () => {
    const u = ucsFromZAxis(pt(1, 1, 1), pt(1, 0, 1))! // +Z = −Y
    closeV(ucsZ(u), [0, -1, 0])
    closeV(u.x, arbitraryAxis([0, -1, 0]))
    closeV(u.x, [1, 0, 0])
    closeV(arbitraryAxis([0, 0, -1]), [-1, 0, 0]) // OCS de una normal −Z
  })

  it('migra la UCS 2D vieja y la de la tabla del documento', () => {
    const old = normalizeUcs({ origin: pt(5, 0, 0), angle: Math.PI / 2 })
    closeV(old.x, [0, 1, 0])
    const def = normalizeUcs({ origin: [0, 0, 7], xAxis: [2, 0, 0], yAxis: [1, 0, 3] })
    closeV(def.y, [0, 0, 1]) // ortonormalizada
    expect(def.origin.z).toBe(7)
    expect(normalizeUcs(null)).toEqual(WORLD_UCS)
  })
})
