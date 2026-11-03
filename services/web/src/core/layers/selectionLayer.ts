import type { Entity } from '../document/types'

/** Capa que muestran los controles de capa: la de los objetos seleccionados o, sin selección, la actual. */
export interface ShownLayer {
  id: string
  /** Cuántas capas más hay en la selección, además de `id`. */
  others: number
}

/** Como el CAD clásico: los controles muestran la capa de la selección; al deseleccionar vuelven solos a la actual. */
export function shownLayer(currentId: string, selected: Array<Entity | undefined>): ShownLayer {
  const ids = [...new Set(selected.flatMap((e) => (e ? [e.layer] : [])))]
  return ids.length ? { id: ids[0], others: ids.length - 1 } : { id: currentId, others: 0 }
}
