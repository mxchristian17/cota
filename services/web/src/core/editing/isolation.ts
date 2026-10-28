import type { Layer } from '../document/types'

/**
 * ISOLATEOBJECTS / HIDEOBJECTS: objetos ocultos temporalmente (no se guardan con el dibujo, como OBJECTISOLATIONMODE 0
 * del CAD clásico). No se ven, no dan snaps ni se pueden seleccionar; UNISOLATEOBJECTS (o abrir otro dibujo) los muestra.
 */
export const isolation = { hidden: new Set<string>(), rev: 0 }

export const isHidden = (id: string): boolean => isolation.hidden.has(id)

export function hideIds(ids: Iterable<string>): void {
  for (const id of ids) isolation.hidden.add(id)
  isolation.rev++
}

export function endIsolation(): boolean {
  const had = isolation.hidden.size > 0
  isolation.hidden.clear()
  isolation.rev++
  return had
}

/**
 * Capas apagadas sólo en pantalla (vista mobile, PRD076): se dibujan como apagadas pero el dibujo no cambia ni queda
 * modificado. Comparten la revisión del aislamiento (los viewports la suman a la del documento para redibujar).
 */
export const viewLayersOff = new Set<string>()

export function setViewLayerOff(id: string, off: boolean): void {
  if (off) viewLayersOff.add(id)
  else viewLayersOff.delete(id)
  isolation.rev++
}

export function clearViewLayers(): void {
  if (!viewLayersOff.size) return
  viewLayersOff.clear()
  isolation.rev++
}

let memo: { src: Layer[]; rev: number; out: Layer[] } | null = null

/** Las capas del dibujo con las apagadas en pantalla marcadas como no visibles (lo que dibujan los viewports). */
export function viewLayers(layers: Layer[]): Layer[] {
  if (!viewLayersOff.size) return layers
  if (memo && memo.src === layers && memo.rev === isolation.rev) return memo.out
  const out = layers.map((l) => (viewLayersOff.has(l.id) && l.visible ? { ...l, visible: false } : l))
  memo = { src: layers, rev: isolation.rev, out }
  return out
}
