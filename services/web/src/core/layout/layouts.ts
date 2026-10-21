import type { DocumentModel } from '../document/DocumentModel'
import { MODEL_TAB } from '../document/DocumentModel'
import type { Entity, ViewportEntity } from '../document/types'
import type { Vec3 } from '../math'
import type { ViewName } from '../view'
import { entityOutline } from '../editing/bounds'
import { defaultAttributes, expandEntities } from '../editing/block'
import { IRAM_BLOCK, IRAM_SIZE, ensureIramBlock } from './titleblock'
import { printableArea } from './paper'
import { fitViewport, newViewportProps, viewAngles, viewportRing } from './viewport'

export type Box3 = { min: Vec3; max: Vec3 }

/** Caja 3D de las entidades (bloques expandidos), o null si no hay geometría. */
export function extentsOf(entities: Entity[], blocks: DocumentModel['blocks']): Box3 | null {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const e of expandEntities(entities, blocks)) {
    for (const poly of entityOutline(e)) {
      for (const p of poly) {
        if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) continue
        min[0] = Math.min(min[0], p.x); min[1] = Math.min(min[1], p.y); min[2] = Math.min(min[2], p.z)
        max[0] = Math.max(max[0], p.x); max[1] = Math.max(max[1], p.y); max[2] = Math.max(max[2], p.z)
      }
    }
  }
  return isFinite(min[0]) ? { min, max } : null
}

/** Extensiones del modelo (para encuadrar viewports nuevos, como el CAD clásico). */
export function modelExtents(doc: DocumentModel): Box3 | null {
  return extentsOf(doc.modelEntities, doc.blocks)
}

/**
 * Agrega un VIEWPORT rectangular (esquinas en mm de papel) al layout activo, encuadrando las
 * extensiones del modelo en la vista indicada (TOP por defecto). Devuelve la entidad creada.
 */
export function addViewport(
  doc: DocumentModel,
  a: [number, number],
  b: [number, number],
  layer: string,
  view: ViewName = 'TOP',
): ViewportEntity {
  const w = Math.abs(b[0] - a[0])
  const h = Math.abs(b[1] - a[1])
  const props = newViewportProps([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0], w, h)
  Object.assign(props, viewAngles(view))
  Object.assign(props, fitViewport(modelExtents(doc), props, doc.units))
  props.frozenLayers = doc.layers.filter((l) => l.newVpFreeze).map((l) => l.id) // *New VP Freeze*
  return doc.addEntity({ type: 'VIEWPORT', layer, props }) as ViewportEntity
}

/** VIEWPORT recortado por un polígono del papel (MVIEW Object/Polygonal): su caja es la del contorno. */
export function addClippedViewport(doc: DocumentModel, ring: [number, number][], layer: string): ViewportEntity {
  const xs = ring.map((p) => p[0])
  const ys = ring.map((p) => p[1])
  const vp = addViewport(doc, [Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], layer)
  vp.props.clip = ring.map(([x, y]) => [x, y])
  return vp
}

export type PaperBox = { minX: number; minY: number; maxX: number; maxY: number }
export type Arrangement = 'Horizontal' | 'Vertical' | 'Above' | 'Below' | 'Left' | 'Right'

/**
 * Divide una caja del papel en `n` viewports contiguos como `MVIEW 2/3/4`. `Horizontal`/`Vertical` =
 * filas/columnas iguales; con 3, `Above`/`Below`/`Left`/`Right` indican dónde va el viewport grande
 * (que queda primero en la lista). Orden: grande primero, luego de arriba a abajo y de izquierda a derecha.
 */
export function splitBox(box: PaperBox, n: number, arr: Arrangement): PaperBox[] {
  const { minX, minY, maxX, maxY } = box
  const mx = (minX + maxX) / 2
  const my = (minY + maxY) / 2
  const rows = (k: number, x0 = minX, x1 = maxX, y0 = minY, y1 = maxY) =>
    Array.from({ length: k }, (_, i) => ({ minX: x0, maxX: x1, maxY: y1 - ((y1 - y0) * i) / k, minY: y1 - ((y1 - y0) * (i + 1)) / k }))
  const cols = (k: number, x0 = minX, x1 = maxX, y0 = minY, y1 = maxY) =>
    Array.from({ length: k }, (_, i) => ({ minY: y0, maxY: y1, minX: x0 + ((x1 - x0) * i) / k, maxX: x0 + ((x1 - x0) * (i + 1)) / k }))
  if (n <= 1) return [box]
  if (n === 2) return arr === 'Horizontal' ? rows(2) : cols(2)
  if (n === 3) {
    switch (arr) {
      case 'Horizontal':
        return rows(3)
      case 'Vertical':
        return cols(3)
      case 'Above':
        return [{ minX, maxX, minY: my, maxY }, ...cols(2, minX, maxX, minY, my)]
      case 'Below':
        return [{ minX, maxX, minY, maxY: my }, ...cols(2, minX, maxX, my, maxY)]
      case 'Left':
        return [{ minX, maxX: mx, minY, maxY }, ...rows(2, mx, maxX)]
      case 'Right':
        return [{ minX: mx, maxX, minY, maxY }, ...rows(2, minX, mx)]
    }
  }
  const [top, bottom] = rows(2)
  return [...cols(2, minX, maxX, top.minY, top.maxY), ...cols(2, minX, maxX, bottom.minY, bottom.maxY)]
}

/** Inicializador de la hoja de un layout vacío (la plantilla predeterminada de OPTIONS). */
export type SheetInit = (doc: DocumentModel, layer: string) => void

/**
 * Hoja predeterminada de un layout vacío: marco en el área imprimible, rótulo IRAM abajo a la derecha
 * (si entra) y un viewport encima con el modelo a extensiones (D3). Sin rótulo: sólo el
 * viewport en el área imprimible, como la plantilla por defecto del CAD clásico.
 */
export function setupDefaultSheet(doc: DocumentModel, layer: string, titleBlock = true): void {
  const l = doc.activeLayout
  if (!l) return
  const a = printableArea(l.pageSetup)
  const w = a.maxX - a.minX
  const h = a.maxY - a.minY
  if (!titleBlock) {
    addViewport(doc, [a.minX, a.minY], [a.maxX, a.maxY], layer)
    return
  }
  const fits = w >= IRAM_SIZE.width && h >= IRAM_SIZE.height * 2
  // Marco y rótulo son contenido de la plantilla: van en la capa 0 (si la capa actual no se imprime o
  // se congela, no deben desaparecer); el viewport, en la capa actual, como en el CAD clásico.
  doc.addEntity({ type: 'RECTANGLE', layer: '0', props: { corner: [a.minX, a.minY, 0], width: w, height: h } })
  if (fits) {
    ensureIramBlock(doc)
    const attributes = defaultAttributes(doc.getBlock(IRAM_BLOCK))
    doc.addEntity({ type: 'INSERT', layer: '0', props: { name: IRAM_BLOCK, position: [a.maxX, a.minY, 0], scale: [1, 1, 1], rotation: 0, attributes } })
  }
  addViewport(doc, [a.minX, a.minY + (fits ? IRAM_SIZE.height : 0)], [a.maxX, a.maxY], layer)
}

/**
 * Activa una pestaña. La primera vez que se entra a un layout sin inicializar se arma su hoja: marco,
 * rótulo y viewport inicial con el modelo a extensiones (el CAD clásico crea el viewport; el rótulo es D3).
 */
export function activateTab(doc: DocumentModel, id: string, layer: string, init: SheetInit = setupDefaultSheet): void {
  doc.setActiveTab(id)
  const l = doc.activeLayout
  if (!l || l.initialized || id === MODEL_TAB) return
  if (!l.entities.some((e) => e.type === 'VIEWPORT')) init(doc, layer)
  doc.markLayoutInitialized(l.id)
}

/** Pestaña vecina en el orden `Model, Layout1, …` (circular), para Ctrl+PgUp/PgDn. */
export function neighborTab(doc: DocumentModel, delta: number): string {
  const tabs = [MODEL_TAB, ...doc.layouts.map((l) => l.id)]
  const i = Math.max(0, tabs.indexOf(doc.activeTab))
  return tabs[(i + delta + tabs.length) % tabs.length]
}

/** Viewports del layout activo (en orden de creación). */
export function layoutViewports(doc: DocumentModel): ViewportEntity[] {
  return (doc.activeLayout?.entities ?? []).filter((e): e is ViewportEntity => e.type === 'VIEWPORT')
}

/** Máximo de viewports con vista viva por layout (contextos WebGL del navegador), como `MAXACTVP`. */
export const MAX_ACTIVE_VP = 8

/** ¿El punto (x, y) cae dentro del contorno cerrado? (par-impar). */
function insideRing(ring: Vec3[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Viewport encendido del layout activo bajo el punto del papel (el de más arriba), o null. */
export function viewportAt(doc: DocumentModel, x: number, y: number): string | null {
  const vps = layoutViewports(doc).filter((v) => v.props.on)
  for (let i = vps.length - 1; i >= 0; i--) if (insideRing(viewportRing(vps[i].props), x, y)) return vps[i].id
  return null
}

/** Viewport por el que entrar al modelo (MSPACE, botón MODEL): el último usado si sigue encendido, o el primero. */
export function defaultMsViewport(doc: DocumentModel): string | null {
  const on = layoutViewports(doc).filter((v) => v.props.on)
  return (on.find((v) => v.id === doc.lastMsViewportId) ?? on[0])?.id ?? null
}

/** Siguiente viewport encendido desde el de MSPACE, en círculo (Ctrl+R). */
export function nextMsViewport(doc: DocumentModel): string | null {
  const on = layoutViewports(doc)
    .filter((v) => v.props.on)
    .map((v) => v.id)
  if (!on.length) return null
  return on[(on.indexOf(doc.msViewportId ?? '') + 1) % on.length]
}
