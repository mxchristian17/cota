import type { Layer } from '../document/types'

/**
 * Estados de capa, como en el CAD clásico:
 * - **Apagada (Off):** sus objetos desaparecen: no se ven, no se seleccionan, no dan snaps.
 * - **Congelada (Freeze):** igual que apagada (y no se imprime); además la capa actual no se puede congelar. Hasta la
 *   2.11 se veía en grises: Christian pidió el comportamiento del CAD clásico (2026-10-29).
 * - **Bloqueada (Lock):** se ve atenuada, da snaps, no se selecciona ni se edita.
 */

/** ¿Se dibujan en pantalla los objetos de la capa? (ni apagada ni congelada). */
export const layerVisible = (l: Layer | undefined): boolean => !l || (l.visible && !l.frozen)

/** ¿Se imprimen / proyectan los objetos de la capa? (ni apagada ni congelada). */
export const layerShown = (l: Layer | undefined): boolean => !l || (l.visible && !l.frozen)

/** ¿Se pueden seleccionar y editar? (ni apagada, ni congelada, ni bloqueada). */
export const layerEditable = (l: Layer | undefined): boolean => !l || (l.visible && !l.frozen && !l.locked)

/** Ids de las capas congeladas. */
export const frozenLayerIds = (layers: Layer[]): Set<string> => new Set(layers.filter((l) => l.frozen).map((l) => l.id))

/** Ids de las capas apagadas o congeladas: sus objetos no se ven ni dan snaps. */
export const hiddenLayerIds = (layers: Layer[]): Set<string> => new Set(layers.filter((l) => !layerVisible(l)).map((l) => l.id))
