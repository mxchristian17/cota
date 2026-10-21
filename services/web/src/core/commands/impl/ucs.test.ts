import { describe, expect, it } from 'vitest'
import '../../../render/csg' // registra el mallador de sólidos (topología)
import { makeEngine } from '../../../test/engineHarness'
import { sysvars, resetSysvars } from '../sysvars'
import { ucsZ, type Ucs } from '../../ucs'
import type { Vec3 } from '../../math'

const closeV = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9))
const axes = (u: Ucs) => ({ x: u.x, y: u.y, z: ucsZ(u), o: [u.origin.x, u.origin.y, u.origin.z] as Vec3 })

describe('comando UCS', () => {
  it('3 puntos: origen, X y un punto del plano XY', async () => {
    const h = makeEngine()
    await h.run('UCS', '#5,0,0', '#5,0,10', '#5,10,0')
    const a = axes(h.ucs())
    closeV(a.o, [5, 0, 0])
    closeV(a.x, [0, 0, 1])
    closeV(a.y, [0, 1, 0])
    expect(h.prints).toContain('Current ucs name:  *WORLD*')
  })

  it('X 90 y Previous; Enter = World', async () => {
    const h = makeEngine()
    await h.run('UCS', 'X', '')
    closeV(axes(h.ucs()).z, [0, -1, 0])
    await h.run('UCS', 'P')
    closeV(axes(h.ucs()).z, [0, 0, 1])
    await h.run('UCS', 'Z', '30', 'UCS', '')
    closeV(h.ucs().x, [1, 0, 0])
  })

  it('NAmed Save / Restore / ? / Delete', async () => {
    const h = makeEngine()
    await h.run('UCS', 'Y', '-90', 'UCS', 'NA', 'S', 'Lateral', 'UCS', 'W')
    closeV(h.ucs().x, [1, 0, 0])
    await h.run('UCS', 'NA', 'R', 'lateral')
    closeV(h.ucs().x, [0, 0, 1])
    await h.run('UCS', 'NA', '?')
    expect(h.prints).toContain('Saved UCSs: Lateral')
    await h.run('UCS', 'NA', 'D', 'Lateral')
    expect(h.doc.namedUcs()).toHaveLength(0)
  })

  it('ZAxis: origen y un punto del +Z; OBject sobre un círculo vertical', async () => {
    const h = makeEngine()
    await h.run('UCS', 'ZA', '#1,1,1', '#1,0,1')
    const a = axes(h.ucs())
    closeV(a.z, [0, -1, 0])
    closeV(a.o, [1, 1, 1])
    const c = h.add('CIRCLE', { center: [10, 0, 5], radius: 3, normal: [0, -1, 0] })
    await h.run('UCS', 'W', 'UCS', 'OB')
    await h.click(13, 0, c.id)
    const b = axes(h.ucs())
    closeV(b.z, [0, -1, 0])
    closeV(b.o, [10, 0, 5])
  })

  it('Face: la cara superior de una caja (normal +Z, origen en una esquina)', async () => {
    const h = makeEngine()
    h.add('SOLID3D', { op: 'BOX', origin: [0, 0, 0], width: 10, depth: 10, height: 4 })
    await h.run('UCS', 'F')
    await h.click(9, 5)
    await h.run('')
    const a = axes(h.ucs())
    closeV(a.z, [0, 0, 1])
    expect(a.o[2]).toBeCloseTo(4, 6)
    expect(a.o[0]).toBeCloseTo(10, 6)
  })

  it('View alinea el XY a la pantalla; PLAN pide la vista en planta', async () => {
    const h = makeEngine()
    h.setViewAxes([1, 0, 0], [0, 0, 1])
    await h.run('UCS', 'V')
    closeV(axes(h.ucs()).z, [0, -1, 0])
    await h.run('PLAN', '')
    expect(h.plans).toHaveLength(1)
  })

  it('UCSORTHO y UCSICON como variables', async () => {
    resetSysvars()
    const h = makeEngine()
    await h.run('UCSORTHO', '0')
    expect(sysvars.UCSORTHO).toBe(0)
    await h.run('UCSICON', 'OFF')
    expect(sysvars.UCSICON).toBe(2)
    resetSysvars()
  })
})
