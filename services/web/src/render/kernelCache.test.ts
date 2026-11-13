import { describe, expect, it } from 'vitest'
import { loadResults, persistentCacheAvailable, storedKey } from './kernelCache'

describe('caché persistente del núcleo exacto', () => {
  it('la clave guardada es un SHA-256 del árbol (con la versión del módulo y de Cota)', async () => {
    const a = await storedKey('{"op":"BOX"}')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await storedKey('{"op":"BOX"}')).toBe(a)
    expect(await storedKey('{"op":"BOX "}')).not.toBe(a)
  })

  it('sin IndexedDB no hay caché y no falla', async () => {
    expect(persistentCacheAvailable()).toBe(false)
    expect((await loadResults(['{"op":"BOX"}'])).size).toBe(0)
  })
})
