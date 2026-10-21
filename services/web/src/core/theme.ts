/** Preferencias visuales de la UI. Colores en hex `#rrggbb`. */
export interface Theme {
  /** Fondo del área de dibujo (escena 3D). */
  background: string
  /** Líneas mayores de la grilla. */
  gridMajor: string
  /** Líneas menores de la grilla. */
  gridMinor: string
  /** Color del crosshair (líneas + pickbox). */
  crosshairColor: string
  /** Lado del pickbox central del crosshair, en píxeles. */
  crosshairSize: number
}

export const DARK_THEME: Theme = {
  background: '#1e1e1e',
  gridMajor: '#444444',
  gridMinor: '#2a2a2a',
  crosshairColor: '#e6e6e6',
  crosshairSize: 14,
}

export const LIGHT_THEME: Theme = {
  background: '#f4f4f4',
  gridMajor: '#b8b8b8',
  gridMinor: '#dcdcdc',
  crosshairColor: '#333333',
  crosshairSize: 14,
}

export const DEFAULT_THEME: Theme = DARK_THEME

/** Normaliza un objeto arbitrario (config persistida) a un `Theme` válido, con defaults. */
export function normalizeTheme(raw: unknown): Theme {
  const r = (raw ?? {}) as Partial<Theme>
  const hex = (v: unknown, def: string): string =>
    typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : def
  const size = typeof r.crosshairSize === 'number' && r.crosshairSize > 0 ? Math.min(60, r.crosshairSize) : DEFAULT_THEME.crosshairSize
  return {
    background: hex(r.background, DEFAULT_THEME.background),
    gridMajor: hex(r.gridMajor, DEFAULT_THEME.gridMajor),
    gridMinor: hex(r.gridMinor, DEFAULT_THEME.gridMinor),
    crosshairColor: hex(r.crosshairColor, DEFAULT_THEME.crosshairColor),
    crosshairSize: size,
  }
}
