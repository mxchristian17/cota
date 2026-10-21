import type { Vec3 } from '../math'
import type { Entity } from '../document/types'
import { bulgeArc, bulgeAt, polylineSpans } from './polyline'

/**
 * Tangencias en el plano XY: tangentes desde un punto y comunes a dos círculos, pie de la
 * perpendicular, y círculos definidos por puntos/tangencias (`CIRCLE 3P`, `Ttr`, *Tan Tan Tan*).
 * Las rectas se toman infinitas (como el CAD clásico al buscar tangencias) y los arcos como su círculo.
 */

export type TanObject = { kind: 'line'; a: Vec3; b: Vec3 } | { kind: 'circle'; c: Vec3; r: number } | { kind: 'point'; p: Vec3 }

const d2 = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Pie de la perpendicular desde `p` a la recta a→b (en XY, con la z de a). */
function footOnLine(a: Vec3, b: Vec3, p: Vec3): Vec3 {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L2 = dx * dx + dy * dy
  const t = L2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0
  return [a[0] + t * dx, a[1] + t * dy, a[2]]
}

/** Objeto tangente de una entidad cerca de `at`: línea, círculo (arcos y tramos curvos), lado o tramo recto. */
export function tanObjectOf(e: Entity, at: Vec3): TanObject | null {
  switch (e.type) {
    case 'LINE':
      return { kind: 'line', a: e.props.start, b: e.props.end }
    case 'CIRCLE':
    case 'ARC':
      return { kind: 'circle', c: e.props.center, r: e.props.radius }
    case 'RECTANGLE': {
      const [x, y, z] = e.props.corner
      const { width: w, height: h } = e.props
      const c: Vec3[] = [[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]]
      let best: TanObject | null = null
      let bd = Infinity
      for (let i = 0; i < 4; i++) {
        const a = c[i]
        const b = c[(i + 1) % 4]
        const f = footOnLine(a, b, at)
        const t = d2(f, at)
        if (t < bd) {
          bd = t
          best = { kind: 'line', a, b }
        }
      }
      return best
    }
    case 'POLYLINE': {
      const p = e.props
      let best: TanObject | null = null
      let bd = Infinity
      for (const [i, j] of polylineSpans(p)) {
        const a = p.vertices[i]
        const b = p.vertices[j]
        const arc = bulgeArc(a, b, bulgeAt(p, i), p.normal)
        const obj: TanObject = arc ? { kind: 'circle', c: arc.center, r: arc.radius } : { kind: 'line', a, b }
        const near = obj.kind === 'circle' ? Math.abs(d2(at, obj.c) - obj.r) : d2(at, footOnLine(a, b, at))
        // Para tramos rectos se mide al segmento (no a la recta infinita), para no elegir uno lejano.
        const seg = obj.kind === 'line' ? Math.min(near + segOutside(a, b, at), Infinity) : near
        if (seg < bd) {
          bd = seg
          best = obj
        }
      }
      return best
    }
    default:
      return null
  }
}

/** Cuánto queda `p` fuera del segmento a→b, medido a lo largo de él (0 si su proyección cae adentro). */
function segOutside(a: Vec3, b: Vec3, p: Vec3): number {
  const L = d2(a, b)
  if (L === 0) return d2(a, p)
  const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / L
  return t < 0 ? -t : t > L ? t - L : 0
}

/** Puntos de tangencia desde un punto exterior a un círculo (0 o 2). */
export function tangentPointsFrom(c: Vec3, r: number, p: Vec3): Vec3[] {
  const dx = p[0] - c[0]
  const dy = p[1] - c[1]
  const d = Math.hypot(dx, dy)
  if (d <= r + 1e-12) return []
  const a = Math.atan2(dy, dx)
  const off = Math.acos(r / d)
  return [a + off, a - off].map((t) => [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t), c[2]] as Vec3)
}

/** Tangentes comunes a dos círculos: pares [punto en el 1º, punto en el 2º] (exteriores e interiores). */
export function commonTangents(c1: Vec3, r1: number, c2: Vec3, r2: number): Array<[Vec3, Vec3]> {
  const dx = c2[0] - c1[0]
  const dy = c2[1] - c1[1]
  const d = Math.hypot(dx, dy)
  const out: Array<[Vec3, Vec3]> = []
  if (d < 1e-12) return out
  const ux = dx / d
  const uy = dy / d
  // Para cada signo s2 (exterior +1, interior −1) la normal n cumple n·u = (r1 − s2·r2)/d.
  for (const s2 of [1, -1]) {
    const cosA = (r1 - s2 * r2) / d
    if (Math.abs(cosA) > 1 + 1e-12) continue
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA))
    for (const sg of [1, -1]) {
      const nx = ux * cosA - uy * sinA * sg
      const ny = uy * cosA + ux * sinA * sg
      out.push([
        [c1[0] + r1 * nx, c1[1] + r1 * ny, c1[2]],
        [c2[0] + s2 * r2 * nx, c2[1] + s2 * r2 * ny, c2[2]],
      ])
      if (sinA < 1e-12) break // tangencia doble: una sola recta
    }
  }
  return out
}

/** Pie de la perpendicular desde `p` al objeto (recta infinita o círculo: el punto alineado con el centro más cercano a `p`). */
export function perpendicularFoot(o: TanObject, p: Vec3): Vec3 {
  if (o.kind === 'line') return footOnLine(o.a, o.b, p)
  if (o.kind === 'point') return o.p
  const d = d2(p, o.c)
  if (d < 1e-12) return [o.c[0] + o.r, o.c[1], o.c[2]]
  return [o.c[0] + ((p[0] - o.c[0]) / d) * o.r, o.c[1] + ((p[1] - o.c[1]) / d) * o.r, o.c[2]]
}

/** Primer punto diferido (tangente o perpendicular a un objeto) con el punto marcado como pista. */
export interface Deferred {
  kind: 'tangent' | 'perpendicular'
  obj: TanObject
  hint: Vec3
}

/**
 * Segmento de una línea cuyo primer punto es diferido (el CAD clásico *Deferred Tangent/Perpendicular*): con el
 * segundo punto `p`, o con un segundo diferido (tangente común entre dos círculos). Se elige la
 * solución más cercana a los puntos marcados; null si no hay.
 */
export function resolveDeferredLine(first: Deferred, second: Vec3 | Deferred): [Vec3, Vec3] | null {
  if (!Array.isArray(second)) {
    if (first.kind === 'tangent' && second.kind === 'tangent' && first.obj.kind === 'circle' && second.obj.kind === 'circle') {
      const sols = commonTangents(first.obj.c, first.obj.r, second.obj.c, second.obj.r)
      let best: [Vec3, Vec3] | null = null
      let bd = Infinity
      for (const [a, b] of sols) {
        const s = d2(a, first.hint) + d2(b, second.hint)
        if (s < bd) {
          bd = s
          best = [a, b]
        }
      }
      return best
    }
    return resolveDeferredLine(first, second.hint)
  }
  const p = second
  if (first.kind === 'perpendicular') return [perpendicularFoot(first.obj, p), p]
  if (first.obj.kind !== 'circle') return null
  const pts = tangentPointsFrom(first.obj.c, first.obj.r, p)
  if (pts.length === 0) return null
  const t = d2(pts[0], first.hint) <= d2(pts[1], first.hint) ? pts[0] : pts[1]
  return [t, p]
}

// --- Círculos por puntos y tangencias -------------------------------------------------------------

/** Círculo por tres puntos (circunscrito), o null si están alineados. */
export function circleFrom3Points(a: Vec3, b: Vec3, c: Vec3): { c: Vec3; r: number } | null {
  const ax = a[0], ay = a[1], bx = b[0], by = b[1], cx = c[0], cy = c[1]
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
  if (Math.abs(d) < 1e-12 * Math.max(1, Math.abs(ax) + Math.abs(bx) + Math.abs(cx)) ** 2) return null
  const a2 = ax * ax + ay * ay
  const b2 = bx * bx + by * by
  const c2 = cx * cx + cy * cy
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d
  const center: Vec3 = [ux, uy, a[2]]
  return { c: center, r: d2(center, a) }
}

/** Punto de contacto de un círculo (centro `c`, radio `r`) con el objeto. */
function contact(o: TanObject, c: Vec3, r: number): Vec3 {
  if (o.kind === 'point') return o.p
  if (o.kind === 'line') return footOnLine(o.a, o.b, c)
  const d = d2(c, o.c)
  const u: Vec3 = d < 1e-12 ? [1, 0, 0] : [(c[0] - o.c[0]) / d, (c[1] - o.c[1]) / d, 0]
  const p1: Vec3 = [o.c[0] + u[0] * o.r, o.c[1] + u[1] * o.r, o.c[2]]
  const p2: Vec3 = [o.c[0] - u[0] * o.r, o.c[1] - u[1] * o.r, o.c[2]]
  return Math.abs(d2(p1, c) - r) <= Math.abs(d2(p2, c) - r) ? p1 : p2
}

/** Variantes de cada restricción: lado de una recta o tipo de tangencia con un círculo. */
type Variant = { s: number; sigma: number; k: number }

function variants(o: TanObject): Variant[] {
  if (o.kind === 'point') return [{ s: 1, sigma: 0, k: 1 }]
  if (o.kind === 'line') return [{ s: 1, sigma: 0, k: 1 }, { s: -1, sigma: 0, k: 1 }]
  // |c − ci| = σ·Ri + k·r: exterior (1, 1), adentro del dado (1, −1), el dado adentro (−1, 1).
  return [{ s: 1, sigma: 1, k: 1 }, { s: 1, sigma: 1, k: -1 }, { s: 1, sigma: -1, k: 1 }]
}

/** Residuo y gradiente (∂/∂cx, ∂/∂cy, ∂/∂r) de una restricción. */
function residual(o: TanObject, v: Variant, cx: number, cy: number, r: number): [number, number, number, number] {
  if (o.kind === 'line') {
    const dx = o.b[0] - o.a[0]
    const dy = o.b[1] - o.a[1]
    const L = Math.hypot(dx, dy) || 1
    const nx = -dy / L
    const ny = dx / L
    return [v.s * (nx * (cx - o.a[0]) + ny * (cy - o.a[1])) - r, v.s * nx, v.s * ny, -1]
  }
  const p = o.kind === 'point' ? o.p : o.c
  const R = o.kind === 'point' ? 0 : o.r
  const ex = cx - p[0]
  const ey = cy - p[1]
  const d = Math.hypot(ex, ey) || 1e-12
  return [d - (v.sigma * R + v.k * r), ex / d, ey / d, -v.k]
}

function solve3(m: number[][], b: number[]): number[] | null {
  const det = (a: number[][]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
  const D = det(m)
  if (Math.abs(D) < 1e-14) return null
  return [0, 1, 2].map((col) => det(m.map((row, i) => row.map((x, j) => (j === col ? b[i] : x)))) / D)
}

/**
 * Círculo que cumple tres restricciones (pasar por un punto o ser tangente a una recta/círculo), o dos
 * con radio fijo (`Ttr`). Se prueban todas las combinaciones de lados con Newton desde varios arranques
 * y se devuelve la solución cuyos puntos de contacto quedan más cerca de las pistas (los clics).
 */
export function solveCircle(objs: TanObject[], hints: Vec3[], fixedR?: number): { c: Vec3; r: number } | null {
  const n = objs.length
  if (fixedR === undefined && n !== 3) return null
  if (fixedR !== undefined && n !== 2) return null
  if (fixedR === undefined && objs.every((o) => o.kind === 'point')) {
    const pts = objs.map((o) => (o as { p: Vec3 }).p)
    return circleFrom3Points(pts[0], pts[1], pts[2])
  }
  const z = hints[0]?.[2] ?? 0
  const scale = Math.max(1, ...hints.map((h) => Math.hypot(h[0], h[1])), ...objs.map((o) => (o.kind === 'circle' ? o.r : 0)))
  const gx = hints.reduce((s, h) => s + h[0], 0) / hints.length
  const gy = hints.reduce((s, h) => s + h[1], 0) / hints.length
  const spread = Math.max(1e-6, ...hints.map((h) => Math.hypot(h[0] - gx, h[1] - gy)))
  const starts: Array<[number, number, number]> = [[gx, gy, fixedR ?? spread]]
  for (const h of hints) starts.push([(h[0] + gx) / 2, (h[1] + gy) / 2, fixedR ?? spread / 2])
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    starts.push([gx + spread * Math.cos(a), gy + spread * Math.sin(a), fixedR ?? spread])
  }
  const combos: Variant[][] = [[]]
  for (const o of objs) {
    const next: Variant[][] = []
    for (const c of combos) for (const v of variants(o)) next.push([...c, v])
    combos.splice(0, combos.length, ...next)
  }
  let best: { c: Vec3; r: number } | null = null
  let bestScore = Infinity
  const tol = 1e-9 * scale
  for (const combo of combos) {
    for (const [sx, sy, sr] of starts) {
      let cx = sx
      let cy = sy
      let r = sr
      let ok = false
      for (let it = 0; it < 60; it++) {
        const rows = objs.map((o, i) => residual(o, combo[i], cx, cy, r))
        const err = Math.max(...rows.map((q) => Math.abs(q[0])))
        if (err < tol) {
          ok = true
          break
        }
        let step: number[] | null
        if (fixedR !== undefined) {
          const [[f1, a1, b1], [f2, a2, b2]] = rows
          const D = a1 * b2 - a2 * b1
          step = Math.abs(D) < 1e-14 ? null : [(-f1 * b2 + f2 * b1) / D, (-a1 * f2 + a2 * f1) / D, 0]
        } else step = solve3(rows.map((q) => [q[1], q[2], q[3]]), rows.map((q) => -q[0]))
        if (!step) break
        cx += step[0]
        cy += step[1]
        r += step[2]
        if (!Number.isFinite(cx + cy + r)) break
      }
      if (!ok || !(r > 1e-9)) continue
      const c: Vec3 = [cx, cy, z]
      const score = objs.reduce((s, o, i) => s + d2(contact(o, c, r), hints[i] ?? c), 0)
      if (score < bestScore - 1e-9) {
        bestScore = score
        best = { c, r }
      }
    }
  }
  return best
}
