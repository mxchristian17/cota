import type { Vec3 } from '../math'
import type { ArcProps, BoxProps, EdgeBlendProps, ExtrudeProps, RevolveProps, SolidLeaf, SolidProps, TorusProps } from '../document/types'
import { arcBasis } from '../geom/arc'
import { isFullRevolve, openProfile, revolveAngle, revolveFrame, revolvePoint } from './revolve'
import { nearestEdge, solidTopology } from './topology'
import { vdist, vdot, vsub } from '../geom/vec3'
import { cleanMeshNumber, cleanNumber } from '../geom/clean'
import { mapAllThreads } from '../thread/geometry'

/** Devuelve las hojas (extrusión/primitivas) de un árbol de sólido. */
export function solidLeaves(p: SolidProps): SolidLeaf[] {
  if (isLeaf(p)) return [p]
  if (p.op === 'SHELL' || isEdgeBlend(p)) return solidLeaves(p.solid)
  return p.operands.flatMap(solidLeaves)
}

/** ¿Es un nodo de empalme/chaflán de aristas? */
export function isEdgeBlend(p: SolidProps): p is EdgeBlendProps {
  return p.op === 'FILLETEDGE' || p.op === 'CHAMFEREDGE'
}

/** Aplica `fn` (in-place) a los puntos de referencia de las aristas de un nodo FILLETEDGE/CHAMFEREDGE. */
export function mapEdgePoints(p: EdgeBlendProps, fn: (v: Vec3) => Vec3): void {
  p.edges = p.edges.map((e) => (e.base ? { at: fn(e.at), base: fn(e.base) } : { at: fn(e.at) }))
}

/** Escala (in-place) el radio o las distancias de un nodo FILLETEDGE/CHAMFEREDGE. */
export function scaleEdgeBlend(p: EdgeBlendProps, f: number): void {
  if (p.op === 'FILLETEDGE') p.radius *= f
  else {
    p.d1 *= f
    p.d2 *= f
  }
}

/** Recorre (pre-orden) los nodos FILLETEDGE/CHAMFEREDGE de un árbol. */
export function edgeBlendNodes(p: SolidProps): EdgeBlendProps[] {
  if (isLeaf(p)) return []
  if (p.op === 'SHELL') return edgeBlendNodes(p.solid)
  if (isEdgeBlend(p)) return [p, ...edgeBlendNodes(p.solid)]
  return p.operands.flatMap(edgeBlendNodes)
}

function isLeaf(p: SolidProps): p is SolidLeaf {
  return (
    p.op === 'EXTRUDE' ||
    p.op === 'BOX' ||
    p.op === 'CYLINDER' ||
    p.op === 'CONE' ||
    p.op === 'SPHERE' ||
    p.op === 'PRISM' ||
    p.op === 'REVOLVE' ||
    p.op === 'TORUS' ||
    p.op === 'SWEEP' ||
    p.op === 'LOFT'
  )
}

const add = (v: Vec3, dx: number, dy: number, dz: number): Vec3 => [v[0] + dx, v[1] + dy, v[2] + dz]

/** Muestrea un polígono circular en el plano z (n puntos, cerrado si close). */
function circle(cx: number, cy: number, z: number, r: number, n: number, close = false): Vec3[] {
  const out: Vec3[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z])
  }
  if (close && out.length > 0) out.push(out[0])
  return out
}

/** Esquinas de un N-gono regular en el plano z (radio r, rotación en radianes). */
function ngon(cx: number, cy: number, z: number, r: number, sides: number, rotation = 0): Vec3[] {
  const n = Math.max(3, Math.floor(sides))
  const out: Vec3[] = []
  for (let i = 0; i < n; i++) {
    const a = rotation + (i / n) * Math.PI * 2
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z])
  }
  return out
}

/** Radio máximo del perfil (pares [radio, z]) de un REVOLVE. */
function maxProfileRadius(profile: Array<[number, number]>): number {
  return profile.reduce((m, [r]) => Math.max(m, r), 0)
}

// --- Helpers para primitivas con eje arbitrario (cilindro/cono orientables) ---
const vadd = (p: Vec3, q: Vec3): Vec3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]]
const vscale = (p: Vec3, s: number): Vec3 => [p[0] * s, p[1] * s, p[2] * s]
const vcross = (p: Vec3, q: Vec3): Vec3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]
const vnorm = (v: Vec3): Vec3 => {
  const L = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / L, v[1] / L, v[2] / L]
}
/** Eje unitario de una primitiva (o +Z por defecto). */
const axisOf = (leaf: { axis?: Vec3 }): Vec3 => vnorm(leaf.axis ?? [0, 0, 1])
/** Base ortonormal (u,v) del plano perpendicular a `a`. */
function perpBasis(a: Vec3): [Vec3, Vec3] {
  const ref: Vec3 = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const u = vnorm(vcross(ref, a))
  return [u, vcross(a, u)]
}
/** Anillo de n puntos alrededor de `c` en el plano generado por u,v (cerrado opcional). */
function ringAround(c: Vec3, u: Vec3, v: Vec3, r: number, n: number, close = false): Vec3[] {
  const out: Vec3[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    out.push(vadd(c, vadd(vscale(u, r * Math.cos(a)), vscale(v, r * Math.sin(a)))))
  }
  if (close && out.length > 0) out.push(out[0])
  return out
}
/** Cuatro puntos de cuadrante alrededor de `c` en el plano u,v. */
function quadsAround(c: Vec3, u: Vec3, v: Vec3, r: number): Vec3[] {
  return [vadd(c, vscale(u, r)), vadd(c, vscale(u, -r)), vadd(c, vscale(v, r)), vadd(c, vscale(v, -r))]
}

/** Traslada (in-place) el ancla de una hoja en 3D. */
export function translateLeaf(leaf: SolidLeaf, dx: number, dy: number, dz: number): void {
  switch (leaf.op) {
    case 'EXTRUDE':
      leaf.profile = leaf.profile.map((v) => add(v, dx, dy, dz))
      break
    case 'BOX':
      leaf.origin = add(leaf.origin, dx, dy, dz)
      break
    case 'CYLINDER':
    case 'CONE':
      leaf.base = add(leaf.base, dx, dy, dz)
      break
    case 'SPHERE':
      leaf.center = add(leaf.center, dx, dy, dz)
      break
    case 'PRISM':
      leaf.center = add(leaf.center, dx, dy, dz)
      break
    case 'REVOLVE':
      leaf.base = add(leaf.base, dx, dy, dz)
      break
    case 'TORUS':
      leaf.center = add(leaf.center, dx, dy, dz)
      break
    case 'SWEEP':
      // El perfil local NO se traslada; sí el path 3D.
      leaf.path = leaf.path.map((v) => add(v, dx, dy, dz))
      break
    case 'LOFT':
      leaf.sections = leaf.sections.map((sec) => sec.map((v) => add(v, dx, dy, dz)))
      break
  }
}

/** Traslada (in-place) todas las hojas del sólido en 3D. */
export function translateSolid(p: SolidProps, dx: number, dy: number, dz = 0): void {
  for (const leaf of solidLeaves(p)) translateLeaf(leaf, dx, dy, dz)
  for (const n of edgeBlendNodes(p)) mapEdgePoints(n, (v) => add(v, dx, dy, dz))
  mapAllThreads(p, (v) => add(v, dx, dy, dz))
}

/** Escala un punto respecto de `c` por factor `f`. */
const sp = (v: Vec3, c: Vec3, f: number): Vec3 => [c[0] + (v[0] - c[0]) * f, c[1] + (v[1] - c[1]) * f, c[2] + (v[2] - c[2]) * f]

/** Escala (in-place) una hoja respecto del centro `c` por factor `f`. */
function scaleLeaf(leaf: SolidLeaf, c: Vec3, f: number): void {
  switch (leaf.op) {
    case 'EXTRUDE':
      leaf.profile = leaf.profile.map((v) => sp(v, c, f))
      leaf.height *= f
      break
    case 'BOX':
      leaf.origin = sp(leaf.origin, c, f)
      leaf.width *= f
      leaf.depth *= f
      leaf.height *= f
      break
    case 'CYLINDER':
      leaf.base = sp(leaf.base, c, f)
      leaf.radius *= f
      leaf.height *= f
      break
    case 'CONE':
      leaf.base = sp(leaf.base, c, f)
      leaf.radius *= f
      leaf.height *= f
      if (leaf.radiusTop != null) leaf.radiusTop *= f
      break
    case 'SPHERE':
      leaf.center = sp(leaf.center, c, f)
      leaf.radius *= f
      break
    case 'PRISM':
      leaf.center = sp(leaf.center, c, f)
      leaf.radius *= f
      leaf.height *= f
      break
    case 'REVOLVE':
      leaf.base = sp(leaf.base, c, f)
      leaf.profile = leaf.profile.map(([r, z]) => [r * f, z * f])
      break
    case 'TORUS':
      leaf.center = sp(leaf.center, c, f)
      leaf.radius *= f
      leaf.tube *= f
      break
    case 'SWEEP':
      leaf.path = leaf.path.map((v) => sp(v, c, f))
      leaf.profile = leaf.profile.map(([x, y]) => [x * f, y * f])
      break
    case 'LOFT':
      leaf.sections = leaf.sections.map((sec) => sec.map((v) => sp(v, c, f)))
      break
  }
}

/** Escala (in-place) un árbol de sólido respecto de `c` por factor `f` (incluye SHELL). */
export function scaleSolid(p: SolidProps, c: Vec3, f: number): void {
  mapAllThreads(p, (v) => sp(v, c, f))
  scaleTree(p, c, f)
}

function scaleTree(p: SolidProps, c: Vec3, f: number): void {
  if (p.op === 'SHELL') {
    scaleTree(p.solid, c, f)
    p.thickness *= f
    return
  }
  if (isEdgeBlend(p)) {
    scaleTree(p.solid, c, f)
    mapEdgePoints(p, (v) => sp(v, c, f))
    scaleEdgeBlend(p, f)
    return
  }
  for (const leaf of solidLeaves(p)) scaleLeaf(leaf, c, f)
}

/** Footprint XY (polígono) de una hoja, para bounds. */
function leafProfileXY(leaf: SolidLeaf): Vec3[] {
  switch (leaf.op) {
    case 'EXTRUDE':
      return leaf.profile
    case 'BOX':
      return boxCorners(leaf)[0]
    case 'CYLINDER': {
      const a = axisOf(leaf)
      const [u, v] = perpBasis(a)
      const top = vadd(leaf.base, vscale(a, leaf.height))
      return [...ringAround(leaf.base, u, v, leaf.radius, 16), ...ringAround(top, u, v, leaf.radius, 16)]
    }
    case 'CONE': {
      const a = axisOf(leaf)
      const [u, v] = perpBasis(a)
      return [...ringAround(leaf.base, u, v, leaf.radius, 16), vadd(leaf.base, vscale(a, leaf.height))]
    }
    case 'SPHERE':
      return circle(leaf.center[0], leaf.center[1], leaf.center[2], leaf.radius, 16)
    case 'PRISM':
      return ngon(leaf.center[0], leaf.center[1], leaf.center[2], leaf.radius, leaf.sides, leaf.rotation ?? 0)
    case 'REVOLVE':
      if (leaf.axis) return revolveWire(leaf).flat()
      return circle(leaf.base[0], leaf.base[1], leaf.base[2], maxProfileRadius(leaf.profile), 16)
    case 'TORUS': {
      const a = axisOf(leaf)
      const [u, v] = perpBasis(a)
      return ringAround(leaf.center, u, v, leaf.radius + leaf.tube, 16)
    }
    case 'SWEEP':
      return leaf.path.map((p) => [p[0], p[1], p[2]] as Vec3)
    case 'LOFT':
      return leaf.sections.flatMap((sec) => sec.map((v) => [v[0], v[1], v[2]] as Vec3))
  }
}

/** Perfiles XY de todas las hojas (bounds). */
export function solidProfiles(p: SolidProps): Vec3[][] {
  return solidLeaves(p).map(leafProfileXY)
}

/**
 * Vértices "endpoint" de una hoja (esquinas poligonales reales). Las primitivas curvas
 * (cilindro/cono/esfera) NO aportan endpoints: sus features son center/quadrant (ver
 * `solidCenters`/`solidQuadrants`), para no ensuciar el snap con puntos de facetado.
 */
function leafVertices(leaf: SolidLeaf): Vec3[] {
  switch (leaf.op) {
    case 'EXTRUDE': {
      const off = vscale(axisOf(leaf), leaf.height)
      const out: Vec3[] = []
      for (const i of extrudeCorners(leaf)) {
        out.push(leaf.profile[i])
        out.push(vadd(leaf.profile[i], off))
      }
      return out
    }
    case 'BOX': {
      const out: Vec3[] = boxCorners(leaf).flat()
      return out
    }
    case 'PRISM': {
      const [x, y, z] = leaf.center
      const bottom = ngon(x, y, z, leaf.radius, leaf.sides, leaf.rotation ?? 0)
      const top = bottom.map((v) => [v[0], v[1], v[2] + leaf.height] as Vec3)
      return [...bottom, ...top]
    }
    case 'REVOLVE': {
      // Esquinas del perfil en sus caras extremas (sólo perfiles poligonales, no círculos muestreados).
      const prof = openProfile(leaf.profile)
      if (!leaf.axis || isFullRevolve(leaf) || prof.length > 16) return []
      const f = revolveFrame(leaf)
      const th = revolveAngle(leaf)
      return [0, th].flatMap((phi) => prof.map(([r, h]) => revolvePoint(leaf.base, f, r, h, phi)))
    }
    case 'CYLINDER':
    case 'CONE':
    case 'SPHERE':
    case 'TORUS':
    case 'SWEEP':
    case 'LOFT':
      return []
  }
}

/** Puntos del perfil de `[i, j]` (`j` puede pasar del final: vuelve al principio). */
function profileRun(profile: Vec3[], [i, j]: [number, number]): Vec3[] {
  const n = profile.length
  return Array.from({ length: j - i + 1 }, (_, k) => profile[(i + k) % n])
}

/** Tramos curvos del perfil que siguen siendo arcos (un STRETCH que los deformó los vuelve polígono). */
function extrudeArcs(leaf: ExtrudeProps): Array<{ run: [number, number]; arc: ArcProps }> {
  const n = leaf.profile.length
  const out: Array<{ run: [number, number]; arc: ArcProps }> = []
  for (const run of leaf.arcs ?? []) {
    if (!(run[0] >= 0 && run[1] > run[0] + 1 && run[1] <= run[0] + n)) continue
    const arc = fitArc(profileRun(leaf.profile, run), false)
    if (arc) out.push({ run, arc })
  }
  return out
}

/** Índices del perfil que son esquinas reales (no puntos intermedios del teselado de un arco). */
function extrudeCorners(leaf: ExtrudeProps): number[] {
  const n = leaf.profile.length
  const inner = new Set<number>()
  for (const { run } of extrudeArcs(leaf)) for (let k = run[0] + 1; k < run[1]; k++) inner.add(k % n)
  return Array.from({ length: n }, (_, i) => i).filter((i) => !inner.has(i))
}

/**
 * Arista de un sólido para los object snaps: recta, arco o circunferencia (con su geometría exacta: CEN, QUA, MID,
 * TAN, PER) o curva genérica. `iso`: isolínea de una superficie curva (generatriz de un cilindro), sólo para NEA/INT.
 */
export interface SnapEdge {
  pts: Vec3[]
  closed: boolean
  arc?: ArcProps
  iso?: boolean
}

/**
 * Arco (o circunferencia, con barrido nulo) que pasa por los puntos de un teselado, o null si no lo son: todos a la
 * misma distancia de un centro, en un plano y con tramos cortos (un polígono regular no es un círculo).
 */
export function fitArc(pts: Vec3[], closed: boolean, exact: (v: Vec3) => Vec3 = (v) => exactish(v), loose = false): ArcProps | null {
  const ring = closed && pts.length > 1 && vdist(pts[0], pts[pts.length - 1]) < 1e-9 ? pts.slice(0, -1) : pts
  const n = ring.length
  if (n < (closed ? 6 : 3)) return null
  const g = vscale(ring.reduce(vadd, [0, 0, 0] as Vec3), 1 / n)
  let nrm: Vec3 = [0, 0, 0]
  if (closed) for (let i = 0; i < n; i++) nrm = vadd(nrm, vcross(vsub(ring[i], g), vsub(ring[(i + 1) % n], g)))
  else nrm = vcross(vsub(ring[0], ring[Math.floor(n / 2)]), vsub(ring[n - 1], ring[Math.floor(n / 2)]))
  if (Math.hypot(...nrm) < 1e-12) return null
  nrm = vnorm(nrm)
  // Centro por mínimos cuadrados en el plano (Kåsa): el facetado de un corte de esfera reparte mal los puntos.
  const { u, v } = arcBasis(nrm)
  let [sxx, sxy, syy, sx, sy, sxz, syz, sz] = [0, 0, 0, 0, 0, 0, 0, 0]
  for (const q of ring) {
    const d = vsub(q, g)
    const [x, y] = [vdot(d, u), vdot(d, v)]
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
  // [sxx sxy sx; sxy syy sy; sx sy n]·[2a 2b c] = [sxz syz sz]
  const det = sxx * (syy * n - sy * sy) - sxy * (sxy * n - sy * sx) + sx * (sxy * sy - syy * sx)
  if (Math.abs(det) < 1e-18) return null
  const A = (sxz * (syy * n - sy * sy) - sxy * (syz * n - sy * sz) + sx * (syz * sy - syy * sz)) / det
  const B = (sxx * (syz * n - sy * sz) - sxz * (sxy * n - sy * sx) + sx * (sxy * sz - syz * sx)) / det
  const c = exact(vadd(g, vadd(vscale(u, A / 2), vscale(v, B / 2))))
  const r = ring.reduce((t, q) => t + vdist(q, c), 0) / n
  if (!(r > 1e-9)) return null
  // Con `loose` (aristas de una malla CSG), 5 %: el corte de una esfera facetada no cae sobre el círculo teórico.
  const tol = Math.max(r * (loose ? 5e-2 : 1e-2), 1e-9)
  const segs = closed ? n : n - 1
  for (let i = 0; i < n; i++) {
    const q = ring[i]
    if (Math.abs(vdist(q, c) - r) > tol || Math.abs(vdot(vsub(q, c), nrm)) > tol) return null
    if (i < segs && vdist(q, ring[(i + 1) % n]) > r * 0.53) return null // más de ~30° por tramo: es un polígono
  }
  if (closed) return { center: c, radius: r, startAngle: 0, endAngle: 0, normal: nrm }
  // El sentido: del primer punto al último pasando por el del medio (antihorario alrededor de la normal).
  const ang = (q: Vec3): number => Math.atan2(vdot(vsub(q, c), v), vdot(vsub(q, c), u))
  const [a0, am, a1] = [ang(ring[0]), ang(ring[Math.floor(n / 2)]), ang(ring[n - 1])]
  const ccw = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  if (ccw(am - a0) > ccw(a1 - a0)) return { center: c, radius: r, startAngle: a1, endAngle: a0, normal: nrm }
  return { center: c, radius: r, startAngle: a0, endAngle: a1, normal: nrm }
}

/**
 * Un círculo de la malla de una booleana que cae sobre una esfera o un cilindro de las primitivas toma su geometría
 * exacta: el centro sobre el eje (o la proyección del centro de la esfera) y el radio teórico.
 */
function exactCircle(arc: ArcProps, p: SolidProps): ArcProps {
  const n = arc.normal ?? [0, 0, 1]
  for (const leaf of solidLeaves(p)) {
    let S: Vec3 | null = null
    let R = 0
    if (leaf.op === 'SPHERE') [S, R] = [leaf.center, leaf.radius]
    else if (leaf.op === 'CYLINDER' && Math.abs(vdot(axisOf(leaf), n)) > 1 - 1e-6) [S, R] = [leaf.base, leaf.radius]
    if (!S) continue
    const c = vsub(S, vscale(n, vdot(vsub(S, arc.center), n)))
    const r = leaf.op === 'SPHERE' ? Math.sqrt(Math.max(0, R * R - vdist(S, c) ** 2)) : R
    if (vdist(c, arc.center) <= arc.radius * 5e-2 && Math.abs(r - arc.radius) <= arc.radius * 5e-2) return { ...arc, center: c.map(cleanNumber) as Vec3, radius: r }
  }
  return arc
}

/** Aristas de una polilínea del wireframe: un arco si lo es; si no, cada tramo recto. */
function polyEdges(poly: Vec3[], iso = false): SnapEdge[] {
  if (poly.length < 2) return []
  const closed = poly.length > 3 && vdist(poly[0], poly[poly.length - 1]) < 1e-9
  const arc = fitArc(poly, closed)
  if (arc || iso) return [{ pts: poly, closed, ...(arc ? { arc } : {}), ...(iso ? { iso } : {}) }]
  return poly.slice(1).map((q, i) => ({ pts: [poly[i], q], closed: false }))
}

/** Aristas de una extrusión: los arcos del perfil siguen siendo arcos, abajo y arriba. */
function extrudeEdges(leaf: ExtrudeProps): SnapEdge[] {
  const P = leaf.profile
  const n = P.length
  if (n < 2) return []
  const off = vscale(axisOf(leaf), leaf.height)
  const arcs = new Map(extrudeArcs(leaf).map((a) => [a.run[0], a]))
  const corners = extrudeCorners(leaf)
  const out: SnapEdge[] = []
  for (const shift of [[0, 0, 0] as Vec3, off]) {
    const at = (v: Vec3): Vec3 => vadd(v, shift)
    for (let k = 0; k < corners.length; k++) {
      const i = corners[k]
      const a = arcs.get(i) ?? arcs.get(i + n)
      if (a) {
        const pts = profileRun(P, a.run).map(at)
        out.push({ pts, closed: false, arc: { ...a.arc, center: at(a.arc.center) } })
      } else out.push({ pts: [at(P[i]), at(P[corners[(k + 1) % corners.length]])], closed: false })
    }
  }
  for (const i of corners) out.push({ pts: [P[i], vadd(P[i], off)], closed: false })
  return out
}

function leafSnapEdges(leaf: SolidLeaf): SnapEdge[] {
  if (leaf.op === 'EXTRUDE') return extrudeEdges(leaf)
  const wire = leafWireframe(leaf)
  // Generatrices del cilindro/cono y recorrido del barrido: líneas de dibujo, no aristas.
  const iso = (poly: Vec3[]): boolean => ((leaf.op === 'CYLINDER' || leaf.op === 'CONE') && poly.length === 2) || leaf.op === 'SWEEP'
  return wire.flatMap((poly) => polyEdges(poly, iso(poly)))
}

/**
 * Las rectas de la malla de una booleana quedan cortadas donde tocaban las primitivas (dos cajas unidas: la arista de
 * arriba en x = 10, con tramos nulos). Se descartan los nulos y se unen las rectas alineadas que sólo se tocan entre sí.
 */
function joinCollinear(edges: SnapEdge[]): SnapEdge[] {
  const key = (v: Vec3) => v.map((x) => x.toFixed(6)).join(',')
  const tol = (a: Vec3, b: Vec3) => 1e-9 * (1 + Math.hypot(...a) + Math.hypot(...b))
  let list = edges.filter((e) => e.arc || e.closed || vdist(e.pts[0], e.pts[e.pts.length - 1]) > tol(e.pts[0], e.pts[e.pts.length - 1]))
  for (let changed = true; changed; ) {
    changed = false
    const at = new Map<string, number[]>()
    list.forEach((e, i) => {
      if (e.closed) return
      for (const v of [e.pts[0], e.pts[e.pts.length - 1]]) at.set(key(v), [...(at.get(key(v)) ?? []), i])
    })
    for (const [, ids] of at) {
      if (ids.length !== 2 || ids[0] === ids[1]) continue
      const [e, f] = ids.map((i) => list[i])
      if (e.arc || f.arc || e.pts.length !== 2 || f.pts.length !== 2) continue
      const shared = [e.pts[0], e.pts[1]].find((v) => f.pts.some((w) => key(w) === key(v)))!
      const a = e.pts.find((v) => key(v) !== key(shared)) ?? e.pts[0]
      const b = f.pts.find((v) => key(v) !== key(shared)) ?? f.pts[0]
      const d1 = vnorm(vsub(shared, a))
      const d2 = vnorm(vsub(b, shared))
      if (vdot(d1, d2) < 1 - 1e-9) continue
      list = [...list.filter((_, i) => i !== ids[0] && i !== ids[1]), { pts: [a, b], closed: false }]
      changed = true
      break
    }
  }
  return list
}

const edgeCache = new Map<string, SnapEdge[]>()

/** Aristas del sólido para los object snaps: las de la hoja o, en booleanas/empalmes, las del resultado. */
export function solidSnapEdges(p: SolidProps): SnapEdge[] {
  const key = JSON.stringify(p)
  const hit = edgeCache.get(key)
  if (hit) return hit
  let out: SnapEdge[]
  const shape = isLeaf(p) ? null : resultShape(p)
  if (isLeaf(p)) out = leafSnapEdges(p)
  else if (!shape) out = solidLeaves(p).flatMap(leafSnapEdges)
  else {
    out = joinCollinear(
      shape.edges.map((e) => {
        const fit = e.kind === 'line' ? null : fitArc(e.pts, e.closed, shape.exact, true)
        const arc = fit && exactCircle(fit, p)
        return { pts: e.closed ? [...e.pts, e.pts[0]] : e.pts, closed: e.closed, ...(arc ? { arc } : {}) }
      }),
    )
  }
  if (edgeCache.size > 50) edgeCache.clear()
  edgeCache.set(key, out)
  return out
}

/** Punto medio (por longitud) de una arista abierta. */
export function snapEdgeMidpoint(pts: Vec3[]): Vec3 {
  const lens = pts.slice(1).map((q, i) => vdist(pts[i], q))
  let half = lens.reduce((t, l) => t + l, 0) / 2
  for (let k = 0; k < lens.length; k++) {
    if (half <= lens[k] || k === lens.length - 1) return vadd(pts[k], vscale(vsub(pts[k + 1], pts[k]), lens[k] > 0 ? Math.min(1, half / lens[k]) : 0))
    half -= lens[k]
  }
  return pts[0]
}

/** Vértices del perfil más lejos/cerca del eje y más arriba/abajo: sus circunferencias son las del wireframe. */
function revolveExtremes(prof: Array<[number, number]>): number[] {
  const pick = (cmp: (a: [number, number], b: [number, number]) => boolean): number =>
    prof.reduce((best, p, i) => (cmp(p, prof[best]) ? i : best), 0)
  return [...new Set([pick((a, b) => a[0] > b[0]), pick((a, b) => a[0] < b[0]), pick((a, b) => a[1] > b[1]), pick((a, b) => a[1] < b[1])])]
}

/**
 * Wireframe de una revolución con eje: el perfil en los extremos (o 4 isolíneas si es una
 * vuelta completa, como `ISOLINES` = 4) y las circunferencias que trazan sus vértices extremos.
 */
function revolveWire(leaf: RevolveProps): Vec3[][] {
  const prof = openProfile(leaf.profile)
  if (prof.length < 2) return []
  const f = revolveFrame(leaf)
  const th = revolveAngle(leaf)
  const full = isFullRevolve(leaf)
  const at = (phi: number) => {
    const ring = prof.map(([r, h]) => revolvePoint(leaf.base, f, r, h, phi))
    return [...ring, ring[0]]
  }
  const polys: Vec3[][] = full ? [0, 1, 2, 3].map((k) => at((k * Math.PI) / 2)) : [at(0), at(th)]
  const n = Math.max(4, Math.ceil((WIRE_SEGMENTS * Math.abs(th)) / (Math.PI * 2)))
  for (const i of revolveExtremes(prof)) {
    const [r, h] = prof[i]
    if (r <= 1e-9) continue
    polys.push(Array.from({ length: n + 1 }, (_, k) => revolvePoint(leaf.base, f, r, h, (th * k) / n)))
  }
  return polys
}

/** Wireframe de un toro: aros exterior, interior, superior e inferior y 4 secciones del tubo. */
function torusWire(leaf: TorusProps): Vec3[][] {
  const a = axisOf(leaf)
  const [u, v] = perpBasis(a)
  const { center: c, radius: R, tube: t } = leaf
  const polys: Vec3[][] = [
    ringAround(c, u, v, R + t, WIRE_SEGMENTS, true),
    ringAround(c, u, v, Math.abs(R - t), WIRE_SEGMENTS, true),
    ringAround(vadd(c, vscale(a, t)), u, v, R, WIRE_SEGMENTS, true),
    ringAround(vadd(c, vscale(a, -t)), u, v, R, WIRE_SEGMENTS, true),
  ]
  for (const d of [u, v, vscale(u, -1), vscale(v, -1)]) polys.push(ringAround(vadd(c, vscale(d, R)), d, a, t, WIRE_SEGMENTS / 2, true))
  return polys
}

function quads(x: number, y: number, z: number, r: number): Vec3[] {
  return [
    [x + r, y, z],
    [x - r, y, z],
    [x, y + r, z],
    [x, y - r, z],
  ]
}

/** Vértices "endpoint" 3D del sólido (esquinas poligonales; sin puntos de facetado curvo). */
export function solidVertices(p: SolidProps): Vec3[] {
  if (isLeaf(p)) return leafVertices(p)
  // Booleanas, empalmes y chaflanes: los vértices del sólido resultante (sin la esquina que el chaflán quitó).
  const shape = resultShape(p)
  if (!shape) return solidLeaves(p).flatMap(leafVertices)
  const seen = new Set<string>()
  const out: Vec3[] = []
  for (const e of solidSnapEdges(p)) {
    if (e.closed) continue
    for (const v of [e.pts[0], e.pts[e.pts.length - 1]]) {
      const k = v.join(',')
      if (!seen.has(k)) {
        seen.add(k)
        out.push(v)
      }
    }
  }
  return out
}

/** Aristas del sólido como polilíneas para los snaps (nearest, intersection): las del resultado, no las de las primitivas. */
export function solidSnapWireframe(p: SolidProps): Vec3[][] {
  if (isLeaf(p)) return leafWireframe(p)
  const shape = resultShape(p)
  return shape ? shape.edges.map((e) => (e.closed ? [...e.pts, e.pts[0]] : e.pts)) : solidWireframe(p)
}

/** Centros de los arcos de las aristas del resultado (empalmes): para CEN tipeado, como el CAD clásico. */
export function solidArcCenters(p: SolidProps): Vec3[] {
  if (isLeaf(p)) return []
  const out: Vec3[] = []
  const shape = resultShape(p)
  for (const e of shape?.edges ?? []) {
    if (e.kind === 'line' || e.pts.length < 3) continue
    const c = circumcenter(e.pts[0], e.pts[Math.floor(e.pts.length / 2)], e.pts[e.pts.length - 1])
    if (!c) continue
    // Sólo arcos de circunferencia (todos los puntos a la misma distancia del centro).
    const r = Math.hypot(e.pts[0][0] - c[0], e.pts[0][1] - c[1], e.pts[0][2] - c[2])
    const chord = Math.hypot(e.pts[0][0] - e.pts[e.pts.length - 1][0], e.pts[0][1] - e.pts[e.pts.length - 1][1], e.pts[0][2] - e.pts[e.pts.length - 1][2])
    if (r > chord * 5) continue // casi recta: no es un arco de empalme
    if (e.pts.every((q) => Math.abs(Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]) - r) <= r * 2e-2)) out.push(shape!.exact(c))
  }
  return out
}

/**
 * Aristas del sólido resultante (topología derivada de la malla), con las coordenadas limpias: un vértice que coincide
 * con uno exacto de las primitivas toma ese valor; el resto se redondea dentro del error de float32.
 */
function resultShape(p: SolidProps): { edges: { pts: Vec3[]; closed: boolean; kind: string }[]; exact: (v: Vec3) => Vec3 } | null {
  const topo = solidTopology(p)
  if (!topo) return null
  const exact = exactPoints(p)
  // La malla (float32, CSG) deja los vértices de un empalme a centésimas del punto teórico: se toma el exacto.
  const tol = Math.max(topo.diag * 2e-3, 1e-9)
  const clean = (v: Vec3): Vec3 => {
    let best: Vec3 | null = null
    let bd = tol
    for (const x of exact) {
      const d = vdist(x, v)
      if (d <= bd) {
        bd = d
        best = x
      }
    }
    return best ?? (v.map(cleanMeshNumber) as Vec3)
  }
  return { edges: topo.edges.map((e) => ({ pts: e.pts.map(clean), closed: e.closed, kind: e.kind })), exact: clean }
}

/**
 * Puntos teóricos del sólido: vértices de las primitivas y, por cada arista recta empalmada o achaflanada, los
 * puntos donde el empalme/chaflán toca las caras y los centros del empalme en sus extremos. Se generan para los dos
 * sentidos posibles de cada cara (convexa o cóncava); los que no coinciden con un vértice del resultado no se usan.
 */
/** Sin el ruido de las cuentas (tan 45° = 0.9999999999999999). */
const exactish = (v: Vec3): Vec3 => v.map(cleanNumber) as Vec3

function exactPoints(p: SolidProps): Vec3[] {
  if (isLeaf(p)) return leafVertices(p)
  if (p.op === 'SHELL') return exactPoints(p.solid)
  if (!isEdgeBlend(p)) return p.operands.flatMap(exactPoints)
  const base = exactPoints(p.solid)
  const topo = solidTopology(p.solid)
  if (!topo) return base
  const out = [...base]
  const near = (v: Vec3): Vec3 => base.find((x) => vdist(x, v) <= topo.diag * 1e-6) ?? v
  for (const ref of p.edges) {
    const hit = nearestEdge(topo, ref.at, topo.diag * 0.05)
    const e = hit ? topo.edges[hit.edge] : null
    if (!e || e.kind !== 'line') continue
    const A = near(e.pts[0])
    const B = near(e.pts[e.pts.length - 1])
    const dir = vnorm(vsub(B, A))
    const [n1, n2] = [e.n1[0], e.n2[0]]
    const d1 = vnorm(vcross(dir, n1))
    const d2 = vnorm(vcross(dir, n2))
    const half = Math.acos(Math.max(-1, Math.min(1, vdot(n1, n2)))) / 2
    const [t1, t2] = p.op === 'FILLETEDGE' ? [p.radius * Math.tan(half), p.radius * Math.tan(half)] : [p.d1, p.d2]
    for (const E of [A, B]) {
      for (const s of [1, -1]) {
        for (const [d, n, t] of [[d1, n1, t1], [d2, n2, t2], [d1, n1, t2], [d2, n2, t1]] as [Vec3, Vec3, number][]) {
          const T = vadd(E, vscale(d, s * t))
          out.push(exactish(T))
          if (p.op === 'FILLETEDGE') out.push(exactish(vsub(T, vscale(n, p.radius))), exactish(vadd(T, vscale(n, p.radius))))
        }
      }
    }
  }
  return out
}

function circumcenter(a: Vec3, b: Vec3, c: Vec3): Vec3 | null {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
  const nn = n[0] * n[0] + n[1] * n[1] + n[2] * n[2]
  if (nn < 1e-18) return null
  const ab2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]
  const ac2 = ac[0] * ac[0] + ac[1] * ac[1] + ac[2] * ac[2]
  // c = a + ((|ab|² ac − |ac|² ab) × n) / (2|n|²)
  const t = [ab2 * ac[0] - ac2 * ab[0], ab2 * ac[1] - ac2 * ab[1], ab2 * ac[2] - ac2 * ab[2]]
  const x = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]]
  return [a[0] + x[0] / (2 * nn), a[1] + x[1] / (2 * nn), a[2] + x[2] / (2 * nn)]
}

/** Centros de las primitivas curvas (base/tapa del cilindro, base del cono, centro de esfera). */
export function solidCenters(p: SolidProps): Vec3[] {
  const out: Vec3[] = []
  for (const leaf of solidLeaves(p)) {
    if (leaf.op === 'CYLINDER') out.push(leaf.base, vadd(leaf.base, vscale(axisOf(leaf), leaf.height)))
    else if (leaf.op === 'CONE') {
      out.push(leaf.base)
      // Tronco de cono: la tapa superior también tiene centro.
      if ((leaf.radiusTop ?? 0) > 0) out.push(vadd(leaf.base, vscale(axisOf(leaf), leaf.height)))
    } else if (leaf.op === 'SPHERE' || leaf.op === 'TORUS') out.push(leaf.center)
    else if (leaf.op === 'REVOLVE' && leaf.axis) {
      // Centros de las circunferencias del wireframe (sobre el eje).
      const f = revolveFrame(leaf)
      const prof = openProfile(leaf.profile)
      for (const i of revolveExtremes(prof)) if (prof[i][0] > 1e-9) out.push(revolvePoint(leaf.base, f, 0, prof[i][1], 0))
    }
  }
  return out
}

/** Puntos de cuadrante de las primitivas curvas (base/tapa de cilindro, base de cono, esfera). */
export function solidQuadrants(p: SolidProps): Vec3[] {
  const out: Vec3[] = []
  for (const leaf of solidLeaves(p)) {
    if (leaf.op === 'CYLINDER') {
      const a = axisOf(leaf)
      const [u, v] = perpBasis(a)
      const top = vadd(leaf.base, vscale(a, leaf.height))
      out.push(...quadsAround(leaf.base, u, v, leaf.radius), ...quadsAround(top, u, v, leaf.radius))
    } else if (leaf.op === 'CONE') {
      const a = axisOf(leaf)
      const [u, v] = perpBasis(a)
      out.push(...quadsAround(leaf.base, u, v, leaf.radius))
      if ((leaf.radiusTop ?? 0) > 0) {
        out.push(...quadsAround(vadd(leaf.base, vscale(a, leaf.height)), u, v, leaf.radiusTop!))
      }
    } else if (leaf.op === 'SPHERE') {
      const [x, y, z] = leaf.center
      const r = leaf.radius
      out.push(...quads(x, y, z, r), [x, y, z + r], [x, y, z - r])
    } else if (leaf.op === 'TORUS') {
      const a = axisOf(leaf)
      const [u, v] = perpBasis(a)
      out.push(...quadsAround(leaf.center, u, v, leaf.radius + leaf.tube), ...quadsAround(leaf.center, u, v, Math.abs(leaf.radius - leaf.tube)))
    }
  }
  return out
}

const WIRE_SEGMENTS = 32

/** Wireframe 3D de una hoja para snap/selección/preview/PDF. */
function leafWireframe(leaf: SolidLeaf): Vec3[][] {
  switch (leaf.op) {
    case 'EXTRUDE': {
      const base = leaf.profile
      if (base.length === 0) return []
      const off = vscale(axisOf(leaf), leaf.height)
      const top = base.map((v) => vadd(v, off))
      const polys: Vec3[][] = [[...base, base[0]], [...top, top[0]]]
      for (const i of extrudeCorners(leaf)) polys.push([base[i], top[i]])
      return polys
    }
    case 'BOX': {
      const [b, t] = boxCorners(leaf)
      const polys: Vec3[][] = [[...b, b[0]], [...t, t[0]]]
      for (let i = 0; i < 4; i++) polys.push([b[i], t[i]])
      return polys
    }
    case 'CYLINDER': {
      const a = axisOf(leaf)
      const [u, v] = perpBasis(a)
      const top = vadd(leaf.base, vscale(a, leaf.height))
      const b = ringAround(leaf.base, u, v, leaf.radius, WIRE_SEGMENTS, true)
      const t = ringAround(top, u, v, leaf.radius, WIRE_SEGMENTS, true)
      const polys: Vec3[][] = [b, t]
      for (const q of quadsAround(leaf.base, u, v, leaf.radius)) polys.push([q, vadd(q, vscale(a, leaf.height))])
      return polys
    }
    case 'CONE': {
      const a = axisOf(leaf)
      const [u, v] = perpBasis(a)
      const rTop = leaf.radiusTop ?? 0
      const top = vadd(leaf.base, vscale(a, leaf.height))
      const polys: Vec3[][] = [ringAround(leaf.base, u, v, leaf.radius, WIRE_SEGMENTS, true)]
      if (rTop > 0) {
        // Tronco de cono: aro superior + generatrices entre cuadrantes.
        polys.push(ringAround(top, u, v, rTop, WIRE_SEGMENTS, true))
        const qb = quadsAround(leaf.base, u, v, leaf.radius)
        const qt = quadsAround(top, u, v, rTop)
        for (let i = 0; i < qb.length; i++) polys.push([qb[i], qt[i]])
      } else {
        for (const q of quadsAround(leaf.base, u, v, leaf.radius)) polys.push([q, top])
      }
      return polys
    }
    case 'SPHERE': {
      const [x, y, z] = leaf.center
      const r = leaf.radius
      const n = WIRE_SEGMENTS
      const xy = circle(x, y, z, r, n, true)
      const xz: Vec3[] = []
      const yz: Vec3[] = []
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2
        xz.push([x + r * Math.cos(a), y, z + r * Math.sin(a)])
        yz.push([x, y + r * Math.cos(a), z + r * Math.sin(a)])
      }
      return [xy, xz, yz]
    }
    case 'PRISM': {
      const [x, y, z] = leaf.center
      const b = ngon(x, y, z, leaf.radius, leaf.sides, leaf.rotation ?? 0)
      const t = b.map((v) => [v[0], v[1], v[2] + leaf.height] as Vec3)
      const polys: Vec3[][] = [[...b, b[0]], [...t, t[0]]]
      for (let i = 0; i < b.length; i++) polys.push([b[i], t[i]])
      return polys
    }
    case 'TORUS':
      return torusWire(leaf)
    case 'REVOLVE': {
      if (leaf.axis) return revolveWire(leaf)
      const [x, y, z] = leaf.base
      const r = maxProfileRadius(leaf.profile)
      let zmin = Infinity
      let zmax = -Infinity
      for (const [, pz] of leaf.profile) {
        zmin = Math.min(zmin, pz)
        zmax = Math.max(zmax, pz)
      }
      if (!isFinite(zmin)) return []
      return [circle(x, y, z + zmin, r, WIRE_SEGMENTS, true), circle(x, y, z + zmax, r, WIRE_SEGMENTS, true)]
    }
    case 'SWEEP':
      // La polilínea del path 3D.
      return leaf.path.length > 0 ? [leaf.path.map((p) => [p[0], p[1], p[2]] as Vec3)] : []
    case 'LOFT':
      // Cada sección como polilínea cerrada.
      return leaf.sections
        .filter((sec) => sec.length > 0)
        .map((sec) => [...sec.map((v) => [v[0], v[1], v[2]] as Vec3), [sec[0][0], sec[0][1], sec[0][2]] as Vec3])
  }
}

/** Wireframe 3D del sólido (unión de las hojas). */
export function solidWireframe(p: SolidProps): Vec3[][] {
  return solidLeaves(p).flatMap(leafWireframe)
}

/** Esquinas de la base y de la tapa de una caja, con sus ejes si los tiene. */
export function boxCorners(b: BoxProps): [Vec3[], Vec3[]] {
  const x = b.basis?.x ?? [1, 0, 0]
  const y = b.basis?.y ?? [0, 1, 0]
  const z: Vec3 = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]
  const at = (i: number, j: number, k: number): Vec3 =>
    [0, 1, 2].map((c) => b.origin[c] + i * b.width * x[c] + j * b.depth * y[c] + k * b.height * z[c]) as Vec3
  return [
    [at(0, 0, 0), at(1, 0, 0), at(1, 1, 0), at(0, 1, 0)],
    [at(0, 0, 1), at(1, 0, 1), at(1, 1, 1), at(0, 1, 1)],
  ]
}

/**
 * X del perfil de un barrido al inicio del recorrido, tal como la elige el barrido sin `ref` (la normal de
 * Frenet de three.js: perpendicular a la tangente, desde el eje del mundo en que la tangente es menor). Sirve
 * para fijarla antes de rotar o reflejar un barrido viejo.
 */
export function sweepStartRef(p: { path: Vec3[]; ref?: Vec3 }): Vec3 {
  if (p.ref) return p.ref
  const [a, b] = p.path
  if (!a || !b) return [1, 0, 0]
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const L = Math.hypot(d[0], d[1], d[2]) || 1
  const t: Vec3 = [d[0] / L, d[1] / L, d[2] / L]
  const ax = [Math.abs(t[0]), Math.abs(t[1]), Math.abs(t[2])]
  let i = 0
  let min = Number.MAX_VALUE
  for (let k = 0; k < 3; k++) if (ax[k] <= min) [min, i] = [ax[k], k]
  const e: Vec3 = [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0]
  const cr = (u: Vec3, v: Vec3): Vec3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  const v = cr(t, e)
  const lv = Math.hypot(v[0], v[1], v[2]) || 1
  return cr(t, [v[0] / lv, v[1] / lv, v[2] / lv])
}
