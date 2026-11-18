import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentModel } from '../../document/DocumentModel'
import { LayerService } from '../../layers/LayerService'
import { expandEntities } from '../../editing/block'
import { missingBlocks } from '../../editing/clipData'
import { makeEngine } from '../../../test/engineHarness'
import { resetClipboard } from './clipboard'
import type { DocumentData, Entity, InsertProps } from '../../document/types'

/** Un "OPEN" de otro dibujo en la misma pestaña: el documento se reemplaza en el lugar, el portapapeles sigue. */
function openOther(doc: DocumentModel, build?: (other: DocumentModel) => void): void {
  const other = DocumentModel.createDefault('ensamble')
  build?.(other)
  doc.load(JSON.parse(JSON.stringify(other.toJSON())) as DocumentData)
}

/** Guardar y volver a abrir (el `.cota` es el JSON del documento). */
const saveAndOpen = (doc: DocumentModel): DocumentModel => DocumentModel.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())) as DocumentData)

const inserts = (doc: DocumentModel): Array<Entity & { type: 'INSERT' }> => doc.entities.filter((e): e is Entity & { type: 'INSERT' } => e.type === 'INSERT')

beforeEach(() => resetClipboard())

describe('PASTECLIP en otro dibujo lleva las definiciones de bloque (B27)', () => {
  it('el flujo del ensamble: BLOCK, COPYBASE, OPEN, PASTECLIP, INSERT varias veces, SAVE y OPEN', async () => {
    const h = makeEngine()
    // "El STEP abierto": dos cuerpos como mallas.
    h.add('MESH3D', { vertices: [[0, 0, 0], [42, 0, 0], [0, 42, 0], [0, 0, 40]], faces: [[0, 1, 2], [0, 1, 3]] })
    h.add('LINE', { start: [0, 0, 0], end: [0, 0, 60] })
    await h.run('BLOCK', 'ALL', '', 'NEMA17', '0,0,0')
    await h.run('COPYBASE', 'ALL', '', '0,0,0')
    expect(h.prints).toContain('1 object(s) copied to the clipboard.')
    openOther(h.doc)
    expect(h.doc.getBlock('NEMA17')).toBeUndefined()
    await h.run('PASTECLIP', '1000,1000,0')
    expect(h.prints).toContain('1 block definition(s) added: NEMA17.')
    expect(h.doc.getBlock('NEMA17')?.entities).toHaveLength(2)
    await h.run('INSERT', 'NEMA17', '1100,1000,0', '1', '', '0')
    await h.run('INSERT', 'nema17', '1200,1000,0', '1', '', '90') // sin distinguir mayúsculas
    const refs = inserts(h.doc)
    expect(refs.map((e) => e.props.position)).toEqual([
      [1000, 1000, 0],
      [1100, 1000, 0],
      [1200, 1000, 0],
    ])
    expect(refs.every((e) => e.props.name === 'NEMA17')).toBe(true)
    // Cada inserción dibuja su contenido.
    expect(expandEntities(refs, h.doc.blocks)).toHaveLength(6)
    const reopened = saveAndOpen(h.doc)
    expect(reopened.blocks.map((b) => b.name)).toEqual(['NEMA17'])
    expect(expandEntities(reopened.entities, reopened.blocks).filter((e) => e.type === 'MESH3D')).toHaveLength(3)
    expect(missingBlocks(reopened).size).toBe(0)
  })

  it('lleva los bloques anidados y las capas por nombre (no por id)', async () => {
    const h = makeEngine()
    const shafts = new LayerService(h.doc).create('Shafts', { color: '#ff0000' })
    h.add('CIRCLE', { center: [0, 0, 0], radius: 4, normal: [0, 0, 1] }, shafts.id)
    await h.run('BLOCK', 'ALL', '', 'NUT', '0,0,0')
    h.add('LINE', { start: [0, 0, 0], end: [50, 0, 0] })
    await h.run('BLOCK', 'ALL', '', 'AXLE', '0,0,0')
    await h.run('COPYCLIP', 'ALL', '')
    // El destino tiene otra capa con el mismo id ("L1") y otro nombre.
    openOther(h.doc, (o) => new LayerService(o).create('Bearings', { color: '#00ff00' }))
    expect(h.doc.layers.find((l) => l.id === shafts.id)?.name).toBe('Bearings')
    await h.run('PASTECLIP', '0,0,0')
    expect(h.doc.blocks.map((b) => b.name)).toEqual(['NUT', 'AXLE'])
    const made = h.doc.layers.find((l) => l.name === 'Shafts')
    expect(made?.color).toBe('#ff0000')
    expect(made?.id).not.toBe(shafts.id)
    expect(h.doc.getBlock('NUT')?.entities[0].layer).toBe(made?.id)
    expect(h.prints).toContain('1 layer(s) added: Shafts.')
    // Los ids de las definiciones pegadas no chocan con los del dibujo.
    const ids = [...h.doc.entities, ...h.doc.blocks.flatMap((b) => b.entities)].map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('si el dibujo ya tiene un bloque con ese nombre, queda el suyo (y se avisa si era distinto)', async () => {
    const h = makeEngine()
    h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    await h.run('BLOCK', 'ALL', '', 'NEMA17', '0,0,0')
    await h.run('COPYCLIP', 'ALL', '')
    openOther(h.doc, (o) => o.setBlock({ name: 'NEMA17', entities: [{ id: 'e90', type: 'CIRCLE', layer: '0', props: { center: [0, 0, 0], radius: 21, normal: [0, 0, 1] } } as Entity] }))
    await h.run('PASTECLIP', '0,0,0')
    expect(h.doc.getBlock('NEMA17')?.entities.map((e) => e.type)).toEqual(['CIRCLE'])
    expect(h.prints).toContain(`Block "NEMA17" already exists in this drawing with another definition: the drawing's one is kept.`)
    expect(inserts(h.doc)).toHaveLength(1)
    // Pegar en el mismo dibujo no avisa nada ni duplica la definición.
    h.prints.length = 0
    await h.run('COPYCLIP', 'ALL', '')
    await h.run('PASTECLIP', '50,0,0')
    expect(h.prints.some((l) => /already exists|block definition/.test(l))).toBe(false)
    expect(h.doc.blocks).toHaveLength(1)
  })

  it('un bloque anónimo distinto con el mismo nombre se pega con el próximo nombre libre', async () => {
    const h = makeEngine()
    h.doc.setBlock({ name: '*U1', entities: [{ id: 'e50', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [5, 5, 0] } } as Entity] })
    h.add('INSERT', { name: '*U1', position: [0, 0, 0], scale: [1, 1, 1], rotation: 0 })
    await h.run('COPYCLIP', 'ALL', '')
    openOther(h.doc, (o) => o.setBlock({ name: '*U1', entities: [{ id: 'e7', type: 'POINT', layer: '0', props: { position: [1, 1, 0] } } as Entity] }))
    await h.run('PASTEORIG')
    expect(h.doc.getBlock('*U1')?.entities[0].type).toBe('POINT')
    expect(h.doc.getBlock('*U2')?.entities[0].type).toBe('LINE')
    expect((inserts(h.doc)[0].props as InsertProps).name).toBe('*U2')
  })

  it('una inserción cuyo bloque no está en ningún lado no se pega: se avisa', async () => {
    const h = makeEngine()
    h.add('INSERT', { name: 'GHOST', position: [0, 0, 0], scale: [1, 1, 1], rotation: 0 })
    h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    await h.run('COPYCLIP', 'ALL', '')
    openOther(h.doc)
    await h.run('PASTECLIP', '0,0,0')
    expect(h.doc.entities.map((e) => e.type)).toEqual(['LINE'])
    expect(h.prints).toContain('1 block reference(s) not pasted: block "GHOST" not defined.')
  })
})

describe('INSERT de un bloque inexistente (B27)', () => {
  it('sin bloques en el dibujo toma el nombre, avisa y no crea una inserción vacía', async () => {
    const h = makeEngine()
    await h.run('INSERT', 'NEMA17', '100,0,0', '1', '', '0')
    expect(h.prints).toContain('Block "NEMA17" not found: the drawing has no blocks. Define one with BLOCK, or bring one with PASTECLIP or IMPORT.')
    expect(h.doc.entities.filter((e) => e.type === 'INSERT')).toHaveLength(0)
  })

  it('con otros bloques avisa que no lo encuentra', async () => {
    const h = makeEngine()
    h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    await h.run('BLOCK', 'ALL', '', 'LM8UU', '0,0,0')
    await h.run('INSERT', 'NEMA17')
    expect(h.prints).toContain('Block "NEMA17" not found.')
    expect(inserts(h.doc)).toHaveLength(1)
  })

  it('missingBlocks: las inserciones que no dibujan nada (p. ej. un .cota guardado con 2.46.0)', () => {
    const doc = DocumentModel.createDefault()
    doc.addEntity({ type: 'INSERT', layer: '0', props: { name: 'NEMA17', position: [0, 0, 0], scale: [1, 1, 1], rotation: 0 } })
    doc.addEntity({ type: 'INSERT', layer: '0', props: { name: 'NEMA17', position: [9, 0, 0], scale: [1, 1, 1], rotation: 0 } })
    doc.addEntity({ type: 'INSERT', layer: '0', props: { name: 'LM8UU', position: [0, 9, 0], scale: [1, 1, 1], rotation: 0 } })
    expect([...missingBlocks(doc)]).toEqual([
      ['NEMA17', 2],
      ['LM8UU', 1],
    ])
  })
})

describe('portapapeles entre pestañas del navegador (B05)', () => {
  afterEach(() => vi.resetModules())

  /** Una pestaña: los módulos de la app cargados de nuevo (su propio portapapeles), con el almacén compartido. */
  async function tab(store: unknown) {
    vi.resetModules()
    const { makeEngine: make } = await import('../../../test/engineHarness')
    const shared = await import('../../io/sharedClipboard')
    const clipboard = await import('./clipboard')
    shared.setClipStore(store as never)
    return { h: make(), clipboard }
  }
  const settle = () => new Promise((r) => setTimeout(r, 30))

  it('copiar en una pestaña y pegar en otra (también Ctrl+V: hasClipboard)', async () => {
    const { memoryClipStore } = await import('../../io/sharedClipboard')
    const store = memoryClipStore()
    const a = await tab(store)
    const b = await tab(store)
    // Pestaña B: abre el modelo y lo copia como bloque con punto base.
    b.h.add('MESH3D', { vertices: [[0, 0, 0], [22, 0, 0], [0, 15, 0]], faces: [[0, 1, 2]] })
    await b.h.run('BLOCK', 'ALL', '', 'LM8UU', '0,0,0')
    await b.h.run('COPYBASE', 'ALL', '', '0,0,0')
    expect(b.h.prints).toContain('1 object(s) copied to the clipboard.')
    await settle()
    // Pestaña A: el aviso llegó (Ctrl+V pega objetos) y PASTECLIP pega lo de B.
    expect(a.clipboard.hasClipboard()).toBe(true)
    await a.h.run('PASTECLIP', '50,50,0')
    await settle()
    expect(a.h.prints).not.toContain('The clipboard is empty.')
    expect(a.h.prints).toContain('1 object(s) pasted.')
    const ins = a.h.doc.entities.find((e) => e.type === 'INSERT')
    expect(ins?.props).toMatchObject({ name: 'LM8UU', position: [50, 50, 0] })
    expect(a.h.doc.getBlock('LM8UU')?.entities[0].type).toBe('MESH3D')
  })

  it('gana la copia más nueva, sea de esta pestaña o de otra', async () => {
    const { memoryClipStore } = await import('../../io/sharedClipboard')
    const store = memoryClipStore()
    const a = await tab(store)
    const b = await tab(store)
    a.h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    await a.h.run('COPYCLIP', 'ALL', '')
    await settle()
    await new Promise((r) => setTimeout(r, 5)) // otra hora de copia
    b.h.add('CIRCLE', { center: [0, 0, 0], radius: 3, normal: [0, 0, 1] })
    await b.h.run('COPYCLIP', 'ALL', '')
    await settle()
    await a.h.run('PASTEORIG')
    await settle()
    expect(a.h.doc.entities.map((e) => e.type)).toEqual(['LINE', 'CIRCLE'])
    // A copia de nuevo: ahora la suya es la más nueva (en A y en B).
    await new Promise((r) => setTimeout(r, 5))
    await a.h.run('COPYCLIP', 'ALL', '')
    await settle()
    await b.h.run('PASTEORIG')
    await settle()
    expect(b.h.doc.entities.map((e) => e.type)).toEqual(['CIRCLE', 'LINE', 'CIRCLE'])
  })
})

describe('INSERT pide la escala Y como el CAD clásico (R11)', () => {
  it('X, Y (Enter = X) y rotación; un 0 o un texto vuelve a pedir el factor', async () => {
    const h = makeEngine()
    h.doc.setBlock({ name: 'B', entities: [{ id: 'b1', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [1, 0, 0] } }] })
    await h.run('INSERT', 'B', '#0,0', '2', '3', '45')
    await h.run('INSERT', 'B', '#10,0', '2', '', '0')
    await h.run('INSERT', 'B', '#20,0', '0', 'x', '1.5', '', '')
    const ins = h.ofType('INSERT').map((e) => { const p = e.props as { scale: number[]; rotation: number }; return [p.scale, Math.round((p.rotation * 180) / Math.PI)] })
    expect(ins).toEqual([
      [[2, 3, 2], 45],
      [[2, 2, 2], 0],
      [[1.5, 1.5, 1.5], 0],
    ])
    expect(h.prints.filter((l) => l === 'Requires a nonzero number.')).toHaveLength(2)
  })
})

describe('pegar en un dibujo nuevo conserva la capa (B15)', () => {
  it('COPYBASE de una pieza en PERFIL, NEW y PASTECLIP: la copia queda en PERFIL (no en el id «L1»)', async () => {
    const h = makeEngine()
    const perfil = new LayerService(h.doc).create('PERFIL', { color: '#00ffff' })
    h.add('POLYLINE', { vertices: [[0, 0, 0], [20, 0, 0], [20, 10, 0]], closed: true }, perfil.id)
    await h.run('COPYBASE', 'ALL', '', '0,0,0')
    openOther(h.doc) // NEW: dibujo vacío, sin la capa
    expect(h.doc.layers.map((l) => l.name)).toEqual(['0'])
    await h.run('PASTECLIP', '0,0,0')
    const [pasted] = h.doc.entities
    const layer = h.doc.layers.find((l) => l.id === pasted.layer)
    expect(layer?.name).toBe('PERFIL')
    expect(layer?.color).toBe('#00ffff')
    h.prints.length = 0
    await h.run('LIST', 'ALL', '')
    expect(h.prints.find((l) => l.startsWith('POLYLINE'))).toContain('Layer: "PERFIL"')
  })
})
