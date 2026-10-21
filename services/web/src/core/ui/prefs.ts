/**
 * Preferencias del usuario (interfaz y visualización): se guardan siempre en el navegador y, con sesión
 * iniciada, también en la cuenta (`PUT /config`). Gana la copia más reciente (`savedAt`). Lo propio del dibujo
 * (capas, vistas, UCS, estilos) no va acá: viaja en el archivo.
 */

export const PREFS_KEY = 'cota.prefs'

/** Preferencias tal como se guardan: un objeto JSON con la marca de tiempo del último cambio. */
export type Prefs = Record<string, unknown> & { savedAt?: number }

/** Almacenamiento del navegador (inyectable para los tests); null si el navegador no lo permite. */
function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null // modo privado estricto, datos del sitio bloqueados…
  }
}

export function readLocalPrefs(storage = browserStorage()): Prefs | null {
  try {
    const raw = storage?.getItem(PREFS_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Prefs) : null
  } catch {
    return null
  }
}

/** Guarda; false si el navegador no lo permite (la app sigue igual, sin recordar). */
export function writeLocalPrefs(prefs: Prefs, storage = browserStorage()): boolean {
  try {
    if (!storage) return false
    storage.setItem(PREFS_KEY, JSON.stringify(prefs))
    return true
  } catch {
    return false
  }
}

const stamp = (p: Prefs | null | undefined): number => (typeof p?.savedAt === 'number' && isFinite(p.savedAt) ? p.savedAt : 0)
const isEmpty = (p: Prefs | null | undefined): boolean => !p || Object.keys(p).filter((k) => k !== 'savedAt').length === 0

/**
 * Qué copia vale al iniciar sesión: la de la cuenta si es más reciente (o la única), si no la del navegador
 * (que entonces se sube a la cuenta). null = no hay ninguna.
 */
export function pickPrefs(local: Prefs | null, remote: Prefs | null): 'local' | 'remote' | null {
  if (isEmpty(remote)) return isEmpty(local) ? null : 'local'
  if (isEmpty(local)) return 'remote'
  return stamp(remote) > stamp(local) ? 'remote' : 'local'
}
