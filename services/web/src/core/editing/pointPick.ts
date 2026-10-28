import type { Entity } from '../document/types'
import type { Vec3 } from '../math'
import { curveOf } from '../geom/curve'
import { entityBounds } from './bounds'

/**
 * Objeto por el que pasa un punto TECLEADO (como el CAD clásico: en "Select object…" una coordenada sobre la curva
 * la elige). Sólo curvas y puntos, a menos de `tol`; el más cercano gana. Así los multicomandos y el agente eligen
 * objetos sin clic.
 */
export function entityAtPoint(entities: Entity[], p: Vec3, tol = 1e-3): string | null {
  let best: string | null = null
  let bd = tol * Math.max(1, Math.hypot(p[0], p[1], p[2]) * 1e-3)
  for (const e of entities) {
    let d: number
    if (e.type === 'POINT') d = Math.hypot(e.props.position[0] - p[0], e.props.position[1] - p[1], e.props.position[2] - p[2])
    else {
      const c = curveOf(e)
      if (!c) continue
      const q = c.pointAt(c.paramAt(p))
      d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])
    }
    if (d <= bd) {
      best = e.id
      bd = d
    }
  }
  return best
}

/**
 * Objeto elegido con un punto TECLEADO en "Select objects:": el que pasa por el punto (curvas y puntos) o, si no hay,
 * el de caja más chica (en planta) que lo contiene (sólidos, textos, cotas, sombreados, bloques).
 */
export function selectAtPoint(entities: Entity[], p: Vec3): string | null {
  const on = entityAtPoint(entities, p)
  if (on) return on
  let best: string | null = null
  let ba = Infinity
  for (const e of entities) {
    if (curveOf(e) || e.type === 'POINT') continue
    const b = entityBounds(e)
    if (p[0] < b.minX - 1e-9 || p[0] > b.maxX + 1e-9 || p[1] < b.minY - 1e-9 || p[1] > b.maxY + 1e-9) continue
    const a = (b.maxX - b.minX) * (b.maxY - b.minY)
    if (a < ba) {
      best = e.id
      ba = a
    }
  }
  return best
}
