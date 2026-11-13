import { describe, expect, it } from 'vitest'
import { DocumentModel } from './DocumentModel'
import { cloneDocument, cloneEntity, plainClone } from './cloneShared'
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

  it('las imágenes: la copia tiene sus píxeles y el original también', () => {
    const data = 'data:image/png;base64,' + 'A'.repeat(1000)
    const img: Entity = { id: 'i', type: 'IMAGE', layer: '0', props: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], size: [2, 2], file: 'a.png', data } }
    const d = { entities: [img, line('b')] } as unknown as DocumentData
    const copy = cloneDocument(d)
    expect((copy.entities[0].props as { data: string }).data).toBe(data)
    expect((d.entities[0].props as { data: string }).data).toBe(data)
    expect(copy.entities[0].props).not.toBe(img.props)
    expect((cloneEntity(img).props as { data: string }).data).toBe(data)
  })
})

describe('plainClone (la copia para deshacer)', () => {
  it('igual a structuredClone con datos simples, sin compartir nada con el original', () => {
    const d = { a: [1, -0, NaN, Infinity, null, undefined, 'x', true, [2, [3]]], b: { c: { d: [[1, 2], [3]] }, e: undefined }, f: 12n }
    const c = plainClone(d)
    expect(c).toEqual(structuredClone(d))
    expect(Object.is(c.a[1], -0)).toBe(true)
    expect('e' in c.b).toBe(true)
    expect(c.b.c).not.toBe(d.b.c)
    expect(c.a[8]).not.toBe(d.a[8])
  })

  it('con otra cosa (Map, Date, arreglos tipados, referencias circulares) copia structuredClone', () => {
    const odd = { m: new Map([[1, 2]]), t: new Date(5), f: new Float32Array([1, 2]) }
    const c = plainClone(odd)
    expect(c.m).toBeInstanceOf(Map)
    expect(c.t).toBeInstanceOf(Date)
    expect(c.f).toBeInstanceOf(Float32Array)
    const cyc: Record<string, unknown> = { x: 1 }
    cyc.self = cyc
    const cc = plainClone(cyc)
    expect(cc.self).toBe(cc)
    expect(() => plainClone({ fn: () => 1 })).toThrow() // como structuredClone
  })

  it('el dibujo: una copia independiente, con las mallas compartidas', () => {
    const data = { entities: [mesh('a'), line('b')], blocks: [{ name: 'B', base: [0, 0, 0], entities: [mesh('d'), line('e')] }] } as unknown as DocumentData
    const copy = cloneDocument(data)
    expect(copy).toEqual(structuredClone(data))
    expect((copy.entities[0] as MeshEntity).props.vertices).toBe((data.entities[0] as MeshEntity).props.vertices)
    expect(copy.blocks![0].entities[1]).not.toBe(data.blocks![0].entities[1])
  })
})
