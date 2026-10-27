import type { Command, CommandContext } from '../types'
import type { Pt } from '../../math'
import { fromVec3, toVec3 } from '../../math'
import type { PreviewShape } from '../../preview'
import { EditLog } from '../../editing/editLog'
import { cornerEdit, cutVertices, filletCorner, filletVertex, type Corner, type CornerError, type CornerResult, type VertexRule } from '../../editing/fillet'
import { chamferCorner, chamferVertex, type ChamferSpec } from '../../editing/chamfer'
import { pickCurve, type CurvePick } from '../../editing/pickCurve'
import { askKeyword, askNumber, fmt } from '../ask'
import { CHAMFEREDGE_TOOL, FILLETEDGE_TOOL, runEdgeBlend, type EdgeTool } from './filletEdge'
import { sysvars } from '../sysvars'
import { nearestEdge, solidTopology } from '../../editing/topology'

/** Lo que distingue a FILLET de CHAMFER dentro del diálogo común. */
interface CornerTool {
  status(): string
  first: string
  second: string
  polyPrompt: string
  /** Opciones de ajuste del primer prompt (Radius / Distance, Angle, mEthod). */
  settings: string[]
  /** Las mismas, en los prompts sin `Multiple` (ahí CHAMFER abrevia Method con M). */
  more: string[]
  /** Ejecuta una opción de ajuste; false = ESC. */
  option(ctx: CommandContext, keyword: string): Promise<boolean>
  /** Rechazo inmediato del primer objeto (CHAMFER sólo acepta tramos rectos). */
  check?(a: CurvePick): string | null
  corner(a: CurvePick, b: CurvePick, shift: boolean): CornerResult
  vertexRule(): VertexRule
  verb: string
  message(err: CornerError): string
  /** Variante 3D a la que se redirige si el primer pick es un sólido. */
  edges: EdgeTool
}

const nonNegative = (v: number): string | null => (v >= 0 ? null : 'Requires a nonnegative value.')
const trimLabel = (): string => (sysvars.TRIMMODE ? 'TRIM' : 'NOTRIM')

async function askTrim(ctx: CommandContext): Promise<boolean> {
  const cur = sysvars.TRIMMODE ? 'Trim' : 'No trim'
  const k = await askKeyword(ctx, `Enter Trim mode option [Trim/No trim] <${cur}>: `, ['Trim', 'No trim'], cur)
  if (k) sysvars.TRIMMODE = k === 'Trim' ? 1 : 0
  return !!k
}

/** Aplica la esquina como un solo paso del registro interno (Undo la deshace entera). */
function applyCorner(ctx: CommandContext, log: EditLog, k: Corner): void {
  const ed = cornerEdit(k, sysvars.TRIMMODE === 1)
  const size = log.size
  for (const r of ed.replace) log.replace(r.entity, r.inputs)
  // Regla del CAD clásico: la pieza nueva va a la capa común de los dos objetos, o a la actual.
  const layer = k.a.entity.layer === k.b.entity.layer ? k.a.entity.layer : ctx.currentLayerId()
  if (ed.add.length) log.add(ed.add.map((e) => ({ ...e, layer })))
  log.squash(size)
}

function previewOf(ctx: CommandContext, tool: CornerTool, a: CurvePick, cursor: Pt): PreviewShape[] {
  const b = pickCurve(ctx.doc, cursor)
  if (!b) return []
  const k = tool.corner(a, b, false)
  if ('error' in k) return []
  return cornerEdit(k, sysvars.TRIMMODE === 1).preview.map((c) => ({ kind: 'polyline', points: c.samples(48).map(fromVec3) }))
}

/** Segundo objeto: true = esquina hecha, false = error informado, null = ESC. */
async function second(ctx: CommandContext, tool: CornerTool, log: EditLog, a: CurvePick): Promise<boolean | null> {
  for (;;) {
    const r = await ctx.getPoint(tool.second, { keywords: tool.more, preview: (c) => previewOf(ctx, tool, a, c) })
    if (r.kind === 'cancel') return null
    if (r.kind === 'keyword') {
      if (!(await tool.option(ctx, r.keyword))) return null
      continue
    }
    const b = pickCurve(ctx.doc, r.point, r.pick)
    if (!b) {
      ctx.print('No object found.')
      continue
    }
    const k = tool.corner(a, b, !!r.pick?.shift)
    if ('error' in k) {
      ctx.print(tool.message(k.error))
      return false
    }
    applyCorner(ctx, log, k)
    return true
  }
}

/** Opción Polyline: todos los vértices entre tramos rectos de una polilínea. null = ESC. */
async function polyline(ctx: CommandContext, tool: CornerTool, log: EditLog): Promise<boolean | null> {
  for (;;) {
    const r = await ctx.getPoint(tool.polyPrompt, { keywords: tool.more })
    if (r.kind === 'cancel') return null
    if (r.kind === 'keyword') {
      if (!(await tool.option(ctx, r.keyword))) return null
      continue
    }
    const pk = pickCurve(ctx.doc, r.point, r.pick)
    if (!pk || (pk.entity.type !== 'POLYLINE' && pk.entity.type !== 'RECTANGLE')) {
      ctx.print('Object is not a 2D polyline.')
      continue
    }
    const res = cutVertices(pk.curve, tool.vertexRule())
    const out = res.done ? res.curve.toEntity() : null
    if (out) log.replace(pk.entity, [out])
    ctx.print(`${res.done} lines were ${tool.verb}`)
    if (res.short) ctx.print(`${res.short} were too short`)
    return res.done > 0
  }
}

/** Diálogo común de FILLET y CHAMFER: opciones, Multiple y Undo dentro del comando. */
async function runCorner(ctx: CommandContext, tool: CornerTool): Promise<void> {
  ctx.app.clearSelection()
  ctx.print(tool.status())
  const log = new EditLog(ctx.doc)
  let multiple = false
  for (;;) {
    const r = await ctx.getPoint(tool.first, { keywords: ['Undo', 'Polyline', 'Trim', 'Multiple', ...tool.settings] })
    if (r.kind === 'cancel') return
    let done: boolean | null
    if (r.kind === 'keyword') {
      if (r.keyword === 'Undo') {
        if (!log.undo()) ctx.print('Command has been completely undone.')
        continue
      }
      if (r.keyword === 'Multiple') {
        multiple = true
        continue
      }
      if (r.keyword !== 'Polyline') {
        if (!(await (r.keyword === 'Trim' ? askTrim(ctx) : tool.option(ctx, r.keyword)))) return
        continue
      }
      done = await polyline(ctx, tool, log)
    } else {
      // Picar un sólido redirige a FILLETEDGE/CHAMFEREDGE, como el CAD clásico.
      // (Un punto tipeado que cae sobre una línea 2D sigue siendo esa línea.)
      if (onSolidEdge(ctx, r) && (r.pick?.id || !pickCurve(ctx.doc, r.point, r.pick))) return runEdgeBlend(ctx, tool.edges, r)
      const a = pickCurve(ctx.doc, r.point, r.pick)
      const err = a ? (tool.check?.(a) ?? null) : 'No object found.'
      if (err || !a) {
        ctx.print(err ?? '')
        continue
      }
      done = await second(ctx, tool, log, a)
    }
    if (done === null || !multiple) return
  }
}

// --- FILLET --------------------------------------------------------------------------------------

async function askRadius(ctx: CommandContext): Promise<boolean> {
  const r = await askNumber(ctx, `Specify fillet radius <${fmt(sysvars.FILLETRAD)}>: `, { def: sysvars.FILLETRAD, check: nonNegative })
  if (r?.kind === 'number') sysvars.FILLETRAD = r.value
  return !!r
}

const FILLET_TOOL: CornerTool = {
  status: () => `Current settings: Mode = ${trimLabel()}, Radius = ${fmt(sysvars.FILLETRAD)}`,
  first: 'Select first object or [Undo/Polyline/Radius/Trim/Multiple]: ',
  second: 'Select second object or shift-select to apply corner or [Radius]: ',
  polyPrompt: 'Select 2D polyline or [Radius]: ',
  settings: ['Radius'],
  more: ['Radius'],
  option: (ctx) => askRadius(ctx),
  corner: (a, b, shift) => filletCorner(a, b, shift ? 0 : sysvars.FILLETRAD),
  vertexRule: () => filletVertex(sysvars.FILLETRAD),
  verb: 'filleted',
  edges: FILLETEDGE_TOOL,
  message: (e) =>
    ({
      tooLarge: 'Radius is too large.',
      noSolution: `No valid fillet with radius ${fmt(sysvars.FILLETRAD)}.`,
      parallel: 'Cannot fillet collinear objects.',
      coplanar: 'Objects are not coplanar.',
      same: 'Cannot fillet an object to itself.',
      notLine: 'Cannot fillet this object.',
    })[e],
}

/**
 * FILLET: redondea la esquina entre dos curvas 2D con un arco tangente de radio FILLETRAD
 * (shift-select = esquina viva), con Polyline, Trim/No trim, Multiple y Undo como el CAD clásico.
 */
/** ¿El punto toma una arista de un sólido? Picado sobre el sólido o tipeado sobre una arista (como FILLETEDGE). */
function onSolidEdge(ctx: CommandContext, r: { point: Pt; pick?: { id?: string | null } }): boolean {
  if (r.pick?.id) return ctx.doc.getEntity(r.pick.id)?.type === 'SOLID3D'
  const p = toVec3(r.point)
  return ctx.doc.entities.some((e) => {
    if (e.type !== 'SOLID3D') return false
    const topo = solidTopology(e.props)
    return !!topo && !!nearestEdge(topo, p, topo.diag * 0.05)
  })
}

export const filletCommand: Command = {
  name: 'FILLET',
  planar: true,
  aliases: ['F'],
  description: 'Round and fillet the edges of objects',
  run: (ctx) => runCorner(ctx, FILLET_TOOL),
}

// --- CHAMFER -------------------------------------------------------------------------------------

async function askChamferDistances(ctx: CommandContext): Promise<boolean> {
  const a = await askNumber(ctx, `Specify first chamfer distance <${fmt(sysvars.CHAMFERA)}>: `, { def: sysvars.CHAMFERA, check: nonNegative })
  if (a?.kind !== 'number') return false
  const b = await askNumber(ctx, `Specify second chamfer distance <${fmt(a.value)}>: `, { def: a.value, check: nonNegative })
  if (b?.kind !== 'number') return false
  ;[sysvars.CHAMFERA, sysvars.CHAMFERB, sysvars.CHAMMODE] = [a.value, b.value, 'Distance']
  return true
}

async function askChamferAngle(ctx: CommandContext): Promise<boolean> {
  const c = await askNumber(ctx, `Specify chamfer length on the first line <${fmt(sysvars.CHAMFERC)}>: `, {
    def: sysvars.CHAMFERC,
    check: nonNegative,
  })
  if (c?.kind !== 'number') return false
  const d = await askNumber(ctx, `Specify chamfer angle from the first line <${fmt(sysvars.CHAMFERD)}>: `, {
    def: sysvars.CHAMFERD,
    check: (v) => (v >= 0 && v < 180 ? null : 'Requires an angle between 0 and 180.'),
  })
  if (d?.kind !== 'number') return false
  ;[sysvars.CHAMFERC, sysvars.CHAMFERD, sysvars.CHAMMODE] = [c.value, d.value, 'Angle']
  return true
}

async function chamferOption(ctx: CommandContext, keyword: string): Promise<boolean> {
  if (keyword === 'Distance') return askChamferDistances(ctx)
  if (keyword === 'Angle') return askChamferAngle(ctx)
  const k = await askKeyword(ctx, `Enter trim method [Distance/Angle] <${sysvars.CHAMMODE}>: `, ['Distance', 'Angle'], sysvars.CHAMMODE)
  if (k) sysvars.CHAMMODE = k as typeof sysvars.CHAMMODE
  return !!k
}

const chamferSpec = (): ChamferSpec =>
  sysvars.CHAMMODE === 'Distance'
    ? { method: 'Distance', d1: sysvars.CHAMFERA, d2: sysvars.CHAMFERB }
    : { method: 'Angle', length: sysvars.CHAMFERC, angle: (sysvars.CHAMFERD * Math.PI) / 180 }

const NOT_LINE = 'Object is not a line or a 2D polyline segment.'

const CHAMFER_TOOL: CornerTool = {
  status: () =>
    sysvars.CHAMMODE === 'Distance'
      ? `(${trimLabel()} mode) Current chamfer Dist1 = ${fmt(sysvars.CHAMFERA)}, Dist2 = ${fmt(sysvars.CHAMFERB)}`
      : `(${trimLabel()} mode) Current chamfer Length = ${fmt(sysvars.CHAMFERC)}, Angle = ${fmt(sysvars.CHAMFERD)}`,
  first: 'Select first line or [Undo/Polyline/Distance/Angle/Trim/mEthod/Multiple]: ',
  second: 'Select second line or shift-select to apply corner or [Distance/Angle/Method]: ',
  polyPrompt: 'Select 2D polyline or [Distance/Angle/Method]: ',
  settings: ['Distance', 'Angle', 'mEthod'],
  more: ['Distance', 'Angle', 'Method'],
  option: chamferOption,
  check: (a) => {
    const p = a.curve.prims[Math.min(a.curve.n - 1, Math.max(0, Math.floor(a.t)))]
    return ['LINE', 'POLYLINE', 'RECTANGLE'].includes(a.curve.kind) && p.k === 'L' ? null : NOT_LINE
  },
  corner: (a, b, shift) => chamferCorner(a, b, shift ? { method: 'Distance', d1: 0, d2: 0 } : chamferSpec()),
  vertexRule: () => chamferVertex(chamferSpec()),
  verb: 'chamfered',
  edges: CHAMFEREDGE_TOOL,
  message: (e) =>
    ({
      tooLarge: 'Distance is too large.',
      noSolution: 'Lines are parallel.',
      parallel: 'Lines are parallel.',
      coplanar: 'Objects are not coplanar.',
      same: 'Cannot chamfer an object to itself.',
      notLine: NOT_LINE,
    })[e],
}

/**
 * CHAMFER: bisela la esquina entre dos tramos rectos por distancias (CHAMFERA/B) o por
 * longitud y ángulo (CHAMFERC/D), con Polyline, Trim/No trim, mEthod, Multiple y Undo.
 */
export const chamferCommand: Command = {
  name: 'CHAMFER',
  planar: true,
  aliases: ['CHA'],
  description: 'Bevel the edges of objects',
  run: (ctx) => runCorner(ctx, CHAMFER_TOOL),
}
