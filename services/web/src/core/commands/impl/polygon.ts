import { toVec3, type Pt, type Vec3 } from '../../math'
import { bottomEdgeAngle, polygonFromEdge, regularPolygon } from '../../geom/polygon'
import type { PreviewShape } from '../../preview'
import { askDistance, fmtShort } from '../ask'
import { recall, remember } from '../memory'
import type { Command, CommandContext } from '../types'

const asPt = (v: Vec3): Pt => ({ x: v[0], y: v[1], z: v[2] })
const ring = (pts: Vec3[]): PreviewShape[] => [{ kind: 'polyline', points: [...pts, pts[0]].map(asPt) }]
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/

function addPolygon(ctx: CommandContext, pts: Vec3[]): void {
  ctx.doc.addEntity({ type: 'POLYLINE', layer: ctx.currentLayerId(), props: { vertices: pts, closed: true } })
}

/**
 * POLYGON: polígono regular como polilínea cerrada, con los prompts del CAD clásico. `POLYSIDES` y
 * el modo inscrito/circunscrito se recuerdan (Enter los repite).
 */
export const polygonCommand: Command = {
  name: 'POLYGON',
  planar: true,
  aliases: ['POL'],
  description: 'Draw a regular polygon (center + inscribed/circumscribed radius, or Edge)',
  async run(ctx) {
    const sides = await askDistance(ctx, 'POLYSIDES', 'Enter number of sides', {
      base: { x: 0, y: 0, z: 0 },
      initial: 4,
      format: fmtShort,
      valid: (v) => Number.isInteger(v) && v >= 3 && v <= 1024,
    })
    if (sides.kind !== 'distance') return
    const n = sides.value
    if (!Number.isInteger(n) || n < 3 || n > 1024) {
      ctx.print('Requires an integer between 3 and 1024.')
      return
    }
    const c = await ctx.getPoint('Specify center of polygon or [Edge]: ', { keywords: ['Edge'] })
    if (c.kind === 'cancel') return
    if (c.kind === 'keyword') {
      const a = await ctx.getPoint('Specify first endpoint of edge: ')
      if (a.kind !== 'point') return
      const av = toVec3(a.point)
      const b = await ctx.getPoint('Specify second endpoint of edge: ', {
        base: a.point,
        preview: (cur) => ring(polygonFromEdge(av, toVec3(cur), n)),
      })
      if (b.kind !== 'point') return
      if (Math.hypot(b.point.x - a.point.x, b.point.y - a.point.y) < 1e-9) return ctx.print('Invalid edge.')
      addPolygon(ctx, polygonFromEdge(av, toVec3(b.point), n))
      return
    }
    const center = toVec3(c.point)
    const lastMode = recall('POLYGON.circumscribed') === 1 ? 'Circumscribed' : 'Inscribed'
    const mode = await ctx.getPoint(`Enter an option [Inscribed in circle/Circumscribed about circle] <${lastMode[0]}>: `, {
      keywords: ['Inscribed', 'Circumscribed'],
      enterKeyword: lastMode,
    })
    if (mode.kind !== 'keyword') return
    const circ = mode.keyword === 'Circumscribed'
    remember('POLYGON.circumscribed', circ ? 1 : 0)
    // Un punto fija radio y giro; un número tecleado deja la arista inferior horizontal (CAD clásico).
    const r = await ctx.getPoint('Specify radius of circle: ', {
      base: c.point,
      textKeyword: NUMBER,
      preview: (cur) => {
        const rad = Math.hypot(cur.x - center[0], cur.y - center[1])
        return rad > 1e-9 ? ring(regularPolygon(center, n, rad, Math.atan2(cur.y - center[1], cur.x - center[0]), circ)) : []
      },
    })
    if (r.kind === 'cancel') return
    let radius: number
    let angle: number
    if (r.kind === 'keyword') {
      radius = Number(r.keyword)
      angle = bottomEdgeAngle(n, circ)
    } else {
      radius = Math.hypot(r.point.x - center[0], r.point.y - center[1])
      angle = Math.atan2(r.point.y - center[1], r.point.x - center[0])
    }
    if (!(radius > 0)) return ctx.print('Invalid radius.')
    addPolygon(ctx, regularPolygon(center, n, radius, angle, circ))
  },
}
