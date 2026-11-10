import type { Vec3 } from '../math'
import type { HatchLoop, PolylineEntity, PolylineProps, RegionEntity, RegionProps } from '../document/types'
import { keepCommon } from '../document/common'
import { hatchArea, hatchFrame, loopPoints } from '../hatch/geometry'
import { bulgeArc, bulgeAt, polylineSpans } from '../geom/polyline'

/**
 * Geometría de una región (REGION): lazos cerrados en un plano, el primero de cada nivel par es un contorno y los de
 * nivel impar, sus agujeros (regla par-impar, la misma de los sombreados).
 */

/** El lazo como polilínea cerrada en el plano de la región. */
export function loopPolyline(loop: HatchLoop, normal?: Vec3): PolylineProps {
  return {
    vertices: loop.vertices.map((v) => [...v] as Vec3),
    ...(loop.bulges?.some((b) => b !== 0) ? { bulges: [...loop.bulges] } : {}),
    closed: true,
    ...(normal ? { normal: [...normal] as Vec3 } : {}),
  }
}

/**
 * La región como polilíneas cerradas (una por lazo) con su id: así los object snaps, el tracking y los cortes la ven
 * como sus rectas y arcos (END, MID, CEN, QUA, INT, PER, TAN…).
 */
export function regionPolylines(e: RegionEntity): PolylineEntity[] {
  return e.props.loops.map((l) => keepCommon<PolylineEntity>({ id: e.id, type: 'POLYLINE', layer: e.layer, props: loopPolyline(l, e.props.normal) }, e))
}

/** Puntos de los lazos (con los arcos tesselados), para la caja, la ventana de selección y la vista previa. */
export function regionPoints(p: RegionProps): Vec3[] {
  return p.loops.flatMap((l) => loopPoints(l, p.normal))
}

/** Área de la región: los contornos suman y los agujeros restan. */
export function regionArea(p: RegionProps): number {
  return hatchArea(p)
}

/** Perímetro: la suma de los lazos, con los arcos exactos. */
export function regionPerimeter(p: RegionProps): number {
  let total = 0
  for (const l of p.loops) {
    const pl = loopPolyline(l, p.normal)
    for (const [i, j] of polylineSpans(pl)) {
      const [a, b] = [pl.vertices[i], pl.vertices[j]]
      const c = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      const bulge = bulgeAt(pl, i)
      if (Math.abs(bulge) < 1e-12) total += c
      else {
        const th = 4 * Math.atan(Math.abs(bulge))
        total += (c / (2 * Math.sin(th / 2))) * th
      }
    }
  }
  return total
}

/** Rectas y arcos de los lazos (EXPLODE del CAD clásico). */
export function regionPieces(p: RegionProps): Array<{ type: 'LINE'; props: { start: Vec3; end: Vec3 } } | { type: 'ARC'; props: NonNullable<ReturnType<typeof bulgeArc>> }> {
  return p.loops.flatMap((l) => {
    const pl = loopPolyline(l, p.normal)
    return polylineSpans(pl).map(([i, j]) => {
      const arc = bulgeArc(pl.vertices[i], pl.vertices[j], bulgeAt(pl, i), pl.normal)
      return arc ? { type: 'ARC' as const, props: arc } : { type: 'LINE' as const, props: { start: [...pl.vertices[i]] as Vec3, end: [...pl.vertices[j]] as Vec3 } }
    })
  })
}

/** Copia con los puntos llevados por `P`; `mirror` invierte el sentido de los arcos (la normal no cambia). */
export function mapRegion(p: RegionProps, P: (v: Vec3) => Vec3, mirror = false): RegionProps {
  return {
    loops: p.loops.map((l) => ({
      vertices: l.vertices.map(P),
      ...(l.bulges ? { bulges: mirror ? l.bulges.map((b) => -b) : [...l.bulges] } : {}),
    })),
    ...(p.normal ? { normal: [...p.normal] as Vec3 } : {}),
  }
}

/** Centro de la caja de los lazos (el grip de una región). */
export function regionCenter(p: RegionProps): Vec3 {
  const pts = regionPoints(p)
  if (!pts.length) return [0, 0, 0]
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (const q of pts) for (let i = 0; i < 3; i++) {
    lo[i] = Math.min(lo[i], q[i])
    hi[i] = Math.max(hi[i], q[i])
  }
  return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
}

/** Elevación del plano de la región sobre su normal. */
export function regionElevation(p: RegionProps): number {
  return hatchFrame(p).h
}

/** Tramos de los lazos (de, a: 6 números) con los arcos tesselados, para dibujar el contorno. */
export function regionSegments(e: RegionEntity): number[][] {
  const out: number[][] = []
  for (const l of e.props.loops) {
    const v = loopPoints(l, e.props.normal)
    for (let i = 0; i < v.length; i++) out.push([...v[i], ...v[(i + 1) % v.length]])
  }
  return out
}
