import { Curve, GEPS, type Prim } from '../geom/curve'
import { TAU } from '../geom/arc'

/**
 * LENGTHEN: cambia la longitud de una curva abierta moviendo el extremo más cercano al
 * punto elegido. Al alargar se prolonga el tramo extremo (la línea sigue recta, el arco su círculo).
 */

export type CurveEnd = 'start' | 'end'
export type LengthenMode = 'DElta' | 'Percent' | 'Total'

/** Arco simple (no círculo) o null. */
export function arcOf(c: Curve): (Prim & { k: 'A' }) | null {
  const p = c.prims[0]
  return !c.closed && c.n === 1 && p.k === 'A' ? p : null
}

/**
 * Parámetro donde debe quedar el extremo `end` para que la curva mida `L`. Fuera del dominio,
 * prolongación del tramo extremo. Bisección sobre `u` = avance desde el extremo fijo.
 */
function paramForLength(c: Curve, end: CurveEnd, L: number): number {
  const n = c.n
  const len = (u: number): number => (end === 'end' ? c.length(0, u) : c.length(n - u, n))
  let lo = 0
  let hi = n
  while (len(hi) < L) {
    lo = hi
    hi *= 2
  }
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2
    if (len(m) < L) lo = m
    else hi = m
  }
  const u = (lo + hi) / 2
  return end === 'end' ? u : n - u
}

/** Curva con el extremo `end` desplazado para medir `L`; null si es cerrada, degenera o un arco da la vuelta. */
export function lengthenTo(c: Curve, end: CurveEnd, L: number): Curve | null {
  if (c.closed || !Number.isFinite(L) || L < GEPS) return null
  const t = paramForLength(c, end, L)
  const r = end === 'end' ? c.trimTo(0, t) : c.trimTo(t, c.n)
  if (!r || r.prims.some((p) => p.k !== 'L' && Math.abs(p.sw) >= TAU - 1e-9)) return null
  return r
}

/**
 * Longitud final según el modo. Con `angle`, `value` (grados) actúa sobre el ángulo incluido del
 * arco (delta o total); null si la curva no es un arco.
 */
export function targetLength(c: Curve, mode: LengthenMode, value: number, angle = false): number | null {
  if (angle) {
    const a = arcOf(c)
    if (!a || mode === 'Percent') return null
    const rad = (value * Math.PI) / 180
    return a.r * (mode === 'DElta' ? Math.abs(a.sw) + rad : rad)
  }
  const total = c.length()
  if (mode === 'DElta') return total + value
  if (mode === 'Percent') return (total * value) / 100
  return value
}
