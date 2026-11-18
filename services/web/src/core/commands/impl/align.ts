import type { Command } from '../types'
import { alignIsPlanar, alignPlan, alignRigid, alignRigidTransform, alignTransform, type AlignPair } from '../../editing/align'
import { applyTransform } from '../../editing/transform'
import { ptVec } from '../../editing/pickCurve'
import { askKeyword } from '../ask'

const ORD = ['first', 'second', 'third']

/**
 * ALIGN: hasta 3 pares de puntos origen/destino (Enter termina). Con 2 pares pregunta si
 * escalar para que coincidan también los segundos puntos.
 */
export const alignCommand: Command = {
  name: 'ALIGN',
  aliases: ['AL'],
  description: 'Align objects with other objects using source/destination point pairs',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (!ids?.length) return
    const pairs: AlignPair[] = []
    for (let i = 0; i < 3; i++) {
      const s = await ctx.getPoint(`Specify ${ORD[i]} source point${i === 2 ? ' or <continue>' : ''}: `)
      if (s.kind !== 'point') {
        if (i === 0) return
        break
      }
      const d = await ctx.getPoint(`Specify ${ORD[i]} destination point: `, { base: s.point })
      if (d.kind !== 'point') return
      pairs.push({ src: ptVec(s.point), dst: ptVec(d.point) })
    }
    let scale = false
    if (pairs.length === 2) {
      const k = await askKeyword(ctx, 'Scale objects based on alignment points? [Yes/No] <No>: ', ['Yes', 'No'], 'No')
      if (!k) return
      scale = k === 'Yes'
    }
    // En el plano XY (lo de siempre, con el espejo de 3 pares); con direcciones fuera de él, el movimiento en 3D (B10).
    const plan = alignIsPlanar(pairs) ? alignPlan(pairs, scale) : null
    const rigid = plan ? null : alignRigid(pairs, scale)
    if (!plan && !rigid) {
      ctx.print('Alignment points coincide.')
      return
    }
    const { ids: done } = applyTransform(ctx.doc, ids, plan ? alignTransform(plan) : alignRigidTransform(rigid!))
    ctx.app.clearSelection()
    ctx.print(`${done.length} object(s) aligned.`)
  },
}
