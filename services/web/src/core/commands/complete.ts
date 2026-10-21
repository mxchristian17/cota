import { stripUnderscore } from './CommandEngine'
import type { Command } from './types'

export interface CommandSuggestion {
  /** Nombre canónico del comando (lo que se ejecuta). */
  name: string
  /** Alias por el que coincidió, si la coincidencia fue por alias (`L` → LINE). */
  alias?: string
  description: string
}

/** Prioridad de la coincidencia: nombre por prefijo < alias por prefijo < nombre por substring. */
function rank(cmd: Command, q: string): { rank: number; alias?: string } | null {
  const name = cmd.name.toUpperCase()
  if (name.startsWith(q)) return { rank: 0 }
  const alias = cmd.aliases.find((a) => a.toUpperCase().startsWith(q))
  if (alias) return { rank: 1, alias: alias.toUpperCase() }
  if (name.includes(q)) return { rank: 2 }
  return null
}

/**
 * Sugerencias de autocompletado para lo que se está tecleando en la línea de comandos (el CAD clásico
 * muestra una lista mientras se escribe). Ignora el `_` inicial de las macros y no distingue
 * mayúsculas. Devuelve a lo sumo `limit` resultados, los mejores primero.
 */
export function suggestCommands(commands: Command[], text: string, limit = 8): CommandSuggestion[] {
  const q = stripUnderscore(text).toUpperCase()
  if (!q) return []
  const hits: { s: CommandSuggestion; r: number }[] = []
  for (const cmd of commands) {
    const m = rank(cmd, q)
    if (!m) continue
    hits.push({ s: { name: cmd.name.toUpperCase(), alias: m.alias, description: cmd.description }, r: m.rank })
  }
  hits.sort((a, b) => a.r - b.r || a.s.name.localeCompare(b.s.name))
  return hits.slice(0, limit).map((h) => h.s)
}
