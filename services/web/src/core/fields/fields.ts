import type { DocumentData } from '../document/types'

/**
 * Campos (FIELD) dentro de textos y atributos, con la sintaxis del CAD clásico: `%<\AcVar Nombre>%` y
 * opcionalmente un formato `%<\AcVar SaveDate \f "dd/MM/yyyy">%`. Se evalúan al dibujar y al plotear;
 * sin valor muestran `----` y un campo desconocido `####`, como el CAD clásico.
 */

/** Datos que alimentan los campos de un texto (dependen del dibujo y del espacio donde está). */
export interface FieldContext {
  /** Nombre del dibujo con extensión (`planta.cota`). */
  fileName: string
  meta: DocumentData['meta']
  /** `Model` o el nombre del layout. */
  layoutName: string
  /** Número de hoja (posición del layout, desde 1) y cantidad de layouts. */
  sheetNumber: number
  sheetCount: number
  /** Escala del primer viewport del layout (`1:50`), vacía si no hay. */
  viewportScale: string
}

/** Campos disponibles (nombre canónico → descripción), en el orden del comando FIELD. */
export const FIELD_NAMES = [
  'Filename',
  'SaveDate',
  'CreateDate',
  'PlotDate',
  'Author',
  'Title',
  'Subject',
  'Keywords',
  'LayoutName',
  'SheetNumber',
  'SheetCount',
  'ViewportScale',
  'CustomDP',
] as const

const FIELD_RE = /%<\\AcVar\s+([^\s>%\\]+)(?:\s+\\f\s+"([^"]*)")?\s*>%/gi

const NONE = '----'
const INVALID = '####'

/** Código de campo listo para insertar en un texto. */
export function fieldCode(name: string, format?: string): string {
  return format ? `%<\\AcVar ${name} \\f "${format}">%` : `%<\\AcVar ${name}>%`
}

export function hasFields(text: string): boolean {
  FIELD_RE.lastIndex = 0
  return FIELD_RE.test(text)
}

/** Fecha ISO con un formato `dd/MM/yyyy` (tokens dd, d, MM, M, yyyy, yy, HH, mm). */
export function formatDate(iso: string | undefined, fmt = 'dd/MM/yyyy'): string {
  const d = iso ? new Date(iso) : null
  if (!d || isNaN(d.getTime())) return NONE
  const pad = (n: number) => String(n).padStart(2, '0')
  const tokens: Record<string, string> = {
    yyyy: String(d.getFullYear()),
    yy: pad(d.getFullYear() % 100),
    MM: pad(d.getMonth() + 1),
    M: String(d.getMonth() + 1),
    dd: pad(d.getDate()),
    d: String(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
  }
  return fmt.replace(/yyyy|yy|MM|M|dd|d|HH|mm/g, (t) => tokens[t])
}

const orNone = (v: string | undefined): string => (v && v.trim() ? v : NONE)

/** Valor de un campo. `format` sólo aplica a fechas y a `Filename` (`noext` = sin extensión). */
export function fieldValue(name: string, format: string | undefined, ctx: FieldContext): string {
  const n = name.toLowerCase()
  if (n.startsWith('customdp.')) return orNone(ctx.meta.custom?.[name.slice(9)])
  switch (n) {
    case 'filename': {
      if (!ctx.fileName) return NONE
      return format?.toLowerCase() === 'noext' ? ctx.fileName.replace(/\.[^.]+$/, '') : ctx.fileName
    }
    case 'savedate':
      return formatDate(ctx.meta.modified, format)
    case 'createdate':
      return formatDate(ctx.meta.created, format)
    case 'plotdate':
      return formatDate(ctx.meta.plotted, format)
    case 'author':
      return orNone(ctx.meta.author)
    case 'title':
      return orNone(ctx.meta.title)
    case 'subject':
      return orNone(ctx.meta.subject)
    case 'keywords':
      return orNone(ctx.meta.keywords)
    case 'layoutname':
    case 'ctab':
      return ctx.layoutName
    case 'sheetnumber':
      return ctx.sheetNumber > 0 ? String(ctx.sheetNumber) : NONE
    case 'sheetcount':
      return ctx.sheetCount > 0 ? String(ctx.sheetCount) : NONE
    case 'viewportscale':
      return orNone(ctx.viewportScale)
    default:
      return INVALID
  }
}

export interface TextSegment {
  text: string
  /** El tramo es un campo evaluado (se muestra con fondo gris, FIELDDISPLAY=1). */
  field: boolean
}

/** Texto partido en tramos literales y campos evaluados. */
export function fieldSegments(text: string, ctx: FieldContext): TextSegment[] {
  const out: TextSegment[] = []
  let last = 0
  FIELD_RE.lastIndex = 0
  for (let m = FIELD_RE.exec(text); m; m = FIELD_RE.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), field: false })
    out.push({ text: fieldValue(m[1], m[2], ctx), field: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), field: false })
  return out
}

/** Texto con los campos reemplazados por su valor. */
export function evaluateFields(text: string, ctx: FieldContext): string {
  if (!hasFields(text)) return text
  return fieldSegments(text, ctx)
    .map((s) => s.text)
    .join('')
}
