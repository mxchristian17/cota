import type { PlotStyle } from '../document/types'
import { PAGE_SIZES, type PageSize, type PlotArea } from './pdf'

/** Qué se plotea del modelo: las extensiones, lo que se ve en el viewport o una ventana. */
export type PlotAreaKind = 'extents' | 'display' | 'window'

/** Opciones del diálogo PLOT para el modelo (un layout usa su Page Setup). */
export interface PlotSettings {
  /** Clave de `PAGE_SIZES`. */
  paper: string
  portrait: boolean
  area: PlotAreaKind
  window: PlotArea | null
  /** Escala papel:dibujo (1 = 1:1, 0.01 = 1:100); null = ajustar al papel. */
  scale: number | null
  center: boolean
  plotStyle: PlotStyle
  lineWeights: boolean
}

export const DEFAULT_PLOT: PlotSettings = {
  paper: 'A4',
  portrait: false,
  area: 'extents',
  window: null,
  scale: null,
  center: true,
  plotStyle: 'color',
  lineWeights: true,
}

export const PAPER_LABELS: Record<string, string> = {
  A4: 'ISO A4 (297 × 210 mm)',
  A3: 'ISO A3 (420 × 297 mm)',
  A2: 'ISO A2 (594 × 420 mm)',
  A1: 'ISO A1 (841 × 594 mm)',
  A0: 'ISO A0 (1189 × 841 mm)',
  LETTER: 'ANSI Letter (11 × 8.5 in)',
  LEGAL: 'ANSI Legal (14 × 8.5 in)',
  TABLOID: 'ANSI Tabloid (17 × 11 in)',
}

/** Tamaño de la hoja en puntos con su orientación. */
export function plotPage(s: Pick<PlotSettings, 'paper' | 'portrait'>): PageSize {
  const p = PAGE_SIZES[s.paper] ?? PAGE_SIZES.A4
  return s.portrait ? { w: p.h, h: p.w } : p
}
