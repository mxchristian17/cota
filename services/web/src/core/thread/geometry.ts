import type { Vec3 } from '../math'
import type { ArcProps, DimensionEntity, Entity, SolidProps, SolidThread } from '../document/types'
import { vadd, vcross, vdot, vlen, vnorm, vscale, vsub } from '../geom/vec3'
import { rayFaces, type Topology } from '../editing/topology'
import { MIN_THREAD_GAP_MM, threadDepth, threadInfo, type ThreadInfo, type ThreadSpec } from './tables'

/**
 * Geometría de THREAD: el arco de 3/4 de la representación ISO 6410 / IRAM, las caras cilíndricas de los
 * sólidos, la textura helicoidal y las líneas de las vistas de dibujo.
 */

/** Radio del arco fino: en un eje, el fondo (adentro); en un agujero, el nominal (afuera). */
export function threadArcRadius(circleR: number, spec: ThreadSpec, internal: boolean, gapMin: number): number {
  const depth = Math.max(threadDepth(spec, internal) * (2 * circleR) / (internal ? spec.D1 : spec.d), gapMin)
  return internal ? circleR + depth : Math.max(circleR * 0.2, circleR - depth)
}

/** Separación mínima en unidades de dibujo para la escala de anotación `scale`. */
export const minGap = (scale: number): number => MIN_THREAD_GAP_MM * (scale > 0 ? scale : 1)

/** Arco de 3/4 abierto en el cuadrante superior derecho de su plano (ISO 6410). */
export function threadArc(center: Vec3, normal: Vec3, radius: number, info: ThreadInfo): ArcProps {
  return { center: [...center], radius, startAngle: Math.PI / 2, endAngle: 0, normal: [...normal], thread: info }
}

export function threadArcFor(center: Vec3, normal: Vec3, circleR: number, spec: ThreadSpec, internal: boolean, scale: number): ArcProps {
  return threadArc(center, normal, threadArcRadius(circleR, spec, internal, minGap(scale)), threadInfo(spec, internal))
}

const isLeader = (e: Entity): e is DimensionEntity => e.type === 'DIMENSION' && (e.props.dimType === 'MLEADER' || e.props.dimType === 'LEADER')

/** Cota (línea de referencia) de una rosca 2D: un multileader cuya flecha cae en el anillo de la rosca. */
export function leaderOfArc(entities: Entity[], a: ArcProps): DimensionEntity | null {
  const n = vnorm(a.normal)
  for (const e of entities) {
    if (!isLeader(e) || !e.props.points.length) continue
    const p = e.props.points[0]
    const rel = vsub(p, a.center)
    if (Math.abs(vdot(rel, n)) > 1e-6 * Math.max(1, a.radius)) continue
    const r = vlen(rel)
    if (r > 0.6 * a.radius && r < 1.5 * a.radius) return e
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// 3D
// ---------------------------------------------------------------------------------------------

export interface CylFace {
  /** Eje del tramo: de `a` a `b`. */
  a: Vec3
  b: Vec3
  radius: number
  /** Normal hacia afuera del material: true = eje (rosca exterior), false = agujero (interior). */
  shaft: boolean
}

/** Base ortonormal perpendicular a `d`. */
function perp(d: Vec3): [Vec3, Vec3] {
  const ref: Vec3 = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const u = vnorm(vcross(ref, d))
  return [u, vcross(d, u)]
}

/** La cara `face` como cilindro (eje, radio, tramo y lado del material); null si no es cilíndrica. */
export function cylinderOfFace(topo: Topology, face: number): CylFace | null {
  const tris: number[] = []
  for (let i = 0; i < topo.tris.length; i++) if (topo.triFace[i] === face) tris.push(i)
  if (tris.length < 4) return null
  const n0 = topo.normals[tris[0]]
  let other = n0
  for (const i of tris) if (Math.abs(vdot(topo.normals[i], n0)) < Math.abs(vdot(other, n0))) other = topo.normals[i]
  const ax = vcross(n0, other)
  if (vlen(ax) < 1e-3) return null
  const d = vnorm(ax)
  if (tris.some((i) => Math.abs(vdot(topo.normals[i], d)) > 0.05)) return null
  const [u, v] = perp(d)
  // Las facetas son cuerdas del cilindro: sus VÉRTICES están sobre él. El eje sale del círculo que mejor ajusta
  // los vértices proyectados (Kåsa); las normales de las facetas dicen de qué lado está el material.
  const verts = new Set<number>()
  const cents: Array<[number, number, number, number]> = []
  for (const i of tris) {
    const [A, B, C] = topo.tris[i].map((k) => topo.verts[k])
    topo.tris[i].forEach((k) => verts.add(k))
    const c = vscale(vadd(vadd(A, B), C), 1 / 3)
    cents.push([vdot(c, u), vdot(c, v), vdot(topo.normals[i], u), vdot(topo.normals[i], v)])
  }
  const all = [...verts].map((k): [number, number] => [vdot(topo.verts[k], u), vdot(topo.verts[k], v)])
  // Los vértices que deja la CSG sobre una cuerda (T-junctions) quedan adentro: se reajusta sólo con los que
  // están en el radio mayor, hasta que el centro no cambia.
  let fit = fitCircle(all)
  for (const tol of [2e-3, 1e-5, 1e-7]) {
    if (!fit) return null
    const f = fit
    const dist = all.map((p) => Math.hypot(p[0] - f.c[0], p[1] - f.c[1]))
    const dmax = Math.max(...dist)
    const on = all.filter((_, k) => dist[k] >= dmax - tol * dmax)
    if (on.length < 3) break
    fit = fitCircle(on)
  }
  if (!fit) return null
  const [ox, oy] = fit.c
  let t0 = Infinity
  let t1 = -Infinity
  const rad: number[] = []
  for (const k of verts) {
    const p = topo.verts[k]
    rad.push(Math.hypot(vdot(p, u) - ox, vdot(p, v) - oy))
    const t = vdot(p, d)
    t0 = Math.min(t0, t)
    t1 = Math.max(t1, t)
  }
  // El radio es el de los vértices sobre el cilindro (los de las cuerdas quedan un poco adentro).
  const radius = Math.max(...rad)
  if (!(radius > 1e-9) || rad.some((r) => radius - r > 0.03 * radius)) return null
  let side = 0
  for (const [cx, cy, nx, ny] of cents) side += (cx - ox) * nx + (cy - oy) * ny
  const base = vadd(vscale(u, ox), vscale(v, oy))
  return { a: vadd(base, vscale(d, t0)), b: vadd(base, vscale(d, t1)), radius, shaft: side > 0 }
}

/** Círculo por mínimos cuadrados (Kåsa) de puntos 2D. */
function fitCircle(pts: Array<[number, number]>): { c: [number, number] } | null {
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length
  let [sxx, sxy, syy, sx, sy, sxz, syz, sz] = [0, 0, 0, 0, 0, 0, 0, 0]
  for (const [px, py] of pts) {
    const [x, y] = [px - mx, py - my]
    const z = x * x + y * y
    sxx += x * x
    sxy += x * y
    syy += y * y
    sx += x
    sy += y
    sxz += x * z
    syz += y * z
    sz += z
  }
  const sol = solve3([
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, pts.length],
  ], [-sxz, -syz, -sz])
  return sol ? { c: [mx - sol[0] / 2, my - sol[1] / 2] } : null
}

/** Sistema 3×3 por Cramer; null si es singular. */
function solve3(m: number[][], b: number[]): [number, number, number] | null {
  const det = (a: number[][]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
  const D = det(m)
  if (Math.abs(D) < 1e-18) return null
  const col = (k: number) => m.map((row, i) => row.map((x, j) => (j === k ? b[i] : x)))
  return [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D]
}

/** Nodos del árbol del sólido (pre-orden). */
export function solidNodes(p: SolidProps): SolidProps[] {
  if ('operands' in p) return [p, ...p.operands.flatMap(solidNodes)]
  if (p.op === 'SHELL' || p.op === 'FILLETEDGE' || p.op === 'CHAMFEREDGE') return [p, ...solidNodes(p.solid)]
  return [p]
}

/** Todas las roscas del sólido (también las de sus operandos). */
export const solidThreads = (p: SolidProps): SolidThread[] => solidNodes(p).flatMap((n) => n.threads ?? [])

/** Lleva por `fn` los puntos de las roscas propias del nodo (arreglos nuevos: no toca los originales). */
export function mapOwnThreads(p: SolidProps, fn: (v: Vec3) => Vec3): void {
  if (p.threads?.length) p.threads = p.threads.map((t) => ({ ...t, a: fn(t.a), b: fn(t.b), rim: fn(t.rim) }))
}

/** Como `mapOwnThreads`, en todos los nodos del árbol. */
export function mapAllThreads(p: SolidProps, fn: (v: Vec3) => Vec3): void {
  for (const n of solidNodes(p)) mapOwnThreads(n, fn)
}

/** Dirección del eje y radio de una rosca 3D. */
export function threadAxis(t: SolidThread): { d: Vec3; len: number; radius: number; u: Vec3 } {
  const ab = vsub(t.b, t.a)
  const len = vlen(ab)
  const d = len > 0 ? vscale(ab, 1 / len) : ([0, 0, 1] as Vec3)
  const rel = vsub(t.rim, t.a)
  const radial = vsub(rel, vscale(d, vdot(rel, d)))
  const radius = vlen(radial)
  return { d, len, radius, u: radius > 0 ? vscale(radial, 1 / radius) : perp(d)[0] }
}

/** ¿La rosca está sobre esa cara cilíndrica? */
export function threadOnFace(t: SolidThread, c: CylFace): boolean {
  const { d, radius } = threadAxis(t)
  const cd = vnorm(vsub(c.b, c.a))
  if (Math.abs(Math.abs(vdot(d, cd)) - 1) > 1e-4) return false
  const rel = vsub(c.a, t.a)
  const off = vlen(vsub(rel, vscale(d, vdot(rel, d))))
  return off < 0.01 * c.radius && Math.abs(radius - c.radius) < 0.01 * c.radius
}

/** Rosca 3D de una cara cilíndrica (en el punto `rim` de la cara). */
export function solidThreadFor(c: CylFace, spec: ThreadSpec): SolidThread {
  const d = vnorm(vsub(c.b, c.a))
  const u = perp(d)[0]
  return { a: [...c.a], b: [...c.b], rim: vadd(c.a, vscale(u, c.radius)), info: threadInfo(spec, !c.shaft) }
}

/** Cota de una rosca 3D: un multileader cuya flecha cae sobre (o cerca de) la cara roscada. */
export function leaderOfSolidThread(entities: Entity[], t: SolidThread): DimensionEntity | null {
  const { d, len, radius } = threadAxis(t)
  for (const e of entities) {
    if (!isLeader(e) || !e.props.points.length) continue
    const rel = vsub(e.props.points[0], t.a)
    const along = vdot(rel, d)
    if (along < -0.05 * len || along > 1.05 * len) continue
    const r = vlen(vsub(rel, vscale(d, along)))
    if (r > 0.6 * radius && r < 1.5 * radius) return e
  }
  return null
}

/** Máximo de vueltas dibujadas por rosca (más, y el paso se agranda para no cargar la vista). */
const MAX_TURNS = 240
const SEG_PER_TURN = 32

/** Textura de la rosca: hélice de paso real sobre la cara (segmentos a→b en un arreglo plano). */
export function threadHelixSegments(t: SolidThread): number[] {
  const { d, len, radius, u } = threadAxis(t)
  if (!(len > 0) || !(radius > 0)) return []
  const v = vcross(d, u)
  const pitch = Math.max(t.info.pitch, len / MAX_TURNS)
  // Fuera de la faceta en un eje, dentro del hueco en un agujero (las facetas son cuerdas del cilindro).
  const r = radius * (t.info.internal ? 0.99 : 1.004)
  const steps = Math.max(2, Math.ceil((len / pitch) * SEG_PER_TURN))
  const at = (i: number): Vec3 => {
    const s = (i / steps) * len
    const th = (s / pitch) * Math.PI * 2
    return vadd(vadd(t.a, vscale(d, s)), vadd(vscale(u, r * Math.cos(th)), vscale(v, r * Math.sin(th))))
  }
  const out: number[] = []
  let prev = at(0)
  for (let i = 1; i <= steps; i++) {
    const p = at(i)
    out.push(prev[0], prev[1], prev[2], p[0], p[1], p[2])
    prev = p
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Vistas de dibujo (representación ISO 6410)
// ---------------------------------------------------------------------------------------------

type P2 = [number, number]

export type ThreadViewItem =
  | { kind: 'line'; a: P2; b: P2; hidden: boolean; thin: true }
  | { kind: 'arc'; c: P2; r: number; a0: number; a1: number; hidden: boolean; thin: true; thread: ThreadInfo }

interface Basis {
  right: Vec3
  up: Vec3
  out: Vec3
}

/**
 * Líneas finas de las roscas de un sólido en una vista: de frente al eje, el arco de 3/4 (fondo de un eje,
 * nominal de un agujero) en el extremo que mira al observador; de costado, las dos líneas paralelas al eje
 * (las del agujero quedan ocultas, dentro del material). En vistas oblicuas no se dibujan.
 */
export function threadViewItems(p: SolidProps, basis: Basis, topo: Topology | null, gapMin: number): ThreadViewItem[] {
  const out: ThreadViewItem[] = []
  const to2 = (q: Vec3): P2 => [vdot(q, basis.right), vdot(q, basis.up)]
  const bias = (topo?.diag ?? 1) * 1e-4
  const hiddenAt = (q: Vec3): boolean => !!topo && rayFaces(topo, vadd(q, vscale(basis.out, bias)), basis.out).length > 0
  for (const t of solidThreads(p)) {
    const { d, len, radius } = threadAxis(t)
    if (!(len > 0)) continue
    const internal = t.info.internal
    // El arco o las líneas están a la profundidad de la rosca del lado que corresponde.
    const depth = Math.max(gapMin, internal ? (t.info.d - 2 * radius) / 2 : threadDepthOf(t.info))
    const rl = internal ? radius + depth : Math.max(radius * 0.2, radius - depth)
    const c = vdot(d, basis.out)
    if (Math.abs(c) > 0.999) {
      const near = vdot(t.a, basis.out) >= vdot(t.b, basis.out) ? t.a : t.b
      const [u0, v0] = perp(d)
      const probe = vadd(near, vscale(vadd(u0, v0), (-rl * Math.SQRT1_2)))
      out.push({ kind: 'arc', c: to2(near), r: rl, a0: Math.PI / 2, a1: 0, hidden: hiddenAt(probe), thin: true, thread: t.info })
    } else if (Math.abs(c) < 1e-3) {
      const w = vnorm(vcross(basis.out, d))
      for (const k of [-1, 1]) {
        const p0 = vadd(t.a, vscale(w, k * rl))
        const p1 = vadd(t.b, vscale(w, k * rl))
        let hidden = true
        if (!internal) {
          const front = Math.sqrt(Math.max(0, radius * radius - rl * rl))
          hidden = hiddenAt(vadd(vscale(vadd(p0, p1), 0.5), vscale(basis.out, front)))
        }
        out.push({ kind: 'line', a: to2(p0), b: to2(p1), hidden, thin: true })
      }
    }
  }
  return out
}

/** Profundidad radial de la rosca exterior según su serie (sin tabla: por el paso). */
function threadDepthOf(i: ThreadInfo): number {
  if (i.series === 'M' || i.series === 'MF') return (1.226869 * i.pitch) / 2
  if (i.series === 'TR') return 0.5 * i.pitch + (i.pitch <= 1.5 ? 0.15 : i.pitch <= 5 ? 0.25 : i.pitch <= 12 ? 0.5 : 1)
  return (1.280654 * i.pitch) / 2
}

/** Punto de la rosca 3D más cercano a `p` sobre su cara (donde apunta la flecha de la cota). */
export function threadSurfacePoint(t: SolidThread, p: Vec3): Vec3 {
  const { d, len, radius, u } = threadAxis(t)
  const rel = vsub(p, t.a)
  const along = Math.min(len, Math.max(0, vdot(rel, d)))
  const radial = vsub(rel, vscale(d, vdot(rel, d)))
  const dir = vlen(radial) > 1e-9 ? vnorm(radial) : u
  return vadd(vadd(t.a, vscale(d, along)), vscale(dir, radius))
}
