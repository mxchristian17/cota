import { describe, expect, it } from 'vitest'
import { cleanNumber, cleanNumbersDeep } from './clean'

describe('limpieza del ruido de punto flotante', () => {
  it('lleva el ruido al valor exacto y deja intactos los valores reales', () => {
    expect(cleanNumber(0.9999999999995453)).toBe(1)
    expect(cleanNumber(12345.678900000001)).toBe(12345.6789)
    expect(cleanNumber(-2.220446049250313e-16)).toBe(0)
    expect(Object.is(cleanNumber(-1e-15), 0)).toBe(true)
    expect(cleanNumber(Math.SQRT2)).toBe(Math.SQRT2)
    expect(cleanNumber(Math.PI / 2)).toBe(Math.PI / 2)
    expect(cleanNumber(1.0000004)).toBe(1.0000004)
  })

  it('recorre props anidadas', () => {
    const p = { start: [0.9999999999995453, 2, 0], pts: [{ x: 3.0000000000001, y: 1 }], name: 'a' }
    expect(cleanNumbersDeep(p)).toBe(2)
    expect(p).toEqual({ start: [1, 2, 0], pts: [{ x: 3, y: 1 }], name: 'a' })
  })
})
