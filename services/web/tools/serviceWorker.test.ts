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

  it('es JavaScript válido', () => {
    expect(() => new Function(src)).not.toThrow()
  })
})
