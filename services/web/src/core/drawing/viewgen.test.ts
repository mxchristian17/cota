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
