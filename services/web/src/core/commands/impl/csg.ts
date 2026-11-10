import type { RegionEntity, SolidEntity, SolidProps } from '../../document/types'
import type { Command, CommandContext } from '../types'
import { keepCommon } from '../../document/common'
import { regionBoolean, regionPlaneKey, type RegionOp } from '../../region/boolean'

function solidEntities(ctx: CommandContext, ids: string[]): SolidEntity[] {
  const out: SolidEntity[] = []
  for (const id of ids) {
    const e = ctx.doc.getEntity(id)
    if (e && e.type === 'SOLID3D') out.push(e)
  }
  return out
}

const clone = (p: SolidProps): SolidProps => structuredClone(p)

function regionEntities(ctx: CommandContext, ids: string[]): RegionEntity[] {
  return ids.map((id) => ctx.doc.getEntity(id)).filter((e): e is RegionEntity => e?.type === 'REGION')
}

/** Regiones agrupadas por plano: las booleanas sólo combinan regiones coplanares. */
function byPlane(rs: RegionEntity[]): RegionEntity[][] {
  const groups = new Map<string, RegionEntity[]>()
  for (const r of rs) {
    const k = regionPlaneKey(r.props)
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  return [...groups.values()]
}

/**
 * Booleana de regiones coplanares: el resultado reemplaza a las de origen con la capa y propiedades de la primera.
 * Devuelve cuántas regiones se combinaron (0 si no hubo con qué).
 */
function combineRegions(ctx: CommandContext, base: RegionEntity[], tools: RegionEntity[], op: RegionOp): number {
  if (!base.length || base.length + tools.length < 2) return 0
  const res = regionBoolean(base.map((r) => r.props), tools.map((r) => r.props), op)
  if (res) ctx.doc.addEntity(keepCommon({ type: 'REGION' as const, layer: base[0].layer, props: res }, base[0]))
  else ctx.print('Null region created - deleted.')
  for (const r of [...base, ...tools]) ctx.doc.removeEntity(r.id)
  return base.length + tools.length
}

/** UNION/INTERSECT de las regiones elegidas, plano por plano. */
function regionsAll(ctx: CommandContext, ids: string[], op: RegionOp): number {
  return byPlane(regionEntities(ctx, ids)).reduce((n, g) => n + (g.length > 1 ? combineRegions(ctx, g, [], op) : 0), 0)
}

/** El resultado de una booleana conserva la capa y el tipo de línea del primer objeto elegido (CAD clásico). */
const resultOf = (first: SolidEntity, props: SolidProps) => keepCommon({ type: 'SOLID3D' as const, layer: first.layer, props }, first)

export const unionCommand: Command = {
  name: 'UNION',
  aliases: ['UNI'],
  description: 'Boolean union of solids or coplanar regions',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (ids === null) return
    const solids = solidEntities(ctx, ids)
    const regions = regionsAll(ctx, ids, 'union')
    if (solids.length < 2 && !regions) {
      ctx.print('Select at least two solids or two coplanar regions.')
      return
    }
    if (solids.length >= 2) {
      ctx.doc.addEntity(resultOf(solids[0], { op: 'UNION', operands: solids.map((s) => clone(s.props)) }))
      for (const s of solids) ctx.doc.removeEntity(s.id)
      ctx.print(`Union of ${solids.length} solids.`)
    }
    if (regions) ctx.print(`Union of ${regions} regions.`)
    ctx.app.clearSelection()
  },
}

export const intersectCommand: Command = {
  name: 'INTERSECT',
  aliases: ['IN'],
  description: 'Boolean intersection of solids or coplanar regions',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (ids === null) return
    const solids = solidEntities(ctx, ids)
    const regions = regionsAll(ctx, ids, 'intersect')
    if (solids.length < 2 && !regions) {
      ctx.print('Select at least two solids or two coplanar regions.')
      return
    }
    if (solids.length >= 2) {
      ctx.doc.addEntity(resultOf(solids[0], { op: 'INTERSECT', operands: solids.map((s) => clone(s.props)) }))
      for (const s of solids) ctx.doc.removeEntity(s.id)
      ctx.print(`Intersection of ${solids.length} solids.`)
    }
    if (regions) ctx.print(`Intersection of ${regions} regions.`)
    ctx.app.clearSelection()
  },
}

export const subtractCommand: Command = {
  name: 'SUBTRACT',
  aliases: ['SU'],
  description: 'Boolean subtraction of solids or coplanar regions',
  async run(ctx) {
    ctx.print('Select solids, surfaces, and regions to subtract from ..')
    const baseIds = await ctx.getSelection('Select objects: ')
    if (baseIds === null || baseIds.length === 0) return
    ctx.app.clearSelection()
    ctx.print('Select solids, surfaces, and regions to subtract ..')
    const toolIds = await ctx.getSelection('Select objects: ')
    if (toolIds === null || toolIds.length === 0) return

    const bases = solidEntities(ctx, baseIds)
    // Un objeto de la base no puede ser también herramienta (restarlo de sí mismo lo borraría).
    const inBase = new Set(baseIds)
    const tools = solidEntities(ctx, toolIds).filter((t) => !inBase.has(t.id))
    const repeated = toolIds.filter((id) => inBase.has(id)).length
    if (repeated) ctx.print(`${repeated} object(s) already chosen to subtract from were ignored.`)
    // Regiones: las herramientas de cada plano se restan de las bases de ese plano.
    const toolRegions = regionEntities(ctx, toolIds).filter((t) => !inBase.has(t.id))
    let regions = 0
    for (const g of byPlane(regionEntities(ctx, baseIds))) {
      const k = regionPlaneKey(g[0].props)
      const ts = toolRegions.filter((t) => regionPlaneKey(t.props) === k)
      if (ts.length) regions += combineRegions(ctx, g, ts, 'subtract')
    }
    if (regions) ctx.print(`Subtracted regions: ${regions} combined.`)
    if (bases.length === 0 || tools.length === 0) {
      if (!regions) ctx.print('Need at least one base and one tool solid or coplanar region.')
      ctx.app.clearSelection()
      return
    }
    const baseProps: SolidProps =
      bases.length > 1
        ? { op: 'UNION', operands: bases.map((b) => clone(b.props)) }
        : clone(bases[0].props)
    ctx.doc.addEntity(resultOf(bases[0], { op: 'SUBTRACT', operands: [baseProps, ...tools.map((t) => clone(t.props))] }))
    for (const s of [...bases, ...tools]) ctx.doc.removeEntity(s.id)
    ctx.app.clearSelection()
    ctx.print(`Subtracted ${tools.length} from ${bases.length}.`)
  },
}
