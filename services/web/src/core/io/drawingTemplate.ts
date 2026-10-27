import type { DocumentData } from '../document/types'

/**
 * Plantilla de dibujo (como un archivo de plantilla del CAD clásico): todo lo de un dibujo menos sus objetos —
 * unidades, capas, tipos de línea, estilos de cota, variables y layouts con su rótulo— más las preferencias del
 * usuario (colores de la interfaz, osnaps, estilo visual, paletas, barras). Se guarda como archivo `.cotatpl` y
 * puede quedar como predeterminada en el navegador: cada dibujo nuevo parte de ella.
 */
export const DRAWING_TEMPLATE_EXT = '.cotatpl'
const KEY = 'cota.defaultTemplate'

export interface DrawingTemplate {
  kind: 'cota-template'
  version: 1
  drawing: DocumentData
  prefs?: Record<string, unknown>
}

export function makeTemplate(data: DocumentData, prefs: Record<string, unknown>): DrawingTemplate {
  const d = structuredClone(data)
  d.entities = []
  // Los layouts conservan la hoja (marco, rótulo, viewports) pero no las vistas de dibujo, que son del modelo.
  d.layouts = (d.layouts ?? []).map((l) => ({ ...l, entities: l.entities.filter((e) => !(e.type === 'INSERT' && e.props.view)) }))
  d.blocks = (d.blocks ?? []).filter((b) => !b.name.startsWith('*'))
  delete (d as { meta?: unknown }).meta
  return { kind: 'cota-template', version: 1, drawing: d, prefs }
}

export function parseTemplate(text: string): DrawingTemplate | null {
  try {
    const t = JSON.parse(text) as DrawingTemplate
    return t?.kind === 'cota-template' && t.drawing && Array.isArray(t.drawing.layers) ? t : null
  } catch {
    return null
  }
}

/** Dibujo nuevo a partir de la plantilla (sin objetos, con el nombre dado). */
export function drawingFromTemplate(t: DrawingTemplate, name: string): DocumentData {
  const d = structuredClone(t.drawing)
  d.entities = []
  d.name = name
  return d
}

export function readDefaultTemplate(): DrawingTemplate | null {
  try {
    const s = localStorage.getItem(KEY)
    return s ? parseTemplate(s) : null
  } catch {
    return null
  }
}

export function writeDefaultTemplate(t: DrawingTemplate | null): boolean {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t))
    else localStorage.removeItem(KEY)
    return true
  } catch {
    return false
  }
}
