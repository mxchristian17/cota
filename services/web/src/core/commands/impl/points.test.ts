import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import type { PointProps } from '../../document/types'
import { importDxf, exportDxf } from '../../io/dxf'
import { applySysvars, persistedSysvars, resetSysvars, sysvars } from '../sysvars'

const pts = (h: ReturnType<typeof makeEngine>) => h.ofType('POINT').map((e) => (e.props as PointProps).position)

describe('POINT, DIVIDE y MEASURE', () => {
  it('POINT deja un punto donde se indica', async () => {
    const h = makeEngine()
    await h.run('POINT', '10,20')
    expect(pts(h)).toEqual([[10, 20, 0]])
  })

  it('DIVIDE en 4 una línea: tres puntos a distancias iguales; no corta la línea', async () => {
    const h = makeEngine()
    const l = h.add('LINE', { start: [0, 0, 0], end: [100, 0, 0] })
    await h.run('DIVIDE')
    await h.click(30, 0, l.id)
    await h.run('4')
    expect(pts(h).map((p) => +p[0].toFixed(9))).toEqual([25, 50, 75])
    expect(h.ofType('LINE')).toHaveLength(1)
  })

  it('DIVIDE y MEASURE usan la selección previa: no vuelven a pedir objetos', async () => {
    const h = makeEngine()
    const a = h.add('LINE', { start: [0, 0, 0], end: [100, 0, 0] })
    const b = h.add('LINE', { start: [0, 10, 0], end: [100, 10, 0] })
    h.setSelection([a.id, b.id])
    await h.run('DIVIDE', '4')
    expect(pts(h)).toHaveLength(6)
    expect(h.prints.join('\n')).not.toContain('Select object to divide')
    h.setSelection([a.id])
    await h.run('MEASURE', '30')
    expect(pts(h).filter((p) => p[1] === 0).map((p) => +p[0].toFixed(9)).sort((x, y) => x - y)).toEqual([25, 30, 50, 60, 75, 90])
  })

  it('DIVIDE en un círculo cerrado: N puntos', async () => {
    const h = makeEngine()
    const c = h.add('CIRCLE', { center: [0, 0, 0], radius: 10, normal: [0, 0, 1] })
    await h.run('DIVIDE')
    await h.click(10, 0, c.id)
    await h.run('6')
    const p = pts(h)
    expect(p).toHaveLength(6)
    for (const q of p) expect(Math.hypot(q[0], q[1])).toBeCloseTo(10, 9)
  })

  it('MEASURE desde el extremo más cercano al clic', async () => {
    const h = makeEngine()
    const l = h.add('LINE', { start: [0, 0, 0], end: [100, 0, 0] })
    await h.run('MEASURE')
    await h.click(90, 0, l.id)
    await h.run('30')
    expect(pts(h).map((p) => +p[0].toFixed(9))).toEqual([70, 40, 10])
  })

  it('PDMODE valida los valores del CAD clásico', async () => {
    const h = makeEngine()
    await h.run('PDMODE', '5')
    expect(h.prints.join('\n')).toContain('Valid values')
    await h.run('35')
    expect(h.prints.join('\n')).not.toContain('Unknown')
  })

  it('el punto viaja por DXF', () => {
    const dxf = exportDxf([{ id: 'p', type: 'POINT', layer: '0', props: { position: [1, 2, 3] } }] as never, [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false, frozen: false, printable: true, lineWeight: 0.25, lineType: 'CONTINUOUS' }] as never, '0')
    const back = importDxf(dxf).entities.find((e) => e.type === 'POINT')!
    expect((back.props as PointProps).position).toEqual([1, 2, 3])
  })

  it('PDMODE y PDSIZE se guardan con las preferencias y vuelven en la próxima visita', () => {
    resetSysvars()
    sysvars.PDMODE = 35
    sysvars.PDSIZE = -8
    const saved = JSON.parse(JSON.stringify(persistedSysvars()))
    resetSysvars()
    applySysvars(saved)
    expect([sysvars.PDMODE, sysvars.PDSIZE]).toEqual([35, -8])
    applySysvars({ PDMODE: 7 })
    expect(sysvars.PDMODE).toBe(35) // inválido: se ignora
    resetSysvars()
  })
})
