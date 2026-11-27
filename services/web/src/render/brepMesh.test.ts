import { describe, expect, it } from 'vitest'
import type * as THREE from 'three'
import { acisSamples } from '../test/acisSamples'
import { DocumentModel } from '../core/document/DocumentModel'
import type { BrepProps } from '../core/document/types'
import { affineOf } from '../core/geom/affine'
import { brepLeafFromAcis } from '../core/editing/brepLeaf'
import { brepMeshGeometry } from './brepMesh'
import { solidGeometry } from './csg'

const doc = DocumentModel.createDefault('t')
const leaf = brepLeafFromAcis(doc, acisSamples('sample_AC1015.dwg').find((s) => s.type === 'Solid3D')!.data)!

/** Volumen con signo (positivo si los triángulos miran afuera) y caja de una geometría sin índice. */
function props(g: THREE.BufferGeometry): { vol: number; lo: number[]; hi: number[] } {
  const p = g.getAttribute('position').array as ArrayLike<number>
  let vol = 0
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 8 < p.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = Array.from({ length: 9 }, (_, j) => p[i + j])
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  for (let i = 0; i < p.length; i += 3)
    for (let c = 0; c < 3; c++) {
      lo[c] = Math.min(lo[c], p[i + c])
      hi[c] = Math.max(hi[c], p[i + c])
    }
  return { vol, lo, hi }
}

describe('malla de respaldo de un sólido importado', () => {
  it('es la de sus caras ACIS, dentro de su caja, mirando afuera', () => {
    const g = brepMeshGeometry(leaf)!
    const { vol, lo, hi } = props(g)
    expect(vol).toBeGreaterThan(0)
    const diag = Math.hypot(...leaf.box[1].map((v, i) => v - leaf.box[0][i]))
    for (let c = 0; c < 3; c++) {
      expect(lo[c]).toBeGreaterThanOrEqual(leaf.box[0][c] - diag * 0.01)
      expect(hi[c]).toBeLessThanOrEqual(leaf.box[1][c] + diag * 0.01)
    }
  })

  it('con la matriz: movida y reflejada (los triángulos se dan vuelta para seguir mirando afuera)', () => {
    const base = props(brepMeshGeometry(leaf)!)
    const moved = props(brepMeshGeometry({ ...leaf, m: affineOf((p) => [p[0] + 50, p[1], p[2]]) })!)
    expect(moved.lo[0]).toBeCloseTo(base.lo[0] + 50, 4)
    const mirrored = props(brepMeshGeometry({ ...leaf, m: affineOf((p) => [p[0], -p[1], p[2]]) })!)
    expect(mirrored.vol).toBeCloseTo(base.vol, 4)
    expect(mirrored.lo[1]).toBeCloseTo(-base.hi[1], 4)
  })

  it('sin modelo no hay malla; el sólido se dibuja vacío en vez de romper', () => {
    const missing: BrepProps = { ...leaf, ref: 'sab-0-nada' }
    expect(brepMeshGeometry(missing)).toBeNull()
    expect(solidGeometry(missing).getAttribute('position')?.count ?? 0).toBe(0)
  })

  it('sin núcleo exacto, una resta con una caja se resuelve con la malla', () => {
    const whole = props(solidGeometry(leaf))
    const [lo, hi] = leaf.box
    const mid = (lo[0] + hi[0]) / 2
    const cut = props(
      solidGeometry({
        op: 'SUBTRACT',
        operands: [leaf, { op: 'BOX', origin: [mid, lo[1] - 1, lo[2] - 1], width: hi[0] - mid + 1, depth: hi[1] - lo[1] + 2, height: hi[2] - lo[2] + 2 }],
      }),
    )
    expect(cut.vol).toBeGreaterThan(0)
    expect(cut.vol).toBeLessThan(whole.vol * 0.99)
  })
})
