import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'

describe('orden de dibujo (DRAWORDER, TEXTTOFRONT, HPDRAWORDER)', () => {
  it('DRAWORDER lleva objetos al fondo, al frente, encima o debajo de otros (lo último se dibuja encima)', async () => {
    const h = makeEngine()
    const a = h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    const b = h.add('LINE', { start: [0, 5, 0], end: [10, 5, 0] })
    const c = h.add('LINE', { start: [0, 9, 0], end: [10, 9, 0] })
    const order = () => h.doc.entities.map((e) => e.id)
    h.setSelection([c.id])
    await h.run('DRAWORDER', '')
    expect(order()).toEqual([c.id, a.id, b.id]) // <Back>
    h.setSelection([c.id])
    await h.run('DRAWORDER', 'F')
    expect(order()).toEqual([a.id, b.id, c.id])
    h.setSelection([a.id])
    await h.run('DR', 'A', 'L', '') // encima de la última (c)
    expect(order()).toEqual([b.id, c.id, a.id])
    h.setSelection([a.id])
    await h.run('DRAWORDER', 'U', 'L', '') // debajo de la última creada (c)
    expect(order()).toEqual([b.id, a.id, c.id])
  })

  it('TEXTTOFRONT pone los textos y las cotas encima', async () => {
    const h = makeEngine()
    const t = h.add('TEXT', { position: [0, 0, 0], text: 'A', height: 2, rotation: 0, justify: 'left', normal: [0, 0, 1] })
    const l = h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    await h.run('TEXTTOFRONT', 'T')
    expect(h.doc.entities.map((e) => e.id)).toEqual([l.id, t.id])
  })

  it('un sombreado nuevo queda detrás de su contorno', async () => {
    const h = makeEngine()
    await h.run('LINE', '0,0', '#100,0', '#100,50', '#0,50', 'C')
    await h.run('HATCH')
    await h.click(10, 10)
    await h.run('')
    expect(h.doc.entities.map((e) => e.type)).toEqual(['HATCH', 'POLYLINE'])
  })
})
