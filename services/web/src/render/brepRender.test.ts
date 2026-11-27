import { describe, expect, it } from 'vitest'
import { acisSamples } from '../test/acisSamples'
import { brepDisplay, registerImportedBreps } from '../core/document/brepStore'
import type { BrepProps } from '../core/document/types'
import { importedBrep } from '../core/io/importedBrep'
import { BrepRenders, brepEdgeSegments } from './brepRender'
import { brepMeshGeometry } from './brepMesh'

const { ref, brep } = importedBrep(acisSamples('sample_AC1032.dwg').find((s) => s.type === 'Solid3D')!.data)!
registerImportedBreps({ [ref]: brep })
const leaf: BrepProps = { op: 'BREP', ref, box: brep.box }

/** Volumen con signo de una malla indexada (positivo si mira afuera). */
function volume(pos: ArrayLike<number>, idx: ArrayLike<number>): number {
  let v = 0
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3]
    v +=
      (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) -
        pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) +
        pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) /
      6
  }
  return v
}

describe('dibujo de las piezas importadas solas', () => {
  it('como las mallas: triángulos indexados de la malla de la importación y las aristas exactas del modelo', () => {
    const r = new BrepRenders().get(leaf, [0, 0, 0], null)!
    expect(r.idx.length).toBe(brep.display.tri.length)
    expect(volume(r.pos, r.idx)).toBeCloseTo(125, 6) // el cubo de 5
    expect(r.edges.length).toBe(12 * 6) // 12 aristas rectas
  })

  it('con la matriz de la hoja y relativo al origen de la vista; reflejada sigue mirando afuera', () => {
    const mirrored: BrepProps = { ...leaf, m: [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0] }
    const r = new BrepRenders().get(mirrored, [10, 0, 0], null)!
    expect(volume(r.pos, r.idx)).toBeGreaterThan(0)
    const e = brepEdgeSegments(brep.display, mirrored.m, [10, 0, 0])
    expect(Array.from(r.edges)).toEqual(Array.from(e))
    // x' = −x − 10
    const plain = brepEdgeSegments(brep.display, undefined, [0, 0, 0])
    expect(e[0]).toBeCloseTo(-plain[0] - 10, 4)
  })

  it('lo usado en una pasada sigue en la siguiente; lo que no se usa se olvida', () => {
    const cache = new BrepRenders()
    cache.frame()
    const a = cache.get(leaf, [0, 0, 0], null)
    cache.frame()
    expect(cache.get(leaf, [0, 0, 0], null)).toBe(a)
    cache.frame()
    cache.frame()
    expect(cache.get(leaf, [0, 0, 0], null)).not.toBe(a)
    // Sin malla todavía (un modelo que no está) no hay nada que dibujar.
    expect(cache.get({ ...leaf, ref: 'sab-0-x' }, [0, 0, 0], null)).toBeNull()
  })

  it('la malla de respaldo lleva un grupo por cara del modelo (la topología separa las caras del B-rep)', () => {
    expect(brepDisplay(ref)).toBeDefined()
    expect(brepMeshGeometry(leaf)!.groups).toHaveLength(6)
  })
})
