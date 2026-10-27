import { profileOf, profileNormal } from '../../editing/extrude'
import type { SolidProps } from '../../document/types'
import type { Vec3 } from '../../math'
import type { Command } from '../types'
import { askDistance, askNumber, fmt } from '../ask'
import { tessellateArc } from '../../geom/arc'
import { polylinePoints } from '../../geom/polyline'
import type { Entity } from '../../document/types'
import { DEFAULT_SEGMENTS, viewZ } from './primitives'
import { heightPreview, signedHeight } from '../height'

/** Perfil extruible: un círculo se vuelve CYLINDER paramétrico (conserva su centro). */
type Extrudable = { id: string; profile?: Vec3[]; circle?: { center: Vec3; radius: number; normal: Vec3 } }

/** Orienta `axis` para que la extrusión positiva vaya hacia el lado de la vista actual (intuitivo). */
function orientAxis(axis: Vec3, towards: Vec3): Vec3 {
  const d = axis[0] * towards[0] + axis[1] * towards[1] + axis[2] * towards[2]
  return d < 0 ? [-axis[0], -axis[1], -axis[2]] : axis
}

export const extrudeCommand: Command = {
  name: 'EXTRUDE',
  planar: true,
  aliases: ['EXT'],
  description: 'Extrude a closed 2D profile into a solid (a circle becomes a parametric cylinder)',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects to extrude: ')
    if (ids === null || ids.length === 0) return

    const items: Extrudable[] = []
    for (const id of ids) {
      const e = ctx.doc.getEntity(id)
      if (!e) continue
      if (e.type === 'CIRCLE') {
        items.push({ id, circle: { center: e.props.center, radius: e.props.radius, normal: e.props.normal } })
        continue
      }
      const p = profileOf(e)
      if (p) items.push({ id, profile: p })
    }
    if (items.length === 0) {
      ctx.print('No closed profile selected (use RECTANGLE, closed PLINE or CIRCLE).')
      return
    }

    // Opciones del CAD clásico: Direction (dos puntos), Path (barrido por una curva) y Taper angle.
    const ring0 = ringOf(items[0])
    const c0 = mul(ring0.reduce(add, [0, 0, 0] as Vec3), 1 / ring0.length)
    const profileBase = { x: c0[0], y: c0[1], z: c0[2] }
    let taper = 0
    let made: SolidProps[] | null = null
    while (!made) {
      const r = await askDistance(ctx, 'EXTRUDE.height', `Specify height of extrusion or [Direction/Path/Taper angle]${taper ? ` (taper ${fmt(taper)}°)` : ''}`, {
        // La altura con el cursor se mide desde el perfil (no desde el origen del dibujo).
        base: profileBase,
        valid: (v) => v !== 0,
        keywords: ['Direction', 'Path', 'Taper'],
        // Con el cursor, la altura se toma sobre el eje de extrusión y con signo: el sólido crece hacia el lado
        // donde está el cursor (un número tecleado positivo crece hacia quien mira).
        measure: (p) => signedHeight(ctx, c0, axisOf(items[0], viewZ(ctx)), p),
        preview: heightPreview(ctx, c0, () => axisOf(items[0], viewZ(ctx)), (h) =>
          items.flatMap((it) => {
            const props = solidFor(it, h, taper, viewZ(ctx))
            return props ? [props] : []
          }),
        ),
      })
      if (r.kind === 'cancel') return
      if (r.kind === 'keyword' && r.keyword === 'Taper') {
        const a = await askNumber(ctx, `Specify angle of taper for extrusion <${fmt(taper)}>: `, {
          def: taper,
          check: (v) => (Math.abs(v) < 90 ? null : 'The taper angle must be between -90 and 90.'),
        })
        if (a === null) return
        if (a.kind === 'number') taper = a.value
        continue
      }
      if (r.kind === 'keyword' && r.keyword === 'Direction') {
        const p1 = await ctx.getPoint('Specify start point of direction: ')
        if (p1.kind !== 'point') return
        const from: Vec3 = [p1.point.x, p1.point.y, p1.point.z]
        const p2 = await ctx.getPoint('Specify end point of direction: ', {
          base: p1.point,
          preview: (c) => {
            const d = sub([c.x, c.y, c.z], from)
            return Math.hypot(...d) < 1e-9 ? [] : items.map((it) => ({ kind: 'solid' as const, props: alongDirection(ringOf(it), d) }))
          },
        })
        if (p2.kind !== 'point') return
        const d: Vec3 = [p2.point.x - p1.point.x, p2.point.y - p1.point.y, p2.point.z - p1.point.z]
        if (Math.hypot(...d) < 1e-9) {
          ctx.print('The direction cannot have zero length.')
          continue
        }
        made = items.map((it) => alongDirection(ringOf(it), d))
        break
      }
      if (r.kind === 'keyword' && r.keyword === 'Path') {
        const sel = await ctx.getSelection('Select extrusion path: ')
        if (!sel?.length) return
        const path = sel.map((id) => ctx.doc.getEntity(id)).map((e) => (e && !items.some((it) => it.id === e.id) ? pathOf(e) : null)).find((x) => x)
        if (!path) {
          ctx.print('The path must be a line, polyline, arc or spline.')
          continue
        }
        const swept = items.map((it) => alongPath(ringOf(it), path.points, path.smooth))
        if (swept.some((x) => !x)) {
          ctx.print('The path lies in the plane of the profile: it cannot be extruded along it.')
          continue
        }
        made = swept as SolidProps[]
        break
      }
      if (r.kind !== 'distance' || r.value === 0) {
        ctx.print('Invalid height.')
        continue
      }
      const out = items.map((it) => solidFor(it, r.value, taper, viewZ(ctx)))
      if (out.some((x) => !x)) {
        ctx.print('The taper angle is too large for that height: the profile would vanish.')
        continue
      }
      made = out as SolidProps[]
    }
    items.forEach((it, i) => {
      ctx.doc.addEntity({ type: 'SOLID3D', layer: ctx.currentLayerId(), props: made![i] })
      ctx.doc.removeEntity(it.id) // el perfil se consume
    })
    ctx.app.clearSelection()
    ctx.print(`Extruded ${items.length} profile(s).`)
  },
}

// --- Opciones ---------------------------------------------------------------------------------------------------

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: Vec3): Vec3 => mul(a, 1 / (Math.hypot(...a) || 1))

/** Eje de extrusión del perfil, orientado hacia la vista (`towards`). */
function axisOf(it: Extrudable, towards: Vec3): Vec3 {
  return unit(orientAxis(it.circle ? it.circle.normal : profileNormal(it.profile as Vec3[]), towards))
}

/** Sólido extruido `h` (con o sin ángulo de inclinación); null si la inclinación hace desaparecer el perfil. */
function solidFor(it: Extrudable, h: number, taper: number, view: Vec3): SolidProps | null {
  if (taper) return tapered(it, h, taper, view)
  // Un círculo extruido = cilindro paramétrico (centro conservado, render liso, sin facetado en snaps).
  return it.circle
    ? { op: 'CYLINDER', base: it.circle.center, radius: it.circle.radius, height: h, segments: DEFAULT_SEGMENTS, axis: orientAxis(it.circle.normal, view) }
    : { op: 'EXTRUDE', profile: it.profile as Vec3[], height: h, axis: orientAxis(profileNormal(it.profile as Vec3[]), view) }
}

/** Contorno del perfil como polígono (un círculo, muestreado). */
function ringOf(it: Extrudable): Vec3[] {
  if (it.profile) return it.profile
  const c = it.circle!
  return tessellateArc({ center: c.center, radius: c.radius, startAngle: 0, endAngle: 0, normal: c.normal }, DEFAULT_SEGMENTS).slice(0, -1)
}

/** Direction: prisma oblicuo; el perfil conserva su plano y se traslada `d`. */
function alongDirection(ring: Vec3[], d: Vec3): SolidProps {
  return { op: 'LOFT', sections: [ring, ring.map((p) => add(p, d))] }
}

/** Curva de una entidad que sirve de recorrido (la spline, por sus puntos de control, se suaviza al barrer). */
function pathOf(e: Entity): { points: Vec3[]; smooth: boolean } | null {
  if (e.type === 'LINE') return { points: [e.props.start, e.props.end], smooth: false }
  if (e.type === 'POLYLINE') return { points: polylinePoints(e.props), smooth: false }
  if (e.type === 'ARC') return { points: tessellateArc(e.props), smooth: false }
  if (e.type === 'SPLINE' && e.props.controlPoints.length >= 2) return { points: e.props.controlPoints, smooth: true }
  return null
}

/**
 * Path, como el CAD clásico: el recorrido arranca en su extremo más cercano al perfil, se lleva al centroide del
 * perfil y el perfil se barre por él. El perfil se toma en el plano perpendicular al primer tramo; si el recorrido
 * está en el plano del perfil no hay sólido (null).
 */
function alongPath(ring: Vec3[], path: Vec3[], smooth: boolean): SolidProps | null {
  const c = mul(ring.reduce(add, [0, 0, 0] as Vec3), 1 / ring.length)
  const near = (p: Vec3) => Math.hypot(...sub(p, c))
  const p = near(path[path.length - 1]) < near(path[0]) ? [...path].reverse() : path
  const moved = p.map((q) => add(sub(q, p[0]), c))
  const t = unit(sub(moved.find((q) => Math.hypot(...sub(q, moved[0])) > 1e-9) ?? moved[1], moved[0]))
  const n = unit(profileNormal(ring))
  if (Math.abs(dot(n, t)) < 0.1) return null
  const r = unit(cross(Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], t))
  const y = cross(t, r)
  const profile = ring.map((q): [number, number] => [dot(sub(q, c), r), dot(sub(q, c), y)])
  return { op: 'SWEEP', profile, path: moved, ref: r, ...(smooth ? { smooth: true } : {}) }
}

/**
 * Taper angle: la sección se achica (ángulo positivo) o se agranda a lo largo de la altura. Un círculo da un tronco
 * de cono; un polígono, un loft con sus lados desplazados a la misma distancia (no escalado).
 */
function tapered(it: Extrudable, h: number, deg: number, view: Vec3): SolidProps | null {
  const off = Math.abs(h) * Math.tan((deg * Math.PI) / 180)
  if (it.circle) {
    const top = it.circle.radius - off
    if (top < 0) return null
    return { op: 'CONE', base: it.circle.center, radius: it.circle.radius, radiusTop: top, height: h, segments: DEFAULT_SEGMENTS, axis: orientAxis(it.circle.normal, view) }
  }
  const ring = it.profile as Vec3[]
  const n = profileNormal(ring)
  const axis = orientAxis(n, view)
  const inner = insetPolygon(ring, n, off)
  if (!inner) return null
  return { op: 'LOFT', sections: [ring, inner.map((p) => add(p, mul(axis, h)))] }
}

/** Polígono con todos sus lados desplazados `d` hacia adentro (inglete en los vértices); null si se invierte. */
function insetPolygon(ring: Vec3[], n: Vec3, d: number): Vec3[] | null {
  const m = ring.length
  const inward = ring.map((p, i) => unit(cross(n, unit(sub(ring[(i + 1) % m], p)))))
  const out = ring.map((p, i) => {
    const a = inward[(i - 1 + m) % m]
    const b = inward[i]
    const k = 1 + dot(a, b)
    return k < 1e-6 ? add(p, mul(a, d)) : add(p, mul(add(a, b), d / k))
  })
  // Si algún lado cambió de sentido, el perfil colapsó.
  for (let i = 0; i < m; i++) {
    if (dot(sub(out[(i + 1) % m], out[i]), sub(ring[(i + 1) % m], ring[i])) <= 0) return null
  }
  return out
}
