import type { DocumentModel } from '../document/DocumentModel'
import type { Entity } from '../document/types'
import { curveOf } from '../geom/curve'
import { hatchArea } from '../hatch/geometry'
import { measureDim } from '../dimension/dimGeometry'
import { curveArea } from '../geom/area'
import { BYLAYER } from '../linetype/linetypes'

/** Una propiedad por la que filtra QSELECT. `enum`: se elige de los valores presentes en el dibujo. */
export interface QProp {
  key: string
  label: string
  kind: 'number' | 'text' | 'enum'
  get: (e: Entity, doc: DocumentModel) => number | string | null
}

const curveLen = (e: Entity) => curveOf(e)?.length() ?? null

const COMMON: QProp[] = [
  { key: 'layer', label: 'Layer', kind: 'enum', get: (e, d) => d.layers.find((l) => l.id === e.layer)?.name ?? e.layer },
  { key: 'linetype', label: 'Linetype', kind: 'enum', get: (e) => (e.lineType ? e.lineType : BYLAYER) },
]

const BY_TYPE: Record<string, QProp[]> = {
  LINE: [
    { key: 'length', label: 'Length', kind: 'number', get: curveLen },
    { key: 'angle', label: 'Angle', kind: 'number', get: (e) => (e.type === 'LINE' ? ((Math.atan2(e.props.end[1] - e.props.start[1], e.props.end[0] - e.props.start[0]) * 180) / Math.PI + 360) % 360 : null) },
  ],
  CIRCLE: [
    { key: 'radius', label: 'Radius', kind: 'number', get: (e) => (e.type === 'CIRCLE' ? e.props.radius : null) },
    { key: 'diameter', label: 'Diameter', kind: 'number', get: (e) => (e.type === 'CIRCLE' ? 2 * e.props.radius : null) },
    { key: 'area', label: 'Area', kind: 'number', get: (e) => (e.type === 'CIRCLE' ? Math.PI * e.props.radius ** 2 : null) },
  ],
  ARC: [
    { key: 'radius', label: 'Radius', kind: 'number', get: (e) => (e.type === 'ARC' ? e.props.radius : null) },
    { key: 'length', label: 'Arc length', kind: 'number', get: curveLen },
  ],
  POLYLINE: [
    { key: 'length', label: 'Length', kind: 'number', get: curveLen },
    { key: 'area', label: 'Area', kind: 'number', get: (e) => { const c = curveOf(e); return c ? Math.abs(curveArea(c)) : null } },
    { key: 'closed', label: 'Closed', kind: 'enum', get: (e) => (e.type === 'POLYLINE' ? (e.props.closed ? 'Yes' : 'No') : null) },
  ],
  TEXT: [
    { key: 'contents', label: 'Contents', kind: 'text', get: (e) => (e.type === 'TEXT' ? e.props.text : null) },
    { key: 'height', label: 'Height', kind: 'number', get: (e) => (e.type === 'TEXT' ? e.props.height : null) },
  ],
  DIMENSION: [
    { key: 'measurement', label: 'Measurement', kind: 'number', get: (e) => (e.type === 'DIMENSION' ? measureDim(e.props) : null) },
    { key: 'style', label: 'Dim style', kind: 'enum', get: (e) => (e.type === 'DIMENSION' ? (e.props.styleName ?? 'Standard') : null) },
  ],
  INSERT: [{ key: 'name', label: 'Name', kind: 'enum', get: (e) => (e.type === 'INSERT' ? e.props.name : null) }],
  HATCH: [
    { key: 'pattern', label: 'Pattern', kind: 'enum', get: (e) => (e.type === 'HATCH' ? e.props.pattern : null) },
    { key: 'area', label: 'Area', kind: 'number', get: (e) => (e.type === 'HATCH' ? hatchArea(e.props) : null) },
  ],
}

/** Propiedades disponibles para un tipo de objeto (null = varios tipos: sólo las comunes). */
export function qselectProps(type: string | null): QProp[] {
  return type ? [...COMMON, ...(BY_TYPE[type] ?? [])] : COMMON
}

export type QOperator = '=' | '<>' | '>' | '<' | '*' | 'all'

export interface QSelectQuery {
  type: string | null
  prop: string
  op: QOperator
  value: string
}

const wild = (pat: string) => new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'is')

/** Los objetos de `scope` que cumplen la consulta (números con tolerancia relativa de 1e-6 para `=`). */
export function qselectMatch(doc: DocumentModel, scope: Entity[], q: QSelectQuery): Entity[] {
  const prop = qselectProps(q.type).find((p) => p.key === q.prop)
  return scope.filter((e) => {
    if (q.type && e.type !== q.type) return false
    if (q.op === 'all' || !prop) return true
    const v = prop.get(e, doc)
    if (v === null) return false
    if (typeof v === 'number') {
      const t = Number(q.value)
      if (!Number.isFinite(t)) return false
      const eq = Math.abs(v - t) <= 1e-6 * Math.max(1, Math.abs(t))
      return q.op === '=' ? eq : q.op === '<>' ? !eq : q.op === '>' ? v > t && !eq : q.op === '<' ? v < t && !eq : false
    }
    const s = String(v)
    if (q.op === '*') return wild(q.value).test(s)
    const eq = s.toLowerCase() === q.value.toLowerCase()
    return q.op === '=' ? eq : q.op === '<>' ? !eq : q.op === '>' ? s.localeCompare(q.value) > 0 : s.localeCompare(q.value) < 0
  })
}
