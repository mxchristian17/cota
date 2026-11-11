import { describe, expect, it } from 'vitest'
import { LruCache } from './lru'

describe('LruCache', () => {
  it('desaloja el menos usado y conserva lo que se sigue pidiendo', () => {
    const c = new LruCache<string, number>(2)
    c.set('a', 1)
    c.set('b', 2)
    expect(c.get('a')).toBe(1) // 'a' pasa a ser el más reciente
    c.set('c', 3)
    expect(c.get('b')).toBeUndefined()
    expect(c.get('a')).toBe(1)
    expect(c.get('c')).toBe(3)
    expect(c.size).toBe(2)
  })
})
