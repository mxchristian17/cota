import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'

/** Revisión de fidelidad 2026-10-13: geometría en el plano de la vista, VIEW y eco del historial. */
describe('plano de la vista (FRONT) y eco de prompts', () => {
  it('CIRCLE en FRONT queda en el plano vertical con la normal hacia el observador', async () => {
    const h = makeEngine()
    h.setFacing([0, -1, 0])
    await h.run('CIRCLE', '#0,0,0', '10')
    const [c] = h.ofType('CIRCLE')
    expect(c.props).toMatchObject({ center: [0, 0, 0], radius: 10, normal: [0, -1, 0] })
  })

  it('CIRCLE 2P en FRONT mide el diámetro en 3D (punto medio entre los dos puntos)', async () => {
    const h = makeEngine()
    h.setFacing([0, -1, 0])
    await h.run('CIRCLE', '2P', '#0,0,0', '#0,0,20')
    const [c] = h.ofType('CIRCLE')
    expect(c.props).toMatchObject({ center: [0, 0, 10], radius: 10 })
  })

  it('RECTANGLE en FRONT es una polilínea cerrada en el plano XZ; en planta, un RECTANGLE a la Z de la esquina', async () => {
    const h = makeEngine()
    h.setFacing([0, -1, 0])
    await h.run('RECTANGLE', '#0,5,0', '#20,5,10')
    const [pl] = h.ofType('POLYLINE')
    expect(pl.props).toMatchObject({ closed: true, vertices: [[0, 5, 0], [20, 5, 0], [20, 5, 10], [0, 5, 10]] })

    h.setFacing(undefined)
    await h.run('RECTANGLE', '#0,0,7', 'D', '30', '15', '#1,1,7')
    const [r] = h.ofType('RECTANGLE')
    expect(r.props).toMatchObject({ corner: [0, 0, 7], width: 30, height: 15 })
  })

  it('CYLINDER en FRONT crece hacia el observador (−Y)', async () => {
    const h = makeEngine()
    h.setFacing([0, -1, 0])
    await h.run('CYLINDER', '#0,0,0', '5', '10')
    const [s] = h.ofType('SOLID3D')
    expect(s.props).toMatchObject({ op: 'CYLINDER', axis: [0, -1, 0], height: 10 })
  })

  it('VIEW acepta las cuatro isométricas del CAD clásico (SEiso = ISO) y BAck', async () => {
    const h = makeEngine()
    await h.run('VIEW', 'SW', 'VIEW', 'SEISO', 'VIEW', 'NEiso', 'VIEW', 'NW', 'VIEW', 'BA', 'VIEW', 'Iso')
    expect(h.views).toEqual(['SWISO', 'ISO', 'NEISO', 'NWISO', 'BACK', 'ISO'])
  })

  it('el historial repite cada prompt con lo tecleado; un clic deja el prompt solo', async () => {
    const h = makeEngine()
    await h.run('CIRCLE', '0,0', '10')
    expect(h.prints).toContain('Specify center point for circle or [3P/2P/Ttr (tan tan radius)]: 0,0')
    expect(h.prints.some((l) => /^Specify radius of circle or \[Diameter\].*: 10$/.test(l))).toBe(true)
    await h.run('LINE')
    await h.click(0, 0)
    await h.run('5,0', '')
    expect(h.prints).toContain('Specify first point:')
    expect(h.prints.some((l) => /: 5,0$/.test(l))).toBe(true)
  })

  it('una opción inválida en un prompt de punto da el mensaje del CAD clásico', async () => {
    const h = makeEngine()
    await h.run('CIRCLE', 'XYZ')
    expect(h.prints).toContain('Point or option keyword required.')
  })

  it('un clic en "Select objects:" informa en la misma línea del prompt', async () => {
    const h = makeEngine()
    const l = h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    await h.run('ERASE')
    await h.click(5, 0, l.id)
    expect(h.prints).toContain('Select objects: 1 found, 1 total')
  })
})

describe('coordenadas tecleadas en la UCS', () => {
  it('en la UCS Front, LINE 0,0 → @10,0 → @0,5 dibuja en el plano XZ', async () => {
    const { orthoUcs } = await import('../../ucs')
    const h = makeEngine()
    h.setUcs(orthoUcs('FRONT'))
    await h.run('LINE', '0,0', '@10,0', '@0,5', '')
    const [a, b] = h.ofType('LINE')
    expect(a.props).toMatchObject({ start: [0, 0, 0], end: [10, 0, 0] })
    expect(b.props).toMatchObject({ start: [10, 0, 0], end: [10, 0, 5] })
  })

  it('"*x,y,z" ignora la UCS', async () => {
    const { orthoUcs } = await import('../../ucs')
    const h = makeEngine()
    h.setUcs(orthoUcs('LEFT'))
    await h.run('LINE', '*1,2,3', '*4,5,6', '')
    expect(h.ofType('LINE')[0].props).toMatchObject({ start: [1, 2, 3], end: [4, 5, 6] })
  })
})
