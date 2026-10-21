import { Curve, PEPS } from '../geom/curve'

/**
 * BREAK: quita de `c` el tramo entre los parámetros `t1` y `t2`.
 * - Abierta: se quita `[min, max]`; con `t1 = t2` se parte en dos sin quitar material.
 * - Cerrada: se quita el tramo que va de `t1` a `t2` en sentido **antihorario** (regla del CAD clásico);
 *   un círculo pasa a arco. Con un solo punto, la polilínea cerrada se abre ahí y el círculo o la
 *   elipse completa se rechazan (null: "Arc cannot be full 360 degrees").
 */
export function breakCurve(c: Curve, t1: number, t2: number): Curve[] | null {
  const n = c.n
  const same = Math.abs(t1 - t2) < PEPS || (c.closed && Math.abs(Math.abs(t1 - t2) - n) < PEPS)
  if (!c.closed) {
    if (same) return c.split([t1])
    const lo = Math.min(t1, t2)
    const hi = Math.max(t1, t2)
    const out: Curve[] = []
    if (lo > PEPS) out.push(c.trimTo(0, lo) as Curve)
    if (hi < n - PEPS) out.push(c.trimTo(hi, n) as Curve)
    return out
  }
  if (same) {
    if (c.n === 1) return null
    const open = c.trimTo(t1, t1)
    return open ? [open] : null
  }
  const keep = c.signedArea() > 0 ? c.trimTo(t2, t1) : c.trimTo(t1, t2)
  return keep ? [keep] : []
}
