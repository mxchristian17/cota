import { VPORT_VIEWS } from '../../view'
import { askBox, ensurePaperSpace, placeViewports } from './mview'
import type { Command } from '../types'

const OPTIONS: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4, single: 1 }

/**
 * VPORTS (VP): en Model divide la pantalla en 1–4 paneles *tiled*; en un layout crea 1–4
 * viewports flotantes contiguos con las mismas vistas, como `MVIEW n`.
 */
export const vportsCommand: Command = {
  name: 'VPORTS',
  aliases: ['VP'],
  description: 'Viewport layout [1/2/3/4]',
  async run(ctx) {
    const r = await ctx.getPoint('Number of viewports [1/2/3/4] <1>: ', {
      keywords: ['1', '2', '3', '4', 'Single'],
      enterKeyword: '1',
    })
    if (ctx.doc.activeLayout) {
      if (r.kind !== 'keyword' || !ensurePaperSpace(ctx)) return
      const n = OPTIONS[r.keyword.toLowerCase()] ?? 1
      const box = await askBox(ctx)
      // Con 3, el grande a la izquierda (TOP) como el panel de Model.
      if (box) placeViewports(ctx, box, n, n === 3 ? 'Left' : 'Vertical', VPORT_VIEWS[n].map((v) => v ?? 'TOP'))
      return
    }
    const n = r.kind === 'keyword' ? (OPTIONS[r.keyword.toLowerCase()] ?? 1) : r.kind === 'cancel' ? 1 : null
    if (n === null) return
    ctx.app.setViewportLayout(n)
    ctx.print(`Viewports: ${n}`)
  },
}
