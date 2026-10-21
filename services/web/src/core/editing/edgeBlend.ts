import type { Vec3 } from '../math'
import type { EdgeBlendProps } from '../document/types'
import { vadd, vcross, vdot, vnorm, vscale, vsub } from '../geom/vec3'
import {
  distanceToFace,
  edgeSegments,
  endTangent,
  nearestEdge,
  vertexFaceNormals,
  type Topology,
  type TopoEdge,
} from './topology'

/**
 * Empalme/chaflán de aristas de sólidos (Vía A): para cada arista se barre a lo largo de
 * ella un perfil 2D que, en una arista **convexa**, es el material a **restar** y, en una
 * **cóncava**, el material a **sumar**. La CSG la aplica `render/csg`.
 */

export type BlendSpec = { kind: 'fillet'; r: number } | { kind: 'chamfer'; d1: number; d2: number }

/** Herramienta CSG: sopa de triángulos (9 números por triángulo) y si se suma o se resta. */
export interface BlendTool {
  soup: number[]
  add: boolean
}

const ARC_STEP = (7.5 * Math.PI) / 180
const clamp1 = (v: number): number => Math.max(-1, Math.min(1, v))

/** Cantidad de tramos del arco de empalme entre caras con normales de producto escalar `c`. */
export const arcSteps = (c: number): number => Math.max(2, Math.ceil(Math.acos(clamp1(c)) / ARC_STEP))

/** Interpolación esférica entre dos unitarios. */
function slerp(u: Vec3, v: Vec3, f: number): Vec3 {
  const ang = Math.acos(clamp1(vdot(u, v)))
  if (ang < 1e-9) return u
  const s = Math.sin(ang)
  return vadd(vscale(u, Math.sin((1 - f) * ang) / s), vscale(v, Math.sin(f * ang) / s))
}

/**
 * Perfil de la sección (puntos relativos al punto de la arista) para las normales de cara `n1`,
 * `n2` (unitarias, ⊥ a la arista). El último punto es la esquina exterior (convexa) o interior
 * (cóncava), desde la que el polígono se triangula en abanico. `null` si la arista es de filo o
 * las caras son coplanares.
 */
export function blendProfile(n1: Vec3, n2: Vec3, convex: boolean, spec: BlendSpec, steps?: number): Vec3[] | null {
  const c = vdot(n1, n2)
  if (1 + c < 1e-6 || 1 - c < 1e-6) return null
  const s = convex ? 1 : -1
  const m = 0.5 * (spec.kind === 'fillet' ? spec.r : Math.max(spec.d1, spec.d2))
  const bis = vscale(vadd(n1, n2), 1 / (1 + c))
  let inner: Vec3[]
  if (spec.kind === 'fillet') {
    const center = vscale(bis, -s * spec.r)
    const [u, v] = [vscale(n1, s), vscale(n2, s)]
    const k = steps ?? arcSteps(c)
    inner = Array.from({ length: k + 1 }, (_, i) => vadd(center, vscale(slerp(u, v, i / k), spec.r)))
  } else {
    const u1 = vnorm(vscale(vsub(n2, vscale(n1, c)), -s))
    const u2 = vnorm(vscale(vsub(n1, vscale(n2, c)), -s))
    inner = [vscale(u1, spec.d1), vscale(u2, spec.d2)]
  }
  const t1 = inner[0]
  const t2 = inner[inner.length - 1]
  return [vadd(t1, vscale(n1, s * m)), ...inner, vadd(t2, vscale(n2, s * m)), vscale(bis, s * m)]
}

/** Normal unitaria ⊥ a `t` (promedio de las de los tramos vecinos al punto `i`). */
function vertexNormal(ns: Vec3[], segs: number[], t: Vec3): Vec3 {
  const n = segs.reduce((acc, k) => vadd(acc, ns[k]), [0, 0, 0] as Vec3)
  return vnorm(vsub(n, vscale(t, vdot(n, t))))
}

/** Tramos vecinos a cada punto de la arista (1 en los extremos de una abierta, 2 en el resto). */
function adjacentSegments(e: TopoEdge): number[][] {
  const n = e.pts.length
  const nSeg = edgeSegments(e).length
  return e.pts.map((_, i) => {
    if (e.closed) return [(i + nSeg - 1) % nSeg, i]
    if (i === 0) return [0]
    if (i === n - 1) return [nSeg - 1]
    return [i - 1, i]
  })
}

/** Malla cerrada que barre el perfil a lo largo de la arista; extiende los extremos `ext0`/`ext1`. */
export function sweepEdge(e: TopoEdge, spec: BlendSpec, ext0 = 0, ext1 = 0): number[] | null {
  const segs = edgeSegments(e)
  const dirs = segs.map(([i, j]) => vnorm(vsub(e.pts[j], e.pts[i])))
  const adj = adjacentSegments(e)
  const tangents = adj.map((ks) => vnorm(ks.reduce((acc, k) => vadd(acc, dirs[k]), [0, 0, 0] as Vec3)))
  const frames = adj.map((ks, i) => [vertexNormal(e.n1, ks, tangents[i]), vertexNormal(e.n2, ks, tangents[i])])
  const steps = spec.kind === 'fillet' ? Math.max(...frames.map(([a, b]) => arcSteps(vdot(a, b)))) : undefined
  const rings: Vec3[][] = []
  for (let i = 0; i < e.pts.length; i++) {
    const prof = blendProfile(frames[i][0], frames[i][1], e.convex, spec, steps)
    if (!prof) return null
    let origin = e.pts[i]
    if (!e.closed && i === 0) origin = vsub(origin, vscale(tangents[i], ext0))
    if (!e.closed && i === e.pts.length - 1) origin = vadd(origin, vscale(tangents[i], ext1))
    rings.push(prof.map((p) => vadd(origin, p)))
  }
  const tris: Vec3[][] = []
  const k = rings[0].length
  const nr = rings.length
  for (let i = 0; i < (e.closed ? nr : nr - 1); i++) {
    const [r0, r1] = [rings[i], rings[(i + 1) % nr]]
    for (let j = 0; j < k; j++) {
      const jn = (j + 1) % k
      tris.push([r0[j], r1[j], r1[jn]], [r0[j], r1[jn], r0[jn]])
    }
  }
  if (!e.closed) {
    const [first, last] = [rings[0], rings[nr - 1]]
    for (let j = 0; j < k - 2; j++) {
      tris.push([first[k - 1], first[j], first[j + 1]], [last[k - 1], last[j + 1], last[j]])
    }
  }
  return orientedSoup(tris)
}

/** ¿El extremo de la arista es libre (las demás caras del vértice miran hacia afuera de la arista)? */
function endFreedom(topo: Topology, e: TopoEdge, end: 0 | 1): number {
  const v = e.vids[end === 0 ? 0 : e.vids.length - 1]
  const out = endTangent(e, end)
  const others = vertexFaceNormals(topo, v, e.faces)
  if (others.length === 0) return 0
  return Math.min(...others.map((n) => vdot(n, out)))
}

/** Extensión del barrido en un extremo: atraviesa una cara libre; si no, apenas ±ε. */
function endExtension(topo: Topology, e: TopoEdge, end: 0 | 1, size: number): number {
  const eps = Math.max(topo.diag * 1e-4, 1e-6)
  const k = endFreedom(topo, e, end)
  const free = k > 0.1
  if (!e.convex) return free ? -eps : eps
  if (!free) return eps
  return 1.5 * size * (1 + Math.sqrt(1 - k * k) / k)
}

/** Resultado de resolver las referencias de aristas sobre la topología del sólido hijo. */
export interface ResolvedBlend {
  tools: BlendTool[]
  /** Referencias sin arista (la geometría cambió) o con arista de filo. */
  skipped: number
}

/** Construye las herramientas CSG de un nodo FILLETEDGE/CHAMFEREDGE. */
export function blendTools(topo: Topology, node: EdgeBlendProps): ResolvedBlend {
  const tol = Math.max(topo.diag * 1e-3, 1e-6)
  const seen = new Set<number>()
  const tools: BlendTool[] = []
  let skipped = 0
  for (const ref of node.edges) {
    const hit = nearestEdge(topo, ref.at, tol)
    if (!hit) {
      skipped++
      continue
    }
    if (seen.has(hit.edge)) continue
    seen.add(hit.edge)
    const e = topo.edges[hit.edge]
    const spec = edgeSpec(topo, e, node, ref.base)
    const size = spec.kind === 'fillet' ? spec.r : Math.max(spec.d1, spec.d2)
    const ext = e.closed ? [0, 0] : [endExtension(topo, e, 0, size), endExtension(topo, e, 1, size)]
    const soup = sweepEdge(e, spec, ext[0], ext[1])
    if (soup) tools.push({ soup, add: !e.convex })
    else skipped++
  }
  if (node.op === 'FILLETEDGE') tools.push(...vertexPatches(topo, [...seen], node.radius))
  return { tools, skipped }
}

/** Aplana triángulos a una sopa orientada hacia afuera (volumen con signo positivo). */
function orientedSoup(tris: Vec3[][]): number[] {
  const vol = tris.reduce((acc, [a, b, c]) => acc + vdot(a, vcross(b, c)), 0)
  return tris.flatMap(([a, b, c]) => (vol < 0 ? [...a, ...c, ...b] : [...a, ...b, ...c]))
}

/** Resuelve M·x = b (filas de M = normales); `null` si es singular. */
function solve3(m: Vec3[], b: Vec3): Vec3 | null {
  const det = vdot(m[0], vcross(m[1], m[2]))
  if (Math.abs(det) < 1e-9) return null
  const cols: Vec3[] = [vcross(m[1], m[2]), vcross(m[2], m[0]), vcross(m[0], m[1])]
  return vscale(vadd(vadd(vscale(cols[0], b[0]), vscale(cols[1], b[1])), vscale(cols[2], b[2])), 1 / det)
}

/**
 * Triángulo esférico (centro `c`, radio `r`) entre las direcciones unitarias `a`, `b`, `d`, con sus
 * bordes en pasos angulares iguales (coinciden con los arcos de los cortadores de arista), cerrado
 * en abanico hacia el punto exterior `e`.
 */
function sphericalCorner(c: Vec3, r: number, a: Vec3, b: Vec3, d: Vec3, e: Vec3, k: number): number[] {
  const p = (j: number, i: number): Vec3 => {
    const row = k - j
    const dir = row === 0 ? d : slerp(slerp(a, d, j / k), slerp(b, d, j / k), i / row)
    return vadd(c, vscale(dir, r))
  }
  const tris: Vec3[][] = []
  for (let j = 0; j < k; j++) {
    for (let i = 0; i < k - j; i++) {
      tris.push([p(j, i), p(j, i + 1), p(j + 1, i)])
      if (i < k - j - 1) tris.push([p(j, i + 1), p(j + 1, i + 1), p(j + 1, i)])
    }
    tris.push([e, p(j, 0), p(j + 1, 0)], [e, p(j + 1, k - j - 1), p(j, k - j)])
  }
  for (let i = 0; i < k; i++) tris.push([e, p(0, i + 1), p(0, i)])
  return orientedSoup(tris)
}

/**
 * Parche de vértice: donde se juntan 3 aristas convexas empalmadas, la esquina se redondea con un
 * triángulo esférico tangente a las 3 caras (herramienta = cono desde la esquina exterior).
 */
function vertexPatches(topo: Topology, edges: number[], r: number): BlendTool[] {
  const byVertex = new Map<number, { normals: Map<number, Vec3>; count: number }>()
  for (const i of edges) {
    const e = topo.edges[i]
    if (e.closed || !e.convex) continue
    const last = e.n1.length - 1
    for (const [vid, k] of [
      [e.vids[0], 0],
      [e.vids[e.vids.length - 1], last],
    ]) {
      const entry = byVertex.get(vid) ?? { normals: new Map<number, Vec3>(), count: 0 }
      entry.count++
      entry.normals.set(e.faces[0], e.n1[k]).set(e.faces[1], e.n2[k])
      byVertex.set(vid, entry)
    }
  }
  const tools: BlendTool[] = []
  for (const [vid, { normals, count }] of byVertex) {
    if (count !== 3 || normals.size !== 3) continue
    const ns = [...normals.values()]
    const v = topo.verts[vid]
    const center = solve3(ns, [-r, -r, -r])
    const outer = solve3(ns, [r / 2, r / 2, r / 2])
    if (!center || !outer) continue
    const k = Math.max(arcSteps(vdot(ns[0], ns[1])), arcSteps(vdot(ns[0], ns[2])), arcSteps(vdot(ns[1], ns[2])))
    tools.push({ soup: sphericalCorner(vadd(v, center), r, ns[0], ns[1], ns[2], vadd(v, outer), k), add: false })
  }
  return tools
}

/** Parámetros del perfil; en el chaflán, `d1` va sobre la cara de referencia (la más cercana a `base`). */
function edgeSpec(topo: Topology, e: TopoEdge, node: EdgeBlendProps, base?: Vec3): BlendSpec {
  if (node.op === 'FILLETEDGE') return { kind: 'fillet', r: node.radius }
  const swap = !!base && distanceToFace(topo, e.faces[1], base) < distanceToFace(topo, e.faces[0], base)
  return swap ? { kind: 'chamfer', d1: node.d2, d2: node.d1 } : { kind: 'chamfer', d1: node.d1, d2: node.d2 }
}
