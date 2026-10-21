import { viewZ } from './primitives'
import { angleDeg, dist2d, toVec3, type Pt, type Vec3 } from '../../math'
import type { EllipseProps } from '../../document/types'
import { ellipsePoints } from '../../geom/ellipse'
import type { PreviewShape } from '../../preview'
import type { Command, CommandContext } from '../types'
import { askAngle, askDistance } from '../ask'

const DEG = Math.PI / 180

const asPt = (v: Vec3): Pt => ({ x: v[0], y: v[1], z: v[2] })

/** Ghost de la elipse (polilínea) durante el comando. */
function ellipsePreview(center: Vec3, major: Vec3, normal: Vec3, minorLen: number): PreviewShape[] {
  const majMag = Math.hypot(major[0], major[1], major[2])
  const ratio = majMag > 0 ? minorLen / majMag : 0
  const pts = ellipsePoints({ center, major, ratio, normal }, 64, true).map((v) => ({ x: v[0], y: v[1], z: v[2] }))
  return [{ kind: 'polyline', points: pts }]
}

export const ellipseCommand: Command = {
  name: 'ELLIPSE',
  planar: true,
  aliases: ['EL'],
  description: 'Draw an ellipse (axis endpoints + other axis distance, or Center)',
  async run(ctx) {
    const normal = viewZ(ctx)
    let p1 = await ctx.getPoint('Specify axis endpoint of ellipse or [Arc/Center]: ', {
      keywords: ['Arc', 'Center'],
    })
    // `Arc` (ELLIPSE ▸ Arc): la elipse se define igual y al final se recorta por ángulos.
    let arcMode = false
    if (p1.kind === 'keyword' && p1.keyword === 'Arc') {
      arcMode = true
      p1 = await ctx.getPoint('Specify axis endpoint of elliptical arc or [Center]: ', { keywords: ['Center'] })
    }
    let center: Vec3
    let major: Vec3
    if (p1.kind === 'keyword') {
      const c = await ctx.getPoint('Specify center of ellipse: ')
      if (c.kind !== 'point') return
      const e1 = await ctx.getPoint('Specify endpoint of axis: ', {
        base: c.point,
        preview: (cur) => [{ kind: 'line', a: c.point, b: cur }],
      })
      if (e1.kind !== 'point') return
      center = toVec3(c.point)
      major = [e1.point.x - center[0], e1.point.y - center[1], e1.point.z - center[2]]
    } else if (p1.kind === 'point') {
      const p2 = await ctx.getPoint('Specify other endpoint of axis: ', {
        base: p1.point,
        preview: (cur) => [{ kind: 'line', a: p1.point, b: cur }],
      })
      if (p2.kind !== 'point') return
      center = [(p1.point.x + p2.point.x) / 2, (p1.point.y + p2.point.y) / 2, (p1.point.z + p2.point.z) / 2]
      major = [(p2.point.x - p1.point.x) / 2, (p2.point.y - p1.point.y) / 2, (p2.point.z - p1.point.z) / 2]
    } else {
      return
    }
    const majMag = Math.hypot(major[0], major[1], major[2])
    if (majMag <= 1e-9) {
      ctx.print('Degenerate axis.')
      return
    }
    const cPt: Pt = { x: center[0], y: center[1], z: center[2] }
    const d = await askDistance(ctx, 'ELLIPSE.otherAxis', 'Specify distance to other axis', {
      base: cPt,
      valid: (v) => v > 0,
      preview: (cur) => ellipsePreview(center, major, normal, dist2d(cPt, cur)),
    })
    if (d.kind !== 'distance' || d.value <= 0) {
      ctx.print('Invalid distance.')
      return
    }
    const ratio = d.value / majMag
    const props: EllipseProps = { center, major, ratio, normal }

    if (arcMode) {
      const span = await ellipseArcSpan(ctx, props)
      if (!span) return
      props.startParam = span.startParam
      props.endParam = span.endParam
    }

    ctx.doc.addEntity({ type: 'ELLIPSE', layer: ctx.currentLayerId(), props })
  },
}

/**
 * Prompts de recorte del `ELLIPSE ▸ Arc`. Los **ángulos** se miden desde el semieje mayor (lo que
 * ve el usuario); el **parámetro** es el de la ecuación de la elipse, que es lo que guarda el DXF.
 * La conversión es `u = atan2(sin θ, ratio · cos θ)`.
 */
async function ellipseArcSpan(
  ctx: CommandContext,
  props: EllipseProps,
): Promise<{ startParam: number; endParam: number } | null> {
  const cPt: Pt = { x: props.center[0], y: props.center[1], z: props.center[2] }
  const paramOf = (deg: number): number => {
    const t = deg * DEG
    return Math.atan2(Math.sin(t), props.ratio * Math.cos(t))
  }
  const preview = (startParam: number, endParam: number): PreviewShape[] => [
    { kind: 'polyline', points: ellipsePoints({ ...props, startParam, endParam }, 64).map(asPt) },
  ]

  const start = await askAngle(ctx, 'ELLIPSE.startAngle', 'Specify start angle or [Parameter]', {
    base: cPt,
    keywords: ['Parameter'],
  })
  if (start.kind === 'cancel') return null
  let startParam: number
  if (start.kind === 'keyword') {
    const sp = await ctx.getDistance('Specify start parameter: ', { base: cPt })
    if (sp.kind !== 'distance') return null
    startParam = sp.value
  } else {
    startParam = paramOf(start.deg)
  }

  const end = await askAngle(ctx, 'ELLIPSE.endAngle', 'Specify end angle or [Parameter/Included angle]', {
    base: cPt,
    keywords: ['Parameter', 'Included'],
    preview: (cur) => preview(startParam, paramOf(angleDeg(cPt, cur))),
  })
  if (end.kind === 'cancel') return null
  if (end.kind === 'keyword' && end.keyword === 'Parameter') {
    const ep = await ctx.getDistance('Specify end parameter: ', { base: cPt })
    if (ep.kind !== 'distance') return null
    return { startParam, endParam: ep.value }
  }
  if (end.kind === 'keyword') {
    // Included angle: barrido medido desde el ángulo inicial.
    const inc = await askAngle(ctx, 'ELLIPSE.included', 'Specify included angle for arc', { base: cPt })
    if (inc.kind !== 'angle') return null
    return { startParam, endParam: startParam + inc.deg * DEG }
  }
  return { startParam, endParam: paramOf(end.deg) }
}
