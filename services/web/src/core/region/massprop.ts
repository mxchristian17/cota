import type { Vec3 } from '../math'
import type { RegionProps } from '../document/types'
import { hatchFrame, hatchRings, ringDepths, to2, type P2 } from '../hatch/geometry'
import { regionPerimeter } from './region'

/**
 * Propiedades de sección de una región (MASSPROP del CAD clásico): área, centroide, momentos y producto de inercia,
 * radios de giro y momentos principales. Las integrales de área salen de integrales sobre el contorno (Green), con
 * los arcos exactos: cuadratura de Gauss en tramos cortos, exacta a la precisión del número.
 */

export interface SectionProps {
  area: number
  perimeter: number
  min: P2
  max: P2
  centroid: P2
  /** Momentos de inercia respecto de los ejes X e Y (∫y² dA, ∫x² dA) y producto de inercia (∫xy dA). */
  ix: number
  iy: number
  ixy: number
  /** Radios de giro: √(Ix/A), √(Iy/A). */
  rx: number
  ry: number
  /** Momentos principales respecto del centroide, el menor primero, con la dirección de su eje. */
  principal: [{ moment: number; dir: P2 }, { moment: number; dir: P2 }]
}

/** Gauss-Legendre de 5 puntos en [0, 1]. */
const GX = [-0.906179845938664, -0.5384693101056831, 0, 0.5384693101056831, 0.906179845938664].map((x) => (x + 1) / 2)
const GW = [0.2369268850561891, 0.4786286704993665, 0.5688888888888889, 0.4786286704993665, 0.2369268850561891].map((w) => w / 2)

/** Integrales de área (A, ∫x, ∫y, ∫x², ∫y², ∫xy) acumuladas por el contorno. */
type Sums = [number, number, number, number, number, number]

/** Suma las integrales de contorno de un tramo p(s), s ∈ [0, 1], con derivada d(s). */
function addSegment(S: Sums, k: number, p: (s: number) => P2, d: (s: number) => P2): void {
  for (let i = 0; i < GX.length; i++) {
    const [x, y] = p(GX[i])
    const [dx, dy] = d(GX[i])
    const w = GW[i] * k
    S[0] += w * (x * dy - y * dx) / 2
    S[1] += w * (x * x * dy) / 2
    S[2] += w * (-y * y * dx) / 2
    S[3] += w * (x * x * x * dy) / 3
    S[4] += w * (-y * y * y * dx) / 3
    S[5] += w * (x * x * y * dy) / 2
  }
}

/**
 * Propiedades de la región en las coordenadas que da `toLocal` (la UCS). `null` si la región no es paralela a su
 * plano XY: entonces sólo valen el área y el perímetro.
 */
export function sectionProperties(p: RegionProps, toLocal: (v: Vec3) => Vec3): SectionProps | null {
  const f = hatchFrame(p)
  const o = toLocal([0, 0, 0])
  const dirL = (v: Vec3): Vec3 => {
    const q = toLocal(v)
    return [q[0] - o[0], q[1] - o[1], q[2] - o[2]]
  }
  if (Math.abs(Math.abs(dirL(f.n)[2]) - 1) > 1e-9) return null
  const rings = hatchRings(p, f)
  if (rings.length !== p.loops.length) return null
  const depth = ringDepths(rings)
  const total: Sums = [0, 0, 0, 0, 0, 0]
  const lo: P2 = [Infinity, Infinity]
  const hi: P2 = [-Infinity, -Infinity]
  // Punto del plano (u, v) → coordenadas locales (x, y).
  const loc = (q: P2): P2 => {
    const w: Vec3 = [0, 1, 2].map((i) => f.u[i] * q[0] + f.v[i] * q[1] + f.n[i] * f.h) as Vec3
    const r = toLocal(w)
    return [r[0], r[1]]
  }
  const locD = (q: P2): P2 => {
    const r = dirL([0, 1, 2].map((i) => f.u[i] * q[0] + f.v[i] * q[1]) as Vec3)
    return [r[0], r[1]]
  }
  p.loops.forEach((loop, li) => {
    const S: Sums = [0, 0, 0, 0, 0, 0]
    const v = loop.vertices.map((q) => to2(q, f))
    for (let i = 0; i < v.length; i++) {
      const a = v[i]
      const b = v[(i + 1) % v.length]
      const bulge = loop.bulges?.[i] ?? 0
      if (Math.abs(bulge) < 1e-12) {
        const D = locD([b[0] - a[0], b[1] - a[1]])
        addSegment(S, 1, (s) => loc([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]), () => D)
        continue
      }
      const sw = 4 * Math.atan(bulge)
      const ch = Math.hypot(b[0] - a[0], b[1] - a[1])
      const r = ch / (2 * Math.sin(Math.abs(sw) / 2))
      const m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      const dc = Math.sqrt(Math.max(0, r * r - (ch * ch) / 4))
      const nrm: P2 = [-(b[1] - a[1]) / ch, (b[0] - a[0]) / ch]
      const sg = Math.sign(bulge) * (Math.abs(sw) > Math.PI ? -1 : 1)
      const c: P2 = [m[0] + nrm[0] * dc * sg, m[1] + nrm[1] * dc * sg]
      const a0 = Math.atan2(a[1] - c[1], a[0] - c[0])
      // Tramos de a lo sumo π/16: la cuadratura queda exacta a la precisión del número.
      const parts = Math.max(1, Math.ceil(Math.abs(sw) / (Math.PI / 16)))
      for (let k = 0; k < parts; k++) {
        const t0 = a0 + (sw * k) / parts
        const dt = sw / parts
        addSegment(
          S,
          1,
          (s) => loc([c[0] + r * Math.cos(t0 + dt * s), c[1] + r * Math.sin(t0 + dt * s)]),
          (s) => locD([-r * Math.sin(t0 + dt * s) * dt, r * Math.cos(t0 + dt * s) * dt]),
        )
      }
    }
    // Cada lazo suma (contorno) o resta (agujero) según su anidamiento, sea cual sea su sentido.
    const sign = (depth[li] % 2 ? -1 : 1) * (Math.sign(S[0]) || 1)
    for (let k = 0; k < 6; k++) total[k] += sign * S[k]
    for (const q of rings[li]) {
      const [x, y] = loc(q)
      lo[0] = Math.min(lo[0], x)
      lo[1] = Math.min(lo[1], y)
      hi[0] = Math.max(hi[0], x)
      hi[1] = Math.max(hi[1], y)
    }
  })
  const [A, Sx, Sy, Qxx, Qyy, Qxy] = total
  if (!(A > 0)) return null
  const cx = Sx / A
  const cy = Sy / A
  // Respecto del centroide; ejes principales = autovectores de [[Ixc, −Pc], [−Pc, Iyc]].
  const ixc = Qyy - A * cy * cy
  const iyc = Qxx - A * cx * cx
  const pc = Qxy - A * cx * cy
  const mean = (ixc + iyc) / 2
  const rad = Math.hypot((ixc - iyc) / 2, pc)
  const axis = (mom: number): P2 => {
    // (Ixc − λ)·dx − Pc·dy = 0
    const d: P2 = Math.abs(pc) > 1e-12 * Math.max(1, Math.abs(ixc), Math.abs(iyc)) ? [pc, ixc - mom] : Math.abs(ixc - mom) <= Math.abs(iyc - mom) ? [1, 0] : [0, 1]
    const L = Math.hypot(d[0], d[1]) || 1
    const s = d[0] < 0 || (d[0] === 0 && d[1] < 0) ? -1 : 1
    return [(s * d[0]) / L + 0, (s * d[1]) / L + 0]
  }
  return {
    area: A,
    perimeter: regionPerimeter(p),
    min: lo,
    max: hi,
    centroid: [cx, cy],
    ix: Qyy,
    iy: Qxx,
    ixy: Qxy,
    rx: Math.sqrt(Qyy / A),
    ry: Math.sqrt(Qxx / A),
    principal: [
      { moment: mean - rad, dir: axis(mean - rad) },
      { moment: mean + rad, dir: axis(mean + rad) },
    ],
  }
}
