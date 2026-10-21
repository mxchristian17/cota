import type { Command } from '../types'

export const promptCommand: Command = {
  name: 'PROMPT',
  aliases: ['AI'],
  description: 'Generate or edit the model with natural language (LLM). Opens a prompt box.',
  async run(ctx) {
    ctx.app.openAi()
  },
}
