import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import type { RegionProps } from '../../document/types'
import { regionArea, regionPerimeter } from '../../region/region'
import { exportDxf, importDxf } from '../../io/dxf'

const regions = (h: ReturnType<typeof makeEngine>): RegionProps[] => h.ofType('REGION').map((e) => e.props as RegionProps)

describe('REGION', () => {
  it('un rectángulo y un círculo: 2 lazos, 2 regiones; los objetos de origen se borran', async () => {
    const h = makeEngine()
    await h.run('RECTANG', '#0,0', '#100,50')
    await h.run('CIRCLE', '#200,0', '10')
    await h.run('REGION', 'ALL', '')
    expect(h.prints).toContain('2 loops extracted.')
    expect(h.prints).toContain('2 Regions created.')
    expect(h.ofType('RECTANGLE').length + h.ofType('CIRCLE').length).toBe(0)
    const areas = regions(h).map(regionArea).sort((a, b) => a - b)
    expect(areas[0]).toBeCloseTo(Math.PI * 100, 6) // el círculo queda con arcos exactos
    expect(areas[1]).toBeCloseTo(5000, 6)
    expect(regionPerimeter(regions(h).find((r) => r.loops[0].bulges)!)).toBeCloseTo(20 * Math.PI, 6)
  })

  it('una cadena cerrada de líneas y un arco (en cualquier orden y sentido); una abierta no', async () => {
    const h = makeEngine()
    await h.run('LINE', '#0,0', '#100,0', '')
    await h.run('LINE', '#0,50', '#0,0', '')
    await h.run('ARC', '#100,0', '#125,25', '#100,50')
    await h.run('LINE', '#100,50', '#0,50', '')
    await h.run('LINE', '#300,0', '#400,0', '#400,100', '')
    await h.run('REGION', 'ALL', '')
    expect(h.prints).toContain('1 loop extracted.')
    expect(regions(h).length).toBe(1)
    // Rectángulo 100×50 más el semicírculo de radio 25.
    expect(regionArea(regions(h)[0])).toBeCloseTo(5000 + (Math.PI * 625) / 2, 6)
    expect(h.ofType('LINE').length).toBe(2) // la abierta queda
  })

  it('MOVE, EXPLODE y AREA ▸ Object', async () => {
    const h = makeEngine()
    await h.run('RECTANG', '#0,0', '#10,10')
    await h.run('REGION', 'ALL', '')
    await h.run('MOVE', 'ALL', '', '#0,0', '#5,0')
    expect(Math.min(...regions(h)[0].loops[0].vertices.map((v) => v[0]))).toBeCloseTo(5, 9)
    await h.run('AREA', 'O')
    await h.click(10, 0, h.ofType('REGION')[0].id)
    expect(h.prints.some((l) => /Area = 100(\.0+)?\b/.test(l))).toBe(true)
    await h.run('EXPLODE', 'ALL', '')
    expect(h.ofType('REGION').length).toBe(0)
    expect(h.ofType('LINE').length).toBe(4)
  })

  it('el ejemplo de la referencia: una ranura de dos líneas y dos arcos', async () => {
    const h = makeEngine()
    await h.run('LINE', '#0,0', '#40,0', '')
    await h.run('ARC', '#40,0', '#50,10', '#40,20')
    await h.run('LINE', '#40,20', '#0,20', '')
    await h.run('ARC', '#0,20', '#-10,10', '#0,0')
    await h.run('REGION', 'ALL', '')
    expect(regions(h).length).toBe(1)
    expect(regionArea(regions(h)[0])).toBeCloseTo(800 + 100 * Math.PI, 6)
    expect(regionPerimeter(regions(h)[0])).toBeCloseTo(80 + 20 * Math.PI, 6)
  })

  it('al DXF sale como polilínea cerrada con sus arcos; al volver, REGION la rehace con la misma área', async () => {
    const h = makeEngine()
    await h.run('LINE', '#0,0', '#40,0', '')
    await h.run('ARC', '#40,0', '#50,10', '#40,20')
    await h.run('LINE', '#40,20', '#0,20', '')
    await h.run('ARC', '#0,20', '#-10,10', '#0,0')
    await h.run('REGION', 'ALL', '')
    const back = importDxf(exportDxf(h.doc.entities, h.doc.layers)).entities.filter((e) => e.type === 'POLYLINE')
    expect(back.length).toBe(1)
    const h2 = makeEngine()
    for (const e of back) h2.doc.addEntity({ type: e.type, layer: '0', props: e.props })
    await h2.run('REGION', 'ALL', '')
    expect(regionArea(regions(h2)[0])).toBeCloseTo(800 + 100 * Math.PI, 6)
  })

  describe('booleanas de regiones', () => {
    it('SUBTRACT: rectángulo menos círculo adentro = una región con agujero de arcos exactos', async () => {
      const h = makeEngine()
      await h.run('RECTANG', '#0,0', '#100,50')
      await h.run('REGION', 'L', '')
      await h.run('CIRCLE', '#50,25', '10')
      await h.run('REGION', 'L', '')
      const [rect, circ] = h.ofType('REGION')
      await h.run('SUBTRACT')
      await h.click(0, 0, rect.id)
      await h.run('')
      await h.click(60, 25, circ.id)
      await h.run('')
      const rs = regions(h)
      expect(rs.length).toBe(1)
      expect(rs[0].loops.length).toBe(2)
      expect(regionArea(rs[0])).toBeCloseTo(5000 - 100 * Math.PI, 6)
      expect(regionPerimeter(rs[0])).toBeCloseTo(300 + 20 * Math.PI, 6)
    })

    it('UNION de dos círculos superpuestos: área exacta, sólo arcos', async () => {
      const h = makeEngine()
      await h.run('CIRCLE', '#0,0', '10')
      await h.run('CIRCLE', '#10,0', '10')
      await h.run('REGION', 'ALL', '')
      await h.run('UNION', 'ALL', '')
      const rs = regions(h)
      expect(rs.length).toBe(1)
      const lens = 200 * Math.acos(0.5) - 5 * Math.sqrt(300)
      expect(regionArea(rs[0])).toBeCloseTo(200 * Math.PI - lens, 6)
      expect(rs[0].loops[0].bulges?.every((b) => b !== 0)).toBe(true)
      // Los dos picos del contorno, exactos.
      const ys = rs[0].loops[0].vertices.filter((v) => Math.abs(v[0] - 5) < 1e-9).map((v) => Math.abs(v[1]))
      expect(ys.length).toBe(2)
      for (const y of ys) expect(y).toBeCloseTo(Math.sqrt(75), 9)
    })

    it('SUBTRACT de un círculo sobre el borde: muesca semicircular; INTERSECT de rectángulos', async () => {
      const h = makeEngine()
      await h.run('RECTANG', '#0,0', '#100,50')
      await h.run('CIRCLE', '#50,50', '10')
      await h.run('REGION', 'ALL', '')
      const [rect, circ] = h.ofType('REGION')
      await h.run('SUBTRACT')
      await h.click(0, 0, rect.id)
      await h.run('')
      await h.click(60, 50, circ.id)
      await h.run('')
      expect(regionArea(regions(h)[0])).toBeCloseTo(5000 - 50 * Math.PI, 6)
      // 4 esquinas, los 2 cortes y el medio del arco de 180° (los arcos se guardan en tramos de hasta 90°).
      expect(regions(h)[0].loops[0].vertices.length).toBe(7)
      const g = makeEngine()
      await g.run('RECTANG', '#0,0', '#10,10')
      await g.run('RECTANG', '#5,5', '#20,20')
      await g.run('RECTANG', '#100,100', '#110,110')
      await g.run('REGION', 'ALL', '')
      await g.run('INTERSECT', 'ALL', '')
      expect(g.prints).toContain('Null region created - deleted.')
      expect(regions(g).length).toBe(0)
      const k = makeEngine()
      await k.run('RECTANG', '#0,0', '#10,10')
      await k.run('RECTANG', '#5,5', '#20,20')
      await k.run('REGION', 'ALL', '')
      await k.run('INTERSECT', 'ALL', '')
      expect(regionArea(regions(k)[0])).toBeCloseTo(25, 9)
      expect(regions(k)[0].loops[0].vertices.length).toBe(4)
    })
  })
})
