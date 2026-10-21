import type { Vec3 } from '../math'
import type { DimensionProps, Entity } from '../document/types'
import { entityOutline } from '../editing/bounds'
import { dimDisplay, planeAxes } from './dimGeometry'

/**
 * Cortes automáticos de cotas (`DIMBREAK`): la cota guarda qué objetos la cortan
 * (`breakWith`) y los puntos de cruce (`autoBreaks`) se recalculan cuando cambia la geometría.
 * El cruce se toma en el plano de la cota (intersección aparente, como se ve al leerla).
 */

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Parámetro (0..1, interior) sobre a→b donde cruza al segmento c→d, en 2D; null si no cruzan. */
function cross2(a: number[], b: number[], c: number[], d: number[]): number | null {
  const rx = b[0] - a[0]
  const ry = b[1] - a[1]
  const sx = d[0] - c[0]
  const sy = d[1] - c[1]
  const den = rx * sy - ry * sx
  if (Math.abs(den) < 1e-12 * Math.max(1, Math.hypot(rx, ry) * Math.hypot(sx, sy))) return null
  const qx = c[0] - a[0]
  const qy = c[1] - a[1]
  const t = (qx * sy - qy * sx) / den
  const u = (qx * ry - qy * rx) / den
  const eps = 1e-9
  return t > eps && t < 1 - eps && u >= -eps && u <= 1 + eps ? t : null
}

/** Puntos donde las líneas cortables de la cota cruzan los contornos de `objs`. */
export function dimBreakPoints(p: DimensionProps, objs: Entity[]): Vec3[] {
  const d = dimDisplay({ ...p, autoBreaks: undefined })
  const [x, y] = planeAxes(d.normal)
  const to2 = (q: Vec3) => [dot(q, x), dot(q, y)]
  const segs = d.breakable.map(([a, b]) => ({ a, b, a2: to2(a), b2: to2(b) }))
  const pts: Vec3[] = []
  for (const e of objs) {
    for (const poly of entityOutline(e)) {
      for (let i = 0; i + 1 < poly.length; i++) {
        const c2 = to2([poly[i].x, poly[i].y, poly[i].z])
        const d2 = to2([poly[i + 1].x, poly[i + 1].y, poly[i + 1].z])
        for (const s of segs) {
          const t = cross2(s.a2, s.b2, c2, d2)
          if (t === null) continue
          const q: Vec3 = [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t, s.a[2] + (s.b[2] - s.a[2]) * t]
          if (!pts.some((o) => Math.hypot(o[0] - q[0], o[1] - q[1], o[2] - q[2]) < 1e-9)) pts.push(q)
        }
      }
    }
  }
  return pts
}

/** Ids de los objetos de `entities` que cruzan la cota (opción *Auto*). */
export function crossingIds(p: DimensionProps, entities: Entity[], selfId: string): string[] {
  return entities.filter((e) => e.id !== selfId && dimBreakPoints(p, [e]).length > 0).map((e) => e.id)
}

/** Recalcula los cortes automáticos; olvida objetos borrados. Devuelve true si cambiaron. */
export function refreshBreaks(p: DimensionProps, getEntity: (id: string) => Entity | undefined): boolean {
  if (!p.breakWith) return false
  const objs = p.breakWith.map(getEntity).filter((e): e is Entity => !!e)
  if (objs.length !== p.breakWith.length) p.breakWith = objs.map((e) => e.id)
  const pts = dimBreakPoints(p, objs)
  const old = p.autoBreaks ?? []
  const same = old.length === pts.length && old.every((o, i) => Math.hypot(o[0] - pts[i][0], o[1] - pts[i][1], o[2] - pts[i][2]) < 1e-12)
  if (pts.length) p.autoBreaks = pts
  else delete p.autoBreaks
  return !same
}
