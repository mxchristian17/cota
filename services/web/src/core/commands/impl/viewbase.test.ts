import { afterEach, describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import type { AppHooks } from '../types'
import type { ProjItem } from '../../projection/orthographic'
import { isDrawingView, projectedBasis, viewBasis } from '../../drawing/views'
import { MODEL_TAB } from '../../document/DocumentModel'
import { resetViewbaseMemory } from './viewbase'

afterEach(resetViewbaseMemory)

/** Proyección sintética: un rectángulo de 100 × 50 (cualquier vista), si el modelo tiene un sólido. */
function withModel(solids = true) {
  const rect: ProjItem[] = [
    { kind: 'line', a: [-50, -25], b: [50, -25], hidden: false },
    { kind: 'line', a: [50, -25], b: [50, 25], hidden: false },
    { kind: 'line', a: [50, 25], b: [-50, 25], hidden: false },
    { kind: 'line', a: [-50, 25], b: [-50, -25], hidden: false },
  ] as ProjItem[]
  const hooks: Partial<AppHooks> = {
    projectModel: () => (solids ? rect : []),
    viewAnchor: () => (solids ? [0, 0, 0] : null),
    ensureLayer: () => '0',
  }
  return makeEngine(hooks)
}

const views = (h: ReturnType<typeof makeEngine>) => h.doc.layouts.flatMap((l) => l.entities).filter(isDrawingView)

describe('VIEWBASE', () => {
  it('R17: un punto que no encuentra nada no cae en «Entire model»: vuelve a pedir objetos', async () => {
    const h = withModel()
    await h.run('VIEWBASE', '#500,500', '')
    expect(h.prints.join('\n')).toContain('0 found')
    expect(h.prints.join('\n')).toContain('Nothing selected')
    expect(h.doc.activeTab).toBe(MODEL_TAB)
    // Un Enter sin haber intentado elegir sí toma el modelo entero.
    await h.run('', 'Layout1', '#100,100', '')
    expect(views(h)).toHaveLength(1)
    expect(views(h)[0].props.view.source).toBeNull()
  })

  it('B20: sin sólidos avisa sin cambiar a un layout', async () => {
    const h = withModel(false)
    await h.run('VIEWBASE', '', 'Layout1')
    expect(h.prints).toContain('No 3D solids to document.')
    expect(h.doc.activeTab).toBe(MODEL_TAB)
    expect(h.doc.blocks.filter((b) => b.name.startsWith('*VIEW'))).toHaveLength(0)
  })

  it('R13: recuerda el estilo y la escala de la última vez', async () => {
    const h = withModel()
    await h.run('VIEWBASE', '', 'Layout1', 'H', 'V', 'S', '1:5', 'T', 'B', '#100,100')
    expect(views(h)[0].props.scale[0]).toBeCloseTo(0.2)
    await h.run('VIEWBASE', '#200,100')
    const v = views(h)
    expect(v).toHaveLength(2)
    expect(v[1].props.scale[0]).toBeCloseTo(0.2)
    expect(v[1].props.view.hidden).toBe('visible')
    expect(h.prints.join('\n')).toMatch(/Type = Base only {2}Hidden Lines = Visible lines {2}Scale = 1:5/)
  })

  it('R14/B14: una proyectada fuera del eje en una dirección ya usada sale isométrica, no una lateral duplicada', async () => {
    const h = withModel()
    await h.run('VIEWBASE', '', 'Layout1', '#100,200', '#100,100', '#220,200', '#330,110', '')
    const v = views(h)
    expect(v).toHaveLength(4)
    expect(v.map((e) => e.props.view.align ?? 'base')).toEqual(['base', 'v', 'h', 'free'])
    expect(h.prints.join('\n')).toContain('isometric view created')
    // Exactamente sobre el eje se respeta (con aviso).
    const front = viewBasis('FRONT')
    const right = projectedBasis(front, 120, 0, 'first')
    expect(projectedBasis(front, 230, 0, 'first', [right.basis.out]).duplicate).toBe(true)
    expect(projectedBasis(front, 215, 30, 'first', [right.basis.out]).align).toBe('free')
    expect(projectedBasis(front, 215, 30, 'first').align).toBe('h')
  })

  it('R20: las vistas guardan su punto 3D de inserción (anchor) y las proyectadas comparten el de la base', async () => {
    const h = withModel()
    await h.run('VIEWBASE', '', 'Layout1', '#100,200', '#220,200', '')
    const v = views(h)
    expect(v[0].props.view.anchor).toEqual([0, 0, 0])
    expect(v[1].props.view.anchor).toEqual([0, 0, 0])
  })
})
