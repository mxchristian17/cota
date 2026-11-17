/**
 * Íconos de la interfaz (barra superior, barra de estado, paneles y diálogos). Mismo lenguaje y mismo motor que los
 * de las barras de herramientas (`iconGrid.ts`): se dibujan en la grilla de diseño de 16 y salen ajustados a la
 * grilla del tamaño en que se muestran (12, 13, 14, 16 o 22 px), con trazo de 1 px y esquinas vivas. Reemplazan a los
 * emoji y glifos Unicode (☰ ⚙ ✕ 📁 …), que cambiaban de forma y de tamaño según el sistema.
 */
import { gridFor, type IconDraw } from './iconGrid'

const ICONS = {
  /** Mostrar/ocultar la paleta de Propiedades: ventana con la columna izquierda marcada. */
  'panel-left': (g) => g.r(2.5, 3.5, 13.5, 12.5) + g.l(6.5, 3.5, 6.5, 12.5),
  /** Expandir la paleta colapsada: ventana con la barra de título. */
  'panel-open': (g) => g.r(2.5, 3.5, 13.5, 12.5) + g.l(2.5, 6.5, 13.5, 6.5),
  folder: (g) => g.d('M1.5 12.5 V3.5 H6.5 L8.5 5.5 H14.5 V12.5 Z'),
  cloud: (g) => g.d('M4.5 12.5 H11.5 A3 3 0 0 0 12.3 6.6 A4 4 0 0 0 4.7 6.3 A3 3 0 0 0 4.5 12.5 Z'),
  /** Ajustes: dos reguladores deslizantes (el engranaje se confundía con el sol de «descongelada»). */
  gear: (g) =>
    g.l(2.5, 5.5, 8.5, 5.5) + g.l(11.5, 5.5, 13.5, 5.5) + g.r(8.5, 3.5, 11.5, 7.5) + g.l(2.5, 10.5, 4.5, 10.5) + g.l(7.5, 10.5, 13.5, 10.5) + g.r(4.5, 8.5, 7.5, 12.5),
  close: (g) => g.l(4.5, 4.5, 11.5, 11.5) + g.l(11.5, 4.5, 4.5, 11.5),
  minus: (g) => g.l(4.5, 7.5, 11.5, 7.5),
  plus: (g) => g.l(7.5, 3.5, 7.5, 11.5) + g.l(3.5, 7.5, 11.5, 7.5),
  /** Cursor de selección. */
  cursor: (g) => g.pg([3.5, 2.5, 12.5, 7.5, 8.5, 8.5, 6.5, 12.5]),
  check: (g) => g.p([3.5, 8.5, 6.5, 11.5, 12.5, 4.5]),
  /**
   * Más acciones: tres puntos en vertical. Son grips (3 px siempre, centrados en un píxel): con rellenos de 2 × 2 en la
   * grilla de diseño, a 22 y 24 px el ajuste los dejaba de tamaños o separaciones distintas.
   */
  more: (g) => g.grip(7.5, 2.5) + g.grip(7.5, 7.5) + g.grip(7.5, 12.5),
  /** Restaurar una ventana minimizada. */
  restore: (g) => g.r(2.5, 5.5, 10.5, 13.5) + g.p([5.5, 5.5, 5.5, 2.5, 13.5, 2.5, 13.5, 10.5, 10.5, 10.5]),
  /** Cota anotativa (escala de anotación): balanza. */
  scale: (g) => g.l(7.5, 2.5, 7.5, 13.5) + g.l(4.5, 13.5, 10.5, 13.5) + g.l(2.5, 3.5, 12.5, 3.5) + g.pg([2.5, 3.5, 0.5, 8.5, 4.5, 8.5]) + g.pg([12.5, 3.5, 10.5, 8.5, 14.5, 8.5]),
  /** Administrador de capas: tres hojas apiladas. */
  layers: (g) => g.pg([7.5, 2.5, 13.5, 5.5, 7.5, 8.5, 1.5, 5.5]) + g.p([1.5, 8.5, 7.5, 11.5, 13.5, 8.5]) + g.p([1.5, 11.5, 7.5, 14.5, 13.5, 11.5]),
  /** Pantalla completa: cuatro esquinas hacia afuera. */
  expand: (g) => g.p([2.5, 5.5, 2.5, 2.5, 5.5, 2.5]) + g.p([9.5, 2.5, 12.5, 2.5, 12.5, 5.5]) + g.p([12.5, 9.5, 12.5, 12.5, 9.5, 12.5]) + g.p([5.5, 12.5, 2.5, 12.5, 2.5, 9.5]),
  /** Pantalla limpia: el marco de la ventana sin barras. */
  clean: (g) => g.r(2.5, 2.5, 12.5, 12.5) + g.r(5.5, 5.5, 9.5, 9.5),
  'caret-down': (g) => g.p([4.5, 6.5, 7.5, 9.5, 10.5, 6.5]),
  'chevron-right': (g) => g.p([6.5, 4.5, 9.5, 7.5, 6.5, 10.5]),
  eye: (g) => g.d('M1.5 7.5 Q7.5 0.5 13.5 7.5 Q7.5 14.5 1.5 7.5 Z') + g.c(7.5, 7.5, 2),
  'eye-off': (g) => g.d('M1.5 7.5 Q7.5 0.5 13.5 7.5 Q7.5 14.5 1.5 7.5 Z') + g.l(2.5, 12.5, 12.5, 2.5),
  sun: (g) =>
    g.c(7.5, 7.5, 2) +
    g.l(7.5, 1.5, 7.5, 2.5) + g.l(7.5, 12.5, 7.5, 13.5) + g.l(1.5, 7.5, 2.5, 7.5) + g.l(12.5, 7.5, 13.5, 7.5) +
    g.l(3.5, 3.5, 4.5, 4.5) + g.l(10.5, 10.5, 11.5, 11.5) + g.l(3.5, 11.5, 4.5, 10.5) + g.l(10.5, 4.5, 11.5, 3.5),
  snow: (g) => g.l(7.5, 1.5, 7.5, 13.5) + g.l(2.5, 4.5, 12.5, 10.5) + g.l(2.5, 10.5, 12.5, 4.5) + g.p([5.5, 2.5, 7.5, 4.5, 9.5, 2.5]) + g.p([5.5, 12.5, 7.5, 10.5, 9.5, 12.5]),
  trash: (g) => g.l(2.5, 4.5, 12.5, 4.5) + g.p([5.5, 4.5, 5.5, 2.5, 9.5, 2.5, 9.5, 4.5]) + g.p([3.5, 4.5, 4.5, 13.5, 10.5, 13.5, 11.5, 4.5]) + g.l(6.5, 7.5, 6.5, 10.5) + g.l(8.5, 7.5, 8.5, 10.5),
  phone: (g) => g.r(4.5, 1.5, 10.5, 13.5) + g.l(6.5, 11.5, 8.5, 11.5),
  /** Agente: globo de diálogo con el cursor de la línea de comandos. */
  agent: (g) => g.d('M2.5 3.5 H13.5 V10.5 H7.5 L4.5 13.5 V10.5 H2.5 Z') + g.p([5.5, 5.5, 7.5, 7, 5.5, 8.5]) + g.l(8.5, 8.5, 10.5, 8.5),
} satisfies Record<string, IconDraw>

export type UiIconName = keyof typeof ICONS

export const UI_ICON_NAMES = Object.keys(ICONS) as UiIconName[]

const cache = new Map<string, string>()
/** Marcado de un ícono de interfaz en `size` píxeles (memorizado). */
export const uiIconMarkup = (name: UiIconName, size: number): string => {
  const key = `${size}:${name}`
  let s = cache.get(key)
  if (s === undefined) cache.set(key, (s = ICONS[name](gridFor(size))))
  return s
}

export function UiIcon({ name, size = 16, className }: { name: UiIconName; size?: number; className?: string }) {
  return (
    <svg
      className={'ui-icon' + (className ? ` ${className}` : '')}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeMiterlimit="2"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: uiIconMarkup(name, size) }}
    />
  )
}
