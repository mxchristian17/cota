import { toVec3, type Pt } from '../../math'
import type { Entity } from '../../document/types'
import { entityPreviewShapes } from '../../editing/entityPreview'
import { addTransformed, applyTransform, mirrorAxis, mirrorTransform } from '../../editing/transform'
import type { PreviewShape } from '../../preview'
import type { Command, CommandContext } from '../types'

/** Fantasma de la selección reflejada + el eje de espejo. */
function mirrorPreview(ctx: CommandContext, ids: string[], first: Pt, cursor: Pt): PreviewShape[] {
  const shapes: PreviewShape[] = [{ kind: 'line', a: first, b: cursor }]
  const ax = mirrorAxis(toVec3(first), toVec3(cursor))
  if (!ax) return shapes
  const fn = mirrorTransform(ax)
  for (const id of ids) {
    const e = ctx.doc.getEntity(id)
    if (!e) continue
    const input = fn(e)
    if (input) shapes.push(...entityPreviewShapes({ ...input, id: e.id } as Entity, 0, 0, 0))
  }
  return shapes
}

export const mirrorCommand: Command = {
  name: 'MIRROR',
  planar: true,
  aliases: ['MI'],
  description: 'Mirror selected objects about an axis defined by two points',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (ids === null || ids.length === 0) return
    const p1 = await ctx.getPoint('Specify first point of mirror line: ')
    if (p1.kind !== 'point') return
    const p2 = await ctx.getPoint('Specify second point of mirror line: ', {
      base: p1.point,
      preview: (c) => mirrorPreview(ctx, ids, p1.point, c),
    })
    if (p2.kind !== 'point') return

    const ax = mirrorAxis(toVec3(p1.point), toVec3(p2.point))
    if (!ax) {
      ctx.print('The two points are the same: no mirror axis.')
      return
    }
    const erase = await ctx.getString('Erase source objects? [Yes/No] <N>: ', { default: 'N' })
    if (erase === null) return
    const eraseSource = /^y/i.test(erase.trim())

    const fn = mirrorTransform(ax)
    const res = eraseSource ? applyTransform(ctx.doc, ids, fn) : addTransformed(ctx.doc, ids, fn)
    if (res.skipped > 0) {
      ctx.print(`${res.skipped} solid(s) skipped: an axis-aligned BOX cannot be mirrored about an oblique axis.`)
    }
    ctx.print(`Mirrored ${res.ids.length} object(s)${eraseSource ? ' (source erased)' : ''}.`)
  },
}
