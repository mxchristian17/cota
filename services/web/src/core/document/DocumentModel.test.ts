import { describe, it, expect } from 'vitest'
import { DocumentModel, MODEL_TAB, SCHEMA_VERSION } from './DocumentModel'
import type { DocumentData } from './types'
import { newViewportProps } from '../layout/viewport'

describe('DocumentModel', () => {
  it('crea un documento por defecto con el layer "0"', () => {
    const doc = DocumentModel.createDefault()
    expect(doc.layers).toHaveLength(1)
    expect(doc.layers[0].id).toBe('0')
    expect(doc.entities).toHaveLength(0)
  })

  it('agrega entidades con id incremental', () => {
    const doc = DocumentModel.createDefault()
    const a = doc.addEntity({ type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [1, 0, 0] } })
    const b = doc.addEntity({ type: 'CIRCLE', layer: '0', props: { center: [0, 0, 0], radius: 5, normal: [0, 0, 1] } })
    expect(a.id).toBe('e1')
    expect(b.id).toBe('e2')
    expect(doc.entities).toHaveLength(2)
  })

  it('elimina entidades por id', () => {
    const doc = DocumentModel.createDefault()
    const a = doc.addEntity({ type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [1, 0, 0] } })
    doc.removeEntity(a.id)
    expect(doc.entities).toHaveLength(0)
  })

  it('serializa y deserializa sin perder datos (round-trip)', () => {
    const doc = DocumentModel.createDefault('mydwg')
    doc.addEntity({ type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [10, 20, 0] } })
    const json = doc.toJSON()
    expect(json.schemaVersion).toBe(SCHEMA_VERSION)

    const restored = DocumentModel.fromJSON(json)
    expect(restored.name).toBe('mydwg')
    expect(restored.entities).toHaveLength(1)
    // el contador continúa desde el máximo existente
    const next = restored.addEntity({ type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [1, 1, 0] } })
    expect(next.id).toBe('e2')
  })

  it('toJSON devuelve una copia independiente', () => {
    const doc = DocumentModel.createDefault()
    const json = doc.toJSON()
    json.entities.push({ id: 'x', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [1, 0, 0] } })
    expect(doc.entities).toHaveLength(0)
  })

  it('viewportLayout: default 1 y se persiste en toJSON/fromJSON', () => {
    const doc = DocumentModel.createDefault()
    expect(doc.viewportLayout).toBe(1)
    doc.setViewportLayout(4)
    const restored = DocumentModel.fromJSON(doc.toJSON())
    expect(restored.viewportLayout).toBe(4)
  })
})

describe('DocumentModel — layouts y espacios', () => {
  const line = { type: 'LINE' as const, layer: '0', props: { start: [0, 0, 0] as [number, number, number], end: [1, 0, 0] as [number, number, number] } }

  it('documento nuevo: Model activo + Layout1 en A3 apaisado', () => {
    const doc = DocumentModel.createDefault()
    expect(doc.activeTab).toBe(MODEL_TAB)
    expect(doc.layouts.map((l) => l.name)).toEqual(['Layout1'])
    expect(doc.layouts[0].pageSetup).toMatchObject({ paper: 'A3', orientation: 'landscape' })
    expect(doc.inPaperSpace).toBe(false)
  })

  it('un .cota previo (sin layouts) abre con Layout1', () => {
    const old = DocumentModel.createDefault().toJSON()
    delete old.layouts
    const doc = DocumentModel.fromJSON(old as DocumentData)
    expect(doc.layouts).toHaveLength(1)
    expect(doc.layouts[0].name).toBe('Layout1')
  })

  it('entities enruta al papel del layout activo; ids únicos en todo el documento', () => {
    const doc = DocumentModel.createDefault()
    const m = doc.addEntity(line)
    doc.setActiveTab(doc.layouts[0].id)
    expect(doc.inPaperSpace).toBe(true)
    expect(doc.entities).toHaveLength(0)
    const p = doc.addEntity(line)
    expect(p.id).not.toBe(m.id)
    expect(doc.layoutEntities(doc.layouts[0].id).map((e) => e.id)).toEqual([p.id])
    expect(doc.modelEntities.map((e) => e.id)).toEqual([m.id])
    // getEntity/removeEntity encuentran entidades de cualquier espacio
    expect(doc.getEntity(m.id)?.id).toBe(m.id)
    doc.removeEntity(m.id)
    expect(doc.modelEntities).toHaveLength(0)
    // el contador sigue siendo global tras recargar
    const re = DocumentModel.fromJSON(doc.toJSON())
    expect(re.addEntity(line).id).toBe('e3')
  })

  it('MSPACE: a través de un viewport los comandos operan sobre el modelo', () => {
    const doc = DocumentModel.createDefault()
    doc.setActiveTab('L1')
    const vp = doc.addEntity({ type: 'VIEWPORT', layer: '0', props: newViewportProps([100, 100, 0], 100, 80) })
    doc.setMsViewport('noexiste')
    expect(doc.msViewportId).toBeNull()
    doc.setMsViewport(vp.id)
    expect(doc.inPaperSpace).toBe(false)
    doc.addEntity(line)
    expect(doc.modelEntities).toHaveLength(1)
    // undo (load de un snapshot de la misma pestaña) conserva el MSPACE
    doc.load(doc.toJSON())
    expect(doc.msViewportId).toBe(vp.id)
    // cambiar de pestaña vuelve a PSPACE
    doc.setActiveTab(MODEL_TAB)
    doc.setActiveTab('L1')
    expect(doc.msViewportId).toBeNull()
    // borrar el viewport activo vuelve al papel
    doc.setMsViewport(vp.id)
    doc.removeEntity(vp.id)
    expect(doc.inPaperSpace).toBe(true)
  })

  it('la pestaña activa se persiste y el undo la restaura', () => {
    const doc = DocumentModel.createDefault()
    const snap = doc.toJSON() // en Model
    doc.setActiveTab('L1')
    expect(DocumentModel.fromJSON(doc.toJSON()).activeTab).toBe('L1')
    doc.load(snap)
    expect(doc.activeTab).toBe(MODEL_TAB)
  })

  it('CRUD de layouts: nuevo, renombrar, copiar, mover y borrar', () => {
    const doc = DocumentModel.createDefault()
    const l2 = doc.addLayout()
    expect(l2.name).toBe('Layout2')
    expect(() => doc.addLayout('layout2')).toThrow(/already exists/)
    expect(() => doc.renameLayout(l2.id, 'Model')).toThrow(/reserved/)
    doc.renameLayout(l2.id, 'Planta')
    doc.setActiveTab(l2.id)
    doc.addEntity(line)
    const copy = doc.copyLayout(l2.id)
    expect(copy.name).toBe('Planta (2)')
    expect(doc.layouts.map((l) => l.name)).toEqual(['Layout1', 'Planta', 'Planta (2)'])
    expect(copy.entities[0].id).not.toBe(doc.getLayout(l2.id)!.entities[0].id)
    doc.moveLayout(copy.id, -5)
    expect(doc.layouts[0].id).toBe(copy.id)
    doc.removeLayout(l2.id)
    expect(doc.activeTab).toBe(MODEL_TAB) // borrar el activo pasa a Model
    doc.removeLayout(copy.id)
    expect(() => doc.removeLayout(doc.layouts[0].id)).toThrow(/at least one layout/)
  })

  it('meta admite título, asunto, palabras clave y propiedades personalizadas', () => {
    const doc = DocumentModel.createDefault()
    doc.setMeta({ title: 'Planta baja', custom: { Proyecto: 'cota' } })
    const re = DocumentModel.fromJSON(doc.toJSON())
    expect(re.meta.title).toBe('Planta baja')
    expect(re.meta.custom?.Proyecto).toBe('cota')
  })

  it('guarda la capa actual (CLAYER) y vuelve a la primera si la capa ya no existe', () => {
    const doc = DocumentModel.createDefault()
    const data = doc.toJSON()
    data.layers.push({ id: 'L2', name: 'Muros', color: '#ff0000', lineWeight: 0.5, lineType: 'CONTINUOUS', locked: true, visible: false, printable: false })
    doc.load(data)
    expect(doc.currentLayer).toBe('0') // .cota viejos: sin currentLayer
    doc.setCurrentLayer('L2')
    const re = DocumentModel.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())) as DocumentData)
    expect(re.currentLayer).toBe('L2')
    expect(re.layers.find((l) => l.id === 'L2')).toMatchObject({ locked: true, visible: false, printable: false, lineWeight: 0.5 })
    const gone = re.toJSON()
    gone.layers = gone.layers.filter((l) => l.id !== 'L2')
    re.load(gone)
    expect(re.currentLayer).toBe('0')
  })
})

