import { toVec3, type Pt } from '../../math'
import type { Command } from '../types'

export const splineCommand: Command = {
  name: 'SPLINE',
  aliases: ['SPL'],
  description: 'Draw a spline through control points',
  async run(ctx) {
    const first = await ctx.getPoint('Specify first point: ')
    if (first.kind !== 'point') return
    const pts: Pt[] = [first.point]

    for (;;) {
      const prev = pts[pts.length - 1]
      const r = await ctx.getPoint('Specify next point or [Undo] (Enter to finish): ', {
        base: prev,
        keywords: ['Undo'],
        // Igual que PLINE: se muestran los puntos de control ya fijados y el tramo en curso.
        preview: (c) => [{ kind: 'polyline', points: [...pts, c] }],
      })
      if (r.kind === 'cancel') break
      if (r.kind === 'keyword') {
        if (pts.length > 1) pts.pop()
        continue
      }
      pts.push(r.point)
    }

    if (pts.length < 2) return
    ctx.doc.addEntity({
      type: 'SPLINE',
      layer: ctx.currentLayerId(),
      props: { controlPoints: pts.map(toVec3), degree: 3 },
    })
  },
}
