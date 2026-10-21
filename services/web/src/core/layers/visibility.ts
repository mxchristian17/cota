import type { Layer } from '../document/types'

/** Estados de capa que ocultan objetos: apagada (Off) o congelada (Freeze). */

/** ¿Se ven (y dan snaps) los objetos de la capa? Una capa inexistente no oculta nada. */
export const layerShown = (l: Layer | undefined): boolean => !l || (l.visible && !l.frozen)

/** Ids de las capas congeladas. */
export const frozenLayerIds = (layers: Layer[]): Set<string> => new Set(layers.filter((l) => l.frozen).map((l) => l.id))

/** Ids de las capas cuyos objetos no se ven (apagadas o congeladas). */
export const hiddenLayerIds = (layers: Layer[]): Set<string> => new Set(layers.filter((l) => !layerShown(l)).map((l) => l.id))
