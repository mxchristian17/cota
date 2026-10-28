import type { Command } from '../types'
import { agentBridge } from '../../agentBridge'

/** AGENT: abre o cierra el panel del agente de modelado (conversación con un LLM que maneja Cota). */
export const agentCommand: Command = {
  name: 'AGENT',
  aliases: ['AGENTPANEL'],
  description: 'Open or close the modeling agent panel: a conversation with an LLM (your own API key) that runs Cota for you',
  async run(ctx) {
    if (!agentBridge.call('toggle')) ctx.print('The agent panel needs the drawing window.')
  },
}

/** COMPACT: resume la conversación del agente para liberar contexto. */
export const compactCommand: Command = {
  name: 'COMPACT',
  aliases: [],
  description: 'Summarize the agent conversation to free its context (the drawing keeps everything built)',
  async run(ctx) {
    if (!agentBridge.call('compact')) ctx.print('No agent conversation to compact.')
  },
}
