import { describe, expect, it } from 'vitest'
import {
  cameraOnNet,
  cornerDir,
  dirToAzEl,
  edgeDir,
  edgeName,
  isoNameOf,
  neighborFace,
  netCells,
  sideVec,
  type NetCell,
  type ProjStd,
  type Side,
} from './viewNet'

const cell = (std: ProjStd, face: string): NetCell => netCells(std).find((c) => c.face === face)!
const at = (std: ProjStd, col: number, row: number) => netCells(std).find((c) => c.col === col && c.row === row)?.face
const FACE_VIEW: Record<string, [number, number]> = {
  TOP: [-Math.PI / 2, Math.PI / 2],
  BOTTOM: [-Math.PI / 2, -Math.PI / 2],
  FRONT: [-Math.PI / 2, 0],
  BACK: [Math.PI / 2, 0],
  RIGHT: [0, 0],
  LEFT: [Math.PI, 0],
}

describe('cubo desplegado en Monge', () => {
  it('ISO-E: planta debajo del alzado, vista izquierda a la derecha; ISO-A al revés', () => {
    expect([at('E', 1, 0), at('E', 0, 1), at('E', 1, 1), at('E', 2, 1), at('E', 3, 1), at('E', 1, 2)]).toEqual([
      'BOTTOM', 'RIGHT', 'FRONT', 'LEFT', 'BACK', 'TOP',
    ])
    expect([at('A', 1, 0), at('A', 0, 1), at('A', 1, 1), at('A', 2, 1), at('A', 3, 1), at('A', 1, 2)]).toEqual([
      'TOP', 'LEFT', 'FRONT', 'RIGHT', 'BACK', 'BOTTOM',
    ])
  })

  it('las celdas vecinas en el desplegado comparten una arista real del cubo', () => {
    const pairs: Array<[Side, number, number]> = [['right', 1, 0], ['left', -1, 0], ['bottom', 0, 1], ['top', 0, -1]]
    for (const std of ['E', 'A'] as ProjStd[]) {
      for (const c of netCells(std)) {
        for (const [side, dc, dr] of pairs) {
          const nb = netCells(std).find((o) => o.col === c.col + dc && o.row === c.row + dr)
          if (!nb) continue
          // La vecina del desplegado es la vecina real en el cubo, y su lado opuesto vuelve a esta cara.
          expect(neighborFace(c, side)).toBe(nb.face)
          const back: Side = side === 'right' ? 'left' : side === 'left' ? 'right' : side === 'top' ? 'bottom' : 'top'
          expect(neighborFace(nb, back)).toBe(c.face)
          // Y la arista es la misma dirección desde las dos celdas.
          expect(edgeDir(c, side).map((x) => x.toFixed(9))).toEqual(edgeDir(nb, back).map((x) => x.toFixed(9)))
        }
      }
    }
  })

  it('en una vista de cara el punto de la cámara queda en el centro de su celda', () => {
    for (const std of ['E', 'A'] as ProjStd[]) {
      for (const [face, [az, el]] of Object.entries(FACE_VIEW)) {
        const p = cameraOnNet(az, el, std)
        const c = cell(std, face)
        expect(p.face).toBe(face)
        expect(p.x).toBeCloseTo(c.col + 0.5, 9)
        expect(p.y).toBeCloseTo(c.row + 0.5, 9)
      }
    }
  })

  it('al subir la cámara desde el alzado el punto va hacia la planta: abajo en ISO-E, arriba en ISO-A', () => {
    const e = cameraOnNet(-Math.PI / 2, 0.3, 'E')
    const a = cameraOnNet(-Math.PI / 2, 0.3, 'A')
    expect(e.face).toBe('FRONT')
    expect(e.y).toBeGreaterThan(1.5)
    expect(a.y).toBeLessThan(1.5)
    // Y pasa sin salto de una celda a la otra al cruzar la arista (45°).
    const before = cameraOnNet(-Math.PI / 2, Math.PI / 4 - 1e-6, 'E')
    const after = cameraOnNet(-Math.PI / 2, Math.PI / 4 + 1e-6, 'E')
    expect(before.face).toBe('FRONT')
    expect(after.face).toBe('TOP')
    expect(Math.hypot(before.x - after.x, before.y - after.y)).toBeLessThan(1e-4)
  })

  it('aristas y esquinas dan sus vistas: TOP·FRONT a 45° desde el frente; las esquinas superiores son isométricas', () => {
    const front = cell('E', 'FRONT')
    const top = edgeDir(front, 'bottom') // en ISO-E la planta está debajo
    expect(edgeName('FRONT', 'TOP')).toBe('TOP·FRONT')
    const { az, el } = dirToAzEl(top)
    expect(az).toBeCloseTo(-Math.PI / 2, 9)
    expect(el).toBeCloseTo(Math.PI / 4, 9)
    // Esquina de FRONT hacia RIGHT (izquierda en ISO-E) y TOP (abajo): la isométrica SE (ISO).
    expect(isoNameOf(cornerDir(front, -1, -1))).toBe('ISO')
    expect(isoNameOf(cornerDir(cell('A', 'FRONT'), -1, 1))).toBe('SWISO')
    expect(isoNameOf(cornerDir(front, 1, 1))).toBeNull() // esquina inferior: no es una isométrica estándar
    expect(sideVec(front, 'left')).toEqual([1, 0, 0])
  })
})
