import { dist2d, fromVec3, toVec3, type Pt, type Vec3 } from '../../math'
import { resolveDeferredLine, type Deferred } from '../../geom/tangency'
import type { Command, CommandContext } from '../types'

/**
 * Primer punto diferido (*Deferred Tangent/Perpendicular*): el segundo punto —o una segunda
 * tangente diferida— fija la línea. La vista previa ya la muestra tangente mientras se mueve el cursor.
 */
async function deferredSegment(ctx: CommandContext, def: Deferred): Promise<[Vec3, Vec3] | null> {
  for (;;) {
    const r = await ctx.getPoint('Specify next point: ', {
      base: null,
      preview: (cursor) => {
        const seg = resolveDeferredLine(def, toVec3(cursor))
        return seg ? [{ kind: 'line', a: fromVec3(seg[0]), b: cursor }] : []
      },
    })
    if (r.kind !== 'point') return null
    const seg = resolveDeferredLine(def, r.pick?.deferred ?? toVec3(r.point))
    if (seg) return seg
    ctx.print(def.kind === 'tangent' ? 'No tangent can be drawn from that point.' : 'No perpendicular from that point.')
  }
}

export const lineCommand: Command = {
  name: 'LINE',
  aliases: ['L'],
  description: 'Draw connected line segments (closing converts them to a closed polyline)',
  async run(ctx) {
    const first = await ctx.getPoint('Specify first point: ')
    if (first.kind !== 'point') return

    const points: Pt[] = [first.point]
    const created: string[] = [] // ids de los segmentos LINE ya dibujados (se ven al instante)
    if (first.pick?.deferred) {
      const seg = await deferredSegment(ctx, first.pick.deferred)
      if (!seg) return
      created.push(ctx.doc.addEntity({ type: 'LINE', layer: ctx.currentLayerId(), props: { start: seg[0], end: seg[1] } }).id)
      points.splice(0, 1, fromVec3(seg[0]), fromVec3(seg[1]))
    }

    /** Reemplaza los segmentos LINE sueltos por una única POLYLINE cerrada. */
    const closeAsPolyline = () => {
      if (points.length < 2) return
      for (const id of created) ctx.doc.removeEntity(id)
      created.length = 0
      ctx.doc.addEntity({
        type: 'POLYLINE',
        layer: ctx.currentLayerId(),
        props: { vertices: points.map(toVec3), closed: true },
      })
    }

    for (;;) {
      const prev = points[points.length - 1]
      const r = await ctx.getPoint('Specify next point or [Close/Undo]: ', {
        base: prev,
        keywords: ['Close', 'Undo'],
        preview: (cursor) => [{ kind: 'line', a: prev, b: cursor }],
      })

      if (r.kind === 'cancel') return // Enter/Esc: termina la cadena abierta (segmentos LINE)

      if (r.kind === 'keyword') {
        if (r.keyword === 'Close') {
          closeAsPolyline()
          return
        }
        // Undo: quita el último segmento dibujado.
        if (created.length > 0) {
          ctx.doc.removeEntity(created.pop()!)
          points.pop()
        } else {
          ctx.print('Nothing to undo.')
        }
        continue
      }

      // Clic sobre el primer punto (loop cerrado) → convertir a polilínea cerrada.
      if (points.length >= 2 && dist2d(r.point, points[0]) < 1e-6) {
        closeAsPolyline()
        return
      }

      const ent = ctx.doc.addEntity({
        type: 'LINE',
        layer: ctx.currentLayerId(),
        props: { start: toVec3(prev), end: toVec3(r.point) },
      })
      created.push(ent.id)
      points.push(r.point)
    }
  },
}
