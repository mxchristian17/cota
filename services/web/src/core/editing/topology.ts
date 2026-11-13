import type { Vec3 } from '../math'
import type { SolidProps } from '../document/types'
import { closestOnSegment, vadd, vcross, vdist, vdot, vlen, vnorm, vscale, vsub } from '../geom/vec3'
import { LruCache } from '../lru'

/**
 * Topología B-rep **derivada de la malla** de un sólido (Vía A): caras suaves y aristas
 * vivas reconstruidas a partir de los triángulos que produce la CSG. Sirve para seleccionar aristas
 * (FILLETEDGE/CHAMFEREDGE) y para construir los cortadores del empalme/chaflán.
 */

/** Ángulo por debajo del cual dos facetas vecinas pertenecen a la misma cara suave. */
const SMOOTH_COS = Math.cos((25 * Math.PI) / 180)
/** Diedro casi llano (< 3°): arista tangente. */
const TANGENT_COS = Math.cos((3 * Math.PI) / 180)

/** Arista viva entre dos caras suaves: polilínea ordenada con las normales de ambas caras por tramo. */
export interface TopoEdge {
  pts: Vec3[]
  /** Índices de vértice de cada punto (para consultar las caras incidentes en los extremos). */
  vids: number[]
  closed: boolean
  /** Caras a ambos lados; el sentido de `pts` es el del borde de `faces[0]` (antihorario visto desde afuera). */
  faces: [number, number]
  /** Normal de cada cara en cada tramo (`pts.length − 1` tramos; `pts.length` si es cerrada). */
  n1: Vec3[]
  n2: Vec3[]
  convex: boolean
  kind: 'line' | 'circle' | 'curve'
}

/** Superficie analítica de una primitiva, por id de `surf` (la registra el mallador). */
export type SurfShape = { kind: 'sphere'; c: Vec3; r: number }

/**
 * Superficie exacta de una cara: plano (`n` hacia afuera, `n·p = d`) o esfera de la primitiva. En la esfera, `rin`
 * es la distancia mínima del centro a las facetas: la malla queda entre `rin` y `r`.
 */
export type FaceShape = { kind: 'plane'; n: Vec3; d: number } | { kind: 'sphere'; c: Vec3; r: number; rin: number }

export interface Topology {
  /** Superficie exacta de cada cara, si se conoce. */
  shapes?: (FaceShape | null)[]
  verts: Vec3[]
  tris: [number, number, number][]
  /** Normal (del grupo plano) de cada triángulo. */
  normals: Vec3[]
  /** Cara suave de cada triángulo. */
  triFace: number[]
  faceCount: number
  edges: TopoEdge[]
  /** Triángulos incidentes a cada vértice. */
  vertTris: number[][]
  /** Diagonal del bounding box (escala de tolerancias). */
  diag: number
  /** Triángulos vecinos (también los emparejados por T-junction): [t1, t2, vértice a, vértice b]. */
  links: [number, number, number, number][]
}

/** Tramo de arista entre dos triángulos de caras distintas (a→b en el sentido del triángulo de `fa`). */
interface Piece {
  a: number
  b: number
  fa: number
  fb: number
  na: Vec3
  nb: Vec3
  convex: boolean
}

// ---------------------------------------------------------------------------------------------
// Soldado de vértices
// ---------------------------------------------------------------------------------------------

/** Clave numérica de una celda de un hash espacial (sin armar cadenas: es lo que más tiempo se llevaba). */
const cellKey = (i: number, j: number, k: number): number => ((i * 73856093) ^ (j * 19349663) ^ (k * 83492791)) | 0

/** Hash espacial de índices de puntos en celdas de lado `size`. */
function pointGrid(size: number) {
  const map = new Map<number, number[]>()
  const c = (v: number) => Math.floor(v / size)
  return {
    add(p: Vec3, id: number) {
      const k = cellKey(c(p[0]), c(p[1]), c(p[2]))
      const list = map.get(k)
      if (list) list.push(id)
      else map.set(k, [id])
    },
    /** Índices en la celda de `p` y sus 26 vecinas (puede repetir por colisiones de la clave). */
    near(p: Vec3, visit: (id: number) => boolean | void): void {
      const [ci, cj, ck] = [c(p[0]), c(p[1]), c(p[2])]
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++)
          for (let dk = -1; dk <= 1; dk++) {
            const list = map.get(cellKey(ci + di, cj + dj, ck + dk))
            if (list) for (const id of list) if (visit(id) === true) return
          }
    },
  }
}

function weld(pos: ArrayLike<number>, tol: number): { verts: Vec3[]; idx: number[] } {
  const verts: Vec3[] = []
  const idx: number[] = []
  const grid = pointGrid(tol)
  for (let p = 0; p + 2 < pos.length; p += 3) {
    const v: Vec3 = [pos[p], pos[p + 1], pos[p + 2]]
    let id = -1
    grid.near(v, (q) => {
      if (vdist(verts[q], v) <= tol) {
        id = q
        return true
      }
    })
    if (id < 0) {
      id = verts.length
      verts.push(v)
      grid.add(v, id)
    }
    idx.push(id)
  }
  return { verts, idx }
}

// ---------------------------------------------------------------------------------------------
// Medias aristas, gemelos y T-junctions
// ---------------------------------------------------------------------------------------------

interface Half {
  a: number
  b: number
  t: number
}

/** Empareja medias aristas a→b con b→a. Devuelve los pares y las que quedaron sin gemelo. */
function matchHalves(halves: Half[], nV: number): { pairs: [Half, Half][]; open: Half[] } {
  const byKey = new Map<number, Half[]>()
  for (const h of halves) {
    const k = h.a * nV + h.b
    const list = byKey.get(k)
    if (list) list.push(h)
    else byKey.set(k, [h])
  }
  const used = new Set<Half>()
  const pairs: [Half, Half][] = []
  const open: Half[] = []
  for (const h of halves) {
    if (used.has(h)) continue
    const twin = (byKey.get(h.b * nV + h.a) ?? []).find((o) => !used.has(o) && o.t !== h.t)
    if (!twin) {
      open.push(h)
      continue
    }
    used.add(h)
    used.add(twin)
    pairs.push([h, twin])
  }
  return { pairs, open: open.filter((h) => !used.has(h)) }
}

/** Parte cada media arista sin gemelo en los vértices (de otras sin gemelo) que caen sobre ella. */
function splitTJunctions(open: Half[], verts: Vec3[], tol: number): Half[] {
  const cand = [...new Set(open.flatMap((h) => [h.a, h.b]))]
  // Celdas del tamaño típico de una arista abierta: se recorren sólo las que atraviesa cada segmento.
  const lens = open.map((h) => vdist(verts[h.a], verts[h.b])).sort((x, y) => x - y)
  const size = Math.max(lens[Math.floor(lens.length / 2)] ?? tol, tol * 4)
  const grid = pointGrid(size)
  for (const v of cand) grid.add(verts[v], v)
  const out: Half[] = []
  for (const h of open) {
    const a = verts[h.a]
    const b = verts[h.b]
    const inner: { v: number; t: number }[] = []
    const seen = new Set<number>()
    const steps = Math.ceil(vdist(a, b) / (size * 0.5)) + 1
    for (let s = 0; s <= steps; s++) {
      const f = s / steps
      grid.near([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], (v) => {
        if (v === h.a || v === h.b || seen.has(v)) return
        seen.add(v)
        const p = verts[v]
        const c = closestOnSegment(p, a, b)
        if (c.t > 0 && c.t < 1 && vdist(c.point, p) <= tol) inner.push({ v, t: c.t })
      })
    }
    inner.sort((x, y) => x.t - y.t)
    let prev = h.a
    for (const { v } of inner) {
      out.push({ a: prev, b: v, t: h.t })
      prev = v
    }
    out.push({ a: prev, b: h.b, t: h.t })
  }
  return out
}

/** Último recurso: empareja medias aristas opuestas cuyos extremos difieren en menos de `tol` (CSG en float32). */
function matchNear(open: Half[], verts: Vec3[], tol: number): [Half, Half][] {
  const used = new Set<Half>()
  const pairs: [Half, Half][] = []
  const grid = pointGrid(tol)
  open.forEach((g, i) => grid.add(verts[g.a], i))
  for (const h of open) {
    if (used.has(h)) continue
    let twin: Half | null = null
    grid.near(verts[h.b], (i) => {
      const g = open[i]
      if (g !== h && !used.has(g) && g.t !== h.t && vdist(verts[g.a], verts[h.b]) <= tol && vdist(verts[g.b], verts[h.a]) <= tol) {
        twin = g
        return true
      }
    })
    if (!twin) continue
    used.add(h)
    used.add(twin)
    pairs.push([h, twin])
  }
  return pairs
}

// ---------------------------------------------------------------------------------------------
// Caras: grupos planos + unión de grupos casi tangentes
// ---------------------------------------------------------------------------------------------

function planarGroups(
  tris: [number, number, number][],
  triN: Vec3[],
  area: number[],
  adj: number[][],
  verts: Vec3[],
  tolPlane: number,
  triSurf: number[],
  strictSurf = false,
): { group: number[]; groupN: Vec3[] } {
  const group = new Array<number>(tris.length).fill(-1)
  const groupN: Vec3[] = []
  const order = tris.map((_, i) => i).sort((x, y) => area[y] - area[x])
  const tiny = (area[order[0]] ?? 0) * 1e-6
  for (const seed of order) {
    if (group[seed] >= 0) continue
    const g = groupN.length
    const n0 = triN[seed]
    const d0 = vdot(n0, verts[tris[seed][0]])
    groupN.push(n0)
    group[seed] = g
    const stack = [seed]
    while (stack.length) {
      const t = stack.pop() as number
      for (const nb of adj[t]) {
        if (group[nb] >= 0) continue
        const onPlane = tris[nb].every((v) => Math.abs(vdot(n0, verts[v]) - d0) <= tolPlane)
        if (!onPlane || (area[nb] > tiny && vdot(triN[nb], n0) <= 0)) continue
        // De otra superficie, sólo si es el mismo plano (dos caras al ras): dos empalmes que llegan tangentes a una
        // esfera tienen facetas casi coplanares y quedaban en una misma cara, sin la arista entre ellos.
        // Con caras exactas (núcleo B-rep) cada triángulo es de su cara: nunca se mezclan superficies (una astilla de un
        // empalme junto a un plano quedaba en la cara del plano y la arista entre ellos salía dentada).
        if (triSurf[nb] !== triSurf[seed] && (strictSurf || (area[nb] > tiny && vdot(triN[nb], n0) < 1 - 1e-6))) continue
        group[nb] = g
        stack.push(nb)
      }
    }
  }
  return { group, groupN }
}

/** Union-find simple. */
function makeUnion(n: number): { find: (i: number) => number; join: (a: number, b: number) => void } {
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  return { find, join: (a, b) => void (parent[find(a)] = find(b)) }
}

// ---------------------------------------------------------------------------------------------
// Encadenado de tramos en aristas
// ---------------------------------------------------------------------------------------------

interface RawChain {
  vids: number[]
  segs: Piece[]
  closed: boolean
}

/** Encadena los tramos de un mismo par de caras siguiendo el sentido de `fa`. */
function chainPieces(pieces: Piece[], verts?: Vec3[], maxGap = Infinity): RawChain[] {
  const byStart = new Map<number, Piece[]>()
  const ends = new Set<number>()
  for (const p of pieces) {
    const list = byStart.get(p.a)
    if (list) list.push(p)
    else byStart.set(p.a, [p])
    ends.add(p.b)
  }
  const used = new Set<Piece>()
  const walk = (first: Piece): RawChain => {
    const vids = [first.a]
    const segs: Piece[] = []
    let cur: Piece | undefined = first
    while (cur && !used.has(cur)) {
      used.add(cur)
      segs.push(cur)
      vids.push(cur.b)
      cur = (byStart.get(cur.b) ?? []).find((q) => !used.has(q))
    }
    const closed = vids.length > 2 && vids[0] === vids[vids.length - 1]
    if (closed) vids.pop()
    return { vids, segs, closed }
  }
  const out: RawChain[] = []
  for (const p of pieces) if (!used.has(p) && !ends.has(p.a)) out.push(walk(p))
  for (const p of pieces) if (!used.has(p)) out.push(walk(p))
  return verts ? bridgeGaps(out, verts, maxGap) : out
}

/**
 * Une tramos abiertos de la misma arista separados por un hueco chico. La CSG deja a veces vértices
 * sueltos junto a una arista (un tramo de un lado no tiene pareja del otro) y la arista queda partida
 * (p. ej. la boca de un agujero en tres pedazos): se puentea el hueco si sigue la dirección de la arista
 * y mide a lo sumo ~2,5 tramos típicos, y la arista se cierra si vuelve a su inicio.
 */
function bridgeGaps(chains: RawChain[], verts: Vec3[], maxGap: number): RawChain[] {
  const lens = chains.flatMap((c) => c.segs.map((s) => vdist(verts[s.a], verts[s.b]))).sort((a, b) => a - b)
  if (!lens.length) return chains
  const tol = Math.min(2.5 * lens[Math.floor(lens.length / 2)], maxGap)
  const bridge = (from: Piece, a: number, b: number): Piece => ({ ...from, a, b })
  /** ¿El salto de `a` a `b` continúa la dirección del último tramo `s`? */
  const continues = (s: Piece, a: number, b: number): boolean => {
    const gap = vdist(verts[a], verts[b])
    return gap > 0 && gap <= tol && vdot(segDir(verts, s.a, s.b), vnorm(vsub(verts[b], verts[a]))) > 0.5
  }
  const open = chains.filter((c) => !c.closed)
  let merged = true
  while (merged) {
    merged = false
    for (const c of open) {
      const last = c.segs[c.segs.length - 1]
      const end = c.vids[c.vids.length - 1]
      const next = open.find((d) => d !== c && continues(last, end, d.vids[0]))
      if (!next) continue
      c.segs.push(bridge(last, end, next.vids[0]), ...next.segs)
      c.vids.push(...next.vids)
      open.splice(open.indexOf(next), 1)
      merged = true
      break
    }
  }
  for (const c of open) {
    const last = c.segs[c.segs.length - 1]
    const end = c.vids[c.vids.length - 1]
    if (c.vids.length > 2 && continues(last, end, c.vids[0])) {
      c.segs.push(bridge(last, end, c.vids[0]))
      c.closed = true
    }
  }
  return [...chains.filter((c) => c.closed && !open.includes(c)), ...open]
}

const segDir = (verts: Vec3[], a: number, b: number): Vec3 => vnorm(vsub(verts[b], verts[a]))

/** Fusiona tramos colineales consecutivos (producto de T-junctions o de la triangulación). */
function mergeCollinear(c: RawChain, verts: Vec3[]): RawChain {
  const n = c.segs.length
  if (n < 2) return c
  const collinear = (s: Piece, t: Piece): boolean =>
    s.convex === t.convex && vdot(segDir(verts, s.a, s.b), segDir(verts, t.a, t.b)) > 1 - 1e-6
  let start = 0
  if (c.closed) {
    // Arranca en un vértice con quiebre para no partir un tramo recto en la costura del lazo.
    const k = c.segs.findIndex((s, i) => !collinear(c.segs[(i + n - 1) % n], s))
    if (k < 0) return c
    start = k
  }
  const segs = [...c.segs.slice(start), ...c.segs.slice(0, start)]
  const merged: Piece[] = [{ ...segs[0] }]
  for (let i = 1; i < segs.length; i++) {
    const last = merged[merged.length - 1]
    if (collinear(last, segs[i])) last.b = segs[i].b
    else merged.push({ ...segs[i] })
  }
  const vids = merged.map((s) => s.a)
  if (!c.closed) vids.push(merged[merged.length - 1].b)
  return { vids, segs: merged, closed: c.closed }
}

/** Corta una cadena en quiebres vivos (> 25°) y en cambios de convexidad. */
function splitAtCorners(c: RawChain, verts: Vec3[]): RawChain[] {
  const n = c.segs.length
  const isBreak = (i: number): boolean => {
    const s = c.segs[(i + n - 1) % n]
    const t = c.segs[i]
    // En una arista tangente (empalme que llega a una cara) las dos normales casi coinciden y el signo de la
    // convexidad es ruido: ahí no se corta.
    const tangent = vdot(s.na, s.nb) > TANGENT_COS && vdot(t.na, t.nb) > TANGENT_COS
    return (s.convex !== t.convex && !tangent) || vdot(segDir(verts, s.a, s.b), segDir(verts, t.a, t.b)) < SMOOTH_COS
  }
  const breaks: number[] = []
  for (let i = c.closed ? 0 : 1; i < n; i++) if (isBreak(i)) breaks.push(i)
  if (breaks.length === 0) return [c]
  const out: RawChain[] = []
  const cuts = c.closed ? breaks : [0, ...breaks, n]
  const count = c.closed ? cuts.length : cuts.length - 1
  for (let k = 0; k < count; k++) {
    const from = cuts[k]
    const to = c.closed ? cuts[(k + 1) % cuts.length] : cuts[k + 1]
    const segs: Piece[] = []
    for (let i = from; ; i = (i + 1) % n) {
      if (segs.length > 0 && i === to) break
      segs.push(c.segs[i])
      if (!c.closed && i + 1 === to) break
    }
    out.push({ vids: [...segs.map((s) => s.a), segs[segs.length - 1].b], segs, closed: false })
  }
  return out
}

/** ¿Lazo cerrado plano y equidistante de su centroide? */
function isCircle(pts: Vec3[], tol: number): boolean {
  if (pts.length < 6) return false
  const c = vscale(pts.reduce(vadd, [0, 0, 0] as Vec3), 1 / pts.length)
  const radii = pts.map((p) => vdist(p, c))
  const r = radii.reduce((s, v) => s + v, 0) / radii.length
  if (r <= tol || radii.some((v) => Math.abs(v - r) > Math.max(tol, r * 1e-3))) return false
  let normal: Vec3 = [0, 0, 0]
  for (let i = 0; i < pts.length; i++) normal = vadd(normal, vcross(pts[i], pts[(i + 1) % pts.length]))
  const nn = vnorm(normal)
  return pts.every((p) => Math.abs(vdot(nn, vsub(p, c))) <= Math.max(tol, r * 1e-3))
}

function edgeKind(pts: Vec3[], closed: boolean, tol: number): TopoEdge['kind'] {
  if (!closed && pts.length === 2) return 'line'
  return closed && isCircle(pts, tol) ? 'circle' : 'curve'
}

// ---------------------------------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------------------------------

/** Reconstruye caras y aristas a partir de una sopa de triángulos (9 números por triángulo). */
/**
 * `surf` (opcional): superficie de origen de cada triángulo. Dos facetas vecinas casi paralelas sólo forman la
 * misma cara si vienen de la misma superficie: la arista entre una cara plana y un empalme tangente se conserva.
 */
export function buildTopology(
  positions: ArrayLike<number>,
  surf?: ArrayLike<number> | null,
  surfShapes?: ReadonlyMap<number, SurfShape>,
  /** `surf` viene de caras exactas (núcleo B-rep): las caras de la topología son exactamente esas. */
  strictSurf = false,
): Topology {
  let lo: Vec3 = [Infinity, Infinity, Infinity]
  let hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 2 < positions.length; i += 3) {
    lo = [Math.min(lo[0], positions[i]), Math.min(lo[1], positions[i + 1]), Math.min(lo[2], positions[i + 2])]
    hi = [Math.max(hi[0], positions[i]), Math.max(hi[1], positions[i + 1]), Math.max(hi[2], positions[i + 2])]
  }
  const diag = positions.length >= 9 ? vdist(lo, hi) : 0
  const tol = Math.max(diag * 1e-5, 1e-9)
  const { verts, idx } = weld(positions, tol)

  const tris: [number, number, number][] = []
  const triN: Vec3[] = []
  const area: number[] = []
  const triSurf: number[] = []
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]]
    if (a === b || b === c || a === c) continue
    const cr = vcross(vsub(verts[b], verts[a]), vsub(verts[c], verts[a]))
    const l = vlen(cr)
    // Astillas (altura < tol): se descartan; sus vecinos se reconectan por T-junction.
    const longest = Math.max(vdist(verts[a], verts[b]), vdist(verts[b], verts[c]), vdist(verts[c], verts[a]))
    if (l <= 0 || l / longest < tol * 10) continue
    tris.push([a, b, c])
    triSurf.push(surf ? surf[i / 3] : 0)
    triN.push(vscale(cr, 1 / l))
    area.push(l / 2)
  }

  const halves: Half[] = tris.flatMap(([a, b, c], t) => [
    { a, b, t },
    { a: b, b: c, t },
    { a: c, b: a, t },
  ])
  const first = matchHalves(halves, verts.length)
  const second = matchHalves(splitTJunctions(first.open, verts, tol * 10), verts.length)
  const pairs = [...first.pairs, ...second.pairs, ...matchNear(second.open, verts, tol * 10)]

  const adj: number[][] = tris.map(() => [])
  for (const [h, g] of pairs) {
    adj[h.t].push(g.t)
    adj[g.t].push(h.t)
  }
  const { group, groupN } = planarGroups(tris, triN, area, adj, verts, Math.max(diag * 1e-4, 1e-9), triSurf, strictSurf && !!surf)

  const groupSurf: number[] = []
  tris.forEach((_, t) => {
    if (groupSurf[group[t]] === undefined) groupSurf[group[t]] = triSurf[t]
  })
  const uf = makeUnion(groupN.length)
  for (const [h, g] of pairs) {
    const [ga, gb] = [group[h.t], group[g.t]]
    if (ga !== gb && groupSurf[ga] === groupSurf[gb] && vdot(groupN[ga], groupN[gb]) > SMOOTH_COS) uf.join(ga, gb)
  }
  // Pedazos del mismo plano que sólo se tocan en un vértice (en el polo de una esfera la CSG deja astillas y la pared
  // plana quedaba partida): son la misma cara, si no la arista que la bordea se corta en dos.
  const atVertex = new Map<number, number[]>()
  tris.forEach((tri, t) => {
    for (const v of tri) {
      const list = atVertex.get(v) ?? []
      for (const g of list) {
        if (g !== group[t] && groupSurf[g] === groupSurf[group[t]] && vdot(groupN[g], groupN[group[t]]) > 1 - 1e-9) uf.join(g, group[t])
      }
      if (!list.includes(group[t])) list.push(group[t])
      atVertex.set(v, list)
    }
  })
  const faceOfRoot = new Map<number, number>()
  const groupFace = groupN.map((_, g) => {
    const r = uf.find(g)
    if (!faceOfRoot.has(r)) faceOfRoot.set(r, faceOfRoot.size)
    return faceOfRoot.get(r) as number
  })
  const triFace = tris.map((_, t) => groupFace[group[t]])
  const normals = tris.map((_, t) => groupN[group[t]])

  // Tramos de arista viva, orientados según la cara de menor id.
  const byPair = new Map<string, Piece[]>()
  for (const [h, g] of pairs) {
    const [fh, fg] = [triFace[h.t], triFace[g.t]]
    if (fh === fg) continue
    const [nh, ng] = [normals[h.t], normals[g.t]]
    const convex = vdot(vcross(nh, ng), vsub(verts[h.b], verts[h.a])) > 0
    const piece: Piece =
      fh < fg
        ? { a: h.a, b: h.b, fa: fh, fb: fg, na: nh, nb: ng, convex }
        : { a: g.a, b: g.b, fa: fg, fb: fh, na: ng, nb: nh, convex }
    const key = `${piece.fa},${piece.fb}`
    const list = byPair.get(key)
    if (list) list.push(piece)
    else byPair.set(key, [piece])
  }

  const edges: TopoEdge[] = []
  for (const list of byPair.values()) {
    for (const raw of chainPieces(list, verts, diag * 0.02)) {
      for (const c of splitAtCorners(mergeCollinear(raw, verts), verts)) {
        const pts = c.vids.map((v) => verts[v])
        const convexCount = c.segs.filter((s) => s.convex).length
        edges.push({
          pts,
          vids: c.vids,
          closed: c.closed,
          faces: [c.segs[0].fa, c.segs[0].fb],
          n1: c.segs.map((s) => s.na),
          n2: c.segs.map((s) => s.nb),
          convex: convexCount * 2 >= c.segs.length,
          kind: edgeKind(pts, c.closed, tol * 10),
        })
      }
    }
  }

  const vertTris: number[][] = verts.map(() => [])
  tris.forEach((t, i) => t.forEach((v) => vertTris[v].push(i)))
  const links = pairs.map(([h, g]): [number, number, number, number] => [h.t, g.t, h.a, h.b])
  const shapes = faceShapes(verts, tris, normals, triFace, faceOfRoot.size, triSurf, surfShapes, tol * 10)
  return { verts, tris, normals, triFace, faceCount: faceOfRoot.size, edges, vertTris, diag, links, shapes }
}

/**
 * Superficie exacta de cada cara: plano si todas sus facetas son paralelas; esfera si viene de una esfera registrada
 * y sus vértices la siguen (un vaciado escala una copia de la malla con los mismos ids y ya no es esa esfera).
 */
function faceShapes(
  verts: Vec3[],
  tris: [number, number, number][],
  normals: Vec3[],
  triFace: number[],
  faceCount: number,
  triSurf: number[],
  surfShapes: ReadonlyMap<number, SurfShape> | undefined,
  tol: number,
): (FaceShape | null)[] {
  const first: number[] = new Array(faceCount).fill(-1)
  const planar: boolean[] = new Array(faceCount).fill(true)
  tris.forEach((_, t) => {
    const f = triFace[t]
    if (first[f] < 0) first[f] = t
    else if (vdot(normals[first[f]], normals[t]) < 1 - 1e-9) planar[f] = false
  })
  const spheres = new Map<number, { s: SurfShape; dmin: number; dmax: number; rin: number }>()
  if (surfShapes?.size) {
    tris.forEach((tri, t) => {
      const f = triFace[t]
      const s = planar[f] ? undefined : surfShapes.get(triSurf[t])
      if (!s) return
      const acc = spheres.get(f) ?? { s, dmin: Infinity, dmax: 0, rin: Infinity }
      for (const v of tri) {
        const d = vdist(verts[v], s.c)
        acc.dmin = Math.min(acc.dmin, d)
        acc.dmax = Math.max(acc.dmax, d)
      }
      acc.rin = Math.min(acc.rin, Math.abs(vdot(normals[t], vsub(verts[tri[0]], s.c))))
      spheres.set(f, acc)
    })
  }
  return first.map((t, f) => {
    if (t < 0) return null
    if (planar[f]) return { kind: 'plane', n: normals[t], d: vdot(normals[t], verts[tris[t][0]]) }
    const sp = spheres.get(f)
    if (!sp || Math.abs(sp.dmax - sp.s.r) > Math.max(tol, sp.s.r * 1e-4) || sp.dmin < sp.s.r * 0.95) return null
    return { kind: 'sphere', c: sp.s.c, r: sp.s.r, rin: Math.min(sp.rin, sp.dmin) }
  })
}

// ---------------------------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------------------------

/** Tramos (índices de punto) de una arista. */
export function edgeSegments(e: TopoEdge): [number, number][] {
  const n = e.pts.length
  const out: [number, number][] = []
  for (let i = 0; i < (e.closed ? n : n - 1); i++) out.push([i, (i + 1) % n])
  return out
}

/** Punto de la arista más cercano a `p` y su distancia. */
export function closestOnEdge(e: TopoEdge, p: Vec3): { point: Vec3; dist: number } {
  let best = { point: e.pts[0], dist: Infinity }
  for (const [i, j] of edgeSegments(e)) {
    const c = closestOnSegment(p, e.pts[i], e.pts[j])
    const d = vdist(c.point, p)
    if (d < best.dist) best = { point: c.point, dist: d }
  }
  return best
}

/** Arista más cercana al punto `p` (en 3D); `null` si supera `tol`. */
export function nearestEdge(topo: Topology, p: Vec3, tol = Infinity): { edge: number; point: Vec3; dist: number } | null {
  let best: { edge: number; point: Vec3; dist: number } | null = null
  for (let i = 0; i < topo.edges.length; i++) {
    const c = closestOnEdge(topo.edges[i], p)
    if (c.dist <= tol && (!best || c.dist < best.dist)) best = { edge: i, ...c }
  }
  return best
}

/** Distancia entre un rayo (origen `o`, dirección unitaria `d`) y el segmento [a,b]. */
function raySegment(o: Vec3, d: Vec3, a: Vec3, b: Vec3): { dist: number; t: number; point: Vec3 } {
  const ab = vsub(b, a)
  const w = vsub(a, o)
  const bb = vdot(ab, ab)
  const db = vdot(d, ab)
  const den = bb - db * db
  // Paralelo al rayo: el extremo más cercano a la cámara.
  let s = den > 1e-12 ? (vdot(d, w) * db - vdot(ab, w)) / den : db > 0 ? 0 : 1
  s = Math.max(0, Math.min(1, s))
  const at = (point: Vec3) => {
    const t = Math.max(0, vdot(vsub(point, o), d))
    return { dist: vdist(vadd(o, vscale(d, t)), point), t, point }
  }
  const r = at(vadd(a, vscale(ab, s)))
  // Casi paralelo: si un extremo también cae en la tolerancia y está más cerca de la cámara, ese.
  for (const q of [at(a), at(b)]) if (q.dist <= r.dist + 1e-9 * (1 + r.t) && q.t < r.t) return q
  return r
}

/** Distancia `t` del rayo (o, d unitaria) al triángulo ABC, o null si no lo toca (Möller–Trumbore). */
function rayTriangle(o: Vec3, d: Vec3, A: Vec3, B: Vec3, C: Vec3): number | null {
  const e1 = vsub(B, A)
  const e2 = vsub(C, A)
  const pv = vcross(d, e2)
  const det = vdot(e1, pv)
  if (Math.abs(det) < 1e-12) return null
  const inv = 1 / det
  const tv = vsub(o, A)
  const u = vdot(tv, pv) * inv
  if (u < 0 || u > 1) return null
  const qv = vcross(tv, e1)
  const v = vdot(d, qv) * inv
  if (v < 0 || u + v > 1) return null
  const t = vdot(e2, qv) * inv
  return t > 0 ? t : null
}

/** ¿Algún triángulo (fuera de las caras `skip`) tapa `p` visto desde `o`? */
function occluded(topo: Topology, o: Vec3, p: Vec3, skip: number[]): boolean {
  const seg = vsub(p, o)
  const len = Math.hypot(seg[0], seg[1], seg[2])
  if (len < 1e-12) return false
  const d = vscale(seg, 1 / len)
  const limit = len - topo.diag * 1e-4
  for (let i = 0; i < topo.tris.length; i++) {
    if (skip.includes(topo.triFace[i])) continue
    const [A, B, C] = topo.tris[i].map((k) => topo.verts[k])
    const t = rayTriangle(o, d, A, B, C)
    if (t !== null && t < limit) return true
  }
  return false
}

/** Caras que atraviesa el rayo, de la más cercana a la más lejana (el primer impacto de cada una). */
export function rayFaces(topo: Topology, o: Vec3, d: Vec3): Array<{ face: number; t: number; point: Vec3; normal: Vec3 }> {
  const best = new Map<number, { face: number; t: number; point: Vec3; normal: Vec3 }>()
  for (let i = 0; i < topo.tris.length; i++) {
    const [A, B, C] = topo.tris[i].map((k) => topo.verts[k])
    const t = rayTriangle(o, d, A, B, C)
    if (t === null) continue
    const f = topo.triFace[i]
    const prev = best.get(f)
    if (!prev || t < prev.t) best.set(f, { face: f, t, point: vadd(o, vscale(d, t)), normal: topo.normals[i] })
  }
  return [...best.values()].sort((a, b) => a.t - b.t)
}

/** Normal de una cara si es plana (todos sus triángulos paralelos), si no null. */
export function planarFaceNormal(topo: Topology, face: number): Vec3 | null {
  let n: Vec3 | null = null
  for (let i = 0; i < topo.tris.length; i++) {
    if (topo.triFace[i] !== face) continue
    if (!n) n = topo.normals[i]
    else if (vdot(n, topo.normals[i]) < 1 - 1e-6) return null
  }
  return n
}

/**
 * Arista bajo el rayo de picking (como el pickbox del CAD clásico): entre las que pasan a menos de `tol`
 * del rayo gana la más cercana **al cursor**; ante un empate (diferencia < tol/4), la más cercana a la
 * cámara. Con `hidden = false` se descartan las tapadas por el propio sólido (estilos sombreados).
 */
export function rayEdge(
  topo: Topology,
  o: Vec3,
  d: Vec3,
  tol: number,
  hidden = false,
): { edge: number; point: Vec3; dist: number; t: number } | null {
  const cands: { edge: number; point: Vec3; dist: number; t: number }[] = []
  for (let i = 0; i < topo.edges.length; i++) {
    const e = topo.edges[i]
    let best: { edge: number; point: Vec3; dist: number; t: number } | null = null
    for (const [a, b] of edgeSegments(e)) {
      const r = raySegment(o, d, e.pts[a], e.pts[b])
      if (r.dist <= tol && (!best || r.dist < best.dist - 1e-9 || (r.dist <= best.dist + 1e-9 && r.t < best.t))) best = { edge: i, ...r }
    }
    if (best) cands.push(best)
  }
  const shown = hidden ? cands : cands.filter((c) => !occluded(topo, o, c.point, topo.edges[c.edge].faces))
  return pickClosest(shown, tol)
}

/** Más cercana al cursor; entre las que empatan (< tol/4) la más cercana a la cámara. */
export function pickClosest<T extends { dist: number; t: number }>(cands: T[], tol: number): T | null {
  if (!cands.length) return null
  const min = Math.min(...cands.map((c) => c.dist))
  return cands.filter((c) => c.dist <= min + tol / 4).reduce((a, b) => (b.t < a.t ? b : a))
}

/** Punto medio (por longitud) de una arista: referencia estable para guardarla. */
export function edgeMidpoint(e: TopoEdge): Vec3 {
  const segs = edgeSegments(e)
  const lens = segs.map(([i, j]) => vdist(e.pts[i], e.pts[j]))
  let half = lens.reduce((s, l) => s + l, 0) / 2
  for (let k = 0; k < segs.length; k++) {
    if (half <= lens[k] || k === segs.length - 1) {
      const [i, j] = segs[k]
      const f = lens[k] > 0 ? Math.min(1, half / lens[k]) : 0
      return vadd(e.pts[i], vscale(vsub(e.pts[j], e.pts[i]), f))
    }
    half -= lens[k]
  }
  return e.pts[0]
}

/**
 * Tangente de salida de una arista abierta en su extremo (`end` = 0 inicio, 1 fin), hacia afuera. En una curva
 * facetada es la del círculo por los tres últimos puntos: la del último tramo queda girada medio paso y el
 * empalme que termina ahí mordía la cara vecina.
 */
export function endTangent(e: TopoEdge, end: 0 | 1): Vec3 {
  const n = e.pts.length
  const [a, b] = end === 0 ? [e.pts[0], e.pts[1]] : [e.pts[n - 1], e.pts[n - 2]]
  const chord = vnorm(vsub(a, b))
  const circ = endCircle(e, end)
  if (!circ) return chord
  // Velocidad del giro alrededor del eje en el extremo.
  const t = vnorm(vcross(circ.axis, vsub(a, circ.center)))
  // Sólo corrige el facetado: un quiebre mayor no es un arco y se deja la cuerda.
  return vdot(t, chord) > Math.SQRT1_2 ? t : chord
}

/** Círculo que sigue una arista facetada más allá de su extremo `end`. */
export interface EndCircle {
  center: Vec3
  /** Eje unitario: girar alrededor de él con ángulo positivo sale de la arista por ese extremo. */
  axis: Vec3
  /** Ángulo del último tramo visto desde el centro (el paso del facetado). */
  step: number
}

/** Círculo por tres puntos; `null` si están alineados. */
function circumcircle(a: Vec3, b: Vec3, c: Vec3): { center: Vec3; axis: Vec3 } | null {
  const [u, w] = [vsub(b, a), vsub(c, a)]
  const nrm = vcross(u, w)
  const nn = vdot(nrm, nrm)
  if (nn < 1e-12 * vdot(u, u) * vdot(w, w)) return null
  const rel = vscale(vadd(vscale(vcross(w, nrm), vdot(u, u)), vscale(vcross(nrm, u), vdot(w, w))), 1 / (2 * nn))
  return { center: vadd(a, rel), axis: vnorm(nrm) }
}

/**
 * Círculo de mínimos cuadrados por todos los puntos de una curva plana; `null` si no es plana o algún punto se
 * aparta más del 1 % del radio (no es un arco de círculo).
 */
function fitCircle(pts: Vec3[]): { center: Vec3; axis: Vec3 } | null {
  const n = pts.length
  const cen = vscale(pts.reduce(vadd, [0, 0, 0] as Vec3), 1 / n)
  const rel = pts.map((p) => vsub(p, cen))
  let normal: Vec3 = [0, 0, 0]
  for (let i = 0; i + 1 < n; i++) normal = vadd(normal, vcross(rel[i], rel[i + 1]))
  if (vlen(normal) < 1e-12) return null
  const axis = vnorm(normal)
  const u = vnorm(vsub(rel[0], vscale(axis, vdot(rel[0], axis))))
  const v = vcross(axis, u)
  // Ajuste algebraico en el plano (los puntos están centrados, así que las sumas simples se anulan).
  let [suu, svv, suv, suuu, svvv, suuv, suvv] = [0, 0, 0, 0, 0, 0, 0]
  for (const p of rel) {
    const [x, y] = [vdot(p, u), vdot(p, v)]
    suu += x * x
    svv += y * y
    suv += x * y
    suuu += x * x * x
    svvv += y * y * y
    suuv += x * x * y
    suvv += x * y * y
  }
  const det = suu * svv - suv * suv
  if (det < 1e-12 * (suu + svv) * (suu + svv)) return null
  const [bx, by] = [suuu + suvv, suuv + svvv]
  const cx = (bx * svv - by * suv) / (2 * det)
  const cy = (by * suu - bx * suv) / (2 * det)
  const center = vadd(cen, vadd(vscale(u, cx), vscale(v, cy)))
  const r = Math.sqrt(cx * cx + cy * cy + (suu + svv) / n)
  const tol = r * 1e-2
  const fits = pts.every((p) => Math.abs(vdist(p, center) - r) <= tol && Math.abs(vdot(vsub(p, cen), axis)) <= tol)
  return fits ? { center, axis } : null
}

/**
 * Círculo que sigue una curva facetada más allá de su extremo; `null` en una recta o con puntos alineados. Si la
 * curva entera es circular, su círculo (los puntos de un corte plano de la malla traen el ruido del facetado y
 * tres vecinos dan un círculo muy distinto); si no, el de los tres últimos puntos.
 */
export function endCircle(e: TopoEdge, end: 0 | 1): EndCircle | null {
  const n = e.pts.length
  if (e.kind === 'line' || n < 3) return null
  const [a, b, c] = end === 0 ? [e.pts[0], e.pts[1], e.pts[2]] : [e.pts[n - 1], e.pts[n - 2], e.pts[n - 3]]
  const circ = fitCircle(e.pts) ?? circumcircle(a, b, c)
  if (!circ) return null
  // De `b` a `a` se gira en sentido positivo alrededor del eje: seguir girando sale de la arista.
  const [rb, ra] = [vnorm(vsub(b, circ.center)), vnorm(vsub(a, circ.center))]
  const axis = vdot(vcross(circ.axis, ra), vsub(a, b)) < 0 ? vscale(circ.axis, -1) : circ.axis
  const step = Math.acos(Math.max(-1, Math.min(1, vdot(rb, ra))))
  return step > 1e-9 ? { center: circ.center, axis, step } : null
}

/** Aristas tangentes encadenadas a `start` (opción Chain): comparten extremo y siguen sin quiebre vivo. */
export function edgeChain(topo: Topology, start: number): number[] {
  const out = new Set<number>([start])
  const stack = [start]
  while (stack.length) {
    const i = stack.pop() as number
    const e = topo.edges[i]
    if (e.closed) continue
    for (const end of [0, 1] as const) {
      const v = e.vids[end === 0 ? 0 : e.vids.length - 1]
      const out1 = endTangent(e, end)
      topo.edges.forEach((f, j) => {
        if (out.has(j) || f.closed) return
        const fEnd = f.vids[0] === v ? 0 : f.vids[f.vids.length - 1] === v ? 1 : -1
        if (fEnd < 0) return
        // Tangentes: la salida de una es opuesta a la salida de la otra.
        if (vdot(out1, endTangent(f, fEnd as 0 | 1)) < -SMOOTH_COS) {
          out.add(j)
          stack.push(j)
        }
      })
    }
  }
  return [...out]
}

/** Lazo de aristas de la cara `face` conectado a la arista `start` (opción Loop). */
export function edgeLoop(topo: Topology, start: number, face: number): number[] {
  const ofFace = topo.edges.map((e, i) => (e.faces.includes(face) ? i : -1)).filter((i) => i >= 0)
  const out = new Set<number>([start])
  const stack = [start]
  while (stack.length) {
    const e = topo.edges[stack.pop() as number]
    const ends = new Set(e.closed ? [] : [e.vids[0], e.vids[e.vids.length - 1]])
    for (const j of ofFace) {
      const f = topo.edges[j]
      if (out.has(j) || f.closed) continue
      if (ends.has(f.vids[0]) || ends.has(f.vids[f.vids.length - 1])) {
        out.add(j)
        stack.push(j)
      }
    }
  }
  return [...out]
}

/** Normales de las caras (distintas de `skip`) incidentes al vértice `v`. */
export function vertexFaceNormals(topo: Topology, v: number, skip: number[]): Vec3[] {
  const seen = new Set<number>()
  const out: Vec3[] = []
  for (const t of topo.vertTris[v] ?? []) {
    const f = topo.triFace[t]
    if (skip.includes(f) || seen.has(f)) continue
    seen.add(f)
    out.push(topo.normals[t])
  }
  return out
}

/** Distancia de `p` a la cara `face` (mínima a sus triángulos, aproximada por plano + vértices). */
export function distanceToFace(topo: Topology, face: number, p: Vec3): number {
  let best = Infinity
  topo.tris.forEach((t, i) => {
    if (topo.triFace[i] !== face) return
    const [a, b, c] = t.map((v) => topo.verts[v])
    best = Math.min(best, pointTriangleDistance(p, a, b, c))
  })
  return best
}

/** Distancia punto-triángulo exacta. */
function pointTriangleDistance(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const n = vnorm(vcross(vsub(b, a), vsub(c, a)))
  const d = vdot(vsub(p, a), n)
  const q = vsub(p, vscale(n, d))
  const inside = [
    [a, b],
    [b, c],
    [c, a],
  ].every(([u, w]) => vdot(vcross(vsub(w, u), vsub(q, u)), n) >= 0)
  if (inside) return Math.abs(d)
  return Math.min(
    vdist(p, closestOnSegment(p, a, b).point),
    vdist(p, closestOnSegment(p, b, c).point),
    vdist(p, closestOnSegment(p, c, a).point),
  )
}

// ---------------------------------------------------------------------------------------------
// Mallador inyectado (render/csg) + caché
// ---------------------------------------------------------------------------------------------

type Mesher = (
  p: SolidProps,
) => ArrayLike<number> | { positions: ArrayLike<number>; surf?: ArrayLike<number> | null; shapes?: ReadonlyMap<number, SurfShape>; exact?: boolean }
let mesher: Mesher | null = null
/** Por contenido; holgado para modelos con cientos de sólidos (ver `LruCache`). */
const cache = new LruCache<string, Topology>(4000)

/** Registra el mallador de sólidos (lo hace `render/csg` al cargarse; el core no importa three). */
export function registerSolidMesher(fn: Mesher): void {
  mesher = fn
  cache.clear()
}

let pendingCheck: ((p: SolidProps) => boolean) | null = null
/** Registra cómo saber si un sólido todavía espera al núcleo exacto (lo hace `render/csg`, que lo muestra en boceto). */
export function registerSolidPending(fn: (p: SolidProps) => boolean): void {
  pendingCheck = fn
}
/**
 * ¿El sólido todavía espera al núcleo exacto? Mientras tanto no da snaps ni rastreo: calcular su malla para eso
 * trabaría la pantalla y se tiraría al llegar el resultado exacto, enseguida.
 */
export function solidPending(p: SolidProps): boolean {
  return pendingCheck?.(p) ?? false
}

/** Olvida la topología de un sólido (por su clave `JSON.stringify(props)`): su malla cambió (llegó la del núcleo exacto). */
export function forgetSolidTopology(key: string): void {
  cache.delete(key)
}

/** Olvida todas las topologías (cambió el núcleo de sólidos). */
export function forgetAllSolidTopologies(): void {
  cache.clear()
}

/** Topología del sólido (cacheada por contenido); `null` si no hay mallador registrado. */
export function solidTopology(p: SolidProps): Topology | null {
  if (!mesher) return null
  const key = JSON.stringify(p)
  const hit = cache.get(key)
  if (hit) return hit
  const m = mesher(p)
  const topo = 'positions' in m ? buildTopology(m.positions, m.surf, m.shapes, !!m.exact) : buildTopology(m)
  cache.set(key, topo)
  return topo
}
