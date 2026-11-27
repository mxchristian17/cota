import { describe, expect, it } from 'vitest'
import { acisSamples } from '../../test/acisSamples'
import { acisBox } from '../editing/brepLeaf'
import { acisEdges } from './acis'
import { acisDisplay, acisFormat, boxOf, displayWire, importedBrep, type ImportedBrep } from './importedBrep'

const sab = acisSamples('sample_AC1032.dwg')
const sat = acisSamples('sample_AC1015.dwg')
const cube = sab.find((s) => s.type === 'Solid3D')!.data

describe('sólidos importados en el hilo de lectura', () => {
  it('lo que se dibuja: triángulos con la cara del modelo de cada uno, las aristas del modelo y su caja', () => {
    const d = acisDisplay(cube)!
    expect(d.display.tri.length % 3).toBe(0)
    expect(d.display.faceOf.length).toBe(d.display.tri.length / 3)
    // El cubo: 6 caras y 12 aristas.
    expect(new Set(d.display.faceOf).size).toBe(6)
    expect(d.display.wireCounts.length).toBe(12)
    expect(displayWire(d.display)).toEqual(acisEdges(cube))
    // La misma caja que la de la hoja (`acisBox`), sin leer el modelo dos veces.
    expect(d.box).toEqual(acisBox(cube))
  })

  it('formato SAB o SAT; un mismo modelo se arma una vez y sus bytes se copian', () => {
    expect(acisFormat(cube)).toBe('sab')
    expect(acisFormat(sat[0].data)).toBe('sat')
    const known: Record<string, ImportedBrep> = {}
    const a = importedBrep(cube, false, known)!
    expect(a.brep.bytes).toEqual(cube)
    expect(a.brep.bytes.buffer).not.toBe(cube.buffer) // se transfiere sola, sin el archivo entero
    known[a.ref] = a.brep
    expect(importedBrep(cube, false, known)!.brep).toBe(a.brep)
    // En un teléfono, malla más liviana.
    const light = importedBrep(sab[2].data, true)!
    const full = importedBrep(sab[2].data, false)!
    expect(light.brep.display.tri.length).toBeLessThanOrEqual(full.brep.display.tri.length)
  })

  it('la caja: la de las aristas más lo que la malla abomba cerca; lo que se sale lejos no cuenta', () => {
    const edges = [
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ] as [number, number, number][],
    ]
    const verts = new Float64Array([0.5, 0.5, 0.2, 100, 100, 100])
    expect(boxOf(edges, verts)).toEqual([
      [0, 0, 0],
      [1, 1, 0.2],
    ])
    // Sin aristas (una esfera entera), la de la malla; con el ruido de punto flotante limpio.
    expect(
      boxOf(
        [],
        [
          [0.1 + 0.2, 0, 0],
          [1, 1, 1],
        ],
      ),
    ).toEqual([
      [0.3, 0, 0],
      [1, 1, 1],
    ])
  })
})
