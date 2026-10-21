/**
 * Estado y anclaje de una paleta flotante.
 *
 * Replica el comportamiento de las paletas del CAD clásico: se arrastran libremente y, si se sueltan cerca
 * de un borde lateral, quedan **acopladas** a ese lado. La lógica es pura (sin DOM) para poder
 * testearla y para que el componente React sólo se ocupe de los eventos.
 */
export type DockSide = 'left' | 'right' | null

export interface PaletteState {
  open: boolean
  minimized: boolean
  /** Lado al que está acoplada; `null` = flotante. */
  dock: DockSide
  /** Posición del borde superior izquierdo cuando flota (px de la ventana). */
  x: number
  y: number
  width: number
}

/** Arranca minimizada: el dibujo tiene todo el ancho hasta que se la abre. */
export const DEFAULT_PALETTE: PaletteState = {
  open: true,
  minimized: true,
  dock: 'left',
  x: 140,
  y: 140,
  width: 260,
}

/** Franja (px) junto a cada borde lateral que dispara el acople al soltar. */
export const DOCK_THRESHOLD = 96
export const MIN_WIDTH = 180
export const MAX_WIDTH = 560

/**
 * Lado al que se acopla una paleta soltada en `x` (borde izquierdo de la paleta), o `null` si queda
 * flotante. Se mira el borde más cercano: el izquierdo con la posición y el derecho con `x + width`.
 */
export function dockFromDrop(x: number, width: number, viewportWidth: number, threshold = DOCK_THRESHOLD): DockSide {
  if (x <= threshold) return 'left'
  if (x + width >= viewportWidth - threshold) return 'right'
  return null
}

/** Mantiene la paleta dentro de la ventana (deja siempre visible su barra de título). */
export function clampToViewport(
  p: { x: number; y: number; width: number },
  viewportWidth: number,
  viewportHeight: number,
  titleHeight = 28,
): { x: number; y: number } {
  const maxX = Math.max(0, viewportWidth - Math.min(p.width, viewportWidth))
  const maxY = Math.max(0, viewportHeight - titleHeight)
  return {
    x: Math.min(Math.max(0, p.x), maxX),
    y: Math.min(Math.max(0, p.y), maxY),
  }
}

export function clampWidth(w: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)))
}

/** Normaliza un estado persistido (config del usuario) a un `PaletteState` válido. */
export function normalizePalette(raw: unknown): PaletteState {
  const r = (raw ?? {}) as Partial<Record<keyof PaletteState, unknown>>
  const num = (v: unknown, def: number): number => (typeof v === 'number' && isFinite(v) ? v : def)
  const dock = r.dock === 'left' || r.dock === 'right' ? r.dock : r.dock === null ? null : DEFAULT_PALETTE.dock
  return {
    open: typeof r.open === 'boolean' ? r.open : DEFAULT_PALETTE.open,
    minimized: typeof r.minimized === 'boolean' ? r.minimized : DEFAULT_PALETTE.minimized,
    dock,
    x: num(r.x, DEFAULT_PALETTE.x),
    y: num(r.y, DEFAULT_PALETTE.y),
    width: clampWidth(num(r.width, DEFAULT_PALETTE.width)),
  }
}
