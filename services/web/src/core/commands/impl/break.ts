import { commonOf } from '../../document/common'
import type { Pt } from '../../math'
import type { EntityInput } from '../../document/types'
import type { Command, CommandContext } from '../types'
import { breakCurve } from '../../editing/breakCurve'
import { pickCurve, ptVec, type CurvePick } from '../../editing/pickCurve'

/** Aplica el corte entre `p1` y `p2` (iguales = partir sin quitar) y reemplaza la entidad. */
function applyBreak(ctx: CommandContext, pk: CurvePick, p1: Pt, p2: Pt): void {
  const t1 = pk.curve.paramAt(ptVec(p1))
  const t2 = pk.curve.paramAt(ptVec(p2))
  const pieces = breakCurve(pk.curve, t1, t2)
  if (!pieces) {
    ctx.print('Arc cannot be full 360 degrees.')
    return
  }
  const inputs = pieces.map((c) => c.toEntity()).filter((x) => x !== null)
  for (const inp of inputs) ctx.doc.addEntity({ ...inp, layer: pk.entity.layer, ...commonOf(pk.entity) } as EntityInput)
  ctx.doc.removeEntity(pk.entity.id)
  ctx.doc.touch()
}

async function selectObject(ctx: CommandContext): Promise<{ pk: CurvePick; point: Pt } | null> {
  ctx.app.clearSelection()
  for (;;) {
    const r = await ctx.getPoint('Select object: ')
    if (r.kind !== 'point') return null
    const pk = pickCurve(ctx.doc, r.point, r.pick)
    if (pk) {
      ctx.markPicked([pk.entity.id])
      return { pk, point: r.point }
    }
    ctx.print('No object found.')
  }
}

/**
 * BREAK: quita el tramo entre dos puntos de una curva. El punto de selección es el primer
 * punto (salvo `First point`); `@` como segundo punto corta sin quitar material. En curvas cerradas
 * se quita el tramo antihorario del primer al segundo punto; un círculo partido queda como arco.
 */
export const breakCommand: Command = {
  name: 'BREAK',
  planar: true,
  aliases: ['BR'],
  description: 'Break the selected object between two points',
  async run(ctx) {
    const sel = await selectObject(ctx)
    if (!sel) return
    let p1 = sel.point
    let r = await ctx.getPoint('Specify second break point or [First point]: ', { keywords: ['First'], base: p1 })
    if (r.kind === 'keyword') {
      const f = await ctx.getPoint('Specify first break point: ')
      if (f.kind !== 'point') return
      p1 = f.point
      r = await ctx.getPoint('Specify second break point: ', { base: p1 })
    }
    if (r.kind !== 'point') return
    applyBreak(ctx, sel.pk, p1, r.point)
  },
}

/** BREAKATPOINT: parte una curva en un punto sin quitar material. */
export const breakAtPointCommand: Command = {
  name: 'BREAKATPOINT',
  aliases: [],
  description: 'Break the selected object at a single point',
  async run(ctx) {
    const sel = await selectObject(ctx)
    if (!sel) return
    const r = await ctx.getPoint('Specify break point: ')
    if (r.kind !== 'point') return
    applyBreak(ctx, sel.pk, r.point, r.point)
  },
}
