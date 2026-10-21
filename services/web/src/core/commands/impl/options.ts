import type { Command } from '../types'

export const optionsCommand: Command = {
  name: 'OPTIONS',
  aliases: ['OP'],
  description: 'UI settings: theme and colors (background/grid/crosshair)',
  async run(ctx) {
    ctx.app.openOptions()
  },
}
