import type { Layer } from '../document/types'

/**
 * Orden de capas: la lista de capas es el **apilado** de dibujo; la primera capa se dibuja
 * arriba de todas. `drawOrder` da, por capa, un número creciente hacia arriba (0 = la de más arriba,
 * negativos debajo), que el render usa como `renderOrder` y el *pick* para desempatar.
 */
export function drawOrder(layers: Layer[]): Map<string, number> {
  return new Map(layers.map((l, i) => [l.id, -i]))
}

/** Entidades ordenadas de la capa de más abajo a la de más arriba (estable: dentro de una capa, como venían). */
export function byLayerOrder<T extends { layer: string }>(entities: T[], layers: Layer[]): T[] {
  const order = drawOrder(layers)
  const bottom = -layers.length
  return entities
    .map((e, i) => ({ e, i, o: order.get(e.layer) ?? bottom }))
    .sort((a, b) => a.o - b.o || a.i - b.i)
    .map((x) => x.e)
}

/** Mueve la capa `id` a la posición `to` de la lista (0 = arriba). Devuelve false si no cambió nada. */
export function moveLayerTo(layers: Layer[], id: string, to: number): boolean {
  const from = layers.findIndex((l) => l.id === id)
  const target = Math.max(0, Math.min(layers.length - 1, Math.round(to)))
  if (from < 0 || from === target) return false
  const [l] = layers.splice(from, 1)
  layers.splice(target, 0, l)
  return true
}
