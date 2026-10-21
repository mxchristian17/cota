import type { Pt, Vec3 } from '../math'
import type { Entity } from '../document/types'
import type { DocumentModel } from '../document/DocumentModel'
import type { PointPick } from '../commands/types'
import { Curve, curveOf } from '../geom/curve'

/** Entidad curva elegida con un click o un punto tecleado, y el parámetro del pick sobre ella. */
export interface CurvePick {
  entity: Entity
  curve: Curve
  t: number
  at: Vec3
}

export const ptVec = (p: Pt): Vec3 => [p.x, p.y, p.z]

/** Tolerancia de pick sin viewport: 2 % de la diagonal de la curva (punto tecleado). */
function pickTolerance(c: Curve): number {
  const b = c.box()
  return Math.max(1e-6, 0.02 * Math.hypot(b.maxX - b.minX, b.maxY - b.minY))
}

/**
 * Curva bajo el pick: la entidad que el viewport marcó bajo el cursor, si es una curva 2D,
 * o la curva más cercana al punto dentro de una tolerancia. El parámetro se mide sobre el punto
 * **sin snap** del click, para no quedar pegado a un extremo o intersección.
 */
export function pickCurve(
  doc: DocumentModel,
  point: Pt,
  pick?: PointPick,
  accept: (e: Entity) => boolean = () => true,
): CurvePick | null {
  const at = ptVec(pick?.raw ?? point)
  const picked = pick?.id ? doc.getEntity(pick.id) : undefined
  if (picked && accept(picked)) {
    const curve = curveOf(picked)
    if (curve) return { entity: picked, curve, t: curve.paramAt(at), at }
  }
  let best: CurvePick | null = null
  let bestD = Infinity
  for (const e of doc.entities) {
    if (!accept(e)) continue
    const curve = curveOf(e)
    if (!curve) continue
    const d = curve.distanceTo(at)
    if (d < bestD && d <= pickTolerance(curve)) {
      bestD = d
      best = { entity: e, curve, t: curve.paramAt(at), at }
    }
  }
  return best
}
