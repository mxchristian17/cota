import type { Command, CommandContext } from '../types'
import type { PreviewShape } from '../../preview'
import { pt, type Pt } from '../../math'
import { askDistance } from '../ask'
import { remember } from '../memory'
import { heightPreview, signedHeight } from '../height'
import type { SolidProps } from '../../document/types'
import type { Vec3 } from '../../math'

/**
 * Eje Z de la vista activa **hacia el observador** (la Z de la UCS de la vista en el CAD clásico): una altura
 * positiva crece hacia quien mira (TOP → +Z, FRONT → −Y, LEFT → −X, BOTTOM → −Z).
 */
export const viewZ = (ctx: CommandContext) => ctx.app.facingNormal?.() ?? ctx.app.constructionNormal()

/** Teselación por defecto de las primitivas curvas (render suave). */
export const DEFAULT_SEGMENTS = 48

/**
 * Radio y altura recordados, **compartidos** por BOX/CYLINDER/CONE/SPHERE como en el CAD clásico: la altura
 * de la última caja es la que ofrece el próximo cilindro.
 */
const RADIUS = 'SOLID.radius'
const HEIGHT = 'SOLID.height'
const askRadius = (ctx: CommandContext, label: string, c: Pt) =>
  askDistance(ctx, RADIUS, label, { base: c, preview: circlePreview(c), valid: (v) => v > 0 })
const v3 = (p: Pt): Vec3 => [p.x, p.y, p.z]
/**
 * Altura con el sólido a la vista: con el cursor se toma sobre `axis` y con signo (crece hacia el lado del
 * cursor); un número tecleado positivo crece hacia `axis`.
 */
const askHeight = (ctx: CommandContext, base: Pt, axis: Vec3, solidAt: (h: number) => SolidProps, keywords?: string[], label = 'Specify height') =>
  askDistance(ctx, HEIGHT, label, {
    base,
    valid: (v) => v !== 0,
    ...(keywords ? { keywords } : {}),
    measure: (p) => signedHeight(ctx, v3(base), axis, p),
    preview: heightPreview(ctx, v3(base), () => axis, (h) => [solidAt(h)]),
  })

/**
 * Opción `Axis endpoint` de CYLINDER/CONE (CAD clásico): el eje va de la base al punto indicado, en cualquier
 * dirección (un eje horizontal sin cambiar la UCS); la altura es su longitud.
 */
async function axisEndpoint(ctx: CommandContext, base: Pt, solidAt: (axis: Vec3, h: number) => SolidProps): Promise<{ axis: Vec3; height: number } | null> {
  const along = (q: Pt) => {
    const d: Vec3 = [q.x - base.x, q.y - base.y, q.z - base.z]
    const h = Math.hypot(...d)
    return h < 1e-9 ? null : { axis: [d[0] / h, d[1] / h, d[2] / h] as Vec3, height: h }
  }
  const r = await ctx.getPoint('Specify axis endpoint: ', {
    base,
    preview: (q) => {
      const a = along(q)
      return a ? [{ kind: 'solid', props: solidAt(a.axis, a.height) }] : []
    },
  })
  if (r.kind !== 'point') return null
  const a = along(r.point)
  if (!a) ctx.print('The axis cannot have zero length.')
  return a
}

function circlePreview(center: Pt): (cursor: Pt) => PreviewShape[] {
  return (cursor) => [{ kind: 'circle', center, radius: Math.hypot(cursor.x - center.x, cursor.y - center.y) }]
}

async function radiusHeight(
  ctx: CommandContext,
  centerPrompt: string,
): Promise<{ center: Pt; radius: number; height: number; axis: Vec3 } | null> {
  const c = await ctx.getPoint(centerPrompt)
  if (c.kind !== 'point') return null
  const r = await askRadius(ctx, 'Specify base radius', c.point)
  if (r.kind !== 'distance' || r.value <= 0) {
    ctx.print('Invalid radius.')
    return null
  }
  const radius = r.value
  const cyl = (axis: Vec3, height: number): SolidProps => ({ op: 'CYLINDER', base: v3(c.point), radius, height, segments: DEFAULT_SEGMENTS, axis })
  const axis = viewZ(ctx)
  const h = await askHeight(ctx, c.point, axis, (height) => cyl(axis, height), ['Axis'], 'Specify height or [Axis endpoint]')
  if (h.kind === 'keyword') {
    const a = await axisEndpoint(ctx, c.point, cyl)
    return a && { center: c.point, radius, ...a }
  }
  if (h.kind !== 'distance' || h.value === 0) {
    ctx.print('Invalid height.')
    return null
  }
  return { center: c.point, radius, height: h.value, axis }
}

export const boxCommand: Command = {
  name: 'BOX',
  planar: true,
  aliases: [],
  description: 'Create a parametric box (two base corners + height)',
  async run(ctx) {
    const p1 = await ctx.getPoint('Specify first corner: ')
    if (p1.kind !== 'point') return
    const p2 = await ctx.getPoint('Specify opposite corner: ', {
      base: p1.point,
      preview: (cursor) => [
        {
          kind: 'polyline',
          points: [
            p1.point,
            pt(cursor.x, p1.point.y, p1.point.z),
            pt(cursor.x, cursor.y, p1.point.z),
            pt(p1.point.x, cursor.y, p1.point.z),
            p1.point,
          ],
        },
      ],
    })
    if (p2.kind !== 'point') return
    const w = Math.abs(p2.point.x - p1.point.x)
    const d = Math.abs(p2.point.y - p1.point.y)
    if (w === 0 || d === 0) {
      ctx.print('Degenerate base.')
      return
    }
    const box = (height: number): SolidProps => ({
      op: 'BOX',
      origin: [Math.min(p1.point.x, p2.point.x), Math.min(p1.point.y, p2.point.y), p1.point.z],
      width: w,
      depth: d,
      height,
    })
    const h = await askHeight(ctx, p1.point, [0, 0, 1], box)
    if (h.kind !== 'distance' || h.value === 0) {
      ctx.print('Invalid height.')
      return
    }
    ctx.doc.addEntity({ type: 'SOLID3D', layer: ctx.currentLayerId(), props: box(h.value) })
    ctx.print('Box created.')
  },
}

export const cylinderCommand: Command = {
  name: 'CYLINDER',
  planar: true,
  aliases: ['CYL'],
  description: 'Create a parametric cylinder (base center + radius + height)',
  async run(ctx) {
    const r = await radiusHeight(ctx, 'Specify center of base: ')
    if (!r) return
    // El eje del cilindro es la normal del plano de la vista activa (perpendicular al plano donde
    // se dibuja): en TOP sale vertical (+Z), en FRONT/LEFT sale perpendicular a esa vista.
    ctx.doc.addEntity({
      type: 'SOLID3D',
      layer: ctx.currentLayerId(),
      props: { op: 'CYLINDER', base: [r.center.x, r.center.y, r.center.z], radius: r.radius, height: r.height, segments: DEFAULT_SEGMENTS, axis: r.axis },
    })
    ctx.print('Cylinder created.')
  },
}

export const coneCommand: Command = {
  name: 'CONE',
  planar: true,
  aliases: [],
  description: 'Create a parametric cone or truncated cone (base center + radius + height + top radius)',
  async run(ctx) {
    const c = await ctx.getPoint('Specify center of base: ')
    if (c.kind !== 'point') return
    const rr = await askRadius(ctx, 'Specify base radius', c.point)
    if (rr.kind !== 'distance' || rr.value <= 0) {
      ctx.print('Invalid radius.')
      return
    }
    // Radio superior: 0 → cono completo; > 0 → tronco de cono. Enter repite el último (al principio 0).
    const rt = await askDistance(ctx, 'CONE.topRadius', 'Specify top radius', { base: c.point, initial: 0, valid: (v) => v >= 0 })
    if (rt.kind !== 'distance') return
    const radiusTop = rt.value > 0 ? rt.value : 0
    const cone = (axis: Vec3, height: number): SolidProps => ({
      op: 'CONE',
      base: v3(c.point),
      radius: rr.value,
      height,
      segments: DEFAULT_SEGMENTS,
      axis,
      ...(radiusTop > 0 ? { radiusTop } : {}),
    })
    let axis = viewZ(ctx)
    let height: number
    const h = await askHeight(ctx, c.point, axis, (v) => cone(axis, v), ['Axis'], 'Specify height or [Axis endpoint]')
    if (h.kind === 'keyword') {
      const a = await axisEndpoint(ctx, c.point, cone)
      if (!a) return
      ;({ axis, height } = a)
    } else if (h.kind !== 'distance' || h.value === 0) {
      ctx.print('Invalid height.')
      return
    } else height = h.value
    ctx.doc.addEntity({ type: 'SOLID3D', layer: ctx.currentLayerId(), props: cone(axis, height) })
    ctx.print(radiusTop > 0 ? 'Truncated cone created.' : 'Cone created.')
  },
}

export const sphereCommand: Command = {
  name: 'SPHERE',
  planar: true,
  aliases: ['SPH'],
  description: 'Create a parametric sphere (center + radius)',
  async run(ctx) {
    const c = await ctx.getPoint('Specify center: ')
    if (c.kind !== 'point') return
    const r = await askRadius(ctx, 'Specify radius', c.point)
    if (r.kind !== 'distance' || r.value <= 0) {
      ctx.print('Invalid radius.')
      return
    }
    ctx.doc.addEntity({
      type: 'SOLID3D',
      layer: ctx.currentLayerId(),
      props: { op: 'SPHERE', center: [c.point.x, c.point.y, c.point.z], radius: r.value, segments: DEFAULT_SEGMENTS },
    })
    ctx.print('Sphere created.')
  },
}

/**
 * TORUS: centro, radio (al centro del tubo) y radio del tubo, recordados (Enter los repite);
 * `Diameter` en ambos prompts. El eje es la normal de la vista activa, como en CYLINDER.
 */
export const torusCommand: Command = {
  name: 'TORUS',
  planar: true,
  aliases: ['TOR'],
  description: 'Create a parametric torus (center + radius + tube radius)',
  async run(ctx) {
    const c = await ctx.getPoint('Specify center point: ')
    if (c.kind !== 'point') return
    const size = async (key: string, label: string, preview: boolean): Promise<number | null> => {
      const r = await askDistance(ctx, key, `${label} or [Diameter]`, {
        base: c.point,
        keywords: ['Diameter'],
        valid: (v) => v > 0,
        ...(preview ? { preview: circlePreview(c.point) } : {}),
      })
      if (r.kind === 'cancel') return null
      if (r.kind === 'distance') return r.value
      const d = await ctx.getDistance('Specify diameter: ', { base: c.point })
      if (d.kind !== 'distance') return null
      if (d.value > 0) remember(key, d.value / 2) // el radio equivalente también se recuerda
      return d.value / 2
    }
    const radius = await size('TORUS.radius', 'Specify radius', true)
    if (radius === null) return
    if (!(radius > 0)) return ctx.print('Invalid radius.')
    const tube = await size('TORUS.tube', 'Specify tube radius', false)
    if (tube === null) return
    if (!(tube > 0)) return ctx.print('Invalid tube radius.')
    ctx.doc.addEntity({
      type: 'SOLID3D',
      layer: ctx.currentLayerId(),
      props: { op: 'TORUS', center: [c.point.x, c.point.y, c.point.z], radius, tube, segments: DEFAULT_SEGMENTS, axis: viewZ(ctx) },
    })
    ctx.print('Torus created.')
  },
}
