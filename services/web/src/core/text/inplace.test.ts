import { describe, expect, it } from 'vitest'
import type { TextProps } from '../document/types'
import { applyTextEdit, textEditStateOf } from './inplace'

const mt = (): TextProps => ({ position: [0, 0, 0], text: 'A', height: 2.5, rotation: 0, justify: 'left', normal: [0, 0, 1], kind: 'mtext', runs: [{ s: 'A', b: true }] })

describe('editor de texto en el lugar', () => {
  it('applies text (with %% codes), height, bold, italic, justification and font', () => {
    const p = mt()
    applyTextEdit(p, { ...textEditStateOf(p), runs: undefined, text: 'Ø%%c20\r\nsegundo', height: 5, bold: true, italic: true, justify: 'center', font: 'Arial' })
    expect(p).toMatchObject({ text: 'ØØ20\nsegundo', height: 5, bold: true, italic: true, justify: 'center', font: 'Arial' })
    expect(p.runs).toBeUndefined() // el texto cambió: los tramos importados ya no valen
  })

  it('a format-only change keeps the text; a single bold run becomes whole-text bold', () => {
    const p = mt()
    applyTextEdit(p, { ...textEditStateOf(p), justify: 'right' })
    expect(p).toMatchObject({ text: 'A', justify: 'right', bold: true })
    expect(p.runs).toBeUndefined()
  })
})

describe('formato parcial (tramos)', () => {
  it('keeps partial formats as runs and joins their text; one plain run becomes whole-text bold', () => {
    const p = mt()
    applyTextEdit(p, { ...textEditStateOf(p), runs: [{ s: 'Ø%%c' }, { s: '20', b: true, c: '#ff0000' }, { s: '\nnota', i: true, h: 0.5 }] })
    expect(p.text).toBe('ØØ20\nnota')
    expect(p.runs).toEqual([{ s: 'ØØ' }, { s: '20', b: true, c: '#ff0000' }, { s: '\nnota', i: true, h: 0.5 }])
    const q = mt()
    applyTextEdit(q, { ...textEditStateOf(q), runs: [{ s: 'todo', b: true }, { s: ' negrita', b: true }] })
    expect(q).toMatchObject({ text: 'todo negrita', bold: true })
    expect(q.runs).toBeUndefined()
  })

  it('opens with the text runs when they match it, else one run with the text bold/italic', () => {
    expect(textEditStateOf(mt()).runs).toEqual([{ s: 'A', b: true }])
    expect(textEditStateOf({ ...mt(), runs: [{ s: 'X' }], bold: true }).runs).toEqual([{ s: 'A', b: true }])
  })
})
