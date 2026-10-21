import { commonOf } from '../../document/common'
import type { Entity, EntityInput } from '../../document/types'
import type { Command, CommandContext } from '../types'
import { closeCurve, joinEntities } from '../../editing/join'
import { pickCurve } from '../../editing/pickCurve'

const isArc = (e: Entity): boolean => e.type === 'ARC' || (e.type === 'ELLIPSE' && e.props.startParam !== undefined)

/** Con un arco como origen: `Select arcs to join to source or [cLose]:` (click a click, Enter termina). */
async function arcsToJoin(ctx: CommandContext, src: Entity): Promise<string[] | 'close' | null> {
  const ids: string[] = []
  for (;;) {
    const r = await ctx.getPoint('Select arcs to join to source or [cLose]: ', { keywords: ['cLose'] })
    if (r.kind === 'cancel') return ids.length ? ids : null
    if (r.kind === 'keyword') return 'close'
    const pk = pickCurve(ctx.doc, r.point, r.pick, (e) => e.id !== src.id && !ids.includes(e.id))
    if (pk) ids.push(pk.entity.id)
  }
}

function replace(ctx: CommandContext, ids: string[], result: Omit<EntityInput, 'layer'>): void {
  const first = ctx.doc.getEntity(ids[0])
  const layer = first?.layer ?? ctx.currentLayerId()
  ctx.doc.addEntity({ ...result, layer, ...(first ? commonOf(first) : {}) } as EntityInput)
  for (const id of ids) ctx.doc.removeEntity(id)
  ctx.doc.touch()
}

/**
 * JOIN: une líneas colineales, arcos del mismo círculo (con `cLose` → círculo), arcos de
 * elipse, polilíneas y splines contiguas, en `LINE`, `ARC`, `CIRCLE`, `POLYLINE` o `SPLINE`.
 */
export const joinCommand: Command = {
  name: 'JOIN',
  planar: true,
  aliases: ['J'],
  description: 'Join lines, arcs, polylines and splines into a single object',
  async run(ctx) {
    const sel = await ctx.getSelection('Select source object or multiple objects to join at once: ')
    if (!sel?.length) return
    ctx.app.clearSelection()
    let ids = sel
    if (sel.length === 1) {
      const src = ctx.doc.getEntity(sel[0])
      if (!src) return
      if (isArc(src)) {
        const more = await arcsToJoin(ctx, src)
        if (more === null) return
        if (more === 'close') {
          const closed = closeCurve(src)
          if (closed) replace(ctx, [src.id], closed)
          ctx.print(closed ? `1 ${src.type === 'ARC' ? 'arc' : 'elliptical arc'} converted to 1 ${src.type === 'ARC' ? 'circle' : 'ellipse'}.` : 'Object cannot be closed.')
          return
        }
        ids = [src.id, ...more]
      } else {
        const more = await ctx.getSelection('Select objects to join: ')
        ctx.app.clearSelection()
        if (!more?.length) return
        ids = [src.id, ...more.filter((id) => id !== src.id)]
      }
    }
    const groups = joinEntities(ids.map((id) => ctx.doc.getEntity(id)).filter((e): e is Entity => !!e))
    for (const g of groups) replace(ctx, g.ids, g.result)
    const joined = groups.reduce((n, g) => n + g.ids.length, 0)
    if (!groups.length) ctx.print('0 objects joined.')
    else if (groups.length === 1) ctx.print(`${joined} objects joined into 1 ${groups[0].result.type.toLowerCase()}.`)
    else ctx.print(`${joined} objects joined into ${groups.length} objects.`)
  },
}
