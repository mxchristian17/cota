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

/**
 * Ancho de ventana desde el que el panel del agente arranca abierto en la primera visita (propuesta de interfaz
 * 2026-11-17): con 340 px de panel, el dibujo conserva unos 1280 px. En pantallas más angostas arranca cerrado, con el
 * riel «Agents» a la vista; abrirlo a mano queda guardado en las preferencias como siempre.
 */
export const AGENT_AUTO_OPEN_MIN_WIDTH = 1680

/** ¿El panel del agente arranca abierto en la primera visita (sin preferencia guardada) con esta ventana? */
export const agentOpensByDefault = (windowWidth: number): boolean => windowWidth >= AGENT_AUTO_OPEN_MIN_WIDTH

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
 * Posición del botón «Mobile view»: abajo al centro del dibujo (no tapa los menús ni las barras; decisión de
 * Christian, 2026-11-17) y, si el navegador quedó con zoom o corrido, siempre dentro de lo visible y del mismo tamaño
 * en la pantalla (`scale` compensa el zoom). Sin zoom cae en píxeles enteros (el ícono queda nítido). `size` es el
 * tamaño del botón sin escalar; sin dibujo (`draw` null) va arriba a la izquierda de lo visible.
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
  const left = draw ? (draw.left + draw.right - w) / 2 : minL
  const top = draw ? draw.bottom - margin - h : minT
  const px = (v: number) => (k === 1 ? Math.round(v) : v)
  return { left: px(clamp(left, minL, maxL)), top: px(clamp(top, minT, maxT)), scale: k }
}
