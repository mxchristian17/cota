import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'

const out = (h: ReturnType<typeof makeEngine>) => h.prints.join('\n')

describe('ID, AREA, LIST y MASSPROP', () => {
  it('ID muestra las coordenadas del punto', async () => {
    const h = makeEngine()
    await h.run('ID', '12.5,-3')
    expect(h.prints.at(-1)).toBe('X = 12.5000  Y = -3.0000  Z = 0.0000')
  })

  it('AREA por puntos da área y perímetro; Object mide un círculo y una polilínea con arco', async () => {
    const h = makeEngine()
    await h.run('AREA', '0,0', '40,0', '40,30', '0,30', '')
    expect(h.prints.at(-1)).toBe('Area = 1200.0000, Perimeter = 140.0000')
    const c = h.add('CIRCLE', { center: [0, 0, 0], radius: 10, normal: [0, 0, 1] })
    await h.run('AREA', '')
    await h.click(10, 0, c.id)
    expect(h.prints.at(-1)).toBe(`Area = ${(Math.PI * 100).toFixed(4)}, Circumference = ${(Math.PI * 20).toFixed(4)}`)
    // Medio disco: rectas y un arco (bulge 1) → área exacta.
    const p = h.add('POLYLINE', { vertices: [[0, 0, 0], [10, 0, 0], [20, 0, 0]], bulges: [0, 0, 1], closed: true })
    await h.run('AREA', 'O')
    await h.click(10, 0, p.id)
    expect(h.prints.at(-1)).toMatch(new RegExp(`^Area = ${(Math.PI * 50).toFixed(4)}, Perimeter = `))
  })

  it('AREA Add/Subtract lleva un total', async () => {
    const h = makeEngine()
    await h.run('AREA', 'A', '0,0', '10,0', '10,10', '0,10', '', 'S', '0,0', '5,0', '5,5', '', 'X')
    expect(h.prints).toContain('Total area = 100.0000')
    expect(h.prints).toContain('Total area = 87.5000')
  })

  it('LIST describe una línea y un círculo; MASSPROP da volumen y centroide de una caja', async () => {
    const h = makeEngine()
    h.add('LINE', { start: [0, 0, 0], end: [30, 40, 0] })
    await h.run('LIST', 'ALL', '')
    expect(out(h)).toMatch(/LINE {2}Layer: "0"/)
    expect(out(h)).toContain('Length = 50.0000,  Angle in XY Plane = 53.13')
    h.add('SOLID3D', { op: 'BOX', origin: [0, 0, 0], width: 10, depth: 20, height: 30 })
    await h.run('MASSPROP', 'L', '')
    expect(out(h)).toContain('Volume:          6000.0000')
    expect(out(h)).toContain('Centroid:        X = 5.0000  Y = 10.0000  Z = 15.0000')
  })
})

describe('LIST muestra color, tipo de línea y grosor (R25)', () => {
  it('ByLayer con lo que toma de la capa, y los propios del objeto', async () => {
    const h = makeEngine()
    const { LayerService } = await import('../../layers/LayerService')
    const svc = new LayerService(h.doc)
    const rojo = svc.create('ROJO', { color: '#ff0000', lineType: 'DASHED', lineWeight: 0.5 })
    h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] }, rojo.id)
    const own = h.add('CIRCLE', { center: [0, 0, 0], radius: 5, normal: [0, 0, 1] })
    Object.assign(own, { color: '#0000ff', lineType: 'CENTER', ltScale: 2, lineWeight: 0.35 })
    await h.run('LIST', 'ALL', '')
    const text = out(h)
    expect(text).toContain('  Color: ByLayer (Red)  Linetype: ByLayer (DASHED)  Lineweight: ByLayer (0.50 mm)')
    expect(text).toContain('  Color: Blue  Linetype: CENTER  Linetype scale: 2.0000  Lineweight: 0.35 mm')
  })
})

describe('LIST y MASSPROP con el volumen exacto (R43)', () => {
  it('un cilindro r=10 h=20 da 6283.1853 (no el del prisma inscripto de la malla)', async () => {
    const h = makeEngine()
    h.add('SOLID3D', { op: 'CYLINDER', base: [0, 0, 0], radius: 10, height: 20, segments: 48 })
    await h.run('LIST', 'ALL', '')
    expect(out(h)).toContain('Volume = 6283.1853')
    await h.run('MASSPROP', 'ALL', '')
    expect(out(h)).toContain('Volume:          6283.1853')
    h.add('SOLID3D', { op: 'CYLINDER', base: [100, 0, 0], radius: 15, height: 20, segments: 48 })
    h.prints.length = 0
    await h.run('MASSPROP', 'ALL', '')
    expect(out(h)).toContain(`Volume:          ${(Math.PI * 100 * 20 + Math.PI * 225 * 20).toFixed(4)}`)
  })
})
