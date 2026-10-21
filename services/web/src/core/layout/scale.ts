/** Escalas estándar de viewport (relación papel:modelo), como la lista del CAD clásico. */
export const STANDARD_SCALES: { label: string; value: number }[] = (
  [
    ['1:1', 1],
    ['1:2', 1 / 2],
    ['1:5', 1 / 5],
    ['1:10', 1 / 10],
    ['1:20', 1 / 20],
    ['1:25', 1 / 25],
    ['1:50', 1 / 50],
    ['1:75', 1 / 75],
    ['1:100', 1 / 100],
    ['1:200', 1 / 200],
    ['1:250', 1 / 250],
    ['1:500', 1 / 500],
    ['1:1000', 1 / 1000],
    ['2:1', 2],
    ['5:1', 5],
    ['10:1', 10],
  ] as const
).map(([label, value]) => ({ label, value }))

const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 }

/** Milímetros por unidad del dibujo (`DocumentData.units`); desconocida = mm. */
export function unitToMm(units: string): number {
  return UNIT_MM[units] ?? 1
}

/** Milímetros de papel por unidad de modelo para una escala papel:modelo. */
export function paperPerModel(scale: number, units: string): number {
  return scale * unitToMm(units)
}

/** Unidades de modelo por mm de papel para una escala papel:modelo (tamaño de lo anotativo). */
export function annoScaleOf(scale: number, units: string): number {
  return 1 / paperPerModel(scale, units)
}

/** Escala estándar que coincide con `value` (tolerancia relativa), o undefined si es personalizada. */
export function standardScale(value: number): { label: string; value: number } | undefined {
  return STANDARD_SCALES.find((s) => Math.abs(s.value - value) <= value * 1e-6)
}

const trim = (n: number): string => String(Number(n.toPrecision(6)))

/** Etiqueta de una escala: la estándar si coincide; si no `1:n` (reducción) o `n:1` (ampliación). */
export function formatScale(value: number): string {
  const std = standardScale(value)
  if (std) return std.label
  return value < 1 ? `1:${trim(1 / value)}` : `${trim(value)}:1`
}

/**
 * Interpreta una escala escrita por el usuario: `1:50`, `1/50`, `2:1`, `0.02` o con sufijo `xp`
 * (ZOOM nXP). Devuelve la relación papel:modelo, o null si no es válida.
 */
export function parseScale(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/xp$/, '').replace(',', '.').trim()
  const m = /^(\d*\.?\d+)\s*[:/]\s*(\d*\.?\d+)$/.exec(t)
  const v = m ? Number(m[1]) / Number(m[2]) : /^\d*\.?\d+$/.test(t) ? Number(t) : NaN
  return Number.isFinite(v) && v > 0 ? v : null
}
