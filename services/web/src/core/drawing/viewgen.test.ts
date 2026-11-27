import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEWGEN, layoutExtent, mongeLayout, type GenView } from './viewgen'

const size = (v: GenView) => (v === 'ISO' ? { w: 120, h: 90 } : v === 'TOP' ? { w: 100, h: 60 } : v === 'LEFT' ? { w: 60, h: 40 } : { w: 100, h: 40 })

describe('mongeLayout', () => {
  it('ISO-E: la isométrica va abajo a la derecha (junto a la planta), sin agrandar la lámina hacia arriba', () => {
    const placed = mongeLayout({ ...DEFAULT_VIEWGEN, std: 'E' }, size, 20)
    const at = (v: GenView) => placed.find((p) => p.view === v)!
    const iso = at('ISO')
    expect(iso.x).toBe(at('LEFT').x)
    expect(iso.y).toBe(at('TOP').y)
    const ext = layoutExtent(placed, size)
    expect(ext.cy + ext.h / 2).toBeCloseTo(20, 9) // lo más alto sigue siendo el alzado (alto 40, centrado en 0)
  })

  it('ISO-A: la planta va arriba y la isométrica en su esquina de arriba a la derecha', () => {
    const placed = mongeLayout({ ...DEFAULT_VIEWGEN, std: 'A', views: ['FRONT', 'TOP', 'RIGHT', 'ISO'] }, (v) => size(v === 'RIGHT' ? 'LEFT' : v), 20)
    const at = (v: GenView) => placed.find((p) => p.view === v)!
    expect(at('ISO').y).toBe(at('TOP').y)
    expect(at('ISO').x).toBe(at('RIGHT').x)
  })
})

describe('silueta exacta de cilindros vistos de costado (R19)', () => {
  it('las líneas de contorno del teselado (a r·cos δ del eje) y los extremos de la base vista de canto se corren al radio; las demás no se tocan', async () => {
    const { snapSilhouettes } = await import('../projection/orthographic')
    const { viewBasis } = await import('./views')
    const r = 21
    const k = r * Math.cos(Math.PI / 64) // vértice a medio lado de un 32-ágono: 41,99 de diámetro
    const items = [
      { kind: 'line' as const, a: [-k, 0] as [number, number], b: [-k, 50] as [number, number], hidden: false },
      { kind: 'line' as const, a: [k, 0] as [number, number], b: [k, 50] as [number, number], hidden: false },
      { kind: 'line' as const, a: [-15, 0] as [number, number], b: [-15, 50] as [number, number], hidden: false }, // otra arista
      { kind: 'line' as const, a: [-k, 0] as [number, number], b: [k, 0] as [number, number], hidden: false }, // base
    ]
    // Cilindro de eje Z visto de frente: la vista frontal mira por −Y (derecha = X, arriba = Z).
    const out = snapSilhouettes(items, [{ c: [0, 0, 0], n: [0, 0, 1], r }], viewBasis('FRONT'))
    const xs = out.map((it) => (it.kind === 'line' ? it.a[0] : NaN))
    expect(xs[1] - xs[0]).toBeCloseTo(42, 12)
    expect(xs[2]).toBe(-15)
    // La base (el círculo visto de canto) llega al radio, como la silueta: los dos extremos coinciden.
    const base = out[3] as { a: [number, number]; b: [number, number] }
    expect(base.a[0]).toBeCloseTo(-21, 12)
    expect(base.b[0]).toBeCloseTo(21, 12)
    expect([base.a[1], base.b[1]]).toEqual([0, 0])
  })
})
