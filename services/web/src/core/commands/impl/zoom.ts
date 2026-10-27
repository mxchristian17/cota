import { formatScale, parseScale } from '../../layout/scale'
import type { Pt, Vec3 } from '../../math'
import type { Entity } from '../../document/types'
import type { PreviewShape } from '../../preview'
import type { Command, CommandContext } from '../types'
import { askKeyword, askNumber, fmt } from '../ask'
import { sysvars } from '../sysvars'
import { entityOutline } from '../../editing/bounds'
import { expandEntities } from '../../editing/block'

/**
 * ZOOM completo, como el CAD clásico: ventana, factor (`n`, `nX`, `nXP`), `All`, `Center`, `Dynamic`,
 * `Extents`, `Previous`, `Scale`, `Window`, `Object` y, con Enter, el zoom en tiempo real.
 */

/** Factor de escala relativo al papel (`nXP`, `1/50xp`, `1:50xp`): sólo con un viewport de layout en MSPACE. */
const XP = /^\s*\d*[.,]?\d+\s*([:/]\s*\d*[.,]?\d+\s*)?xp\s*$/i
/** Factor relativo a los límites (`n`) o a la vista actual (`nX`). */
const NX = /^\s*(\d*[.,]?\d+)\s*(x)?\s*$/i
/** Cualquier factor que el prompt principal acepta tecleado. */
const FACTOR = new RegExp(`${XP.source}|${NX.source}`, 'i')

const DONE = '__done'
const REALTIME = '__realtime'

function zoomXp(ctx: CommandContext, text: string): void {
  const id = ctx.doc.msViewportId
  const e = id ? ctx.doc.getEntity(id) : undefined
  if (!e || e.type !== 'VIEWPORT') {
    ctx.print('nXP is only valid in model space through a layout viewport.')
    return
  }
  const scale = parseScale(text)
  if (!scale) return ctx.print('Invalid scale.')
  e.props.scale = scale // conserva el centro de la vista, como el CAD clásico
  ctx.doc.touch()
  ctx.print(`Viewport scale: ${formatScale(scale)}.`)
}

/** Alto de los límites (LIMITS), en unidades de dibujo. */
function limitsHeight(ctx: CommandContext): number {
  const v = ctx.doc.vars
  return Math.max(1e-9, v.LIMMAX[1] - v.LIMMIN[1])
}

/** Aplica un factor tecleado: `nXP` (papel), `nX` (vista actual) o `n` (límites). false si no es válido. */
function applyFactor(ctx: CommandContext, text: string): boolean {
  if (XP.test(text)) {
    zoomXp(ctx, text)
    return true
  }
  const m = NX.exec(text)
  const n = m ? Number(m[1].replace(',', '.')) : NaN
  if (!m || !(n > 0)) {
    ctx.print('Requires a positive number, nX or nXP.')
    return false
  }
  if (m[2]) ctx.app.zoomScale?.(n)
  else {
    const c = ctx.app.viewRect?.()?.center
    if (c) ctx.app.zoomCenter?.({ x: c[0], y: c[1], z: c[2] }, limitsHeight(ctx) / n)
  }
  return true
}

async function zoomWindowFlow(ctx: CommandContext, first: Pt): Promise<void> {
  const opp = await ctx.getPoint('Specify opposite corner: ', { base: first, corner: true })
  if (opp.kind === 'point') {
    ctx.app.zoomWindow(first, opp.point)
    ctx.print('Zoom window.')
  }
}

/** Zoom en tiempo real (ZOOM ↵) o pan en tiempo real (PAN): arrastrar con el botón izquierdo. */
export async function realtimeMode(ctx: CommandContext, mode: 'zoom' | 'pan'): Promise<void> {
  ctx.app.realtime?.(mode)
  try {
    await ctx.getString('Press ESC or ENTER to exit, or right-click to display shortcut menu.', { default: '' })
  } finally {
    ctx.app.realtime?.(null)
  }
}

/** Caja de las entidades (con las inserciones expandidas), para ZOOM Object. */
export function entitiesBox(entities: Entity[], blocks: Parameters<typeof expandEntities>[1]): { min: Vec3; max: Vec3 } | null {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const e of expandEntities(entities, blocks)) {
    for (const poly of entityOutline(e)) {
      for (const p of poly) {
        const q = [p.x, p.y, p.z]
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], q[i])
          max[i] = Math.max(max[i], q[i])
        }
      }
    }
  }
  return isFinite(min[0]) ? { min, max } : null
}

/** ZOOM All: los límites y la extensión (en planta); en 3D, la extensión. */
function zoomAll(ctx: CommandContext): void {
  const ext = ctx.app.extentsBox?.() ?? null
  const v = ctx.doc.vars
  const plan = ctx.app.isPlanView?.() ?? true
  if (!plan || ctx.doc.inPaperSpace) {
    ctx.app.zoomExtents()
    return
  }
  const min: Vec3 = [v.LIMMIN[0], v.LIMMIN[1], 0]
  const max: Vec3 = [v.LIMMAX[0], v.LIMMAX[1], 0]
  if (ext) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], ext.min[i])
      max[i] = Math.max(max[i], ext.max[i])
    }
  }
  ctx.app.zoomBox?.(min, max)
}

/** ZOOM Center: centro y alto (o `nX`/`nXP`). */
async function zoomCenter(ctx: CommandContext): Promise<void> {
  const c = await ctx.getPoint('Specify center point: ', { base: null })
  if (c.kind !== 'point') return
  const cur = ctx.app.viewHeight?.() ?? 0
  for (;;) {
    const s = await ctx.getString(`Enter magnification or height <${fmt(cur)}>: `, { default: fmt(cur) })
    if (s === null) return
    if (XP.test(s)) {
      ctx.app.zoomCenter?.(c.point, cur)
      zoomXp(ctx, s)
      return
    }
    const m = NX.exec(s)
    const n = m ? Number(m[1].replace(',', '.')) : NaN
    if (!m || !(n > 0)) {
      ctx.print('Requires a positive number, nX or nXP.')
      continue
    }
    ctx.app.zoomCenter?.(c.point, m[2] ? cur / n : n)
    return
  }
}

/**
 * ZOOM Dynamic: se ve todo el dibujo con un recuadro del tamaño de la vista. El recuadro sigue al cursor;
 * un clic alterna entre moverlo y redimensionarlo (el borde izquierdo queda fijo); Enter hace zoom a él.
 */
async function zoomDynamic(ctx: CommandContext): Promise<void> {
  const vr = ctx.app.viewRect?.()
  const orig = ctx.app.getViewState?.()
  if (!vr || !orig) return
  const { center: o, right: R, up: U } = vr
  const aspect = vr.width / vr.height
  const at = (u: number, v: number): Vec3 => [0, 1, 2].map((i) => o[i] + R[i] * u + U[i] * v) as Vec3
  const uv = (p: Pt): [number, number] => {
    const d = [p.x - o[0], p.y - o[1], p.z - o[2]]
    return [d[0] * R[0] + d[1] * R[1] + d[2] * R[2], d[0] * U[0] + d[1] * U[1] + d[2] * U[2]]
  }
  // Todo el dibujo más la vista actual.
  const pts: Vec3[] = [at(-vr.width / 2, -vr.height / 2), at(vr.width / 2, vr.height / 2)]
  const ext = ctx.app.extentsBox?.()
  if (ext) pts.push(ext.min, ext.max)
  const lo = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i]))) as Vec3
  const hi = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i]))) as Vec3
  ctx.app.zoomBox?.(lo, hi)

  let cu = 0
  let cv = 0
  let w = vr.width
  let mode: 'move' | 'size' = 'move'
  let left = 0
  const minW = vr.width / 1000
  const follow = (p: Pt): void => {
    const [u, v] = uv(p)
    if (mode === 'move') {
      cu = u
      cv = v
    } else {
      w = Math.max(minW, u - left)
      cu = left + w / 2
    }
  }
  const box = (u: number, v: number, bw: number): PreviewShape => {
    const bh = bw / aspect
    const q = [at(u - bw / 2, v - bh / 2), at(u + bw / 2, v - bh / 2), at(u + bw / 2, v + bh / 2), at(u - bw / 2, v + bh / 2)]
    return { kind: 'polyline', points: [...q, q[0]].map((p) => ({ x: p[0], y: p[1], z: p[2] })) }
  }
  for (;;) {
    const r = await ctx.getPoint(mode === 'move' ? 'Move the view box, click to resize it, Enter to zoom: ' : 'Resize the view box, click to move it, Enter to zoom: ', {
      base: null,
      enterKeyword: DONE,
      preview: (c) => {
        follow(c)
        return [box(0, 0, vr.width), box(cu, cv, w)]
      },
    })
    if (r.kind === 'cancel') {
      ctx.app.restoreViewState?.(orig)
      return
    }
    if (r.kind === 'keyword') break
    follow(r.point)
    if (mode === 'move') {
      mode = 'size'
      left = cu - w / 2
    } else mode = 'move'
  }
  const c = at(cu, cv)
  ctx.app.zoomCenter?.({ x: c[0], y: c[1], z: c[2] }, w / aspect)
}

export const zoomCommand: Command = {
  name: 'ZOOM',
  aliases: ['Z'],
  description: 'Zoom: window, scale (n, nX, nXP), All/Center/Dynamic/Extents/Previous/Scale/Window/Object, Enter = real time',
  async run(ctx) {
    const keywords = ['All', 'Center', 'Dynamic', 'Extents', 'Previous', 'Scale', 'Window', 'Object']
    const r = await ctx.getPoint('Specify corner of window, enter a scale factor (nX or nXP), or [All/Center/Dynamic/Extents/Previous/Scale/Window/Object] <real time>: ', {
      base: null,
      keywords,
      textKeyword: FACTOR,
      enterKeyword: REALTIME,
    })
    if (r.kind === 'cancel') return
    if (r.kind === 'point') return zoomWindowFlow(ctx, r.point)
    const k = r.keyword
    if (k === REALTIME) return realtimeMode(ctx, 'zoom')
    if (FACTOR.test(k) && !keywords.includes(k)) {
      applyFactor(ctx, k)
      return
    }
    switch (k) {
      case 'All':
        return zoomAll(ctx)
      case 'Center':
        return zoomCenter(ctx)
      case 'Dynamic':
        return zoomDynamic(ctx)
      case 'Extents':
        ctx.app.zoomExtents()
        ctx.print('Zoom extents.')
        return
      case 'Previous':
        if (!ctx.app.zoomPrevious?.()) ctx.print('No previous view saved.')
        return
      case 'Scale': {
        for (;;) {
          const s = await ctx.getString('Enter a scale factor (nX or nXP): ')
          if (s === null || applyFactor(ctx, s)) return
        }
      }
      case 'Window': {
        const c1 = await ctx.getPoint('Specify first corner: ', { base: null })
        if (c1.kind === 'point') await zoomWindowFlow(ctx, c1.point)
        return
      }
      case 'Object': {
        const ids = await ctx.getSelection('Select objects: ')
        ctx.app.clearSelection()
        if (!ids?.length) return
        const box = entitiesBox(ids.map((id) => ctx.doc.getEntity(id)).filter((e): e is Entity => !!e), ctx.doc.blocks)
        if (box) ctx.app.zoomBox?.(box.min, box.max)
        return
      }
    }
  },
}

/** PAN: pan en tiempo real (arrastrar con el botón izquierdo). */
export const panCommand: Command = {
  name: 'PAN',
  aliases: ['P'],
  description: 'Real-time pan: drag with the left button (Esc or Enter to exit)',
  async run(ctx) {
    await realtimeMode(ctx, 'pan')
  },
}

/** -PAN: desplaza la vista por un desplazamiento o de un punto base a otro. */
export const dashPanCommand: Command = {
  name: '-PAN',
  aliases: ['-P'],
  description: 'Pan by a displacement or from a base point to a second point',
  async run(ctx) {
    const a = await ctx.getPoint('Specify base point or displacement: ', { base: null })
    if (a.kind !== 'point') return
    const b = await ctx.getPoint('Specify second point: ', { base: a.point, enterKeyword: DONE })
    if (b.kind === 'cancel') return
    // Enter: el primer punto es el desplazamiento.
    const d: Vec3 = b.kind === 'point' ? [b.point.x - a.point.x, b.point.y - a.point.y, b.point.z - a.point.z] : [a.point.x, a.point.y, a.point.z]
    ctx.app.panBy?.(d)
  },
}

/** LIMITS: límites del modelo (ZOOM All, `n` de ZOOM Scale) y su control con ON/OFF (LIMCHECK). */
export const limitsCommand: Command = {
  name: 'LIMITS',
  aliases: [],
  description: 'Set the drawing limits (lower left, upper right) and turn the limits check ON/OFF',
  async run(ctx) {
    ctx.print(ctx.doc.inPaperSpace ? 'Reset Paper space limits:' : 'Reset Model space limits:')
    const v = ctx.doc.vars
    const p2 = (p: [number, number]) => `${fmt(p[0])},${fmt(p[1])}`
    const r = await ctx.getPoint(`Specify lower left corner or [ON/OFF] <${p2(v.LIMMIN)}>: `, { base: null, keywords: ['ON', 'OFF'], enterKeyword: DONE })
    if (r.kind === 'cancel') return
    if (r.kind === 'keyword' && r.keyword !== DONE) {
      ctx.doc.setVar('LIMCHECK', r.keyword === 'ON' ? 1 : 0)
      return
    }
    const lo: [number, number] = r.kind === 'point' ? [r.point.x, r.point.y] : v.LIMMIN
    const q = await ctx.getPoint(`Specify upper right corner <${p2(v.LIMMAX)}>: `, { base: { x: lo[0], y: lo[1], z: 0 }, enterKeyword: DONE })
    if (q.kind === 'cancel') return
    const hi: [number, number] = q.kind === 'point' ? [q.point.x, q.point.y] : v.LIMMAX
    if (hi[0] <= lo[0] || hi[1] <= lo[1]) {
      ctx.print('Invalid limits.')
      return
    }
    ctx.doc.setVar('LIMMIN', lo)
    ctx.doc.setVar('LIMMAX', hi)
  },
}

/** ZOOMFACTOR y ZOOMWHEEL (sesión, como el registro del CAD clásico). */
export const zoomVarCommands: Command[] = [
  {
    name: 'ZOOMFACTOR',
    aliases: [],
    description: 'Mouse wheel zoom step (3–100)',
    async run(ctx) {
      const r = await askNumber(ctx, `Enter new value for ZOOMFACTOR <${sysvars.ZOOMFACTOR}>: `, {
        def: sysvars.ZOOMFACTOR,
        check: (v) => (Number.isInteger(v) && v >= 3 && v <= 100 ? null : 'Requires an integer between 3 and 100.'),
      })
      if (r?.kind === 'number') sysvars.ZOOMFACTOR = r.value
    },
  },
  {
    name: 'RENDERMINPX',
    aliases: [],
    description: 'Draw solids smaller than this many pixels as a point (0 = off)',
    async run(ctx) {
      const r = await askNumber(ctx, `Enter new value for RENDERMINPX <${sysvars.RENDERMINPX}>: `, {
        def: sysvars.RENDERMINPX,
        check: (v) => (v >= 0 && v <= 50 ? null : 'Requires a value between 0 and 50.'),
      })
      if (r?.kind === 'number') {
        sysvars.RENDERMINPX = r.value
        ctx.app.redraw()
      }
    },
  },
  {
    name: 'ZOOMWHEEL',
    aliases: [],
    description: 'Mouse wheel direction: 0 = forward zooms in, 1 = forward zooms out',
    async run(ctx) {
      const k = await askKeyword(ctx, `Enter new value for ZOOMWHEEL <${sysvars.ZOOMWHEEL}>: `, ['0', '1'], String(sysvars.ZOOMWHEEL))
      if (k) sysvars.ZOOMWHEEL = k === '1' ? 1 : 0
    },
  },
]
