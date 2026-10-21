import type { Pt, Vec3 } from '../../math'
import type { Entity, HatchEntity, HatchIsland, HatchLoop, HatchProps } from '../../document/types'
import type { Command, CommandContext } from '../types'
import type { PreviewShape } from '../../preview'
import { askKeyword, askNumber, fmt, fmtShort } from '../ask'
import { boundaryAt, boundaryFromObjects, boundaryIndex, type BoundaryIndex } from '../../hatch/boundary'
import { hatchStrokes, loopPoints } from '../../hatch/geometry'
import { hatchPattern, hatchPatterns, PATTERN_NAMES, SOLID, USER } from '../../hatch/patterns'
import { rebuildHatchLoops } from '../../hatch/assoc'
import { expandEntities } from '../../editing/block'
import { frozenLayerIds, hiddenLayerIds } from '../../layers/visibility'
import { isImperial } from '../../linetype/linetypes'

/**
 * HATCH, -HATCH, HATCHEDIT y -HATCHEDIT, como el CAD clásico: cada punto interno agrega el área cerrada
 * que lo contiene (con sus islas) al mismo sombreado (HPSEPARATE = 0); `Select objects` agrega los objetos
 * cerrados elegidos. El panel *Hatch Creation* cambia patrón, escala, ángulo, islas y asociatividad en vivo.
 */

const ISLANDS: HatchIsland[] = ['normal', 'outer', 'ignore']
/** Keyword interno del Enter vacío (terminar). */
const DONE = '__done'
const islandName = (i: HatchIsland): string => (i === 'normal' ? 'Normal' : i === 'outer' ? 'Outer' : 'Ignore')

/** Ajustes vigentes de sombreado (variables HP* del dibujo). */
function settings(ctx: CommandContext) {
  const v = ctx.doc.vars
  return {
    pattern: v.HPNAME.toUpperCase(),
    scale: v.HPSCALE,
    angle: (v.HPANG * Math.PI) / 180,
    spacing: v.HPSPACE,
    double: v.HPDOUBLE === 1,
    island: ISLANDS[v.HPISLANDDETECTION] ?? 'outer',
    assoc: v.HPASSOC === 1,
    origin: v.HPORIGIN ?? [0, 0],
  }
}

/** Entidades que pueden formar contornos: visibles, no congeladas, con los bloques expandidos. */
function boundarySet(ctx: CommandContext): Entity[] {
  const hidden = hiddenLayerIds(ctx.doc.layers)
  const frozen = frozenLayerIds(ctx.doc.layers)
  const visible = ctx.doc.entities.filter((e) => !hidden.has(e.layer) && !frozen.has(e.layer) && e.type !== 'HATCH')
  return expandEntities(visible, ctx.doc.blocks, { attdisp: ctx.doc.attdisp, skipLayers: frozen })
}

/** `Properties` de -HATCH: patrón (o Solid/User defined), escala y ángulo. */
async function askProperties(ctx: CommandContext): Promise<boolean> {
  const s = settings(ctx)
  for (;;) {
    const name = await ctx.getString(`Enter a pattern name or [?/Solid/User defined] <${s.pattern === USER ? 'User defined' : s.pattern}>: `, { default: s.pattern })
    if (name === null) return false
    const t = name.trim().toUpperCase()
    if (t === '?') {
      ctx.print(['SOLID', ...hatchPatterns(ctx.doc.units).map((p) => `${p.name.padEnd(9)} ${p.description}`)].join('\n'))
      continue
    }
    if (t === 'S' || t === 'SOLID') {
      ctx.doc.setVar('HPNAME', SOLID)
      return true
    }
    if (t === 'U' || t === 'USER' || t === 'USER DEFINED' || t === USER) {
      ctx.doc.setVar('HPNAME', USER)
      const a = await askNumber(ctx, `Specify angle for crosshatch lines <${fmtShort(s.angle * (180 / Math.PI))}>: `, { def: Number(fmtShort((s.angle * 180) / Math.PI)) })
      if (!a || a.kind !== 'number') return false
      ctx.doc.setVar('HPANG', a.value)
      const sp = await askNumber(ctx, `Specify spacing between the lines <${fmt(s.spacing)}>: `, { def: s.spacing, check: (v) => (v > 0 ? null : 'Requires a positive number.') })
      if (!sp || sp.kind !== 'number') return false
      ctx.doc.setVar('HPSPACE', sp.value)
      const d = await askKeyword(ctx, `Double hatch area? [Yes/No] <${s.double ? 'Y' : 'N'}>: `, ['Yes', 'No'], s.double ? 'Yes' : 'No')
      if (!d) return false
      ctx.doc.setVar('HPDOUBLE', d === 'Yes' ? 1 : 0)
      return true
    }
    const t2 = t === '' ? s.pattern : t
    if (!hatchPattern(t2, ctx.doc.units)) {
      ctx.print(`Pattern ${t2} not found.`)
      continue
    }
    ctx.doc.setVar('HPNAME', t2)
    const sc = await askNumber(ctx, `Specify a scale for the pattern <${fmt(s.scale)}>: `, { def: s.scale, check: (v) => (v > 0 ? null : 'Requires a positive number.') })
    if (!sc || sc.kind !== 'number') return false
    ctx.doc.setVar('HPSCALE', sc.value)
    const an = await askNumber(ctx, `Specify an angle for the pattern <${fmtShort((s.angle * 180) / Math.PI)}>: `, { def: Number(fmtShort((s.angle * 180) / Math.PI)) })
    if (!an || an.kind !== 'number') return false
    ctx.doc.setVar('HPANG', an.value)
    return true
  }
}

/** `Advanced`: estilo de islas y asociatividad. */
async function askAdvanced(ctx: CommandContext): Promise<void> {
  const k = await askKeyword(ctx, 'Enter an option [Island detection/Style/Associativity] <exit>: ', ['Island detection', 'Style', 'Associativity'], 'exit')
  if (!k || k === 'exit') return
  if (k === 'Associativity') {
    const a = await askKeyword(ctx, `Do you want associativity? [Yes/No] <${ctx.doc.vars.HPASSOC ? 'Y' : 'N'}>: `, ['Yes', 'No'], ctx.doc.vars.HPASSOC ? 'Yes' : 'No')
    if (a) ctx.doc.setVar('HPASSOC', a === 'Yes' ? 1 : 0)
    return
  }
  const cur = islandName(settings(ctx).island)
  const st = await askKeyword(ctx, `Enter island detection style [Ignore/Outer/Normal] <${cur}>: `, ['Ignore', 'Outer', 'Normal'], cur)
  if (st) ctx.doc.setVar('HPISLANDDETECTION', st === 'Normal' ? 0 : st === 'Outer' ? 1 : 2)
}

/** `Origin`: origen del patrón (en la UCS). */
async function askOrigin(ctx: CommandContext): Promise<void> {
  const k = await askKeyword(ctx, 'Enter an option [Use current origin/Set new origin] <Use current origin>: ', ['Use current origin', 'Set new origin'], 'Use current origin')
  if (k !== 'Set new origin') return
  const r = await ctx.getPoint('Specify origin point: ', { base: null })
  if (r.kind === 'point') ctx.doc.setVar('HPORIGIN', [r.point.x, r.point.y])
}

interface Pick {
  loops: HatchLoop[]
  ids: string[]
  seed?: Vec3
  objects?: string[]
}

function runHatch(cli: boolean) {
  return async (ctx: CommandContext): Promise<void> => {
    const picks: Pick[] = []
    let hatchId: string | null = null
    let index: BoundaryIndex | null = null
    let indexRev = -1
    const getIndex = (): BoundaryIndex => {
      // El grafo se rearma sólo si cambió el dibujo (no por el propio sombreado).
      if (!index || indexRev !== ctx.doc.revision) {
        index = boundaryIndex(boundarySet(ctx), 0)
        indexRev = ctx.doc.revision
      }
      return index
    }
    const props = (): HatchProps => {
      const s = settings(ctx)
      const ids = [...new Set(picks.flatMap((p) => p.ids))]
      const seeds = picks.flatMap((p) => (p.seed ? [p.seed] : []))
      const objects = picks.flatMap((p) => p.objects ?? [])
      const out: HatchProps = {
        loops: picks.flatMap((p) => p.loops),
        pattern: s.pattern,
        scale: s.scale,
        angle: s.angle,
        origin: [s.origin[0], s.origin[1], 0],
        island: s.island,
      }
      if (s.pattern === USER) {
        out.spacing = s.spacing
        if (s.double) out.double = true
      }
      if (isImperial(ctx.doc.units)) out.imperial = true
      if (s.assoc && ids.length) out.assoc = { ids, ...(seeds.length ? { seeds } : {}), ...(objects.length ? { objects } : {}) }
      return out
    }
    /** Crea o actualiza el sombreado de esta ejecución (uno solo, como HPSEPARATE = 0). */
    const upsert = (): boolean => {
      if (!picks.length) {
        if (hatchId) ctx.doc.removeEntity(hatchId)
        hatchId = null
        ctx.app.hatchPanel?.(cli ? null : { mode: 'create', ids: [] })
        return true
      }
      const p = props()
      if (hatchStrokes(p).tooDense) {
        ctx.print('Hatch spacing too dense, or dash size too small.')
        return false
      }
      const cur = hatchId ? ctx.doc.getEntity(hatchId) : undefined
      if (cur?.type === 'HATCH') {
        cur.props = p
        ctx.doc.forgetHatch(cur.id)
      } else hatchId = ctx.doc.addEntity({ type: 'HATCH', layer: ctx.currentLayerId(), props: p }).id
      ctx.doc.touch()
      if (!cli) ctx.app.hatchPanel?.({ mode: 'create', ids: hatchId ? [hatchId] : [] })
      return true
    }
    const preview = (c: Pt): PreviewShape[] => {
      // Vista previa del área bajo el cursor (como el resaltado del CAD clásico).
      const r = boundaryAt(getIndex(), [c.x, c.y], settings(ctx).island)
      if (!r) return []
      return r.loops.map((l) => {
        const pts = loopPoints(l).map((q) => ({ x: q[0], y: q[1], z: q[2] }))
        return { kind: 'polyline' as const, points: [...pts, pts[0]] }
      })
    }
    if (!cli) ctx.app.hatchPanel?.({ mode: 'create', ids: [] })
    let keep = !cli
    try {
      for (;;) {
        const r = cli
          ? await ctx.getPoint('Specify internal point or [Properties/Select objects/Undo/Advanced/Origin]: ', {
              base: null,
              keywords: ['Properties', 'Select objects', 'Undo', 'Advanced', 'Origin'],
              enterKeyword: DONE,
              preview,
            })
          : await ctx.getPoint('Pick internal point or [Select objects/Undo/seTtings]: ', { base: null, keywords: ['Select objects', 'Undo', 'seTtings'], enterKeyword: DONE, preview })
        // Enter termina creando el sombreado; Esc lo descarta en -HATCH (en HATCH ya quedó creado).
        if (r.kind === 'cancel') break
        if (r.kind === 'keyword' && r.keyword === DONE) {
          keep = true
          break
        }
        if (r.kind === 'keyword') {
          if (r.keyword === 'Undo') {
            if (!picks.length) ctx.print('Nothing to undo.')
            else {
              picks.pop()
              upsert()
            }
          } else if (r.keyword === 'Select objects') {
            const sel = await ctx.getSelection('Select objects: ')
            ctx.app.clearSelection()
            if (!sel?.length) continue
            const ents = sel.map((id) => ctx.doc.getEntity(id)).filter((e): e is Entity => !!e)
            const res = boundaryFromObjects(ents, settings(ctx).island)
            if (!res) {
              ctx.print('No closed objects selected: valid hatch boundary not found.')
              continue
            }
            picks.push({ loops: res.loops, ids: res.ids, objects: res.ids })
            if (!upsert()) picks.pop()
          } else if (r.keyword === 'Properties') {
            await askProperties(ctx)
            if (picks.length) upsert()
          } else if (r.keyword === 'Advanced') {
            await askAdvanced(ctx)
            if (picks.length) upsert()
          } else if (r.keyword === 'Origin') {
            await askOrigin(ctx)
            if (picks.length) upsert()
          } else if (r.keyword === 'seTtings') {
            ctx.app.hatchPanel?.({ mode: 'create', ids: hatchId ? [hatchId] : [] })
            ctx.print('Use the Hatch Creation panel to change the settings.')
          }
          continue
        }
        const p = r.point
        const res = boundaryAt(getIndex(), [p.x, p.y], settings(ctx).island)
        if (!res) {
          ctx.print('Valid hatch boundary not found.')
          continue
        }
        ctx.print('Analyzing internal islands...')
        picks.push({ loops: res.loops, ids: res.ids, seed: [p.x, p.y, p.z] })
        if (!upsert()) picks.pop()
      }
    } finally {
      ctx.app.hatchPanel?.(null)
      if (!keep && hatchId) {
        ctx.doc.removeEntity(hatchId)
        ctx.doc.touch()
      }
    }
  }
}

export const hatchCommand: Command = {
  name: 'HATCH',
  planar: true,
  aliases: ['H', 'BH', 'BHATCH'],
  description: 'Fill an enclosed area with a hatch pattern, solid fill or user lines',
  run: runHatch(false),
}

export const dashHatchCommand: Command = {
  name: '-HATCH',
  planar: true,
  aliases: ['-H', '-BHATCH'],
  description: 'Hatch from the command line (Properties, Select objects, Advanced, Origin)',
  run: runHatch(true),
}

/** Polilíneas que reproducen los lazos del sombreado (`recreate Boundary`). */
function recreateBoundary(ctx: CommandContext, h: HatchEntity): string[] {
  return h.props.loops.map(
    (l) =>
      ctx.doc.addEntity({
        type: 'POLYLINE',
        layer: h.layer,
        props: { vertices: l.vertices.map((v) => [...v] as Vec3), closed: true, ...(l.bulges ? { bulges: [...l.bulges] } : {}), ...(h.props.normal ? { normal: h.props.normal } : {}) },
      }).id,
  )
}

/** Recalcula los lazos de un sombreado con su contorno (tras cambiar el estilo de islas). */
function refresh(ctx: CommandContext, h: HatchEntity): void {
  const sources = h.props.assoc?.ids.map((id) => ctx.doc.getEntity(id))
  if (sources?.every((e): e is Entity => !!e)) {
    const loops = rebuildHatchLoops(h.props, sources)
    if (loops) h.props.loops = loops
  }
  ctx.doc.forgetHatch(h.id)
}

function runHatchEdit(cli: boolean) {
  return async (ctx: CommandContext): Promise<void> => {
    let hatches: HatchEntity[] = []
    while (!hatches.length) {
      const sel = await ctx.getSelection('Select hatch object: ')
      if (!sel?.length) return
      hatches = sel.map((id) => ctx.doc.getEntity(id)).filter((e): e is HatchEntity => e?.type === 'HATCH')
      if (!hatches.length) ctx.print('Selected object is not a hatch.')
    }
    const ids = hatches.map((h) => h.id)
    if (!cli) ctx.app.hatchPanel?.({ mode: 'edit', ids })
    try {
      for (;;) {
        const k = await askKeyword(ctx, 'Enter hatch option [Disassociate/Style/Properties/Origin/recreate Boundary] <eXit>: ', ['Disassociate', 'Style', 'Properties', 'Origin', 'recreate Boundary', 'eXit'], 'eXit')
        if (!k || k === 'eXit') return
        const live = ids.map((id) => ctx.doc.getEntity(id)).filter((e): e is HatchEntity => e?.type === 'HATCH')
        if (k === 'Disassociate') {
          for (const h of live) delete h.props.assoc
          ctx.doc.touch()
        } else if (k === 'Style') {
          const cur = islandName(live[0]?.props.island ?? 'outer')
          const st = await askKeyword(ctx, `Enter hatching style [Ignore/Outer/Normal] <${cur}>: `, ['Ignore', 'Outer', 'Normal'], cur)
          if (!st) continue
          for (const h of live) {
            h.props.island = st === 'Normal' ? 'normal' : st === 'Outer' ? 'outer' : 'ignore'
            refresh(ctx, h)
          }
          ctx.doc.touch()
        } else if (k === 'Properties') {
          // Los valores se toman como en -HATCH y se aplican a los sombreados elegidos.
          if (!(await askProperties(ctx))) continue
          const s = settings(ctx)
          for (const h of live) {
            if (h.props.pattern.toUpperCase() !== s.pattern) delete h.props.custom
            Object.assign(h.props, { pattern: s.pattern, scale: s.scale, angle: s.angle })
            if (s.pattern === USER) Object.assign(h.props, { spacing: s.spacing, double: s.double })
          }
          ctx.doc.touch()
        } else if (k === 'Origin') {
          const r = await ctx.getPoint('Specify new origin point: ', { base: null })
          if (r.kind !== 'point') continue
          for (const h of live) h.props.origin = [r.point.x, r.point.y, r.point.z]
          ctx.doc.touch()
        } else if (k === 'recreate Boundary') {
          const t = await askKeyword(ctx, 'Enter type of boundary object [Region/Polyline] <Polyline>: ', ['Region', 'Polyline'], 'Polyline')
          if (!t) continue
          if (t === 'Region') ctx.print('Regions are not supported: a polyline is created.')
          const re = await askKeyword(ctx, 'Reassociate hatch with new boundary? [Yes/No] <N>: ', ['Yes', 'No'], 'No')
          for (const h of live) {
            const made = recreateBoundary(ctx, h)
            if (re === 'Yes') {
              h.props.assoc = { ids: made, objects: made }
              ctx.doc.forgetHatch(h.id)
            }
          }
          ctx.doc.touch()
        }
      }
    } finally {
      ctx.app.hatchPanel?.(null)
    }
  }
}

export const hatchEditCommand: Command = {
  name: 'HATCHEDIT',
  aliases: ['HE'],
  description: 'Edit a hatch: pattern, scale, angle, island style, origin, associativity, boundary',
  run: runHatchEdit(false),
}

export const dashHatchEditCommand: Command = {
  name: '-HATCHEDIT',
  aliases: ['-HE'],
  description: 'Edit a hatch from the command line',
  run: runHatchEdit(true),
}

/** Variables HP* (se teclean por su nombre, como en el CAD clásico). */
function hpVar(name: 'HPSCALE' | 'HPANG' | 'HPSPACE', description: string, positive: boolean): Command {
  return {
    name,
    aliases: [],
    description,
    async run(ctx) {
      const cur = ctx.doc.vars[name]
      const r = await askNumber(ctx, `Enter new value for ${name} <${name === 'HPANG' ? fmtShort(cur) : fmt(cur)}>: `, {
        def: cur,
        check: (v) => (!positive || v > 0 ? null : 'Requires a positive number.'),
      })
      if (r?.kind === 'number') ctx.doc.setVar(name, r.value)
    },
  }
}

function hpSwitch(name: 'HPASSOC' | 'HPDOUBLE', description: string): Command {
  return {
    name,
    aliases: [],
    description,
    async run(ctx) {
      const cur = ctx.doc.vars[name]
      const r = await askNumber(ctx, `Enter new value for ${name} <${cur}>: `, { def: cur, check: (v) => (v === 0 || v === 1 ? null : 'Requires 0 or 1.') })
      if (r?.kind === 'number') ctx.doc.setVar(name, r.value as 0 | 1)
    },
  }
}

export const hatchVarCommands: Command[] = [
  {
    name: 'HPNAME',
    aliases: [],
    description: 'Default hatch pattern name',
    async run(ctx) {
      const cur = ctx.doc.vars.HPNAME
      const s = await ctx.getString(`Enter new value for HPNAME, or . for none <"${cur}">: `, { default: cur })
      if (s === null) return
      const t = s.trim().toUpperCase()
      if (t === cur) return
      if (!PATTERN_NAMES.includes(t)) ctx.print(`Pattern ${s.trim()} not found.`)
      else ctx.doc.setVar('HPNAME', t)
    },
  },
  hpVar('HPSCALE', 'Default hatch pattern scale', true),
  hpVar('HPANG', 'Default hatch pattern angle (degrees)', false),
  hpVar('HPSPACE', 'Line spacing of user defined hatches', true),
  hpSwitch('HPASSOC', 'New hatches are associative (0/1)'),
  hpSwitch('HPDOUBLE', 'User defined hatches are double hatched (0/1)'),
  {
    name: 'HPISLANDDETECTION',
    aliases: [],
    description: 'Island detection of new hatches: 0 Normal, 1 Outer, 2 Ignore',
    async run(ctx) {
      const cur = ctx.doc.vars.HPISLANDDETECTION
      const r = await askNumber(ctx, `Enter new value for HPISLANDDETECTION <${cur}>: `, { def: cur, check: (v) => ([0, 1, 2].includes(v) ? null : 'Requires 0, 1 or 2.') })
      if (r?.kind === 'number') ctx.doc.setVar('HPISLANDDETECTION', r.value as 0 | 1 | 2)
    },
  },
]
