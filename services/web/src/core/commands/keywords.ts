/**
 * Coincidencia de opciones (keywords) de un prompt, estilo CAD clásico. Orden de prioridad:
 * 1. nombre exacto; 2. atajo = sus letras **mayúsculas** (`eRase` → `R`, `cLose` → `L`,
 * `DElta` → `DE`, `DYnamic` → `DY`); 3. prefijo del nombre. Sin distinguir mayúsculas al tipear.
 */
export function keywordShortcut(k: string): string {
  const caps = k.replace(/[^A-Z]/g, '')
  return caps || k
}

export function matchKeyword(text: string, keywords: string[]): string | null {
  const t = text.trim().toLowerCase()
  if (!t) return null
  return (
    keywords.find((k) => k.toLowerCase() === t) ??
    keywords.find((k) => keywordShortcut(k).toLowerCase() === t) ??
    keywords.find((k) => k.toLowerCase().startsWith(t)) ??
    null
  )
}
