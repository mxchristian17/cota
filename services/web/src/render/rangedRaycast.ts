import * as THREE from 'three'

/**
 * Pick de un lote (caras o tramos de muchas piezas en un solo objeto): el rayo recorre sólo las piezas cuya esfera
 * envolvente toca; el raycast de three recorre el lote entero, cientos de miles de triángulos y aristas en un ensamble,
 * en cada clic. Da el mismo resultado y en el mismo orden que el recorrido completo: cada pieza se prueba con el raycast
 * de three limitado a lo suyo (`drawRange`), en orden.
 *
 * `userData.spans` del lote: por pieza, su primer índice (o vértice) y cuántos, y su primer vértice y cuántos (sus
 * triángulos o tramos sólo usan esos vértices).
 */
export function rangedRaycast(this: THREE.Mesh | THREE.LineSegments, raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void {
  const g = this.geometry
  const spans = this.userData.spans as number[]
  let spheres = this.userData.spheres as THREE.Sphere[] | undefined
  if (!spheres) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    const box = new THREE.Box3()
    const p = new THREE.Vector3()
    spheres = []
    for (let k = 0; k < spans.length; k += 4) {
      box.makeEmpty()
      for (let i = spans[k + 2]; i < spans[k + 2] + spans[k + 3]; i++) box.expandByPoint(p.fromBufferAttribute(pos, i))
      const s = box.getBoundingSphere(new THREE.Sphere())
      s.radius = s.radius * (1 + 1e-6) + 1e-9 // con margen: nunca deja afuera algo de la pieza
      spheres.push(s)
    }
    this.userData.spheres = spheres
  }
  // Los tramos se toman a una distancia del rayo (como hace three con la esfera del lote entero).
  const pad = (this as THREE.Line).isLine ? raycaster.params.Line.threshold : 0
  const raycast = (Object.getPrototypeOf(this) as THREE.Object3D).raycast
  const { start, count } = g.drawRange
  const world = new THREE.Sphere()
  try {
    for (let k = 0, j = 0; k < spans.length; k += 4, j++) {
      const r = spheres[j].radius
      if (r < 0) continue // pieza vacía
      if (Number.isFinite(r)) {
        world.copy(spheres[j]).applyMatrix4(this.matrixWorld)
        world.radius += pad
        if (!raycaster.ray.intersectsSphere(world)) continue
      }
      g.setDrawRange(spans[k], spans[k + 1])
      raycast.call(this, raycaster, intersects)
    }
  } finally {
    g.setDrawRange(start, count)
  }
}

/**
 * Piezas de un lote de tramos sueltos (`LineSegments` sin índice) según sus `ranges` (vértice inicial de cada una), o
 * null si alguna no empieza en un tramo (vértice par) o si hay tramos fuera de las piezas: ahí partirlo cambiaría qué
 * vértices forman cada tramo, o dejaría tramos sin probar.
 */
export function lineSpans(ranges: { s: number }[], count: number): number[] | null {
  if (!ranges.length || ranges[0].s !== 0) return null // algún tramo sin pieza: se prueba todo
  const out: number[] = []
  for (let i = 0; i < ranges.length; i++) {
    const s = ranges[i].s
    const n = (i + 1 < ranges.length ? ranges[i + 1].s : count) - s
    if (s % 2 !== 0 || n < 0) return null
    out.push(s, n, s, n)
  }
  return out
}
