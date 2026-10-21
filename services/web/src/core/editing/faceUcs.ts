import type { Entity } from '../document/types'
import { pt, type Vec3 } from '../math'
import { closestOnSegment, vcross, vdist, vdot, vnorm, vsub } from '../geom/vec3'
import { orthonormal, type Ucs } from '../ucs'
import { edgeSegments, planarFaceNormal, rayFaces, solidTopology } from './topology'

/** Cara de un sólido bajo un rayo: la UCS alineada a ella y el punto de impacto. */
export interface FaceHit {
  ucs: Ucs
  point: Vec3
  solidId: string
  face: number
  /** Contorno de la cara (aristas), para resaltarla. */
  outline: Vec3[][]
}

/**
 * UCS de la `skip`-ésima cara que atraviesa el rayo (como `UCS Face` y la UCS dinámica del CAD clásico):
 * Z = normal de la cara hacia afuera, origen en el vértice más cercano de la arista más cercana al
 * impacto y X a lo largo de esa arista. null si no hay cara o no es plana (`planar = false` en el
 * resultado permite distinguirlo).
 */
export function faceUcsAt(
  solids: Entity[],
  o: Vec3,
  d: Vec3,
  skip = 0,
  prefX: Vec3 = [1, 0, 0],
): (FaceHit & { planar: true }) | { planar: false } | null {
  const hits: Array<{ face: number; point: Vec3; t: number; solid: Entity }> = []
  for (const e of solids) {
    if (e.type !== 'SOLID3D') continue
    const topo = solidTopology(e.props)
    if (!topo) continue
    for (const h of rayFaces(topo, o, d)) hits.push({ face: h.face, point: h.point, t: h.t, solid: e })
  }
  hits.sort((a, b) => a.t - b.t)
  const h = hits[skip]
  if (!h || h.solid.type !== 'SOLID3D') return null
  const topo = solidTopology(h.solid.props)!
  const n = planarFaceNormal(topo, h.face)
  if (!n) return { planar: false }
  // La X sigue a la arista RECTA más cercana (en una cara con agujeros, el borde del agujero no la
  // tuerce); si la cara sólo tiene aristas curvas, la más cercana de todas.
  let best: { a: Vec3; b: Vec3; d: number; straight: boolean } | null = null
  const outline: Vec3[][] = []
  for (const e of topo.edges) {
    if (!e.faces.includes(h.face)) continue
    outline.push(e.closed ? [...e.pts, e.pts[0]] : e.pts)
    // Recta de verdad: colineal y entre dos caras planas (los tramos de un borde curvo partido por la
    // CSG también son "rectos", pero su otra cara es curva).
    const other = e.faces[0] === h.face ? e.faces[1] : e.faces[0]
    const straight = !e.closed && isStraight(e.pts) && planarFaceNormal(topo, other) !== null
    for (const [i, j] of edgeSegments(e)) {
      const c = closestOnSegment(h.point, e.pts[i], e.pts[j])
      const dd = vdist(c.point, h.point)
      const better = !best || (straight && !best.straight) || (straight === best.straight && dd < best.d)
      if (better) best = { a: straight ? e.pts[0] : e.pts[i], b: straight ? e.pts[e.pts.length - 1] : e.pts[j], d: dd, straight }
    }
  }
  if (!best) return null
  // Sentido de la X: el más parecido a la X de la UCS actual (si es perpendicular, con la Y hacia +Z);
  // el origen es el extremo de la arista desde el que arranca.
  let [origin, far] = [best.a, best.b]
  let x = vsub(far, origin)
  const along = vdot(x, prefX)
  const flip = Math.abs(along) > 1e-6 * vdist(far, origin) ? along < 0 : vcross(n, vnorm(x))[2] < 0
  if (flip) {
    ;[origin, far] = [far, origin]
    x = vsub(far, origin)
  }
  const ucs = orthonormal(pt(origin[0], origin[1], origin[2]), x, vcross(n, vnorm(x)))
  if (!ucs) return null
  return { planar: true, ucs, point: h.point, solidId: h.solid.id, face: h.face, outline }
}

/** ¿Los puntos de la arista están sobre una recta? */
function isStraight(pts: Vec3[]): boolean {
  if (pts.length < 2) return false
  const a = pts[0]
  const b = pts[pts.length - 1]
  const ab = vsub(b, a)
  const L = Math.hypot(ab[0], ab[1], ab[2])
  if (L < 1e-12) return false
  return pts.every((p) => vdist(closestOnSegment(p, a, b).point, p) <= 1e-6 * Math.max(1, L))
}
