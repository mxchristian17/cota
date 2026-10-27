import type { Layer } from '../document/types'

/**
 * Estados de capa:
 * - **Apagada (Off):** sus objetos desaparecen: no se ven, no se seleccionan, no dan snaps.
 * - **Congelada (Freeze):** se ve en grises, como una capa bloqueada: no se selecciona ni se edita, pero da snaps.
 *   No se imprime.
 * - **Bloqueada (Lock):** se ve atenuada, da snaps, no se selecciona ni se edita.
 */

/** ¿Se dibujan en pantalla los objetos de la capa? (apagada no; congelada sí, en grises). */
export const layerVisible = (l: Layer | undefined): boolean => !l || l.visible

/** ¿Se imprimen / proyectan los objetos de la capa? (ni apagada ni congelada). */
export const layerShown = (l: Layer | undefined): boolean => !l || (l.visible && !l.frozen)

/** ¿Se pueden seleccionar y editar? (ni apagada, ni congelada, ni bloqueada). */
export const layerEditable = (l: Layer | undefined): boolean => !l || (l.visible && !l.frozen && !l.locked)

/** Ids de las capas congeladas. */
export const frozenLayerIds = (layers: Layer[]): Set<string> => new Set(layers.filter((l) => l.frozen).map((l) => l.id))

/** Ids de las capas apagadas: sus objetos no se ven ni dan snaps. */
export const hiddenLayerIds = (layers: Layer[]): Set<string> => new Set(layers.filter((l) => !layerVisible(l)).map((l) => l.id))
