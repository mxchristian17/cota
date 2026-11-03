import { describe, expect, it } from 'vitest'
import { DocumentModel } from './DocumentModel'
import { cloneDocument, cloneEntity } from './cloneShared'
import type { DocumentData, Entity, MeshEntity } from './types'

const mesh = (id: string): MeshEntity => ({ id, type: 'MESH3D', layer: '0', props: { vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faces: [[0, 1, 2]] } })
const line = (id: string): Entity => ({ id, type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [1, 1, 0] } })

describe('copias del dibujo que comparten las mallas', () => {
  it('copia todo menos los vértices y caras de las mallas, que quedan compartidos', () => {
    const data = { entities: [mesh('a'), line('b')], layouts: [{ id: 'L1', name: 'Layout1', entities: [mesh('c')] }], blocks: [{ name: 'B', base: [0, 0, 0], entities: [mesh('d')] }] } as unknown as DocumentData
    const copy = cloneDocument(data)
    const all = (d: DocumentData) => [...d.entities, ...d.layouts![0].entities, ...d.blocks![0].entities].filter((e): e is MeshEntity => e.type === 'MESH3D')
    all(copy).forEach((m, i) => {
      expect(m.props).not.toBe(all(data)[i].props)
      expect(m.props.vertices).toBe(all(data)[i].props.vertices)
      expect(m.props.faces).toBe(all(data)[i].props.faces)
    })
    // El original quedó intacto y lo demás es una copia independiente.
    expect(all(data)[0].props.vertices).toHaveLength(3)
    ;(copy.entities[1].props as { end: number[] }).end[0] = 9
    expect((data.entities[1].props as { end: number[] }).end[0]).toBe(1)
  })

  it('una entidad sola: comparte la malla y copia el resto', () => {
    const m = mesh('a')
    const c = cloneEntity(m)
    expect(c).not.toBe(m)
    expect(c.props.vertices).toBe(m.props.vertices)
    expect(cloneEntity(line('b'))).toEqual(line('b'))
  })

  it('deshacer: la copia guardada no cambia al mover la malla (la edición reemplaza la lista)', () => {
    const doc = new DocumentModel({ entities: [], layers: [{ id: '0', name: '0', color: '#fff', lineWeight: 0.25, lineType: 'CONTINUOUS', locked: false, visible: true, printable: true }], currentLayer: '0' } as unknown as DocumentData)
    const e = doc.addEntity({ type: 'MESH3D', layer: '0', props: mesh('x').props })
    const snap = doc.toJSON()
    const live = doc.getEntity(e.id) as MeshEntity
    live.props.vertices = live.props.vertices.map((v) => [v[0] + 5, v[1], v[2]])
    expect((snap.entities.find((x) => x.id === e.id) as MeshEntity).props.vertices[0][0]).toBe(0)
    doc.load(snap)
    expect((doc.getEntity(e.id) as MeshEntity).props.vertices[0][0]).toBe(0)
  })
})
