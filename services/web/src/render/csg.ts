import * as THREE from 'three'
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg'
import type { Vec3 } from '../core/math'
import type { EdgeBlendProps, MeshProps, RevolveProps, SolidBasis, SolidProps } from '../core/document/types'
import { revolveMesh } from '../core/editing/revolve'
import { sweepStartRef } from '../core/editing/solid'
import { registerSolidMesher, solidTopology } from '../core/editing/topology'
import { blendTools } from '../core/editing/edgeBlend'
import { dropStrayTriangles, type BoolOp } from './csgClean'
import { closeTJunctions } from './tjunctions'

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
/**
 * Sin triángulos de área nula: three-bvh-csg clasifica lanzando rayos contra los operandos y, en un triángulo
 * degenerado, la interpolación de la normal del impacto es null y la operación entera falla (el operando se perdía).
 */
function withoutSlivers(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geom.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pos) return geom
  const idx = geom.getIndex()
  const n = (idx ? idx.count : pos.count) / 3
  geom.computeBoundingBox()
  const size = geom.boundingBox ? geom.boundingBox.getSize(new THREE.Vector3()).length() : 0
  const min = (size * 1e-9) ** 2
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const keep: number[] = []
  for (let t = 0; t < n; t++) {
    const at = (k: number) => (idx ? idx.getX(3 * t + k) : 3 * t + k)
    a.fromBufferAttribute(pos, at(0))
    b.fromBufferAttribute(pos, at(1))
    c.fromBufferAttribute(pos, at(2))
    // Relativo a sus lados: una aguja muy larga y finita también anula el denominador baricéntrico de three.js
    // (cancelación), aunque su área no sea cero.
    const u = b.sub(a)
    const v = c.sub(a)
    const uu = u.lengthSq()
    const vv = v.lengthSq()
    const cr = u.clone().cross(v).lengthSq()
    if (cr > min && cr > 1e-10 * uu * vv) keep.push(t)
  }
  if (keep.length === n) return geom
  const src = idx ? geom.toNonIndexed() : geom
  const out = new THREE.BufferGeometry()
  for (const [name, attr] of Object.entries(src.attributes)) {
    const at = attr as THREE.BufferAttribute
    const arr = new Float32Array(keep.length * 3 * at.itemSize)
    keep.forEach((t, i) => {
      for (let k = 0; k < 3 * at.itemSize; k++) arr[i * 3 * at.itemSize + k] = at.array[t * 3 * at.itemSize + k]
    })
    out.setAttribute(name, new THREE.BufferAttribute(arr, at.itemSize))
  }
  return out
}

function prepareForCsg(raw: THREE.BufferGeometry): THREE.BufferGeometry {
  const geom = withoutSlivers(raw)
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

/**
 * Caras coplanares entre operandos (un agujero de la altura justa de la placa, una pieza apoyada sobre otra): la CSG
 * las parte en miles de astillas y tarda segundos por operación. Se agranda apenas B (`ε`, una cienmilésima del
 * tamaño) en las caras que coinciden con un plano de A: en la resta, las de igual sentido (el agujero asoma de la
 * placa); en la unión, las de sentido opuesto (la pieza apoyada penetra en la otra). El resultado no cambia: sus
 * vértices nacen de cortar B con los planos de A. Devuelve B (una copia si hubo que mover algo).
 */
export const csgNudgeOptions = { enabled: true }

export function nudgeCoplanar(a: THREE.BufferGeometry, b: THREE.BufferGeometry, op: BoolOp): THREE.BufferGeometry {
  if (op === 'intersect' || !csgNudgeOptions.enabled) return b
  const pa = a.getAttribute('position') as THREE.BufferAttribute | undefined
  const pb = b.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pa || !pb) return b
  const box = new THREE.Box3().setFromBufferAttribute(pa).union(new THREE.Box3().setFromBufferAttribute(pb))
  const size = box.getSize(new THREE.Vector3()).length()
  if (!(size > 0)) return b
  const tol = size * 1e-7
  const eps = size * 1e-5
  const ia = a.getIndex()
  const ib = b.getIndex()
  const q = (v: number) => Math.round(v * 1e4)
  const key = (n: THREE.Vector3, d: number) => `${q(n.x)},${q(n.y)},${q(n.z)},${Math.round(d / tol)}`
  const v0 = new THREE.Vector3()
  const v1 = new THREE.Vector3()
  const v2 = new THREE.Vector3()
  const n = new THREE.Vector3()
  const plane = (pos: THREE.BufferAttribute, idx: THREE.BufferAttribute | null, t: number): number | null => {
    const at = (k: number) => (idx ? idx.getX(3 * t + k) : 3 * t + k)
    v0.fromBufferAttribute(pos, at(0))
    v1.fromBufferAttribute(pos, at(1))
    v2.fromBufferAttribute(pos, at(2))
    n.subVectors(v1, v0).cross(v2.clone().sub(v0))
    const len = n.length()
    if (len < 1e-12 * size * size) return null
    n.divideScalar(len)
    return n.dot(v0)
  }
  const planes = new Set<string>()
  const ta = (ia ? ia.count : pa.count) / 3
  for (let t = 0; t < ta; t++) {
    const d = plane(pa, ia, t)
    if (d !== null) planes.add(key(n, d))
  }
  const has = (nn: THREE.Vector3, d: number) => {
    const r = Math.round(d / tol)
    for (const dr of [-1, 0, 1]) if (planes.has(`${q(nn.x)},${q(nn.y)},${q(nn.z)},${r + dr}`)) return true
    return false
  }
  // Desplazamiento por posición (todas las copias de un vértice se mueven igual: sin grietas), una vez por normal.
  const pkey = (x: number, y: number, z: number) => `${Math.round(x / tol)},${Math.round(y / tol)},${Math.round(z / tol)}`
  const push = new Map<string, Map<string, THREE.Vector3>>()
  const tb = (ib ? ib.count : pb.count) / 3
  const flip = new THREE.Vector3()
  for (let t = 0; t < tb; t++) {
    const d = plane(pb, ib, t)
    if (d === null) continue
    const hit = op === 'subtract' ? has(n, d) : has(flip.copy(n).negate(), -d)
    if (!hit) continue
    const nk = `${q(n.x)},${q(n.y)},${q(n.z)}`
    for (let k = 0; k < 3; k++) {
      const i = ib ? ib.getX(3 * t + k) : 3 * t + k
      const pk = pkey(pb.getX(i), pb.getY(i), pb.getZ(i))
      let m = push.get(pk)
      if (!m) push.set(pk, (m = new Map()))
      if (!m.has(nk)) m.set(nk, n.clone())
    }
  }
  if (push.size === 0) return b
  const out = b.clone()
  const po = out.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < po.count; i++) {
    const m = push.get(pkey(po.getX(i), po.getY(i), po.getZ(i)))
    if (!m) continue
    let [dx, dy, dz] = [0, 0, 0]
    for (const v of m.values()) [dx, dy, dz] = [dx + v.x * eps, dy + v.y * eps, dz + v.z * eps]
    po.setXYZ(i, po.getX(i) + dx, po.getY(i) + dy, po.getZ(i) + dz)
  }
  po.needsUpdate = true
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return out
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

/**
 * Barrido de un perfil 2D por un recorrido (EXTRUDE ▸ Path). El recorrido se toma tal cual (una polilínea con sus
 * esquinas; sólo una spline se suaviza) y el perfil avanza con marcos de transporte paralelo, que no giran en las
 * curvas en S como los de Frenet. En cada quiebre la sección se corta a inglete (plano bisector).
 */
function sweepGeometry(props: {
  profile: Array<[number, number]>
  path: Vec3[]
  ref?: Vec3
  mirror?: boolean
  smooth?: boolean
}): THREE.BufferGeometry {
  const V = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2])
  let pts = props.path.map(V)
  if (props.smooth && pts.length > 2) pts = new THREE.CatmullRomCurve3(pts).getPoints(Math.max(32, pts.length * 16))
  pts = pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 1e-9)
  const profile = props.profile.filter((q, i, a) => i === 0 || q[0] !== a[i - 1][0] || q[1] !== a[i - 1][1])
  if (profile.length > 2 && profile[0][0] === profile[profile.length - 1][0] && profile[0][1] === profile[profile.length - 1][1]) profile.pop()
  if (pts.length < 2 || profile.length < 3) return new THREE.BufferGeometry()
  const sy = props.mirror ? -1 : 1
  // Perfil en sentido antihorario (con el espejo ya aplicado): así las caras laterales miran hacia afuera.
  let area2 = 0
  for (let i = 0; i < profile.length; i++) {
    const [a, b] = [profile[i], profile[(i + 1) % profile.length]]
    area2 += a[0] * b[1] * sy - b[0] * a[1] * sy
  }
  if (area2 < 0) profile.reverse()
  const dirs = pts.slice(1).map((p, i) => p.clone().sub(pts[i]).normalize())
  // Marco inicial: X del perfil en `ref` (o la que elige el barrido), Y = tangente × X.
  const r = V(sweepStartRef(props))
  r.addScaledVector(dirs[0], -r.dot(dirs[0]))
  if (r.lengthSq() < 1e-12) r.copy(V(sweepStartRef({ path: props.path })))
  r.normalize()
  const u = new THREE.Vector3().crossVectors(dirs[0], r)
  const rings: THREE.Vector3[][] = []
  const q = new THREE.Vector3()
  for (let i = 0; i < pts.length; i++) {
    const P = pts[i]
    const din = dirs[Math.max(0, i - 1)]
    const dout = i < dirs.length ? dirs[i] : null
    const miter = i > 0 && dout ? din.clone().add(dout) : null
    const useMiter = !!miter && miter.lengthSq() > 1e-6 && din.dot(dout!) < 1 - 1e-12
    if (useMiter) miter!.normalize()
    rings.push(
      profile.map(([x, y]) => {
        q.copy(P).addScaledVector(r, x).addScaledVector(u, y * sy)
        if (!useMiter) return q.clone()
        // Sección perpendicular al tramo de llegada, llevada al plano bisector a lo largo de ese tramo.
        const s = -q.clone().sub(P).dot(miter!) / din.dot(miter!)
        return q.clone().addScaledVector(din, s)
      }),
    )
    // Transporte paralelo: el marco gira lo mínimo para seguir al tramo siguiente.
    if (i > 0 && dout) {
      const rot = new THREE.Quaternion().setFromUnitVectors(din, dout)
      r.applyQuaternion(rot)
      u.applyQuaternion(rot)
    }
  }
  const pos: number[] = []
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  const caps = THREE.ShapeUtils.triangulateShape(profile.map(([x, y]) => new THREE.Vector2(x, y * sy)), [])
  const first = rings[0]
  const last = rings[rings.length - 1]
  // Cada tapa mira hacia afuera del recorrido (la inicial hacia atrás, la final hacia adelante).
  const capTri = (ring: THREE.Vector3[], [a, b, c]: number[], out: THREE.Vector3) => {
    const n = new THREE.Vector3().crossVectors(ring[b].clone().sub(ring[a]), ring[c].clone().sub(ring[a]))
    if (n.dot(out) >= 0) tri(ring[a], ring[b], ring[c])
    else tri(ring[a], ring[c], ring[b])
  }
  for (const f of caps) capTri(first, f, dirs[0].clone().negate())
  const capStart = pos.length / 3
  for (const f of caps) capTri(last, f, dirs[dirs.length - 1])
  const capEnd = pos.length / 3
  const m = profile.length
  // Cada tramo entre quiebres vivos es una cara aparte (así se marca la arista del inglete); los tramos de un arco
  // muestreado siguen siendo una sola superficie suave.
  const sideStarts: number[] = [pos.length / 3]
  for (let i = 0; i + 1 < rings.length; i++) {
    if (i > 0 && dirs[i - 1].dot(dirs[i]) < Math.cos((20 * Math.PI) / 180)) sideStarts.push(pos.length / 3)
    for (let j = 0; j < m; j++) {
      const a = rings[i][j]
      const b = rings[i][(j + 1) % m]
      const c = rings[i + 1][(j + 1) % m]
      const d = rings[i + 1][j]
      tri(a, b, c)
      tri(a, c, d)
    }
  }
  // Orientación hacia afuera: volumen con signo positivo (el perfil puede venir en cualquier sentido).
  let vol = 0
  for (let k = 0; k + 8 < pos.length; k += 9) {
    vol += pos[k] * (pos[k + 4] * pos[k + 8] - pos[k + 5] * pos[k + 7]) - pos[k + 1] * (pos[k + 3] * pos[k + 8] - pos[k + 5] * pos[k + 6]) + pos[k + 2] * (pos[k + 3] * pos[k + 7] - pos[k + 4] * pos[k + 6])
  }
  if (vol < 0) {
    for (let k = 0; k + 8 < pos.length; k += 9) {
      for (let c = 0; c < 3; c++) [pos[k + 3 + c], pos[k + 6 + c]] = [pos[k + 6 + c], pos[k + 3 + c]]
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.addGroup(0, capStart, 0)
  g.addGroup(capStart, capEnd - capStart, 1)
  sideStarts.forEach((st, k) => g.addGroup(st, (sideStarts[k + 1] ?? pos.length / 3) - st, 2 + k))
  g.computeVertexNormals()
  return g
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
      acc = booleanOp(acc, csgBrush(nudgeCoplanar(acc.geometry, evalTree(operands[i]), op)), op)
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
    // La CSG deja uniones en T: sin cerrarlas se ven puntitos del fondo sobre las caras (y la malla no es cerrada).
    if (!LEAF_OPS.has(props.op)) geom = closeTJunctions(geom)
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

/**
 * Geometría de un sólido para la vista previa de un comando: sin caché (cambia con cada movimiento del cursor y
 * no debe desalojar los sólidos del dibujo de la caché). Quien la pide la libera; null si no se puede evaluar.
 */
export function previewSolidGeometry(props: SolidProps): THREE.BufferGeometry | null {
  try {
    const g = evalTree(props)
    return hasFinitePositions(g) ? g : null
  } catch {
    return null
  }
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
export function solidMeshWithSurfaces(props: SolidProps): MeshProps & { surf?: Float32Array | null; topo?: ReturnType<typeof solidTopology> } {
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
  return { vertices, faces, surf: triangleSurfaces(g), topo: solidTopology(props) }
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
