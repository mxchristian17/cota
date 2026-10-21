import type { Entity } from '../document/types'
import type { Vec3 } from '../math'
import { BYBLOCK } from '../linetype/linetypes'
import {
  mergeSegments,
  projectHidden,
  segmentsBounds,
  snapToHints,
  type CircleHint,
  type Mesh,
  type ProjBasis,
  type ProjItem,
} from './orthographic'

/**
 * FLATSHOT, como el CAD clásico: proyecta los sólidos según la **vista actual** a una representación 2D
 * (líneas visibles y, si se pide, las ocultas) que se inserta como bloque en el plano XY de la UCS, reemplaza
 * un bloque existente o se exporta a un archivo. Las coordenadas 2D son las de la pantalla: X a la derecha,
 * Y hacia arriba, con el origen del mundo proyectado como punto base del bloque.
 */
export type FlatshotDestination = 'insert' | 'replace' | 'file'

export interface FlatshotOptions {
  destination: FlatshotDestination
  /** Tipo de línea de las líneas visibles (por defecto ByBlock). */
  foregroundLinetype: string
  /** Mostrar las líneas ocultas (por defecto no, como el CAD clásico). */
  showObscured: boolean
  /** Tipo de línea de las ocultas (por defecto HIDDEN). */
  obscuredLinetype: string
  /** Incluir las aristas tangentes (borde de los empalmes). */
  tangential: boolean
}

export const DEFAULT_FLATSHOT: FlatshotOptions = {
  destination: 'insert',
  foregroundLinetype: BYBLOCK,
  showObscured: false,
  obscuredLinetype: 'HIDDEN',
  tangential: false,
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Círculos exactos de las primitivas vistas de frente en la base (salen círculos, no polígonos). */
export function basisHints(hints: CircleHint[], b: ProjBasis): Array<{ c: [number, number]; r: number }> {
  return hints
    .filter((h) => !h.n || Math.abs(dot(h.n, b.out)) > 0.999)
    .map((h) => ({ c: [dot(h.c, b.right), dot(h.c, b.up)] as [number, number], r: h.r }))
}

/** Proyección de las mallas en la base, ya convertida en líneas, arcos y círculos. */
export function flatshotItems(meshes: Mesh[], hints: CircleHint[], basis: ProjBasis, opts: { showObscured: boolean; tangential: boolean }): ProjItem[] {
  let segs = projectHidden(meshes, basis, { tangential: opts.tangential })
  if (!opts.showObscured) segs = segs.filter((s) => !s.hidden)
  if (segs.length === 0) return []
  const bb = segmentsBounds(segs)
  const tol = Math.max(Math.hypot(bb.maxU - bb.minU, bb.maxV - bb.minV) * 2e-4, 1e-6)
  return snapToHints(mergeSegments(segs, tol), basisHints(hints, basis))
}

/** Entidades de la definición del bloque (capa 0: toman la de la inserción, como en el CAD clásico). */
export function flatshotEntities(items: ProjItem[], opts: Pick<FlatshotOptions, 'foregroundLinetype' | 'obscuredLinetype'>): Entity[] {
  const out: Entity[] = []
  const at = (p: [number, number]): Vec3 => [p[0], p[1], 0]
  items.forEach((it, i) => {
    const id = `fs${i + 1}`
    const lineType = it.hidden ? opts.obscuredLinetype : opts.foregroundLinetype
    const common = lineType && lineType.toUpperCase() !== 'BYLAYER' ? { lineType } : {}
    if (it.kind === 'line') out.push({ id, type: 'LINE', layer: '0', props: { start: at(it.a), end: at(it.b) }, ...common })
    else if (it.kind === 'circle') out.push({ id, type: 'CIRCLE', layer: '0', props: { center: at(it.c), radius: it.r, normal: [0, 0, 1] }, ...common })
    else out.push({ id, type: 'ARC', layer: '0', props: { center: at(it.c), radius: it.r, startAngle: it.a0, endAngle: it.a1, normal: [0, 0, 1] }, ...common })
  })
  return out
}

/** Primer nombre libre `FLATSHOTn` para el bloque nuevo. */
export function nextFlatshotName(existing: string[]): string {
  const used = new Set(existing.map((n) => n.toUpperCase()))
  let i = 1
  while (used.has(`FLATSHOT${i}`)) i++
  return `FLATSHOT${i}`
}
