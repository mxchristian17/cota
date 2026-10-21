import type { Vec3 } from '../math'
import type { ArrowType } from './style'

/**
 * Geometría de las flechas de cota, con las formas de los bloques del CAD clásico (`DIMBLK`). Una
 * flecha tiene la punta en `tip`, apunta en `dir` (unitario) y vive en el plano de normal `n`; `size`
 * es `DIMASZ` ya escalado.
 */

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sc = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2])
  return l < 1e-12 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l]
}

export interface ArrowGeom {
  lines: [Vec3, Vec3][]
  fills: Vec3[][]
}

/** ¿Es un trazo (oblicuo, arquitectura, integral) o nada? Entonces la línea de cota se prolonga `DIMDLE` y la flecha no ocupa lugar. */
export const isTick = (k: ArrowType): boolean => k === '_OBLIQUE' || k === '_ARCHTICK' || k === '_INTEGRAL' || k === '_NONE'

function ring(c: Vec3, u: Vec3, v: Vec3, r: number, n = 16): Vec3[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return add(c, add(sc(u, r * Math.cos(a)), sc(v, r * Math.sin(a))))
  })
}

const closed = (pts: Vec3[]): [Vec3, Vec3][] => pts.map((p, i) => [p, pts[(i + 1) % pts.length]])

export function arrowGeometry(kind: ArrowType, tip: Vec3, dir: Vec3, n: Vec3, size: number): ArrowGeom {
  const d = norm(dir)
  const p = norm(cross(n, d))
  const at = (back: number, side: number): Vec3 => add(tip, add(sc(d, -back * size), sc(p, side * size)))
  const out: ArrowGeom = { lines: [], fills: [] }
  if (size <= 0) return out
  switch (kind) {
    case '':
      out.fills.push([tip, at(1, 1 / 6), at(1, -1 / 6)])
      break
    case '_IRAM':
      out.fills.push([tip, at(1, 1 / 8), at(1, -1 / 8)])
      break
    case '_CLOSEDBLANK':
      out.lines.push(...closed([tip, at(1, 1 / 6), at(1, -1 / 6)]))
      break
    case '_CLOSED':
      out.lines.push(...closed([tip, at(1, 1 / 6), at(1, -1 / 6)]), [at(1, 0), tip])
      break
    case '_OPEN':
      out.lines.push([at(1, 1 / 6), tip], [tip, at(1, -1 / 6)])
      break
    case '_OPEN30':
      out.lines.push([at(1, Math.tan(Math.PI / 12)), tip], [tip, at(1, -Math.tan(Math.PI / 12))])
      break
    case '_OPEN90':
      out.lines.push([at(0.5, 0.5), tip], [tip, at(0.5, -0.5)])
      break
    case '_OBLIQUE':
      out.lines.push([at(0.5, -0.5), at(-0.5, 0.5)])
      break
    case '_ARCHTICK': {
      // Trazo grueso a 45°: un paralelogramo relleno (ancho 0,15 del tamaño, como el bloque del CAD clásico).
      const w = 0.075
      out.fills.push([at(0.5 - w, -0.5 - w), at(-0.5 - w, 0.5 - w), at(-0.5 + w, 0.5 + w), at(0.5 + w, -0.5 + w)])
      break
    }
    case '_DOT':
      out.fills.push(ring(tip, d, p, size / 4))
      break
    case '_DOTSMALL':
      out.fills.push(ring(tip, d, p, size / 16, 10))
      break
    case '_DOTBLANK':
      out.lines.push(...closed(ring(tip, d, p, size / 4)), [at(0.25, 0), at(1, 0)])
      break
    case '_SMALL':
      out.lines.push(...closed(ring(tip, d, p, size / 8, 12)))
      break
    case '_ORIGIN':
      out.lines.push(...closed(ring(tip, d, p, size / 2)))
      break
    case '_ORIGIN2':
      out.lines.push(...closed(ring(tip, d, p, size / 2)), ...closed(ring(tip, d, p, size / 4)))
      break
    case '_BOXBLANK':
      out.lines.push(...closed([at(0.25, 0.25), at(-0.25, 0.25), at(-0.25, -0.25), at(0.25, -0.25)]))
      break
    case '_BOXFILLED':
      out.fills.push([at(0.25, 0.25), at(-0.25, 0.25), at(-0.25, -0.25), at(0.25, -0.25)])
      break
    case '_DATUMBLANK':
      out.lines.push(...closed([at(0, 0.577), at(1, 0), at(0, -0.577)]))
      break
    case '_DATUMFILLED':
      out.fills.push([at(0, 0.577), at(1, 0), at(0, -0.577)])
      break
    case '_INTEGRAL': {
      // Una "S" de dos cuartos de círculo a través de la punta.
      const r = size / 2
      const quarter = (c: Vec3, a0: number): Vec3[] =>
        Array.from({ length: 7 }, (_, i) => {
          const a = a0 + (i / 6) * (Math.PI / 2)
          return add(c, add(sc(p, r * Math.cos(a)), sc(d, r * Math.sin(a))))
        })
      const q1 = quarter(add(tip, sc(p, -r)), 0)
      const q2 = quarter(add(tip, sc(p, r)), Math.PI)
      for (const q of [q1, q2]) for (let i = 0; i + 1 < q.length; i++) out.lines.push([q[i], q[i + 1]])
      break
    }
    case '_NONE':
      break
  }
  return out
}
