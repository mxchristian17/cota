import { describe, expect, it } from 'vitest'
import type { Entity } from '../document/types'
import { shownLayer } from './selectionLayer'

const on = (layer: string) => ({ layer }) as Entity

describe('capa que muestran los controles', () => {
  it('sin selección, la actual', () => {
    expect(shownLayer('a', [])).toEqual({ id: 'a', others: 0 })
  })
  it('con objetos de una capa, esa capa aunque no sea la actual', () => {
    expect(shownLayer('a', [on('b'), on('b')])).toEqual({ id: 'b', others: 0 })
  })
  it('con varias capas, la primera y cuántas más hay', () => {
    expect(shownLayer('a', [on('b'), undefined, on('c'), on('d'), on('b')])).toEqual({ id: 'b', others: 2 })
  })
})
