/**
 * Núcleo B-rep exacto (PRD082): evalúa el árbol `SolidProps` de Cota con OpenCascade (`occt-wasm`) y lo tesela.
 * Módulo puro: recibe el núcleo ya cargado (el Worker en el navegador; Node en los tests).
 *
 * Costuras: OCCT parametriza la esfera con dos polos y un meridiano de costura, y el cilindro, el cono y el toro con
 * una generatriz de costura. Si un empalme cruza una costura o un polo, OCCT suele fallar; la geometría no depende de
 * esa orientación, así que se elige la que deja costura y polos más lejos de las aristas a empalmar y, si igual falla,
 * se reintenta con la siguiente. Con aristas cóncavas y convexas juntas se prueba además por grupos: primero las
 * cóncavas y después las convexas (OCCT no resuelve algunos vértices mixtos de una sola vez).
 */
import { JoinType, TransitionMode, type OcctKernel, type ShapeHandle } from 'occt-wasm'
import type { EdgeRef, SolidProps } from '../document/types'
import type { Vec3 } from '../math'
import { positiveLeaf } from '../editing/solidLeaf'
import { isFullRevolve, openProfile, revolveAngle, revolveFrame, revolvePoint, type RevolveFrame } from '../editing/revolve'

type K = OcctKernel

/** Malla teselada: vértices indexados y, por triángulo, el grupo de superficie de su cara. */
export interface OcctMesh {
  positions: Float32Array
  indices: Uint32Array
  /** Grupo de superficie de cada triángulo: caras con la misma superficie (p. ej. dos mitades de un plano) comparten grupo. */
  triGroup: Uint32Array
  /** Esferas exactas por grupo (los empalmes de la malla de respaldo y los snaps las usan). */
  spheres: Array<{ group: number; c: Vec3; r: number }>
}

export interface OcctStats {
  ms: number
  attempts: number
  strategy: Strategy
  volume: number
  faces: number
}

export interface OcctResult {
  mesh: OcctMesh
  stats: OcctStats
}

/** Fallo de una operación, con la operación de Cota que lo produjo (FILLETEDGE, SUBTRACT, …). */
export class OcctEvalError extends Error {
  constructor(
    readonly op: string,
    message: string,
    /** Medida del empalme o chaflán que falló (radio o distancia). */
    readonly size?: number,
  ) {
    super(message)
  }
}

type Strategy = 'direct' | 'grouped'
interface Orient {
  dir: Vec3
  spin: number
}

const V = (a: Vec3): { x: number; y: number; z: number } => ({ x: a[0], y: a[1], z: a[2] })
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
const norm = (a: Vec3): Vec3 => mul(a, 1 / (len(a) || 1))

/** Terna ortonormal con Z = `dir` y la X girada `spin` alrededor de Z. */
function frame(dir: Vec3, spin = 0): { x: Vec3; y: Vec3; z: Vec3 } {
  const z = norm(dir)
  const a: Vec3 = Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const x0 = norm(cross(a, z))
  const y0 = cross(z, x0)
  const x = add(mul(x0, Math.cos(spin)), mul(y0, Math.sin(spin)))
  return { x, y: cross(z, x), z }
}

/** Matriz 3x4 (por filas) que lleva los ejes locales a `f` y el origen a `o`. */
const placement = (f: { x: Vec3; y: Vec3; z: Vec3 }, o: Vec3): number[] => [
  f.x[0], f.y[0], f.z[0], o[0],
  f.x[1], f.y[1], f.z[1], o[1],
  f.x[2], f.y[2], f.z[2], o[2],
]

// Orientaciones candidatas de la costura de una esfera: 26 direcciones (caras, aristas y vértices de un cubo) × 6 giros.
const SPHERE_CANDIDATES: Orient[] = [{ dir: [0, 0, 1], spin: 0 }]
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
  if (!x && !y && !z) continue
  for (let i = 0; i < 6; i++) SPHERE_CANDIDATES.push({ dir: norm([x, y, z]), spin: (i * Math.PI) / 3 + 0.17 })
}

/** Distancia angular de la dirección local `p` (unitaria) a los polos y a la costura (semimeridiano y = 0, x ≥ 0). */
function seamClearance(p: Vec3): number {
  const pole = Math.acos(Math.min(1, Math.abs(p[2])))
  const seam = p[0] >= 0 ? Math.asin(Math.min(1, Math.abs(p[1]))) : pole
  return Math.min(pole, seam)
}

interface Ctx {
  k: K
  /** Orientación de la costura por hoja (ruta en el árbol). */
  orient: Map<string, Orient>
  strategy: Strategy
}

function asSolid(k: K, s: ShapeHandle, op: string): ShapeHandle {
  if (k.isSolid(s)) return s
  const solids = k.getSubShapes(s, 'solid')
  if (solids.length === 1) return solids[0]
  if (solids.length === 0) throw new OcctEvalError(op, 'the result has no solid')
  return s // varios sólidos separados: se deja el compuesto (sólo los empalmes piden un sólido único)
}

/** Igual que `sweepStartRef` (core/editing/solid): X del perfil al empezar el barrido. */
function sweepRef(p: { path: Vec3[]; ref?: Vec3 }): Vec3 {
  if (p.ref) return p.ref
  const [a, b] = p.path
  if (!a || !b) return [1, 0, 0]
  const t = norm(sub(b, a))
  const ax = t.map(Math.abs)
  let i = 0
  let min = Number.MAX_VALUE
  for (let c = 0; c < 3; c++) if (ax[c] <= min) [min, i] = [ax[c], c]
  const e: Vec3 = [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0]
  return cross(t, norm(cross(t, e)))
}

/** Circunferencia por tres puntos: centro, normal y radio. */
function circle3(a: Vec3, b: Vec3, c: Vec3): { c: Vec3; n: Vec3; r: number } | null {
  const ab = sub(b, a)
  const ac = sub(c, a)
  const n = cross(ab, ac)
  const nn = dot(n, n)
  if (nn < 1e-24) return null
  const t1 = mul(cross(n, ab), dot(ac, ac))
  const t2 = mul(cross(ac, n), dot(ab, ab))
  const o = mul(add(t1, t2), 1 / (2 * nn))
  return { c: add(a, o), n: norm(n), r: len(o) }
}

/**
 * Contorno cerrado de un polígono; los tramos `arcs` (pares de índices, como en EXTRUDE) son arcos exactos por tres
 * puntos del perfil teselado.
 */
function polyWire(k: K, pts: Vec3[], arcs: Array<[number, number]> = []): ShapeHandle {
  let n = pts.length
  if (n > 2 && len(sub(pts[0], pts[n - 1])) < 1e-12 && !arcs.some(([, j]) => j >= n - 1)) n--
  const scale = Math.max(1e-9, ...pts.map((p) => Math.abs(p[0]) + Math.abs(p[1]) + Math.abs(p[2])))
  const eps = scale * 1e-10
  if (arcs.length === 1 && arcs[0][0] === 0 && arcs[0][1] >= n && n >= 3) {
    const c = circle3(pts[0], pts[Math.floor(n / 3)], pts[Math.floor((2 * n) / 3)])
    if (c) return k.makeWire([k.makeCircleEdge(V(c.c), V(c.n), c.r)])
  }
  const arcAt = new Map(arcs.filter(([i, j]) => j > i + 1).map(([i, j]) => [i, j]))
  const edges: ShapeHandle[] = []
  for (let i = 0; i < n; ) {
    const j = arcAt.get(i)
    if (j !== undefined) {
      const [a, m, b] = [pts[i], pts[Math.floor((i + j) / 2) % n], pts[j % n]]
      if (len(sub(a, b)) > eps && circle3(a, m, b)) {
        edges.push(k.makeArcEdge(V(a), V(m), V(b)))
        i = j
        continue
      }
    }
    const [a, b] = [pts[i], pts[(i + 1) % n]]
    if (len(sub(a, b)) > eps) edges.push(k.makeLineEdge(V(a), V(b)))
    i++
  }
  if (edges.length < 1) throw new OcctEvalError('PROFILE', 'empty profile')
  return k.makeWire(edges)
}

function leaf(ctx: Ctx, raw: SolidProps, path: string): ShapeHandle {
  const { k } = ctx
  const p = positiveLeaf(raw)
  switch (p.op) {
    case 'BOX': {
      const bx = p.basis?.x ?? [1, 0, 0]
      const by = p.basis?.y ?? [0, 1, 0]
      return k.transform(k.makeBox(p.width, p.depth, p.height), placement({ x: norm(bx), y: norm(by), z: norm(cross(bx, by)) }, p.origin))
    }
    case 'SPHERE': {
      const o = ctx.orient.get(path) ?? SPHERE_CANDIDATES[0]
      return k.transform(k.makeSphere(p.radius), placement(frame(o.dir, o.spin), p.center))
    }
    case 'CYLINDER':
    case 'CONE':
    case 'TORUS': {
      const f = frame(p.axis ?? [0, 0, 1], ctx.orient.get(path)?.spin ?? 0)
      const s =
        p.op === 'CYLINDER' ? k.makeCylinder(p.radius, p.height) : p.op === 'CONE' ? k.makeCone(p.radius, p.radiusTop ?? 0, p.height) : k.makeTorus(p.radius, p.tube)
      return k.transform(s, placement(f, p.op === 'TORUS' ? p.center : p.base))
    }
    case 'PRISM': {
      const n = Math.max(3, Math.floor(p.sides))
      const bx = p.basis?.x ?? [1, 0, 0]
      const by = p.basis?.y ?? [0, 1, 0]
      const f = { x: norm(bx), y: norm(by), z: norm(cross(bx, by)) }
      const pts = Array.from({ length: n }, (_, i) => {
        const a = (p.rotation ?? 0) + (i / n) * Math.PI * 2
        return add(p.center, add(mul(f.x, p.radius * Math.cos(a)), mul(f.y, p.radius * Math.sin(a))))
      })
      const d = mul(f.z, p.height)
      return k.extrude(k.makeFace(polyWire(k, pts)), d[0], d[1], d[2])
    }
    case 'EXTRUDE': {
      const d = mul(norm(p.axis ?? [0, 0, 1]), p.height)
      return k.extrude(k.makeFace(polyWire(k, p.profile, p.arcs)), d[0], d[1], d[2])
    }
    case 'REVOLVE': {
      // Sin eje (perfiles del generador con IA): como la malla, eje Z con el perfil empezando en −Y.
      const f: RevolveFrame = p.axis && p.ref ? revolveFrame(p) : { a: [0, 0, 1], u: [0, -1, 0], w: [1, 0, 0] }
      let prof = openProfile(p.profile)
      if (!(p.axis && p.ref)) {
        const [first, last] = [prof[0], prof[prof.length - 1]]
        if (first && last && (first[0] > 1e-9 || last[0] > 1e-9)) prof = [...prof, [0, last[1]], [0, first[1]]]
      }
      const pts = prof.map(([r, h]) => revolvePoint(p.base, f, r, h, 0))
      const theta = isFullRevolve(p) ? Math.PI * 2 : revolveAngle(p)
      const dir = theta < 0 ? mul(f.a, -1) : f.a
      return k.revolve(k.makeFace(polyWire(k, pts)), { point: V(p.base), direction: V(dir) }, Math.min(Math.abs(theta), Math.PI * 2))
    }
    case 'SWEEP': {
      const path = p.path.filter((q, i) => i === 0 || len(sub(q, p.path[i - 1])) > 1e-9)
      const prof = p.profile.filter((q, i, a) => i === 0 || q[0] !== a[i - 1][0] || q[1] !== a[i - 1][1])
      if (prof.length > 2 && prof[0][0] === prof[prof.length - 1][0] && prof[0][1] === prof[prof.length - 1][1]) prof.pop()
      if (path.length < 2 || prof.length < 3) throw new OcctEvalError('SWEEP', 'degenerate sweep')
      const spine =
        p.smooth && path.length > 2
          ? k.makeWire([k.interpolatePoints(path.map(V))])
          : k.makeWire(path.slice(1).map((q, i) => k.makeLineEdge(V(path[i]), V(q))))
      const d0 = norm(sub(path[1], path[0]))
      let r = sweepRef(p)
      r = sub(r, mul(d0, dot(r, d0)))
      if (len(r) < 1e-9) r = sweepRef({ path })
      r = norm(r)
      const u = cross(d0, r)
      const sy = p.mirror ? -1 : 1
      const pts = prof.map(([x, y]) => add(path[0], add(mul(r, x), mul(u, y * sy))))
      const s = k.sweep(polyWire(k, pts), spine, TransitionMode.RightCorner)
      return k.isSolid(s) ? s : asSolid(k, s, 'SWEEP')
    }
    case 'LOFT': {
      if (p.sections.length < 2) throw new OcctEvalError('LOFT', 'a loft needs two sections')
      const n = Math.min(...p.sections.map((s) => s.length))
      if (n < 3) throw new OcctEvalError('LOFT', 'degenerate section')
      return k.loft(
        p.sections.map((sec) => polyWire(k, sec.slice(0, n))),
        true,
        true,
      )
    }
    default:
      throw new OcctEvalError(p.op, `unsupported: ${p.op}`)
  }
}

/** Arista OCCT más cercana a `at` (sin las degeneradas de los polos). */
function pickEdge(k: K, edges: ShapeHandle[], at: Vec3): ShapeHandle {
  let best: ShapeHandle | null = null
  let bd = Infinity
  const v = k.makeVertex(at[0], at[1], at[2])
  for (const e of edges) {
    if (k.getLength(e) < 1e-9) continue
    let d: number
    try {
      d = k.distanceBetween(v, e)
    } catch {
      continue
    }
    if (d < bd) {
      bd = d
      best = e
    }
  }
  if (best === null) throw new OcctEvalError('EDGE', 'edge not found')
  return best
}

/** Una arista OCCT por `EdgeRef`, sin repetir (varios puntos del lazo caen en la misma arista exacta). */
function pickEdges(k: K, solid: ShapeHandle, refs: EdgeRef[]): ShapeHandle[] {
  const all = k.getSubShapes(solid, 'edge')
  const out: ShapeHandle[] = []
  for (const r of refs) {
    const e = pickEdge(k, all, r.at)
    if (!out.some((o) => k.isSame(o, e))) out.push(e)
  }
  return out
}

/** Arista convexa (la materia ocupa menos de media vuelta a su alrededor): se sondea un anillo de puntos. */
function edgeConvex(k: K, solid: ShapeHandle, edge: ShapeHandle): boolean {
  const w = k.wireframe(edge, { deflection: 0.01 })
  const n = Math.floor(w.points.length / 3)
  if (n < 2) return true
  const i = Math.max(0, Math.min(n - 2, Math.floor(n / 2)))
  const P = (j: number): Vec3 => [w.points[j * 3], w.points[j * 3 + 1], w.points[j * 3 + 2]]
  const p = mul(add(P(i), P(i + 1)), 0.5)
  const f = frame(sub(P(i + 1), P(i)))
  const bb = k.getBoundingBox(solid)
  const eps = 1e-3 * Math.hypot(bb.xmax - bb.xmin, bb.ymax - bb.ymin, bb.zmax - bb.zmin)
  const N = 24
  let inside = 0
  for (let j = 0; j < N; j++) {
    const a = ((j + 0.5) * 2 * Math.PI) / N
    if (k.containsPoint(solid, V(add(p, add(mul(f.x, eps * Math.cos(a)), mul(f.y, eps * Math.sin(a))))), eps * 1e-3)) inside++
  }
  return inside < N / 2
}

/** Cara de referencia del chaflán asimétrico: la vecina de la arista más cercana a `base`. */
function refFace(k: K, solid: ShapeHandle, edge: ShapeHandle, base: Vec3): ShapeHandle | undefined {
  const v = k.makeVertex(base[0], base[1], base[2])
  let best: ShapeHandle | undefined
  let bd = Infinity
  for (const f of k.getSubShapes(solid, 'face')) {
    if (!k.getSubShapes(f, 'edge').some((e) => k.isSame(e, edge))) continue
    const d = k.distanceBetween(v, f)
    if (d < bd) {
      bd = d
      best = f
    }
  }
  return best
}

function unify(k: K, s: ShapeHandle): ShapeHandle {
  try {
    const u = k.unifySameDomain(s)
    return k.isValid(u) ? u : s
  } catch {
    return s
  }
}

function build(ctx: Ctx, p: SolidProps, path = '0'): ShapeHandle {
  const { k } = ctx
  switch (p.op) {
    case 'UNION':
    case 'SUBTRACT':
    case 'INTERSECT': {
      const ops = Array.isArray(p.operands) ? p.operands : []
      if (!ops.length) throw new OcctEvalError(p.op, 'empty boolean')
      let acc = build(ctx, ops[0], `${path}.0`)
      for (let i = 1; i < ops.length; i++) {
        const b = build(ctx, ops[i], `${path}.${i}`)
        try {
          acc = p.op === 'UNION' ? k.fuse(acc, b) : p.op === 'SUBTRACT' ? k.cut(acc, b) : k.common(acc, b)
        } catch (err) {
          throw new OcctEvalError(p.op, (err as Error).message)
        }
      }
      return asSolid(k, unify(k, acc), p.op)
    }
    case 'SHELL': {
      const solid = asSolid(k, build(ctx, p.solid, `${path}.0`), 'SHELL')
      try {
        // Pared exacta: el sólido menos su desplazamiento hacia adentro (aristas interiores vivas).
        const inner = k.offset(solid, -Math.abs(p.thickness), 1e-6, JoinType.Intersection)
        return asSolid(k, k.cut(solid, inner), 'SHELL')
      } catch (err) {
        throw new OcctEvalError('SHELL', (err as Error).message, p.thickness)
      }
    }
    case 'FILLETEDGE':
    case 'CHAMFEREDGE': {
      let solid = asSolid(k, build(ctx, p.solid, `${path}.0`), p.op)
      const size = p.op === 'FILLETEDGE' ? p.radius : Math.max(p.d1, p.d2)
      const groups: EdgeRef[][] = [p.edges]
      if (ctx.strategy === 'grouped' && p.edges.length > 1) {
        const all = k.getSubShapes(solid, 'edge')
        const concave = p.edges.filter((r) => !edgeConvex(k, solid, pickEdge(k, all, r.at)))
        const convex = p.edges.filter((r) => !concave.includes(r))
        groups.splice(0, 1, ...[concave, convex].filter((g) => g.length))
      }
      try {
        for (const refs of groups) {
          const edges = pickEdges(k, solid, refs)
          if (p.op === 'FILLETEDGE') solid = k.fillet(solid, edges, p.radius)
          else {
            const dist = edges.map((e, i) => {
              const r = refs[i]
              if (p.d1 === p.d2 || !r?.base) return p.d1
              return { distance1: p.d1, distance2: p.d2, referenceFace: refFace(k, solid, e, r.base) }
            })
            solid = k.chamfer(solid, edges, dist)
          }
          if (!k.isValid(solid)) throw new Error('invalid solid')
        }
      } catch (err) {
        throw new OcctEvalError(p.op, (err as Error).message, size)
      }
      return solid
    }
    default:
      try {
        return leaf(ctx, p, path)
      } catch (err) {
        if (err instanceof OcctEvalError) throw err
        throw new OcctEvalError(p.op, (err as Error).message)
      }
  }
}

/** Hojas con costura (ruta → props). */
function seamLeaves(p: SolidProps, path = '0', out: Array<{ path: string; p: SolidProps }> = []): typeof out {
  if (p.op === 'UNION' || p.op === 'SUBTRACT' || p.op === 'INTERSECT') (p.operands ?? []).forEach((o, i) => seamLeaves(o, `${path}.${i}`, out))
  else if (p.op === 'FILLETEDGE' || p.op === 'CHAMFEREDGE' || p.op === 'SHELL') seamLeaves(p.solid, `${path}.0`, out)
  else if (p.op === 'SPHERE' || p.op === 'CYLINDER' || p.op === 'CONE' || p.op === 'TORUS') out.push({ path, p })
  return out
}

const hasBlend = (p: SolidProps): boolean =>
  p.op === 'FILLETEDGE' || p.op === 'CHAMFEREDGE'
    ? true
    : p.op === 'UNION' || p.op === 'SUBTRACT' || p.op === 'INTERSECT'
      ? (p.operands ?? []).some(hasBlend)
      : p.op === 'SHELL'
        ? hasBlend(p.solid)
        : false

/** Puntos de las aristas a empalmar (sus polilíneas), con las orientaciones por defecto. */
function blendProbe(k: K, p: SolidProps): Vec3[] {
  const pts: Vec3[] = []
  const visit = (q: SolidProps, path: string): void => {
    if (q.op === 'FILLETEDGE' || q.op === 'CHAMFEREDGE') {
      try {
        const ctx: Ctx = { k, orient: new Map(), strategy: 'direct' }
        const solid = asSolid(k, build(ctx, q.solid, `${path}.0`), q.op)
        for (const e of pickEdges(k, solid, q.edges)) {
          const w = k.wireframe(e, { deflection: 0.05 })
          for (let i = 0; i + 2 < w.points.length; i += 3) pts.push([w.points[i], w.points[i + 1], w.points[i + 2]])
        }
      } catch {
        /* sin sonda: queda la orientación por defecto */
      }
      visit(q.solid, `${path}.0`)
    } else if (q.op === 'UNION' || q.op === 'SUBTRACT' || q.op === 'INTERSECT') (q.operands ?? []).forEach((o, i) => visit(o, `${path}.${i}`))
    else if (q.op === 'SHELL') visit(q.solid, `${path}.0`)
  }
  visit(p, '0')
  return pts
}

/** Orientaciones candidatas de una hoja con costura, de la mejor a la peor según la sonda. */
function rankOrients(leafP: SolidProps, probe: Vec3[]): Orient[] {
  if (leafP.op === 'SPHERE') {
    const c = leafP.center
    const near = probe.filter((q) => Math.abs(len(sub(q, c)) - leafP.radius) < leafP.radius * 0.6).map((q) => norm(sub(q, c)))
    if (!near.length) return [SPHERE_CANDIDATES[0]]
    const scored = SPHERE_CANDIDATES.map((o) => {
      const f = frame(o.dir, o.spin)
      let m = Infinity
      for (const q of near) m = Math.min(m, seamClearance([dot(q, f.x), dot(q, f.y), dot(q, f.z)]))
      return { o, m }
    })
    scored.sort((a, b) => b.m - a.m)
    return scored.map((s) => s.o)
  }
  // Cilindro, cono, toro: se gira la costura alrededor del eje, lejos (en azimut) de los puntos.
  const axis = (leafP as { axis?: Vec3 }).axis ?? [0, 0, 1]
  const base = leafP.op === 'TORUS' ? leafP.center : (leafP as { base: Vec3 }).base
  const scored = Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 6 + 0.17).map((spin) => {
    const f = frame(axis, spin)
    let m = Infinity
    for (const q of probe) {
      const d = sub(q, base)
      if (Math.hypot(dot(d, f.x), dot(d, f.y)) > 1e-6) m = Math.min(m, Math.abs(Math.atan2(dot(d, f.y), dot(d, f.x))))
    }
    return { o: { dir: axis, spin }, m }
  })
  scored.sort((a, b) => b.m - a.m)
  return scored.map((s) => s.o)
}

export interface EvalOptions {
  /** Orientaciones de costura a probar cuando hay empalmes (cada una, directa y por grupos). */
  maxAttempts?: number
  /** Desviación máxima de la teselación, relativa a la diagonal de la caja envolvente. */
  relDeflection?: number
  /** Desviación angular máxima de la teselación (radianes). */
  angularDeflection?: number
}

/** Evalúa el árbol y lo tesela. Lanza `OcctEvalError` con la operación que falló. */
export function evalSolid(k: K, props: SolidProps, opts: EvalOptions = {}): OcctResult {
  const t0 = performance.now()
  const blend = hasBlend(props)
  const leaves = seamLeaves(props)
  const probe = blend ? blendProbe(k, props) : []
  k.releaseAll()
  const ranked = new Map(leaves.map((l) => [l.path, probe.length ? rankOrients(l.p, probe) : []]))
  const plan: Array<{ o: number; strategy: Strategy }> = []
  for (let o = 0; o < (blend ? Math.max(1, opts.maxAttempts ?? 4) : 1); o++) {
    plan.push({ o, strategy: 'direct' })
    if (blend) plan.push({ o, strategy: 'grouped' })
  }
  let lastErr: unknown = null
  for (let attempt = 0; attempt < plan.length; attempt++) {
    const { o, strategy } = plan[attempt]
    const orient = new Map<string, Orient>()
    for (const [path, list] of ranked) if (list.length) orient.set(path, list[Math.min(o, list.length - 1)])
    try {
      const shape = build({ k, orient, strategy }, props)
      const mesh = tessellate(k, shape, opts)
      return {
        mesh,
        stats: { ms: performance.now() - t0, attempts: attempt + 1, strategy, volume: k.getVolume(shape), faces: k.getSubShapes(shape, 'face').length },
      }
    } catch (err) {
      lastErr = err
      // Fuera de los empalmes no hay otra estrategia que probar.
      if (!(err instanceof OcctEvalError) || (err.op !== 'FILLETEDGE' && err.op !== 'CHAMFEREDGE')) break
    } finally {
      k.releaseAll()
    }
  }
  if (lastErr instanceof OcctEvalError) throw lastErr
  throw new OcctEvalError(props.op, lastErr instanceof Error ? lastErr.message : String(lastErr))
}

/** Clave de la superficie de una cara: las caras de una misma superficie comparten grupo (no se marca arista entre ellas). */
function surfaceKey(k: K, face: ShapeHandle, q: (x: number) => string, i: number): { key: string; sphere?: { c: Vec3; r: number } } {
  try {
    const d = k.surfaceData(face)
    const P = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.y, v.z]
    // Dirección canónica (sin signo) para comparar ejes y normales.
    const canon = (v: Vec3): Vec3 => {
      const n = norm(v)
      const s = Math.abs(n[0]) > 1e-9 ? Math.sign(n[0]) : Math.abs(n[1]) > 1e-9 ? Math.sign(n[1]) : Math.sign(n[2]) || 1
      return mul(n, s)
    }
    const qv = (v: Vec3): string => v.map(q).join(',')
    switch (d.kind) {
      case 'plane': {
        const n = canon(P(d.normal))
        return { key: `P${qv(n)}|${q(dot(n, P(d.location)))}` }
      }
      case 'cylinder': {
        const a = canon(P(d.axis))
        const o = P(d.location)
        const foot = sub(o, mul(a, dot(o, a)))
        return { key: `C${qv(a)}|${qv(foot)}|${q(d.radius)}` }
      }
      case 'sphere':
        return { key: `S${qv(P(d.location))}|${q(d.radius)}`, sphere: { c: P(d.location), r: d.radius } }
      case 'torus':
        return { key: `T${qv(canon(P(d.axis)))}|${qv(P(d.location))}|${q(d.majorRadius)}|${q(d.minorRadius)}` }
      default:
        return { key: `#${i}` }
    }
  } catch {
    return { key: `#${i}` }
  }
}

function tessellate(k: K, shape: ShapeHandle, opts: EvalOptions): OcctMesh {
  const bb = k.getBoundingBox(shape)
  const diag = Math.hypot(bb.xmax - bb.xmin, bb.ymax - bb.ymin, bb.zmax - bb.zmin) || 1
  const m = k.meshShape(shape, { linearDeflection: diag * (opts.relDeflection ?? 0.001), angularDeflection: opts.angularDeflection ?? 0.2 })
  const faces = k.getSubShapes(shape, 'face')
  const groups = m.faceGroups
  if (!groups || groups.length !== faces.length * 3) throw new OcctEvalError('MESH', 'face groups do not match the faces')
  const tol = diag * 1e-6
  const q = (x: number): string => String(Math.round(x / tol))
  const keyGroup = new Map<string, number>()
  const spheres: OcctMesh['spheres'] = []
  const triGroup = new Uint32Array(m.triangleCount)
  faces.forEach((f, i) => {
    const { key, sphere } = surfaceKey(k, f, q, i)
    let g = keyGroup.get(key)
    if (g === undefined) {
      g = keyGroup.size
      keyGroup.set(key, g)
      if (sphere) spheres.push({ group: g, ...sphere })
    }
    // `faceGroups` cuenta índices (3 por triángulo), no triángulos.
    triGroup.fill(g, groups[i * 3] / 3, (groups[i * 3] + groups[i * 3 + 1]) / 3)
  })
  return { positions: m.positions, indices: m.indices, triGroup, spheres }
}
