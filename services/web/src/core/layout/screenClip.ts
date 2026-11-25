/**
 * Recorte a la pantalla de lo que el layout pinta como elementos de la página.
 *
 * La hoja, su área imprimible y cada viewport flotante se ubican con el rectángulo que ocupan en pantalla. Con mucho
 * zoom en el papel esos rectángulos miden millones de px (y el canvas de un viewport, otro tanto): el navegador de un
 * teléfono se quedaba sin memoria. Como la «pantalla virtual» del CAD clásico, sólo se pinta lo que cae en la pantalla
 * (más un margen); un viewport recortado dibuja la parte visible de su vista entera (`ViewFrame`).
 */

/** Rectángulo en px, relativo al área de dibujo. */
export interface ScreenRect {
  left: number
  top: number
  width: number
  height: number
}

/** Parte visible de una vista más grande que su canvas (la forma de `ViewFrame` del controlador de cámara). */
export interface ScreenFrame {
  fullWidth: number
  fullHeight: number
  offsetX: number
  offsetY: number
}

/** Margen alrededor de la pantalla al recortar (px): deja afuera la sombra de la hoja y el contorno del viewport activo. */
export const SCREEN_MARGIN = 32

/**
 * Parte de `r` dentro de la pantalla de `w × h` px ampliada `margin` por lado; `null` si no se ve. Si `r` entra entero,
 * vuelve tal cual (así lo que ya se veía bien no cambia).
 */
export function clipToScreen(r: ScreenRect, w: number, h: number, margin = SCREEN_MARGIN): ScreenRect | null {
  const left = Math.max(r.left, -margin)
  const top = Math.max(r.top, -margin)
  const right = Math.min(r.left + r.width, w + margin)
  const bottom = Math.min(r.top + r.height, h + margin)
  if (!(right > left && bottom > top)) return null
  if (left === r.left && top === r.top && right === r.left + r.width && bottom === r.top + r.height) return r
  return { left, top, width: right - left, height: bottom - top }
}

/** Recorte de la vista de `full` que muestra `clip` (una parte de `full`); `null` si es la vista entera. */
export function frameOf(full: ScreenRect, clip: ScreenRect): ScreenFrame | null {
  if (clip === full || (clip.left === full.left && clip.top === full.top && clip.width === full.width && clip.height === full.height)) return null
  return { fullWidth: full.width, fullHeight: full.height, offsetX: clip.left - full.left, offsetY: clip.top - full.top }
}
