import type { Vec3 } from '../math'
import type { Topology } from '../editing/topology'

/**
 * Mallas importadas (MESH3D de un STEP/IGES) en las vistas de dibujo.
 *
 * OpenCascade tesela cada cara del B-rep por separado: sus triángulos comparten vértices sólo dentro de la cara. De ahí
 * salen las caras originales (`brepFaceIds`), que separan una tangente real (cara plana ↔ empalme) de la costura de
 * una superficie partida en dos caras, y los bordes sueltos (`openBoundaryEdges`).
 *
 * Bordes sueltos: en un IGES sin coser las dos caras de una arista la parten en puntos distintos (hasta unas centésimas
 * de mm de separación en los arcos) y la topología no las empareja: la arista quedaba sin dibujar, o partida en los
 * tramos que sí coincidían. Acá cada tramo suelto busca los de **otras caras** que corren sobre él (paralelos,
 * superpuestos y a menos de `tol`) y se decide como en una arista emparejada: arista viva, silueta o tangente (cara
 * plana ↔ curva) se dibujan; la unión suave de dos caras curvas o de dos planos al ras, no. De cada tramo compartido se
 * dibuja un solo lado (el de la cara de menor id), para no duplicar líneas. Lo que no tiene pareja es borde real de la
 * malla: se dibuja.
 */

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const at = (p: Vec3, d: Vec3, t: number): Vec3 => [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t]

/** Distancia de `p` al segmento p0 + d·[0, 1]. */
function distToSeg(p: Vec3, p0: Vec3, d: Vec3): number {
  const L2 = dot(d, d)
  const t = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, p0), d) / L2)) : 0
  const q = at(p0, d, t)
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

/**
 * Cara del B-rep de cada triángulo (en el orden del abanico de cada polígono), o null si la malla no viene así: las
 * componentes conexas por índice de vértice son las caras si hay varias, casi ningún triángulo queda solo (una sopa de
 * triángulos sueltos, como un STL sin soldar, no) y sus bordes se tocan (vértices repetidos en la misma posición).
 */
export function brepFaceIds(m: { vertices: Vec3[]; faces: number[][] }): number[] | null {
  const parent = m.vertices.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  for (const f of m.faces) for (let k = 1; k < f.length; k++) parent[find(f[k])] = find(f[0])
  const ids: number[] = []
  const size = new Map<number, number>()
  for (const f of m.faces) {
    const r = find(f[0])
    for (let k = 1; k + 1 < f.length; k++) {
      ids.push(r)
      size.set(r, (size.get(r) ?? 0) + 1)
    }
  }
  if (size.size < 2) return null
  let alone = 0
  for (const n of size.values()) if (n === 1) alone++
  if (alone * 2 > ids.length) return null
  const seen = new Set<string>()
  let repeated = 0
  for (const v of m.vertices) {
    const k = `${v[0]},${v[1]},${v[2]}`
    if (seen.has(k)) repeated++
    else seen.add(k)
  }
  return repeated * 10 >= m.vertices.length ? ids : null
}

interface Half {
  t: number
  p: Vec3
  d: Vec3
  L: number
}

/**
 * Tramos a dibujar de las medias aristas sueltas (`topo.open`) vistas desde `out`. `smoothDot`: coseno por encima del
 * cual dos facetas siguen la misma superficie suave (el mismo criterio que las aristas emparejadas).
 */
export function openBoundaryEdges(topo: Topology, out: Vec3, tangential: boolean, smoothDot: number): Array<[Vec3, Vec3]> {
  const open = topo.open ?? []
  if (!open.length) return []
  const { verts, normals, triFace } = topo
  // Separación admitida entre los dos lados de una arista (las teselas de cada cara siguen la curva con su propia flecha).
  const tol = Math.max(topo.diag * 1e-3, 1e-9)
  const halves: Half[] = open.map(([t, a, b]) => {
    const d = sub(verts[b], verts[a])
    return { t, p: verts[a], d, L: Math.hypot(d[0], d[1], d[2]) }
  })
  // Grilla: cada tramo se anota en las celdas que atraviesa (del largo típico de un tramo).
  const lens = halves.map((h) => h.L).sort((x, y) => x - y)
  const cell = Math.max(lens[lens.length >> 1] ?? tol, tol * 4)
  const key = (i: number, j: number, k: number): number => ((i * 73856093) ^ (j * 19349663) ^ (k * 83492791)) | 0
  /** Celdas de puntos tomados a lo largo del tramo (cada medio lado de celda); con `ring`, también las vecinas. */
  const cellsAlong = (h: Half, ring: boolean): Set<number> => {
    const steps = Math.ceil(h.L / (cell * 0.5)) + 1
    const cells = new Set<number>()
    const r = ring ? 1 : 0
    for (let s = 0; s <= steps; s++) {
      const q = at(h.p, h.d, s / steps)
      const [x, y, z] = [Math.floor(q[0] / cell), Math.floor(q[1] / cell), Math.floor(q[2] / cell)]
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) cells.add(key(x + dx, y + dy, z + dz))
    }
    return cells
  }
  const grid = new Map<number, number[]>()
  halves.forEach((h, i) => {
    for (const k of cellsAlong(h, false)) {
      const list = grid.get(k)
      if (list) list.push(i)
      else grid.set(k, [i])
    }
  })
  const planar = (f: number) => topo.shapes?.[f]?.kind === 'plane'
  const facing = (n: Vec3) => dot(n, out) > 1e-6
  const res: Array<[Vec3, Vec3]> = []
  const seenBy = new Int32Array(halves.length).fill(-1)
  halves.forEach((h, i) => {
    if (h.L < 1e-12) return
    const nh = normals[h.t]
    const fh = triFace[h.t]
    // Intervalos de `h` (en su parámetro 0..1) cubiertos por otra cara y si de ese lado se dibujan.
    const spans: Array<{ lo: number; hi: number; draw: boolean }> = []
    for (const k of cellsAlong(h, true)) {
      for (const j of grid.get(k) ?? []) {
        if (j === i || seenBy[j] === i) continue
        seenBy[j] = i
        const g = halves[j]
        if (g.t === h.t || g.L < 1e-12) continue
        const c = dot(h.d, g.d) / (h.L * g.L)
        if (Math.abs(c) < 0.9) continue // no corren juntas
        const s0 = dot(sub(g.p, h.p), h.d) / (h.L * h.L)
        const s1 = dot(sub(at(g.p, g.d, 1), h.p), h.d) / (h.L * h.L)
        const lo = Math.max(0, Math.min(s0, s1))
        const hi = Math.min(1, Math.max(s0, s1))
        if ((hi - lo) * h.L <= tol * 0.01) continue
        if (distToSeg(at(h.p, h.d, lo), g.p, g.d) > tol || distToSeg(at(h.p, h.d, (lo + hi) / 2), g.p, g.d) > tol || distToSeg(at(h.p, h.d, hi), g.p, g.d) > tol) continue
        // Recorrida en el mismo sentido: una de las dos caras viene invertida.
        const ng: Vec3 = c > 0 ? [-normals[g.t][0], -normals[g.t][1], -normals[g.t][2]] : normals[g.t]
        const fg = triFace[g.t]
        const owner = fh < fg || (fh === fg && h.t < g.t)
        let draw: boolean
        if (Math.abs(dot(nh, out)) < 0.05 && Math.abs(dot(ng, out)) < 0.05) draw = false // dos caras de canto
        else if (dot(nh, ng) <= smoothDot) draw = owner // arista viva
        else if (facing(nh) !== facing(ng)) draw = owner // silueta sobre la unión de dos caras suaves
        // Unión suave: tangente si una cara es plana y la otra curva, o dos planos casi alineados (un quiebre leve). Dos
        // caras curvas (la costura de una superficie partida) o dos planos al ras no se dibujan.
        else draw = tangential && owner && (planar(fh) !== planar(fg) || (planar(fh) && dot(nh, ng) < 1 - 1e-6))
        spans.push({ lo, hi, draw })
      }
    }
    // Recorre los pedazos entre cortes: sin pareja se dibuja (borde real); con pareja, sólo si todas lo dibujan.
    const cuts = [...new Set([0, 1, ...spans.flatMap((s) => [s.lo, s.hi])])].sort((x, y) => x - y)
    let from = -1
    for (let k = 0; k + 1 < cuts.length; k++) {
      const m = (cuts[k] + cuts[k + 1]) / 2
      const cover = spans.filter((s) => s.lo <= m && m <= s.hi)
      const draw = cover.every((s) => s.draw)
      if (draw && from < 0) from = cuts[k]
      if (!draw && from >= 0) {
        res.push([at(h.p, h.d, from), at(h.p, h.d, cuts[k])])
        from = -1
      }
    }
    if (from >= 0) res.push([at(h.p, h.d, from), at(h.p, h.d, 1)])
  })
  return res
}
