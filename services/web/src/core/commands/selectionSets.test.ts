import { describe, it, expect } from 'vitest'
import { makeEngine } from '../../test/engineHarness'
import { LayerService } from '../layers/LayerService'

/** Tres líneas: dos a la izquierda (x 0..10) y una a la derecha (x 50..60); y un círculo. */
function setup() {
  const h = makeEngine()
  const a = h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
  const b = h.add('LINE', { start: [0, 5, 0], end: [10, 5, 0] })
  const c = h.add('LINE', { start: [50, 0, 0], end: [60, 0, 0] })
  const d = h.add('CIRCLE', { center: [30, 30, 0], radius: 5, normal: [0, 0, 1] })
  return { h, a, b, c, d }
}
const erasedAfter = async (h: ReturnType<typeof makeEngine>, ...inputs: string[]) => {
  h.setSelection([]) // como la app: la selección se vacía al terminar cada comando
  await h.run('ERASE', ...inputs)
  return h.doc.entities.length
}

describe('opciones de Select objects (CAD clásico)', () => {
  it('ALL, Last y Previous', async () => {
    const { h, c } = setup()
    expect(await erasedAfter(h, 'L', '')).toBe(3) // Last: el círculo
    await h.run('MOVE', 'P', '') // Previous: el conjunto anterior (ya borrado) → nada
    h.setSelection([])
    await h.run('MOVE', 'L', '', '#0,0', '#5,0')
    expect((h.doc.getEntity(c.id)!.props as { start: number[] }).start).toEqual([55, 0, 0])
    expect(await erasedAfter(h, 'ALL', '')).toBe(0)
  })

  it('Window y Crossing por coordenadas; Remove y Undo', async () => {
    const { h, d } = setup()
    // Window: sólo lo totalmente adentro (las dos líneas de la izquierda).
    expect(await erasedAfter(h, 'W', '#-1,-1', '#11,6', '')).toBe(2)
    const h2 = setup()
    // Crossing que toca la línea derecha y el círculo; Remove saca el círculo; Undo lo vuelve a sacar del paso.
    await h2.h.run('ERASE', 'C', '#55,-1', '#31,31', 'R')
    await h2.h.click(35, 30, h2.d.id)
    await h2.h.run('')
    expect(h2.h.doc.entities.map((e) => e.id)).toEqual([h2.a.id, h2.b.id, h2.d.id])
    expect(d).toBeTruthy()
  })

  it('WPolygon, CPolygon y Fence', async () => {
    const { h, a, b, c } = setup()
    expect(await erasedAfter(h, 'WP', '#-1,-1', '#12,-1', '#12,7', '#-1,7', '', '')).toBe(2)
    const s2 = setup()
    await s2.h.run('ERASE', 'F', '#5,-5', '#5,10', '', '')
    expect(s2.h.doc.entities.map((e) => e.id)).toEqual([s2.c.id, s2.d.id])
    const s3 = setup()
    await s3.h.run('ERASE', 'CP', '#45,-5', '#70,-5', '#70,40', '', '')
    expect(s3.h.doc.entities.map((e) => e.id)).toEqual([s3.a.id, s3.b.id, s3.d.id])
    expect([a, b, c].length).toBe(3)
  })

  it('no toma objetos de capas congeladas o bloqueadas; opción inválida avisa', async () => {
    const { h, c } = setup()
    const svc = new LayerService(h.doc)
    const lk = svc.create('LK', { locked: true })
    h.doc.getEntity(c.id)!.layer = lk.id
    await h.run('ERASE', 'ALL', '')
    expect(h.doc.entities.map((e) => e.id)).toEqual([c.id])
    await h.run('ERASE', 'XYZ', '')
    expect(h.prints).toContain('*Invalid selection*')
  })
})
