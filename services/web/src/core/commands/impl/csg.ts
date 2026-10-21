import type { SolidEntity, SolidProps } from '../../document/types'
import type { Command, CommandContext } from '../types'

function solidEntities(ctx: CommandContext, ids: string[]): SolidEntity[] {
  const out: SolidEntity[] = []
  for (const id of ids) {
    const e = ctx.doc.getEntity(id)
    if (e && e.type === 'SOLID3D') out.push(e)
  }
  return out
}

const clone = (p: SolidProps): SolidProps => structuredClone(p)

export const unionCommand: Command = {
  name: 'UNION',
  aliases: ['UNI'],
  description: 'Boolean union of solids',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (ids === null) return
    const solids = solidEntities(ctx, ids)
    if (solids.length < 2) {
      ctx.print('Select at least two solids.')
      return
    }
    ctx.doc.addEntity({
      type: 'SOLID3D',
      layer: ctx.currentLayerId(),
      props: { op: 'UNION', operands: solids.map((s) => clone(s.props)) },
    })
    for (const s of solids) ctx.doc.removeEntity(s.id)
    ctx.app.clearSelection()
    ctx.print(`Union of ${solids.length} solids.`)
  },
}

export const intersectCommand: Command = {
  name: 'INTERSECT',
  aliases: ['IN'],
  description: 'Boolean intersection of solids',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (ids === null) return
    const solids = solidEntities(ctx, ids)
    if (solids.length < 2) {
      ctx.print('Select at least two solids.')
      return
    }
    ctx.doc.addEntity({
      type: 'SOLID3D',
      layer: ctx.currentLayerId(),
      props: { op: 'INTERSECT', operands: solids.map((s) => clone(s.props)) },
    })
    for (const s of solids) ctx.doc.removeEntity(s.id)
    ctx.app.clearSelection()
    ctx.print(`Intersection of ${solids.length} solids.`)
  },
}

export const subtractCommand: Command = {
  name: 'SUBTRACT',
  aliases: ['SU'],
  description: 'Boolean subtraction of solids',
  async run(ctx) {
    ctx.print('Select solids, surfaces, and regions to subtract from ..')
    const baseIds = await ctx.getSelection('Select objects: ')
    if (baseIds === null || baseIds.length === 0) return
    ctx.app.clearSelection()
    ctx.print('Select solids, surfaces, and regions to subtract ..')
    const toolIds = await ctx.getSelection('Select objects: ')
    if (toolIds === null || toolIds.length === 0) return

    const bases = solidEntities(ctx, baseIds)
    const tools = solidEntities(ctx, toolIds)
    if (bases.length === 0 || tools.length === 0) {
      ctx.print('Need at least one base and one tool solid.')
      return
    }
    const baseProps: SolidProps =
      bases.length > 1
        ? { op: 'UNION', operands: bases.map((b) => clone(b.props)) }
        : clone(bases[0].props)
    ctx.doc.addEntity({
      type: 'SOLID3D',
      layer: ctx.currentLayerId(),
      props: { op: 'SUBTRACT', operands: [baseProps, ...tools.map((t) => clone(t.props))] },
    })
    for (const s of [...bases, ...tools]) ctx.doc.removeEntity(s.id)
    ctx.app.clearSelection()
    ctx.print(`Subtracted ${tools.length} from ${bases.length}.`)
  },
}
