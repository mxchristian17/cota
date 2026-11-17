import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import type { DimensionProps, Entity, EntityInput } from '../../document/types'
import { projectedBasis, viewBasis, type DrawingViewData } from '../../drawing/views'

/** Bloque de vista: un rectángulo de 100 × 50 con un agujero (unidades del modelo, centrado en el origen). */
function viewBlock(name: string): { name: string; entities: Entity[] } {
  const c: Array<[number, number]> = [[-50, -25], [50, -25], [50, 25], [-50, 25]]
  const lines = c.map((p, i) => ({ id: `${name}-l${i}`, type: 'LINE', layer: '0', props: { start: [p[0], p[1], 0], end: [c[(i + 1) % 4][0], c[(i + 1) % 4][1], 0] } }))
  const hole = { id: `${name}-c`, type: 'CIRCLE', layer: '0', props: { center: [-20, 0, 0], radius: 5, normal: [0, 0, 1] } }
  return { name, entities: [...lines, hole] as Entity[] }
}

/** Layout con vistas de dibujo a escala 1:2 en las posiciones dadas. */
function layoutWithViews(views: Array<{ at: [number, number]; view: DrawingViewData }>) {
  const h = makeEngine()
  h.doc.setActiveTab(h.doc.layouts[0].id)
  const ids: string[] = []
  views.forEach((v, i) => {
    const name = `*VIEW${i + 1}`
    h.doc.setBlock(viewBlock(name))
    const e = h.doc.addEntity({ type: 'INSERT', layer: '0', props: { name, position: [v.at[0], v.at[1], 0], scale: [0.5, 0.5, 0.5], rotation: 0, view: v.view } } as EntityInput)
    ids.push(e.id)
  })
  return { h, ids }
}

const dims = (h: ReturnType<typeof makeEngine>) => h.doc.entities.filter((e): e is Entity & { props: DimensionProps } => e.type === 'DIMENSION')

describe('AUTODIM en vistas de dibujo', () => {
  it('acota sólo las vistas ortogonales: la isométrica base, la proyectada en diagonal y las que salen de ella se saltean', async () => {
    const front = viewBasis('FRONT')
    const iso = viewBasis('SWISO')
    const diag = projectedBasis(front, 100, 100, 'first')
    const fromIso = projectedBasis(iso, 120, 0, 'first')
    expect(diag.align).toBe('free')
    const { h, ids } = layoutWithViews([
      { at: [100, 100], view: { orientation: 'FRONT', basis: front, hidden: 'visible', source: null } },
      // VIEWBASE T B O SW: vista base isométrica (sin madre ni alineación).
      { at: [300, 100], view: { orientation: 'SWISO', basis: iso, hidden: 'visible', source: null } },
      { at: [200, 200], view: { orientation: 'projected', basis: diag.basis, hidden: 'shadedVisible', source: null, parent: 'x', align: 'free' } },
      { at: [420, 100], view: { orientation: 'projected', basis: fromIso.basis, hidden: 'visible', source: null, align: fromIso.align } },
    ])
    ;(h.doc.entities.find((e) => e.id === ids[2])!.props as { view: DrawingViewData }).view.parent = ids[0]
    ;(h.doc.entities.find((e) => e.id === ids[3])!.props as { view: DrawingViewData }).view.parent = ids[1]
    await h.run('AUTODIM', '', '', '')
    const made = dims(h)
    expect(made.length).toBeGreaterThan(0)
    // Todas sobre la vista frontal (x de 75 a 125 en el papel, con sus líneas de cota alrededor).
    for (const d of made) expect(d.props.points[0][0]).toBeLessThan(150)
    expect(h.prints.join('\n')).toMatch(/in 1 view\(s\); 3 isometric view\(s\) skipped/)
  })

  it('con sólo una isométrica elegida no acota nada y lo informa', async () => {
    const { h, ids } = layoutWithViews([
      { at: [100, 100], view: { orientation: 'FRONT', basis: viewBasis('FRONT'), hidden: 'visible', source: null } },
      { at: [300, 100], view: { orientation: 'NEISO', basis: viewBasis('NEISO'), hidden: 'visible', source: null } },
    ])
    await h.run('AUTODIM')
    await h.click(300, 100, ids[1])
    await h.run('')
    expect(dims(h)).toHaveLength(0)
    expect(h.prints.join('\n')).toContain('1 isometric view(s) skipped')
  })

  it('una vista "Current" tomada en planta (sin madre) sí se acota', async () => {
    const { h } = layoutWithViews([{ at: [100, 100], view: { orientation: 'projected', basis: viewBasis('TOP'), hidden: 'visible', source: null } }])
    await h.run('AUTODIM', '', '', '')
    expect(dims(h).length).toBeGreaterThan(0)
    // Mide la pieza (DIMLFAC = 1/escala), no el papel.
    expect(dims(h).every((d) => d.props.style.DIMLFAC === 2)).toBe(true)
  })
})
