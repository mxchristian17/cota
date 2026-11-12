import type { NoteColor } from '../../document/types'
import { NOTE_COLOR_NAMES } from '../../geom/note'
import { askKeyword } from '../ask'
import { rectPolygon } from '../selectionSets'
import type { Command } from '../types'

let lastColor: NoteColor = 'yellow'

/**
 * NOTE: pega una nota rápida como un RECTANG, sobre la UCS de trabajo (o, con la UCS dinámica, sobre la cara de un
 * sólido). Sólo se guarda en `.cota`. Doble clic edita su texto, la cruz la cierra, la esquina inferior derecha la
 * agranda y los demás grips sacan un leader.
 */
export const noteCommand: Command = {
  name: 'NOTE',
  aliases: ['STICKY'],
  planar: true,
  description: 'Paste a sticky note on the drawing (kept only in .cota files)',
  async run(ctx) {
    let a
    for (;;) {
      a = await ctx.getPoint(`Specify first corner or [Color] <${lastColor}>: `, { keywords: ['Color'], base: null })
      if (a.kind !== 'keyword') break
      const k = await askKeyword(ctx, `Note color [${NOTE_COLOR_NAMES.join('/')}] <${lastColor}>: `, NOTE_COLOR_NAMES, lastColor)
      if (k) lastColor = k as NoteColor
    }
    if (a.kind !== 'point') return
    const p0 = a.point
    const b = await ctx.getPoint('Specify opposite corner: ', {
      base: p0,
      corner: true,
      preview: (c) => [{ kind: 'polyline', points: [...rectPolygon(p0, c), p0] }],
    })
    if (b.kind !== 'point') return
    const w = Math.abs(b.point.x - p0.x)
    const h = Math.abs(b.point.y - p0.y)
    if (!(w > 0) || !(h > 0)) {
      ctx.print('The note needs a width and a height.')
      return
    }
    const text = (await ctx.getString('Note text (double-click the note later to edit it): ')) ?? ''
    ctx.doc.addEntity({
      type: 'NOTE',
      layer: ctx.currentLayerId(),
      props: { origin: [Math.min(p0.x, b.point.x), Math.min(p0.y, b.point.y), p0.z], u: [1, 0, 0], v: [0, 1, 0], size: [w, h], text, color: lastColor },
    })
    ctx.print('Note pasted. Double-click it to edit the text; drag a grip on its edge to point a leader.')
  },
}
