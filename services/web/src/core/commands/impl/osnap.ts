import type { Command } from '../types'

export const osnapCommand: Command = {
  name: 'OSNAP',
  aliases: ['OS', '-OSNAP', 'DDOSNAP'],
  description: 'Configure running object snaps (endpoint, center, quadrant, intersection, …)',
  async run(ctx) {
    ctx.app.openOsnap()
  },
}
