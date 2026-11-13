/**
 * Vista completa (la de escritorio) abierta en un celular: ubicación del botón flotante para volver a la vista del
 * celular y paneles que arrancan cerrados. Lógica pura (sin DOM) para poder testearla.
 */

/**
 * ¿Se ve el panel del agente? En la vista completa del celular sólo si se abrió a mano en esta sesión: ahí taparía el
 * dibujo, así que arranca cerrado aunque la preferencia guardada diga abierto.
 */
export const agentVisible = (s: { agentOpen: boolean; agentShown: boolean }, phone: boolean): boolean =>
  s.agentOpen && (s.agentShown || !phone)

/** Rectángulo en px de la página (coordenadas de `getBoundingClientRect`). */
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Lo que se ve de la página (`window.visualViewport`): corrimiento y zoom del navegador. */
export interface Visual {
  offsetLeft: number
  offsetTop: number
  width: number
  height: number
  scale: number
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max))

/**
 * Posición del botón «Mobile view»: abajo a la derecha del dibujo (no tapa los menús ni las barras) y, si el navegador
 * quedó con zoom o corrido, siempre dentro de lo visible y del mismo tamaño en la pantalla (`scale` compensa el zoom).
 * `size` es el tamaño del botón sin escalar; sin dibujo (`draw` null) va arriba a la izquierda de lo visible.
 */
export function backButtonPos(draw: Box | null, vv: Visual, size: { w: number; h: number }, margin = 10): { left: number; top: number; scale: number } {
  const k = 1 / (vv.scale || 1)
  const w = size.w * k
  const h = size.h * k
  const m = margin * k
  const minL = vv.offsetLeft + m
  const minT = vv.offsetTop + m
  const maxL = vv.offsetLeft + vv.width - w - m
  const maxT = vv.offsetTop + vv.height - h - m
  const left = draw ? draw.right - margin - w : minL
  const top = draw ? draw.bottom - margin - h : minT
  return { left: clamp(left, minL, maxL), top: clamp(top, minT, maxT), scale: k }
}
