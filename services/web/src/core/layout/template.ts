import type { DocumentModel } from '../document/DocumentModel'
import type { BlockDef, Entity, Layer, LayoutDef, PageSetup } from '../document/types'
import { LayerService } from '../layers/LayerService'
import { defaultPageSetup } from './paper'
import { fitViewport } from './viewport'
import { modelExtents, setupDefaultSheet, type SheetInit } from './layouts'

/**
 * Plantillas de layout (`.cotat`): página, entidades del papel (rótulo, marco, viewports con
 * su vista) y las capas y bloques que usan. Al aplicarlas en otro dibujo se fusionan capas (por nombre)
 * y bloques (renombrando los que chocan) y los viewports vuelven a encuadrar el modelo.
 */
export const TEMPLATE_EXT = '.cotat'
/** Plantillas guardadas antes del nombre Cota: se siguen leyendo. */
export const LEGACY_TEMPLATE_EXT = '.ccadt'

export interface LayoutTemplate {
  format: 'cotat'
  version: 1
  name: string
  pageSetup: PageSetup
  entities: Entity[]
  layers: Layer[]
  blocks: BlockDef[]
}

export type { SheetInit }

/** Bloques usados por las entidades (inserciones anidadas incluidas), sin repetir. */
function usedBlocks(entities: Entity[], all: BlockDef[]): BlockDef[] {
  const byName = new Map(all.map((b) => [b.name, b]))
  const out = new Map<string, BlockDef>()
  const visit = (list: Entity[]) => {
    for (const e of list) {
      if (e.type !== 'INSERT' || out.has(e.props.name)) continue
      const b = byName.get(e.props.name)
      if (!b) continue
      out.set(b.name, b)
      visit(b.entities)
    }
  }
  visit(entities)
  return [...out.values()]
}

/** Plantilla a partir de un layout del dibujo. */
export function layoutToTemplate(doc: DocumentModel, layoutId: string, name: string): LayoutTemplate {
  const l = doc.getLayout(layoutId)
  if (!l) throw new Error('Layout not found.')
  const blocks = usedBlocks(l.entities, doc.blocks)
  const layerIds = new Set<string>()
  for (const e of [...l.entities, ...blocks.flatMap((b) => b.entities)]) {
    layerIds.add(e.layer)
    if (e.type === 'VIEWPORT') e.props.frozenLayers.forEach((id) => layerIds.add(id))
  }
  return structuredClone({
    format: 'cotat',
    version: 1,
    name,
    pageSetup: l.pageSetup,
    entities: l.entities,
    layers: doc.layers.filter((x) => layerIds.has(x.id)),
    blocks,
  })
}

/** Lee un `.cotat` (JSON); null si no es una plantilla válida. */
export function parseTemplate(text: string): LayoutTemplate | null {
  try {
    const t = JSON.parse(text) as Partial<LayoutTemplate>
    if ((t.format as string) !== 'cotat' && (t.format as string) !== 'ccadt') return null
    if (!t.pageSetup || !Array.isArray(t.entities)) return null
    return { format: 'cotat', version: 1, name: t.name ?? 'Template', pageSetup: t.pageSetup, entities: t.entities, layers: t.layers ?? [], blocks: t.blocks ?? [] }
  } catch {
    return null
  }
}

/** Nombre libre `base (n)` en una lista de nombres. */
function freeName(base: string, taken: (n: string) => boolean): string {
  for (let i = 2; ; i++) if (!taken(`${base} (${i})`)) return `${base} (${i})`
}

/**
 * Entidades de la plantilla listas para el dibujo: capas fusionadas por nombre (las que faltan se
 * crean), bloques agregados (si ya existe uno con el mismo nombre y distinto contenido se renombra el de
 * la plantilla) y viewports a extensiones del modelo con su misma vista.
 */
export function prepareTemplate(doc: DocumentModel, tpl: LayoutTemplate): Entity[] {
  const svc = new LayerService(doc)
  const layerMap = new Map<string, string>()
  for (const l of tpl.layers) {
    const existing = doc.layers.find((x) => x.name.toLowerCase() === l.name.toLowerCase())
    layerMap.set(l.id, existing ? existing.id : svc.create(l.name, { ...l, id: undefined }).id)
  }
  const layer = (id: string) => layerMap.get(id) ?? (doc.layers.some((x) => x.id === id) ? id : doc.firstLayerId)
  const remapLayers = (list: Entity[]) =>
    list.map((e) => {
      const c = structuredClone(e)
      c.layer = layer(c.layer)
      if (c.type === 'VIEWPORT') c.props.frozenLayers = c.props.frozenLayers.map(layer)
      return c
    })

  // Bloques: mismo nombre y mismo contenido → se reutiliza; distinto → se renombra el de la plantilla.
  const rename = new Map<string, string>()
  const incoming = tpl.blocks.map((b) => ({ name: b.name, entities: remapLayers(b.entities) }))
  for (const b of incoming) {
    const cur = doc.getBlock(b.name)
    const body = JSON.stringify(b.entities)
    if (!cur || JSON.stringify(cur.entities) === body) continue
    // ¿Ya se importó antes con otro nombre (`NOMBRE (2)`)? Se reutiliza esa copia.
    const twin = doc.blocks.find((x) => x.name.startsWith(`${b.name} (`) && JSON.stringify(x.entities) === body)
    rename.set(b.name, twin?.name ?? freeName(b.name, (n) => !!doc.getBlock(n) || incoming.some((x) => x.name === n)))
  }
  const fixInserts = (list: Entity[]) => {
    for (const e of list) if (e.type === 'INSERT' && rename.has(e.props.name)) e.props.name = rename.get(e.props.name)!
  }
  for (const b of incoming) {
    fixInserts(b.entities)
    const name = rename.get(b.name) ?? b.name
    if (!doc.getBlock(name)) doc.setBlock({ name, entities: b.entities })
  }

  const ext = modelExtents(doc)
  const out = remapLayers(tpl.entities)
  fixInserts(out)
  for (const e of out) if (e.type === 'VIEWPORT') Object.assign(e.props, fitViewport(ext, e.props, doc.units))
  return out
}

/** Crea un layout nuevo desde una plantilla (LAYOUT Template / "Desde plantilla…"). */
export function addLayoutFromTemplate(doc: DocumentModel, tpl: LayoutTemplate, name?: string): LayoutDef {
  const entities = prepareTemplate(doc, tpl)
  const base = name?.trim() || tpl.name
  const n = doc.findLayoutByName(base) ? freeName(base, (x) => !!doc.findLayoutByName(x)) : base
  const l = doc.addLayout(n, tpl.pageSetup, entities)
  doc.markLayoutInitialized(l.id)
  return l
}

/** Inicializador que aplica una plantilla al layout activo vacío (plantilla predeterminada guardada). */
export function templateSheetInit(tpl: LayoutTemplate): SheetInit {
  return (doc) => {
    const l = doc.activeLayout
    if (!l) return
    doc.setPageSetup(l.id, tpl.pageSetup)
    for (const e of prepareTemplate(doc, tpl)) doc.addEntity({ type: e.type, layer: e.layer, props: e.props })
  }
}

/** Plantillas incluidas: marco + rótulo IRAM + viewport (como Layout1) en A4 vertical y A3–A0 apaisado. */
export const BUILTIN_TEMPLATES: { id: string; name: string; pageSetup: () => PageSetup }[] = [
  { id: 'builtin:A4P', name: 'IRAM A4 vertical', pageSetup: () => ({ ...defaultPageSetup('A4'), orientation: 'portrait' }) },
  { id: 'builtin:A3', name: 'IRAM A3 apaisado', pageSetup: () => defaultPageSetup('A3') },
  { id: 'builtin:A2', name: 'IRAM A2 apaisado', pageSetup: () => defaultPageSetup('A2') },
  { id: 'builtin:A1', name: 'IRAM A1 apaisado', pageSetup: () => defaultPageSetup('A1') },
  { id: 'builtin:A0', name: 'IRAM A0 apaisado', pageSetup: () => defaultPageSetup('A0') },
]

/** Plantilla predeterminada de fábrica para layouts nuevos. */
export const DEFAULT_TEMPLATE_ID = 'builtin:A3'
/** Sin plantilla: sólo un viewport en el área imprimible (como la plantilla por defecto del CAD clásico). */
export const NO_TEMPLATE_ID = 'none'

/** Inicializador de una plantilla incluida (o de "ninguna"). */
export function builtinSheetInit(id: string): SheetInit | null {
  if (id === NO_TEMPLATE_ID) return (doc, layer) => setupDefaultSheet(doc, layer, false)
  const b = BUILTIN_TEMPLATES.find((t) => t.id === id)
  if (!b) return null
  return (doc, layer) => {
    const l = doc.activeLayout
    if (!l) return
    doc.setPageSetup(l.id, b.pageSetup())
    setupDefaultSheet(doc, layer)
  }
}

/** Crea un layout nuevo desde una plantilla incluida. */
export function addLayoutFromBuiltin(doc: DocumentModel, id: string, layer: string, name?: string): LayoutDef | null {
  const b = BUILTIN_TEMPLATES.find((t) => t.id === id)
  if (!b) return null
  // La hoja se arma con el layout nuevo activo y después se vuelve a la pestaña (y MSPACE) anterior.
  const prev = doc.activeTab
  const ms = doc.msViewportId
  const l = doc.addLayout(name?.trim() || undefined, b.pageSetup())
  doc.setActiveTab(l.id)
  setupDefaultSheet(doc, layer)
  doc.markLayoutInitialized(l.id)
  doc.setActiveTab(prev)
  if (ms) doc.setMsViewport(ms)
  return l
}
