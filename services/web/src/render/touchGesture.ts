/**
 * Gestos táctiles del viewport (PRD076). La matemática pura vive acá (con tests); el viewport la aplica.
 *
 * - `mobile` (vista para obra): un dedo navega (orbita en 3D, desplaza en 2D y en el papel) y, en un prompt de
 *   punto, apunta con una mira desplazada sobre el dedo; dos dedos hacen pinza y desplazan; doble toque = extents.
 * - `editor` (editor completo en una tablet): un dedo es el botón izquierdo del mouse; dos dedos navegan igual.
 */
export type TouchMode = 'editor' | 'mobile'

export const touchConfig: { mode: TouchMode; oneFinger: 'orbit' | 'pan' } = { mode: 'editor', oneFinger: 'orbit' }

/** La mira de medir queda este alto (px) por encima del dedo, para ver el punto que se toca. */
export const TOUCH_AIM_OFFSET = 72

export interface TouchPt {
  x: number
  y: number
}

/**
 * Un paso de pinza entre dos lecturas de los dos dedos. `zoom` sigue la convención del controlador
 * (`> 1` aleja): separar los dedos acerca. `mid` es el centro actual (el zoom se hace hacia ahí) y `pan` lo que
 * se movió ese centro.
 */
export function pinchStep(a0: TouchPt, b0: TouchPt, a1: TouchPt, b1: TouchPt): { zoom: number; mid: TouchPt; pan: TouchPt } {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y)
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y)
  // Dedos casi juntos: la razón se dispara; se acota cada paso.
  const zoom = d0 > 4 && d1 > 4 ? Math.min(2, Math.max(0.5, d0 / d1)) : 1
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }
  const mid = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 }
  return { zoom, mid, pan: { x: mid.x - m0.x, y: mid.y - m0.y } }
}

/** ¿Fue un toque (casi sin moverse y corto)? */
export const isTap = (start: TouchPt & { t: number }, end: TouchPt & { t: number }): boolean =>
  end.t - start.t < 350 && Math.hypot(end.x - start.x, end.y - start.y) < 10

/** ¿Este toque completa un doble toque con el anterior? */
export const isDoubleTap = (prev: (TouchPt & { t: number }) | null, cur: TouchPt & { t: number }): boolean =>
  !!prev && cur.t - prev.t < 350 && Math.hypot(cur.x - prev.x, cur.y - prev.y) < 40
