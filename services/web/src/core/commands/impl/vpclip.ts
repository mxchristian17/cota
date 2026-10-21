import type { ViewportEntity } from '../../document/types'
import { layoutViewports, viewportAt } from '../../layout/layouts'
import { setViewportClip } from '../../layout/viewport'
import { matchKeyword } from '../keywords'
import type { Command, CommandContext } from '../types'
import { askPolygon, closedRing, ensurePaperSpace } from './mview'

/** Viewport indicado con un clic sobre su borde o su interior. */
export async function pickViewport(ctx: CommandContext, prompt: string): Promise<ViewportEntity | null> {
  const r = await ctx.getPoint(prompt)
  if (r.kind !== 'point') return null
  const picked = r.pick?.id ? ctx.doc.getEntity(r.pick.id) : undefined
  const id = picked?.type === 'VIEWPORT' ? picked.id : viewportAt(ctx.doc, r.point.x, r.point.y)
  const vp = layoutViewports(ctx.doc).find((v) => v.id === id) ?? null
  if (!vp) ctx.print('No viewport found at that point.')
  return vp
}

/** VPCLIP: recorta un viewport con un objeto cerrado o un polígono, o quita el recorte. */
export const vpclipCommand: Command = {
  name: 'VPCLIP',
  aliases: [],
  description: 'Clip a layout viewport with a closed object or polygon [Polygonal/Delete]',
  async run(ctx) {
    if (!ensurePaperSpace(ctx)) return
    const vp = await pickViewport(ctx, 'Select viewport to clip: ')
    if (!vp) return
    const opts = vp.props.clip ? ['Polygonal', 'Delete'] : ['Polygonal']
    const r = await ctx.getPoint(`Select clipping object or [${opts.join('/')}] <Polygonal>: `, {
      keywords: opts,
      enterKeyword: 'Polygonal',
    })
    if (r.kind === 'cancel') return
    if (r.kind === 'keyword' && matchKeyword(r.keyword, ['Delete']) === 'Delete') {
      setViewportClip(vp.props, null, ctx.doc.units)
      ctx.doc.touch()
      return
    }
    if (r.kind === 'keyword') {
      const ring = await askPolygon(ctx)
      if (!ring) return
      setViewportClip(vp.props, ring, ctx.doc.units)
      ctx.doc.touch()
      return
    }
    const id = r.pick?.id ?? null
    const ring = id === vp.id ? null : closedRing(ctx, id)
    if (!ring) return ctx.print(id ? 'The object must be closed.' : 'No object selected.')
    setViewportClip(vp.props, ring, ctx.doc.units)
    ctx.doc.removeEntity(id!) // el objeto pasa a ser el contorno del viewport, como en MVIEW Object
  },
}
