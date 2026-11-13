import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { lineSpans, rangedRaycast } from './rangedRaycast'

/** Lote de caras como los del viewport: varias piezas seguidas, cada una con sus vértices y sus triángulos. */
function batch(seed: number): { mesh: THREE.Mesh; spans: number[] } {
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const pos: number[] = []
  const idx: number[] = []
  const spans: number[] = []
  for (let piece = 0; piece < 40; piece++) {
    const c = [rnd() * 100, rnd() * 100, rnd() * 20]
    const v0 = pos.length / 3
    const w0 = idx.length
    const nv = piece === 7 ? 0 : 6 + Math.floor(rnd() * 10) // una pieza vacía
    for (let i = 0; i < nv; i++) pos.push(c[0] + rnd() * 8, c[1] + rnd() * 8, c[2] + rnd() * 8)
    for (let t = 0; nv && t < nv * 2; t++) idx.push(v0 + Math.floor(rnd() * nv), v0 + Math.floor(rnd() * nv), v0 + Math.floor(rnd() * nv))
    spans.push(w0, idx.length - w0, v0, nv)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  mesh.position.set(1000, -500, 3) // como los lotes, corridos al origen del dibujo
  mesh.updateMatrixWorld(true)
  return { mesh, spans }
}

describe('rangedRaycast', () => {
  it('da las mismas intersecciones, en el mismo orden, que el raycast de three sobre todo el lote', () => {
    const { mesh, spans } = batch(11)
    const ranged = mesh.clone()
    ranged.userData = { spans }
    ranged.raycast = rangedRaycast
    const rc = new THREE.Raycaster()
    let s = 5
    const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647)
    let hits = 0
    for (let k = 0; k < 400; k++) {
      const o = new THREE.Vector3(1000 + rnd() * 120 - 10, -500 + rnd() * 120 - 10, 200)
      const d = new THREE.Vector3(rnd() * 0.4 - 0.2, rnd() * 0.4 - 0.2, -1).normalize()
      rc.set(o, d)
      const a = rc.intersectObject(mesh)
      const b = rc.intersectObject(ranged)
      expect(b.map((h) => [h.distance, h.faceIndex, h.point.toArray()])).toEqual(a.map((h) => [h.distance, h.faceIndex, h.point.toArray()]))
      hits += a.length
    }
    expect(hits).toBeGreaterThan(50)
    expect(ranged.geometry.drawRange).toEqual({ start: 0, count: Infinity })
  })

  it('en un lote de tramos (aristas), con la tolerancia del pick, también', () => {
    let s = 9
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    const pos: number[] = []
    const ranges: { s: number; id: string }[] = []
    for (let piece = 0; piece < 50; piece++) {
      ranges.push({ s: pos.length / 3, id: 'e' + piece })
      const c = [rnd() * 100, rnd() * 100, rnd() * 20]
      for (let t = 0; t < 2 + Math.floor(rnd() * 8); t++) pos.push(c[0] + rnd() * 6, c[1] + rnd() * 6, c[2], c[0] + rnd() * 6, c[1] + rnd() * 6, c[2] + rnd() * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    const plain = new THREE.LineSegments(g, new THREE.LineBasicMaterial())
    plain.position.set(-300, 40, 0)
    plain.updateMatrixWorld(true)
    const ranged = plain.clone()
    ranged.userData = { spans: lineSpans(ranges, pos.length / 3) }
    ranged.raycast = rangedRaycast
    const rc = new THREE.Raycaster()
    rc.params.Line = { threshold: 0.8 }
    let hits = 0
    for (let k = 0; k < 400; k++) {
      rc.set(new THREE.Vector3(-300 + rnd() * 110 - 5, 40 + rnd() * 110 - 5, 100), new THREE.Vector3(0, 0, -1))
      const a = rc.intersectObject(plain)
      const b = rc.intersectObject(ranged)
      expect(b.map((h) => [h.distance, h.index, h.point.toArray()])).toEqual(a.map((h) => [h.distance, h.index, h.point.toArray()]))
      hits += a.length
    }
    expect(hits).toBeGreaterThan(30)
  })

  it('sin piezas que cubran todo el lote, o con una que empieza a mitad de un tramo, no se parte', () => {
    expect(lineSpans([], 10)).toBeNull()
    expect(lineSpans([{ s: 2 }], 10)).toBeNull()
    expect(lineSpans([{ s: 0 }, { s: 3 }], 10)).toBeNull()
    expect(lineSpans([{ s: 0 }, { s: 4 }], 10)).toEqual([0, 4, 0, 4, 4, 6, 4, 6])
  })
})
