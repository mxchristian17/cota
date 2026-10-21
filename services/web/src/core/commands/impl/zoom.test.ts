import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'

const last = (h: ReturnType<typeof makeEngine>, name: string) => [...h.calls].reverse().find((c) => c[0] === name)?.[1]

describe('ZOOM, PAN, LIMITS y VIEW', () => {
  it('ZOOM: Previous, Center (alto y nX), Scale (nX y n por los límites), factor directo y Extents', async () => {
    const h = makeEngine()
    await h.run('ZOOM', 'P')
    expect(last(h, 'zoomPrevious')).toEqual([])
    await h.run('ZOOM', 'C', '#10,20', '40')
    expect(last(h, 'zoomCenter')).toEqual([{ x: 10, y: 20, z: 0 }, 40])
    await h.run('ZOOM', 'C', '#10,20', '2x')
    expect(last(h, 'zoomCenter')).toEqual([{ x: 10, y: 20, z: 0 }, 50])
    await h.run('ZOOM', 'S', '3x')
    expect(last(h, 'zoomScale')).toEqual([3])
    // `2` sin X: relativo a los límites (297 de alto en mm), desde el centro de la vista.
    await h.run('ZOOM', '2')
    expect(last(h, 'zoomCenter')).toEqual([{ x: 50, y: 25, z: 0 }, 148.5])
    await h.run('ZOOM', '0.5x')
    expect(last(h, 'zoomScale')).toEqual([0.5])
    await h.run('ZOOM', 'E')
    expect(h.prints).toContain('Zoom extents.')
  })

  it('ZOOM All: límites y extensión; Object: la caja de lo elegido', async () => {
    const h = makeEngine()
    await h.run('LIMITS', '#0,0', '#200,100')
    await h.run('ZOOM', 'A')
    expect(last(h, 'zoomBox')).toEqual([[0, 0, 0], [200, 100, 0]])
    const c = h.add('CIRCLE', { center: [300, 300, 0], radius: 10, normal: [0, 0, 1] })
    h.setSelection([c.id])
    await h.run('ZOOM', 'O')
    const [min, max] = last(h, 'zoomBox') as number[][]
    expect(min[0]).toBeCloseTo(290, 6)
    expect(max[1]).toBeCloseTo(310, 6)
  })

  it('ZOOM ↵ y PAN entran en tiempo real hasta Enter/Esc; -PAN desplaza', async () => {
    const h = makeEngine()
    await h.run('ZOOM', '')
    expect(last(h, 'realtime')).toEqual(['zoom'])
    await h.run('')
    expect(last(h, 'realtime')).toEqual([null])
    await h.run('PAN')
    expect(last(h, 'realtime')).toEqual(['pan'])
    h.engine.cancel()
    await new Promise((r) => setTimeout(r, 10))
    expect(last(h, 'realtime')).toEqual([null])
    await h.run('-PAN', '#0,0', '#10,5')
    expect(last(h, 'panBy')).toEqual([[10, 5, 0]])
  })

  it('ZOOM Dynamic: clic alterna mover/redimensionar y Enter hace zoom al recuadro', async () => {
    const h = makeEngine()
    await h.run('ZOOM', 'D')
    await h.click(80, 30) // mueve el recuadro: centro en (80, 30)
    await h.click(150, 30) // redimensiona: borde izquierdo fijo en −20 → ancho 170
    await h.run('')
    const [c, height] = last(h, 'zoomCenter') as [{ x: number; y: number }, number]
    expect(c.x).toBeCloseTo(65, 6)
    expect(c.y).toBeCloseTo(30, 6)
    expect(height).toBeCloseTo(85, 6)
  })

  it('LIMITS ON rechaza puntos fuera de los límites', async () => {
    const h = makeEngine()
    await h.run('LIMITS', '#0,0', '#100,100')
    await h.run('LIMITS', 'ON')
    await h.run('LINE', '#50,50', '#150,50')
    expect(h.prints).toContain('**Outside limits')
    await h.run('#80,50', '')
    expect(h.ofType('LINE').length).toBe(1)
    await h.run('LIMITS', 'OFF')
    expect(h.doc.vars.LIMCHECK).toBe(0)
  })

  it('VIEW: Save/?/Restore/Delete, nombre tecleado, Window sin cambiar la vista y vistas estándar', async () => {
    const h = makeEngine()
    await h.run('-VIEW', 'S', 'Detalle 1')
    expect(h.doc.getNamedView('detalle 1')?.view.radius).toBe(100)
    expect(h.doc.getNamedView('Detalle 1')?.ucs).toBeTruthy()
    await h.run('-VIEW', 'W', 'Ventana', '#0,0', '#10,10')
    expect(h.doc.getNamedView('Ventana')?.view.radius).toBe(10)
    expect(last(h, 'restoreViewState')).toBeUndefined()
    await h.run('VIEW', 'R', 'Ventana')
    expect((last(h, 'restoreViewState') as Array<{ radius: number }>)[0].radius).toBe(10)
    await h.run('VIEW', 'Detalle 1')
    expect((last(h, 'restoreViewState') as Array<{ radius: number }>)[0].radius).toBe(100)
    await h.run('VIEW', 'D', 'Ventana')
    expect(h.doc.namedViews().map((v) => v.name)).toEqual(['Detalle 1'])
    await h.run('VIEW', 'FRONT')
    await h.run('VIEW', 'O', 'L')
    expect(h.views.slice(-2)).toEqual(['FRONT', 'LEFT'])
  })
})
