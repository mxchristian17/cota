import { stripUnderscore } from './CommandEngine'
import { parseNumber } from './coords'
import { matchKeyword } from './keywords'
import { recall, remember } from './memory'
import type { AngleResult, CommandContext, DistanceResult, GetAngleOptions, GetDistanceOptions } from './types'

/**
 * Prompts de texto con opciones y valor por defecto, estilo CAD clásico: Enter toma el valor
 * entre `<...>`, una opción se elige por nombre, atajo o prefijo, y una entrada inválida repite el
 * prompt. Devuelven null si el usuario cancela (ESC).
 */
export async function askKeyword(ctx: CommandContext, prompt: string, keywords: string[], def?: string): Promise<string | null> {
  for (;;) {
    const s = await ctx.getString(prompt, def === undefined ? undefined : { default: def })
    if (s === null) return null
    const k = matchKeyword(stripUnderscore(s), keywords)
    if (k) return k
    ctx.print('Invalid option keyword.')
  }
}

export type NumberOrKeyword = { kind: 'number'; value: number } | { kind: 'keyword'; keyword: string }

export interface AskNumberOptions {
  keywords?: string[]
  def?: number | string
  /** Valida el número; devuelve el mensaje de error o null si es válido. */
  check?: (v: number) => string | null
}

export async function askNumber(ctx: CommandContext, prompt: string, opts: AskNumberOptions = {}): Promise<NumberOrKeyword | null> {
  const def = opts.def === undefined ? undefined : String(opts.def)
  for (;;) {
    const s = await ctx.getString(prompt, def === undefined ? undefined : { default: def })
    if (s === null) return null
    const text = stripUnderscore(s).trim()
    const v = parseNumber(text)
    if (v !== null) {
      const err = opts.check?.(v) ?? null
      if (!err) return { kind: 'number', value: v }
      ctx.print(err)
      continue
    }
    const k = opts.keywords ? matchKeyword(text, opts.keywords) : null
    if (k) return { kind: 'keyword', keyword: k }
    ctx.print('Requires a number or an option keyword.')
  }
}

/** Formato de número de los prompts (`<1.0000>`), como el CAD clásico con LUPREC=4. */
export const fmt = (v: number): string => v.toFixed(4)

/** Ángulos y cantidades en los prompts: sin ceros de más (`<90>`, `<22.5>`), como el CAD clásico con AUPREC=0. */
export const fmtShort = (v: number): string => String(Number(v.toFixed(4)))

/** ` <valor>` para el prompt (vacío si no hay valor por defecto). */
export const dflt = (v: number | undefined, f: (n: number) => string = fmt): string => (v === undefined ? '' : ` <${f(v)}>`)

/** Dónde vive el valor recordado: la memoria de sesión (por defecto) o, p. ej., una variable del dibujo. */
export interface ValueStore {
  get(): number | undefined
  set(v: number): void
}

export interface RememberOptions {
  /** Valor de la primera vez (antes de haber usado el comando). */
  initial?: number
  /** Sólo se recuerda (y se ofrece) un valor válido. */
  valid?: (v: number) => boolean
  format?: (v: number) => string
  /** Reemplaza la memoria de sesión (p. ej. `TEXTSIZE` en el dibujo). */
  store?: ValueStore
}

/** `TEXTSIZE` vive en el dibujo, como en el CAD clásico (TEXT, MTEXT, ATTDEF, FIELD). */
export const textSizeStore = (ctx: CommandContext): ValueStore => ({ get: () => ctx.doc.textSize, set: (v) => ctx.doc.setTextSize(v) })

const sessionStore = (key: string): ValueStore => ({ get: () => recall(key), set: (v) => remember(key, v) })

/**
 * Distancia o número con **valor recordado**: el prompt muestra `<último>` y Enter lo
 * repite; ESC cancela. `label` es el texto sin los dos puntos.
 */
export async function askDistance(
  ctx: CommandContext,
  key: string,
  label: string,
  opts: Omit<GetDistanceOptions, 'default'> & RememberOptions,
): Promise<DistanceResult> {
  const store = opts.store ?? sessionStore(key)
  const stored = store.get()
  const def = stored !== undefined && (opts.valid?.(stored) ?? true) ? stored : opts.initial
  const r = await ctx.getDistance(`${label}${dflt(def, opts.format)}: `, { ...opts, default: def })
  if (r.kind === 'distance' && (opts.valid?.(r.value) ?? true)) store.set(r.value)
  return r
}

/** Ángulo (grados) con valor recordado; mismo contrato que `askDistance`. */
export async function askAngle(
  ctx: CommandContext,
  key: string,
  label: string,
  opts: Omit<GetAngleOptions, 'default'> & RememberOptions,
): Promise<AngleResult> {
  const store = opts.store ?? sessionStore(key)
  const stored = store.get()
  const def = stored !== undefined && (opts.valid?.(stored) ?? true) ? stored : opts.initial
  const r = await ctx.getAngle(`${label}${dflt(def, opts.format ?? fmtShort)}: `, { ...opts, default: def })
  if (r.kind === 'angle' && (opts.valid?.(r.deg) ?? true)) store.set(r.deg)
  return r
}
