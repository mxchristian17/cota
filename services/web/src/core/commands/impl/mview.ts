import { pt, type Pt } from '../../math'
import type { PreviewShape } from '../../preview'
import type { ShadePlot, ViewportEntity } from '../../document/types'
import type { ViewName } from '../../view'
import { entityOutline } from '../../editing/bounds'
import { printableArea } from '../../layout/paper'
import { addClippedViewport, addViewport, splitBox, type Arrangement, type PaperBox } from '../../layout/layouts'
import { matchKeyword } from '../keywords'
import type { Command, CommandContext } from '../types'

const KEYWORDS = ['ON', 'OFF', 'Fit', 'Shadeplot', 'Lock', 'Object', 'Polygonal', '2', '3', '4']

function boxPreview(a: Pt, b: Pt): PreviewShape[] {
  const c = [pt(a.x, a.y), pt(b.x, a.y), pt(b.x, b.y), pt(a.x, b.y)]
  return c.map((p, i) => ({ kind: 'line' as const, a: p, b: c[(i + 1) % 4] }))
}

const boxOf = (a: Pt, b: Pt): PaperBox => ({
  minX: Math.min(a.x, b.x),
  minY: Math.min(a.y, b.y),
  maxX: Math.max(a.x, b.x),
  maxY: Math.max(a.y, b.y),
})

/**
 * Los viewports flotantes viven en el papel: en Model el comando no aplica (como el CAD clásico) y desde
 * MSPACE se vuelve al papel antes de seguir.
 */
export function ensurePaperSpace(ctx: CommandContext): boolean {
  if (!ctx.doc.activeLayout) {
    ctx.print('** Command not allowed in Model Tab **')
    return false
  }
  if (ctx.doc.msViewportId) {
    ctx.doc.setMsViewport(null)
    ctx.app.clearSelection()
  }
  return true
}

/** Caja donde ubicar viewports: `Specify first corner or [Fit] <Fit>` (Fit = área imprimible). */
export async function askBox(ctx: CommandContext, prompt = 'Specify first corner or [Fit] <Fit>: '): Promise<PaperBox | null> {
  const r = await ctx.getPoint(prompt, { keywords: ['Fit'], enterKeyword: 'Fit' })
  if (r.kind === 'cancel') return null
  if (r.kind === 'keyword') return printableArea(ctx.doc.activeLayout!.pageSetup)
  return askOpposite(ctx, r.point)
}

async function askOpposite(ctx: CommandContext, a: Pt): Promise<PaperBox | null> {
  const r = await ctx.getPoint('Specify opposite corner: ', { base: a, preview: (c) => boxPreview(a, c) })
  if (r.kind !== 'point') return null
  const box = boxOf(a, r.point)
  if (box.maxX - box.minX < 1e-6 || box.maxY - box.minY < 1e-6) {
    ctx.print('Invalid viewport (zero size).')
    return null
  }
  return box
}

/** Crea los viewports que dividen `box` (con las vistas indicadas, o todos en planta). */
export function placeViewports(ctx: CommandContext, box: PaperBox, n: number, arr: Arrangement, views?: ViewName[]): ViewportEntity[] {
  return splitBox(box, n, arr).map((b, i) =>
    addViewport(ctx.doc, [b.minX, b.minY], [b.maxX, b.maxY], ctx.currentLayerId(), views?.[i] ?? 'TOP'),
  )
}

/** Disposición de MVIEW 2/3 (`Vertical` y `Right` por defecto); null si la opción no es válida. */
export async function askArrangement(ctx: CommandContext, n: number): Promise<Arrangement | null> {
  if (n !== 2 && n !== 3) return 'Vertical'
  const opts: Arrangement[] = n === 2 ? ['Horizontal', 'Vertical'] : ['Horizontal', 'Vertical', 'Above', 'Below', 'Left', 'Right']
  const def = n === 2 ? 'Vertical' : 'Right'
  const text = await ctx.getString(`Enter viewport arrangement [${opts.join('/')}] <${def}>: `, { default: '' })
  if (text === null) return null
  if (!text.trim()) return def
  const k = matchKeyword(text, opts) as Arrangement | null
  if (!k) ctx.print('Invalid option.')
  return k
}

/** Viewports entre los objetos seleccionados (los demás se ignoran). */
async function pickViewports(ctx: CommandContext): Promise<ViewportEntity[]> {
  const ids = await ctx.getSelection('Select objects: ')
  if (!ids) return []
  const vps = ids.map((id) => ctx.doc.getEntity(id)).filter((e): e is ViewportEntity => e?.type === 'VIEWPORT')
  ctx.print(`${vps.length} viewport(s) found.`)
  return vps
}

/** Aplica un cambio a los viewports elegidos y marca el documento (un paso de undo). */
async function editViewports(ctx: CommandContext, fn: (v: ViewportEntity) => void): Promise<void> {
  const vps = await pickViewports(ctx)
  if (!vps.length) return
  vps.forEach(fn)
  ctx.doc.touch()
}

/** Contorno cerrado de un objeto del papel (círculo, elipse, rectángulo, polilínea cerrada…), sin repetir el cierre. */
export function closedRing(ctx: CommandContext, id: string | null): [number, number][] | null {
  const e = id ? ctx.doc.getEntity(id) : undefined
  if (!e || e.type === 'VIEWPORT') return null
  const [poly] = entityOutline(e)
  if (!poly || poly.length < 4) return null
  const a = poly[0]
  const b = poly[poly.length - 1]
  if (Math.hypot(a.x - b.x, a.y - b.y) > 1e-6 * (1 + Math.hypot(a.x, a.y))) return null
  return poly.slice(0, -1).map((p) => [p.x, p.y])
}

/** Polígono de recorte por puntos (`[Close/Undo]`, Enter cierra). null si se cancela o tiene < 3 puntos. */
export async function askPolygon(ctx: CommandContext): Promise<[number, number][] | null> {
  const first = await ctx.getPoint('Specify start point: ')
  if (first.kind !== 'point') return null
  const pts: Pt[] = [first.point]
  for (;;) {
    const last = pts[pts.length - 1]
    const r = await ctx.getPoint(pts.length >= 3 ? 'Specify next point or [Close/Undo]: ' : 'Specify next point or [Undo]: ', {
      base: last,
      keywords: ['Close', 'Undo'],
      enterKeyword: 'Close',
      preview: (c) => {
        const ring = [...pts, c, pts[0]]
        return ring.slice(1).map((b, i) => ({ kind: 'line' as const, a: ring[i], b }))
      },
    })
    if (r.kind === 'cancel') return null
    if (r.kind === 'point') {
      pts.push(r.point)
      continue
    }
    if (r.keyword === 'Undo') {
      if (pts.length > 1) pts.pop()
      continue
    }
    if (pts.length < 3) {
      ctx.print('A clipping boundary needs at least 3 points.')
      return null
    }
    return pts.map((p) => [p.x, p.y])
  }
}

/** MVIEW (MV): crea y controla viewports flotantes del layout. */
export const mviewCommand: Command = {
  name: 'MVIEW',
  aliases: ['MV'],
  description: 'Create layout viewports [ON/OFF/Fit/Shadeplot/Lock/Object/Polygonal/2/3/4]',
  async run(ctx) {
    if (!ensurePaperSpace(ctx)) return
    const r = await ctx.getPoint(`Specify corner of viewport or [${KEYWORDS.join('/')}] <Fit>: `, {
      keywords: KEYWORDS,
      enterKeyword: 'Fit',
    })
    if (r.kind === 'cancel') return
    const layer = ctx.currentLayerId()
    if (r.kind === 'point') {
      const box = await askOpposite(ctx, r.point)
      if (box) addViewport(ctx.doc, [box.minX, box.minY], [box.maxX, box.maxY], layer)
      return
    }
    switch (r.keyword) {
      case 'Fit': {
        const a = printableArea(ctx.doc.activeLayout!.pageSetup)
        addViewport(ctx.doc, [a.minX, a.minY], [a.maxX, a.maxY], layer)
        return
      }
      case 'ON':
      case 'OFF': {
        const on = r.keyword === 'ON'
        await editViewports(ctx, (v) => (v.props.on = on))
        return
      }
      case 'Lock': {
        const text = await ctx.getString('Viewport View Locking [ON/OFF]: ')
        const k = text === null ? null : matchKeyword(text, ['ON', 'OFF'])
        if (!k) return
        await editViewports(ctx, (v) => (v.props.locked = k === 'ON'))
        return
      }
      case 'Shadeplot': {
        const opts = ['As displayed', 'Wireframe', 'Hidden']
        const text = await ctx.getString(`Shade plot? [${opts.join('/')}] <As displayed>: `, { default: '' })
        if (text === null) return
        const k = text.trim() ? matchKeyword(text, opts) : 'As displayed'
        if (!k) return ctx.print('Invalid option.')
        const mode: ShadePlot = k === 'Wireframe' ? 'wireframe' : k === 'Hidden' ? 'hidden' : 'asDisplayed'
        await editViewports(ctx, (v) => (v.props.shadePlot = mode))
        return
      }
      case 'Object': {
        const p = await ctx.getPoint('Select object to clip viewport: ')
        if (p.kind !== 'point') return
        const id = p.pick?.id ?? null
        const ring = closedRing(ctx, id)
        if (!ring) return ctx.print(id ? 'The object must be closed.' : 'No object selected.')
        addClippedViewport(ctx.doc, ring, layer)
        ctx.doc.removeEntity(id!) // el objeto pasa a ser el contorno del viewport
        return
      }
      case 'Polygonal': {
        const ring = await askPolygon(ctx)
        if (ring) addClippedViewport(ctx.doc, ring, layer)
        return
      }
      default: {
        const n = Number(r.keyword)
        const arr = await askArrangement(ctx, n)
        if (!arr) return
        const box = await askBox(ctx)
        if (box) placeViewports(ctx, box, n, arr)
      }
    }
  },
}
