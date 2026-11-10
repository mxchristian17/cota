import type { Entity } from '../../document/types'
import type { Command, CommandContext } from '../types'
import { askKeyword, askNumber, fmt } from '../ask'
import { boundaryAt, boundaryIndex } from '../../hatch/boundary'
import { expandEntities } from '../../editing/block'
import { boundarySet } from './hatch'

/**
 * BOUNDARY (BPOLY, -BOUNDARY) como el CAD clásico: un punto interno crea una polilínea cerrada con el contorno del área
 * que lo encierra (y sus islas, con la detección de islas). Opciones avanzadas: conjunto de contorno, islas, tipo de
 * objeto y tolerancia de huecos (HPGAPTOL): un contorno que no cierra por poco se toma como cerrado.
 */
export const boundaryCommand: Command = {
  name: 'BOUNDARY',
  planar: true,
  aliases: ['BO', 'BPOLY', '-BOUNDARY'],
  description: 'Create closed polylines from the area around a picked point [Advanced options: boundary set, islands, gap tolerance]',
  async run(ctx) {
    let set: Entity[] | null = null // conjunto de contorno: null = todo lo visible
    let islands = true
    for (;;) {
      const r = await ctx.getPoint('Specify internal point or [Advanced options]: ', { base: null, keywords: ['Advanced options'] })
      if (r.kind === 'keyword') {
        const k = await askKeyword(ctx, 'Enter an option [Boundary set/Island detection/Object type/Gap tolerance]: ', ['Boundary set', 'Island detection', 'Object type', 'Gap tolerance'])
        if (k === 'Boundary set') {
          const b = await askKeyword(ctx, 'Specify candidate set for boundary [New/Everything] <Everything>: ', ['New', 'Everything'], 'Everything')
          if (b === 'Everything') set = null
          else if (b === 'New') {
            const ids = await ctx.getSelection('Select objects: ')
            if (ids?.length) set = candidates(ctx, ids)
          }
        } else if (k === 'Island detection') {
          const y = await askKeyword(ctx, `Do you want island detection? [Yes/No] <${islands ? 'Yes' : 'No'}>: `, ['Yes', 'No'], islands ? 'Yes' : 'No')
          if (y) islands = y === 'Yes'
        } else if (k === 'Object type') {
          const t = await askKeyword(ctx, 'Enter type of boundary object [Region/Polyline] <Polyline>: ', ['Region', 'Polyline'], 'Polyline')
          if (t === 'Region') ctx.print('Regions are not available yet: the boundary is created as a closed polyline.')
        } else if (k === 'Gap tolerance') {
          const cur = ctx.doc.vars.HPGAPTOL ?? 0
          const v = await askNumber(ctx, `Specify a gap tolerance value <${fmt(cur)}>: `, { def: cur, check: (x) => (x >= 0 ? null : 'Requires a non-negative number.') })
          if (v?.kind === 'number') ctx.doc.setVar('HPGAPTOL', v.value)
        }
        continue
      }
      if (r.kind !== 'point') return
      const res = boundaryAt(boundaryIndex(set ?? boundarySet(ctx), 0, ctx.doc.vars.HPGAPTOL ?? 0), [r.point.x, r.point.y], islands ? 'outer' : 'ignore')
      if (!res) {
        ctx.print('Valid boundary not found.')
        continue
      }
      for (const loop of res.loops) {
        ctx.doc.addEntity({ type: 'POLYLINE', layer: ctx.currentLayerId(), props: { vertices: loop.vertices, ...(loop.bulges ? { bulges: loop.bulges } : {}), closed: true } })
      }
      ctx.print(`BOUNDARY created ${res.loops.length} polyline${res.loops.length === 1 ? '' : 's'}`)
    }
  },
}

/** Los objetos elegidos como conjunto de contorno (los bloques, expandidos). */
function candidates(ctx: CommandContext, ids: string[]): Entity[] {
  const ents = ids.map((id) => ctx.doc.getEntity(id)).filter((e): e is Entity => !!e)
  return expandEntities(ents, ctx.doc.blocks, { attdisp: ctx.doc.attdisp })
}
