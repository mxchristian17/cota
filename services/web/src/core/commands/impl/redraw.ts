import type { Command } from '../types'

export const redrawCommand: Command = {
  name: 'REDRAW',
  aliases: ['REGEN', 'RE', 'R'],
  description: 'Refresh/regenerate the display of all viewports',
  async run(ctx) {
    ctx.app.redraw()
    ctx.print('Regenerating model.')
  },
}
