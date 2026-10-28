import { callModel, type ChatMessage, type ProviderConfig, type ToolResultMsg } from './providers'
import { AGENT_TOOLS, runTool, type AgentHost } from './tools'
import { SYSTEM_PROMPT } from './systemPrompt'

/** Modos de aplicación: el agente ejecuta solo, o cada lote de comandos se aprueba antes (como los permisos de Claude Code). */
export type ApplyMode = 'auto' | 'ask'

export type AgentEvent =
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; name: string; args: Record<string, unknown>; result: string; isError?: boolean }
  | { kind: 'usage'; input: number; output: number }

export interface TurnOptions {
  cfg: ProviderConfig
  host: AgentHost
  mode: ApplyMode
  /** Pide aprobación de un lote (modo `ask`); false = rechazado. */
  approve: (script: string) => Promise<boolean>
  onEvent?: (e: AgentEvent) => void
  signal?: AbortSignal
  /** Máximo de llamadas al modelo por turno (corta bucles). */
  maxSteps?: number
}

/**
 * Un turno del agente: el pedido del usuario y las vueltas modelo → herramientas hasta que el modelo responde sin
 * pedir más. Devuelve la conversación completa (la que se guarda) y los tokens de la última llamada (contexto).
 */
export async function runAgentTurn(history: ChatMessage[], userText: string, o: TurnOptions): Promise<{ messages: ChatMessage[]; context: number }> {
  const messages: ChatMessage[] = [...history, { role: 'user', text: userText }]
  let context = 0
  for (let step = 0; step < (o.maxSteps ?? 30); step++) {
    if (o.signal?.aborted) break
    const r = await callModel(o.cfg, SYSTEM_PROMPT, messages, AGENT_TOOLS, o.signal)
    context = r.usage.input + r.usage.output
    o.onEvent?.({ kind: 'usage', input: r.usage.input, output: r.usage.output })
    messages.push({ role: 'assistant', text: r.text, toolCalls: r.toolCalls })
    if (r.text) o.onEvent?.({ kind: 'assistant', text: r.text })
    if (!r.toolCalls.length) return { messages, context }
    const results: ToolResultMsg[] = []
    for (const c of r.toolCalls) {
      let res: { text: string; image?: string; isError?: boolean }
      if (o.signal?.aborted) res = { text: 'Stopped by the user.', isError: true }
      else if (c.name === 'run_commands' && o.mode === 'ask' && !(await o.approve(String(c.args.script ?? '')))) {
        res = { text: 'The user rejected this script. Do not run it again; ask what to change.', isError: true }
      } else {
        try {
          res = await runTool(o.host, c.name, c.args)
        } catch (err) {
          res = { text: `Tool error: ${(err as Error).message}`, isError: true }
        }
      }
      o.onEvent?.({ kind: 'tool', name: c.name, args: c.args, result: res.text, isError: res.isError })
      results.push({ id: c.id, name: c.name, ...res })
    }
    messages.push({ role: 'tool', results })
  }
  return { messages, context }
}

const COMPACT_PROMPT =
  'Summarize this CAD modeling conversation so it can continue from the summary alone: what the user wants, what was built (object ids, positions, sizes, layers), decisions taken, problems found and what is left. Be concise and exact; no greetings.'

/** COMPACT: reemplaza la conversación por un resumen hecho por el mismo modelo (libera contexto). */
export async function compactConversation(messages: ChatMessage[], cfg: ProviderConfig, signal?: AbortSignal): Promise<ChatMessage[]> {
  if (!messages.length) return messages
  const transcript = messages
    .map((m) => (m.role === 'user' ? `USER: ${m.text}` : m.role === 'assistant' ? `AGENT: ${m.text}${m.toolCalls.map((c) => `\n[${c.name} ${JSON.stringify(c.args)}]`).join('')}` : m.results.map((r) => `[result ${r.name}] ${r.text.slice(0, 1500)}`).join('\n')))
    .join('\n')
  const r = await callModel(cfg, COMPACT_PROMPT, [{ role: 'user', text: transcript }], [], signal)
  return [
    { role: 'user', text: `Summary of our conversation so far (the drawing keeps everything that was built):\n${r.text}` },
    { role: 'assistant', text: 'Understood. I will continue from this summary.', toolCalls: [] },
  ]
}
