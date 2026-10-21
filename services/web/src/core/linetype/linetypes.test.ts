import { describe, expect, it } from 'vitest'
import type { Entity, Layer } from '../document/types'
import { DocumentModel } from '../document/DocumentModel'
import { applyPattern, entityDashes, linetypePaths } from './dash'
import { BYLAYER_OF, effectiveLinetype, entityPattern, libraryLinetype, linetypeLibrary } from './linetypes'
import { commonOf } from '../document/common'
import { expandEntities } from '../editing/block'

const layer = (id: string, lineType: string): Layer => ({ id, name: id, color: '#fff', lineWeight: 0.25, lineType, locked: false, visible: true, printable: true })

describe('biblioteca de tipos de línea', () => {
  it('biblioteca métrica (×25,4) y en pulgadas', () => {
    expect(libraryLinetype('dashed')?.pattern).toEqual([12.7, -6.35])
    expect(libraryLinetype('CENTER')?.pattern).toEqual([31.75, -6.35, 6.35, -6.35])
    expect(libraryLinetype('HIDDEN', 'in')?.pattern).toEqual([0.25, -0.125])
    expect(libraryLinetype('ISO10W100')?.pattern).toEqual([12, -3, 0, -3])
    expect(linetypeLibrary().length).toBe(38)
  })
})

describe('trazos como el CAD clásico', () => {
  it('empieza y termina con un trazo; el sobrante se reparte entre los dos extremos', () => {
    const r = applyPattern([[0, 0, 0], [100, 0, 0]], [12.7, -6.35])
    expect(r.dashes.length).toBe(5)
    const first = r.dashes[0]
    const last = r.dashes[r.dashes.length - 1]
    expect(first[0][0]).toBeCloseTo(0, 9)
    expect(last[last.length - 1][0]).toBeCloseTo(100, 9)
    const l0 = first[first.length - 1][0] - first[0][0]
    const l1 = last[last.length - 1][0] - last[0][0]
    expect(l0).toBeCloseTo(l1, 9)
    expect(l0).toBeGreaterThan(12.7)
    // Los intermedios miden lo que dice el patrón.
    expect(r.dashes[1][1][0] - r.dashes[1][0][0]).toBeCloseTo(12.7, 9)
  })

  it('un tramo más corto que un patrón (más el trazo final) se dibuja continuo', () => {
    const r = applyPattern([[0, 0, 0], [20, 0, 0]], [12.7, -6.35])
    expect(r.dashes).toEqual([[[0, 0, 0], [20, 0, 0]]])
  })

  it('los puntos (elemento 0) salen aparte y los trazos siguen las esquinas del recorrido', () => {
    const r = applyPattern([[0, 0, 0], [40, 0, 0], [40, 60, 0]], [12.7, -6.35, 0, -6.35])
    expect(r.dots.length).toBeGreaterThan(0)
    expect(r.dashes.some((d) => d.length > 2)).toBe(true) // un trazo que dobla la esquina
  })

  it('PLINEGEN: sin él el patrón arranca en cada vértice; con él corre continuo', () => {
    const e: Entity = { id: 'p', type: 'POLYLINE', layer: '0', props: { vertices: [[0, 0, 0], [40, 0, 0], [40, 40, 0]], closed: false } }
    expect(linetypePaths(e)?.length).toBe(2)
    expect(linetypePaths(e, true)?.length).toBe(1)
    expect(linetypePaths({ ...e, props: { ...e.props, ltGen: true } } as Entity)?.length).toBe(1)
    expect(entityDashes(e, null)).toBeNull()
  })
})

describe('tipo de línea efectivo', () => {
  const layers = new Map([['A', layer('A', 'HIDDEN')], ['B', layer('B', 'CENTER')]])
  const of = (id: string) => layers.get(id)
  it('ByLayer, ByBlock, propio y el ByBlock de una inserción ByLayer', () => {
    expect(effectiveLinetype({ layer: 'A' }, of)).toBe('HIDDEN')
    expect(effectiveLinetype({ layer: 'A', lineType: 'BYBLOCK' }, of)).toBe('CONTINUOUS')
    expect(effectiveLinetype({ layer: 'A', lineType: 'dashed' }, of)).toBe('DASHED')
    expect(effectiveLinetype({ layer: 'A', lineType: BYLAYER_OF + 'B' }, of)).toBe('CENTER')
  })
  it('el patrón se escala por el contexto y por la escala del objeto', () => {
    const ctx = { patterns: new Map([['HIDDEN', [6.35, -3.175]]]), factor: 2, plinegen: false }
    expect(entityPattern({ layer: 'A', ltScale: 0.5 }, of, ctx)).toEqual([6.35, -3.175])
    expect(entityPattern({ layer: 'A', lineType: 'CONTINUOUS' }, of, ctx)).toBeNull()
  })
})

describe('tabla del dibujo y variables', () => {
  it('un .cota previo carga los tipos de sus capas; DOTTED pasa a DOT', () => {
    const d = DocumentModel.createDefault().toJSON()
    d.layers.push(layer('L1', 'DASHED'), layer('L2', 'DOTTED'))
    const doc = DocumentModel.fromJSON(d)
    expect(doc.linetypes.map((x) => x.name).sort()).toEqual(['CONTINUOUS', 'DASHED', 'DOT'])
    expect(doc.layers.find((l) => l.id === 'L2')?.lineType).toBe('DOT')
  })

  it('loadLinetype sólo carga lo que está en la biblioteca (o una definición dada)', () => {
    const doc = DocumentModel.createDefault()
    expect(doc.loadLinetype('NOPE')).toBeUndefined()
    expect(doc.loadLinetype('phantom')?.name).toBe('PHANTOM')
    expect(doc.loadLinetype('MINE', { name: 'MINE', description: 'x', pattern: [5, -2] })?.pattern).toEqual([5, -2])
  })

  it('los objetos nuevos toman CELTYPE/CELTSCALE; las copias conservan los suyos', () => {
    const doc = DocumentModel.createDefault()
    doc.setVar('CELTYPE', 'HIDDEN')
    doc.setVar('CELTSCALE', 2)
    const a = doc.addEntity({ type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [1, 0, 0] } })
    expect(a.lineType).toBe('HIDDEN')
    expect(a.ltScale).toBe(2)
    expect(doc.linetype('HIDDEN')).toBeTruthy()
    const b = doc.addEntity({ type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [1, 0, 0] }, ...commonOf({}) })
    expect(b.lineType).toBeUndefined()
    expect(b.ltScale).toBeUndefined()
  })

  it('no se borra un tipo en uso', () => {
    const doc = DocumentModel.createDefault()
    doc.loadLinetype('CENTER')
    doc.layers[0].lineType = 'CENTER'
    expect(doc.deleteLinetype('CENTER')).toBe(false)
    doc.layers[0].lineType = 'CONTINUOUS'
    expect(doc.deleteLinetype('CENTER')).toBe(true)
  })

  it('escala del espacio: MSLTSCALE en el modelo y PSLTSCALE en los viewports', () => {
    const doc = DocumentModel.createDefault()
    doc.setVar('LTSCALE', 2)
    doc.setCannoscale(0.02) // 1:50
    expect(doc.linetypeContext('model').factor).toBeCloseTo(100, 9)
    doc.setVar('MSLTSCALE', 0)
    expect(doc.linetypeContext('model').factor).toBeCloseTo(2, 9)
    expect(doc.linetypeContext('paper').factor).toBeCloseTo(2, 9)
    expect(doc.linetypeContext({ paperPerModel: 0.02 }).factor).toBeCloseTo(100, 9)
    doc.setVar('PSLTSCALE', 0)
    expect(doc.linetypeContext({ paperPerModel: 0.02 }).factor).toBeCloseTo(2, 9)
  })

  it('ByBlock dentro de un bloque toma el tipo de la inserción', () => {
    const blocks = [{ name: 'B', entities: [{ id: 'c', type: 'LINE', layer: '0', lineType: 'BYBLOCK', props: { start: [0, 0, 0], end: [1, 0, 0] } } as Entity] }]
    const ins: Entity = { id: 'i', type: 'INSERT', layer: 'A', lineType: 'CENTER', props: { name: 'B', position: [0, 0, 0], scale: [1, 1, 1], rotation: 0 } }
    expect(expandEntities([ins], blocks)[0].lineType).toBe('CENTER')
    const byLayer: Entity = { ...ins, lineType: undefined }
    expect(expandEntities([byLayer], blocks)[0].lineType).toBe(BYLAYER_OF + 'A')
  })
})

describe('nombres ISO con prefijo de otros programas', () => {
  it('`<PREFIJO>_ISO02W100` se reconoce como ISO02W100', () => {
    expect(libraryLinetype('XYZ_ISO02W100')?.name).toBe('ISO02W100')
  })
})
