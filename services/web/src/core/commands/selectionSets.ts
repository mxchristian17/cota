import { isHidden } from '../editing/isolation'
import type { DocumentModel } from '../document/DocumentModel'
import type { Entity } from '../document/types'
import { entityOutline } from '../editing/bounds'
import { layerEditable, layerVisible } from '../layers/visibility'
import type { Pt } from '../math'

/**
 * Conjuntos de selección por teclado (el CAD clásico `Select objects:`): `ALL`, `Window`, `Crossing`,
 * `WPolygon`, `CPolygon` y `Fence`. Se evalúan en el plano XY del mundo sobre el contorno de cada
 * entidad, sólo con objetos de capas visibles y desbloqueadas.
 */

type P2 = [number, number]

/** Entidades que se pueden seleccionar: capa encendida, descongelada y desbloqueada. */
/**
 * Entidades a la vista (capas encendidas; las congeladas se ven en gris): las que sirven de referencia, como los
 * bordes de corte de TRIM o la cara de UCS Face. Una capa apagada no interactúa con el modelo.
 */
export function visibleEntities(doc: DocumentModel): Entity[] {
  const layers = new Map(doc.layers.map((l) => [l.id, l]))
  return doc.entities.filter((e) => layerVisible(layers.get(e.layer)))
}

export function selectableEntities(doc: DocumentModel): Entity[] {
  const layers = new Map(doc.layers.map((l) => [l.id, l]))
  return doc.entities.filter((e) => {
    const l = layers.get(e.layer)
    return layerEditable(l) && !isHidden(e.id)
  })
}

const xy = (p: Pt): P2 => [p.x, p.y]

function inside(p: P2, poly: P2[]): boolean {
  let ins = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) ins = !ins
  }
  return ins
}

function segCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const o = (p: P2, q: P2, r: P2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b)
}

const edges = (pts: P2[], closed: boolean): Array<[P2, P2]> => {
  const out: Array<[P2, P2]> = []
  for (let i = 0; i + 1 < pts.length; i++) out.push([pts[i], pts[i + 1]])
  if (closed && pts.length > 2) out.push([pts[pts.length - 1], pts[0]])
  return out
}

/** Entidades dentro (`window`) o que tocan (`crossing`) el polígono `poly` (≥ 3 vértices). */
export function inPolygon(ents: Entity[], poly: Pt[], crossing: boolean): string[] {
  const pg = poly.map(xy)
  const border = edges(pg, true)
  return ents
    .filter((e) => {
      const outline = entityOutline(e).map((l) => l.map(xy))
      const pts = outline.flat()
      if (!pts.length) return false
      if (!crossing) return pts.every((p) => inside(p, pg))
      if (pts.some((p) => inside(p, pg))) return true
      return outline.some((l) => edges(l, false).some(([a, b]) => border.some(([c, d]) => segCross(a, b, c, d))))
    })
    .map((e) => e.id)
}

/** Rectángulo de dos esquinas como polígono. */
export const rectPolygon = (a: Pt, b: Pt): Pt[] => [a, { x: b.x, y: a.y, z: a.z }, b, { x: a.x, y: b.y, z: a.z }]

/** Entidades que cruza la polilínea `fence`. */
export function byFence(ents: Entity[], fence: Pt[]): string[] {
  const f = edges(fence.map(xy), false)
  return ents
    .filter((e) => entityOutline(e).some((l) => edges(l.map(xy), false).some(([a, b]) => f.some(([c, d]) => segCross(a, b, c, d)))))
    .map((e) => e.id)
}
