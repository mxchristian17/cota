import { describe, expect, it } from 'vitest'
import { DARK_THEME, DEFAULT_THEME, LIGHT_THEME, normalizeTheme } from './theme'

describe('normalizeTheme', () => {
  it('devuelve defaults ante entrada vacía o inválida', () => {
    expect(normalizeTheme(undefined)).toEqual(DEFAULT_THEME)
    expect(normalizeTheme({})).toEqual(DEFAULT_THEME)
    expect(normalizeTheme('nope')).toEqual(DEFAULT_THEME)
  })

  it('acepta colores hex válidos y descarta los inválidos', () => {
    const t = normalizeTheme({ background: '#123456', gridMajor: 'red', crosshairColor: '#abcdef' })
    expect(t.background).toBe('#123456')
    expect(t.crosshairColor).toBe('#abcdef')
    expect(t.gridMajor).toBe(DEFAULT_THEME.gridMajor) // 'red' no es #rrggbb
  })

  it('clampa el tamaño de crosshair a (0, 60] y usa default si no es número', () => {
    expect(normalizeTheme({ crosshairSize: 200 }).crosshairSize).toBe(60)
    expect(normalizeTheme({ crosshairSize: 0 }).crosshairSize).toBe(DEFAULT_THEME.crosshairSize)
    expect(normalizeTheme({ crosshairSize: 22 }).crosshairSize).toBe(22)
  })

  it('los presets Dark/Light son estables al normalizar', () => {
    expect(normalizeTheme(DARK_THEME)).toEqual(DARK_THEME)
    expect(normalizeTheme(LIGHT_THEME)).toEqual(LIGHT_THEME)
  })
})
