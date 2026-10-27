import * as THREE from 'three'
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg'
import type { Vec3 } from '../core/math'
import type { EdgeBlendProps, MeshProps, RevolveProps, SolidBasis, SolidProps } from '../core/document/types'
import { revolveMesh } from '../core/editing/revolve'
import { registerSolidMesher, solidTopology } from '../core/editing/topology'
import { blendTools } from '../core/editing/edgeBlend'
import { dropStrayTriangles, type BoolOp } from './csgClean'

/** Segmentos de una primitiva curva, acotados (un `.cota` o la IA pueden traer valores absurdos). */
export const MAX_SEGMENTS = 512
// Sin valor (`undefined`) queda el predeterminado de three.js.
const seg = (n: number): number =>
  n === undefined ? n : Number.isFinite(n) ? Math.min(MAX_SEGMENTS, Math.max(3, Math.round(n))) : 32

const evaluator = new Evaluator()
evaluator.attributes = ['position', 'uv', 'normal', 'surf']

/**
 * Superficie de origen de cada vértice (`surf`): cada cara de una primitiva y cada empalme/chaflán tiene su id y la
 * CSG lo conserva. La topología separa por él las caras suaves, así aparecen las aristas tangentes (cara plana ↔
 * empalme) como en el CAD clásico, sin mostrar el facetado de las paredes curvas.
 */
let nextSurf = 1
function tagSurfaces(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (g.getAttribute('surf')) return g
  const count = g.getAttribute('position')?.count ?? 0
  const index = g.getIndex()
  const arr = new Float32Array(count)
  const groups = g.groups.length ? g.groups : [{ start: 0, count: index ? index.count : count }]
  const base = nextSurf
  groups.forEach((gr, k) => {
    for (let i = gr.start; i < Math.min(gr.start + gr.count, index ? index.count : count); i++) arr[index ? index.getX(i) : i] = base + k
  })
  nextSurf = base + groups.length
  g.setAttribute('surf', new THREE.Float32BufferAttribute(arr, 1))
  return g
}
const cache = new Map<string, THREE.BufferGeometry>()

/** three-bvh-csg exige que TODOS los operandos tengan el MISMO set de atributos (position/normal/uv).
 *  Las primitivas de Three traen los tres; las geometrías custom (LOFT) no traen `uv`. Normalizamos
 *  cada geometría antes de la CSG: garantizamos `normal` y agregamos `uv` (relleno) si falta. */
function prepareForCsg(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  tagSurfaces(geom)
  if (!geom.getAttribute('normal')) geom.computeVertexNormals()
  if (!geom.getAttribute('uv')) {
    const count = geom.getAttribute('position')?.count ?? 0
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2))
  }
  return geom
}

/** Crea un Brush a partir de una geometría normalizada para CSG. */
function csgBrush(geom: THREE.BufferGeometry): Brush {
  const b = new Brush(prepareForCsg(geom))
  b.updateMatrixWorld()
  return b
}

/** `a op b` con three-bvh-csg, sin las astillas que la librería clasifica mal (ver `csgClean`). */
function booleanOp(a: Brush, b: Brush, op: BoolOp, checkB = true): Brush {
  const next = evaluator.evaluate(a, b, op === 'union' ? ADDITION : op === 'subtract' ? SUBTRACTION : INTERSECTION)
  next.updateMatrixWorld()
  const clean = dropStrayTriangles(next.geometry, a.geometry, b.geometry, op, checkB)
  return clean === next.geometry ? next : csgBrush(clean)
}

function extrudeGeometry(profile: Vec3[], height: number, axis?: Vec3): THREE.BufferGeometry {
  const origin = profile[0] ?? [0, 0, 0]
  const a = new THREE.Vector3(axis?.[0] ?? 0, axis?.[1] ?? 0, axis?.[2] ?? 1)
  if (a.lengthSq() < 1e-9) a.set(0, 0, 1)
  a.normalize()
  // Base ortonormal (u,v) del plano del perfil; el shape se arma en esas coords 2D y se extruye en +Z local.
  const ref = Math.abs(a.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)
  const u = new THREE.Vector3().crossVectors(ref, a).normalize()
  const v = new THREE.Vector3().crossVectors(a, u)
  const o = new THREE.Vector3(origin[0], origin[1], origin[2])
  const shape = new THREE.Shape(
    profile.map((pt) => {
      const d = new THREE.Vector3(pt[0], pt[1], pt[2]).sub(o)
      return new THREE.Vector2(d.dot(u), d.dot(v))
    }),
  )
  const geom = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
  // Lleva las coords locales (u,v,+Z) al mundo: X→u, Y→v, Z→axis, trasladado al origen del perfil.
  const m = new THREE.Matrix4().makeBasis(u, v, a).setPosition(o)
  geom.applyMatrix4(m)
  return geom
}

/** N-gono regular como Shape en XY (centrado en el origen), con rotación en radianes. */
function polygonShape(radius: number, sides: number, rotation: number): THREE.Shape {
  const n = Math.max(3, Math.floor(sides))
  const pts: THREE.Vector2[] = []
  for (let i = 0; i < n; i++) {
    const a = rotation + (i / n) * Math.PI * 2
    pts.push(new THREE.Vector2(radius * Math.cos(a), radius * Math.sin(a)))
  }
  return new THREE.Shape(pts)
}

function prismGeometry(props: {
  center: Vec3
  radius: number
  sides: number
  height: number
  rotation?: number
  basis?: SolidBasis
}): THREE.BufferGeometry {
  const shape = polygonShape(props.radius, props.sides, props.rotation ?? 0)
  const geom = new THREE.ExtrudeGeometry(shape, { depth: props.height, bevelEnabled: false })
  if (props.basis) return placeInBasis(geom, props.center, props.basis)
  geom.translate(props.center[0], props.center[1], props.center[2])
  return geom
}

/** Lleva una geometría local (ejes del mundo) a los ejes `basis` con origen `origin`. */
function placeInBasis(g: THREE.BufferGeometry, origin: Vec3, basis: SolidBasis): THREE.BufferGeometry {
  const x = new THREE.Vector3(...basis.x).normalize()
  const y = new THREE.Vector3(...basis.y).normalize()
  const z = new THREE.Vector3().crossVectors(x, y).normalize()
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z).setPosition(origin[0], origin[1], origin[2]))
  return g
}

function revolveGeometry(props: RevolveProps): THREE.BufferGeometry {
  if (props.axis && props.ref) {
    // REVOLVE con eje: malla propia con tapas y caras hacia afuera.
    const { positions, indices } = revolveMesh(props)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setIndex(indices)
    g.computeVertexNormals()
    return g
  }
  const points = props.profile.map(([r, z]) => new THREE.Vector2(r, z))
  const geom = new THREE.LatheGeometry(points, seg(props.segments), 0, props.angle ?? Math.PI * 2)
  // LatheGeometry revoluciona alrededor de Y (altura en Y); llevamos la altura a +Z.
  geom.rotateX(Math.PI / 2)
  geom.translate(props.base[0], props.base[1], props.base[2])
  return geom
}

function sweepGeometry(props: {
  profile: Array<[number, number]>
  path: Vec3[]
  steps?: number
  ref?: Vec3
  mirror?: boolean
}): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(props.path.map((p) => new THREE.Vector3(p[0], p[1], p[2])))
  const steps = props.steps ?? Math.max(16, props.path.length * 4)
  let profile = props.mirror ? props.profile.map(([x, y]): [number, number] => [x, -y]) : props.profile
  if (props.ref) {
    // Con `ref`: los marcos de three.js giran alrededor de la tangente; girar el perfil el ángulo
    // entre su normal inicial y `ref` equivale a barrer con la X del perfil en `ref`.
    const f = curve.computeFrenetFrames(steps, false)
    const r = new THREE.Vector3(props.ref[0], props.ref[1], props.ref[2])
    const phi = Math.atan2(r.dot(f.binormals[0]), r.dot(f.normals[0]))
    const [c, s] = [Math.cos(phi), Math.sin(phi)]
    profile = profile.map(([x, y]): [number, number] => [x * c - y * s, x * s + y * c])
  }
  const shape = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y)))
  return new THREE.ExtrudeGeometry(shape, { extrudePath: curve, steps, bevelEnabled: false })
}

/** Loft custom: une secciones (anillos) con caras laterales + tapas (fan). */
function loftGeometry(sections: Vec3[][]): THREE.BufferGeometry {
  if (sections.length < 2) return new THREE.BufferGeometry()
  const n = Math.min(...sections.map((s) => s.length))
  if (n < 3) return new THREE.BufferGeometry()

  const positions: number[] = []
  // Índice base de cada sección: usamos los primeros n vértices de cada anillo.
  for (const sec of sections) {
    for (let j = 0; j < n; j++) positions.push(sec[j][0], sec[j][1], sec[j][2])
  }
  const indices: number[] = []
  // Caras laterales entre secciones consecutivas.
  for (let i = 0; i < sections.length - 1; i++) {
    const a = i * n
    const b = (i + 1) * n
    for (let j = 0; j < n; j++) {
      const jn = (j + 1) % n
      // 2 triángulos por segmento del anillo.
      indices.push(a + j, b + j, b + jn)
      indices.push(a + j, b + jn, a + jn)
    }
  }
  // Tapa inicial (fan) — orientada hacia afuera (-, invertida respecto de la final).
  const first = 0
  for (let j = 1; j < n - 1; j++) indices.push(first, first + j + 1, first + j)
  // Tapa final (fan).
  const last = (sections.length - 1) * n
  for (let j = 1; j < n - 1; j++) indices.push(last, last + j, last + j + 1)

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setIndex(indices)
  geom.computeVertexNormals()
  return geom
}

/** Orienta una geometría con eje en +Y (Cylinder/Cone de Three, centrada en el origen) a lo largo de
 *  `axis` (por defecto +Z) desde `base`, extendiéndose `height`. */
function orientAlongAxis(geom: THREE.BufferGeometry, base: Vec3, height: number, axis?: Vec3): THREE.BufferGeometry {
  const a = new THREE.Vector3(axis?.[0] ?? 0, axis?.[1] ?? 0, axis?.[2] ?? 1)
  if (a.lengthSq() < 1e-9) a.set(0, 0, 1)
  a.normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), a)
  geom.applyQuaternion(q)
  geom.translate(base[0] + (a.x * height) / 2, base[1] + (a.y * height) / 2, base[2] + (a.z * height) / 2)
  return geom
}

/**
 * Medidas negativas (altura de CYLINDER/CONE/EXTRUDE, lados de BOX): en el CAD clásico sólo invierten el sentido.
 * Three las convierte en geometría dada vuelta (caras hacia adentro) y la CSG con ella da basura: se
 * normalizan a medidas positivas con el eje o el ancla invertidos.
 */
function positiveLeaf(p: SolidProps): SolidProps {
  switch (p.op) {
    case 'CYLINDER':
    case 'CONE':
    case 'EXTRUDE': {
      if (!(p.height < 0)) return p
      const a = p.axis ?? [0, 0, 1]
      return { ...p, height: -p.height, axis: [-a[0], -a[1], -a[2]] }
    }
    case 'BOX': {
      if (p.width >= 0 && p.depth >= 0 && p.height >= 0) return p
      const x = p.basis?.x ?? [1, 0, 0]
      const y = p.basis?.y ?? [0, 1, 0]
      const z: Vec3 = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]
      const o: Vec3 = [...p.origin]
      for (const [len, d] of [[p.width, x], [p.depth, y], [p.height, z]] as const) if (len < 0) for (let i = 0; i < 3; i++) o[i] += len * d[i]
      return { ...p, origin: o, width: Math.abs(p.width), depth: Math.abs(p.depth), height: Math.abs(p.height) }
    }
    default:
      return p
  }
}

function leafGeometry(raw: SolidProps): THREE.BufferGeometry | null {
  const props = positiveLeaf(raw)
  switch (props.op) {
    case 'EXTRUDE':
      return extrudeGeometry(props.profile, props.height, props.axis)
    case 'BOX': {
      const g = new THREE.BoxGeometry(props.width, props.depth, props.height)
      if (!props.basis) {
        g.translate(props.origin[0] + props.width / 2, props.origin[1] + props.depth / 2, props.origin[2] + props.height / 2)
        return g
      }
      // Alineada a la UCS: la caja local [0,w]×[0,d]×[0,h] en los ejes de `basis`.
      g.translate(props.width / 2, props.depth / 2, props.height / 2)
      return placeInBasis(g, props.origin, props.basis)
    }
    case 'CYLINDER': {
      const g = new THREE.CylinderGeometry(props.radius, props.radius, props.height, seg(props.segments))
      return orientAlongAxis(g, props.base, props.height, props.axis)
    }
    case 'CONE': {
      // radiusTop>0 → tronco de cono (frustum); 0 → cono completo. CylinderGeometry(top, bottom, h).
      const rTop = props.radiusTop ?? 0
      const g = new THREE.CylinderGeometry(rTop, props.radius, props.height, seg(props.segments))
      return orientAlongAxis(g, props.base, props.height, props.axis)
    }
    case 'SPHERE': {
      const g = new THREE.SphereGeometry(props.radius, seg(props.segments), Math.max(8, Math.round(seg(props.segments) / 2)))
      g.translate(props.center[0], props.center[1], props.center[2])
      return g
    }
    case 'PRISM':
      return prismGeometry(props)
    case 'REVOLVE':
      return revolveGeometry(props)
    case 'TORUS': {
      // TorusGeometry yace en XY con eje Z: se orienta al eje del toro.
      const g = new THREE.TorusGeometry(props.radius, props.tube, Math.max(8, Math.round(seg(props.segments) / 2)), Math.max(8, seg(props.segments)))
      const a = new THREE.Vector3(...(props.axis ?? [0, 0, 1])).normalize()
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), a))
      g.translate(props.center[0], props.center[1], props.center[2])
      return g
    }
    case 'SWEEP':
      return sweepGeometry(props)
    case 'LOFT':
      return loftGeometry(props.sections)
    default:
      return null
  }
}

/**
 * FILLETEDGE/CHAMFEREDGE: se resuelven las aristas sobre la topología del sólido hijo y se
 * restan los cortadores (aristas convexas) y luego se suman los rellenos (cóncavas).
 */
function blendGeometry(props: EdgeBlendProps): THREE.BufferGeometry {
  const child = solidGeometry(props.solid)
  const topo = solidTopology(props.solid)
  if (!topo) return child.clone()
  const { tools } = blendTools(topo, props)
  let acc = csgBrush(child.clone())
  const soupBrush = (soup: number[]): Brush => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(soup, 3))
    g.setAttribute('surf', new THREE.Float32BufferAttribute(new Float32Array(soup.length / 3).fill(nextSurf++), 1))
    g.computeVertexNormals()
    return csgBrush(g)
  }
  for (const tool of [...tools.filter((t) => !t.add), ...tools.filter((t) => t.add)]) {
    try {
      // El cortador es una sopa de triángulos: sólo se confía en la clasificación contra el sólido.
      acc = booleanOp(acc, soupBrush(tool.soup), tool.add ? 'union' : 'subtract', false)
    } catch (err) {
      console.warn('Cota: edge fillet/chamfer failed in CSG; that edge is skipped.', err)
    }
  }
  return acc.geometry
}

function evalTree(props: SolidProps): THREE.BufferGeometry {
  const leaf = leafGeometry(props)
  if (leaf) return tagSurfaces(leaf)
  if (props.op === 'FILLETEDGE' || props.op === 'CHAMFEREDGE') return blendGeometry(props)
  if (props.op === 'SHELL') {
    const outer = evalTree(props.solid)
    outer.computeBoundingBox()
    const box = outer.boundingBox
    if (!box) return outer
    const c = new THREE.Vector3()
    box.getCenter(c)
    const dim = new THREE.Vector3()
    box.getSize(dim)
    const t = props.thickness
    const f = (d: number): number => (d > 0 ? Math.max(0.01, (d - 2 * t) / d) : 1)
    // Copia interior escalada respecto del centroide (pared ≈ thickness).
    const inner = outer.clone()
    inner.translate(-c.x, -c.y, -c.z)
    inner.scale(f(dim.x), f(dim.y), f(dim.z))
    inner.translate(c.x, c.y, c.z)
    try {
      return booleanOp(csgBrush(outer), csgBrush(inner), 'subtract').geometry
    } catch (err) {
      // Geometría degenerada/no-manifold: en vez de romper el render, devolvemos el sólido lleno.
      console.warn('Cota: SHELL failed in CSG; the solid is used without hollowing.', err)
      return outer
    }
  }
  if (props.op !== 'UNION' && props.op !== 'SUBTRACT' && props.op !== 'INTERSECT') {
    return new THREE.BufferGeometry()
  }
  const operands = Array.isArray(props.operands) ? props.operands : []
  if (operands.length === 0) return new THREE.BufferGeometry()
  const op: BoolOp = props.op === 'UNION' ? 'union' : props.op === 'SUBTRACT' ? 'subtract' : 'intersect'
  let acc = csgBrush(evalTree(operands[0]))
  for (let i = 1; i < operands.length; i++) {
    try {
      acc = booleanOp(acc, csgBrush(evalTree(operands[i])), op)
    } catch (err) {
      // Un operando degenerado no debe romper todo: se omite y se conserva lo acumulado.
      console.warn('Cota: boolean operation failed; one operand is skipped.', err)
    }
  }
  return acc.geometry
}

/**
 * Evalúa el árbol de un sólido a una geometría (three-bvh-csg), con cache por
 * contenido del árbol para no recomputar en cada rebuild. La geometría devuelta
 * es compartida: NO debe liberarse mientras esté en cache.
 */
/** True si TODAS las posiciones de la geometría son finitas (sin NaN/Inf). */
function hasFinitePositions(g: THREE.BufferGeometry): boolean {
  const pos = g.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pos) return true
  const arr = pos.array
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) return false
  }
  return true
}

export function solidGeometry(props: SolidProps): THREE.BufferGeometry {
  const key = JSON.stringify(props)
  const hit = cache.get(key)
  if (hit) return hit
  let geom: THREE.BufferGeometry
  try {
    geom = evalTree(props)
    // Una CSG sobre geometría degenerada puede producir posiciones NaN/Inf: eso ensuciaría los
    // bounds (zoomExtents) y el render. Si aparece, se descarta la geometría de ese sólido.
    if (!hasFinitePositions(geom)) {
      console.warn('Cota: a solid produced non-finite geometry (NaN); it is skipped.')
      geom = new THREE.BufferGeometry()
    }
  } catch (err) {
    // Red de seguridad final: un sólido malformado nunca debe romper el render.
    console.warn('Cota: a solid could not be evaluated; its geometry is skipped.', err)
    geom = new THREE.BufferGeometry()
  }
  if (cache.size > 200) cache.clear()
  cache.set(key, geom)
  return geom
}

const LEAF_OPS = new Set(['BOX', 'CYLINDER', 'CONE', 'SPHERE', 'EXTRUDE', 'REVOLVE', 'TORUS'])
const edgeCache = new Map<string, Float32Array>()

/**
 * Aristas visibles de un sólido (pares de puntos para `LineSegments`), como las muestra el CAD clásico: sólo
 * las aristas vivas. En las primitivas alcanza con `EdgesGeometry`; en el resultado de una booleana la
 * malla trae uniones en T (aristas sin pareja) que `EdgesGeometry` dibuja como bordes y muestra la
 * triangulación: ahí se usan las aristas de la topología, que las empareja.
 */
export function solidEdgePositions(props: SolidProps): Float32Array {
  const key = JSON.stringify(props)
  const hit = edgeCache.get(key)
  if (hit) return hit
  let out: Float32Array
  const topo = LEAF_OPS.has(props.op) ? null : solidTopology(props)
  if (topo) {
    const pos: number[] = []
    for (const e of topo.edges) {
      const n = e.pts.length
      for (let i = 0; i + 1 < n + (e.closed ? 1 : 0); i++) {
        const a = e.pts[i]
        const b = e.pts[(i + 1) % n]
        pos.push(a[0], a[1], a[2], b[0], b[1], b[2])
      }
    }
    out = new Float32Array(pos)
  } else {
    const eg = new THREE.EdgesGeometry(solidGeometry(props), 30) // 30°: oculta el facetado de paredes curvas
    out = Float32Array.from(eg.getAttribute('position').array as ArrayLike<number>)
    eg.dispose()
  }
  if (edgeCache.size > 200) edgeCache.clear()
  edgeCache.set(key, out)
  return out
}

/** Evalúa un sólido a malla de triángulos (vértices + caras) para exportar a OBJ. */
export function solidMesh(props: SolidProps): MeshProps {
  const { vertices, faces } = solidMeshWithSurfaces(props)
  return { vertices, faces }
}

/** Como `solidMesh`, más la superficie de origen de cada cara (para separar las aristas tangentes). */
export function solidMeshWithSurfaces(props: SolidProps): MeshProps & { surf?: Float32Array | null } {
  const g = solidGeometry(props)
  const pos = g.getAttribute('position')
  if (!pos) return { vertices: [], faces: [], surf: null }
  const vertices: Vec3[] = []
  for (let i = 0; i < pos.count; i++) vertices.push([pos.getX(i), pos.getY(i), pos.getZ(i)])
  const faces: number[][] = []
  const index = g.getIndex()
  if (index) {
    for (let i = 0; i + 2 < index.count; i += 3) faces.push([index.getX(i), index.getX(i + 1), index.getX(i + 2)])
  } else {
    for (let i = 0; i + 2 < pos.count; i += 3) faces.push([i, i + 1, i + 2])
  }
  return { vertices, faces, surf: triangleSurfaces(g) }
}

/** Sopa de triángulos (9 números por triángulo) de una geometría, indexada o no. */
export function triangleSoup(g: THREE.BufferGeometry): Float32Array {
  const pos = g.getAttribute('position')
  if (!pos) return new Float32Array(0)
  const index = g.getIndex()
  const count = index ? index.count : pos.count
  const out = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const v = index ? index.getX(i) : i
    out[i * 3] = pos.getX(v)
    out[i * 3 + 1] = pos.getY(v)
    out[i * 3 + 2] = pos.getZ(v)
  }
  return out
}

// La topología de aristas (core) se deriva de la malla evaluada acá.
/** Superficie de origen de cada triángulo (ver `tagSurfaces`), o null si la geometría no la trae. */
function triangleSurfaces(g: THREE.BufferGeometry): Float32Array | null {
  const surf = g.getAttribute('surf')
  if (!surf) return null
  const index = g.getIndex()
  const n = Math.floor((index ? index.count : surf.count) / 3)
  const out = new Float32Array(n)
  for (let t = 0; t < n; t++) out[t] = surf.getX(index ? index.getX(t * 3) : t * 3)
  return out
}

registerSolidMesher((p) => {
  const g = solidGeometry(p)
  return { positions: triangleSoup(g), surf: triangleSurfaces(g) }
})
