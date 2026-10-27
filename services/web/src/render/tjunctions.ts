import * as THREE from 'three'

/**
 * Cierra las uniones en T de una malla de triángulos: un vértice que cae en medio de la arista de otro triángulo
 * (la CSG las deja a miles) se inserta también en ese triángulo, que se re-triangula. Sin esto, al rasterizar
 * quedan grietas sub-píxel por las que se ve el fondo (puntitos sobre las caras planas) y la malla no es cerrada.
 * Los atributos del vértice insertado se interpolan a lo largo de la arista (la superficie `surf`, sin interpolar).
 * Devuelve la misma geometría si no hay nada que cerrar.
 */
export function closeTJunctions(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geom.index ? geom.toNonIndexed() : geom
  const pos = g.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pos || pos.count < 3) return geom
  g.computeBoundingBox()
  const size = g.boundingBox!.getSize(new THREE.Vector3()).length()
  if (!(size > 0)) return geom
  const n = pos.count

  // Identidad de vértices por posición, soldando los casi coincidentes (a una millonésima del tamaño): la CSG deja
  // pares de vértices separados por décimas de micra que no son T sino astillas; soldados, esas astillas se caen.
  const weld = size * 1e-6
  const ids = new Int32Array(n)
  const uniq: number[] = [] // índice de una copia representativa
  const cells = new Map<string, number[]>()
  const wc = (v: number) => Math.floor(v / weld)
  for (let i = 0; i < n; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)]
    const [cx, cy, cz] = [wc(x), wc(y), wc(z)]
    let id = -1
    for (let dx = -1; dx <= 1 && id < 0; dx++)
      for (let dy = -1; dy <= 1 && id < 0; dy++)
        for (let dz = -1; dz <= 1 && id < 0; dz++)
          for (const u of cells.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
            const r = uniq[u]
            if (Math.hypot(pos.getX(r) - x, pos.getY(r) - y, pos.getZ(r) - z) <= weld) {
              id = u
              break
            }
          }
    if (id < 0) {
      id = uniq.length
      uniq.push(i)
      const k = `${cx},${cy},${cz}`
      const list = cells.get(k)
      if (list) list.push(id)
      else cells.set(k, [id])
    }
    ids[i] = id
  }

  // Aristas sin pareja: ahí están las T.
  const tris = n / 3
  const ekey = (a: number, b: number) => (a < b ? a * 4294967296 + b : b * 4294967296 + a)
  const count = new Map<number, number>()
  const degenerate = (t: number) => ids[3 * t] === ids[3 * t + 1] || ids[3 * t + 1] === ids[3 * t + 2] || ids[3 * t] === ids[3 * t + 2]
  for (let t = 0; t < tris; t++) {
    if (degenerate(t)) continue
    for (let k = 0; k < 3; k++) {
      const e = ekey(ids[3 * t + k], ids[3 * t + ((k + 1) % 3)])
      count.set(e, (count.get(e) ?? 0) + 1)
    }
  }
  const candidates = new Set<number>()
  for (let t = 0; t < tris; t++) {
    if (degenerate(t)) continue
    for (let k = 0; k < 3; k++) {
      const a = ids[3 * t + k]
      const b = ids[3 * t + ((k + 1) % 3)]
      if (count.get(ekey(a, b)) === 1) candidates.add(a).add(b)
    }
  }
  let welded = false
  for (let t = 0; t < tris && !welded; t++) welded = degenerate(t)
  if (candidates.size === 0 && !welded) return geom

  // Grilla espacial de los extremos de aristas abiertas.
  const cell = size / 128
  const grid = new Map<string, number[]>()
  const ck = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`
  const P = (id: number): [number, number, number] => [pos.getX(uniq[id]), pos.getY(uniq[id]), pos.getZ(uniq[id])]
  for (const id of candidates) {
    const [x, y, z] = P(id)
    const k = ck(x, y, z)
    const list = grid.get(k)
    if (list) list.push(id)
    else grid.set(k, [id])
  }

  /** Vértices estrictamente dentro de la arista a→b (a menos de `weld`), ordenados por su parámetro. */
  const inside = (a: number, b: number): Array<{ id: number; t: number }> => {
    const pa = P(a)
    const pb = P(b)
    const d = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]
    const len = Math.hypot(d[0], d[1], d[2])
    if (len < 4 * weld) return []
    const seen = new Set<string>()
    const out: Array<{ id: number; t: number }> = []
    const steps = Math.ceil(len / (cell * 0.5)) + 1
    for (let s = 0; s <= steps; s++) {
      const f = s / steps
      const x = pa[0] + d[0] * f
      const y = pa[1] + d[1] * f
      const z = pa[2] + d[2] * f
      const [cx, cy, cz] = [Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell)]
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) {
            const k = `${cx + dx},${cy + dy},${cz + dz}`
            if (seen.has(k)) continue
            seen.add(k)
            for (const id of grid.get(k) ?? []) {
              if (id === a || id === b) continue
              const p = P(id)
              const t = ((p[0] - pa[0]) * d[0] + (p[1] - pa[1]) * d[1] + (p[2] - pa[2]) * d[2]) / (len * len)
              // Lejos de los extremos y sobre la recta: los vértices en T de la CSG caen exactos en la arista vecina.
              if (t * len <= 2 * weld || (1 - t) * len <= 2 * weld) continue
              const off = Math.hypot(pa[0] + d[0] * t - p[0], pa[1] + d[1] * t - p[1], pa[2] + d[2] * t - p[2])
              if (off < weld) out.push({ id, t })
            }
          }
    }
    const uniqOut = new Map<number, { id: number; t: number }>()
    for (const o of out) uniqOut.set(o.id, o)
    return [...uniqOut.values()].sort((u, v) => u.t - v.t)
  }

  const names = Object.keys(g.attributes)
  const attrs = names.map((nm) => g.getAttribute(nm) as THREE.BufferAttribute)
  const out: number[][] = attrs.map(() => [])
  let changed = false

  /** Agrega un vértice: copia `i` o interpola entre las copias `i` y `j` (o promedia las tres de un triángulo). */
  const emit = (vals: (a: THREE.BufferAttribute, nm: string) => number[]) => {
    attrs.forEach((a, k) => out[k].push(...vals(a, names[k])))
  }
  const copy = (i: number) => emit((a, nm) => (nm === 'position' ? P(ids[i]) : Array.from({ length: a.itemSize }, (_, c) => a.getComponent(i, c))))
  const lerp = (i: number, j: number, t: number, exact: [number, number, number]) =>
    emit((a, nm) => {
      if (nm === 'position') return exact
      if (nm === 'surf') return Array.from({ length: a.itemSize }, (_, c) => a.getComponent(i, c))
      return Array.from({ length: a.itemSize }, (_, c) => a.getComponent(i, c) * (1 - t) + a.getComponent(j, c) * t)
    })
  const centroid = (i0: number) =>
    emit((a, nm) =>
      Array.from({ length: a.itemSize }, (_, c) =>
        nm === 'surf' ? a.getComponent(i0, c) : (a.getComponent(i0, c) + a.getComponent(i0 + 1, c) + a.getComponent(i0 + 2, c)) / 3,
      ),
    )

  for (let t = 0; t < tris; t++) {
    const i0 = 3 * t
    if (ids[i0] === ids[i0 + 1] || ids[i0 + 1] === ids[i0 + 2] || ids[i0] === ids[i0 + 2]) {
      changed = true // astilla que la soldadura dejó sin área
      continue
    }
    const extra: Array<Array<{ id: number; t: number }>> = [0, 1, 2].map((k) => {
      const a = ids[i0 + k]
      const b = ids[i0 + ((k + 1) % 3)]
      return count.get(ekey(a, b)) === 1 ? inside(a, b) : []
    })
    const withPts = extra.filter((e) => e.length).length
    if (withPts === 0) {
      for (let k = 0; k < 3; k++) copy(i0 + k)
      continue
    }
    changed = true
    // Contorno del triángulo con los puntos insertados: (vértice de origen, siguiente, parámetro, posición).
    type Loop = { i: number; j: number; t: number; p: [number, number, number] | null }
    const loop: Loop[] = []
    for (let k = 0; k < 3; k++) {
      const i = i0 + k
      const j = i0 + ((k + 1) % 3)
      loop.push({ i, j, t: 0, p: null })
      for (const e of extra[k]) loop.push({ i, j, t: e.t, p: P(e.id) })
    }
    const put = (v: Loop) => (v.p ? lerp(v.i, v.j, v.t, v.p) : copy(v.i))
    if (withPts === 1) {
      // Abanico desde el vértice opuesto a la única arista partida.
      const k = extra.findIndex((e) => e.length)
      const apex = (k + 2) % 3
      const start = loop.findIndex((v) => v.p === null && v.i === i0 + apex)
      const ring = [...loop.slice(start), ...loop.slice(0, start)]
      for (let s = 1; s + 1 < ring.length; s++) {
        put(ring[0])
        put(ring[s])
        put(ring[s + 1])
      }
    } else {
      // Abanico desde el centroide: nunca deja triángulos degenerados.
      for (let s = 0; s < loop.length; s++) {
        centroid(i0)
        put(loop[s])
        put(loop[(s + 1) % loop.length])
      }
    }
  }
  if (!changed) return geom
  const res = new THREE.BufferGeometry()
  attrs.forEach((a, k) => res.setAttribute(names[k], new THREE.Float32BufferAttribute(out[k], a.itemSize)))
  res.computeBoundingBox()
  res.computeBoundingSphere()
  return res
}
