import { fromVec3, toVec3, type Vec3 } from '../../math'
import type { DimensionEntity, DimensionProps, Entity } from '../../document/types'
import { DIM_VAR_INFO, dimVarInfo, formatDimVar, parseDimVar, type DimVarName } from '../../dimension/style'
import { dimDisplay, dimScaleFactor } from '../../dimension/dimGeometry'
import { addManualBreak, setJog, spaceDimensions } from '../../dimension/edit'
import { crossingIds, refreshBreaks } from '../../dimension/breaks'
import { applyGrip, entityGrips } from '../../editing/grips'
import { entityOutline } from '../../editing/bounds'
import { askKeyword, askNumber } from '../ask'
import type { Command, CommandContext } from '../types'

/** Comandos de edición de cotas: DIMEDIT, DIMTEDIT, DIMSPACE, DIMBREAK, DIMJOGLINE, DIMINSPECT, DIMOVERRIDE. */

const LINEAR_LIKE = new Set(['LINEAR', 'ALIGNED'])

async function selectDims(ctx: CommandContext, prompt: string): Promise<DimensionEntity[]> {
  const ids = await ctx.getSelection(prompt)
  return (ids ?? []).map((id) => ctx.doc.getEntity(id)).filter((e): e is DimensionEntity => e?.type === 'DIMENSION')
}

/** Una cota tocada con el cursor (con el punto del clic), o null si se cancela. */
async function pickDim(ctx: CommandContext, prompt: string, ok: (d: DimensionEntity) => boolean = () => true, keywords?: string[]): Promise<{ d: DimensionEntity; at: Vec3 } | string | null> {
  for (;;) {
    const r = await ctx.getPoint(prompt, { base: null, keywords })
    if (r.kind === 'keyword') return r.keyword
    if (r.kind !== 'point') return null
    const e = r.pick?.id ? ctx.doc.getEntity(r.pick.id) : undefined
    if (e?.type === 'DIMENSION' && ok(e)) return { d: e, at: toVec3(r.point) }
    ctx.print(e?.type === 'DIMENSION' ? 'That dimension type is not supported here.' : 'Object is not a dimension.')
  }
}

/** Ángulo del texto en grados; 0 vuelve a la orientación por defecto (como el CAD clásico). */
const setTextAngle = (p: DimensionProps, deg: number) => {
  if (Math.abs(deg) < 1e-9) delete p.textAngle
  else p.textAngle = deg
}

export const dimEditCommand: Command = {
  name: 'DIMEDIT',
  aliases: ['DED', 'DIMED'],
  description: 'Edit dimension text and extension lines: Home, New text, Rotate text, Oblique extension lines',
  async run(ctx) {
    const kw = await askKeyword(ctx, 'Enter type of dimension editing [Home/New/Rotate/Oblique] <Home>: ', ['Home', 'New', 'Rotate', 'Oblique'], 'Home')
    if (!kw) return
    let apply: ((p: DimensionProps) => void) | null = null
    if (kw === 'Home') {
      apply = (p) => {
        delete p.textAt
        delete p.textAngle
      }
    } else if (kw === 'New') {
      const t = await ctx.getString('Enter new dimension text (<> = measurement, Enter = measurement only): ', { default: '' })
      if (t === null) return
      apply = (p) => {
        p.textOverride = t === '' || t === '<>' ? null : t
      }
    } else if (kw === 'Rotate') {
      const r = await askNumber(ctx, 'Specify angle for dimension text: ')
      if (r?.kind !== 'number') return
      apply = (p) => setTextAngle(p, r.value)
    }
    const dims = await selectDims(ctx, 'Select objects: ')
    if (!dims.length) return
    if (kw === 'Oblique') {
      const s = await ctx.getString('Enter obliquing angle (press ENTER for none): ', { default: '' })
      if (s === null) return
      const v = s.trim() === '' ? 0 : Number(s.replace(',', '.'))
      if (!Number.isFinite(v)) return ctx.print('Invalid angle.')
      apply = (p) => {
        if (!LINEAR_LIKE.has(p.dimType)) return
        if (Math.abs(v) < 1e-9 || Math.abs(Math.abs(v) % 180) < 1e-9) delete p.oblique
        else p.oblique = v
      }
    }
    for (const d of dims) apply?.(d.props)
    ctx.doc.touch()
  },
}

export const dimTeditCommand: Command = {
  name: 'DIMTEDIT',
  aliases: ['DIMTED'],
  description: 'Move or rotate dimension text: new location, Left, Right, Center, Home or Angle',
  async run(ctx) {
    const picked = await pickDim(ctx, 'Select dimension: ')
    if (!picked || typeof picked === 'string') return
    const e = picked.d
    const grip = entityGrips(e).find((g) => g.role.t === 'dim-text') ?? entityGrips(e).find((g) => g.role.t === 'dim-textpos')
    const r = await ctx.getPoint('Specify new location for dimension text or [Left/Right/Center/Home/Angle]: ', {
      base: null,
      keywords: ['Left', 'Right', 'Center', 'Home', 'Angle'],
      preview: (c) => {
        if (!grip) return []
        const ghost = structuredClone(e) as Entity
        applyGrip(ghost, grip, [c.x, c.y, c.z])
        return entityOutline(ghost).filter((l) => l.length >= 2).map((points) => ({ kind: 'polyline' as const, points }))
      },
    })
    const p = e.props
    if (r.kind === 'point' && grip) applyGrip(e, grip, toVec3(r.point))
    else if (r.kind === 'keyword') {
      if (r.keyword === 'Home') {
        delete p.textAt
        delete p.textAngle
      } else if (r.keyword === 'Angle') {
        const a = await ctx.getAngle('Specify angle for dimension text: ', { base: fromVec3(dimDisplay(p).text.pos) })
        if (a.kind !== 'angle') return
        setTextAngle(p, a.deg)
      } else {
        delete p.textAt
        ctx.doc.setDimensionVar(p, 'DIMJUST', r.keyword === 'Left' ? 1 : r.keyword === 'Right' ? 2 : 0)
      }
    } else return
    ctx.doc.touch()
  },
}

export const dimSpaceCommand: Command = {
  name: 'DIMSPACE',
  aliases: [],
  description: 'Space parallel linear or angular dimensions evenly (0 aligns them)',
  async run(ctx) {
    const base = await pickDim(ctx, 'Select base dimension: ', (d) => LINEAR_LIKE.has(d.props.dimType) || d.props.dimType === 'ANGULAR' || d.props.dimType === 'ARCLEN')
    if (!base || typeof base === 'string') return
    const others = (await selectDims(ctx, 'Select dimensions to space: ')).filter((d) => d.id !== base.d.id)
    if (!others.length) return
    const b = base.d.props
    const auto = 2 * b.style.DIMTXT * dimScaleFactor(b.style, { annoScale: ctx.doc.annoScale })
    const v = await askNumber(ctx, 'Enter value or [Auto] <Auto>: ', { keywords: ['Auto'], def: 'Auto', check: (x) => (x < 0 ? 'Value must be zero or positive.' : null) })
    if (!v) return
    const spacing = v.kind === 'number' ? v.value : auto
    const n = spaceDimensions(b, others.map((d) => d.props), spacing)
    ctx.print(n === others.length ? `${n} dimension(s) spaced.` : `${n} dimension(s) spaced; ${others.length - n} not parallel to the base were skipped.`)
    ctx.doc.touch()
  },
}

/** Cortes automáticos con los objetos indicados (o los que la cruzan). */
function breakWith(ctx: CommandContext, d: DimensionEntity, ids: string[] | 'auto'): number {
  const p = d.props
  const list = ids === 'auto' ? crossingIds(p, ctx.doc.entities, d.id) : ids.filter((id) => id !== d.id)
  p.breakWith = [...new Set([...(p.breakWith ?? []), ...list])]
  if (!p.breakWith.length) delete p.breakWith
  refreshBreaks(p, (id) => ctx.doc.getEntity(id))
  return list.length
}

const removeBreaks = (p: DimensionProps) => {
  delete p.breaks
  delete p.breakWith
  delete p.autoBreaks
}

export const dimBreakCommand: Command = {
  name: 'DIMBREAK',
  aliases: [],
  description: 'Break dimension and extension lines where they cross other objects (Auto/Manual/Remove)',
  async run(ctx) {
    const first = await pickDim(ctx, 'Select dimension to add/remove break or [Multiple]: ', () => true, ['Multiple'])
    if (!first) return
    if (first === 'Multiple') {
      const dims = await selectDims(ctx, 'Select dimensions: ')
      if (!dims.length) return
      const kw = await askKeyword(ctx, 'Enter an option [Break/Remove] <Break>: ', ['Break', 'Remove'], 'Break')
      if (!kw) return
      for (const d of dims) {
        if (kw === 'Remove') removeBreaks(d.props)
        else breakWith(ctx, d, 'auto')
      }
      ctx.print(`${dims.length} object(s) modified.`)
      ctx.doc.touch()
      return
    }
    if (typeof first === 'string') return
    const d = first.d
    const ids: string[] = []
    for (;;) {
      const r = await ctx.getPoint(ids.length ? 'Select object to break dimension: ' : 'Select object to break dimension or [Auto/Manual/Remove] <Auto>: ', {
        base: null,
        keywords: ids.length ? [] : ['Auto', 'Manual', 'Remove'],
        enterKeyword: ids.length ? undefined : 'Auto',
      })
      if (r.kind === 'cancel') break
      if (r.kind === 'keyword') {
        if (r.keyword === 'Remove') removeBreaks(d.props)
        else if (r.keyword === 'Manual') {
          if (!LINEAR_LIKE.has(d.props.dimType)) return ctx.print('Manual breaks apply to linear and aligned dimensions.')
          const a = await ctx.getPoint('Specify first break point: ', { base: null })
          if (a.kind !== 'point') return
          const b = await ctx.getPoint('Specify second break point: ', { base: a.point })
          if (b.kind !== 'point') return
          addManualBreak(d.props, toVec3(a.point), toVec3(b.point))
        } else ctx.print(`${breakWith(ctx, d, 'auto')} object(s) break the dimension.`)
        ctx.doc.touch()
        return
      }
      const id = r.pick?.id
      if (!id || id === d.id) {
        ctx.print('No object found.')
        continue
      }
      ids.push(id)
    }
    if (ids.length) {
      breakWith(ctx, d, ids)
      ctx.print(`${ids.length} object(s) modified.`)
      ctx.doc.touch()
    }
  },
}

export const dimJoglineCommand: Command = {
  name: 'DIMJOGLINE',
  aliases: ['DJL'],
  description: 'Add or remove a jog line on a linear or aligned dimension',
  async run(ctx) {
    const r = await pickDim(ctx, 'Select dimension to add jog or [Remove]: ', (d) => LINEAR_LIKE.has(d.props.dimType), ['Remove'])
    if (!r) return
    if (r === 'Remove') {
      const rm = await pickDim(ctx, 'Select jog to remove: ', (d) => d.props.jog !== undefined)
      if (!rm || typeof rm === 'string') return
      delete rm.d.props.jog
      ctx.doc.touch()
      return
    }
    if (typeof r === 'string') return
    const at = await ctx.getPoint('Specify jog location (or press ENTER): ', { base: null, enterKeyword: 'Default' })
    if (at.kind === 'cancel') return
    setJog(r.d.props, at.kind === 'point' ? toVec3(at.point) : undefined)
    ctx.doc.touch()
  },
}

export const dimInspectCommand: Command = {
  name: 'DIMINSPECT',
  aliases: [],
  description: 'Add or remove inspection information (label, value, inspection rate) on dimensions',
  async run(ctx) {
    const kw = await askKeyword(ctx, 'Enter option [Add/Remove] <Add>: ', ['Add', 'Remove'], 'Add')
    if (!kw) return
    const dims = await selectDims(ctx, 'Select dimensions: ')
    if (!dims.length) return
    if (kw === 'Remove') {
      for (const d of dims) delete d.props.inspect
      ctx.doc.touch()
      return
    }
    const cur = dims[0].props.inspect
    const shape = await askKeyword(ctx, `Enter shape [Round/Angular/None] <${cur?.shape === 'angular' ? 'Angular' : cur?.shape === 'none' ? 'None' : 'Round'}>: `, ['Round', 'Angular', 'None'], cur?.shape === 'angular' ? 'Angular' : cur?.shape === 'none' ? 'None' : 'Round')
    if (!shape) return
    const label = await ctx.getString(`Enter label (Enter = none) <${cur?.label ?? ''}>: `, { default: cur?.label ?? '' })
    if (label === null) return
    const rate = await ctx.getString(`Enter inspection rate (Enter = none) <${cur?.rate ?? '100%'}>: `, { default: cur?.rate ?? '100%' })
    if (rate === null) return
    for (const d of dims) d.props.inspect = { label: label.trim(), rate: rate.trim(), shape: shape.toLowerCase() as 'round' | 'angular' | 'none' }
    ctx.doc.touch()
  },
}

export const dimOverrideCommand: Command = {
  name: 'DIMOVERRIDE',
  aliases: ['DOV', 'DIMOVER'],
  description: 'Override dimension variables on selected dimensions, or Clear their overrides',
  async run(ctx) {
    const changes: Array<[DimVarName, unknown]> = []
    for (;;) {
      const s = await ctx.getString(changes.length ? 'Enter dimension variable name to override: ' : 'Enter dimension variable name to override or [Clear overrides]: ', { default: '' })
      if (s === null) return
      const name = s.trim().toUpperCase()
      if (!name) break
      if (!changes.length && (name === 'C' || name === 'CLEAR' || name === 'CLEAR OVERRIDES')) {
        const dims = await selectDims(ctx, 'Select objects: ')
        for (const d of dims) ctx.doc.restyleDimension(d.props, undefined, undefined)
        ctx.doc.touch()
        return
      }
      const info = dimVarInfo(name)
      if (!info) {
        ctx.print(`Unknown dimension variable "${name}". Valid: ${DIM_VAR_INFO.map((v) => v.name).join(', ')}`)
        continue
      }
      const cur = ctx.doc.currentDimVars[info.name]
      const v = await ctx.getString(`Enter new value for dimension variable <${formatDimVar(info.name, cur)}>: `, { default: formatDimVar(info.name, cur) })
      if (v === null) return
      const parsed = parseDimVar(info.name, v)
      if (!parsed) {
        ctx.print('Invalid value.')
        continue
      }
      changes.push([info.name, parsed.value])
    }
    if (!changes.length) return
    const dims = await selectDims(ctx, 'Select objects: ')
    for (const d of dims) for (const [n, v] of changes) ctx.doc.setDimensionVar(d.props, n, v)
    ctx.print(`${dims.length} dimension(s) overridden.`)
    ctx.doc.touch()
  },
}
