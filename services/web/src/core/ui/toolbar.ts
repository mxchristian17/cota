/**
 * Barras de herramientas acoplables, como las del CAD clásico: acopladas a un borde del área de
 * dibujo (izquierda, derecha, arriba o abajo; por defecto a la izquierda) o flotantes en una ventana
 * con título y cierre; se vuelven a mostrar desde el menú Vista o con TOOLBAR. Lógica pura (sin DOM).
 */
export type ToolbarSide = 'left' | 'right' | 'top' | 'bottom'
const SIDES: ToolbarSide[] = ['left', 'right', 'top', 'bottom']

export interface ToolbarState {
  visible: boolean
  /** Acoplada a un borde del dibujo (`side`); false = flotante. */
  docked: boolean
  side: ToolbarSide
  /** Esquina superior izquierda cuando flota (px de la ventana). */
  x: number
  y: number
  /** Posición entre las barras acopladas al mismo borde (menor = primero). */
  order: number
}

export const DEFAULT_TOOLBAR: ToolbarState = { visible: true, docked: true, side: 'left', x: 220, y: 120, order: 0 }

/** Franja (px) bajo el borde superior del área de dibujo en la que una barra flotante se acopla al soltarla. */
export const TOOLBAR_DOCK_BAND = 24

/** ¿Se acopla una barra soltada con su borde superior en `y`, si el área de dibujo empieza en `top`? */
export const docksAt = (y: number, top: number, band = TOOLBAR_DOCK_BAND): boolean => y <= top + band

/**
 * Borde al que se acopla una barra soltada con el cursor en (x, y), dado el rectángulo del área de dibujo;
 * null si queda flotante. Gana el borde más cercano dentro de la franja.
 */
export function dockSideAt(x: number, y: number, r: { left: number; top: number; right: number; bottom: number }, band = TOOLBAR_DOCK_BAND * 2): ToolbarSide | null {
  const d: Array<[ToolbarSide, number]> = [
    ['left', x - r.left],
    ['right', r.right - x],
    ['top', y - r.top],
    ['bottom', r.bottom - y],
  ]
  const near = d.filter(([, v]) => v <= band).sort((a, b) => a[1] - b[1])
  return near.length ? near[0][0] : null
}

/** Mantiene una barra flotante dentro de la ventana (con su título visible). */
export function clampToolbar(t: { x: number; y: number }, width: number, vw: number, vh: number, titleHeight = 22): { x: number; y: number } {
  return {
    x: Math.min(Math.max(0, t.x), Math.max(0, vw - Math.min(width, vw))),
    y: Math.min(Math.max(0, t.y), Math.max(0, vh - titleHeight)),
  }
}

export function normalizeToolbar(raw: unknown, def: ToolbarState = DEFAULT_TOOLBAR): ToolbarState {
  const r = (raw ?? {}) as Partial<Record<keyof ToolbarState, unknown>>
  const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d)
  return {
    visible: typeof r.visible === 'boolean' ? r.visible : def.visible,
    docked: typeof r.docked === 'boolean' ? r.docked : def.docked,
    side: SIDES.includes(r.side as ToolbarSide) ? (r.side as ToolbarSide) : def.side,
    x: num(r.x, def.x),
    y: num(r.y, def.y),
    order: num(r.order, def.order),
  }
}

/** Estado de todas las barras, por id. */
export type ToolbarStates = Record<string, ToolbarState>

/** Estados guardados (o corruptos, o de una versión anterior) completados con los valores por defecto. */
export function normalizeToolbars(raw: unknown, defaults: ToolbarStates): ToolbarStates {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out: ToolbarStates = {}
  for (const [id, def] of Object.entries(defaults)) out[id] = normalizeToolbar(r[id], def)
  return out
}

/** Barras visibles acopladas a un borde, en su orden. */
export function dockedOn(states: ToolbarStates, side: ToolbarSide): string[] {
  return Object.entries(states)
    .filter(([, t]) => t.visible && t.docked && t.side === side)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([id]) => id)
}

/**
 * Acopla (y muestra) una barra en un borde, en la posición `index` entre las que ya están ahí (al final si no
 * se indica), y renumera el orden de ese borde.
 */
export function dockToolbar(states: ToolbarStates, id: string, side: ToolbarSide, index?: number): ToolbarStates {
  const others = dockedOn(states, side).filter((k) => k !== id)
  const at = index === undefined ? others.length : Math.max(0, Math.min(index, others.length))
  others.splice(at, 0, id)
  const out: ToolbarStates = { ...states, [id]: { ...states[id], visible: true, docked: true, side } }
  others.forEach((k, i) => (out[k] = { ...out[k], order: i }))
  return out
}

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Lugar donde cae una barra soltada en (x, y) entre las barras de un borde (sus rectángulos, en su orden).
 * Arriba y abajo se leen por filas (de arriba hacia abajo y de izquierda a derecha); a los costados, por
 * columnas.
 */
export function insertIndex(rects: Rect[], x: number, y: number, side: ToolbarSide): number {
  const rows = side === 'top' || side === 'bottom'
  let n = 0
  for (const r of rects) {
    const cx = (r.left + r.right) / 2
    const cy = (r.top + r.bottom) / 2
    const before = rows ? r.bottom <= y || (r.top <= y && cx < x) : r.right <= x || (r.left <= x && cy < y)
    if (before) n++
  }
  return n
}
