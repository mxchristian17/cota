/**
 * Estilos de cota con paridad el CAD clásico.
 *
 * Las variables usan los nombres y códigos DXF del CAD clásico (`DIMTXT`, `DIMASZ`…) para que `DIMSTYLE`, la
 * paleta, la línea de comandos (`DIMTXT 3.5`) y el DXF hablen el mismo idioma. Un estilo (`DimStyleDef`)
 * define todas; cada cota guarda el nombre de su estilo, sus *overrides* y una copia resuelta (`style`)
 * que es lo que dibuja la geometría. Al modificar un estilo se vuelven a resolver sus cotas.
 */

/** Bloques de flecha del CAD clásico (`DIMBLK`), más `_IRAM` (cerrada rellena 4:1, la de ). */
export const ARROW_TYPES = [
  '',
  '_IRAM',
  '_CLOSEDBLANK',
  '_CLOSED',
  '_DOT',
  '_ARCHTICK',
  '_OBLIQUE',
  '_OPEN',
  '_ORIGIN',
  '_ORIGIN2',
  '_OPEN90',
  '_OPEN30',
  '_DOTSMALL',
  '_DOTBLANK',
  '_SMALL',
  '_BOXBLANK',
  '_BOXFILLED',
  '_DATUMBLANK',
  '_DATUMFILLED',
  '_INTEGRAL',
  '_NONE',
] as const
export type ArrowType = (typeof ARROW_TYPES)[number]

export const ARROW_LABELS: Record<ArrowType, string> = {
  '': 'Closed filled',
  _IRAM: 'Closed filled 4:1 (IRAM)',
  _CLOSEDBLANK: 'Closed blank',
  _CLOSED: 'Closed',
  _DOT: 'Dot',
  _ARCHTICK: 'Architectural tick',
  _OBLIQUE: 'Oblique',
  _OPEN: 'Open',
  _ORIGIN: 'Origin indicator',
  _ORIGIN2: 'Origin indicator 2',
  _OPEN90: 'Right angle',
  _OPEN30: 'Open 30',
  _DOTSMALL: 'Dot small',
  _DOTBLANK: 'Dot blank',
  _SMALL: 'Dot small blank',
  _BOXBLANK: 'Box',
  _BOXFILLED: 'Box filled',
  _DATUMBLANK: 'Datum triangle',
  _DATUMFILLED: 'Datum triangle filled',
  _INTEGRAL: 'Integral',
  _NONE: 'None',
}

/** Variables de un estilo de cota (nombres del CAD clásico). Colores: hex o null = ByLayer; grosores en mm o null = ByLayer. */
export interface DimVars {
  // Lines
  DIMCLRD: string | null
  DIMLWD: number | null
  DIMDLE: number
  DIMDLI: number
  DIMSD1: boolean
  DIMSD2: boolean
  DIMCLRE: string | null
  DIMLWE: number | null
  DIMEXE: number
  DIMEXO: number
  DIMFXLON: boolean
  DIMFXL: number
  DIMSE1: boolean
  DIMSE2: boolean
  // Symbols and arrows
  DIMBLK1: ArrowType
  DIMBLK2: ArrowType
  DIMLDRBLK: ArrowType
  DIMASZ: number
  /** Marca de centro: > 0 marca, < 0 marca y líneas de centro, 0 ninguna. */
  DIMCEN: number
  /** Símbolo de longitud de arco: 0 delante, 1 encima, 2 ninguno. */
  DIMARCSYM: 0 | 1 | 2
  /** Ángulo del quiebre de las cotas de radio con quiebre (grados). */
  DIMJOGANG: number
  // Text
  DIMCLRT: string | null
  /** Relleno detrás del texto: 0 no, 1 color de fondo. */
  DIMTFILL: 0 | 1
  DIMTXT: number
  /** Separación texto–línea de cota; negativa = texto en recuadro (cota básica). */
  DIMGAP: number
  /** Posición vertical: 0 centrado, 1 encima, 2 fuera, 4 debajo. */
  DIMTAD: 0 | 1 | 2 | 4
  /** Posición horizontal: 0 centrado, 1 junto a la 1ª referencia, 2 junto a la 2ª, 3 sobre la 1ª, 4 sobre la 2ª. */
  DIMJUST: 0 | 1 | 2 | 3 | 4
  /** Texto horizontal dentro / fuera de las líneas de referencia (Horizontal = ambos, ISO = sólo fuera). */
  DIMTIH: boolean
  DIMTOH: boolean
  // Fit
  /** Qué sale primero si no entra: 0 texto y flechas, 1 flechas, 2 texto, 3 lo que mejor encaje. */
  DIMATFIT: 0 | 1 | 2 | 3
  DIMTIX: boolean
  DIMSOXD: boolean
  /** Texto movido: 0 arrastra la línea de cota, 1 agrega líder, 2 sin líder. */
  DIMTMOVE: 0 | 1 | 2
  DIMTOFL: boolean
  DIMSCALE: number
  // Primary units
  /** 1 científica, 2 decimal, 3 ingeniería, 4 arquitectura, 5 fraccional, 6 Windows. */
  DIMLUNIT: 1 | 2 | 3 | 4 | 5 | 6
  DIMDEC: number
  DIMDSEP: string
  DIMRND: number
  /** Prefijo/sufijo: `<>` es la medida (p. ej. `<> mm`); sin `<>` es un sufijo. */
  DIMPOST: string
  DIMLFAC: number
  /** Ceros: 4 suprime el inicial (0.5 → .5), 8 los finales (12.50 → 12.5); 0–3 pies/pulgadas. */
  DIMZIN: number
  /** 0 grados decimales, 1 g/m/s, 2 gradianes, 3 radianes. */
  DIMAUNIT: 0 | 1 | 2 | 3
  DIMADEC: number
  DIMAZIN: number
  // Alternate units
  DIMALT: boolean
  DIMALTF: number
  DIMALTD: number
  DIMALTRND: number
  DIMAPOST: string
  DIMALTU: 1 | 2 | 3 | 4 | 5 | 6
  DIMALTZ: number
  // Tolerances
  DIMTOL: boolean
  DIMLIM: boolean
  DIMTP: number
  DIMTM: number
  DIMTDEC: number
  DIMTFAC: number
  /** Alineación vertical de la tolerancia simétrica/desviación: 0 abajo, 1 medio, 2 arriba. */
  DIMTOLJ: 0 | 1 | 2
  DIMTZIN: number
  // Escala de anotación: tamaños en mm de papel.
  ANNOTATIVE: boolean
  /** Tamaño de los cortes de `DIMBREAK` (en el CAD clásico, *Break size* del estilo). */
  BREAKSIZE: number
  /** Alto del quiebre de `DIMJOGLINE` como factor del alto de texto (*Jog height factor*). */
  JOGHEIGHT: number
}

export type DimVarName = keyof DimVars

export interface DimStyleDef {
  name: string
  vars: DimVars
}

export type DimTab = 'Lines' | 'Symbols and Arrows' | 'Text' | 'Fit' | 'Primary Units' | 'Alternate Units' | 'Tolerances'

export type DimVarKind = 'number' | 'int' | 'bool' | 'string' | 'color' | 'lineweight' | 'arrow' | 'enum'

export interface DimVarInfo {
  name: DimVarName
  kind: DimVarKind
  tab: DimTab
  label: string
  /** Código de grupo DXF en la tabla DIMSTYLE (R12/R2000). */
  dxf?: number
  /** Opciones de un `enum` (valor → etiqueta). */
  options?: Array<[number, string]>
  /** Mínimo admitido (números). */
  min?: number
}

/** Metadatos de cada variable: alimentan `DIMSTYLE`, la paleta, la línea de comandos y el DXF. */
export const DIM_VAR_INFO: DimVarInfo[] = [
  { name: 'DIMCLRD', kind: 'color', tab: 'Lines', label: 'Dimension line color', dxf: 176 },
  { name: 'DIMLWD', kind: 'lineweight', tab: 'Lines', label: 'Dimension line lineweight', dxf: 371 },
  { name: 'DIMDLE', kind: 'number', tab: 'Lines', label: 'Extend beyond ticks', dxf: 46, min: 0 },
  { name: 'DIMDLI', kind: 'number', tab: 'Lines', label: 'Baseline spacing', dxf: 43, min: 0 },
  { name: 'DIMSD1', kind: 'bool', tab: 'Lines', label: 'Suppress dim line 1', dxf: 281 },
  { name: 'DIMSD2', kind: 'bool', tab: 'Lines', label: 'Suppress dim line 2', dxf: 282 },
  { name: 'DIMCLRE', kind: 'color', tab: 'Lines', label: 'Extension line color', dxf: 177 },
  { name: 'DIMLWE', kind: 'lineweight', tab: 'Lines', label: 'Extension line lineweight', dxf: 372 },
  { name: 'DIMEXE', kind: 'number', tab: 'Lines', label: 'Extend beyond dim lines', dxf: 44, min: 0 },
  { name: 'DIMEXO', kind: 'number', tab: 'Lines', label: 'Offset from origin', dxf: 42, min: 0 },
  { name: 'DIMFXLON', kind: 'bool', tab: 'Lines', label: 'Fixed length extension lines', dxf: 290 },
  { name: 'DIMFXL', kind: 'number', tab: 'Lines', label: 'Fixed length', dxf: 49, min: 0 },
  { name: 'DIMSE1', kind: 'bool', tab: 'Lines', label: 'Suppress ext line 1', dxf: 75 },
  { name: 'DIMSE2', kind: 'bool', tab: 'Lines', label: 'Suppress ext line 2', dxf: 76 },
  { name: 'DIMBLK1', kind: 'arrow', tab: 'Symbols and Arrows', label: 'First arrowhead', dxf: 6 },
  { name: 'DIMBLK2', kind: 'arrow', tab: 'Symbols and Arrows', label: 'Second arrowhead', dxf: 7 },
  { name: 'DIMLDRBLK', kind: 'arrow', tab: 'Symbols and Arrows', label: 'Leader arrowhead' },
  { name: 'DIMASZ', kind: 'number', tab: 'Symbols and Arrows', label: 'Arrow size', dxf: 41, min: 0 },
  { name: 'DIMCEN', kind: 'number', tab: 'Symbols and Arrows', label: 'Center marks (− = lines)', dxf: 141 },
  { name: 'DIMARCSYM', kind: 'enum', tab: 'Symbols and Arrows', label: 'Arc length symbol', dxf: 90, options: [[0, 'Preceding text'], [1, 'Above text'], [2, 'None']] },
  { name: 'DIMJOGANG', kind: 'number', tab: 'Symbols and Arrows', label: 'Radius jog angle', min: 5 },
  { name: 'BREAKSIZE', kind: 'number', tab: 'Symbols and Arrows', label: 'Dimension break size', min: 0 },
  { name: 'JOGHEIGHT', kind: 'number', tab: 'Symbols and Arrows', label: 'Linear jog height factor (× text)', min: 0 },
  { name: 'DIMCLRT', kind: 'color', tab: 'Text', label: 'Text color', dxf: 178 },
  { name: 'DIMTFILL', kind: 'enum', tab: 'Text', label: 'Fill color', dxf: 69, options: [[0, 'None'], [1, 'Background']] },
  { name: 'DIMTXT', kind: 'number', tab: 'Text', label: 'Text height', dxf: 140, min: 0 },
  { name: 'DIMGAP', kind: 'number', tab: 'Text', label: 'Offset from dim line (− = box)', dxf: 147 },
  { name: 'DIMTAD', kind: 'enum', tab: 'Text', label: 'Text placement vertical', dxf: 77, options: [[0, 'Centered'], [1, 'Above'], [2, 'Outside'], [4, 'Below']] },
  { name: 'DIMJUST', kind: 'enum', tab: 'Text', label: 'Text placement horizontal', dxf: 280, options: [[0, 'Centered'], [1, 'At ext line 1'], [2, 'At ext line 2'], [3, 'Over ext line 1'], [4, 'Over ext line 2']] },
  { name: 'DIMTIH', kind: 'bool', tab: 'Text', label: 'Text inside horizontal', dxf: 73 },
  { name: 'DIMTOH', kind: 'bool', tab: 'Text', label: 'Text outside horizontal', dxf: 74 },
  { name: 'DIMATFIT', kind: 'enum', tab: 'Fit', label: 'Fit options', dxf: 289, options: [[3, 'Either text or arrows (best fit)'], [1, 'Arrows'], [2, 'Text'], [0, 'Both text and arrows']] },
  { name: 'DIMTIX', kind: 'bool', tab: 'Fit', label: 'Always keep text between ext lines', dxf: 174 },
  { name: 'DIMSOXD', kind: 'bool', tab: 'Fit', label: 'Suppress arrows if they do not fit', dxf: 175 },
  { name: 'DIMTMOVE', kind: 'enum', tab: 'Fit', label: 'Text placement when moved', dxf: 279, options: [[0, 'Beside the dimension line'], [1, 'Over, with leader'], [2, 'Over, without leader']] },
  { name: 'DIMTOFL', kind: 'bool', tab: 'Fit', label: 'Draw dim line between ext lines', dxf: 172 },
  { name: 'DIMSCALE', kind: 'number', tab: 'Fit', label: 'Use overall scale of', dxf: 40, min: 0 },
  { name: 'ANNOTATIVE', kind: 'bool', tab: 'Fit', label: 'Annotative' },
  { name: 'DIMLUNIT', kind: 'enum', tab: 'Primary Units', label: 'Unit format', dxf: 277, options: [[2, 'Decimal'], [1, 'Scientific'], [3, 'Engineering'], [4, 'Architectural'], [5, 'Fractional'], [6, 'Windows desktop']] },
  { name: 'DIMDEC', kind: 'int', tab: 'Primary Units', label: 'Precision', dxf: 271, min: 0 },
  { name: 'DIMDSEP', kind: 'string', tab: 'Primary Units', label: 'Decimal separator', dxf: 278 },
  { name: 'DIMRND', kind: 'number', tab: 'Primary Units', label: 'Round off', dxf: 45, min: 0 },
  { name: 'DIMPOST', kind: 'string', tab: 'Primary Units', label: 'Prefix / suffix (<> = value)', dxf: 3 },
  { name: 'DIMLFAC', kind: 'number', tab: 'Primary Units', label: 'Measurement scale factor', dxf: 144 },
  { name: 'DIMZIN', kind: 'int', tab: 'Primary Units', label: 'Zero suppression (4 leading, 8 trailing)', dxf: 78, min: 0 },
  { name: 'DIMAUNIT', kind: 'enum', tab: 'Primary Units', label: 'Angular units', dxf: 275, options: [[0, 'Decimal degrees'], [1, 'Degrees minutes seconds'], [2, 'Gradians'], [3, 'Radians']] },
  { name: 'DIMADEC', kind: 'int', tab: 'Primary Units', label: 'Angular precision', dxf: 179, min: 0 },
  { name: 'DIMAZIN', kind: 'int', tab: 'Primary Units', label: 'Angular zero suppression', dxf: 79, min: 0 },
  { name: 'DIMALT', kind: 'bool', tab: 'Alternate Units', label: 'Display alternate units', dxf: 170 },
  { name: 'DIMALTF', kind: 'number', tab: 'Alternate Units', label: 'Multiplier for alt units', dxf: 143 },
  { name: 'DIMALTD', kind: 'int', tab: 'Alternate Units', label: 'Alt precision', dxf: 171, min: 0 },
  { name: 'DIMALTRND', kind: 'number', tab: 'Alternate Units', label: 'Alt round off', dxf: 148, min: 0 },
  { name: 'DIMAPOST', kind: 'string', tab: 'Alternate Units', label: 'Alt prefix / suffix', dxf: 4 },
  { name: 'DIMALTU', kind: 'enum', tab: 'Alternate Units', label: 'Alt unit format', dxf: 273, options: [[2, 'Decimal'], [1, 'Scientific'], [3, 'Engineering'], [4, 'Architectural'], [5, 'Fractional'], [6, 'Windows desktop']] },
  { name: 'DIMALTZ', kind: 'int', tab: 'Alternate Units', label: 'Alt zero suppression', dxf: 285, min: 0 },
  { name: 'DIMTOL', kind: 'bool', tab: 'Tolerances', label: 'Tolerances (deviation)', dxf: 71 },
  { name: 'DIMLIM', kind: 'bool', tab: 'Tolerances', label: 'Limits', dxf: 72 },
  { name: 'DIMTP', kind: 'number', tab: 'Tolerances', label: 'Upper value', dxf: 47 },
  { name: 'DIMTM', kind: 'number', tab: 'Tolerances', label: 'Lower value', dxf: 48 },
  { name: 'DIMTDEC', kind: 'int', tab: 'Tolerances', label: 'Precision', dxf: 272, min: 0 },
  { name: 'DIMTFAC', kind: 'number', tab: 'Tolerances', label: 'Scaling for height', dxf: 146, min: 0 },
  { name: 'DIMTOLJ', kind: 'enum', tab: 'Tolerances', label: 'Vertical position', dxf: 283, options: [[0, 'Bottom'], [1, 'Middle'], [2, 'Top']] },
  { name: 'DIMTZIN', kind: 'int', tab: 'Tolerances', label: 'Zero suppression', dxf: 284, min: 0 },
]

export const DIM_TABS: DimTab[] = ['Lines', 'Symbols and Arrows', 'Text', 'Fit', 'Primary Units', 'Alternate Units', 'Tolerances']

export const dimVarInfo = (name: string): DimVarInfo | undefined => DIM_VAR_INFO.find((v) => v.name === name.toUpperCase())

/** ISO-25 (paridad con la plantilla métrica): texto encima y alineado, coma decimal, sin ceros finales. */
const ISO25: DimVars = {
  DIMCLRD: null,
  DIMLWD: null,
  DIMDLE: 0,
  DIMDLI: 3.75,
  DIMSD1: false,
  DIMSD2: false,
  DIMCLRE: null,
  DIMLWE: null,
  DIMEXE: 1.25,
  DIMEXO: 0.625,
  DIMFXLON: false,
  DIMFXL: 1,
  DIMSE1: false,
  DIMSE2: false,
  DIMBLK1: '',
  DIMBLK2: '',
  DIMLDRBLK: '',
  DIMASZ: 2.5,
  DIMCEN: 2.5,
  DIMARCSYM: 0,
  DIMJOGANG: 45,
  BREAKSIZE: 3.75,
  JOGHEIGHT: 1.5,
  DIMCLRT: null,
  DIMTFILL: 0,
  DIMTXT: 2.5,
  DIMGAP: 0.625,
  DIMTAD: 1,
  DIMJUST: 0,
  DIMTIH: false,
  DIMTOH: false,
  DIMATFIT: 3,
  DIMTIX: false,
  DIMSOXD: false,
  DIMTMOVE: 0,
  DIMTOFL: true,
  DIMSCALE: 1,
  DIMLUNIT: 2,
  DIMDEC: 2,
  DIMDSEP: ',',
  DIMRND: 0,
  DIMPOST: '',
  DIMLFAC: 1,
  DIMZIN: 8,
  DIMAUNIT: 0,
  DIMADEC: 0,
  DIMAZIN: 0,
  DIMALT: false,
  DIMALTF: 0.0394,
  DIMALTD: 3,
  DIMALTRND: 0,
  DIMAPOST: '',
  DIMALTU: 2,
  DIMALTZ: 0,
  DIMTOL: false,
  DIMLIM: false,
  DIMTP: 0,
  DIMTM: 0,
  DIMTDEC: 2,
  DIMTFAC: 1,
  DIMTOLJ: 1,
  DIMTZIN: 8,
  ANNOTATIVE: false,
}

/** IRAM 4513 (dibujo mecánico): flecha cerrada rellena 4:1, texto encima y alineado, referencias separadas 1 mm. */
const IRAM4513: DimVars = { ...ISO25, DIMBLK1: '_IRAM', DIMBLK2: '_IRAM', DIMLDRBLK: '_IRAM', DIMEXO: 1, DIMEXE: 2, DIMGAP: 1, DIMDLI: 7, DIMCEN: 2.5 }

/** IRAM 4511 (construcciones): trazos oblicuos, línea de cota prolongada, cifras encima. */
const IRAM4511: DimVars = { ...ISO25, DIMBLK1: '_OBLIQUE', DIMBLK2: '_OBLIQUE', DIMLDRBLK: '_DOT', DIMASZ: 2, DIMDLE: 2, DIMEXO: 2, DIMEXE: 2, DIMGAP: 1, DIMDLI: 7, DIMCEN: 0 }

/**
 * `Standard`: el aspecto de las cotas anteriores a (texto horizontal encima, punto decimal, ceros
 * finales, flecha 4:1, referencias desde el punto y sin prolongación). Los `.cota` previos lo usan.
 */
const STANDARD: DimVars = {
  ...ISO25,
  DIMBLK1: '_IRAM',
  DIMBLK2: '_IRAM',
  DIMLDRBLK: '_IRAM',
  DIMEXO: 0,
  DIMEXE: 0,
  DIMGAP: 0.5,
  DIMTIH: true,
  DIMTOH: true,
  DIMDSEP: '.',
  DIMZIN: 0,
  DIMTIX: true,
  DIMATFIT: 0,
  DIMTOFL: true,
  DIMCEN: 0,
}

export const DEFAULT_DIM_STYLE_NAME = 'IRAM 4513'

/** Estilos incluidos en un dibujo nuevo (D5: IRAM 4513 por defecto). */
export function builtinDimStyles(): DimStyleDef[] {
  return [
    { name: 'IRAM 4513', vars: { ...IRAM4513 } },
    { name: 'IRAM 4511', vars: { ...IRAM4511 } },
    { name: 'ISO-25', vars: { ...ISO25 } },
    { name: 'Standard', vars: { ...STANDARD } },
  ]
}

export const BUILTIN_DIM_VARS: Record<string, DimVars> = { 'IRAM 4513': IRAM4513, 'IRAM 4511': IRAM4511, 'ISO-25': ISO25, Standard: STANDARD }

/** Variables completas de un estilo + overrides (sólo se aplican los que existen). */
export function resolveDimVars(base: DimVars | undefined, overrides?: Partial<DimVars> | null): DimVars {
  const out: DimVars = { ...(base ?? IRAM4513) }
  if (overrides) for (const [k, v] of Object.entries(overrides)) if (k in out && v !== undefined) (out as unknown as Record<string, unknown>)[k] = v
  return out
}

/** Diferencias de `vars` respecto de `base` (lo que una cota guarda como overrides). */
export function diffDimVars(base: DimVars, vars: DimVars): Partial<DimVars> {
  const out: Partial<DimVars> = {}
  for (const k of Object.keys(base) as DimVarName[]) if (vars[k] !== base[k]) (out as Record<string, unknown>)[k] = vars[k]
  return out
}

/** ¿Es el estilo embebido de una cota anterior a (4 valores)? */
export function isLegacyStyle(s: unknown): s is { textHeight: number; arrowSize: number; precision: number; unitScale: number } {
  return !!s && typeof s === 'object' && 'textHeight' in s && !('DIMTXT' in s)
}

/** Overrides sobre `Standard` que reproducen una cota previa (alto, flecha, precisión y factor). */
export function legacyOverrides(s: { textHeight: number; arrowSize: number; precision: number; unitScale: number }): Partial<DimVars> {
  const out: Partial<DimVars> = {}
  if (s.textHeight !== STANDARD.DIMTXT) out.DIMTXT = s.textHeight
  if (s.arrowSize !== STANDARD.DIMASZ) out.DIMASZ = s.arrowSize
  if (s.precision !== STANDARD.DIMDEC) out.DIMDEC = s.precision
  if (s.unitScale !== STANDARD.DIMLFAC) out.DIMLFAC = s.unitScale
  if (s.textHeight !== STANDARD.DIMTXT) out.DIMGAP = s.textHeight * 0.2 // el texto iba a 0,7 h de la línea
  return out
}

/** Interpreta un valor tecleado para una variable (línea de comandos / `-DIMSTYLE`). Null si es inválido. */
export function parseDimVar(name: DimVarName, text: string): { value: DimVars[DimVarName] } | null {
  const info = dimVarInfo(name)
  if (!info) return null
  const t = text.trim()
  const ok = (value: unknown) => ({ value: value as DimVars[DimVarName] })
  switch (info.kind) {
    case 'bool': {
      const v = t.toLowerCase()
      if (['1', 'on', 'yes', 'y', 'true'].includes(v)) return ok(true)
      if (['0', 'off', 'no', 'n', 'false'].includes(v)) return ok(false)
      return null
    }
    case 'arrow': {
      const up = t.toUpperCase()
      if (up === '' || up === '.' || up === 'CLOSEDFILLED') return ok('')
      const hit = ARROW_TYPES.find((a) => a !== '' && (a === up || a === '_' + up || ARROW_LABELS[a].toLowerCase() === t.toLowerCase()))
      return hit !== undefined ? ok(hit) : null
    }
    case 'color':
      if (/^bylayer$/i.test(t)) return ok(null)
      return /^#[0-9a-f]{6}$/i.test(t) ? ok(t.toLowerCase()) : null
    case 'lineweight':
      if (/^bylayer$/i.test(t)) return ok(null)
      return Number.isFinite(Number(t)) && Number(t) >= 0 ? ok(Number(t)) : null
    case 'string':
      return ok(name !== 'DIMDSEP' && t === '.' ? '' : t)
    default: {
      const n = Number(t.replace(',', '.'))
      if (t === '' || !Number.isFinite(n)) return null
      if (info.min !== undefined && n < info.min) return null
      if (info.kind === 'int' || info.kind === 'enum') {
        if (!Number.isInteger(n)) return null
        if (info.options && !info.options.some(([v]) => v === n)) return null
      }
      return ok(n)
    }
  }
}

/** Texto de un valor para prompts y listados. */
export function formatDimVar(name: DimVarName, v: unknown): string {
  const info = dimVarInfo(name)
  if (v === null) return 'ByLayer'
  if (info?.kind === 'bool') return v ? 'On' : 'Off'
  if (info?.kind === 'arrow') return ARROW_LABELS[v as ArrowType] ?? String(v)
  if (info?.kind === 'enum') return info.options?.find(([o]) => o === v)?.[1] ?? String(v)
  return String(v)
}
