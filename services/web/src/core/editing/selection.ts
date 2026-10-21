/**
 * Álgebra de conjuntos de la selección.
 *
 * El CAD clásico acumula: cada click/ventana SUMA a lo ya seleccionado y con Shift RESTA; sólo ESC vacía.
 * Las funciones devuelven el mismo array cuando no hay cambios, para no disparar re-renders.
 */
export function mergeSelection(current: string[], ids: string[], subtract = false): string[] {
  if (ids.length === 0) return current
  if (subtract) {
    const drop = new Set(ids)
    const next = current.filter((id) => !drop.has(id))
    return next.length === current.length ? current : next
  }
  const seen = new Set(current)
  const added = ids.filter((id) => !seen.has(id))
  return added.length === 0 ? current : [...current, ...added]
}
