import { aciToHex, hexToAci } from '../io/dxfColor'

/** Grosores estándar del CAD clásico, en mm (0 = Default). */
export const LINEWEIGHTS = [0, 0.05, 0.09, 0.13, 0.15, 0.18, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.53, 0.6, 0.7, 0.8, 0.9, 1, 1.06, 1.2, 1.4, 1.58, 2, 2.11]

/** Colores con nombre (ACI 1–7). */
export const NAMED_COLORS: Array<[string, string]> = [
  ['#ff0000', 'Red'],
  ['#ffff00', 'Yellow'],
  ['#00ff00', 'Green'],
  ['#00ffff', 'Cyan'],
  ['#0000ff', 'Blue'],
  ['#ff00ff', 'Magenta'],
  ['#ffffff', 'White'],
]

/** Rótulo de un color de objeto: ByLayer, su nombre, "Color n" (ACI) o el `#rrggbb`. */
export function colorLabel(hex: string | undefined): string {
  if (!hex) return 'ByLayer'
  const h = hex.toLowerCase()
  const named = NAMED_COLORS.find(([c]) => c === h)
  if (named) return named[1]
  const aci = hexToAci(h)
  return aciToHex(aci).toLowerCase() === h ? `Color ${aci}` : h
}

/** Rótulo de un grosor: ByLayer, Default o "0.25 mm". */
export function lineweightLabel(mm: number | undefined): string {
  if (mm === undefined || mm < 0) return 'ByLayer'
  return mm === 0 ? 'Default' : `${mm.toFixed(2)} mm`
}
