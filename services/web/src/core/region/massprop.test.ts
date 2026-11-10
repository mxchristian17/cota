import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../test/engineHarness'
import type { RegionProps } from '../document/types'
import { sectionProperties } from './massprop'

const id = (v: [number, number, number]) => v
const rect = (x0: number, y0: number, w: number, h: number): RegionProps => ({ loops: [{ vertices: [[x0, y0, 0], [x0 + w, y0, 0], [x0 + w, y0 + h, 0], [x0, y0 + h, 0]] }] })
/** Círculo como cuatro arcos de 90° (bulge tan(π/8)), en el sentido pedido. */
const circle = (cx: number, cy: number, r: number, cw = false): HatchLoopLike => {
  const b = Math.tan(Math.PI / 8) * (cw ? -1 : 1)
  const pts: Array<[number, number, number]> = [[cx + r, cy, 0], [cx, cy + r, 0], [cx - r, cy, 0], [cx, cy - r, 0]]
  return { vertices: cw ? [...pts].reverse() : pts, bulges: [b, b, b, b] }
}
type HatchLoopLike = RegionProps['loops'][number]

describe('propiedades de sección de regiones', () => {
  it('rectángulo 100 × 50: momentos respecto de los ejes y principales en el centroide', () => {
    const q = sectionProperties(rect(0, 0, 100, 50), id)!
    expect(q.area).toBeCloseTo(5000, 9)
    expect(q.centroid[0]).toBeCloseTo(50, 9)
    expect(q.centroid[1]).toBeCloseTo(25, 9)
    expect(q.ix).toBeCloseTo((100 * 50 ** 3) / 3, 5)
    expect(q.iy).toBeCloseTo((50 * 100 ** 3) / 3, 5)
    expect(q.ixy).toBeCloseTo(5000 * 1250, 5)
    expect(q.rx).toBeCloseTo(Math.sqrt(50 ** 2 / 3), 9)
    expect(q.principal[0].moment).toBeCloseTo((100 * 50 ** 3) / 12, 5)
    expect(q.principal[0].dir).toEqual([1, 0])
    expect(q.principal[1].moment).toBeCloseTo((50 * 100 ** 3) / 12, 5)
    expect(q.principal[1].dir).toEqual([0, 1])
  })

  it('placa con agujero (Steiner) y círculo exacto, en cualquier sentido de los lazos', () => {
    const c = sectionProperties({ loops: [circle(0, 0, 10)] }, id)!
    expect(c.area).toBeCloseTo(100 * Math.PI, 9)
    expect(c.ix).toBeCloseTo((Math.PI * 10 ** 4) / 4, 6)
    expect(c.ixy).toBeCloseTo(0, 9)
    const plate: RegionProps = { loops: [rect(0, 0, 100, 50).loops[0], circle(50, 25, 10, true)] }
    const q = sectionProperties(plate, id)!
    const ac = 100 * Math.PI
    expect(q.area).toBeCloseTo(5000 - ac, 9)
    expect(q.ix).toBeCloseTo((100 * 50 ** 3) / 3 - ((Math.PI * 10 ** 4) / 4 + ac * 25 ** 2), 4)
    expect(q.iy).toBeCloseTo((50 * 100 ** 3) / 3 - ((Math.PI * 10 ** 4) / 4 + ac * 50 ** 2), 4)
    expect(q.centroid[0]).toBeCloseTo(50, 9)
  })

  it('MASSPROP de un rectángulo girado 30°: ejes principales a 30°', async () => {
    const h = makeEngine()
    await h.run('RECTANG', '#0,0', '#40,10')
    await h.run('REGION', 'ALL', '')
    await h.run('ROTATE', 'ALL', '', '#0,0', '30')
    await h.run('MASSPROP', 'ALL', '')
    const at = (label: string) => h.prints.find((l) => l.includes(label))
    expect(at('Area:')).toMatch(/400\.0000/)
    const I = h.prints.find((l) => /I: .* along/.test(l))!
    expect(I).toMatch(/along \[0\.8660 0\.5000\]/)
    expect(I).toMatch(/I: 3333\.3333/) // 40·10³/12
  })
})
