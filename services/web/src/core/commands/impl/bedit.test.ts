import { describe, it, expect } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import { expandEntities } from '../../editing/block'
import type { CircleEntity, InsertEntity } from '../../document/types'

/** Bloque B (un círculo de radio 5 en el origen) insertado dos veces. */
async function withInserts() {
  const h = makeEngine()
  h.add('CIRCLE', { center: [0, 0, 0], radius: 5, normal: [0, 0, 1] })
  h.setSelection(h.doc.entities.map((e) => e.id))
  await h.run('BLOCK', 'B', '#0,0')
  h.add('INSERT', { name: 'B', position: [100, 0, 0], scale: [1, 1, 1], rotation: 0 })
  return h
}
const circles = (h: ReturnType<typeof makeEngine>) =>
  expandEntities(h.doc.modelEntities, h.doc.blocks).filter((e): e is CircleEntity => e.type === 'CIRCLE')

describe('BEDIT / BSAVE / BCLOSE', () => {
  it('a preselected insert opens its definition as the editing space; saving updates every reference', async () => {
    const h = await withInserts()
    const ins = h.ofType('INSERT')[0] as InsertEntity
    h.setSelection([ins.id])
    await h.run('BEDIT')
    expect(h.doc.editingBlock).toBe('B')
    expect(h.doc.entities.map((e) => e.type)).toEqual(['CIRCLE']) // sólo la definición, en sus coordenadas
    await h.run('CIRCLE', '#10,0', '2')
    expect(h.doc.getBlock('B')!.entities).toHaveLength(2)
    await h.run('BCLOSE', 'Save')
    expect(h.doc.editingBlock).toBeNull()
    expect(h.doc.entities.filter((e) => e.type === 'INSERT')).toHaveLength(2) // vuelve al modelo
    expect(circles(h)).toHaveLength(4) // las dos inserciones ya tienen el círculo nuevo
    expect(h.prints.some((p) => p.includes('saved'))).toBe(true)
  })

  it('BCLOSE Discard restores the definition; closing without changes asks nothing', async () => {
    const h = await withInserts()
    await h.run('BEDIT', 'B')
    const c = h.doc.entities[0] as CircleEntity
    h.doc.removeEntity(c.id)
    expect(h.doc.getBlock('B')!.entities).toHaveLength(0)
    await h.run('BCLOSE', 'Discard')
    expect(h.doc.getBlock('B')!.entities).toHaveLength(1)
    await h.run('BEDIT', 'B', 'BCLOSE')
    expect(h.doc.editingBlock).toBeNull()
  })

  it('BSAVE keeps the editor open and makes the saved state the one BCLOSE Discard returns to', async () => {
    const h = await withInserts()
    await h.run('BEDIT', 'B', 'CIRCLE', '#20,0', '1', 'BSAVE')
    expect(h.doc.editingBlock).toBe('B')
    await h.run('CIRCLE', '#30,0', '1', 'BCLOSE', 'Discard')
    expect(h.doc.getBlock('B')!.entities).toHaveLength(2)
  })

  it('a block cannot be inserted into itself, directly or through another block', async () => {
    const h = await withInserts()
    h.setSelection([(h.ofType('INSERT')[0] as InsertEntity).id])
    await h.run('BLOCK', 'OUTER', '#0,0') // OUTER contiene una inserción de B
    await h.run('BEDIT', 'B', 'INSERT', 'OUTER')
    expect(h.prints.some((p) => p.includes('cannot contain itself'))).toBe(true)
    expect(h.doc.getBlock('B')!.entities.every((e) => e.type !== 'INSERT')).toBe(true)
  })

  it('new objects in the editor get ids not used by any block definition', async () => {
    const h = await withInserts()
    const reloaded = h.doc.toJSON()
    h.doc.load(reloaded) // reseed: el mayor id puede estar sólo dentro de un bloque
    await h.run('BEDIT', 'B', 'LINE', '#0,0', '#1,1', '')
    const ids = h.doc.getBlock('B')!.entities.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('undo inside the editor keeps it open; layouts cannot be activated while it is open', async () => {
    const h = await withInserts()
    await h.run('BEDIT', 'B')
    const before = h.doc.toJSON()
    await h.run('CIRCLE', '#10,0', '2')
    h.doc.load(before, true)
    expect(h.doc.editingBlock).toBe('B')
    expect(h.doc.entities).toHaveLength(1)
    h.doc.setActiveTab(h.doc.layouts[0].id)
    expect(h.doc.inPaperSpace).toBe(false)
    h.doc.load(before) // abrir otro dibujo cierra el editor
    expect(h.doc.editingBlock).toBeNull()
  })
})
