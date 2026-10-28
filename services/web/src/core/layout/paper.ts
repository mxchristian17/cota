import type { PageSetup } from '../document/types'

/** Papel estándar: tamaño en mm en vertical ([ancho, alto], ancho ≤ alto). */
export interface PaperSize {
  label: string
  size: [number, number]
}

/** Papeles disponibles (PAGESETUP): ISO A, ANSI y formatos locales. */
export const PAPER_SIZES: Record<string, PaperSize> = {
  A4: { label: 'ISO A4 (210 × 297 mm)', size: [210, 297] },
  A3: { label: 'ISO A3 (297 × 420 mm)', size: [297, 420] },
  A2: { label: 'ISO A2 (420 × 594 mm)', size: [420, 594] },
  A1: { label: 'ISO A1 (594 × 841 mm)', size: [594, 841] },
  A0: { label: 'ISO A0 (841 × 1189 mm)', size: [841, 1189] },
  CARTA: { label: 'Letter / ANSI A (8.5 × 11 in)', size: [215.9, 279.4] },
  OFICIO: { label: 'Oficio, Latin America (216 × 340 mm)', size: [216, 340] },
  ANSI_B: { label: 'ANSI B (279 × 432 mm)', size: [279.4, 431.8] },
  ANSI_C: { label: 'ANSI C (432 × 559 mm)', size: [431.8, 558.8] },
  ANSI_D: { label: 'ANSI D (559 × 864 mm)', size: [558.8, 863.6] },
}

/** Configuración de página por defecto: papel ISO apaisado, 5 mm de margen, color y lineweights. */
export function defaultPageSetup(paper = 'A3'): PageSetup {
  return {
    paper,
    orientation: 'landscape',
    marginsMm: [5, 5, 5, 5],
    plotStyle: 'color',
    plotLineweights: true,
    paperspaceLast: false,
    hidePaperspaceObjects: false,
  }
}

/** Tamaño de la hoja en mm ya orientado. El origen del papel es su esquina inferior izquierda. */
export function paperSizeMm(ps: PageSetup): { width: number; height: number } {
  const [a, b] = ps.paper === 'CUSTOM' && ps.customSize ? ps.customSize : (PAPER_SIZES[ps.paper] ?? PAPER_SIZES.A3).size
  const short = Math.min(a, b)
  const long = Math.max(a, b)
  return ps.orientation === 'landscape' ? { width: long, height: short } : { width: short, height: long }
}

/** Área imprimible (dentro de los márgenes), en mm del papel. */
export function printableArea(ps: PageSetup): { minX: number; minY: number; maxX: number; maxY: number } {
  const { width, height } = paperSizeMm(ps)
  const [top, right, bottom, left] = ps.marginsMm
  return { minX: left, minY: bottom, maxX: width - right, maxY: height - top }
}
