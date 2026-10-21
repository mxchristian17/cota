import type { Vec3 } from '../math'
import type { BoxProps, EdgeBlendProps, RevolveProps, SolidLeaf, SolidProps, TorusProps } from '../document/types'
import { isFullRevolve, openProfile, revolveAngle, revolveFrame, revolvePoint } from './revolve'

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
  if (p.op === 'SHELL') {
    scaleSolid(p.solid, c, f)
    p.thickness *= f
    return
  }
  if (isEdgeBlend(p)) {
    scaleSolid(p.solid, c, f)
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
      for (const v of leaf.profile) {
        out.push(v)
        out.push(vadd(v, off))
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
  return solidLeaves(p).flatMap(leafVertices)
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
      for (let i = 0; i < base.length; i++) polys.push([base[i], top[i]])
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
