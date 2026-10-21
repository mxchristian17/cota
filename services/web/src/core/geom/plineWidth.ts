import type { Vec3 } from '../math'
import type { PolylineProps } from '../document/types'
import { arcSegmentCount, tessellateArc } from './arc'
import { bulgeAngle, bulgeArc, bulgeAt, polylineSpans } from './polyline'

/**
 * Polilínea ancha: cada tramo es una banda con su ancho inicial y final (códigos 40/41 de la
 * LWPOLYLINE), con las uniones a inglete como el CAD clásico. Devuelve cuadriláteros (en el plano de la
 * polilínea) que el render y el PDF rellenan.
 */

/** ¿Tiene algún tramo con ancho? */
export const isWide = (p: PolylineProps): boolean => !!p.widths?.some(([a, b]) => a > 0 || b > 0)

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2])
  return l > 1e-15 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]
}

/** Puntos de un tramo (los arcos tesselados) con el semiancho interpolado a lo largo. */
function spanStations(p: PolylineProps, i: number, j: number): Array<{ q: Vec3; hw: number }> {
  const a = p.vertices[i]
  const b = p.vertices[j]
  const [w0, w1] = p.widths?.[i] ?? [0, 0]
  const arc = bulgeArc(a, b, bulgeAt(p, i), p.normal)
  const pts = arc ? tessellateArc(arc, arcSegmentCount(Math.abs(bulgeAngle(bulgeAt(p, i))))) : [a, b]
  pts[0] = a
  pts[pts.length - 1] = b
  const n = pts.length - 1
  return pts.map((q, k) => ({ q, hw: (w0 + ((w1 - w0) * k) / n) / 2 }))
}

/** Cuadriláteros de la banda de la polilínea. */
export function polylineBand(p: PolylineProps): Vec3[][] {
  const N = unit(p.normal ?? [0, 0, 1])
  const spans = polylineSpans(p)
  const st = spans.map(([i, j]) => spanStations(p, i, j))
  const dirIn = (s: Array<{ q: Vec3 }>, k: number): Vec3 => unit(sub(s[k].q, s[k - 1].q))
  const dirOut = (s: Array<{ q: Vec3 }>, k: number): Vec3 => unit(sub(s[k + 1].q, s[k].q))
  const closed = p.closed && p.vertices.length > 2
  const quads: Vec3[][] = []
  st.forEach((s, si) => {
    if (s.length < 2) return
    // Normal de offset en cada estación: a inglete con el tramo vecino en las uniones.
    const offs = s.map((_, k): Vec3 => {
      let d1: Vec3
      let d2: Vec3
      if (k === 0) {
        d2 = dirOut(s, 0)
        const prev = si > 0 ? st[si - 1] : closed ? st[st.length - 1] : null
        d1 = prev && prev.length > 1 ? dirIn(prev, prev.length - 1) : d2
      } else if (k === s.length - 1) {
        d1 = dirIn(s, k)
        const next = si + 1 < st.length ? st[si + 1] : closed ? st[0] : null
        d2 = next && next.length > 1 ? dirOut(next, 0) : d1
      } else {
        d1 = dirIn(s, k)
        d2 = dirOut(s, k)
      }
      const n1 = unit(cross(N, d1))
      const n2 = unit(cross(N, d2))
      const m = unit(add(n1, n2))
      const c = dot(m, n1)
      return c > 0.25 ? [m[0] / c, m[1] / c, m[2] / c] : n2
    })
    for (let k = 0; k + 1 < s.length; k++) {
      const a = s[k]
      const b = s[k + 1]
      if (a.hw <= 0 && b.hw <= 0) continue
      quads.push([add(a.q, offs[k], a.hw), add(b.q, offs[k + 1], b.hw), add(b.q, offs[k + 1], -b.hw), add(a.q, offs[k], -a.hw)])
    }
  })
  return quads
}
