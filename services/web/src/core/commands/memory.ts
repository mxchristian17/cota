/**
 * Valores recordados de los prompts numéricos, como el CAD clásico: cada comando ofrece entre
 * `< >` el último valor usado en la sesión y Enter lo repite. La clave identifica comando y prompt
 * (`EXTRUDE.height`) o usa el nombre de la variable del CAD clásico cuando existe (`CIRCLERAD`). Vive en la
 * sesión (no se guarda en el dibujo); `TEXTSIZE` es la excepción y vive en el documento.
 */
const memory = new Map<string, number>()

export function recall(key: string): number | undefined {
  return memory.get(key)
}

export function remember(key: string, value: number): void {
  if (Number.isFinite(value)) memory.set(key, value)
}

/** Olvida todo (tests). */
export function resetMemory(): void {
  memory.clear()
}
