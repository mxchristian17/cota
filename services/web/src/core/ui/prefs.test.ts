import { describe, expect, it } from 'vitest'
import { pickPrefs, PREFS_KEY, readLocalPrefs, writeLocalPrefs } from './prefs'

const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}

describe('preferencias del usuario', () => {
  it('se guardan y se leen del navegador', () => {
    const st = memory()
    expect(readLocalPrefs(st)).toBeNull()
    expect(writeLocalPrefs({ ortho: true, savedAt: 5 }, st)).toBe(true)
    expect(readLocalPrefs(st)).toEqual({ ortho: true, savedAt: 5 })
  })

  it('lo corrupto o un navegador que no deja guardar no rompen nada', () => {
    const st = memory()
    st.m.set(PREFS_KEY, '{no es json')
    expect(readLocalPrefs(st)).toBeNull()
    st.m.set(PREFS_KEY, '[1,2]')
    expect(readLocalPrefs(st)).toBeNull()
    const denied = { getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('QuotaExceeded') } }
    expect(readLocalPrefs(denied)).toBeNull()
    expect(writeLocalPrefs({ a: 1 }, denied)).toBe(false)
    expect(writeLocalPrefs({ a: 1 }, null)).toBe(false)
  })

  it('al iniciar sesión gana la copia más reciente', () => {
    expect(pickPrefs(null, null)).toBeNull()
    expect(pickPrefs({ savedAt: 3 }, {})).toBeNull()
    expect(pickPrefs({ ortho: true, savedAt: 3 }, null)).toBe('local')
    expect(pickPrefs(null, { ortho: true })).toBe('remote')
    expect(pickPrefs({ ortho: true, savedAt: 3 }, { ortho: false, savedAt: 9 })).toBe('remote')
    expect(pickPrefs({ ortho: true, savedAt: 9 }, { ortho: false, savedAt: 3 })).toBe('local')
    // Config de la cuenta anterior a las marcas de tiempo: vale la del navegador si existe.
    expect(pickPrefs({ ortho: true, savedAt: 1 }, { ortho: false })).toBe('local')
  })
})
