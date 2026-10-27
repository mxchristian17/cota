import { describe, expect, it } from 'vitest'
import { aciToHex, hexToAci } from './dxfColor'

describe('tabla ACI completa', () => {
  it('reproduce los valores del CAD clásico en todos los rangos', () => {
    expect(aciToHex(7)).toBe('#ffffff')
    expect(aciToHex(10)).toBe('#ff0000')
    expect(aciToHex(11)).toBe('#ff7f7f')
    expect(aciToHex(12)).toBe('#cc0000')
    expect(aciToHex(15)).toBe('#994c4c')
    expect(aciToHex(19)).toBe('#4c2626')
    expect(aciToHex(20)).toBe('#ff3f00')
    expect(aciToHex(21)).toBe('#ff9f7f')
    expect(aciToHex(30)).toBe('#ff7f00')
    expect(aciToHex(50)).toBe('#ffff00')
    expect(aciToHex(130)).toBe('#00ffff')
    expect(aciToHex(150)).toBe('#007fff')
    expect(aciToHex(250)).toBe('#333333')
    expect(aciToHex(254)).toBe('#bebebe')
  })

  it('el color más cercano prefiere los índices bajos ante empates', () => {
    expect(hexToAci('#ff0000')).toBe(1)
    expect(hexToAci('#ffffff')).toBe(7)
    expect(hexToAci('#007fff')).toBe(150)
    expect(hexToAci('#bebebe')).toBe(254)
  })
})
