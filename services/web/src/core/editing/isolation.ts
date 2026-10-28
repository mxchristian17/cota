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
