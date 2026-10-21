import { toVec3, type Pt, type Vec3 } from '../../math'
import type { Entity } from '../../document/types'
import { profileOf } from '../../editing/extrude'
import { polylinePoints } from '../../geom/polyline'
import { revolveProfile } from '../../editing/revolve'
import { askAngle } from '../ask'
import type { Command, CommandContext } from '../types'
import { DEFAULT_SEGMENTS } from './primitives'

const DEG = Math.PI / 180
const asPt = (v: Vec3): Pt => ({ x: v[0], y: v[1], z: v[2] })

/** Perfil cerrado de una entidad para revolucionar (polilíneas con sus arcos, círculos finos). */
function revolveProfileOf(e: Entity): Vec3[] | null {
  if (e.type === 'POLYLINE') {
    if (!e.props.closed || e.props.vertices.length < 3) return null
    return polylinePoints(e.props).slice(0, -1) // el anillo viene cerrado: se quita el punto repetido
  }
  if (e.type === 'CIRCLE') {
    const [cx, cy, cz] = e.props.center
    const r = e.props.radius
    return Array.from({ length: 64 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2
      return [cx + r * Math.cos(a), cy + r * Math.sin(a), cz] as Vec3
    })
  }
  return profileOf(e)
}

/** Eje tomado de un objeto: una línea o el tramo de polilínea más cercano al punto marcado. */
function axisFromObject(e: Entity, at: Pt): [Vec3, Vec3] | null {
  if (e.type === 'LINE') return [e.props.start, e.props.end]
  if (e.type !== 'POLYLINE' || e.props.vertices.length < 2) return null
  const v = e.props.vertices
  let best: [Vec3, Vec3] | null = null
  let bd = Infinity
  const n = e.props.closed ? v.length : v.length - 1
  for (let i = 0; i < n; i++) {
    const a = v[i]
    const b = v[(i + 1) % v.length]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const L2 = dx * dx + dy * dy
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((at.x - a[0]) * dx + (at.y - a[1]) * dy) / L2)) : 0
    const d = Math.hypot(at.x - (a[0] + t * dx), at.y - (a[1] + t * dy))
    if (d < bd) {
      bd = d
      best = [a, b]
    }
  }
  return best
}

async function askAxis(ctx: CommandContext): Promise<[Vec3, Vec3] | null> {
  const r = await ctx.getPoint('Specify axis start point or define axis by [Object/X/Y/Z] <Object>: ', {
    keywords: ['Object', 'X', 'Y', 'Z'],
    enterKeyword: 'Object',
  })
  if (r.kind === 'cancel') return null
  if (r.kind === 'point') {
    const start = toVec3(r.point)
    const end = await ctx.getPoint('Specify axis endpoint: ', {
      base: r.point,
      preview: (c) => [{ kind: 'line', a: r.point, b: c }],
    })
    if (end.kind !== 'point') return null
    return [start, toVec3(end.point)]
  }
  if (r.keyword === 'Object') {
    const pick = await ctx.getPoint('Select an object to define the axis of revolution: ')
    const e = pick.kind === 'point' && pick.pick?.id ? ctx.doc.getEntity(pick.pick.id) : undefined
    const axis = e && pick.kind === 'point' ? axisFromObject(e, pick.point) : null
    if (!axis) ctx.print('The axis must be a line or a polyline segment.')
    return axis
  }
  const dir: Vec3 = r.keyword === 'X' ? [1, 0, 0] : r.keyword === 'Y' ? [0, 1, 0] : [0, 0, 1]
  return [[0, 0, 0], dir]
}

/**
 * REVOLVE: revoluciona perfiles cerrados alrededor de un eje (dos puntos, un objeto o X/Y/Z),
 * con los prompts del CAD clásico. El ángulo se recuerda (`<360>`); `STart angle` gira el punto de partida y
 * `Reverse` invierte el sentido. Los perfiles se consumen (como `DELOBJ`).
 */
export const revolveCommand: Command = {
  name: 'REVOLVE',
  planar: true,
  aliases: ['REV'],
  description: 'Revolve closed profiles about an axis into solids [Object/X/Y/Z, STart angle/Reverse]',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects to revolve: ')
    if (ids === null || ids.length === 0) return
    const items = ids
      .map((id) => ({ id, e: ctx.doc.getEntity(id) }))
      .map(({ id, e }) => ({ id, profile: e ? revolveProfileOf(e) : null }))
      .filter((x): x is { id: string; profile: Vec3[] } => x.profile !== null)
    if (items.length === 0) {
      ctx.print('No closed profile selected (use RECTANGLE, closed PLINE, POLYGON, CIRCLE or ELLIPSE).')
      return
    }
    ctx.app.clearSelection() // la selección de perfiles no debe tragarse el objeto del eje
    const axis = await askAxis(ctx)
    if (!axis) return
    const [start, end] = axis
    let startDeg = 0
    let reverse = false
    let deg: number | null = null
    while (deg === null) {
      const r = await askAngle(ctx, 'REVOLVE.angle', 'Specify angle of revolution or [STart angle/Reverse]', {
        base: asPt(start),
        initial: 360,
        keywords: ['STart', 'Reverse'],
      })
      if (r.kind === 'cancel') return
      if (r.kind === 'angle') deg = r.deg
      else if (r.keyword === 'Reverse') {
        reverse = !reverse
        ctx.print(reverse ? 'Direction reversed.' : 'Direction restored.')
      } else {
        const s = await askAngle(ctx, 'REVOLVE.start', 'Specify start angle', { base: asPt(start), initial: 0 })
        if (s.kind !== 'angle') return
        startDeg = s.deg
      }
    }
    if (Math.abs(deg) < 1e-9) return ctx.print('Invalid angle of revolution.')
    const angle = Math.max(-360, Math.min(360, deg)) * DEG * (reverse ? -1 : 1)
    let n = 0
    for (const it of items) {
      const res = revolveProfile(it.profile, start, end, angle, startDeg * DEG, DEFAULT_SEGMENTS)
      if ('error' in res) {
        ctx.print(res.error)
        continue
      }
      ctx.doc.addEntity({ type: 'SOLID3D', layer: ctx.currentLayerId(), props: res.props })
      ctx.doc.removeEntity(it.id)
      n++
    }
    if (n > 0) ctx.print(`Revolved ${n} profile(s).`)
  },
}
