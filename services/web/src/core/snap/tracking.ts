import { pt, type Pt } from '../math'
import type { Entity } from '../document/types'
import type { Projector } from './SnapService'
import { segmentsOfEntity } from './segments'

/**
 * Object snap tracking (OTRACK).
 *
 * Al detenerse sobre un punto de snap, el CAD clásico lo **adquiere**; después, al mover el cursor, dibuja
 * líneas de alineación (horizontal/vertical del UCS) desde ese punto y permite capturar:
 *  1. el punto proyectado sobre una alineación,
 *  2. el cruce de **dos** alineaciones (típico: X de un punto, Y de otro),
 *  3. el cruce de una alineación con un **objeto** existente.
 *
 * Todo el cálculo es geométrico y framework-agnostic; el viewport sólo aporta la proyección a
 * píxeles, los ejes del plano de construcción y las entidades cercanas.
 */
export interface TrackingSettings {
  cursorPx: [number, number]
  project: Projector
  /** Umbral de captura en píxeles (el mismo del esnap). */
  pixelThreshold: number
  /** Direcciones (unitarias, en mundo) de las alineaciones: ejes X e Y del UCS/plano de construcción. */
  axes: [Pt, Pt]
  /** Entidades cercanas, para cruzar una alineación con geometría existente. */
  entities?: Entity[]
  /** Largo (en mundo) con que se dibujan las líneas de alineación. */
  lineLength: number
}

export interface TrackingResult {
  point: Pt
  /** Segmentos de alineación a dibujar (punteados). */
  lines: [Pt, Pt][]
}

const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y + a.z * b.z
const add = (a: Pt, b: Pt, k: number): Pt => pt(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k)
const sub = (a: Pt, b: Pt): Pt => pt(a.x - b.x, a.y - b.y, a.z - b.z)

/** Punto de la recta (o, d) más cercano a `p` (d unitario). */
function projectOnLine(o: Pt, d: Pt, p: Pt): Pt {
  return add(o, d, dot(sub(p, o), d))
}

/** Punto medio del segmento de mínima distancia entre dos rectas (su "intersección" en 3D). */
function lineLineClosest(o1: Pt, d1: Pt, o2: Pt, d2: Pt): Pt | null {
  const w = sub(o1, o2)
  const a = dot(d1, d1)
  const b = dot(d1, d2)
  const c = dot(d2, d2)
  const dd = dot(d1, w)
  const e = dot(d2, w)
  const denom = a * c - b * b
  if (Math.abs(denom) < 1e-9) return null // paralelas
  const s = (b * e - c * dd) / denom
  const t = (a * e - b * dd) / denom
  const p1 = add(o1, d1, s)
  const p2 = add(o2, d2, t)
  return pt((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, (p1.z + p2.z) / 2)
}

/** Cruce de la recta (o,d) con el segmento a→b en el plano XY (null si no se cruzan). */
function lineSegmentXY(o: Pt, d: Pt, a: Pt, b: Pt): Pt | null {
  const rx = b.x - a.x
  const ry = b.y - a.y
  // a + u·r = o + t·d  →  u = (dx·(oy−ay) − dy·(ox−ax)) / (dx·ry − dy·rx)
  const denom = d.x * ry - d.y * rx
  if (Math.abs(denom) < 1e-9) return null
  const u = (d.x * (o.y - a.y) - d.y * (o.x - a.x)) / denom
  if (u < 0 || u > 1) return null
  return pt(a.x + u * rx, a.y + u * ry, a.z + u * (b.z - a.z))
}

interface Align {
  origin: Pt
  dir: Pt
  /** Punto del cursor proyectado sobre la alineación. */
  at: Pt
  /** Distancia en píxeles entre el cursor y la alineación. */
  dpx: number
}

function pxDist(p: Pt, s: TrackingSettings): number {
  const pr = s.project(p)
  return pr ? Math.hypot(pr[0] - s.cursorPx[0], pr[1] - s.cursorPx[1]) : Infinity
}

/**
 * Resuelve la captura por tracking para el cursor actual. Devuelve `null` si el cursor no está
 * alineado con ningún punto adquirido.
 */
export function computeTracking(cursor: Pt, tracked: Pt[], s: TrackingSettings): TrackingResult | null {
  if (tracked.length === 0) return null
  const aligns: Align[] = []
  for (const origin of tracked) {
    for (const dir of s.axes) {
      const at = projectOnLine(origin, dir, cursor)
      const dpx = pxDist(at, s)
      if (dpx <= s.pixelThreshold) aligns.push({ origin, dir, at, dpx })
    }
  }
  if (aligns.length === 0) return null
  aligns.sort((a, b) => a.dpx - b.dpx)
  const best = aligns[0]
  const lineOf = (al: Align, through: Pt): [Pt, Pt] => {
    // La línea se dibuja desde el punto adquirido hasta algo más allá del punto capturado.
    const t = dot(sub(through, al.origin), al.dir)
    const end = add(al.origin, al.dir, t + Math.sign(t || 1) * s.lineLength * 0.15)
    return [al.origin, end]
  }

  // 1) Cruce de dos alineaciones distintas (de puntos u orientaciones diferentes).
  for (let i = 1; i < aligns.length; i++) {
    const other = aligns[i]
    if (other.origin === best.origin && other.dir === best.dir) continue
    const x = lineLineClosest(best.origin, best.dir, other.origin, other.dir)
    if (x && pxDist(x, s) <= 2 * s.pixelThreshold) {
      return { point: x, lines: [lineOf(best, x), lineOf(other, x)] }
    }
  }

  // 2) Cruce de la alineación con un objeto existente (el "cruce perpendicular" con geometría).
  if (s.entities && s.entities.length > 0) {
    let bestHit: { p: Pt; d: number } | null = null
    for (const e of s.entities) {
      for (const [a, b] of segmentsOfEntity(e)) {
        const hit = lineSegmentXY(best.origin, best.dir, a, b)
        if (!hit) continue
        const d = pxDist(hit, s)
        if (d <= s.pixelThreshold && (!bestHit || d < bestHit.d)) bestHit = { p: hit, d }
      }
    }
    if (bestHit) return { point: bestHit.p, lines: [lineOf(best, bestHit.p)] }
  }

  // 3) Proyección simple sobre la alineación.
  return { point: best.at, lines: [lineOf(best, best.at)] }
}
