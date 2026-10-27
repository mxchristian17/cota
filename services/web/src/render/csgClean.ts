import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'

/**
 * Limpieza de booleanas de three-bvh-csg. La librería clasifica cada triángulo cortado con **un** rayo
 * desde su punto medio; si ese punto cae justo sobre el plano de una cara del otro sólido (medidas
 * redondas: un cilindro de 80 que atraviesa un cubo de 50 frente a una base de 60), el rayo roza la
 * cara y el triángulo queda del lado equivocado: astillas sueltas fuera del sólido, que se ven como
 * rayitas en el sombreado y cortan las aristas de FLATSHOT. Acá se descartan los triángulos que no
 * pueden estar en el borde del resultado, con un test de paridad por mayoría de 3 rayos.
 */

export type BoolOp = 'union' | 'subtract' | 'intersect'
type Side = 'in' | 'out' | 'on'

/** Direcciones fijas sin alinear con los ejes (no rozan caras de cajas ni cilindros ortogonales). */
const DIRS = [
  new THREE.Vector3(0.5377, 0.7231, 0.4331).normalize(),
  new THREE.Vector3(-0.6123, 0.2477, 0.7509).normalize(),
  new THREE.Vector3(0.3119, -0.8436, 0.4371).normalize(),
]
/** Si la limpieza descartara más que esto, se desconfía de ella (malla abierta) y no se toca nada. */
const MAX_DROP = 0.2
/** Desactiva la limpieza (sólo para medir). */
export const csgCleanOptions = { enabled: true }

const ray = new THREE.Ray()
const near = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 }

function bvhOf(g: THREE.BufferGeometry): MeshBVH {
  return (g as THREE.BufferGeometry & { boundsTree?: MeshBVH }).boundsTree ?? new MeshBVH(g)
}

/**
 * Raycast tolerante: three-mesh-bvh interpola las normales del impacto y, en un triángulo sin área (la CSG los deja),
 * la interpolación es null y el raycast falla. Entonces se repite sobre una copia sólo con posiciones.
 */
const plain = new WeakMap<MeshBVH, MeshBVH>()
function safeRaycast(bvh: MeshBVH, r: THREE.Ray): THREE.Intersection[] {
  try {
    return bvh.raycast(r, THREE.DoubleSide)
  } catch {
    let alt = plain.get(bvh)
    if (!alt) {
      const src = bvh.geometry
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', src.getAttribute('position'))
      if (src.index) g.setIndex(src.index.clone())
      alt = new MeshBVH(g)
      plain.set(bvh, alt)
    }
    return alt.raycast(r, THREE.DoubleSide)
  }
}

/** Posición de `p` respecto de una malla cerrada: sobre su superficie (a menos de `eps`), dentro o fuera. */
function classify(bvh: MeshBVH, p: THREE.Vector3, eps: number): Side {
  if (bvh.closestPointToPoint(p, near, 0, eps)) return 'on'
  let inside = 0
  for (const d of DIRS) {
    ray.set(p, d)
    const ds = safeRaycast(bvh, ray).map((h) => h.distance).sort((a, b) => a - b)
    // Un rayo que pasa por una arista compartida la cuenta dos veces: impactos a la misma distancia = uno.
    let n = 0
    for (let i = 0; i < ds.length; i++) if (i === 0 || ds[i] - ds[i - 1] > eps) n++
    if (n % 2 === 1) inside++
  }
  return inside >= 2 ? 'in' : 'out'
}

/**
 * Resultado de `a op b` sin los triángulos imposibles: en una resta, los que quedan estrictamente fuera
 * de A o dentro de B; en una unión, los que quedan dentro de alguno; en una intersección, fuera de
 * alguno. Con `checkB = false` sólo se usa A (cuando B no es una malla cerrada confiable, p. ej. los
 * cortadores de FILLETEDGE/CHAMFEREDGE).
 */
export function dropStrayTriangles(
  res: THREE.BufferGeometry,
  a: THREE.BufferGeometry,
  b: THREE.BufferGeometry,
  op: BoolOp,
  checkB = true,
): THREE.BufferGeometry {
  const pos = res.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pos || !csgCleanOptions.enabled) return res
  const index = res.getIndex()
  const count = (index ? index.count : pos.count) / 3
  if (!count) return res
  res.computeBoundingBox()
  const eps = Math.max(res.boundingBox!.getSize(new THREE.Vector3()).length() * 1e-5, 1e-7)
  const ba = bvhOf(a)
  const bb = checkB ? bvhOf(b) : null
  // Lejos de un operando no hace falta lanzar rayos (lo caro): fuera de la caja de B un triángulo viene de A tal
  // cual; fuera de la de A, de B. Sólo se clasifica lo que cae en la zona donde se cruzan.
  const boxOf = (g: THREE.BufferGeometry) => {
    g.computeBoundingBox()
    return g.boundingBox!.clone().expandByScalar(eps)
  }
  const boxA = boxOf(a)
  const boxB = checkB ? boxOf(b) : null
  const vtx = (i: number) => (index ? index.getX(i) : i)
  const c = new THREE.Vector3()
  const keep: number[] = []
  for (let t = 0; t < count; t++) {
    c.set(0, 0, 0)
    for (let k = 0; k < 3; k++) {
      const v = vtx(3 * t + k)
      c.x += pos.getX(v) / 3
      c.y += pos.getY(v) / 3
      c.z += pos.getZ(v) / 3
    }
    if (boxB) {
      const inA = boxA.containsPoint(c)
      const inB = boxB.containsPoint(c)
      if (!inA || !inB) {
        // Unión: lo que queda afuera de una caja es de la otra pieza y se conserva. Resta: fuera de A sobra, fuera
        // de B es A intacta. Intersección: fuera de cualquiera de las dos sobra.
        const ok = op === 'union' ? true : op === 'subtract' ? inA : false
        if (ok) keep.push(t)
        continue
      }
    }
    const sa = classify(ba, c, eps)
    let bad = op === 'subtract' || op === 'intersect' ? sa === 'out' : sa === 'in'
    if (!bad && bb) {
      const sb = classify(bb, c, eps)
      bad = op === 'intersect' ? sb === 'out' : sb === 'in'
    }
    if (!bad) keep.push(t)
  }
  if (keep.length === count || count - keep.length > count * MAX_DROP) return res
  const src = index ? res.toNonIndexed() : res
  const out = new THREE.BufferGeometry()
  for (const name of Object.keys(src.attributes)) {
    const attr = src.getAttribute(name) as THREE.BufferAttribute
    const n = attr.itemSize
    const arr = new Float32Array(keep.length * 3 * n)
    keep.forEach((t, k) => {
      for (let j = 0; j < 3 * n; j++) arr[k * 3 * n + j] = attr.array[t * 3 * n + j]
    })
    out.setAttribute(name, new THREE.BufferAttribute(arr, n))
  }
  return out
}
