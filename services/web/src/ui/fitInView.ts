/** Rectángulo en píxeles de la ventana. */
export interface ScreenRect {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Corrimiento que trae el editor (texto y barra) dentro de `area` (la zona del dibujo) con un margen. Si no entra entero, manda la
 * esquina de arriba a la izquierda: ahí están la barra y su botón OK.
 */
export function fitInView(r: ScreenRect, area: ScreenRect, margin = 8): [number, number] {
  const axis = (lo: number, hi: number, min: number, max: number): number => {
    if (lo < min + margin) return min + margin - lo
    if (hi > max - margin) return Math.max(max - margin - hi, min + margin - lo)
    return 0
  }
  return [axis(r.left, r.right, area.left, area.right), axis(r.top, r.bottom, area.top, area.bottom)]
}
