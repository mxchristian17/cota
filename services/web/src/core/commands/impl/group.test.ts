import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import { sysvars } from '../sysvars'
import { isolation, endIsolation } from '../../editing/isolation'
import { selectableEntities } from '../selectionSets'
import { qselectMatch } from '../../editing/qselect'
import { purgeable } from './purge'
import { LayerService } from '../../layers/LayerService'

describe('GROUP, PURGE, QSELECT e ISOLATEOBJECTS', () => {
  it('GROUP: elegir un miembro toma el grupo entero; PICKSTYLE 0 lo desactiva; UNGROUP lo deshace', async () => {
    const h = makeEngine()
    const a = h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    const b = h.add('LINE', { start: [0, 5, 0], end: [10, 5, 0] })
    const c = h.add('LINE', { start: [0, 9, 0], end: [10, 9, 0] })
    await h.run('GROUP', 'N', 'Marco')
    await h.click(5, 0, a.id)
    await h.click(5, 5, b.id)
    await h.run('')
    expect(h.doc.groups).toEqual([{ name: 'Marco', ids: [a.id, b.id], selectable: true }])
    await h.run('ERASE')
    await h.click(5, 0, a.id)
    await h.run('')
    expect(h.doc.entities.map((e) => e.id)).toEqual([c.id]) // se borró el grupo entero
  })

  it('PICKSTYLE 0 elige miembros sueltos; UNGROUP y -GROUP Explode quitan el grupo', async () => {
    const h = makeEngine()
    const a = h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    const b = h.add('LINE', { start: [0, 5, 0], end: [10, 5, 0] })
    await h.run('GROUP', 'ALL', '')
    expect(h.doc.groups[0].name).toBe('*A1')
    sysvars.PICKSTYLE = 0
    await h.run('ERASE')
    await h.click(5, 0, a.id)
    await h.run('')
    expect(h.doc.entities.map((e) => e.id)).toEqual([b.id])
    sysvars.PICKSTYLE = 1
    await h.run('UNGROUP')
    await h.click(5, 5, b.id)
    expect(h.doc.groups).toEqual([])
  })

  it('PURGE borra capas, bloques (también anidados) y tipos de línea sin uso', async () => {
    const h = makeEngine()
    const svc = new LayerService(h.doc)
    svc.create('Vacia')
    const usada = svc.create('Usada')
    h.add('LINE', { start: [0, 0, 0], end: [1, 0, 0] }, usada.id)
    h.doc.setBlock({ name: 'Hijo', entities: [{ id: 'x', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [1, 0, 0] } }] })
    h.doc.setBlock({ name: 'Padre', entities: [{ id: 'y', type: 'INSERT', layer: '0', props: { name: 'Hijo', position: [0, 0, 0], scale: [1, 1, 1], rotation: 0 } }] })
    expect(purgeable(h.doc, '0').blocks).toEqual(['Padre'])
    await h.run('PURGE', 'A', '*', 'N')
    expect(h.doc.blocks).toEqual([])
    expect(h.doc.layers.map((l) => l.name)).toEqual(['0', 'Usada'])
    expect(h.prints).toContain('2 blocks deleted.')
  })

  it('QSELECT filtra por tipo y propiedad; ISOLATEOBJECTS oculta el resto y no se puede seleccionar', async () => {
    const h = makeEngine()
    const r5 = h.add('CIRCLE', { center: [0, 0, 0], radius: 5, normal: [0, 0, 1] })
    h.add('CIRCLE', { center: [20, 0, 0], radius: 8, normal: [0, 0, 1] })
    h.add('LINE', { start: [0, 0, 0], end: [3, 0, 0] })
    const all = h.doc.entities
    expect(qselectMatch(h.doc, all, { type: 'CIRCLE', prop: 'radius', op: '<', value: '6' }).map((e) => e.id)).toEqual([r5.id])
    expect(qselectMatch(h.doc, all, { type: null, prop: 'layer', op: '=', value: '0' })).toHaveLength(3)
    expect(qselectMatch(h.doc, all, { type: 'LINE', prop: 'length', op: '=', value: '3' })).toHaveLength(1)
    h.setSelection([r5.id])
    await h.run('ISOLATEOBJECTS')
    expect(isolation.hidden.size).toBe(2)
    expect(selectableEntities(h.doc).map((e) => e.id)).toEqual([r5.id])
    await h.run('UNISOLATEOBJECTS')
    expect(selectableEntities(h.doc)).toHaveLength(3)
    endIsolation()
  })
})
