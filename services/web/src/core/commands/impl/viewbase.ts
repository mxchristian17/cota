import type { Command, CommandContext } from '../types'
import type { Entity, InsertProps } from '../../document/types'
import type { Pt, Vec3 } from '../../math'
import type { PreviewShape } from '../../preview'
import type { ProjBasis } from '../../projection/orthographic'
import type { ViewName } from '../../view'
import { activateTab } from '../../layout/layouts'
import { paperSizeMm } from '../../layout/paper'
import { MODEL_TAB } from '../../document/DocumentModel'
import {
  autoViewScale,
  VIEW_SCALES,
  isDrawingView,
  parseScale,
  projectedBasis,
  scaleLabel,
  viewBasis,
  viewBlockEntities,
  type DrawingViewData,
  type HiddenMode,
  isShaded,
  showsHidden,
} from '../../drawing/views'
import { askKeyword } from '../ask'
import { DEFAULT_VIEWGEN, ISO_VIEWS, layoutExtent, mongeLayout, type GenView, type Placed } from '../../drawing/viewgen'

/**
 * Vistas de dibujo del CAD clásico (*Model Documentation*): VIEWBASE crea la vista base del modelo en un
 * layout y, a continuación, sus vistas proyectadas (las vistas de Monge: primer diedro por defecto, como ISO E
 * e IRAM; VIEWSTD lo cambia). VIEWPROJ agrega proyectadas a una vista existente, VIEWEDIT cambia escala y
 * líneas ocultas, VIEWUPDATE las pone al día con el modelo.
 */

const ORIENTATIONS: Array<[string, ViewName | 'CURRENT']> = [
  ['Current', 'CURRENT'],
  ['Top', 'TOP'],
  ['Bottom', 'BOTTOM'],
  ['Left', 'LEFT'],
  ['Right', 'RIGHT'],
  ['Front', 'FRONT'],
  ['Back', 'BACK'],
  ['SW', 'SWISO'],
  ['SE', 'ISO'],
  ['NE', 'NEISO'],
  ['NW', 'NWISO'],
]
const HIDDEN_LABEL: Record<HiddenMode, string> = {
  visible: 'Visible lines',
  visibleHidden: 'Visible and hidden lines',
  shadedVisible: 'Shaded with visible lines',
  shadedVisibleHidden: 'Shaded with visible and hidden lines',
}

interface ViewState {
  orientation: ViewName | 'CURRENT'
  basis: ProjBasis
  hidden: HiddenMode
  scale: number | null
  projected: boolean
}

/** Bloque anónimo libre `*VIEWn`. */
function nextViewBlock(ctx: CommandContext): string {
  const used = new Set(ctx.doc.blocks.map((b) => b.name.toUpperCase()))
  let i = 1
  while (used.has(`*VIEW${i}`)) i++
  return `*VIEW${i}`
}

/** Calcula la geometría 2D de una vista y la deja en su bloque; devuelve su tamaño (unidades de modelo). */
function buildView(ctx: CommandContext, block: string, source: string[] | null, basis: ProjBasis, hidden: HiddenMode): { width: number; height: number } | null {
  const items = ctx.app.projectModel?.(source, basis, { showObscured: showsHidden(hidden), tangential: true }) ?? []
  if (items.length === 0) return null
  const layers = { visible: ctx.app.ensureLayer?.('MD_Visible', undefined, '#ffffff') ?? '0', hidden: ctx.app.ensureLayer?.('MD_Hidden', 'HIDDEN', '#ffffff') ?? '0' }
  const shade = isShaded(hidden) ? (ctx.app.shadeModel?.(source, basis) ?? null) : null
  const { entities, width, height } = viewBlockEntities(items, layers, shade, ctx.app.viewOrigin?.(source, basis) ?? null)
  ctx.doc.setBlock({ name: block, entities })
  return { width, height }
}

/** Rectángulo de una vista centrada en `c` (previsualización al ubicarla). */
const frame = (c: Pt, w: number, h: number): PreviewShape[] => {
  const p = (x: number, y: number): Pt => ({ x: c.x + x, y: c.y + y, z: 0 })
  return [{ kind: 'polyline', points: [p(-w / 2, -h / 2), p(w / 2, -h / 2), p(w / 2, h / 2), p(-w / 2, h / 2), p(-w / 2, -h / 2)] }]
}

function addView(ctx: CommandContext, block: string, at: Pt, scale: number, view: DrawingViewData): Entity {
  const props: InsertProps = { name: block, position: [at.x, at.y, 0], scale: [scale, scale, scale], rotation: 0, view }
  return ctx.doc.addEntity({ type: 'INSERT', layer: ctx.currentLayerId(), props })
}

/** Ubica vistas proyectadas de `parent` hasta Enter (Undo quita la última). */
async function placeProjected(ctx: CommandContext, parent: Entity): Promise<number> {
  if (!isDrawingView(parent)) return 0
  const pv = parent.props.view
  const projection = ctx.doc.vars.VIEWPROJECTION
  const made: string[] = []
  for (;;) {
    const P: Pt = { x: parent.props.position[0], y: parent.props.position[1], z: 0 }
    const s = parent.props.scale[0]
    const r = await ctx.getPoint(made.length ? 'Specify location of projected view or [Undo/eXit] <eXit>: ' : 'Specify location of projected view or <eXit>: ', {
      base: P,
      keywords: made.length ? ['Undo', 'eXit'] : ['eXit'],
      enterKeyword: 'eXit',
      preview: (c) => {
        const b = ctx.doc.blocks.find((x) => x.name === parent.props.name)
        const ext = b ? blockExtents(b.entities) : { w: 10, h: 10 }
        return frame(c, ext.w * s, ext.h * s)
      },
    })
    if (r.kind === 'cancel' || (r.kind === 'keyword' && r.keyword === 'eXit')) break
    if (r.kind === 'keyword' && r.keyword === 'Undo') {
      const id = made.pop()
      if (id) ctx.doc.removeEntity(id)
      continue
    }
    if (r.kind !== 'point') continue
    const dx = r.point.x - P.x
    const dy = r.point.y - P.y
    const { basis, align } = projectedBasis(pv.basis, dx, dy, projection)
    // Como el CAD clásico: las isométricas proyectadas salen sombreadas (con las líneas visibles).
    const hidden: HiddenMode = align === 'free' && !isShaded(pv.hidden) ? 'shadedVisible' : pv.hidden
    const block = nextViewBlock(ctx)
    if (!buildView(ctx, block, pv.source, basis, hidden)) {
      ctx.print('Nothing to project in that direction.')
      continue
    }
    const at: Pt = align === 'h' ? { x: r.point.x, y: P.y, z: 0 } : align === 'v' ? { x: P.x, y: r.point.y, z: 0 } : r.point
    const e = addView(ctx, block, at, s, {
      orientation: 'projected',
      basis,
      hidden,
      source: pv.source,
      parent: parent.id,
      align,
      offset: [at.x - P.x, at.y - P.y],
      lastParent: [P.x, P.y],
      inheritScale: true,
    })
    made.push(e.id)
    ctx.doc.touch()
  }
  return made.length
}

/** Extensión (ancho, alto) de las entidades 2D de un bloque de vista. */
function blockExtents(es: Entity[]): { w: number; h: number } {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  const g = (p: Vec3, r = 0) => {
    x0 = Math.min(x0, p[0] - r)
    y0 = Math.min(y0, p[1] - r)
    x1 = Math.max(x1, p[0] + r)
    y1 = Math.max(y1, p[1] + r)
  }
  for (const e of es) {
    if (e.type === 'LINE') {
      g(e.props.start)
      g(e.props.end)
    } else if (e.type === 'CIRCLE' || e.type === 'ARC') g(e.props.center, e.props.radius)
  }
  return isFinite(x0) ? { w: x1 - x0, h: y1 - y0 } : { w: 10, h: 10 }
}

async function askOrientation(ctx: CommandContext, current: string): Promise<ViewName | 'CURRENT' | null> {
  const k = await askKeyword(ctx, `Select orientation [${ORIENTATIONS.map(([k]) => k).join('/')}] <${current}>: `, ORIENTATIONS.map(([k]) => k), current)
  return k ? (ORIENTATIONS.find(([n]) => n === k)?.[1] ?? null) : null
}

const HIDDEN_KEYS: Array<[string, HiddenMode]> = [
  ['Visible', 'visible'],
  ['Hidden', 'visibleHidden'],
  ['Shaded', 'shadedVisible'],
  ['SHidden', 'shadedVisibleHidden'],
]

async function askHidden(ctx: CommandContext, current: HiddenMode): Promise<HiddenMode | null> {
  const cur = HIDDEN_KEYS.find(([, v]) => v === current)?.[0] ?? 'Hidden'
  const k = await askKeyword(
    ctx,
    `Select style [Visible lines/visible and Hidden lines/Shaded with visible lines/Shaded with visible and hidden lines (SHidden)] <${cur}>: `,
    HIDDEN_KEYS.map(([k]) => k),
    cur,
  )
  return k ? (HIDDEN_KEYS.find(([n]) => n === k)?.[1] ?? null) : null
}

async function askScale(ctx: CommandContext, current: number): Promise<number | null> {
  for (;;) {
    const s = await ctx.getString(`Enter scale <${scaleLabel(current)}>: `, { default: scaleLabel(current) })
    if (s === null) return null
    const v = parseScale(s)
    if (v) return v
    ctx.print('Requires a positive scale such as 1:2, 2:1 or 0.5.')
  }
}


export const viewbaseCommand: Command = {
  name: 'VIEWBASE',
  aliases: [],
  description: 'Create a base view of the model in a layout, then its projected views',
  async run(ctx) {
    let source: string[] | null = null
    const st: ViewState = { orientation: 'FRONT', basis: viewBasis('FRONT'), hidden: 'visibleHidden', scale: null, projected: true }
    // "Current": la vista del viewport del modelo, tomada antes de pasar al layout.
    const modelBasis = ctx.doc.inPaperSpace ? null : (ctx.app.currentViewBasis?.() ?? null)
    const basisOf = (o: ViewName | 'CURRENT'): ProjBasis => (o === 'CURRENT' ? (modelBasis ?? viewBasis('FRONT')) : viewBasis(o))
    if (!ctx.doc.inPaperSpace) {
      // Desde el modelo: qué objetos y en qué layout (como el CAD clásico).
      const sel = await ctx.getSelectionOrKeyword('Select objects or [Entire model] <Entire model>: ', ['Entire'])
      if (sel === null) return
      if (sel.kind === 'selection' && sel.ids.length) source = sel.ids
      if ((await toLayout(ctx)) !== 'layout') return
    }
    const layout = ctx.doc.activeLayout
    if (!layout || ctx.doc.activeTab === MODEL_TAB) {
      ctx.print('VIEWBASE places drawing views on a layout.')
      return
    }
    const paper = paperSizeMm(layout.pageSetup)
    const pw = layout.pageSetup.orientation === 'landscape' ? Math.max(paper.width, paper.height) : Math.min(paper.width, paper.height)
    const ph = layout.pageSetup.orientation === 'landscape' ? Math.min(paper.width, paper.height) : Math.max(paper.width, paper.height)

    // La vista base: opciones hasta que se indica su ubicación.
    const block = nextViewBlock(ctx)
    let size = buildView(ctx, block, source, st.basis, st.hidden)
    if (!size) {
      ctx.print('No 3D solids to document.')
      return
    }
    let scale = st.scale ?? autoViewScale(size.width, size.height, pw, ph)
    let base: Entity | null
    for (;;) {
      ctx.print(`Type = ${st.projected ? 'Base and Projected' : 'Base only'}  Hidden Lines = ${HIDDEN_LABEL[st.hidden]}  Scale = ${scaleLabel(scale)}`)
      const sz = size
      const r = await ctx.getPoint('Specify location of base view or [Type/Orientation/Hidden lines/Scale] <Type>: ', {
        base: null,
        keywords: ['Type', 'Orientation', 'Hidden', 'Scale'],
        enterKeyword: 'Type',
        preview: (c) => frame(c, sz.width * scale, sz.height * scale),
      })
      if (r.kind === 'cancel') {
        ctx.doc.removeBlock(block)
        return
      }
      if (r.kind === 'point') {
        base = addView(ctx, block, r.point, scale, { orientation: st.orientation === 'CURRENT' ? 'projected' : st.orientation, basis: st.basis, hidden: st.hidden, source })
        ctx.doc.touch()
        break
      }
      if (r.keyword === 'Type') {
        const k = await askKeyword(ctx, 'Select type [Base only/Base and Projected] <Base and Projected>: ', ['Base', 'Projected'], 'Projected')
        if (k) st.projected = k === 'Projected'
      } else if (r.keyword === 'Orientation') {
        const o = await askOrientation(ctx, ORIENTATIONS.find(([, v]) => v === st.orientation)?.[0] ?? 'Front')
        if (o) {
          st.orientation = o
          st.basis = basisOf(o)
        }
      } else if (r.keyword === 'Hidden') {
        const h = await askHidden(ctx, st.hidden)
        if (h) st.hidden = h
      } else if (r.keyword === 'Scale') {
        const s = await askScale(ctx, scale)
        if (s) {
          scale = s
          st.scale = s
        }
        continue
      }
      // Orientación u ocultas cambiaron: se recalcula la vista (y su escala automática).
      size = buildView(ctx, block, source, st.basis, st.hidden)
      if (!size) {
        ctx.print('No 3D solids to document.')
        return
      }
      if (st.scale === null) scale = autoViewScale(size.width, size.height, pw, ph)
    }
    const n = st.projected ? await placeProjected(ctx, base) : 0
    ctx.print(`Base view created${n ? ` with ${n} projected view(s)` : ''} (${ctx.doc.vars.VIEWPROJECTION === 'first' ? 'first-angle' : 'third-angle'} projection, ${scaleLabel(scale)}).`)
  },
}

async function pickView(ctx: CommandContext, prompt: string): Promise<Entity | null> {
  for (;;) {
    const ids = await ctx.getSelection(prompt)
    if (!ids || ids.length === 0) return null
    const v = ids.map((id) => ctx.doc.getEntity(id)).find((e) => isDrawingView(e))
    if (v) return v
    ctx.print('That is not a drawing view.')
  }
}

export const viewprojCommand: Command = {
  name: 'VIEWPROJ',
  aliases: [],
  description: 'Create projected views from an existing drawing view',
  async run(ctx) {
    if (!ctx.doc.inPaperSpace) {
      ctx.print('VIEWPROJ works on drawing views in a layout. Use VIEWBASE to create one.')
      return
    }
    const parent = await pickView(ctx, 'Select parent view: ')
    if (!parent) return
    const n = await placeProjected(ctx, parent)
    ctx.print(`${n} projected view(s) created.`)
  },
}

export const vieweditCommand: Command = {
  name: 'VIEWEDIT',
  aliases: [],
  description: 'Edit a drawing view: hidden lines and scale',
  async run(ctx) {
    const v = await pickView(ctx, 'Select view: ')
    if (!v || !isDrawingView(v)) return
    for (;;) {
      const k = await askKeyword(ctx, 'Select option [Hidden lines/Scale/eXit] <eXit>: ', ['Hidden', 'Scale', 'eXit'], 'eXit')
      if (!k || k === 'eXit') return
      if (k === 'Hidden') {
        const h = await askHidden(ctx, v.props.view.hidden)
        if (!h) continue
        v.props.view.hidden = h
        buildView(ctx, v.props.name, v.props.view.source, v.props.view.basis, h)
      } else {
        const s = await askScale(ctx, v.props.scale[0])
        if (!s) continue
        // Una proyectada con escala propia deja de heredar la de su madre (como el CAD clásico).
        if (v.props.view.parent) v.props.view.inheritScale = false
        v.props.scale = [s, s, s]
      }
      ctx.doc.touch()
    }
  },
}

export const viewupdateCommand: Command = {
  name: 'VIEWUPDATE',
  aliases: [],
  description: 'Update drawing views that are out of date with the model',
  async run(ctx) {
    const sel = await ctx.getSelectionOrKeyword('Select views to update or [All] <All>: ', ['All'])
    if (sel === null) return
    const ids = sel.kind === 'selection' && sel.ids.length ? sel.ids : null
    const n = ctx.app.updateDrawingViews?.(ids, ids !== null) ?? 0
    ctx.print(n ? `${n} view(s) updated.` : 'All views are up to date.')
  },
}

export const viewstdCommand: Command = {
  name: 'VIEWSTD',
  aliases: ['-VIEWSTD'],
  description: 'Drafting standard of drawing views: first-angle or third-angle projection',
  async run(ctx) {
    const cur = ctx.doc.vars.VIEWPROJECTION === 'first' ? 'First' : 'Third'
    const k = await askKeyword(ctx, `Projection type [First angle/Third angle] <${cur}>: `, ['First', 'Third'], cur)
    if (!k) return
    ctx.doc.setVar('VIEWPROJECTION', k === 'First' ? 'first' : 'third')
    ctx.print(`Projection type: ${k === 'First' ? 'first angle (ISO E)' : 'third angle (ISO A)'}.`)
  },
}

/**
 * Desde el modelo, las vistas de dibujo van a un layout (CAD clásico): se pide su nombre (uno nuevo se crea) y se
 * lo activa. Un layout que se arma recién para las vistas no lleva el viewport inicial, que las taparía. Con
 * `allowModel`, `Model` deja las vistas en el modelo. null = cancelado.
 */
async function toLayout(ctx: CommandContext, allowModel = false): Promise<'layout' | 'model' | null> {
  const def = ctx.doc.layouts[0]?.name ?? 'Layout1'
  const name = (await ctx.getString(`Enter new or existing layout name to make current${allowModel ? ' or [Model]' : ''} <${def}>: `, { default: def }))?.trim()
  if (!name) return null
  if (allowModel && /^m(odel)?$/i.test(name)) return 'model'
  const lay = ctx.doc.findLayoutByName(name) ?? ctx.doc.addLayout(name)
  const fresh = !lay.initialized
  activateTab(ctx.doc, lay.id, ctx.currentLayerId(), ctx.app.sheetInit())
  const vps = fresh ? lay.entities.filter((e) => e.type === 'VIEWPORT') : []
  if (vps.length === 1) ctx.doc.removeEntity(vps[0].id)
  ctx.app.redraw()
  return 'layout'
}

/**
 * VIEWGEN: todas las vistas de Monge de una pieza de una vez. Un diálogo muestra el esquema de las vistas para
 * elegir cuáles (y ISO-E o ISO-A); en un layout se crean vistas de dibujo asociadas (la base es el alzado y las
 * demás quedan alineadas con ella), en el modelo, bloques 2D con la proyección.
 */
export const viewgenCommand: Command = {
  name: 'VIEWGEN',
  aliases: [],
  description: 'Generate the Monge views of a part at once (choose them on a diagram, ISO-E or ISO-A)',
  async run(ctx) {
    const sel = await ctx.getSelectionOrKeyword('Select objects or [Entire model] <Entire model>: ', ['Entire'])
    if (sel === null) return
    const source = sel.kind === 'selection' && sel.ids.length ? sel.ids : null
    const choice = await ctx.app.viewGenDialog?.({ ...DEFAULT_VIEWGEN, std: ctx.doc.vars.VIEWPROJECTION === 'third' ? 'A' : 'E' })
    if (!choice) return
    // Desde el modelo: a un layout (como VIEWBASE), o `Model` para dejar los bloques 2D en el modelo.
    if (!ctx.doc.inPaperSpace && (await toLayout(ctx, true)) === null) return
    const paper = ctx.doc.inPaperSpace && ctx.doc.activeTab !== MODEL_TAB
    const views = [...new Set<GenView>(['FRONT', ...choice.views])]
    const hiddenOf = (v: GenView): HiddenMode => (ISO_VIEWS.includes(v) ? 'shadedVisible' : choice.hidden ? 'visibleHidden' : 'visible')
    // Cada vista, a escala 1, en su bloque (origen común: el centro de la pieza).
    const blocks = new Map<GenView, { block: string; w: number; h: number }>()
    for (const v of views) {
      const block = nextViewBlock(ctx)
      const size = buildView(ctx, block, source, viewBasis(v as ViewName), hiddenOf(v))
      if (!size) {
        if (v === 'FRONT') {
          ctx.print('No 3D solids to document.')
          return
        }
        continue
      }
      blocks.set(v, { block, w: size.width, h: size.height })
    }
    const size = (v: GenView) => blocks.get(v) ?? { w: 0, h: 0 }
    const front = size('FRONT')
    const gap = Math.max(front.w, front.h) * 0.25
    const placed = mongeLayout({ ...choice, views: [...blocks.keys()] }, size, gap)
    const ext = layoutExtent(placed, size)
    let scale = 1
    if (paper) {
      const layout = ctx.doc.activeLayout!
      const pp = paperSizeMm(layout.pageSetup)
      const land = layout.pageSetup.orientation === 'landscape'
      const [pw, ph] = land ? [Math.max(pp.width, pp.height), Math.min(pp.width, pp.height)] : [Math.min(pp.width, pp.height), Math.max(pp.width, pp.height)]
      scale = VIEW_SCALES.find((s) => ext.w * s <= pw * 0.85 && ext.h * s <= ph * 0.75) ?? VIEW_SCALES[VIEW_SCALES.length - 1]
      ctx.print(`Scale = ${scaleLabel(scale)}`)
    }
    const r = await ctx.getPoint('Specify center of the views: ', {
      base: null,
      preview: (c) => placed.flatMap((p) => frame({ x: c.x + (p.x - ext.cx) * scale, y: c.y + (p.y - ext.cy) * scale, z: 0 }, size(p.view).w * scale, size(p.view).h * scale)),
    })
    if (r.kind !== 'point') {
      for (const b of blocks.values()) ctx.doc.removeBlock(b.block)
      return
    }
    const at = (p: Placed): Pt => ({ x: r.point.x + (p.x - ext.cx) * scale, y: r.point.y + (p.y - ext.cy) * scale, z: 0 })
    const F = at(placed[0])
    let base: Entity | null = null
    for (const p of placed) {
      const b = blocks.get(p.view)!
      const pos = at(p)
      if (!paper) {
        // En el modelo: bloques 2D sin asociación (como FLATSHOT).
        ctx.doc.addEntity({ type: 'INSERT', layer: ctx.currentLayerId(), props: { name: b.block, position: [pos.x, pos.y, 0], scale: [1, 1, 1], rotation: 0 } })
        continue
      }
      const basis = viewBasis(p.view as ViewName)
      if (!base) base = addView(ctx, b.block, pos, scale, { orientation: 'FRONT', basis, hidden: hiddenOf(p.view), source })
      else
        addView(ctx, b.block, pos, scale, {
          orientation: 'projected',
          basis,
          hidden: hiddenOf(p.view),
          source,
          parent: base.id,
          align: p.align,
          offset: [pos.x - F.x, pos.y - F.y],
          lastParent: [F.x, F.y],
          inheritScale: true,
        })
    }
    ctx.doc.touch()
    ctx.print(`${placed.length} view(s) created (${choice.std === 'E' ? 'ISO-E, first-angle' : 'ISO-A, third-angle'}${paper ? `, ${scaleLabel(scale)}` : ''}).`)
  },
}

export const drawingViewCommands: Command[] = [viewbaseCommand, viewprojCommand, vieweditCommand, viewupdateCommand, viewstdCommand, viewgenCommand]
