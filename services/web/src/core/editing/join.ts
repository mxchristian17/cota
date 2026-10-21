import type { Vec3 } from '../math'
import type { Entity } from '../document/types'
import { Curve, curveOf, dist2, primPoint, splineCurve, type CurveEntityInput, type Prim } from '../geom/curve'
import { normAngle, TAU } from '../geom/arc'

/**
 * JOIN, con las reglas del CAD clásico: líneas colineales (aunque haya huecos) → una línea;
 * arcos del mismo círculo → el arco mínimo que los cubre (o un círculo si lo completan); idem arcos
 * de elipse; después, las curvas que se tocan por los extremos se encadenan en una polilínea (o en
 * una spline si alguna es spline o elipse). Las curvas cerradas no se unen.
 */

interface Item {
  ids: string[]
  curve: Curve
  changed: boolean
}

export interface JoinGroup {
  /** Entidades consumidas (la primera es la de origen: su capa pasa al resultado). */
  ids: string[]
  result: CurveEntityInput
}

const cross2 = (a: Vec3, b: Vec3): number => a[0] * b[1] - a[1] * b[0]

function unit(a: Vec3, b: Vec3): Vec3 {
  const L = dist2(a, b) || 1
  return [(b[0] - a[0]) / L, (b[1] - a[1]) / L, 0]
}

/** Agrupa ítems compatibles (misma recta, mismo círculo…) y fusiona cada grupo de 2 o más. */
function mergeGroups(items: Item[], same: (a: Item, b: Item) => boolean, fuse: (g: Item[]) => Curve): Item[] {
  const out: Item[] = []
  const used = new Set<number>()
  items.forEach((it, i) => {
    if (used.has(i)) return
    const g = [it]
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j) || !same(it, items[j])) continue
      g.push(items[j])
      used.add(j)
    }
    out.push(g.length > 1 ? { ids: g.flatMap((x) => x.ids), curve: fuse(g), changed: true } : it)
  })
  return out
}

const isOpen = (it: Item, k: Prim['k']): boolean => !it.curve.closed && it.curve.n === 1 && it.curve.prims[0].k === k

/**
 * Arco mínimo que cubre los intervalos angulares `[inicio, barrido]` (antihorarios), como
 * `[inicio, barrido]`; null si cubren la vuelta completa.
 */
export function coverIntervals(iv: Array<[number, number]>, eps = 1e-9): [number, number] | null {
  const m: Array<[number, number]> = []
  for (const [s, w] of iv.map(([s, w]) => [normAngle(s), w] as [number, number]).sort((a, b) => a[0] - b[0])) {
    const last = m[m.length - 1]
    if (last && s <= last[1] + eps) last[1] = Math.max(last[1], s + w)
    else m.push([s, s + w])
  }
  while (m.length > 1 && m[m.length - 1][1] - TAU >= m[0][0] - eps) {
    const f = m.shift() as [number, number]
    m[m.length - 1][1] = Math.max(m[m.length - 1][1], f[1] + TAU)
  }
  if (m.length === 1 && m[0][1] - m[0][0] >= TAU - eps) return null
  let best = -Infinity
  let bi = 0
  m.forEach(([, e], k) => {
    const next = k + 1 < m.length ? m[k + 1][0] : m[0][0] + TAU
    if (next - e > best) {
      best = next - e
      bi = k
    }
  })
  return [m[(bi + 1) % m.length][0], TAU - best]
}

/** Intervalo antihorario `[inicio, barrido]` de un arco o arco de elipse. */
const ccwInterval = (p: Prim & { k: 'A' | 'E' }): [number, number] => {
  const s = p.k === 'A' ? p.a0 : p.p0
  return [p.sw >= 0 ? s : s + p.sw, Math.abs(p.sw)]
}

function mergeLines(items: Item[], tol: number): Item[] {
  return mergeGroups(
    items,
    (a, b) => {
      if (!isOpen(a, 'L') || !isOpen(b, 'L')) return false
      const pa = a.curve.prims[0] as Prim & { k: 'L' }
      const pb = b.curve.prims[0] as Prim & { k: 'L' }
      const u = unit(pa.a, pa.b)
      const off = (q: Vec3): number => Math.abs(cross2(u, [q[0] - pa.a[0], q[1] - pa.a[1], 0]))
      return off(pb.a) < tol && off(pb.b) < tol
    },
    (g) => {
      const p0 = g[0].curve.prims[0] as Prim & { k: 'L' }
      const u = unit(p0.a, p0.b)
      const s = g.flatMap((it) => [it.curve.start, it.curve.end]).map((q) => (q[0] - p0.a[0]) * u[0] + (q[1] - p0.a[1]) * u[1])
      const at = (k: number): Vec3 => [p0.a[0] + u[0] * k, p0.a[1] + u[1] * k, p0.a[2]]
      return new Curve('LINE', [{ k: 'L', a: at(Math.min(...s)), b: at(Math.max(...s)) }], false)
    },
  )
}

function mergeArcs(items: Item[], tol: number): Item[] {
  return mergeGroups(
    items,
    (a, b) => {
      if (!isOpen(a, 'A') || !isOpen(b, 'A')) return false
      const pa = a.curve.prims[0] as Prim & { k: 'A' }
      const pb = b.curve.prims[0] as Prim & { k: 'A' }
      return dist2(pa.c, pb.c) < tol && Math.abs(pa.r - pb.r) < tol
    },
    (g) => closeArc(g[0].curve.prims[0] as Prim & { k: 'A' }, coverIntervals(g.map((it) => ccwInterval(it.curve.prims[0] as Prim & { k: 'A' })))),
  )
}

function mergeEllipseArcs(items: Item[], tol: number): Item[] {
  return mergeGroups(
    items,
    (a, b) => {
      if (!isOpen(a, 'E') || !isOpen(b, 'E')) return false
      const pa = a.curve.prims[0] as Prim & { k: 'E' }
      const pb = b.curve.prims[0] as Prim & { k: 'E' }
      return dist2(pa.c, pb.c) < tol && dist2(pa.ax, pb.ax) < tol && dist2(pa.ay, pb.ay) < tol
    },
    (g) => closeEllipse(g[0].curve.prims[0] as Prim & { k: 'E' }, coverIntervals(g.map((it) => ccwInterval(it.curve.prims[0] as Prim & { k: 'E' })))),
  )
}

/** Arco (o círculo si `cover` es null) sobre el círculo de `p`. */
function closeArc(p: Prim & { k: 'A' }, cover: [number, number] | null): Curve {
  if (!cover) return new Curve('CIRCLE', [{ k: 'A', c: p.c, r: p.r, a0: 0, sw: TAU }], true)
  return new Curve('ARC', [{ k: 'A', c: p.c, r: p.r, a0: cover[0], sw: cover[1] }], false)
}

function closeEllipse(p: Prim & { k: 'E' }, cover: [number, number] | null): Curve {
  if (!cover) return new Curve('ELLIPSE', [{ ...p, p0: 0, sw: TAU }], true)
  return new Curve('ELLIPSE', [{ ...p, p0: cover[0], sw: cover[1] }], false)
}

/** `cLose` de JOIN: un arco pasa a círculo y un arco de elipse a elipse completa. */
export function closeCurve(e: Entity): CurveEntityInput | null {
  const c = curveOf(e)
  if (!c || c.closed || c.n !== 1) return null
  const p = c.prims[0]
  if (p.k === 'A') return closeArc(p, null).toEntity()
  if (p.k === 'E') return closeEllipse(p, null).toEntity()
  return null
}

const isSplineLike = (c: Curve): boolean => c.kind === 'SPLINE' || c.prims.some((p) => p.k === 'E')

/** Puntos por los que pasa una pieza al volverse parte de una spline. */
function splinePoints(c: Curve): Vec3[] {
  if (c.kind === 'SPLINE') return [c.start, ...c.nodes.map((N) => c.pointAt(N)), c.end]
  const pts: Vec3[] = [c.start]
  for (const p of c.prims) {
    const k = p.k === 'L' ? 1 : Math.max(4, Math.ceil((16 * Math.abs(p.sw)) / TAU))
    for (let j = 1; j <= k; j++) pts.push(primPoint(p, j / k))
  }
  return pts
}

/** Une piezas ya orientadas y encadenadas en una polilínea o una spline. */
function fuseChain(members: Curve[], tol: number): CurveEntityInput | null {
  const first = members[0]
  const last = members[members.length - 1]
  const closed = dist2(first.start, last.end) < tol
  if (members.some(isSplineLike)) {
    const pts: Vec3[] = []
    for (const m of members) for (const q of splinePoints(m)) if (!pts.length || dist2(pts[pts.length - 1], q) > tol) pts.push(q)
    return splineCurve(pts)?.toEntity() ?? null
  }
  return new Curve('POLYLINE', members.flatMap((m) => m.prims), closed).toEntity()
}

/** Encadena por extremos coincidentes, en el orden de selección. */
function chainItems(items: Item[], tol: number): JoinGroup[] {
  const pool = [...items]
  const groups: JoinGroup[] = []
  while (pool.length) {
    const head = pool.shift() as Item
    const members = [head.curve]
    const ids = [...head.ids]
    let grew = !head.curve.closed
    while (grew) {
      grew = false
      const s = members[0].start
      const e = members[members.length - 1].end
      for (let i = 0; i < pool.length; i++) {
        const c = pool[i].curve
        if (c.closed) continue
        if (dist2(e, c.start) < tol) members.push(c)
        else if (dist2(e, c.end) < tol) members.push(c.reverse())
        else if (dist2(s, c.end) < tol) members.unshift(c)
        else if (dist2(s, c.start) < tol) members.unshift(c.reverse())
        else continue
        ids.push(...pool[i].ids)
        pool.splice(i, 1)
        grew = !(dist2(members[0].start, members[members.length - 1].end) < tol)
        break
      }
    }
    if (members.length > 1) {
      const result = fuseChain(members, tol)
      if (result) groups.push({ ids, result })
    } else if (head.changed) {
      const result = head.curve.toEntity()
      if (result) groups.push({ ids, result })
    }
  }
  return groups
}

/** Calcula las uniones posibles entre las entidades (en orden de selección; la primera = origen). */
export function joinEntities(entities: Entity[]): JoinGroup[] {
  const items: Item[] = []
  for (const e of entities) {
    const c = curveOf(e)
    if (c) items.push({ ids: [e.id], curve: c, changed: false })
  }
  if (!items.length) return []
  const boxes = items.map((it) => it.curve.box())
  const span = Math.max(...boxes.map((b) => b.maxX), ...boxes.map((b) => b.maxY)) - Math.min(...boxes.map((b) => b.minX), ...boxes.map((b) => b.minY))
  const tol = 1e-6 * Math.max(1, span)
  return chainItems(mergeEllipseArcs(mergeArcs(mergeLines(items, tol), tol), tol), tol)
}
