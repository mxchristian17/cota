import { describe, it, expect } from 'vitest'
import { mergeSelection } from './selection'

describe('mergeSelection', () => {
  it('acumula sin duplicar y preservando el orden', () => {
    expect(mergeSelection([], ['a'])).toEqual(['a'])
    expect(mergeSelection(['a'], ['b'])).toEqual(['a', 'b'])
    expect(mergeSelection(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('resta con Shift', () => {
    expect(mergeSelection(['a', 'b', 'c'], ['b'], true)).toEqual(['a', 'c'])
    expect(mergeSelection(['a'], ['a'], true)).toEqual([])
  })

  it('devuelve el mismo array cuando no hay cambios (evita re-renders)', () => {
    const cur = ['a', 'b']
    expect(mergeSelection(cur, [])).toBe(cur)
    expect(mergeSelection(cur, ['a'])).toBe(cur)
    expect(mergeSelection(cur, ['z'], true)).toBe(cur)
  })
})
