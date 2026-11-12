import type { TextProps } from '../document/types'
import { decodeTextCodes } from './codes'

/** Lo que se edita de un texto en el editor en el lugar (MTEXT y doble clic sobre un texto). */
export interface TextEditState {
  text: string
  height: number
  bold: boolean
  italic: boolean
  justify: 'left' | 'center' | 'right'
  font?: string
}

export function textEditStateOf(p: TextProps): TextEditState {
  return { text: p.text, height: p.height, bold: !!p.bold, italic: !!p.italic, justify: p.justify, ...(p.font ? { font: p.font } : {}) }
}

/**
 * Aplica lo editado. Los códigos `%%c`, `%%d`, `%%p` se convierten (Ø, °, ±). Si el texto cambió, los tramos con formato
 * de un MTEXT importado dejan de valer y se quitan; negrita e itálica pasan a ser del texto entero.
 */
export function applyTextEdit(p: TextProps, r: TextEditState): void {
  const text = decodeTextCodes(r.text.replace(/\r\n?/g, '\n'))
  if (text !== p.text) {
    p.text = text
    delete p.runs
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
