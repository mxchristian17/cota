import type { SolidProps } from '../document/types'
import type { Pt, Vec3 } from '../math'
import type { PreviewShape } from '../preview'
import type { CommandContext } from './types'

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * Altura con signo que indica un punto sobre el eje `axis` (unitario) que pasa por `base`, como al arrastrar un
 * sólido en 3D: un punto fuera del plano de la base (un snap o una coordenada 3D) se proyecta sobre el eje; uno en
 * el plano (el cursor sobre el plano de trabajo) da el punto del eje más cercano al rayo de la vista por el cursor,
 * así el sólido crece hacia el lado donde está el cursor. Mirando a lo largo del eje no hay de dónde sacar el
 * signo: es la distancia en el plano (positiva, hacia quien mira).
 */
export function signedHeight(ctx: CommandContext, base: Vec3, axis: Vec3, p: Pt): number {
  const w = sub([p.x, p.y, p.z], base)
  const along = dot(w, axis)
  if (Math.abs(along) > 1e-6 * (1 + Math.hypot(...w))) return along
  const ray = ctx.app.viewRay?.(p)
  if (!ray) return Math.hypot(...w)
  const b = dot(axis, ray.dir)
  const denom = 1 - b * b
  if (denom < 0.004) return Math.hypot(...w) // vista casi a lo largo del eje
  const w0 = sub(base, ray.origin)
  return (b * dot(ray.dir, w0) - dot(axis, w0)) / denom
}

/**
 * Vista previa de la altura: el sólido que resultaría (sombreado translúcido) y la línea del eje desde la base
 * hasta la altura indicada por el cursor.
 */
export function heightPreview(
  ctx: CommandContext,
  base: Vec3,
  axis: () => Vec3,
  solidsAt: (h: number) => SolidProps[],
): (cursor: Pt) => PreviewShape[] {
  return (cursor) => {
    const a = axis()
    const h = signedHeight(ctx, base, a, cursor)
    if (!(Math.abs(h) > 1e-9)) return []
    const shapes: PreviewShape[] = solidsAt(h).map((props) => ({ kind: 'solid', props }))
    shapes.push({ kind: 'line', a: { x: base[0], y: base[1], z: base[2] }, b: { x: base[0] + a[0] * h, y: base[1] + a[1] * h, z: base[2] + a[2] * h } })
    return shapes
  }
}
