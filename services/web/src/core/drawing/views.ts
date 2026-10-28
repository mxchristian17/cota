import type { Entity, InsertProps, ShadeProps } from '../document/types'
import { mapShade } from '../projection/shade'
import type { Vec3 } from '../math'
import { ISO_AZ, type ViewName } from '../view'
import type { ProjBasis, ProjItem } from '../projection/orthographic'
import { arcBounds } from '../geom/arc'

/**
 * Vistas de dibujo: VIEWBASE / VIEWPROJ del CAD clásico (*Model Documentation*). Cada vista es una
 * inserción en el papel de un bloque anónimo (`*VIEWn`) con la proyección del modelo (líneas visibles en la
 * capa `MD_Visible` y ocultas en `MD_Hidden`); sus datos de vista van en `InsertProps.view`. Las vistas
 * proyectadas quedan alineadas con su vista madre (horizontal o vertical) y heredan su escala.
 */

export type HiddenMode = 'visible' | 'visibleHidden' | 'shadedVisible' | 'shadedVisibleHidden'

/** ¿El estilo muestra las líneas ocultas? ¿Va sombreado? */
export const showsHidden = (h: HiddenMode): boolean => h === 'visibleHidden' || h === 'shadedVisibleHidden'
export const isShaded = (h: HiddenMode): boolean => h === 'shadedVisible' || h === 'shadedVisibleHidden'
export type Projection = 'first' | 'third'

/** Datos de vista de una inserción (la distingue de un bloque común). */
export interface DrawingViewData {
  /** Orientación de la vista base o, en las proyectadas, la base explícita. */
  orientation: ViewName | 'projected'
  basis: ProjBasis
  hidden: HiddenMode
  /** Objetos del modelo proyectados; null = todo el modelo. */
  source: string[] | null
  /** Id de la vista madre (vistas proyectadas). */
  parent?: string
  /** Hacia dónde se proyectó: horizontal, vertical o isométrica (libre). */
  align?: 'h' | 'v' | 'free'
  /** Desplazamiento respecto de la madre (papel) y última posición conocida de la madre. */
  offset?: [number, number]
  lastParent?: [number, number]
  /** Escala heredada de la madre (por defecto sí, como el CAD clásico). */
  inheritScale?: boolean
  /** Firma del modelo con la que se calculó (para VIEWUPDATE). */
  sig?: string
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (v: Vec3): Vec3 => {
  const L = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / L, v[1] / L, v[2] / L]
}
const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]]
const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]

/** Base de una vista desde la dirección `out` (hacia el observador), con el "arriba" del mundo (+Z). */
export function basisFromOut(out: Vec3, upHint: Vec3 = [0, 0, 1]): ProjBasis {
  const o = unit(out)
  const hint = Math.abs(o[0] * upHint[0] + o[1] * upHint[1] + o[2] * upHint[2]) > 0.999 ? ([0, 1, 0] as Vec3) : upHint
  const right = unit(cross(hint, o))
  return { right, up: cross(o, right), out: o }
}

/**
 * Base de la cámara de un viewport (azimut y elevación de `CameraController`): `out` hacia el observador,
 * arriba +Z (o +Y mirando casi en vertical), como la ve el usuario (SOLPROF).
 */
export function basisFromAzEl(az: number, el: number): ProjBasis {
  const ce = Math.cos(el)
  const out: Vec3 = [ce * Math.cos(az), ce * Math.sin(az), Math.sin(el)]
  const up: Vec3 = Math.abs(el) > 1.5533 ? [0, 1, 0] : [0, 0, 1]
  const right = unit(cross(up, out))
  return { right, up: cross(out, right), out }
}

/** Base de una vista estándar, como las de VIEW (FRONT mira desde −Y con +Z arriba, TOP desde +Z, …). */
export function viewBasis(v: ViewName): ProjBasis {
  switch (v) {
    case 'TOP':
      return { right: [1, 0, 0], up: [0, 1, 0], out: [0, 0, 1] }
    case 'BOTTOM':
      return { right: [1, 0, 0], up: [0, -1, 0], out: [0, 0, -1] }
    case 'FRONT':
      return { right: [1, 0, 0], up: [0, 0, 1], out: [0, -1, 0] }
    case 'BACK':
      return { right: [-1, 0, 0], up: [0, 0, 1], out: [0, 1, 0] }
    case 'RIGHT':
      return { right: [0, 1, 0], up: [0, 0, 1], out: [1, 0, 0] }
    case 'LEFT':
      return { right: [0, -1, 0], up: [0, 0, 1], out: [-1, 0, 0] }
    default: {
      const az = ISO_AZ[v] ?? -Math.PI / 4
      const el = Math.atan(1 / Math.SQRT2)
      return basisFromOut([Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)])
    }
  }
}

/**
 * Vista proyectada desde una madre, según dónde se la ubica en el papel (dx, dy desde el centro de la madre):
 * a los lados o arriba/abajo es ortogonal (primer diedro: se ve desde el lado opuesto, como el sistema
 * europeo/ISO E e IRAM; tercer diedro: desde el mismo lado), en diagonal es isométrica.
 */
export function projectedBasis(parent: ProjBasis, dx: number, dy: number, projection: Projection): { basis: ProjBasis; align: 'h' | 'v' | 'free' } {
  const { right: R, up: U, out: O } = parent
  const s = projection === 'first' ? -1 : 1
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax > 2 * ay) {
    // A la derecha (tercer diedro): se mira desde la derecha de la madre; su derecha es −O y su arriba U.
    const out = s * Math.sign(dx) > 0 ? R : neg(R)
    return { basis: { right: cross(U, out), up: U, out }, align: 'h' }
  }
  if (ay > 2 * ax) {
    const out = s * Math.sign(dy) > 0 ? U : neg(U)
    return { basis: { right: R, up: cross(out, R), out }, align: 'v' }
  }
  // Isométrica: desde la esquina de la madre que corresponde al cuadrante.
  const sx = s * Math.sign(dx || 1)
  const sy = s * Math.sign(dy || 1)
  const out = unit(add(add(O, R, sx), U, sy))
  return { basis: basisFromOut(out, U), align: 'free' }
}

/** Escalas estándar de las vistas (papel/modelo), de mayor a menor. */
export const VIEW_SCALES = [10, 5, 2, 1, 1 / 2, 1 / 2.5, 1 / 5, 1 / 10, 1 / 20, 1 / 25, 1 / 50, 1 / 100, 1 / 200, 1 / 500, 1 / 1000]

/** Escala automática de la vista base: la mayor estándar con la que la vista ocupa ≤ 1/3 del papel. */
export function autoViewScale(modelW: number, modelH: number, paperW: number, paperH: number): number {
  for (const s of VIEW_SCALES) if (modelW * s <= paperW / 3 && modelH * s <= paperH / 3) return s
  return VIEW_SCALES[VIEW_SCALES.length - 1]
}

/** "1:2", "2:1"… */
export function scaleLabel(s: number): string {
  return s >= 1 ? `${Number(s.toFixed(4))}:1` : `1:${Number((1 / s).toFixed(4))}`
}

/** Escala escrita como `1:2`, `2:1`, `0.5` o `2x`. */
export function parseScale(text: string): number | null {
  const t = text.trim().toLowerCase().replace(',', '.')
  const m = t.match(/^(\d*\.?\d+)\s*[:/]\s*(\d*\.?\d+)$/)
  const v = m ? Number(m[1]) / Number(m[2]) : Number(t.replace(/x$/, ''))
  return isFinite(v) && v > 0 ? v : null
}

/**
 * Entidades del bloque de una vista: líneas, arcos y círculos 2D centrados en el centro de su caja (la
 * inserción se ubica en el centro de la vista). Devuelve también el tamaño en unidades de modelo.
 */
/**
 * Entidades del bloque de una vista. `origin` (coordenadas de la vista) es el punto del bloque que queda en la
 * inserción: si todas las vistas de una pieza usan la proyección del MISMO punto 3D (su centro), las vistas
 * alineadas quedan en correspondencia exacta (Monge). Sin él, el centro del recuadro de la vista.
 */
/** Grosor de las líneas finas de rosca en las vistas (mm). */
const THIN_LW = 0.18

export function viewBlockEntities(
  items: ProjItem[],
  layers: { visible: string; hidden: string },
  shade?: ShadeProps | null,
  origin?: [number, number] | null,
): { entities: Entity[]; width: number; height: number } {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  const grow = (x: number, y: number) => {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  for (const it of items) {
    if (it.kind === 'line') {
      grow(...it.a)
      grow(...it.b)
    } else if (it.kind === 'circle') {
      grow(it.c[0] - it.r, it.c[1] - it.r)
      grow(it.c[0] + it.r, it.c[1] + it.r)
    } else {
      // Un arco sólo ocupa su tramo (antes contaba como el círculo entero y descentraba la vista).
      const b = arcBounds({ center: [it.c[0], it.c[1], 0], radius: it.r, startAngle: it.a0, endAngle: it.a1, normal: [0, 0, 1] })
      grow(b.minX, b.minY)
      grow(b.maxX, b.maxY)
    }
  }
  if (!isFinite(x0)) return { entities: [], width: 0, height: 0 }
  const [cx, cy] = origin ?? [(x0 + x1) / 2, (y0 + y1) / 2]
  const at = (p: [number, number]): Vec3 => [p[0] - cx, p[1] - cy, 0]
  const lines: Entity[] = items.map((it, i) => {
    const id = `v${i + 1}`
    const layer = it.hidden ? layers.hidden : layers.visible
    // Las líneas finas de las roscas (ISO 6410) llevan su grosor; el arco de 3/4, también su designativo.
    const thin = it.kind !== 'circle' && it.thin ? { lineWeight: THIN_LW } : {}
    if (it.kind === 'line') return { id, type: 'LINE', layer, props: { start: at(it.a), end: at(it.b) }, ...thin }
    if (it.kind === 'circle') return { id, type: 'CIRCLE', layer, props: { center: at(it.c), radius: it.r, normal: [0, 0, 1] } }
    return { id, type: 'ARC', layer, props: { center: at(it.c), radius: it.r, startAngle: it.a0, endAngle: it.a1, normal: [0, 0, 1], ...(it.thread ? { thread: it.thread } : {}) }, ...thin }
  })
  // El sombreado va primero (se pinta debajo de las líneas), corrido al mismo centro.
  const entities: Entity[] = shade && shade.tris.length ? [{ id: 'shade', type: 'SHADE', layer: layers.visible, props: mapShade(shade, (v) => [v[0] - cx, v[1] - cy, v[2]]) }, ...lines] : lines
  // Con un origen común el bloque no queda centrado: el ancho y el alto cubren lo dibujado a ambos lados.
  const w = origin ? 2 * Math.max(Math.abs(x0 - cx), Math.abs(x1 - cx)) : x1 - x0
  const h = origin ? 2 * Math.max(Math.abs(y0 - cy), Math.abs(y1 - cy)) : y1 - y0
  return { entities, width: w, height: h }
}

type ViewInsert = Extract<Entity, { type: 'INSERT' }> & { props: InsertProps & { view: DrawingViewData } }
export const isDrawingView = (e: Entity | undefined): e is ViewInsert => e?.type === 'INSERT' && !!e.props.view

/**
 * Mantiene las vistas proyectadas alineadas con su madre, como el CAD clásico:
 * - si la madre se movió, la hija la sigue (mismo desplazamiento);
 * - si se movió la hija, sólo puede correrse a lo largo de su alineación (horizontal o vertical);
 * - con escala heredada, toma la de la madre.
 * Devuelve true si cambió algo.
 */
export function alignDrawingViews(entities: Entity[]): boolean {
  const byId = new Map(entities.filter(isDrawingView).map((e) => [e.id, e]))
  let changed = false
  // Las madres antes que sus hijas (las cadenas son cortas: base → proyectada).
  const order = [...byId.values()].sort((a, b) => depth(a, byId) - depth(b, byId))
  for (const child of order) {
    const v = child.props.view
    const parent = v.parent ? byId.get(v.parent) : undefined
    if (!parent) continue
    const P: [number, number] = [parent.props.position[0], parent.props.position[1]]
    let rescaled = false
    if (v.inheritScale !== false && child.props.scale[0] !== parent.props.scale[0]) {
      const k = parent.props.scale[0] / child.props.scale[0]
      child.props.scale = [...parent.props.scale]
      if (v.offset) v.offset = [v.offset[0] * k, v.offset[1] * k]
      rescaled = changed = true
    }
    const C: [number, number] = [child.props.position[0], child.props.position[1]]
    const parentMoved = !v.lastParent || v.lastParent[0] !== P[0] || v.lastParent[1] !== P[1]
    let off: [number, number] = (parentMoved || rescaled) && v.offset ? v.offset : [C[0] - P[0], C[1] - P[1]]
    if (v.align === 'h') off = [off[0], 0]
    else if (v.align === 'v') off = [0, off[1]]
    const next: [number, number] = [P[0] + off[0], P[1] + off[1]]
    if (next[0] !== C[0] || next[1] !== C[1]) {
      child.props.position = [next[0], next[1], child.props.position[2]]
      changed = true
    }
    v.offset = off
    v.lastParent = P
  }
  return changed
}

function depth(e: ViewInsert, byId: Map<string, ViewInsert>): number {
  let d = 0
  let p = e.props.view.parent
  while (p && d < 16) {
    d++
    p = byId.get(p)?.props.view.parent
  }
  return d
}
