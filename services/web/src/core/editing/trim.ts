import type { Vec3 } from '../math'
import type { Entity } from '../document/types'
import { Curve, curveOf, polylineCurve, PEPS } from '../geom/curve'
import { intersectCurves } from '../geom/intersect'
import { entityOutline } from './bounds'

/**
 * TRIM / EXTEND en 2D (plano XY) con paridad el CAD clásico, sobre la abstracción `Curve`:
 * recortan y alargan **cualquier** curva (línea, arco, círculo, elipse, polilínea con bulges,
 * rectángulo, spline). Framework-agnostic y testeable.
 */

/** `PROJMODE`: None = sólo cortes reales en 3D (misma cota); Ucs/View = proyectados al plano XY. */
export type ProjMode = 'None' | 'Ucs' | 'View'

export interface EdgeOptions {
  /** `EDGEMODE`: considerar las aristas de corte/contorno **prolongadas**. */
  extend: boolean
  proj: ProjMode
}

export const DEFAULT_EDGE_OPTIONS: EdgeOptions = { extend: false, proj: 'Ucs' }

/**
 * Curvas con las que una entidad actúa como arista de corte/contorno: su propia curva o, si no es
 * una curva 2D (texto, cota, sólido…), los segmentos de su contorno.
 */
export function cuttingCurves(e: Entity): Curve[] {
  const c = curveOf(e)
  if (c) return [c]
  return entityOutline(e)
    .map((poly) => polylineCurve(poly.map((p) => [p.x, p.y, p.z] as Vec3)))
    .filter((x): x is Curve => x !== null)
}

/** Parámetros (sobre `target`) donde la cortan las aristas. */
export function cutParams(target: Curve, edges: Curve[], opt: EdgeOptions = DEFAULT_EDGE_OPTIONS): number[] {
  const ts: number[] = []
  for (const edge of edges) {
    for (const h of intersectCurves(target, edge, false, opt.extend)) {
      if (opt.proj === 'None' && Math.abs(target.pointAt(h.t1)[2] - edge.pointAt(h.t2)[2]) > 1e-6) continue
      ts.push(h.t1)
    }
  }
  return ts.sort((a, b) => a - b)
}

/**
 * Recorta de `target` el tramo que contiene el parámetro `pickT`, limitado por los cortes vecinos.
 * Devuelve los trozos que quedan (0, 1 o 2) o `null` si no hay nada que recortar ahí. Un tramo
 * central deja **dos** curvas; un círculo recortado queda como arco; una curva cerrada necesita al
 * menos dos cortes.
 */
export function trimCurve(target: Curve, edges: Curve[], pickT: number, opt: EdgeOptions = DEFAULT_EDGE_OPTIONS): Curve[] | null {
  const n = target.n
  const raw = cutParams(target, edges, opt)
  if (!target.closed) {
    const ts = raw.filter((t) => t > PEPS && t < n - PEPS)
    if (ts.length === 0) return null
    let lo = 0
    let hi = n
    for (const t of ts) {
      if (t <= pickT) lo = t
      else {
        hi = t
        break
      }
    }
    const out: Curve[] = []
    if (lo > PEPS) out.push(target.trimTo(0, lo) as Curve)
    if (hi < n - PEPS) out.push(target.trimTo(hi, n) as Curve)
    return out.filter(Boolean)
  }
  const ts = [...new Set(raw.map((t) => (t >= n - PEPS ? 0 : t)))].sort((a, b) => a - b)
  const uniq = ts.filter((t, i) => i === 0 || t - ts[i - 1] > PEPS)
  if (uniq.length < 2) return null
  // Intervalo (cíclico) que contiene al pick; se conserva el complemento.
  let k = uniq.length - 1
  for (let i = 0; i < uniq.length; i++) if (uniq[i] <= pickT) k = i
  const lo = uniq[k]
  const hi = uniq[(k + 1) % uniq.length]
  const piece = target.trimTo(hi, lo)
  return piece ? [piece] : null
}

/** Extremo de la curva más cercano (en longitud) al parámetro dado. */
export function nearestEnd(c: Curve, t: number): 'start' | 'end' {
  return c.length(0, t) <= c.length(t, c.n) ? 'start' : 'end'
}

/**
 * Alarga el extremo indicado de `target` hasta la primera arista que encuentre **más allá** de ese
 * extremo, manteniendo su naturaleza (la línea sigue recta, el arco sigue su círculo, la polilínea
 * alarga su tramo extremo). Null si no hay contorno alcanzable o la curva es cerrada.
 */
export function extendCurve(
  target: Curve,
  edges: Curve[],
  end: 'start' | 'end',
  opt: EdgeOptions = DEFAULT_EDGE_OPTIONS,
): Curve | null {
  if (target.closed) return null
  const n = target.n
  const ext = { start: end === 'start', end: end === 'end' }
  let best: number | null = null
  for (const edge of edges) {
    for (const h of intersectCurves(target, edge, ext, opt.extend)) {
      if (opt.proj === 'None' && Math.abs(target.pointAt(h.t1)[2] - edge.pointAt(h.t2)[2]) > 1e-6) continue
      if (end === 'end' && h.t1 > n + 1e-7 && (best === null || h.t1 < best)) best = h.t1
      if (end === 'start' && h.t1 < -1e-7 && (best === null || h.t1 > best)) best = h.t1
    }
  }
  if (best === null) return null
  return end === 'end' ? target.trimTo(0, best) : target.trimTo(best, n)
}
