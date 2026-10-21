import type { Vec3 } from '../math'
import type { Entity } from '../document/types'
import { tessellateArc } from '../geom/arc'
import { ellipsePoints } from '../geom/ellipse'
import { bulgeArc, bulgeAt, polylinePoints, polylineSpans } from '../geom/polyline'
import { arcSegmentCount } from '../geom/arc'
import { bulgeAngle } from '../geom/polyline'
import { catmullRomPoint } from '../geom/curve'
import { patternLength } from './linetypes'

/** Trazos de un tipo de línea: tramos (polilíneas) y puntos (elementos de largo 0). */
export interface DashResult {
  dashes: Vec3[][]
  dots: Vec3[]
}

/** Repeticiones máximas por recorrido: más densas se dibujan continuas (el CAD clásico hace lo mismo al regenerar). */
export const MAX_REPEATS = 4000

const dist = (a: Vec3, b: Vec3): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/**
 * Aplica un patrón (ya escalado) a un recorrido, como el CAD clásico: empieza y termina con el primer elemento
 * (un trazo) y reparte el sobrante entre los dos extremos. Si no entra un patrón completo más el trazo
 * final, o si sería demasiado denso, el recorrido se dibuja continuo.
 */
export function applyPattern(path: Vec3[], pattern: number[], out: DashResult = { dashes: [], dots: [] }): DashResult {
  if (path.length < 2) return out
  const cum = [0]
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + dist(path[i - 1], path[i]))
  const L = cum[cum.length - 1]
  const P = patternLength(pattern)
  const d0 = Math.max(0, pattern[0])
  if (!(P > 0) || L < d0 + P || L / P > MAX_REPEATS || pattern.every((x) => x < 0)) {
    if (L > 0) out.dashes.push(path)
    return out
  }
  const k = Math.floor((L - d0) / P)
  const half = (L - d0 - k * P) / 2

  // Recorrido por largo (monótono): punto en s, y tramo [s0, s1] con los vértices intermedios.
  let seg = 1
  const at = (s: number): Vec3 => {
    while (seg < cum.length - 1 && cum[seg] < s) seg++
    const a = cum[seg - 1]
    const b = cum[seg]
    return lerp(path[seg - 1], path[seg], b > a ? (s - a) / (b - a) : 0)
  }
  const dash = (s0: number, s1: number): void => {
    const pts: Vec3[] = [at(s0)]
    while (seg < cum.length - 1 && cum[seg] < s1) {
      pts.push(path[seg])
      seg++
    }
    pts.push(at(s1))
    out.dashes.push(pts)
  }
  const emit = (s: number, len: number): void => {
    if (len > 0) dash(s, Math.min(L, s + len))
    else out.dots.push(at(s))
  }

  let s = 0
  emit(s, d0 + half)
  s += d0 + half
  for (let r = 0; r < k; r++) {
    for (let j = 1; j < pattern.length; j++) {
      const e = pattern[j]
      if (e < 0) s -= e
      else {
        emit(s, e)
        s += e
      }
    }
    const len = r === k - 1 ? d0 + half : d0
    emit(s, len)
    s += len
  }
  return out
}

/** Recorridos de una entidad sobre los que corre el patrón (null si no admite tipo de línea). */
export function linetypePaths(e: Entity, plinegen = false): Vec3[][] | null {
  switch (e.type) {
    case 'LINE':
      return [[e.props.start, e.props.end]]
    case 'CIRCLE':
      return [tessellateArc({ ...e.props, startAngle: 0, endAngle: 0 }, 96)]
    case 'ARC':
      return [tessellateArc(e.props)]
    case 'ELLIPSE':
      return [ellipsePoints(e.props, 96, true)]
    case 'RECTANGLE': {
      const [x, y, z] = e.props.corner
      const { width: w, height: h } = e.props
      const c: Vec3[] = [[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]]
      return c.map((a, i) => [a, c[(i + 1) % 4]])
    }
    case 'POLYLINE': {
      const p = e.props
      if (p.vertices.length < 2) return null
      // PLINEGEN (del dibujo o de la polilínea): el patrón corre continuo por todos los vértices.
      if (p.ltGen ?? plinegen) return [polylinePoints(p)]
      return polylineSpans(p).map(([i, j]) => {
        const arc = bulgeArc(p.vertices[i], p.vertices[j], bulgeAt(p, i), p.normal)
        if (!arc) return [p.vertices[i], p.vertices[j]]
        const pts = tessellateArc(arc, arcSegmentCount(Math.abs(bulgeAngle(bulgeAt(p, i)))))
        pts[0] = p.vertices[i]
        pts[pts.length - 1] = p.vertices[j]
        return pts
      })
    }
    case 'SPLINE': {
      const cps = e.props.controlPoints
      if (cps.length < 2) return null
      if (cps.length === 2) return [[cps[0], cps[1]]]
      const per = 16
      const pts: Vec3[] = [cps[0]]
      for (let i = 0; i + 1 < cps.length; i++) for (let j = 1; j <= per; j++) pts.push(j === per ? cps[i + 1] : catmullRomPoint(cps, i, j / per))
      return [pts]
    }
    default:
      return null
  }
}

/** Trazos de una entidad con su patrón; null si se dibuja continua (sin patrón o sin recorridos). */
export function entityDashes(e: Entity, pattern: number[] | null, plinegen = false): DashResult | null {
  if (!pattern) return null
  const paths = linetypePaths(e, plinegen)
  if (!paths) return null
  const out: DashResult = { dashes: [], dots: [] }
  for (const p of paths) applyPattern(p, pattern, out)
  return out
}
