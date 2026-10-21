import { pt, type Pt, type Vec3 } from '../../math'
import type { PreviewShape } from '../../preview'
import { arcBasis } from '../../geom/arc'
import type { Command } from '../types'
import { askDistance } from '../ask'
import { viewZ } from './primitives'

/**
 * RECTANGLE: dos esquinas opuestas (o `Dimensions`) en el plano de la vista, como con la UCS de la vista
 * en el CAD clásico. En planta es la entidad RECTANGLE a la altura de la primera esquina; en FRONT/LEFT/…,
 * una polilínea cerrada en el plano vertical (el CAD clásico siempre crea una polilínea).
 */
export const rectangleCommand: Command = {
  name: 'RECTANGLE',
  planar: true,
  aliases: ['REC', 'RECTANG'],
  description: 'Draw a rectangle by two opposite corners [Dimensions]',
  async run(ctx) {
    const n = viewZ(ctx)
    const plan = n[2] > 1 - 1e-9
    const { u, v } = arcBasis(n)
    const c1 = await ctx.getPoint('Specify first corner point: ')
    if (c1.kind !== 'point') return
    const o = c1.point
    const at = (du: number, dv: number): Pt => pt(o.x + u[0] * du + v[0] * dv, o.y + u[1] * du + v[1] * dv, o.z + u[2] * du + v[2] * dv)
    /** Coordenadas de `p` en el plano de la vista respecto de la primera esquina. */
    const local = (p: Pt): [number, number] => {
      const d: Vec3 = [p.x - o.x, p.y - o.y, p.z - o.z]
      return [d[0] * u[0] + d[1] * u[1] + d[2] * u[2], d[0] * v[0] + d[1] * v[1] + d[2] * v[2]]
    }
    const corners = (du: number, dv: number): Pt[] => [o, at(du, 0), at(du, dv), at(0, dv)]
    const preview = (du: number, dv: number): PreviewShape[] => [{ kind: 'polyline', points: [...corners(du, dv), o] }]

    let size: [number, number] | null = null
    let c2: Pt | null = null
    for (;;) {
      const r = await ctx.getPoint(size ? 'Specify other corner point (side of the rectangle): ' : 'Specify other corner point or [Dimensions]: ', {
        base: o,
        keywords: size ? [] : ['Dimensions'],
        preview: (c) => {
          const [du, dv] = local(c)
          return preview(size ? Math.sign(du || 1) * size[0] : du, size ? Math.sign(dv || 1) * size[1] : dv)
        },
      })
      if (r.kind === 'cancel') return
      if (r.kind === 'keyword') {
        const len = await askDistance(ctx, 'RECTANGLE.length', 'Specify length for rectangles', { base: o, valid: (x) => x > 0 })
        if (len.kind !== 'distance') return
        const wid = await askDistance(ctx, 'RECTANGLE.width', 'Specify width for rectangles', { base: o, valid: (x) => x > 0 })
        if (wid.kind !== 'distance') return
        size = [len.value, wid.value]
        continue
      }
      c2 = r.point
      break
    }
    let [du, dv] = local(c2)
    if (size) [du, dv] = [Math.sign(du || 1) * size[0], Math.sign(dv || 1) * size[1]]
    if (Math.abs(du) < 1e-12 || Math.abs(dv) < 1e-12) {
      ctx.print('Invalid rectangle (zero size).')
      return
    }
    if (plan) {
      ctx.doc.addEntity({
        type: 'RECTANGLE',
        layer: ctx.currentLayerId(),
        props: { corner: [Math.min(o.x, o.x + du), Math.min(o.y, o.y + dv), o.z], width: Math.abs(du), height: Math.abs(dv) },
      })
      return
    }
    ctx.doc.addEntity({ type: 'POLYLINE', layer: ctx.currentLayerId(), props: { vertices: corners(du, dv).map((p) => [p.x, p.y, p.z] as Vec3), closed: true } })
  },
}
