import type { Vec3 } from '../math'
import type { EdgeBlendProps } from '../document/types'
import { vadd, vcross, vdot, vlen, vnorm, vscale, vsub } from '../geom/vec3'
import {
  distanceToFace,
  edgeSegments,
  endCircle,
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
  /** Si está, la herramienta es la intersección de `soup` con estas otras sopas (la esquina entre dos empalmes). */
  clip?: number[][]
  /** Sopas que se le quitan a la herramienta: lo que queda detrás de la cara que frena un extremo. */
  cut?: number[][]
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
  // En los extremos de una curva, la tangente real (con la del último tramo el anillo queda torcido).
  if (!e.closed && e.pts.length > 2) {
    tangents[0] = vscale(endTangent(e, 0), -1)
    tangents[tangents.length - 1] = endTangent(e, 1)
  }
  const frames = adj.map((ks, i) => [vertexNormal(e.n1, ks, tangents[i]), vertexNormal(e.n2, ks, tangents[i])])
  const steps = spec.kind === 'fillet' ? Math.max(...frames.map(([a, b]) => arcSteps(vdot(a, b)))) : undefined
  const rings: Vec3[][] = []
  const last = e.pts.length - 1
  // Una curva se prolonga con anillos más allá del extremo que siguen su círculo: corriendo el del extremo en
  // recta, el barrido se apartaba del arco y la esquina entre dos empalmes quedaba con una cara plana.
  const grow = (ext: number): boolean => !e.closed && last > 1 && ext > 0
  for (let i = 0; i < e.pts.length; i++) {
    const prof = blendProfile(frames[i][0], frames[i][1], e.convex, spec, steps)
    if (!prof) return null
    const at = (o: Vec3): Vec3[] => prof.map((p) => vadd(o, p))
    const before = vsub(e.pts[i], vscale(tangents[i], ext0))
    const after = vadd(e.pts[i], vscale(tangents[i], ext1))
    if (i === 0 && grow(ext0)) rings.push(...(arcRings(e, 0, at(e.pts[i]), ext0) ?? [at(before)]).reverse())
    if (e.closed || (i > 0 && i < last)) rings.push(at(e.pts[i]))
    else if (i === 0) rings.push(at(grow(ext0) ? e.pts[i] : before))
    else rings.push(at(grow(ext1) ? e.pts[i] : after))
    if (i === last && grow(ext1)) rings.push(...(arcRings(e, 1, at(e.pts[i]), ext1) ?? [at(after)]))
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

/**
 * Anillos que prolongan el del extremo `end` una longitud `ext` siguiendo el círculo de la arista, del más
 * cercano al más lejano, con el paso del facetado y a lo sumo un cuarto de vuelta. `null` si no hay círculo.
 */
function arcRings(e: TopoEdge, end: 0 | 1, ring: Vec3[], ext: number): Vec3[][] | null {
  const circ = endCircle(e, end)
  if (!circ) return null
  const { center, axis, step } = circ
  const r = vlen(vsub(e.pts[end === 0 ? 0 : e.pts.length - 1], center))
  const total = Math.min(ext / r, Math.PI / 2)
  const count = Math.max(1, Math.ceil(total / step - 1e-6))
  const rot = (p: Vec3, ang: number): Vec3 => {
    const v = vsub(p, center)
    const [c, s] = [Math.cos(ang), Math.sin(ang)]
    return vadd(center, vadd(vadd(vscale(v, c), vscale(vcross(axis, v), s)), vscale(axis, vdot(axis, v) * (1 - c))))
  }
  return Array.from({ length: count }, (_, i) => ring.map((p) => rot(p, Math.min((i + 1) * step, total))))
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

/** Extremo convexo frenado por una cara que se le opone: plano de esa cara por el vértice y prolongación del barrido. */
interface EndStop {
  v: Vec3
  n: Vec3
  ext: number
  /** Tamaño de las cajas que separan lo de adelante y lo de atrás del plano. */
  d: number
  eps: number
}

/**
 * Extremo convexo frenado por una cara que se le opone (el arco de una esfera que termina contra la pared de la caja
 * restada): el barrido se prolonga y se le quita lo que queda detrás del plano de esa cara. Así no la muerde aunque la
 * arista no le llegue a 90°. `null` si el extremo es libre o la cara casi acompaña a la arista.
 */
function endStop(topo: Topology, e: TopoEdge, end: 0 | 1, size: number): EndStop | null {
  const vid = e.vids[end === 0 ? 0 : e.vids.length - 1]
  const out = endTangent(e, end)
  const others = vertexFaceNormals(topo, vid, e.faces)
  if (others.length === 0) return null
  const n = others.reduce((best, m) => (vdot(m, out) < vdot(best, out) ? m : best))
  const k = -vdot(n, out)
  if (k < 0.3) return null
  const ext = 1.5 * size * (1 + Math.sqrt(1 - k * k) / k)
  const eps = Math.max(topo.diag * 1e-4, 1e-6)
  return { v: e.pts[end === 0 ? 0 : e.pts.length - 1], n, ext, d: ext + 3 * size, eps }
}

/** Caja detrás del plano por `v` con normal `n`: de `off − d` a `off` sobre la normal y ±`d` de costado. */
function backBox(v: Vec3, n: Vec3, off: number, d: number): number[] {
  const u = vnorm(vcross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]))
  const w = vcross(n, u)
  const c = (i: number, j: number, l: number): Vec3 =>
    vadd(v, vadd(vscale(n, off - l * d), vadd(vscale(u, (2 * i - 1) * d), vscale(w, (2 * j - 1) * d))))
  const mid = vadd(v, vscale(n, off - d / 2))
  const quads: Vec3[][] = [
    [c(0, 0, 0), c(1, 0, 0), c(1, 1, 0), c(0, 1, 0)],
    [c(0, 0, 1), c(0, 1, 1), c(1, 1, 1), c(1, 0, 1)],
    [c(0, 0, 0), c(0, 1, 0), c(0, 1, 1), c(0, 0, 1)],
    [c(1, 0, 0), c(1, 0, 1), c(1, 1, 1), c(1, 1, 0)],
    [c(0, 0, 0), c(0, 0, 1), c(1, 0, 1), c(1, 0, 0)],
    [c(0, 1, 0), c(1, 1, 0), c(1, 1, 1), c(0, 1, 1)],
  ]
  return quads.flatMap(([a, b, cc, dd]) => {
    const outward = vdot(vcross(vsub(b, a), vsub(cc, a)), vsub(a, mid)) > 0
    return (outward ? [a, b, cc, a, cc, dd] : [a, cc, b, a, dd, cc]).flatMap((p) => [...p])
  })
}

/** Barrido de una arista convexa abierta, con sus extremos frenados (para armar las esquinas). */
interface Swept {
  e: TopoEdge
  soup: number[]
  stops: [EndStop | null, EndStop | null]
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
  const swept: Swept[] = []
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
    const stops: Swept['stops'] = e.closed || !e.convex ? [null, null] : [endStop(topo, e, 0, size), endStop(topo, e, 1, size)]
    const ext = e.closed ? [0, 0] : ([0, 1] as const).map((end) => stops[end]?.ext ?? endExtension(topo, e, end, size))
    const soup = sweepEdge(e, spec, ext[0], ext[1])
    if (!soup) {
      skipped++
      continue
    }
    const cut = stops.flatMap((s) => (s ? [backBox(s.v, s.n, -s.eps, s.d)] : []))
    tools.push(cut.length ? { soup, add: !e.convex, cut } : { soup, add: !e.convex })
    if (!e.closed && e.convex) swept.push({ e, soup, stops })
  }
  if (node.op === 'FILLETEDGE') tools.push(...vertexPatches(topo, [...seen], node.radius))
  tools.push(...cornerTools(swept))
  return { tools, skipped }
}

/**
 * Esquina entre dos aristas convexas tratadas que se juntan en un vértice con quiebre, cada una frenada por la cara
 * de la otra (p. ej. los bordes de una esfera a la que se le restó una caja). Como en el CAD clásico, las dos
 * superficies se prolongan hasta cortarse: detrás de los dos planos que frenan los empalmes se resta lo que comparten
 * los dos barridos prolongados. Sólo actúa donde ningún empalme dejó superficie (si no, la CSG se confunde).
 */
function cornerTools(swept: Swept[]): BlendTool[] {
  const ends = new Map<number, Array<{ s: Swept; end: 0 | 1 }>>()
  for (const s of swept) {
    for (const end of [0, 1] as const) {
      const vid = s.e.vids[end === 0 ? 0 : s.e.vids.length - 1]
      ends.set(vid, [...(ends.get(vid) ?? []), { s, end }])
    }
  }
  const tools: BlendTool[] = []
  for (const list of ends.values()) {
    if (list.length !== 2 || list[0].s === list[1].s) continue
    const [a, b] = list
    const [sa, sb] = [a.s.stops[a.end], b.s.stops[b.end]]
    // Un extremo libre ya se prolonga atravesando la cara: no queda hueco que llenar.
    if (!sa || !sb) continue
    const behind = (st: EndStop): number[] => backBox(st.v, st.n, st.eps, st.d)
    tools.push({ soup: a.s.soup, add: false, clip: [behind(sa), behind(sb), b.s.soup] })
  }
  return tools
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
