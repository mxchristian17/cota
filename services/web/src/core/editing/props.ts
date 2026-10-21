import { PATTERN_NAMES, USER } from '../hatch/patterns'
import { hatchArea } from '../hatch/geometry'
import type { Vec3 } from '../math'
import type { Entity, ShadePlot } from '../document/types'
import { VIEW_NAMES, VISUAL_STYLES, type ViewName, type VisualStyle } from '../view'
import { STANDARD_SCALES, standardScale } from '../layout/scale'
import { viewAngles, viewNameOf } from '../layout/viewport'
import { arcIsClockwise, arcLength, normAngle, sweepOf } from '../geom/arc'

/**
 * Propiedades editables de una entidad (paleta de Propiedades tipo CAD clásico). Cada campo declara su
 * `kind` (número/texto/enum/booleano) y su `key`; `applyField` interpreta esa key para mutar la entidad.
 * Framework-agnostic y testeable — la UI solo renderiza los campos.
 */
export type PropField =
  | { key: string; label: string; kind: 'number'; value: number; readOnly?: boolean }
  | { key: string; label: string; kind: 'text'; value: string; readOnly?: boolean }
  | { key: string; label: string; kind: 'enum'; value: string; options: string[] }
  | { key: string; label: string; kind: 'bool'; value: boolean }

const R2D = 180 / Math.PI
const D2R = Math.PI / 180
const len3 = (v: Vec3): number => Math.hypot(v[0], v[1], v[2])

/** Campos X/Y/Z de un vector con prefijo `key`. */
function vecFields(key: string, label: string, v: Vec3): PropField[] {
  return [
    { key: `${key}.x`, label: `${label} X`, kind: 'number', value: v[0] },
    { key: `${key}.y`, label: `${label} Y`, kind: 'number', value: v[1] },
    { key: `${key}.z`, label: `${label} Z`, kind: 'number', value: v[2] },
  ]
}

const COMP: Record<string, 0 | 1 | 2> = { x: 0, y: 1, z: 2 }

const SHADE_PLOTS: ShadePlot[] = ['asDisplayed', 'wireframe', 'hidden']

/** ¿Es el árbol un sólido hoja paramétrico (no booleana/vaciado)? */
function isLeafOp(op: string): boolean {
  return ['EXTRUDE', 'BOX', 'CYLINDER', 'CONE', 'SPHERE', 'PRISM', 'REVOLVE', 'TORUS', 'SWEEP', 'LOFT'].includes(op)
}

/** Campos editables del árbol de un sólido (solo hojas paramétricas; el resto muestra la operación). */
function solidFields(e: Extract<Entity, { type: 'SOLID3D' }>): PropField[] {
  const p = e.props
  const opField: PropField = { key: '_op', label: 'Operation', kind: 'text', value: p.op, readOnly: true } as PropField
  switch (p.op) {
    case 'BOX':
      return [opField, ...vecFields('origin', 'Origin', p.origin),
        { key: 'width', label: 'Width', kind: 'number', value: p.width },
        { key: 'depth', label: 'Depth', kind: 'number', value: p.depth },
        { key: 'height', label: 'Height', kind: 'number', value: p.height }]
    case 'CYLINDER':
      return [opField, ...vecFields('base', 'Base', p.base),
        { key: 'radius', label: 'Radius', kind: 'number', value: p.radius },
        { key: 'height', label: 'Height', kind: 'number', value: p.height },
        { key: 'segments', label: 'Segments', kind: 'number', value: p.segments }]
    case 'CONE':
      return [opField, ...vecFields('base', 'Base', p.base),
        { key: 'radius', label: 'Base radius', kind: 'number', value: p.radius },
        { key: 'radiusTop', label: 'Top radius', kind: 'number', value: p.radiusTop ?? 0 },
        { key: 'height', label: 'Height', kind: 'number', value: p.height },
        { key: 'segments', label: 'Segments', kind: 'number', value: p.segments }]
    case 'SPHERE':
      return [opField, ...vecFields('center', 'Center', p.center),
        { key: 'radius', label: 'Radius', kind: 'number', value: p.radius },
        { key: 'segments', label: 'Segments', kind: 'number', value: p.segments }]
    case 'TORUS':
      return [opField, ...vecFields('center', 'Center', p.center),
        { key: 'radius', label: 'Radius', kind: 'number', value: p.radius },
        { key: 'tube', label: 'Tube radius', kind: 'number', value: p.tube },
        { key: 'segments', label: 'Segments', kind: 'number', value: p.segments }]
    case 'PRISM':
      return [opField, ...vecFields('center', 'Center', p.center),
        { key: 'radius', label: 'Radius', kind: 'number', value: p.radius },
        { key: 'sides', label: 'Sides', kind: 'number', value: p.sides },
        { key: 'height', label: 'Height', kind: 'number', value: p.height },
        { key: 'rotationDeg', label: 'Rotation°', kind: 'number', value: (p.rotation ?? 0) * R2D }]
    case 'EXTRUDE':
      return [opField, { key: 'height', label: 'Height', kind: 'number', value: p.height }]
    case 'REVOLVE':
      return [opField, ...vecFields('base', 'Axis base', p.base),
        { key: 'segments', label: 'Segments', kind: 'number', value: p.segments },
        { key: 'angleDeg', label: 'Angle°', kind: 'number', value: (p.angle ?? Math.PI * 2) * R2D }]
    case 'FILLETEDGE':
      return [opField, { key: 'radius', label: 'Radius', kind: 'number', value: p.radius }]
    case 'CHAMFEREDGE':
      return [opField,
        { key: 'd1', label: 'Distance1', kind: 'number', value: p.d1 },
        { key: 'd2', label: 'Distance2', kind: 'number', value: p.d2 }]
    default:
      return [opField] // SWEEP/LOFT/booleanas/SHELL: sólo la operación (edición por geometría, no por número)
  }
}

/** Lista de campos editables (y algunos derivados de solo lectura) de una entidad, según su tipo. */
export function entityFields(e: Entity): PropField[] {
  switch (e.type) {
    case 'LINE': {
      const s = e.props.start
      const en = e.props.end
      const length = Math.hypot(en[0] - s[0], en[1] - s[1], en[2] - s[2])
      return [
        ...vecFields('start', 'Start', s),
        ...vecFields('end', 'End', en),
        { key: '_len', label: 'Length', kind: 'number', value: length, readOnly: true },
      ]
    }
    case 'CIRCLE':
      return [
        ...vecFields('center', 'Center', e.props.center),
        { key: 'radius', label: 'Radius', kind: 'number', value: e.props.radius },
        { key: '_dia', label: 'Diameter', kind: 'number', value: e.props.radius * 2, readOnly: true },
        { key: '_area', label: 'Area', kind: 'number', value: Math.PI * e.props.radius ** 2, readOnly: true },
      ]
    case 'ARC': {
      const a = e.props
      const cw = arcIsClockwise(a)
      // Los ángulos se muestran en coordenadas de mundo (el signo del plano es un detalle interno).
      const toWorld = (ang: number): number => normAngle(cw ? -ang : ang) * R2D
      return [
        ...vecFields('center', 'Center', a.center),
        { key: 'radius', label: 'Radius', kind: 'number', value: a.radius },
        { key: 'startDeg', label: 'Start angle°', kind: 'number', value: toWorld(a.startAngle) },
        { key: 'endDeg', label: 'End angle°', kind: 'number', value: toWorld(a.endAngle) },
        { key: 'includedDeg', label: 'Total angle°', kind: 'number', value: sweepOf(a) * R2D },
        { key: '_len', label: 'Arc length', kind: 'number', value: arcLength(a), readOnly: true },
        { key: '_dir', label: 'Direction', kind: 'text', value: cw ? 'clockwise' : 'counterclockwise', readOnly: true },
      ]
    }
    case 'ELLIPSE':
      return [
        ...vecFields('center', 'Center', e.props.center),
        { key: 'majorLen', label: 'Major', kind: 'number', value: len3(e.props.major) },
        { key: 'ratio', label: 'Ratio', kind: 'number', value: e.props.ratio },
      ]
    case 'RECTANGLE':
      return [
        ...vecFields('corner', 'Corner', e.props.corner),
        { key: 'width', label: 'Width', kind: 'number', value: e.props.width },
        { key: 'height', label: 'Height', kind: 'number', value: e.props.height },
        { key: '_area', label: 'Area', kind: 'number', value: e.props.width * e.props.height, readOnly: true },
      ]
    case 'POLYLINE': {
      const w = e.props.widths
      const global = !w || w.every(([a, b]) => a === w[0][0] && b === w[0][0]) ? (w?.[0]?.[0] ?? 0) : 0
      return [
        { key: 'closed', label: 'Closed', kind: 'bool', value: e.props.closed },
        { key: '_verts', label: 'Vertices', kind: 'number', value: e.props.vertices.length, readOnly: true },
        { key: 'globalWidth', label: 'Global width', kind: 'number', value: global },
        { key: 'ltGen', label: 'Linetype generation', kind: 'bool', value: !!e.props.ltGen },
        ...(e.props.fit ? [{ key: '_fit', label: 'Fit/Smooth', kind: 'text', value: e.props.fit === 'fit' ? 'Fit' : e.props.fit === 'quadratic' ? 'Quadratic' : 'Cubic', readOnly: true } as PropField] : []),
      ]
    }
    case 'SPLINE':
      return [
        { key: 'degree', label: 'Degree', kind: 'number', value: e.props.degree },
        { key: '_cps', label: 'Control pts', kind: 'number', value: e.props.controlPoints.length, readOnly: true },
      ]
    case 'TEXT':
      return [
        ...vecFields('position', 'Insertion', e.props.position),
        { key: 'text', label: 'Text', kind: 'text', value: e.props.text },
        { key: 'height', label: 'Height', kind: 'number', value: e.props.height },
        { key: 'rotationDeg', label: 'Rotation°', kind: 'number', value: e.props.rotation * R2D },
        { key: 'justify', label: 'Justify', kind: 'enum', value: e.props.justify, options: ['left', 'center', 'right'] },
      ]
    case 'DIMENSION':
      return [
        { key: '_dimType', label: 'Dim type', kind: 'text', value: e.props.dimType, readOnly: true },
        { key: '_dimStyle', label: 'Dim style', kind: 'text', value: e.props.styleName ?? 'Standard', readOnly: true },
        { key: 'dim.DIMTXT', label: 'Text height', kind: 'number', value: e.props.style.DIMTXT },
        { key: 'dim.DIMASZ', label: 'Arrow size', kind: 'number', value: e.props.style.DIMASZ },
        { key: 'dim.DIMDEC', label: 'Precision', kind: 'number', value: e.props.style.DIMDEC },
        { key: 'textOverride', label: 'Text override', kind: 'text', value: e.props.textOverride ?? '' },
      ]
    case 'SOLID3D':
      return solidFields(e)
    case 'MESH3D':
      return [
        { key: '_verts', label: 'Vertices', kind: 'number', value: e.props.vertices.length, readOnly: true },
        { key: '_faces', label: 'Faces', kind: 'number', value: e.props.faces.length, readOnly: true },
      ]
    case 'INSERT':
      return [
        { key: '_name', label: 'Block', kind: 'text', value: e.props.name, readOnly: true },
        ...vecFields('position', 'Insertion', e.props.position),
        ...vecFields('scale', 'Scale', e.props.scale),
        { key: 'rotationDeg', label: 'Rotation°', kind: 'number', value: e.props.rotation * R2D },
        // Atributos: uno por tag, editables como en la paleta del CAD clásico.
        ...(e.props.attributes ?? []).map((a): PropField => ({ key: `attr:${a.tag}`, label: a.tag, kind: 'text', value: a.value })),
      ]
    case 'ATTDEF':
      return [
        ...vecFields('position', 'Insertion', e.props.position),
        { key: 'tag', label: 'Tag', kind: 'text', value: e.props.tag },
        { key: 'prompt', label: 'Prompt', kind: 'text', value: e.props.prompt },
        { key: 'value', label: 'Default', kind: 'text', value: e.props.value },
        { key: 'height', label: 'Height', kind: 'number', value: e.props.height },
        { key: 'rotationDeg', label: 'Rotation°', kind: 'number', value: e.props.rotation * R2D },
        { key: 'justify', label: 'Justify', kind: 'enum', value: e.props.justify, options: ['left', 'center', 'right'] },
        { key: 'invisible', label: 'Invisible', kind: 'bool', value: !!e.props.invisible },
        { key: 'constant', label: 'Constant', kind: 'bool', value: !!e.props.constant },
        { key: 'preset', label: 'Preset', kind: 'bool', value: !!e.props.preset },
      ]
    case 'VIEWPORT': {
      const p = e.props
      const view = viewNameOf(p.az, p.el)
      return [
        { key: 'center.x', label: 'Center X', kind: 'number', value: p.center[0] },
        { key: 'center.y', label: 'Center Y', kind: 'number', value: p.center[1] },
        { key: 'width', label: 'Width', kind: 'number', value: p.width },
        { key: 'height', label: 'Height', kind: 'number', value: p.height },
        { key: 'on', label: 'On', kind: 'bool', value: p.on },
        { key: '_clipped', label: 'Clipped', kind: 'text', value: p.clip ? 'Yes' : 'No', readOnly: true },
        { key: 'locked', label: 'Display locked', kind: 'bool', value: p.locked },
        {
          key: 'standardScale',
          label: 'Standard scale',
          kind: 'enum',
          value: standardScale(p.scale)?.label ?? 'Custom',
          options: [...STANDARD_SCALES.map((s) => s.label), 'Custom'],
        },
        { key: 'customScale', label: 'Custom scale', kind: 'number', value: p.scale },
        { key: 'view', label: 'View', kind: 'enum', value: view ?? 'Custom', options: [...VIEW_NAMES, 'Custom'] },
        { key: 'visualStyle', label: 'Visual style', kind: 'enum', value: p.visualStyle, options: [...VISUAL_STYLES] },
        { key: 'shadePlot', label: 'Shade plot', kind: 'enum', value: p.shadePlot, options: [...SHADE_PLOTS] },
      ]
    }
    case 'SHADE':
      return []
    case 'HATCH': {
      // Como la paleta del CAD clásico: Pattern (nombre, ángulo, escala) y Geometry (área); .
      const p = e.props
      const user = p.pattern.toUpperCase() === USER
      return [
        { key: 'pattern', label: 'Pattern name', kind: 'enum', value: p.pattern.toUpperCase(), options: p.custom ? [p.pattern.toUpperCase(), ...PATTERN_NAMES] : PATTERN_NAMES },
        { key: 'angleDeg', label: 'Angle°', kind: 'number', value: normAngle(p.angle) * R2D },
        ...(user
          ? [
              { key: 'spacing', label: 'Spacing', kind: 'number', value: p.spacing ?? 1 } as PropField,
              { key: 'double', label: 'Double', kind: 'bool', value: !!p.double } as PropField,
            ]
          : [{ key: 'scale', label: 'Scale', kind: 'number', value: p.scale } as PropField]),
        { key: '_assoc', label: 'Associative', kind: 'text', value: p.assoc ? 'Yes' : 'No', readOnly: true },
        { key: '_island', label: 'Island detection', kind: 'text', value: p.island === 'normal' ? 'Normal' : p.island === 'outer' ? 'Outer' : 'Ignore', readOnly: true },
        { key: '_area', label: 'Area', kind: 'number', value: hatchArea(p), readOnly: true },
      ]
    }
  }
}

/** Aplica un valor a la propiedad `key` de la entidad (in-place). Ignora claves de solo lectura (`_…`). */
export function applyField(e: Entity, key: string, value: number | string | boolean): void {
  if (key.startsWith('_')) return
  const num = typeof value === 'number' ? value : Number(value)
  const setComp = (v: Vec3, base: string): boolean => {
    if (!key.startsWith(base + '.')) return false
    const c = COMP[key.slice(base.length + 1)]
    if (c !== undefined && isFinite(num)) v[c] = num
    return true
  }
  switch (e.type) {
    case 'LINE':
      if (!setComp(e.props.start, 'start')) setComp(e.props.end, 'end')
      break
    case 'CIRCLE':
      if (!setComp(e.props.center, 'center') && key === 'radius') e.props.radius = Math.max(1e-6, num)
      break
    case 'ARC': {
      if (setComp(e.props.center, 'center')) break
      if (!isFinite(num)) break
      const cw = arcIsClockwise(e.props)
      const toLocal = (deg: number): number => normAngle(cw ? -deg * D2R : deg * D2R)
      if (key === 'radius') e.props.radius = Math.max(1e-6, num)
      else if (key === 'startDeg') e.props.startAngle = toLocal(num)
      else if (key === 'endDeg') e.props.endAngle = toLocal(num)
      else if (key === 'includedDeg') {
        // El ángulo total mueve el extremo final conservando el inicio y el sentido.
        const sweep = Math.min(Math.PI * 2, Math.max(1e-4, Math.abs(num) * D2R))
        e.props.endAngle = normAngle(e.props.startAngle + sweep)
      }
      break
    }
    case 'ELLIPSE':
      if (setComp(e.props.center, 'center')) break
      if (key === 'majorLen') {
        const cur = len3(e.props.major)
        if (cur > 1e-9 && num > 0) e.props.major = [(e.props.major[0] / cur) * num, (e.props.major[1] / cur) * num, (e.props.major[2] / cur) * num]
      } else if (key === 'ratio') e.props.ratio = Math.max(1e-4, num)
      break
    case 'RECTANGLE':
      if (setComp(e.props.corner, 'corner')) break
      if (key === 'width') e.props.width = num
      else if (key === 'height') e.props.height = num
      break
    case 'POLYLINE':
      if (key === 'closed') e.props.closed = Boolean(value)
      else if (key === 'globalWidth' && num >= 0) {
        if (num > 0) e.props.widths = e.props.vertices.map((): [number, number] => [num, num])
        else delete e.props.widths
      } else if (key === 'ltGen') {
        if (value) e.props.ltGen = true
        else delete e.props.ltGen
      }
      break
    case 'HATCH': {
      const p = e.props
      if (key === 'pattern' && String(value).trim()) {
        const name = String(value).trim().toUpperCase()
        if (name !== p.pattern.toUpperCase()) delete p.custom
        p.pattern = name
      } else if (key === 'angleDeg' && isFinite(num)) p.angle = num * D2R
      else if (key === 'scale' && num > 0) p.scale = num
      else if (key === 'spacing' && num > 0) p.spacing = num
      else if (key === 'double') p.double = Boolean(value)
      break
    }
    case 'SPLINE':
      if (key === 'degree') e.props.degree = Math.max(1, Math.round(num))
      break
    case 'TEXT':
      if (setComp(e.props.position, 'position')) break
      if (key === 'text') e.props.text = String(value)
      else if (key === 'height') e.props.height = Math.max(1e-6, num)
      else if (key === 'rotationDeg') e.props.rotation = num * D2R
      else if (key === 'justify' && (value === 'left' || value === 'center' || value === 'right')) e.props.justify = value
      break
    case 'DIMENSION':
      if (key.startsWith('dim.')) {
        // Override de la cota: se guarda en `overrides` y en la copia resuelta (`style`).
        const name = key.slice(4) as 'DIMTXT' | 'DIMASZ' | 'DIMDEC'
        const v = name === 'DIMDEC' ? Math.max(0, Math.round(num)) : Math.max(0, num)
        e.props.style = { ...e.props.style, [name]: v }
        e.props.overrides = { ...(e.props.overrides ?? {}), [name]: v }
      } else if (key === 'textOverride') e.props.textOverride = String(value).trim() === '' ? null : String(value)
      break
    case 'SOLID3D':
      applySolidField(e.props, key, num)
      break
    case 'INSERT': {
      if (setComp(e.props.position, 'position')) break
      if (setComp(e.props.scale, 'scale')) break
      if (key === 'rotationDeg') e.props.rotation = num * D2R
      const attr = key.startsWith('attr:') ? e.props.attributes?.find((a) => a.tag === key.slice(5)) : undefined
      if (attr) attr.value = String(value)
      break
    }
    case 'ATTDEF': {
      const p = e.props
      if (setComp(p.position, 'position')) break
      if (key === 'tag' && String(value).trim()) p.tag = String(value).trim().toUpperCase().replace(/\s+/g, '_')
      else if (key === 'prompt' || key === 'value') p[key] = String(value)
      else if (key === 'height') p.height = Math.max(1e-6, num)
      else if (key === 'rotationDeg') p.rotation = num * D2R
      else if (key === 'justify' && (value === 'left' || value === 'center' || value === 'right')) p.justify = value
      else if (key === 'invisible' || key === 'constant' || key === 'preset') {
        if (value) p[key] = true
        else delete p[key]
      }
      break
    }
    case 'VIEWPORT': {
      const p = e.props
      if (setComp(p.center, 'center')) break
      if (key === 'width' && num > 0) p.width = num
      else if (key === 'height' && num > 0) p.height = num
      else if (key === 'on' || key === 'locked') p[key] = Boolean(value)
      else if (key === 'customScale' && num > 0) p.scale = num
      else if (key === 'standardScale') {
        const s = STANDARD_SCALES.find((x) => x.label === value)
        if (s) p.scale = s.value
      } else if (key === 'view' && (VIEW_NAMES as string[]).includes(String(value))) {
        Object.assign(p, viewAngles(value as ViewName))
      } else if (key === 'visualStyle' && (VISUAL_STYLES as string[]).includes(String(value))) {
        p.visualStyle = value as VisualStyle
      } else if (key === 'shadePlot' && (SHADE_PLOTS as string[]).includes(String(value))) {
        p.shadePlot = value as ShadePlot
      }
      break
    }
    case 'MESH3D':
      break
  }
}

/** Aplica un campo numérico a la hoja de un sólido paramétrico (in-place). */
function applySolidField(p: Extract<Entity, { type: 'SOLID3D' }>['props'], key: string, num: number): void {
  if (!isFinite(num)) return
  // Redondeo/chaflán de aristas: sólo su medida, siempre positiva.
  if (p.op === 'FILLETEDGE' && key === 'radius') p.radius = Math.max(1e-6, num)
  else if (p.op === 'CHAMFEREDGE' && (key === 'd1' || key === 'd2')) p[key] = Math.max(1e-6, num)
  if (!isLeafOp(p.op)) return
  const setComp = (v: Vec3, base: string): boolean => {
    if (!key.startsWith(base + '.')) return false
    const c = COMP[key.slice(base.length + 1)]
    if (c !== undefined) v[c] = num
    return true
  }
  const seg = Math.max(3, Math.round(num))
  switch (p.op) {
    case 'BOX':
      if (setComp(p.origin, 'origin')) return
      if (key === 'width') p.width = num
      else if (key === 'depth') p.depth = num
      else if (key === 'height') p.height = num
      break
    case 'CYLINDER':
      if (setComp(p.base, 'base')) return
      if (key === 'radius') p.radius = Math.max(1e-6, num)
      else if (key === 'height') p.height = num
      else if (key === 'segments') p.segments = seg
      break
    case 'CONE':
      if (setComp(p.base, 'base')) return
      if (key === 'radius') p.radius = Math.max(1e-6, num)
      else if (key === 'radiusTop') p.radiusTop = Math.max(0, num)
      else if (key === 'height') p.height = num
      else if (key === 'segments') p.segments = seg
      break
    case 'SPHERE':
      if (setComp(p.center, 'center')) return
      if (key === 'radius') p.radius = Math.max(1e-6, num)
      else if (key === 'segments') p.segments = seg
      break
    case 'TORUS':
      if (setComp(p.center, 'center')) return
      if (key === 'radius') p.radius = Math.max(1e-6, num)
      else if (key === 'tube') p.tube = Math.max(1e-6, num)
      else if (key === 'segments') p.segments = seg
      break
    case 'PRISM':
      if (setComp(p.center, 'center')) return
      if (key === 'radius') p.radius = Math.max(1e-6, num)
      else if (key === 'sides') p.sides = Math.max(3, Math.round(num))
      else if (key === 'height') p.height = num
      else if (key === 'rotationDeg') p.rotation = num * D2R
      break
    case 'EXTRUDE':
      if (key === 'height') p.height = num
      break
    case 'REVOLVE':
      if (setComp(p.base, 'base')) return
      if (key === 'segments') p.segments = seg
      else if (key === 'angleDeg') p.angle = num * D2R
      break
  }
}
