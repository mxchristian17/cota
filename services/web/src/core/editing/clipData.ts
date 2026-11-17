import { LayerService } from '../layers/LayerService'
import { cloneEntityInput, translateEntity } from './edit'
import type { DocumentModel } from '../document/DocumentModel'
import type { BlockDef, Entity, EntityInput, InsertProps, Layer } from '../document/types'
import type { Pt } from '../math'

/**
 * Contenido del portapapeles de objetos (COPYCLIP, CUTCLIP, COPYBASE): copias de los objetos con su punto base y lo que
 * necesitan para verse igual en otro dibujo, como en el CAD clásico: las definiciones de los bloques que insertan
 * (también las anidadas) y sus capas. Son datos simples: se guardan para las otras pestañas (ver `sharedClipboard`).
 */
export interface ClipData {
  /** Identifica la copia: se pega la más nueva de todas las pestañas. */
  id: string
  /** Momento de la copia (ms desde 1970). */
  at: number
  base: Pt
  items: EntityInput[]
  /** Definiciones de bloque que usan los objetos, las anidadas antes que las que las contienen. */
  blocks: BlockDef[]
  /** Capas de los objetos y de esas definiciones. */
  layers: Layer[]
}

/** Lo que pasó al pegar (para los mensajes de PASTECLIP). */
export interface PasteReport {
  /** Ids de los objetos pegados. */
  ids: string[]
  /** Definiciones de bloque que se agregaron al dibujo (con el nombre que quedaron). */
  addedBlocks: string[]
  /** Bloques con nombre que el dibujo ya tenía con otra definición: queda la del dibujo. */
  keptBlocks: string[]
  /** Capas que se crearon. */
  addedLayers: string[]
  /** Bloques de las inserciones que no se pegaron porque su definición no está (ni en la copia ni en el dibujo). */
  missing: string[]
  /** Cuántas inserciones no se pegaron por eso. */
  missingRefs: number
  /** Inserciones que no se pegaron porque `skipInsert` las descartó (el bloque en edición se contendría a sí mismo). */
  skipped: number
}

/** Bloques a los que se refiere un objeto: el de una inserción y el contenido de un multileader. */
function blockRefs(e: { type: string; props: unknown }): string[] {
  const out: string[] = []
  if (e.type === 'INSERT') out.push((e.props as InsertProps).name)
  const bn = (e.props as { blockName?: unknown } | null)?.blockName
  if (typeof bn === 'string' && bn) out.push(bn)
  return out
}

/** Cambia (en el lugar) los nombres de bloque a los que se refieren las props de un objeto. */
function renameRefs(type: string, props: unknown, rename: Map<string, string>): void {
  const p = props as { name?: string; blockName?: string }
  if (type === 'INSERT' && p.name !== undefined && rename.has(p.name)) p.name = rename.get(p.name)
  if (typeof p.blockName === 'string' && rename.has(p.blockName)) p.blockName = rename.get(p.blockName)
}

/** Definiciones de bloque que usan los objetos (con las anidadas, cada una una vez), las anidadas primero. */
export function blocksUsedBy(doc: DocumentModel, ents: Array<{ type: string; props: unknown }>): BlockDef[] {
  const out: BlockDef[] = []
  const seen = new Set<string>()
  const visit = (name: string) => {
    if (seen.has(name)) return
    seen.add(name)
    const def = doc.getBlock(name)
    if (!def) return
    for (const e of def.entities) for (const n of blockRefs(e)) visit(n)
    out.push(def)
  }
  for (const e of ents) for (const n of blockRefs(e)) visit(n)
  return out
}

/**
 * Bloques que el dibujo inserta sin tenerlos definidos (modelo, hojas y definiciones), con cuántas referencias cada
 * uno: esas inserciones no dibujan nada.
 */
export function missingBlocks(doc: DocumentModel): Map<string, number> {
  const out = new Map<string, number>()
  const lists = [doc.modelEntities, ...doc.layouts.map((l) => l.entities), ...doc.blocks.map((b) => b.entities)]
  for (const list of lists) {
    for (const e of list) {
      if (e.type !== 'INSERT' || doc.getBlock(e.props.name)) continue
      out.set(e.props.name, (out.get(e.props.name) ?? 0) + 1)
    }
  }
  return out
}

const newClipId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** Arma la copia de los objetos `ents` del dibujo `doc` con su punto base. */
export function makeClip(doc: DocumentModel, ents: Entity[], base: Pt): ClipData {
  // Copias: la definición o la capa pueden cambiar después de copiar, y lo pegado debe ser lo copiado.
  const blocks = blocksUsedBy(doc, ents).map((b) => structuredClone(b))
  const used = new Set<string>(ents.map((e) => e.layer))
  for (const b of blocks) for (const e of b.entities) used.add(e.layer)
  return {
    id: newClipId(),
    at: Date.now(),
    base: { ...base },
    items: ents.map(cloneEntityInput),
    blocks,
    layers: doc.layers.filter((l) => used.has(l.id)).map((l) => ({ ...l })),
  }
}

/** Huella de una definición para compararla con otra de otro dibujo: sin ids y con las capas por nombre. */
function blockSignature(b: BlockDef, layerName: (id: string) => string): string {
  return JSON.stringify(
    // `undefined` no se escribe: la huella no lleva el id ni el id de la capa.
    b.entities.map((e) => [layerName(e.layer), { ...e, id: undefined, layer: undefined }]),
  )
}

/** Primer nombre libre para un bloque anónimo (`*VIEW3` → `*VIEW4`…). */
function freeAnonymousName(name: string, taken: Set<string>): string {
  const prefix = name.replace(/\d+$/, '')
  let i = 1
  while (taken.has(`${prefix}${i}`)) i++
  return `${prefix}${i}`
}

/**
 * Pega la copia en el dibujo `doc`, desplazada `d` (de su punto base al punto de inserción). Antes de los objetos agrega
 * lo que necesitan, como el CAD clásico:
 * - **Capas**, por nombre: si el dibujo tiene una capa con ese nombre se usa la suya (con sus propiedades); si no, se
 *   crea con las de la copia.
 * - **Bloques** (con los anidados): uno que el dibujo no tiene se agrega. Si el dibujo ya tiene un bloque con ese
 *   nombre, queda **su** definición (las inserciones pegadas la usan) y, si era distinta, se informa. Los anónimos
 *   (`*…`, p. ej. las vistas de dibujo) no tienen un nombre propio que respetar: si el del dibujo es distinto, el
 *   pegado se agrega con el próximo nombre libre.
 * - Una inserción cuyo bloque no está ni en la copia ni en el dibujo no se pega (no dibujaría nada): se informa.
 */
export function pasteClip(doc: DocumentModel, clip: ClipData, d: { x: number; y: number; z: number }, skipInsert?: (block: string) => boolean): PasteReport {
  const report: PasteReport = { ids: [], addedBlocks: [], keptBlocks: [], addedLayers: [], missing: [], missingRefs: 0, skipped: 0 }
  // Capas por nombre.
  const layerId = new Map<string, string>()
  const layers = new LayerService(doc)
  for (const l of clip.layers ?? []) {
    const same = doc.layers.find((x) => x.name.toLowerCase() === l.name.toLowerCase())
    if (same) {
      layerId.set(l.id, same.id)
      continue
    }
    try {
      const made = layers.create(l.name, { ...l, id: undefined }) // con un id nuevo del dibujo
      layerId.set(l.id, made.id)
      report.addedLayers.push(made.name)
    } catch {
      layerId.set(l.id, doc.firstLayerId)
    }
  }
  // Sin la capa en la copia (o si no se pudo crear): la misma si existe; si no, la de respaldo.
  const mapLayer = (id: string): string => layerId.get(id) ?? (doc.layers.some((l) => l.id === id) ? id : doc.firstLayerId)
  const clipLayerName = (id: string): string => (clip.layers ?? []).find((l) => l.id === id)?.name.toLowerCase() ?? id
  const docLayerName = (id: string): string => doc.layers.find((l) => l.id === id)?.name.toLowerCase() ?? id

  // Bloques: cuáles se agregan y con qué nombre.
  const rename = new Map<string, string>()
  const taken = new Set(doc.blocks.map((b) => b.name))
  const toAdd: BlockDef[] = []
  for (const b of clip.blocks ?? []) {
    const have = doc.getBlock(b.name)
    if (!have) {
      toAdd.push(b)
      taken.add(b.name)
      continue
    }
    if (blockSignature(have, docLayerName) === blockSignature(b, clipLayerName)) continue // la misma: se usa la del dibujo
    if (b.name.startsWith('*')) {
      const name = freeAnonymousName(b.name, taken)
      taken.add(name)
      rename.set(b.name, name)
      toAdd.push(b)
    } else report.keptBlocks.push(b.name)
  }
  for (const b of toAdd) {
    const entities = b.entities.map((e) => {
      const copy = structuredClone(e)
      copy.id = doc.nextEntityId()
      copy.layer = mapLayer(e.layer)
      renameRefs(copy.type, copy.props, rename)
      return copy
    })
    const name = rename.get(b.name) ?? b.name
    doc.setBlock({ name, entities, ...(b.xref ? { xref: { ...b.xref } } : {}) })
    report.addedBlocks.push(name)
  }

  // Los objetos.
  for (const it of clip.items) {
    const input = structuredClone(it)
    renameRefs(input.type, input.props, rename)
    if (input.type === 'INSERT') {
      const name = (input.props as InsertProps).name
      if (!doc.getBlock(name)) {
        if (!report.missing.includes(name)) report.missing.push(name)
        report.missingRefs++
        continue
      }
      if (skipInsert?.(name)) {
        report.skipped++
        continue
      }
    }
    input.layer = mapLayer(it.layer)
    const e = doc.addEntity(input)
    translateEntity(e, d.x, d.y, d.z)
    report.ids.push(e.id)
  }
  return report
}
