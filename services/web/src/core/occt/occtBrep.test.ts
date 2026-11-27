import { beforeAll, describe, expect, it } from 'vitest'
import { OcctKernel } from 'occt-wasm'
import { acisSamples } from '../../test/acisSamples'
import { DocumentModel } from '../document/DocumentModel'
import type { BrepModel, BrepProps, SolidProps } from '../document/types'
import { affineOf } from '../geom/affine'
import { brepLeafFromAcis } from '../editing/brepLeaf'
import { acisToStep } from '../io/acisStep'
import { evalSolid, OcctEvalError, type OcctResult } from './occtEval'

let k: OcctKernel
beforeAll(async () => {
  k = await OcctKernel.init()
}, 30_000)

const samples = acisSamples('sample_AC1032.dwg')
const doc = DocumentModel.createDefault('t')
const [solid, region] = [samples.find((s) => s.type === 'Solid3D')!, samples.find((s) => s.type === 'Region')!].map((s) => brepLeafFromAcis(doc, s.data)!)
const models = doc.toJSON().breps as Record<string, BrepModel>
const run = (p: SolidProps): OcctResult => evalSolid(k, p, { models })

/** Caja de la malla teselada. */
function meshBox(r: OcctResult): { lo: number[]; hi: number[] } {
  const P = r.mesh.positions
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < P.length; i += 3)
    for (let c = 0; c < 3; c++) {
      lo[c] = Math.min(lo[c], P[i + c])
      hi[c] = Math.max(hi[c], P[i + c])
    }
  return { lo, hi }
}

describe('núcleo exacto: hoja BREP (sólido importado)', () => {
  it('da el mismo sólido que leer su STEP directamente', () => {
    const r = run(solid)
    const direct = k.importStep(acisToStep(samples.find((s) => s.type === 'Solid3D')!.data)!.step)
    expect(r.stats.volume).toBeCloseTo(k.getVolume(direct), 6)
    expect(r.stats.volume).toBeGreaterThan(0)
    k.releaseAll()
  })

  it('movido y reflejado (la matriz con determinante negativo) sigue válido, con su volumen', () => {
    const base = run(solid)
    const b0 = meshBox(base)
    const moved = run({ ...solid, m: affineOf((p) => [p[0] + 100, p[1], p[2] - 5]) })
    const b1 = meshBox(moved)
    expect(b1.lo[0]).toBeCloseTo(b0.lo[0] + 100, 4)
    expect(b1.hi[2]).toBeCloseTo(b0.hi[2] - 5, 4)
    const mirrored = run({ ...solid, m: affineOf((p) => [-p[0], p[1], p[2]]) })
    expect(mirrored.stats.volume).toBeCloseTo(base.stats.volume, 4)
    expect(meshBox(mirrored).lo[0]).toBeCloseTo(-b0.hi[0], 4)
  })

  it('se le puede restar una caja como a cualquier sólido', () => {
    const base = run(solid)
    const [lo, hi] = solid.box
    const mid = (lo[0] + hi[0]) / 2
    const cut = run({
      op: 'SUBTRACT',
      operands: [solid, { op: 'BOX', origin: [mid, lo[1] - 1, lo[2] - 1], width: hi[0] - mid + 1, depth: hi[1] - lo[1] + 2, height: hi[2] - lo[2] + 2 }],
    })
    expect(cut.stats.volume).toBeGreaterThan(0)
    expect(cut.stats.volume).toBeLessThan(base.stats.volume * 0.99)
  })

  it('se vacía (SHELL) y se le empalma una arista como a cualquier sólido', () => {
    const base = run(solid)
    const shelled = run({ op: 'SHELL', solid, thickness: 0.5 })
    expect(shelled.stats.volume).toBeGreaterThan(0)
    expect(shelled.stats.volume).toBeLessThan(base.stats.volume * 0.8)
    // Una arista de arriba del cubo de 5 (z = 5): el empalme le saca (1 − π/4)·r²·largo.
    const [lo, hi] = solid.box
    const at: [number, number, number] = [(lo[0] + hi[0]) / 2, lo[1], hi[2]]
    const filleted = run({ op: 'FILLETEDGE', solid, radius: 0.5, edges: [{ at }] } as SolidProps)
    expect(filleted.stats.volume).toBeCloseTo(base.stats.volume - (1 - Math.PI / 4) * 0.25 * 5, 3)
  })

  it('devuelve sus aristas exactas (sin la costura del agujero) y su masa: centroide e inercia', () => {
    const [lo, hi] = solid.box
    const c: [number, number, number] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]]
    const r = run({ op: 'SUBTRACT', operands: [solid, { op: 'CYLINDER', base: [c[0], c[1], lo[2] - 1], radius: 1, height: hi[2] - lo[2] + 2, segments: 64 }] })
    const edges = r.mesh.edges!
    const circles = edges.filter((e) => e.kind === 'circle')
    expect(circles).toHaveLength(2)
    for (const e of circles) {
      expect(e.r).toBeCloseTo(1, 9)
      expect(e.c![0]).toBeCloseTo(c[0], 9)
      expect(e.c![1]).toBeCloseTo(c[1], 9)
      expect(e.closed).toBe(true)
    }
    expect(edges.filter((e) => e.kind === 'line')).toHaveLength(12) // la generatriz de la costura no es una arista
    // Cubo de 5 menos el cilindro de r = 1: centroide en el eje y los momentos principales teóricos.
    expect(r.stats.centroid![0]).toBeCloseTo(c[0], 6)
    expect(r.stats.centroid![2]).toBeCloseTo(2.5, 6)
    const I = r.stats.inertia!
    const m = Math.PI * 5
    expect(I[8]).toBeCloseTo((125 * 50) / 12 - (m * 1) / 2, 4)
    expect(I[0]).toBeCloseTo((125 * 50) / 12 - (m * (3 + 25)) / 12, 4)
  })

  it('una región es una lámina: tiene caras sin volumen y se acepta igual', () => {
    const r = run(region)
    expect(r.mesh.indices.length).toBeGreaterThan(0)
    expect(r.stats.volume).toBeCloseTo(0, 9)
  })

  it('sin su modelo, o escalado distinto por eje, falla con un error claro (queda la malla)', () => {
    const missing: BrepProps = { ...solid, ref: 'sab-0-nada' }
    expect(() => run(missing)).toThrow(OcctEvalError)
    try {
      run({ ...solid, m: affineOf((p) => [p[0] * 2, p[1], p[2]]) })
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(OcctEvalError)
      expect((err as OcctEvalError).op).toBe('BREP')
    }
  })
})
