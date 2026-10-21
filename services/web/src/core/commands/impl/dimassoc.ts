import { toVec3 } from '../../math'
import type { DimensionEntity } from '../../document/types'
import { refFor } from '../../dimension/assoc'
import { askKeyword } from '../ask'
import type { Command, CommandContext } from '../types'

/** Cotas de la selección (pre-selección o pedida). */
async function selectDims(ctx: CommandContext, prompt: string): Promise<DimensionEntity[]> {
  const ids = await ctx.getSelection(prompt)
  return (ids ?? []).map((id) => ctx.doc.getEntity(id)).filter((e): e is DimensionEntity => e?.type === 'DIMENSION')
}

/** DIMASSOC: 2 = las cotas nuevas se asocian a la geometría, 1 = no. */
export const dimAssocCommand: Command = {
  name: 'DIMASSOC',
  aliases: [],
  description: 'Associativity of new dimensions: 2 = associative, 1 = non-associative',
  async run(ctx) {
    const v = await askKeyword(ctx, `Enter new value for DIMASSOC [1/2] <${ctx.doc.dimAssoc}>: `, ['1', '2'], String(ctx.doc.dimAssoc))
    if (v) ctx.doc.setDimAssoc(v === '1' ? 1 : 2)
  },
}

export const dimDisassociateCommand: Command = {
  name: 'DIMDISASSOCIATE',
  aliases: ['DDA'],
  description: 'Remove the associativity of the selected dimensions',
  async run(ctx) {
    const dims = await selectDims(ctx, 'Select dimensions to disassociate: ')
    let n = 0
    for (const d of dims) {
      if (d.props.assoc) n++
      delete d.props.assoc
    }
    ctx.doc.touch()
    ctx.print(`${n} disassociated.`)
  },
}

export const dimReassociateCommand: Command = {
  name: 'DIMREASSOCIATE',
  aliases: ['DRE'],
  description: 'Associate the definition points of dimensions with geometry (pick a point on an object; Enter skips)',
  async run(ctx) {
    const dims = await selectDims(ctx, 'Select dimensions to reassociate: ')
    for (const d of dims) {
      const p = d.props
      const assoc = [...(p.assoc ?? p.points.map(() => null))]
      for (let i = 0; i < p.points.length; i++) {
        const r = await ctx.getPoint(`Specify point ${i + 1} of ${p.points.length} on an object <next>: `, { base: null })
        if (r.kind === 'cancel') break
        if (r.kind !== 'point') continue
        const e = r.pick?.id ? ctx.doc.getEntity(r.pick.id) : undefined
        const ref = e && e.type !== 'DIMENSION' ? refFor(e, toVec3(r.point)) : null
        if (!ref) {
          ctx.print('That point is not on an object: left as is.')
          continue
        }
        assoc[i] = ref
        p.points[i] = toVec3(r.point)
      }
      if (assoc.some(Boolean)) p.assoc = assoc
    }
    ctx.doc.touch()
  },
}

export const dimRegenCommand: Command = {
  name: 'DIMREGEN',
  aliases: [],
  description: 'Update all associative dimensions',
  async run(ctx) {
    ctx.doc.updateAssociativeDims()
    ctx.doc.restyleDimensions()
    ctx.print('Associative dimensions updated.')
  },
}
