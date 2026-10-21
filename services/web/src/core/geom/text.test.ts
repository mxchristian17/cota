import { describe, it, expect } from 'vitest'
import { textAxes, textCorners, textLines, textSize } from './text'
import type { TextProps } from '../document/types'

const T = (over: Partial<TextProps> = {}): TextProps => ({
  position: [0, 0, 0],
  text: 'AB',
  height: 10,
  rotation: 0,
  justify: 'left',
  normal: [0, 0, 1],
  ...over,
})

describe('text geom', () => {
  it('textLines separa por \\n', () => {
    expect(textLines(T({ text: 'a\nbb\nccc' }))).toEqual(['a', 'bb', 'ccc'])
  })

  it('textSize crece con columnas y líneas', () => {
    const one = textSize(T({ text: 'AB' }))
    const multi = textSize(T({ text: 'AB\nCDE' }))
    expect(multi.width).toBeGreaterThan(one.width) // 3 cols > 2
    expect(multi.height).toBeGreaterThan(one.height) // 2 líneas > 1
  })

  it('en normal +Z sin rotación, u=+X y v=+Y', () => {
    const { u, v } = textAxes(T())
    expect(u[0]).toBeCloseTo(1, 6)
    expect(v[1]).toBeCloseTo(1, 6)
  })

  it('justify center centra la caja alrededor de la inserción en X', () => {
    const left = textCorners(T({ justify: 'left' }))
    const center = textCorners(T({ justify: 'center' }))
    // left: esquina superior-izquierda en x=0; center: desplazada -width/2
    expect(left[0][0]).toBeCloseTo(0, 6)
    expect(center[0][0]).toBeLessThan(0)
  })
})
