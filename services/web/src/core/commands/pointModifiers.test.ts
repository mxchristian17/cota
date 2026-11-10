import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../test/engineHarness'
import type { LineProps } from '../document/types'

describe('modificadores de punto', () => {
  it('M2P: el medio entre dos puntos responde el prompt; FROM: base + desplazamiento', async () => {
    const h = makeEngine()
    await h.run('LINE', 'm2p', '#0,0', '#10,4', 'from', '#100,100', '@5,-5', '')
    const l = h.ofType('LINE')[0].props as LineProps
    expect(l.start).toEqual([5, 2, 0])
    expect(l.end).toEqual([105, 95, 0])
  })
})

describe('distancia tecleada sobre una trayectoria de tracking', () => {
  it('sin punto base (primer punto de PLINE, centro de CIRCLE) y con él: desde el origen de la trayectoria', async () => {
    const h = makeEngine()
    // Alineación vertical desde el punto adquirido 10,0 (como al detenerse sobre un extremo y subir el cursor).
    h.setTrackPath({ origin: { x: 10, y: 0, z: 0 }, dir: { x: 0, y: 1, z: 0 } })
    await h.run('CIRCLE', '5', '2')
    const c = h.ofType('CIRCLE')[0].props as { center: number[] }
    expect(c.center).toEqual([10, 5, 0])
    await h.run('PLINE', '7')
    h.setTrackPath(null)
    await h.run('#20,7', '')
    const p = h.ofType('POLYLINE')[0].props as { vertices: number[][] }
    expect(p.vertices[0]).toEqual([10, 7, 0])
  })
})

describe('ORTHO y esquinas opuestas', () => {
  it('RECTANG y BOX: con ORTHO la esquina opuesta no se alinea con la primera (no queda una línea)', async () => {
    const h = makeEngine()
    h.setOrtho(true)
    await h.run('RECTANG', '#0,0')
    await h.click(10, 4)
    const r = h.ofType('RECTANGLE')[0].props as { width: number; height: number }
    expect([r.width, r.height]).toEqual([10, 4])
    await h.run('BOX', '#20,0')
    await h.click(30, 6)
    await h.run('3')
    const b = h.ofType('SOLID3D')[0].props as { width: number; depth: number }
    expect([b.width, b.depth]).toEqual([10, 6])
    // Una línea sí respeta ORTHO.
    await h.run('LINE', '#0,20')
    await h.click(10, 24)
    await h.run('')
    expect((h.ofType('LINE')[0].props as { end: number[] }).end).toEqual([10, 20, 0])
  })
})
