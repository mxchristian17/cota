import { describe, expect, it } from 'vitest'
import type { TextProps } from '../document/types'
import { applyTextEdit, textEditStateOf } from './inplace'

const mt = (): TextProps => ({ position: [0, 0, 0], text: 'A', height: 2.5, rotation: 0, justify: 'left', normal: [0, 0, 1], kind: 'mtext', runs: [{ s: 'A', b: true }] })

describe('editor de texto en el lugar', () => {
  it('applies text (with %% codes), height, bold, italic, justification and font', () => {
    const p = mt()
    applyTextEdit(p, { ...textEditStateOf(p), text: 'Ø%%c20\r\nsegundo', height: 5, bold: true, italic: true, justify: 'center', font: 'Arial' })
    expect(p).toMatchObject({ text: 'ØØ20\nsegundo', height: 5, bold: true, italic: true, justify: 'center', font: 'Arial' })
    expect(p.runs).toBeUndefined() // el texto cambió: los tramos importados ya no valen
  })

  it('keeps imported runs when only the format changes', () => {
    const p = mt()
    applyTextEdit(p, { ...textEditStateOf(p), justify: 'right' })
    expect(p.runs).toHaveLength(1)
    expect(p.bold).toBeUndefined()
  })
})
