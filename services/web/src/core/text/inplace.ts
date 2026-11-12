import type { TextProps, TextRun } from '../document/types'
import { decodeTextCodes } from './codes'

/** Lo que se edita de un texto en el editor en el lugar (MTEXT y doble clic sobre un texto). */
export interface TextEditState {
  text: string
  height: number
  bold: boolean
  italic: boolean
  justify: 'left' | 'center' | 'right'
  font?: string
  /** Tramos con formato propio (negrita, itálica, subrayado, fuente, alto relativo, color); su texto unido es `text`. */
  runs?: TextRun[]
}

const sameLook = (a: TextRun, b: TextRun): boolean => !!a.b === !!b.b && !!a.i === !!b.i && !!a.u === !!b.u && a.f === b.f && a.h === b.h && a.c === b.c

/** Tramos limpios: sin vacíos y con los vecinos de igual formato unidos. */
export function mergeRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = []
  for (const r of runs) {
    if (!r.s) continue
    const last = out[out.length - 1]
    if (last && sameLook(last, r)) last.s += r.s
    else out.push({ ...r })
  }
  return out
}

/** Tramos con que abre el editor: los del texto si coinciden con él, o uno solo con la negrita/itálica del texto. */
export function runsOf(p: TextProps): TextRun[] {
  if (p.runs && p.runs.map((r) => r.s).join('') === p.text) return p.runs.map((r) => ({ ...r }))
  return [{ s: p.text, ...(p.bold ? { b: true } : {}), ...(p.italic ? { i: true } : {}) }]
}

export function textEditStateOf(p: TextProps): TextEditState {
  return { text: p.text, height: p.height, bold: !!p.bold, italic: !!p.italic, justify: p.justify, ...(p.font ? { font: p.font } : {}), runs: runsOf(p) }
}

/**
 * Aplica lo editado. Los códigos `%%c`, `%%d`, `%%p` se convierten (Ø, °, ±). Si el texto cambió, los tramos con formato
 * de un MTEXT importado dejan de valer y se quitan; negrita e itálica pasan a ser del texto entero.
 */
export function applyTextEdit(p: TextProps, r: TextEditState): void {
  if (r.runs) {
    // Formato por tramos: si todo el texto tiene el mismo y es sólo negrita/itálica, queda como formato del texto entero.
    const runs = mergeRuns(r.runs.map((x) => ({ ...x, s: decodeTextCodes(x.s.replace(/\r\n?/g, '\n')) })))
    p.text = runs.map((x) => x.s).join('')
    const plain = runs.length <= 1 && !runs[0]?.u && !runs[0]?.f && !runs[0]?.h && !runs[0]?.c
    if (plain) {
      delete p.runs
      r = { ...r, bold: !!runs[0]?.b, italic: !!runs[0]?.i }
    } else {
      p.runs = runs
      r = { ...r, bold: false, italic: false }
    }
  } else {
    const text = decodeTextCodes(r.text.replace(/\r\n?/g, '\n'))
    if (text !== p.text) {
      p.text = text
      delete p.runs
    }
  }
  if (r.height > 0 && Number.isFinite(r.height)) p.height = r.height
  if (r.bold) p.bold = true
  else delete p.bold
  if (r.italic) p.italic = true
  else delete p.italic
  p.justify = r.justify
  if (r.font) p.font = r.font
  else delete p.font
}
