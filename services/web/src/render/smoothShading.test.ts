import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { smoothShading } from './smoothShading'

/** No indexada, con `surf` por grupo (como `tagSurfaces`). */
function soup(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = g.getIndex()
  const surf = new Float32Array(idx ? idx.count : g.getAttribute('position').count)
  g.groups.forEach((gr, k) => surf.fill(k, gr.start, gr.start + gr.count))
  const out = g.toNonIndexed()
  out.setAttribute('surf', new THREE.BufferAttribute(surf, 1))
  return out
}

/** Mayor desvío (grados) entre la normal de cada esquina y la normal plana de su cara. */
function maxDeviation(g: THREE.BufferGeometry): number {
  const p = g.getAttribute('position')
  const n = g.getAttribute('normal')
  const [a, b, c, f, v] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  let worst = 0
  for (let t = 0; t < p.count / 3; t++) {
    a.fromBufferAttribute(p, 3 * t)
    b.fromBufferAttribute(p, 3 * t + 1)
    c.fromBufferAttribute(p, 3 * t + 2)
    f.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize()
    for (let k = 0; k < 3; k++) worst = Math.max(worst, (v.fromBufferAttribute(n, 3 * t + k).angleTo(f) * 180) / Math.PI)
  }
  return worst
}

describe('smoothShading', () => {
  it('a 32-sided cylinder wall is smooth at 10° (same surface), its caps stay flat', () => {
    const g = soup(new THREE.CylinderGeometry(1, 1, 2, 32))
    smoothShading(g, 10)
    const p = g.getAttribute('position')
    const n = g.getAttribute('normal')
    for (let i = 0; i < p.count; i++) {
      const surf = g.getAttribute('surf').getX(i)
      if (surf === 0) expect(Math.abs(n.getY(i))).toBeLessThan(1e-6) // pared: normal radial
      else expect(Math.abs(n.getY(i))).toBeCloseTo(1, 6) // tapas: normal del eje
    }
    expect(maxDeviation(g)).toBeCloseTo(11.25 / 2, 1)
  })

  it('box faces (90°) stay flat', () => {
    const g = soup(new THREE.BoxGeometry(1, 2, 3))
    smoothShading(g, 10)
    expect(maxDeviation(g)).toBeLessThan(1e-6)
  })

  it('faces of different surfaces are smoothed only below the angle; 0 = faceted', () => {
    // Dos triángulos que comparten una arista y se cruzan a 6°, de superficies distintas.
    const s = Math.sin((6 * Math.PI) / 180)
    const c = Math.cos((6 * Math.PI) / 180)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, -1, 0, 0, 0, 0, 0, c, 0, s, 0, 1, 0], 3))
    g.setAttribute('surf', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1], 1))
    smoothShading(g, 10)
    expect(maxDeviation(g)).toBeGreaterThan(1)
    smoothShading(g, 5)
    expect(maxDeviation(g)).toBeLessThan(1e-4)
    const same = g.clone()
    same.setAttribute('surf', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 1))
    smoothShading(same, 0)
    expect(maxDeviation(same)).toBeLessThan(1e-4)
  })

  it('leaves indexed geometry (analytic normals) untouched', () => {
    const g = new THREE.SphereGeometry(1, 8, 6)
    const before = g.getAttribute('normal')
    smoothShading(g, 0)
    expect(g.getAttribute('normal')).toBe(before)
  })
})

describe('smoothShading on degenerate triangles', () => {
  it('a zero-area sliver takes the normal of its healthy neighbour and does not bend it', () => {
    const g = new THREE.BufferGeometry()
    // Cara sana en z=0 y una aguja colineal (área nula) sobre su borde.
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 1, 0, 0], 3))
    smoothShading(g, 10)
    const n = g.getAttribute('normal')
    for (let i = 0; i < 6; i++) expect([n.getX(i), n.getY(i), n.getZ(i)].map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([0, 0, 1])
  })
})
