import type { Entity, SolidProps } from '../core/document/types'
import type { Vec3 } from '../core/math'
import { entityBounds } from '../core/editing/bounds'
import { solidTopology } from '../core/editing/topology'
import { curveOf } from '../core/geom/curve'
import { arcSweep } from '../core/geom/arc'
import { solidThreads } from '../core/thread/geometry'

/** Número corto (4 decimales como mucho) para gastar pocos tokens. */
export const n = (v: number): string => String(Number(v.toFixed(4)))
export const p3 = (v: Vec3): string => `${n(v[0])},${n(v[1])},${n(v[2])}`

/** Caja envolvente 3D de un objeto: [min, max]. */
export function box3(e: Entity): [Vec3, Vec3] {
  if (e.type === 'SOLID3D' || e.type === 'MESH3D') {
    const pts = e.type === 'MESH3D' ? e.props.vertices : (solidTopology(e.props)?.verts ?? [])
    if (pts.length) {
      const lo: Vec3 = [Infinity, Infinity, Infinity]
      const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
      for (const q of pts) for (let k = 0; k < 3; k++) [lo[k], hi[k]] = [Math.min(lo[k], q[k]), Math.max(hi[k], q[k])]
      return [lo, hi]
    }
  }
  const b = entityBounds(e)
  const z = zOf(e)
  return [[b.minX, b.minY, z], [b.maxX, b.maxY, z]]
}

function zOf(e: Entity): number {
  const p = e.props as { center?: Vec3; start?: Vec3; position?: Vec3; vertices?: Vec3[]; corner?: Vec3 }
  return (p.center ?? p.start ?? p.position ?? p.corner ?? p.vertices?.[0] ?? [0, 0, 0])[2]
}

/** Resumen de un árbol de sólido: `SUBTRACT(BOX, CYLINDER)`. */
function solidSummary(p: SolidProps, depth = 0): string {
  if ('operands' in p) return depth > 2 ? p.op : `${p.op}(${p.operands.map((o) => solidSummary(o, depth + 1)).join(', ')})`
  if (p.op === 'SHELL' || p.op === 'FILLETEDGE' || p.op === 'CHAMFEREDGE') return `${p.op}(${solidSummary(p.solid, depth + 1)})`
  return p.op
}

/** Una línea paramétrica por objeto (lo que el agente ve en `query_objects`). */
export function describe(e: Entity): string {
  const p = e.props as never as Record<string, unknown>
  switch (e.type) {
    case 'LINE':
      return `LINE ${p3(e.props.start)} → ${p3(e.props.end)}`
    case 'CIRCLE':
      return `CIRCLE center ${p3(e.props.center)} r ${n(e.props.radius)}`
    case 'ARC': {
      const deg = (a: number) => n((a * 180) / Math.PI)
      const th = e.props.thread ? ` thread ${e.props.thread.designation}${e.props.thread.internal ? ' (hole)' : ''}` : ''
      return `ARC center ${p3(e.props.center)} r ${n(e.props.radius)} from ${deg(e.props.startAngle)}° sweep ${n((arcSweep(e.props.startAngle, e.props.endAngle) * 180) / Math.PI)}°${th}`
    }
    case 'POLYLINE':
    case 'RECTANGLE':
    case 'SPLINE':
    case 'ELLIPSE': {
      const c = curveOf(e)
      const v = e.type === 'POLYLINE' ? `${e.props.vertices.length} vertices${e.props.closed ? ', closed' : ''}, ` : ''
      return `${e.type} ${v}length ${c ? n(c.length()) : '?'}`
    }
    case 'POINT':
      return `POINT ${p3(e.props.position)}`
    case 'TEXT':
      return `TEXT "${e.props.text.replace(/\n/g, '\\P').slice(0, 60)}" at ${p3(e.props.position)} h ${n(e.props.height)}`
    case 'DIMENSION':
      return `DIMENSION ${e.props.dimType}${e.props.textOverride ? ` "${e.props.textOverride}"` : ''}`
    case 'INSERT':
      return `INSERT ${e.props.name} at ${p3(e.props.position)}${e.props.view ? ' (drawing view)' : ''}`
    case 'SOLID3D': {
      const th = solidThreads(e.props).map((t) => t.info.designation)
      return `SOLID3D ${solidSummary(e.props)}${th.length ? ` threads ${th.join(', ')}` : ''}`
    }
    default:
      return `${e.type}${p.name ? ` ${String(p.name)}` : ''}`
  }
}

/** Línea de `query_objects`: id, tipo, capa, caja y descripción. */
export function objectLine(e: Entity, layerName: string): string {
  const [lo, hi] = box3(e)
  return `${e.id} | ${layerName} | box ${p3(lo)} .. ${p3(hi)} | ${describe(e)}`
}
