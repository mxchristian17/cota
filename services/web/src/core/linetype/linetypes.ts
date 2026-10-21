import type { Layer } from '../document/types'

/**
 * Tipos de línea, como los `.lin` del CAD clásico. Un patrón es la lista de elementos de una
 * repetición, en unidades del dibujo: trazo (> 0), hueco (< 0) y punto (0). Un patrón vacío es continuo.
 */
export interface LinetypeDef {
  name: string
  description: string
  pattern: number[]
}

/** Valores especiales de la propiedad *Linetype* de un objeto. */
export const BYLAYER = 'BYLAYER'
export const BYBLOCK = 'BYBLOCK'
export const CONTINUOUS = 'CONTINUOUS'

/**
 * Prefijo interno de una entidad expandida de un bloque que toma el tipo de línea de una capa que no es la
 * suya (ByBlock dentro de una inserción ByLayer). Nunca se guarda en el dibujo.
 */
export const BYLAYER_OF = 'BYLAYER:'

/** Dibujo de muestra de un patrón (trazos `_`, puntos `.`, huecos), generado del propio patrón. */
export function linetypeArt(pattern: number[], width = 36): string {
  const sizes = pattern.filter((x) => x !== 0).map(Math.abs)
  if (!sizes.length) return pattern.length ? '. '.repeat(width / 2).trimEnd() : '_'.repeat(width)
  const k = 2 / Math.min(...sizes)
  const n = (x: number, max: number) => Math.min(max, Math.max(1, Math.round(x * k)))
  const cycle = pattern.map((x) => (x > 0 ? '_'.repeat(n(x, 8)) : x === 0 ? '.' : ' '.repeat(n(-x, 2)))).join('')
  return cycle.repeat(Math.ceil(width / cycle.length) + 1).slice(0, width).trimEnd()
}

/** Nombres de los tipos ISO 128 por número (términos de la norma). */
const ISO_TERMS: Record<string, string> = {
  '02': 'dashed', '03': 'dashed spaced', '04': 'long-dashed dotted', '05': 'long-dashed double-dotted',
  '06': 'long-dashed triplicate-dotted', '07': 'dotted', '08': 'long-dashed short-dashed',
  '09': 'long-dashed double-short-dashed', '10': 'dashed dotted', '11': 'double-dashed dotted',
  '12': 'dashed double-dotted', '13': 'double-dashed double-dotted', '14': 'dashed triplicate-dotted',
  '15': 'double-dashed triplicate-dotted',
}
const FAMILY_LABEL: Record<string, string> = {
  BORDER: 'Border line', CENTER: 'Center line', DASHDOT: 'Dash-dot line', DASHED: 'Dashed line',
  DIVIDE: 'Divide line', DOT: 'Dotted line', HIDDEN: 'Hidden line', PHANTOM: 'Phantom line',
}

/** Descripción propia de un tipo de la biblioteca: su nombre en palabras y una muestra del patrón. */
export function linetypeDescription(name: string, pattern: number[]): string {
  const iso = /ISO(\d{2})W100$/.exec(name)
  if (iso) return `ISO 128 ${iso[1]}, ${ISO_TERMS[iso[1]] ?? 'line'}  ${linetypeArt(pattern, 24)}`
  const m = /^([A-Z]+?)(X2|2)?$/.exec(name)
  const label = (m && FAMILY_LABEL[m[1]]) ?? name
  const size = m?.[2] === '2' ? ' (half)' : m?.[2] === 'X2' ? ' (double)' : ''
  return `${label}${size}  ${linetypeArt(pattern, 24)}`
}

const def = (name: string, pattern: number[]): LinetypeDef => ({ name, description: linetypeDescription(name, pattern), pattern })

/** Familias de la biblioteca en pulgadas (la métrica = ×25,4). */
const IMPERIAL_FAMILIES: Array<[string, number[]]> = [
  ['BORDER', [0.5, -0.25, 0.5, -0.25, 0, -0.25]],
  ['BORDER2', [0.25, -0.125, 0.25, -0.125, 0, -0.125]],
  ['BORDERX2', [1, -0.5, 1, -0.5, 0, -0.5]],
  ['CENTER', [1.25, -0.25, 0.25, -0.25]],
  ['CENTER2', [0.75, -0.125, 0.125, -0.125]],
  ['CENTERX2', [2.5, -0.5, 0.5, -0.5]],
  ['DASHDOT', [0.5, -0.25, 0, -0.25]],
  ['DASHDOT2', [0.25, -0.125, 0, -0.125]],
  ['DASHDOTX2', [1, -0.5, 0, -0.5]],
  ['DASHED', [0.5, -0.25]],
  ['DASHED2', [0.25, -0.125]],
  ['DASHEDX2', [1, -0.5]],
  ['DIVIDE', [0.5, -0.25, 0, -0.25, 0, -0.25]],
  ['DIVIDE2', [0.25, -0.125, 0, -0.125, 0, -0.125]],
  ['DIVIDEX2', [1, -0.5, 0, -0.5, 0, -0.5]],
  ['DOT', [0, -0.25]],
  ['DOT2', [0, -0.125]],
  ['DOTX2', [0, -0.5]],
  ['HIDDEN', [0.25, -0.125]],
  ['HIDDEN2', [0.125, -0.0625]],
  ['HIDDENX2', [0.5, -0.25]],
  ['PHANTOM', [1.25, -0.25, 0.25, -0.25, 0.25, -0.25]],
  ['PHANTOM2', [0.625, -0.125, 0.125, -0.125, 0.125, -0.125]],
  ['PHANTOMX2', [2.5, -0.5, 0.5, -0.5, 0.5, -0.5]],
]

/** Tipos ISO (en mm en los dos archivos, como el CAD clásico). */
const ISO: LinetypeDef[] = [
  def('ISO02W100', [12, -3]),
  def('ISO03W100', [12, -18]),
  def('ISO04W100', [24, -3, 0, -3]),
  def('ISO05W100', [24, -3, 0, -3, 0, -3]),
  def('ISO06W100', [24, -3, 0, -3, 0, -3, 0, -3]),
  def('ISO07W100', [0, -3]),
  def('ISO08W100', [24, -3, 6, -3]),
  def('ISO09W100', [24, -3, 6, -3, 6, -3]),
  def('ISO10W100', [12, -3, 0, -3]),
  def('ISO11W100', [12, -3, 12, -3, 0, -3]),
  def('ISO12W100', [12, -3, 0, -3, 0, -3]),
  def('ISO13W100', [12, -3, 12, -3, 0, -3, 0, -3]),
  def('ISO14W100', [12, -3, 0, -3, 0, -3, 0, -3]),
  def('ISO15W100', [12, -3, 12, -3, 0, -3, 0, -3, 0, -3]),
]

export const CONTINUOUS_DEF: LinetypeDef = { name: CONTINUOUS, description: 'Solid line', pattern: [] }

/** ¿Unidades imperiales? Entonces se usa la biblioteca en pulgadas (como `MEASUREMENT` = 0). */
export const isImperial = (units: string): boolean => /^(in|inch|inches|ft|feet|foot|mi|yd)$/i.test(units.trim())

/** Biblioteca disponible para cargar (la métrica o la de pulgadas, según las unidades del dibujo). */
export function linetypeLibrary(units = 'mm'): LinetypeDef[] {
  const k = isImperial(units) ? 1 : 25.4
  return [...IMPERIAL_FAMILIES.map(([n, p]) => def(n, p.map((x) => x * k))), ...ISO.map((d) => ({ ...d, pattern: [...d.pattern] }))]
}

/** Definición de la biblioteca por nombre (sin distinguir mayúsculas). */
export function libraryLinetype(name: string, units = 'mm'): LinetypeDef | undefined {
  // Los ISO de otros programas pueden traer un prefijo (`<PREFIJO>_ISO02W100`): se reconocen igual.
  name = name.replace(/^[A-Za-z]+_(?=ISO\d{2}W100$)/i, '')
  const up = name.trim().toUpperCase()
  if (up === CONTINUOUS) return { ...CONTINUOUS_DEF, pattern: [] }
  return linetypeLibrary(units).find((d) => d.name === up)
}

/** Nombres que no son tipos de la tabla (ByLayer/ByBlock). */
export const isSpecialLinetype = (name: string | undefined): boolean => {
  const up = (name ?? '').toUpperCase()
  return up === BYLAYER || up === BYBLOCK || up.startsWith(BYLAYER_OF)
}

/** Nombre a mostrar de un valor de la propiedad (ByLayer/ByBlock con la capitalización del CAD clásico). */
export function linetypeLabel(name: string | undefined): string {
  const up = (name ?? BYLAYER).toUpperCase()
  if (up === BYLAYER || up.startsWith(BYLAYER_OF)) return 'ByLayer'
  if (up === BYBLOCK) return 'ByBlock'
  if (up === CONTINUOUS) return 'Continuous'
  return up
}

/**
 * Tipo de línea efectivo de una entidad: el suyo, el de su capa (ByLayer) o continuo (ByBlock fuera de un
 * bloque). `layerOf` resuelve las capas por id (para el ByBlock de una inserción ByLayer).
 */
export function effectiveLinetype(e: { lineType?: string; layer: string }, layerOf: (id: string) => Layer | undefined): string {
  const lt = e.lineType
  if (!lt || lt.toUpperCase() === BYLAYER) return (layerOf(e.layer)?.lineType ?? CONTINUOUS).toUpperCase()
  if (lt.startsWith(BYLAYER_OF)) return (layerOf(lt.slice(BYLAYER_OF.length))?.lineType ?? CONTINUOUS).toUpperCase()
  if (lt.toUpperCase() === BYBLOCK) return CONTINUOUS
  return lt.toUpperCase()
}

/** Largo de una repetición del patrón. */
export const patternLength = (p: number[]): number => p.reduce((s, x) => s + Math.abs(x), 0)

/** Contexto para generar los trazos: patrones por nombre, escala del espacio y PLINEGEN. */
export interface LinetypeContext {
  patterns: Map<string, number[]>
  /** Escala del espacio: `LTSCALE` × (MSLTSCALE/PSLTSCALE según corresponda). */
  factor: number
  /** PLINEGEN del dibujo (las polilíneas también pueden traer el suyo). */
  plinegen: boolean
  /** PSLTSCALE: en los viewports del layout los trazos miden en mm del papel (ploteo de layouts). */
  psltscale?: boolean
}

/** Patrón (ya escalado) que corresponde a una entidad, o null si se dibuja continua. */
export function entityPattern(
  e: { lineType?: string; ltScale?: number; layer: string },
  layerOf: (id: string) => Layer | undefined,
  ctx: LinetypeContext | undefined,
): number[] | null {
  if (!ctx) return null
  const p = ctx.patterns.get(effectiveLinetype(e, layerOf))
  if (!p || p.length === 0) return null
  const s = ctx.factor * (e.ltScale ?? 1)
  if (!(s > 0) || !isFinite(s)) return null
  const out = p.map((x) => x * s)
  return patternLength(out) > 0 ? out : null
}
