import { describe, it, expect } from 'vitest'
import { keywordShortcut, matchKeyword } from './keywords'

describe('matchKeyword', () => {
  it('atajo por mayúsculas al estilo CAD clásico', () => {
    expect(keywordShortcut('eRase')).toBe('R')
    expect(keywordShortcut('DElta')).toBe('DE')
    const kws = ['Fence', 'Crossing', 'Project', 'Edge', 'eRase', 'Undo']
    expect(matchKeyword('r', kws)).toBe('eRase')
    expect(matchKeyword('e', kws)).toBe('Edge')
    expect(matchKeyword('era', kws)).toBe('eRase')
  })
  it('exacto antes que atajo y atajo antes que prefijo', () => {
    const kws = ['DElta', 'Percent', 'Total', 'DYnamic']
    expect(matchKeyword('dy', kws)).toBe('DYnamic')
    expect(matchKeyword('de', kws)).toBe('DElta')
    expect(matchKeyword('d', kws)).toBe('DElta')
    expect(matchKeyword('l', ['cLose'])).toBe('cLose')
    expect(matchKeyword('x', ['Yes', 'No'])).toBeNull()
  })
})
