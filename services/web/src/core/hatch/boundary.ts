import type { Vec3 } from '../math'
import type { Entity, HatchIsland, HatchLoop } from '../document/types'
import { curveOf, primPoint, type Curve, type Prim } from '../geom/curve'
import { textCorners } from '../geom/text'
import { attdefText } from '../geom/text'
import { pointInRing, ringArea, type P2, type Ring } from './geometry'

/**
 * Contorno de un sombreado, como el *Pick internal point* del CAD clásico: con las curvas del plano
 * XY (z = `z`) se arma el grafo plano (arrangement), se podan las ramas sueltas y se recorren sus caras.
 * El contorno es la cara más chica que contiene el punto; las islas, las componentes que quedan adentro
 * (con su contorno exterior). Los tramos que vienen de un mismo círculo se vuelven a unir en bulges.
 *
 * Trabaja en el XY local: los comandos corren en el marco de la UCS.
 */

interface Src {
  id: string
  /** `A`: pieza de un arco de círculo (se puede volver a unir); `S`: recta; `X`: tesselado sin unir. */
  kind: 'A' | 'S' | 'X'
  c?: P2
  r?: number
}

interface Seg {
  a: P2
  b: P2
  src: number
}

export interface BoundaryResult {
  loops: HatchLoop[]
  /** Objetos que forman los lazos (para la asociatividad). */
  ids: string[]
}

const cross = (a: P2, b: P2): number => a[0] * b[1] - a[1] * b[0]
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]]
const len = (a: P2): number => Math.hypot(a[0], a[1])

/** Piezas de arco por vuelta al tesselar (suficiente para el contorno; los arcos se reconstruyen). */
const ARC_STEPS = 128

/** Segmentos de las curvas del plano z, con su origen (entidad y círculo). */
function collect(entities: Entity[], z: number, tol: number): { segs: Seg[]; srcs: Src[] } {
  const segs: Seg[] = []
  const srcs: Src[] = []
  const onPlane = (p: Vec3): boolean => Math.abs(p[2] - z) <= tol
  for (const e of entities) {
    if (e.type === 'TEXT' || e.type === 'ATTDEF') {
      // El texto es una isla: su caja (como el CAD clásico).
      const t = e.type === 'TEXT' ? e.props : attdefText(e.props)
      if (Math.abs((t.normal ?? [0, 0, 1])[2]) < 1 - 1e-9) continue
      const c = textCorners(t)
      if (!c.every(onPlane)) continue
      srcs.push({ id: e.id, kind: 'X' })
      for (let i = 0; i < 4; i++) segs.push({ a: [c[i][0], c[i][1]], b: [c[(i + 1) % 4][0], c[(i + 1) % 4][1]], src: srcs.length - 1 })
      continue
    }
    const c = curveOf(e)
    if (!c) continue
    if (!onPlane(c.start) || !onPlane(c.end) || !onPlane(c.pointAt(c.n / 2))) continue
    addCurve(c, e.id, segs, srcs)
  }
  return { segs, srcs }
}

function addCurve(c: Curve, id: string, segs: Seg[], srcs: Src[]): void {
  const lineSrc = srcs.push({ id, kind: 'S' }) - 1
  const xSrc = srcs.push({ id, kind: 'X' }) - 1
  for (const p of c.prims) {
    if (p.k === 'L') {
      segs.push({ a: [p.a[0], p.a[1]], b: [p.b[0], p.b[1]], src: c.kind === 'SPLINE' ? xSrc : lineSrc })
      continue
    }
    const n = Math.max(4, Math.ceil((Math.abs(p.sw) / (2 * Math.PI)) * ARC_STEPS))
    const src = p.k === 'A' ? srcs.push({ id, kind: 'A', c: [p.c[0], p.c[1]], r: p.r }) - 1 : xSrc
    let prev = primPoint(p, 0)
    for (let j = 1; j <= n; j++) {
      const q = primPoint(p, j / n)
      segs.push({ a: [prev[0], prev[1]], b: [q[0], q[1]], src })
      prev = q
    }
  }
}

/** Nodos fusionados por cercanía (grilla de tamaño `tol`). */
class Nodes {
  readonly pts: P2[] = []
  private readonly grid = new Map<string, number[]>()
  constructor(private readonly tol: number) {}
  id(p: P2): number {
    const gx = Math.floor(p[0] / this.tol)
    const gy = Math.floor(p[1] / this.tol)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const i of this.grid.get(`${gx + dx},${gy + dy}`) ?? []) {
          if (Math.abs(this.pts[i][0] - p[0]) <= this.tol && Math.abs(this.pts[i][1] - p[1]) <= this.tol) return i
        }
      }
    }
    const i = this.pts.push([p[0], p[1]]) - 1
    const k = `${gx},${gy}`
    const cell = this.grid.get(k)
    if (cell) cell.push(i)
    else this.grid.set(k, [i])
    return i
  }
}

interface Graph {
  pts: P2[]
  /** Aristas sin repetir: [u, v, src]. */
  edges: Array<[number, number, number]>
}

/** Grafo plano: corta cada segmento en sus intersecciones (también solapes colineales) y fusiona nodos. */
function arrangement(segs: Seg[], tol: number): Graph {
  const splits = segs.map(() => [0, 1])
  const order = segs.map((_, i) => i).sort((i, j) => Math.min(segs[i].a[0], segs[i].b[0]) - Math.min(segs[j].a[0], segs[j].b[0]))
  const minX = (s: Seg) => Math.min(s.a[0], s.b[0])
  const maxX = (s: Seg) => Math.max(s.a[0], s.b[0])
  for (let oi = 0; oi < order.length; oi++) {
    const i = order[oi]
    const si = segs[i]
    const xi = maxX(si) + tol
    const yi0 = Math.min(si.a[1], si.b[1]) - tol
    const yi1 = Math.max(si.a[1], si.b[1]) + tol
    for (let oj = oi + 1; oj < order.length; oj++) {
      const j = order[oj]
      const sj = segs[j]
      if (minX(sj) > xi) break
      if (Math.max(sj.a[1], sj.b[1]) < yi0 || Math.min(sj.a[1], sj.b[1]) > yi1) continue
      intersect(si, sj, tol, splits[i], splits[j])
    }
  }
  const nodes = new Nodes(tol)
  const seen = new Set<string>()
  const edges: Graph['edges'] = []
  segs.forEach((s, i) => {
    const ts = [...new Set(splits[i].map((t) => Math.min(1, Math.max(0, t))))].sort((x, y) => x - y)
    let prev = nodes.id(s.a)
    for (let k = 1; k < ts.length; k++) {
      const t = ts[k]
      const id = t >= 1 ? nodes.id(s.b) : nodes.id([s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t])
      if (id !== prev) {
        const key = prev < id ? `${prev},${id}` : `${id},${prev}`
        if (!seen.has(key)) {
          seen.add(key)
          edges.push([prev, id, s.src])
        }
      }
      prev = id
    }
  })
  return { pts: nodes.pts, edges }
}

function intersect(p: Seg, q: Seg, tol: number, tp: number[], tq: number[]): void {
  const r = sub(p.b, p.a)
  const s = sub(q.b, q.a)
  const lr = len(r)
  const ls = len(s)
  if (lr < 1e-15 || ls < 1e-15) return
  const den = cross(r, s)
  const qa = sub(q.a, p.a)
  if (Math.abs(den) <= 1e-12 * lr * ls) {
    // Paralelos: si son colineales, cada extremo que cae sobre el otro lo corta.
    if (Math.abs(cross(r, qa)) / lr > tol) return
    const on = (x: P2, a: P2, d: P2, L: number, out: number[]) => {
      const t = ((x[0] - a[0]) * d[0] + (x[1] - a[1]) * d[1]) / (L * L)
      if (t > -tol / L && t < 1 + tol / L) out.push(t)
    }
    on(q.a, p.a, r, lr, tp)
    on(q.b, p.a, r, lr, tp)
    on(p.a, q.a, s, ls, tq)
    on(p.b, q.a, s, ls, tq)
    return
  }
  const t = cross(qa, s) / den
  const u = cross(qa, r) / den
  const et = tol / lr
  const eu = tol / ls
  if (t < -et || t > 1 + et || u < -eu || u > 1 + eu) return
  tp.push(t)
  tq.push(u)
}

/** Quita iterativamente los nodos de grado 1 (ramas que no cierran nada). */
function prune(g: Graph): Graph {
  let edges = g.edges
  for (;;) {
    const deg = new Map<number, number>()
    for (const [u, v] of edges) {
      deg.set(u, (deg.get(u) ?? 0) + 1)
      deg.set(v, (deg.get(v) ?? 0) + 1)
    }
    const next = edges.filter(([u, v]) => (deg.get(u) ?? 0) > 1 && (deg.get(v) ?? 0) > 1)
    if (next.length === edges.length) return { pts: g.pts, edges }
    edges = next
  }
}

interface Cycle {
  /** Medias aristas: nodo de salida y origen del tramo. */
  nodes: number[]
  srcs: number[]
  ring: Ring
  area: number
  comp: number
}

/** Ciclos de caras (cada media arista pertenece a uno): positivos = caras acotadas; negativos = contornos exteriores. */
function faceCycles(g: Graph): Cycle[] {
  const n = g.edges.length
  // Media arista h: 2e = u→v, 2e+1 = v→u.
  const from = (h: number) => (h % 2 === 0 ? g.edges[h >> 1][0] : g.edges[h >> 1][1])
  const to = (h: number) => (h % 2 === 0 ? g.edges[h >> 1][1] : g.edges[h >> 1][0])
  const out = new Map<number, number[]>()
  for (let h = 0; h < 2 * n; h++) {
    const u = from(h)
    const list = out.get(u)
    if (list) list.push(h)
    else out.set(u, [h])
  }
  const ang = (h: number) => {
    const a = g.pts[from(h)]
    const b = g.pts[to(h)]
    return Math.atan2(b[1] - a[1], b[0] - a[0])
  }
  const pos = new Map<number, number>()
  for (const list of out.values()) {
    list.sort((x, y) => ang(x) - ang(y))
    list.forEach((h, i) => pos.set(h, i))
  }
  // Componentes conexas (union-find por nodos).
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let r = x
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r) as number
    parent.set(x, r)
    return r
  }
  for (const [u, v] of g.edges) {
    if (!parent.has(u)) parent.set(u, u)
    if (!parent.has(v)) parent.set(v, v)
    parent.set(find(u), find(v))
  }
  const used = new Uint8Array(2 * n)
  const cycles: Cycle[] = []
  for (let h0 = 0; h0 < 2 * n; h0++) {
    if (used[h0]) continue
    const nodes: number[] = []
    const srcs: number[] = []
    let h = h0
    let guard = 0
    while (!used[h] && guard++ <= 2 * n) {
      used[h] = 1
      nodes.push(from(h))
      srcs.push(g.edges[h >> 1][2])
      // Siguiente: en el nodo de llegada, la anterior (sentido horario) a la gemela.
      const v = to(h)
      const list = out.get(v) as number[]
      const tw = h ^ 1
      h = list[((pos.get(tw) as number) - 1 + list.length) % list.length]
    }
    const ring = nodes.map((i) => g.pts[i])
    cycles.push({ nodes, srcs, ring, area: ringArea(ring), comp: find(nodes[0]) })
  }
  return cycles
}

/** Lazo con bulges a partir de un ciclo: las piezas consecutivas del mismo círculo vuelven a ser un arco. */
function loopOf(c: Cycle, g: Graph, srcs: Src[], z: number, tol: number): HatchLoop {
  const m = c.nodes.length
  const sameArc = (i: number, j: number): boolean => {
    const a = srcs[c.srcs[i % m]]
    const b = srcs[c.srcs[j % m]]
    return a.kind === 'A' && b.kind === 'A' && len(sub(a.c as P2, b.c as P2)) <= tol && Math.abs((a.r as number) - (b.r as number)) <= tol
  }
  // Arrancar en un borde de tramo (no en el medio de un arco).
  let start = 0
  for (let i = 0; i < m; i++) {
    if (!sameArc((i - 1 + m) % m, i)) {
      start = i
      break
    }
  }
  const verts: P2[] = []
  const bulges: number[] = []
  let i = 0
  while (i < m) {
    const k = (start + i) % m
    const s = srcs[c.srcs[k]]
    verts.push(g.pts[c.nodes[k]])
    if (s.kind !== 'A') {
      bulges.push(0)
      i++
      continue
    }
    // Barrido con signo de las piezas del mismo círculo, de a cuartos de vuelta como máximo (un lazo de
    // dos vértices no se cerraría: `polylineSpans` necesita tres para el tramo de cierre).
    const cc = s.c as P2
    let total = 0
    let j = i
    while (j < m) {
      const kk = (start + j) % m
      if (j > i && !sameArc((start + j - 1) % m, kk)) break
      const a = sub(g.pts[c.nodes[kk]], cc)
      const b = sub(g.pts[c.nodes[(kk + 1) % m]], cc)
      const piece = Math.atan2(cross(a, b), a[0] * b[0] + a[1] * b[1])
      if (j > i && Math.abs(total + piece) > Math.PI / 2 + 1e-6) break
      total += piece
      j++
    }
    bulges.push(cleanBulge(Math.tan(total / 4)))
    i = j
  }
  // Vértices intermedios de tramos rectos alineados (una recta partida por intersecciones).
  for (let k = verts.length - 1; k >= 0 && verts.length > 3; k--) {
    const kp = (k - 1 + verts.length) % verts.length
    if (Math.abs(bulges[kp]) > 1e-12 || Math.abs(bulges[k]) > 1e-12) continue
    const a = verts[kp]
    const b = verts[k]
    const d = verts[(k + 1) % verts.length]
    const ab = sub(b, a)
    const bd = sub(d, b)
    if (Math.abs(cross(ab, bd)) <= tol * Math.max(len(ab), len(bd)) && ab[0] * bd[0] + ab[1] * bd[1] > 0) {
      verts.splice(k, 1)
      bulges.splice(k, 1)
    }
  }
  const out: HatchLoop = { vertices: verts.map((q) => [q[0], q[1], z] as Vec3) }
  if (bulges.some((b) => Math.abs(b) > 1e-12)) out.bulges = bulges
  return out
}

/** Una media vuelta es exactamente ±1 (el redondeo de tan(π/4) desestabiliza el arco). */
const cleanBulge = (b: number): number => (Math.abs(Math.abs(b) - 1) < 1e-9 ? Math.sign(b) : b)

/** Tolerancia geométrica según el tamaño de lo que se analiza. */
function tolOf(segs: Seg[]): number {
  let ext = 0
  for (const s of segs) ext = Math.max(ext, Math.abs(s.a[0]), Math.abs(s.a[1]), Math.abs(s.b[0]), Math.abs(s.b[1]))
  return 1e-7 * Math.max(1, ext)
}

/** Grafo listo para consultar varios puntos (la detección del comando HATCH lo arma una vez). */
export interface BoundaryIndex {
  graph: Graph
  srcs: Src[]
  cycles: Cycle[]
  z: number
  tol: number
}

export function boundaryIndex(entities: Entity[], z = 0): BoundaryIndex {
  const { segs, srcs } = collect(entities, z, 1e-6 * Math.max(1, Math.abs(z)))
  const tol = tolOf(segs)
  const graph = prune(arrangement(segs, tol))
  return { graph, srcs, cycles: faceCycles(graph), z, tol }
}

/**
 * Contorno e islas del área que contiene `p` (null si no está en un área cerrada: El CAD clásico dice
 * "Valid hatch boundary not found").
 */
export function boundaryAt(index: BoundaryIndex, p: P2, island: HatchIsland): BoundaryResult | null {
  const { cycles, graph, srcs, z, tol } = index
  let outer: Cycle | null = null
  for (const c of cycles) if (c.area > 0 && (!outer || c.area < outer.area) && pointInRing(p, c.ring)) outer = c
  if (!outer) return null
  const chosen: Cycle[] = [outer]
  if (island !== 'ignore') {
    // Contornos exteriores de las otras componentes que quedan dentro del contorno.
    const inside = cycles.filter((c) => c.area < 0 && c.comp !== outer.comp && pointInRing(c.ring[0], outer.ring))
    for (const c of inside) {
      const depth = 1 + inside.filter((o) => o !== c && Math.abs(o.area) > Math.abs(c.area) && pointInRing(c.ring[0], o.ring)).length
      if (island === 'normal' || depth === 1) chosen.push(c)
    }
  }
  const ids = new Set<string>()
  for (const c of chosen) for (const s of c.srcs) ids.add(srcs[s].id)
  return { loops: chosen.map((c) => loopOf(c, graph, srcs, z, tol)), ids: [...ids] }
}

/** Lazo de una curva cerrada (Select objects): rectas y arcos exactos; elipses y splines tesseladas. */
export function loopOfCurve(c: Curve): HatchLoop | null {
  if (!c.closed) return null
  const verts: Vec3[] = []
  const bulges: number[] = []
  const push = (p: Prim): void => {
    if (p.k === 'L') {
      verts.push(p.a)
      bulges.push(0)
    } else if (p.k === 'A') {
      const parts = Math.max(1, Math.ceil(Math.abs(p.sw) / (Math.PI / 2) - 1e-9))
      for (let i = 0; i < parts; i++) {
        verts.push(primPoint(p, i / parts))
        bulges.push(cleanBulge(Math.tan(p.sw / parts / 4)))
      }
    } else {
      const n = Math.max(8, Math.ceil((Math.abs(p.sw) / (2 * Math.PI)) * 96))
      for (let i = 0; i < n; i++) {
        verts.push(primPoint(p, i / n))
        bulges.push(0)
      }
    }
  }
  c.prims.forEach(push)
  if (verts.length < 2) return null
  const out: HatchLoop = { vertices: verts }
  if (bulges.some((b) => Math.abs(b) > 1e-12)) out.bulges = bulges
  return out
}

/** Lazos de los objetos cerrados seleccionados, con el estilo de islas por anidamiento. */
export function boundaryFromObjects(entities: Entity[], island: HatchIsland): BoundaryResult | null {
  const items: Array<{ id: string; loop: HatchLoop; ring: Ring }> = []
  for (const e of entities) {
    const c = curveOf(e)
    const loop = c && loopOfCurve(c)
    if (!loop || !c) continue
    items.push({ id: e.id, loop, ring: c.samples(32).map((q) => [q[0], q[1]] as P2) })
  }
  if (!items.length) return null
  const area = items.map((it) => Math.abs(ringArea(it.ring)))
  const depth = items.map((it, i) => items.filter((o, j) => j !== i && area[j] > area[i] && pointInRing(it.ring[0], o.ring)).length)
  const keep = items.filter((_, i) => island === 'normal' || (island === 'outer' ? depth[i] <= 1 : depth[i] === 0))
  return { loops: keep.map((it) => it.loop), ids: keep.map((it) => it.id) }
}
