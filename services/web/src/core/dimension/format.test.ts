import { describe, it, expect } from 'vitest'
import { applyPost, formatAlternate, formatAngle, formatLinear } from './format'
import { BUILTIN_DIM_VARS, type DimVars } from './style'

const iso = (o: Partial<DimVars> = {}): DimVars => ({ ...BUILTIN_DIM_VARS['ISO-25'], ...o })

describe('formato de medidas', () => {
  it('DIMZIN: ceros finales e iniciales', () => {
    expect(formatLinear(12.5, iso())).toBe('12,5')
    expect(formatLinear(12.5, iso({ DIMZIN: 0 }))).toBe('12,50')
    expect(formatLinear(0.5, iso({ DIMZIN: 12 }))).toBe(',5')
  })
  it('DIMRND, DIMLFAC y DIMDSEP', () => {
    expect(formatLinear(12.3, iso({ DIMRND: 0.5 }))).toBe('12,5')
    expect(formatLinear(1500, iso({ DIMLFAC: 0.001, DIMDEC: 3 }))).toBe('1,5')
    expect(formatLinear(12.25, iso({ DIMDSEP: '.' }))).toBe('12.25')
  })
  it('DIMPOST con <> o como sufijo', () => {
    expect(applyPost('20', '<> mm')).toBe('20 mm')
    expect(applyPost('20', ' cm')).toBe('20 cm')
  })
  it('fraccional, arquitectura y científica', () => {
    expect(formatLinear(2.75, iso({ DIMLUNIT: 5, DIMDEC: 4 }))).toBe('2 3/4')
    expect(formatLinear(30.5, iso({ DIMLUNIT: 4, DIMDEC: 4 }))).toBe(`2'-6 1/2"`)
    expect(formatLinear(1234, iso({ DIMLUNIT: 1, DIMDEC: 2, DIMZIN: 0 }))).toBe('1.23E+03')
  })
  it('ángulos: decimales, g/m/s, gradianes y radianes', () => {
    expect(formatAngle(45, iso())).toBe('45°')
    expect(formatAngle(30.5, iso({ DIMAUNIT: 1, DIMADEC: 2 }))).toBe(`30°30'`)
    expect(formatAngle(30.5042, iso({ DIMAUNIT: 1, DIMADEC: 4 }))).toBe(`30°30'15"`)
    expect(formatAngle(90, iso({ DIMAUNIT: 2, DIMADEC: 0 }))).toBe('100g')
    expect(formatAngle(180, iso({ DIMAUNIT: 3, DIMADEC: 4, DIMDSEP: '.' }))).toBe('3.1416r')
  })
  it('unidades alternativas entre corchetes', () => {
    expect(formatAlternate(25.4, iso({ DIMALTF: 1 / 25.4, DIMALTD: 2, DIMAPOST: '"' }))).toBe('[1,00"]')
  })
})
