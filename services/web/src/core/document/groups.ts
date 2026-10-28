import type { GroupDef } from './types'

/**
 * Selección de grupos (PICKSTYLE 1, como el CAD clásico): elegir un objeto de un grupo seleccionable toma el grupo
 * entero. Devuelve los ids más los demás miembros vivos de sus grupos, sin repetir y en orden.
 */
export function expandGroups(groups: GroupDef[], ids: string[]): string[] {
  if (!groups.length || !ids.length) return ids
  const out = [...ids]
  const seen = new Set(ids)
  for (const g of groups) {
    if (!g.selectable || !g.ids.some((id) => seen.has(id))) continue
    for (const id of g.ids) {
      if (seen.has(id)) continue
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

/** Nombre libre para un grupo sin nombre (`*A1`, `*A2`…), como los anónimos del CAD clásico. */
export function anonymousGroupName(groups: GroupDef[]): string {
  let i = 1
  const names = new Set(groups.map((g) => g.name.toUpperCase()))
  while (names.has(`*A${i}`)) i++
  return `*A${i}`
}
