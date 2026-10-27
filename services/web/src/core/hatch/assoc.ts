import type { Vec3 } from '../math'
import type { Entity, HatchEntity, HatchLoop, HatchProps } from '../document/types'
import { pt } from '../math'
import { rigidFromUcs, rigidPoint, rigidToUcs, transformEntity } from '../editing/rigid'
import { boundaryAt, boundaryFromObjects, boundaryIndex, type BoundaryResult } from './boundary'
import { hatchFrame, loopPoints } from './geometry'
import type { Ucs } from '../ucs'

/**
 * Sombreado asociativo: cuando cambia un objeto del contorno, se vuelve a calcular el contorno
 * con los mismos puntos internos (o con los mismos objetos, si se eligieron con *Select objects*). Si ya
 * no se puede (falta un objeto o el punto quedó afuera), el sombreado queda como está y deja de ser
 * asociativo, como en el CAD clásico.
 */

/** UCS del plano del sombreado: X/Y de `arcBasis(normal)`, origen en el del mundo (z local = elevación). */
function planeUcs(p: HatchProps): Ucs {
  const f = hatchFrame(p)
  return { origin: pt(0, 0, 0), x: f.u, y: f.v }
}

type Box = { minX: number; minY: number; maxX: number; maxY: number }

function boxOf(pts: Vec3[]): Box | null {
  if (!pts.length) return null
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const q of pts) {
    b.minX = Math.min(b.minX, q[0])
    b.minY = Math.min(b.minY, q[1])
    b.maxX = Math.max(b.maxX, q[0])
    b.maxY = Math.max(b.maxY, q[1])
  }
  return b
}

/**
 * Contorno del sombreado a partir de `sources` (entidades de mundo). Devuelve los lazos en mundo, o null si
 * no se puede rehacer.
 */
export function rebuildHatchLoops(h: HatchProps, sources: Entity[]): HatchLoop[] | null {
  const ucs = planeUcs(h)
  const toLocal = rigidToUcs(ucs)
  const toWorld = rigidFromUcs(ucs)
  const z = hatchFrame(h).h
  const local = sources.flatMap((e) => {
    const w = transformEntity(e, toLocal)
    return w ? [{ ...w, id: e.id } as Entity] : []
  })
  let res: BoundaryResult | null
  const seeds = h.assoc?.seeds
  const objects = h.assoc?.objects
  const loops: HatchLoop[] = []
  if (objects?.length) {
    // Lazos de los objetos elegidos enteros (Select objects).
    const r = boundaryFromObjects(local.filter((e) => objects.includes(e.id)), h.island)
    if (!r) return null
    loops.push(...r.loops)
  }
  if (seeds?.length) {
    const index = boundaryIndex(objects?.length ? local.filter((e) => !objects.includes(e.id)) : local, z)
    // Si el contorno se movió solo, el punto interno viaja con él (corrimiento del centro de la caja).
    const before = boxOf(h.loops.flatMap((l) => loopPoints(l, h.normal)).map((q) => rigidPoint(toLocal, q)))
    const after = boxOf(local.flatMap((e) => localPoints(e)))
    const shift: [number, number] =
      before && after ? [(after.minX + after.maxX - before.minX - before.maxX) / 2, (after.minY + after.maxY - before.minY - before.maxY) / 2] : [0, 0]
    for (const s of seeds) {
      const q = rigidPoint(toLocal, s)
      const r = boundaryAt(index, [q[0], q[1]], h.island) ?? boundaryAt(index, [q[0] + shift[0], q[1] + shift[1]], h.island)
      if (!r) return null
      loops.push(...r.loops)
    }
    res = { loops, ids: [] }
  } else res = objects?.length ? { loops, ids: [] } : boundaryFromObjects(local, h.island)
  if (!res || !res.loops.length) return null
  return res.loops.map((l) => ({ ...l, vertices: l.vertices.map((v) => rigidPoint(toWorld, v)) }))
}

/** Puntos de una entidad local (para el corrimiento de las semillas). */
function localPoints(e: Entity): Vec3[] {
  switch (e.type) {
    case 'LINE':
      return [e.props.start, e.props.end]
    case 'CIRCLE':
      return [
        [e.props.center[0] - e.props.radius, e.props.center[1] - e.props.radius, e.props.center[2]],
        [e.props.center[0] + e.props.radius, e.props.center[1] + e.props.radius, e.props.center[2]],
      ]
    case 'ARC':
      return [e.props.center]
    case 'POLYLINE':
      return e.props.vertices
    case 'RECTANGLE': {
      const [x, y, z] = e.props.corner
      return [[x, y, z], [x + e.props.width, y + e.props.height, z]]
    }
    case 'ELLIPSE':
      return [e.props.center]
    case 'SPLINE':
      return e.props.controlPoints
    default:
      return []
  }
}

/** Firma de los objetos del contorno (cambia si alguno cambia o desaparece). */
export function sourceSignature(h: HatchEntity, get: (id: string) => Entity | undefined): string {
  return JSON.stringify((h.props.assoc?.ids ?? []).map((id) => get(id)?.props ?? null))
}

export const loopsSignature = (h: HatchEntity): string => JSON.stringify(h.props.loops)
