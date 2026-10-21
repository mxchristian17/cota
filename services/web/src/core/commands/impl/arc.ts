import { toVec3, type Pt, type Vec3 } from '../../math'
import type { ArcProps, Entity } from '../../document/types'
import {
  arcFrom3Points,
  arcFromStartCenterAngle,
  arcFromStartCenterEnd,
  arcFromStartCenterLength,
  arcFromStartEndAngle,
  arcFromStartEndDirection,
  arcFromStartEndRadius,
  arcIsFullTurn,
  arcTangentAt,
  tessellateArc,
} from '../../geom/arc'
import { bulgeArc } from '../../geom/polyline'
import type { PreviewShape } from '../../preview'
import type { Command, CommandContext } from '../types'
import { askAngle, askDistance } from '../ask'

const DEG = Math.PI / 180

const asPt = (v: Vec3): Pt => ({ x: v[0], y: v[1], z: v[2] })

/** Preview del arco (polilínea tesselada: se dibuja por encima y con el color de contraste). */
function arcPreview(arc: ArcProps | null, fallback?: PreviewShape[]): PreviewShape[] {
  if (!arc) return fallback ?? []
  return [{ kind: 'polyline', points: tessellateArc(arc).map(asPt) }]
}

/**
 * Crea el arco en el documento. Un barrido de 360° no es un arco válido en el CAD clásico: se guarda como
 * `CIRCLE`, igual que hace él.
 */
function addArc(ctx: CommandContext, arc: ArcProps | null): boolean {
  if (!arc) {
    ctx.print('Invalid arc: the points do not define one.')
    return false
  }
  if (arcIsFullTurn(arc)) {
    ctx.doc.addEntity({
      type: 'CIRCLE',
      layer: ctx.currentLayerId(),
      props: { center: arc.center, radius: arc.radius, normal: [0, 0, 1] },
    })
    ctx.print('The arc spans a full turn: a circle was created instead.')
    return true
  }
  ctx.doc.addEntity({ type: 'ARC', layer: ctx.currentLayerId(), props: arc })
  return true
}

/** Último punto dibujado y su dirección de salida, para el modo `Continue` (Enter). */
function lastTrace(ctx: CommandContext): { point: Vec3; dir: Vec3 } | null {
  const entities = ctx.doc.entities
  for (let i = entities.length - 1; i >= 0; i--) {
    const e: Entity = entities[i]
    if (e.type === 'LINE') {
      const { start, end } = e.props
      const dir: Vec3 = [end[0] - start[0], end[1] - start[1], 0]
      if (Math.hypot(dir[0], dir[1]) > 1e-9) return { point: end, dir }
    }
    if (e.type === 'ARC') {
      const pts = tessellateArc(e.props, 1)
      return { point: pts[pts.length - 1], dir: arcTangentAt(e.props, 1) }
    }
    if (e.type === 'POLYLINE' && e.props.vertices.length >= 2) {
      const v = e.props.vertices
      const n = v.length
      const a = v[n - 2]
      const b = v[n - 1]
      const arc = bulgeArc(a, b, e.props.bulges?.[n - 2] ?? 0, e.props.normal)
      if (arc) return { point: b, dir: arcTangentAt(arc, 1) }
      const dir: Vec3 = [b[0] - a[0], b[1] - a[1], 0]
      if (Math.hypot(dir[0], dir[1]) > 1e-9) return { point: b, dir }
    }
  }
  return null
}

/** Tramo final: punto final del arco, o las opciones Angle / chord Length. */
async function finishFromCenter(ctx: CommandContext, start: Vec3, center: Vec3): Promise<void> {
  const end = await ctx.getPoint('Specify end point of arc or [Angle/chord Length]: ', {
    base: asPt(center),
    keywords: ['Angle', 'Length'],
    preview: (c) => arcPreview(arcFromStartCenterEnd(start, center, toVec3(c))),
  })
  if (end.kind === 'cancel') return
  if (end.kind === 'point') {
    addArc(ctx, arcFromStartCenterEnd(start, center, toVec3(end.point)))
    return
  }
  if (end.keyword === 'Angle') {
    const ang = await askAngle(ctx, 'ARC.angle', 'Specify included angle', {
      base: asPt(center),
      relativeTo: asPt(start), // el cursor marca el ángulo *incluido*, medido desde el inicio
      preview: (c) => arcPreview(arcFromStartCenterAngle(start, center, includedFromCursor(start, center, c))),
    })
    if (ang.kind !== 'angle') return
    addArc(ctx, arcFromStartCenterAngle(start, center, ang.deg * DEG))
    return
  }
  // chord Length: negativa = arco mayor (CAD clásico).
  const chord = await askDistance(ctx, 'ARC.chord', 'Specify length of chord', {
    valid: (v) => v !== 0,
    base: asPt(start),
    preview: (c) => arcPreview(arcFromStartCenterLength(start, center, Math.hypot(c.x - start[0], c.y - start[1]))),
  })
  if (chord.kind !== 'distance') return
  addArc(ctx, arcFromStartCenterLength(start, center, chord.value))
}

/** Ángulo incluido (radianes) que marca el cursor alrededor del centro, desde el punto inicial. */
function includedFromCursor(start: Vec3, center: Vec3, cursor: Pt): number {
  const a0 = Math.atan2(start[1] - center[1], start[0] - center[0])
  const a1 = Math.atan2(cursor.y - center[1], cursor.x - center[0])
  let d = a1 - a0
  while (d <= -Math.PI) d += Math.PI * 2
  while (d > Math.PI) d -= Math.PI * 2
  return d
}

/** Start, End + [Angle/Direction/Radius]. `dir0` fija la tangente inicial del modo Continue. */
async function finishFromStartEnd(ctx: CommandContext, start: Vec3, dir0?: Vec3): Promise<void> {
  const end = await ctx.getPoint('Specify end point of arc: ', {
    base: asPt(start),
    preview: (c) =>
      dir0
        ? arcPreview(arcFromStartEndDirection(start, toVec3(c), dir0))
        : [{ kind: 'line', a: asPt(start), b: c }],
  })
  if (end.kind !== 'point') return
  const e = toVec3(end.point)
  if (dir0) {
    // Continue: el arco sale tangente al trazo anterior, sin más preguntas (como el CAD clásico).
    addArc(ctx, arcFromStartEndDirection(start, e, dir0))
    return
  }
  const opt = await ctx.getPoint('Specify center point of arc or [Angle/Direction/Radius]: ', {
    base: asPt(e),
    keywords: ['Angle', 'Direction', 'Radius'],
    preview: (c) => arcPreview(arcFromStartCenterEnd(start, toVec3(c), e)),
  })
  if (opt.kind === 'cancel') return
  if (opt.kind === 'point') {
    addArc(ctx, arcFromStartCenterEnd(start, toVec3(opt.point), e))
    return
  }
  if (opt.keyword === 'Angle') {
    const ang = await askAngle(ctx, 'ARC.angle', 'Specify included angle', {
      base: asPt(start),
      relativeTo: asPt(e),
      preview: (c) => arcPreview(arcFromStartEndAngle(start, e, includedFromCursor(e, start, c))),
    })
    if (ang.kind !== 'angle') return
    addArc(ctx, arcFromStartEndAngle(start, e, ang.deg * DEG))
    return
  }
  if (opt.keyword === 'Direction') {
    const dir = await ctx.getAngle('Specify tangent direction for the start point of arc: ', {
      base: asPt(start),
      preview: (c) => arcPreview(arcFromStartEndDirection(start, e, [c.x - start[0], c.y - start[1], 0])),
    })
    if (dir.kind !== 'angle') return
    const rad = dir.deg * DEG
    addArc(ctx, arcFromStartEndDirection(start, e, [Math.cos(rad), Math.sin(rad), 0]))
    return
  }
  // Radius: negativo = arco mayor (CAD clásico).
  const r = await askDistance(ctx, 'ARC.radius', 'Specify radius of arc', {
    valid: (v) => v !== 0,
    base: asPt(start),
    preview: (c) => arcPreview(arcFromStartEndRadius(start, e, Math.hypot(c.x - start[0], c.y - start[1]))),
  })
  if (r.kind !== 'distance') return
  addArc(ctx, arcFromStartEndRadius(start, e, r.value))
}

/** Rama que arranca pidiendo el centro: Center, Start, End / Angle / Length. */
async function fromCenterFirst(ctx: CommandContext): Promise<void> {
  const center = await ctx.getPoint('Specify center point of arc: ')
  if (center.kind !== 'point') return
  const c = toVec3(center.point)
  const start = await ctx.getPoint('Specify start point of arc: ', {
    base: center.point,
    preview: (p) => [{ kind: 'line', a: center.point, b: p }],
  })
  if (start.kind !== 'point') return
  await finishFromCenter(ctx, toVec3(start.point), c)
}

export const arcCommand: Command = {
  name: 'ARC',
  planar: true,
  aliases: ['A'],
  description: 'Draw an arc: 3 points, or Start/Center/End with Angle, chord Length, Direction or Radius',
  async run(ctx) {
    const first = await ctx.getPoint('Specify start point of arc or [Center]: ', {
      keywords: ['Center'],
      enterKeyword: 'Continue', // Enter = continuar tangente al último trazo (CAD clásico)
    })
    if (first.kind === 'cancel') return
    if (first.kind === 'keyword') {
      if (first.keyword === 'Center') {
        await fromCenterFirst(ctx)
        return
      }
      const last = lastTrace(ctx)
      if (!last) {
        ctx.print('No previous line or arc to continue from.')
        return
      }
      await finishFromStartEnd(ctx, last.point, last.dir)
      return
    }

    const start = toVec3(first.point)
    const second = await ctx.getPoint('Specify second point of arc or [Center/End]: ', {
      base: first.point,
      keywords: ['Center', 'End'],
      preview: (c) => [{ kind: 'line', a: first.point, b: c }],
    })
    if (second.kind === 'cancel') return
    if (second.kind === 'keyword') {
      if (second.keyword === 'Center') {
        const center = await ctx.getPoint('Specify center point of arc: ', {
          base: first.point,
          preview: (c) => [{ kind: 'line', a: first.point, b: c }],
        })
        if (center.kind !== 'point') return
        await finishFromCenter(ctx, start, toVec3(center.point))
        return
      }
      await finishFromStartEnd(ctx, start)
      return
    }

    const mid = toVec3(second.point)
    const third = await ctx.getPoint('Specify end point of arc: ', {
      base: second.point,
      preview: (c) => arcPreview(arcFrom3Points(start, mid, toVec3(c)), [
        { kind: 'polyline', points: [first.point, second.point, c] },
      ]),
    })
    if (third.kind !== 'point') return
    addArc(ctx, arcFrom3Points(start, mid, toVec3(third.point)))
  },
}
