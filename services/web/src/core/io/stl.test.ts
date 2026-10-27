import { describe, expect, it } from 'vitest'
import { parseStl } from './stl'

const ascii = `solid t
facet normal 0 0 1
 outer loop
  vertex 0 0 0
  vertex 1 0 0
  vertex 0 1 0
 endloop
endfacet
facet normal 0 0 1
 outer loop
  vertex 1 0 0
  vertex 1 1 0
  vertex 0 1 0
 endloop
endfacet
endsolid t`

describe('STL', () => {
  it('ASCII: suelda los vértices compartidos', () => {
    const m = parseStl(new TextEncoder().encode(ascii).buffer as ArrayBuffer)
    expect(m.vertices).toHaveLength(4)
    expect(m.faces).toEqual([[0, 1, 2], [1, 3, 2]])
  })

  it('binario (aunque la cabecera diga "solid")', () => {
    const buf = new ArrayBuffer(84 + 50)
    const dv = new DataView(buf)
    new TextEncoder().encode('solid binary').forEach((b, i) => dv.setUint8(i, b))
    dv.setUint32(80, 1, true)
    const pts = [0, 0, 0, 2, 0, 0, 0, 3, 0]
    pts.forEach((v, i) => dv.setFloat32(84 + 12 + i * 4, v, true))
    const m = parseStl(buf)
    expect(m.vertices).toEqual([[0, 0, 0], [2, 0, 0], [0, 3, 0]])
    expect(m.faces).toEqual([[0, 1, 2]])
  })

  it('un archivo inválido da error', () => {
    expect(() => parseStl(new TextEncoder().encode('hola').buffer as ArrayBuffer)).toThrow()
  })
})
