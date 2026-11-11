import { describe, expect, it } from 'vitest'
import { serviceWorkerSource } from './serviceWorker'

describe('service worker de la app instalable', () => {
  const src = serviceWorkerSource('abc123', ['./', 'assets/index-x.js', 'icon.svg'])

  it('guarda los archivos de la versión en un caché con su nombre', () => {
    expect(src).toContain("const CACHE = 'cota-abc123'")
    expect(src).toContain('["./","assets/index-x.js","icon.svg"]')
  })

  it('no intercepta el servidor ni otros orígenes, y la página va primero a la red', () => {
    expect(src).toContain("url.pathname.includes('/api/')")
    expect(src).toContain('url.origin !== self.location.origin')
    expect(src).toContain("req.mode === 'navigate'")
  })

  it('el núcleo de sólidos no se precarga: se guarda al usarlo en su caché, que borra sólo otra versión del núcleo', () => {
    const occt = serviceWorkerSource('abc123', ['./'], '5.17.1')
    expect(occt).toContain("const OCCT_CACHE = 'occt-5.17.1'")
    expect(occt).toContain("const OCCT_PATH = 'occt/5.17.1/'")
    expect(occt).toContain("k.startsWith('occt-') && k !== OCCT_CACHE")
    expect(() => new Function(occt)).not.toThrow()
  })

  it('es JavaScript válido', () => {
    expect(() => new Function(src)).not.toThrow()
  })
})
