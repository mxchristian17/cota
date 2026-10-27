import { toVec3, type Pt, type Vec3 } from '../../math'
import type { ArcProps, Entity } from '../../document/types'
import {
  arcFrom3Points,
  arcFromStartCenterEnd,
  arcFromStartEndAngle,
  arcFromStartEndDirection,
  arcFromStartEndRadius,
  arcIsClockwise,
  arcTangentAt,
  sweepOf,
  tessellateArc,
} from '../../geom/arc'
import { angleBulge, normalizeBulges, polylinePoints } from '../../geom/polyline'
import type { PreviewShape } from '../../preview'
import type { Command, PointResult } from '../types'
import { askAngle, askDistance, askNumber, fmt } from '../ask'
import { sysvars } from '../sysvars'

const DEG = Math.PI / 180

const asPt = (v: Vec3): Pt => ({ x: v[0], y: v[1], z: v[2] })

/** Bulge (con signo) que representa a este arco en una polilínea. */
function bulgeOf(arc: ArcProps): number {
  return angleBulge(sweepOf(arc) * (arcIsClockwise(arc) ? -1 : 1))
}

export const plineCommand: Command = {
  name: 'PLINE',
  planar: true,
  aliases: ['PL'],
  description: 'Draw a polyline with straight and arc segments (Arc/Close/Undo)',
  async run(ctx) {
    const first = await ctx.getPoint('Specify start point: ')
    if (first.kind !== 'point') return

    const verts: Vec3[] = [toVec3(first.point)]
    /** `bulges[i]` = curvatura del tramo que sale del vértice `i` (0 = recto). */
    const bulges: number[] = []
    /** Ancho de cada tramo: `[inicial, final]`; el final pasa a ser el de los siguientes. */
    const widths: Array<[number, number]> = []
    let width: [number, number] = [sysvars.PLINEWID, sysvars.PLINEWID]
    ctx.print(`Current line-width is ${fmt(sysvars.PLINEWID)}`)
    /** Width/Halfwidth: ancho inicial y final de los tramos siguientes. */
    const askWidth = async (half: boolean): Promise<boolean> => {
      const k = half ? 2 : 1
      const label = half ? 'half-width' : 'width'
      const a = await askNumber(ctx, `Specify starting ${label} <${fmt(width[1] / k)}>: `, { def: width[1] / k, check: (v) => (v >= 0 ? null : 'Requires a non-negative number.') })
      if (a?.kind !== 'number') return false
      const b = await askNumber(ctx, `Specify ending ${label} <${fmt(a.value)}>: `, { def: a.value, check: (v) => (v >= 0 ? null : 'Requires a non-negative number.') })
      if (b?.kind !== 'number') return false
      width = [a.value * k, b.value * k]
      sysvars.PLINEWID = width[1]
      return true
    }
    /** Dirección de salida del último tramo fijado (tangente), para los arcos tangentes. */
    let lastDir: Vec3 | null = null
    let arcMode = false

    const commit = (closed: boolean): void => {
      if (verts.length < 2) return
      const wide = widths.some(([a, b]) => a > 0 || b > 0)
      ctx.doc.addEntity({
        type: 'POLYLINE',
        layer: ctx.currentLayerId(),
        props: {
          vertices: verts,
          bulges: normalizeBulges(verts, bulges),
          closed,
          ...(wide ? { widths: verts.map((_, i): [number, number] => widths[i] ?? (closed && i === verts.length - 1 ? [width[0], width[1]] : [0, 0])) } : {}),
        },
      })
    }

    /** Tramos ya fijados (con sus curvas) + lo tentativo que se le agrega. */
    // Los tramos ya definidos dan snaps mientras se dibuja (extremos, medios, intersecciones…), como el CAD clásico.
    const drawnSoFar = (): Entity[] =>
      verts.length < 2 ? [] : [{ id: '__pline-in-progress', type: 'POLYLINE', layer: ctx.currentLayerId(), props: { vertices: [...verts], bulges: normalizeBulges(verts, bulges), closed: false } }]
    const previewWith = (extra: Pt[]): PreviewShape[] => {
      const fixed = polylinePoints({ vertices: verts, bulges: [...bulges], closed: false }).map(asPt)
      return [{ kind: 'polyline', points: [...fixed, ...extra] }]
    }
    const previewArc = (arc: ArcProps | null, cursor: Pt): PreviewShape[] =>
      arc ? previewWith(tessellateArc(arc).slice(1).map(asPt)) : previewWith([cursor])

    /** Fija un tramo hasta `to`, recto (`arc` nulo) o curvo. */
    const addSpan = (to: Vec3, arc: ArcProps | null): void => {
      bulges.push(arc ? bulgeOf(arc) : 0)
      widths.push([width[0], width[1]])
      width = [width[1], width[1]]
      verts.push(to)
      lastDir = arc
        ? arcTangentAt(arc, 1)
        : [to[0] - verts[verts.length - 2][0], to[1] - verts[verts.length - 2][1], 0]
    }

    /** Pide el punto final del arco y lo fija con el constructor indicado. */
    const endPointThen = async (
      prompt: string,
      build: (end: Vec3) => ArcProps | null,
    ): Promise<boolean> => {
      const prev = verts[verts.length - 1]
      const r = await ctx.getPoint(prompt, {
        base: asPt(prev),
        preview: (c) => previewArc(build(toVec3(c)), c),
      })
      if (r.kind !== 'point') return false
      const end = toVec3(r.point)
      const arc = build(end)
      if (!arc) ctx.print('That does not define an arc: a straight segment was added.')
      addSpan(end, arc)
      return true
    }

    for (;;) {
      const prev = verts[verts.length - 1]

      if (!arcMode) {
        const r = await ctx.getPoint('Specify next point or [Arc/Close/Halfwidth/Length/Undo/Width]: ', {
          base: asPt(prev),
          keywords: ['Arc', 'Close', 'Halfwidth', 'Length', 'Undo', 'Width'],
          preview: (c) => previewWith([c]),
          snapEntities: drawnSoFar(),
        })
        if (r.kind === 'cancel') {
          commit(false)
          return
        }
        if (r.kind === 'keyword') {
          if (r.keyword === 'Arc') {
            arcMode = true
            continue
          }
          if (r.keyword === 'Close') {
            commit(true)
            return
          }
          if (r.keyword === 'Width' || r.keyword === 'Halfwidth') {
            if (!(await askWidth(r.keyword === 'Halfwidth'))) {
              commit(false)
              return
            }
            continue
          }
          if (r.keyword === 'Length') {
            // Recta de ese largo en la dirección del tramo anterior (tangente si era un arco).
            if (!lastDir) {
              ctx.print('No previous segment: specify a point instead.')
              continue
            }
            const len = await askDistance(ctx, 'PLINE.length', 'Specify length of line', { base: asPt(prev) })
            if (len.kind !== 'distance') {
              commit(false)
              return
            }
            const L = Math.hypot(lastDir[0], lastDir[1]) || 1
            addSpan([prev[0] + (lastDir[0] / L) * len.value, prev[1] + (lastDir[1] / L) * len.value, prev[2]], null)
            continue
          }
          undoSpan(verts, bulges, widths)
          lastDir = exitDirection(verts, bulges)
          continue
        }
        addSpan(toVec3(r.point), null)
        continue
      }

      // --- Modo arco -------------------------------------------------------
      const keywords = ['Angle', 'CEnter', 'CLose', 'Direction', 'Halfwidth', 'Line', 'Radius', 'Second', 'Undo', 'Width']
      const r: PointResult = await ctx.getPoint(
        'Specify endpoint of arc or [Angle/CEnter/CLose/Direction/Halfwidth/Line/Radius/Second pt/Undo/Width]: ',
        {
          base: asPt(prev),
          keywords,
          snapEntities: drawnSoFar(),
          // Por defecto el arco sale **tangente** al tramo anterior (comportamiento del CAD clásico).
          preview: (c) =>
            lastDir ? previewArc(arcFromStartEndDirection(prev, toVec3(c), lastDir), c) : previewWith([c]),
        },
      )
      if (r.kind === 'cancel') {
        commit(false)
        return
      }
      if (r.kind === 'point') {
        const end = toVec3(r.point)
        if (!lastDir) {
          // Sin tramo previo no hay tangente: hace falta un punto intermedio (arco de 3 puntos).
          ctx.print('No previous segment to be tangent to: pick a second point on the arc.')
          const mid = end
          const ok = await endPointThen('Specify endpoint of arc: ', (e) => arcFrom3Points(prev, mid, e))
          if (!ok) {
            commit(false)
            return
          }
          continue
        }
        addSpan(end, arcFromStartEndDirection(prev, end, lastDir))
        continue
      }

      switch (r.keyword) {
        case 'Line':
          arcMode = false
          continue
        case 'Width':
        case 'Halfwidth':
          if (!(await askWidth(r.keyword === 'Halfwidth'))) {
            commit(false)
            return
          }
          continue
        case 'CLose': {
          const start = verts[0]
          const arc = lastDir ? arcFromStartEndDirection(prev, start, lastDir) : null
          bulges.push(arc ? bulgeOf(arc) : 0)
          widths.push([width[0], width[1]])
          commit(true)
          return
        }
        case 'Undo':
          undoSpan(verts, bulges, widths)
          lastDir = exitDirection(verts, bulges)
          continue
        case 'Angle': {
          const ang = await askAngle(ctx, 'PLINE.angle', 'Specify included angle', { base: asPt(prev) })
          if (ang.kind !== 'angle') {
            commit(false)
            return
          }
          const included = ang.deg * DEG
          if (!(await endPointThen('Specify endpoint of arc: ', (e) => arcFromStartEndAngle(prev, e, included)))) {
            commit(false)
            return
          }
          continue
        }
        case 'CEnter': {
          const c = await ctx.getPoint('Specify center point of arc: ', { base: asPt(prev) })
          if (c.kind !== 'point') {
            commit(false)
            return
          }
          const center = toVec3(c.point)
          if (!(await endPointThen('Specify endpoint of arc: ', (e) => arcFromStartCenterEnd(prev, center, e)))) {
            commit(false)
            return
          }
          continue
        }
        case 'Radius': {
          const rad = await askDistance(ctx, 'PLINE.radius', 'Specify radius of arc', { base: asPt(prev), valid: (v) => v !== 0 })
          if (rad.kind !== 'distance') {
            commit(false)
            return
          }
          if (!(await endPointThen('Specify endpoint of arc: ', (e) => arcFromStartEndRadius(prev, e, rad.value)))) {
            commit(false)
            return
          }
          continue
        }
        case 'Direction': {
          const dir = await ctx.getAngle('Specify the tangent direction from the start point of arc: ', {
            base: asPt(prev),
          })
          if (dir.kind !== 'angle') {
            commit(false)
            return
          }
          const d: Vec3 = [Math.cos(dir.deg * DEG), Math.sin(dir.deg * DEG), 0]
          if (!(await endPointThen('Specify endpoint of arc: ', (e) => arcFromStartEndDirection(prev, e, d)))) {
            commit(false)
            return
          }
          continue
        }
        default: {
          // Second pt: arco por tres puntos (inicio, intermedio, final).
          const second = await ctx.getPoint('Specify second point on arc: ', {
            base: asPt(prev),
            preview: (c) => previewWith([c]),
          })
          if (second.kind !== 'point') {
            commit(false)
            return
          }
          const mid = toVec3(second.point)
          if (!(await endPointThen('Specify endpoint of arc: ', (e) => arcFrom3Points(prev, mid, e)))) {
            commit(false)
            return
          }
          continue
        }
      }
    }
  },
}

/** Deshace el último tramo fijado (opción `Undo`). */
function undoSpan(verts: Vec3[], bulges: number[], widths: Array<[number, number]>): void {
  if (verts.length > 1) {
    verts.pop()
    bulges.pop()
    widths.pop()
  }
}

/** Dirección de salida del último tramo (para seguir dibujando arcos tangentes). */
function exitDirection(verts: Vec3[], bulges: number[]): Vec3 | null {
  const n = verts.length
  if (n < 2) return null
  const a = verts[n - 2]
  const b = verts[n - 1]
  const bulge = bulges[n - 2] ?? 0
  if (Math.abs(bulge) > 1e-12) {
    const arc = arcFromStartEndAngle(a, b, 4 * Math.atan(bulge))
    if (arc) return arcTangentAt(arc, 1)
  }
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], 0]
  return Math.hypot(d[0], d[1]) > 1e-9 ? d : null
}
