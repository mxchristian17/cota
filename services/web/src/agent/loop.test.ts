import { afterEach, describe, expect, it, vi } from 'vitest'
import '../render/csg'
import { makeEngine } from '../test/engineHarness'
import { parseScript } from '../core/commands/script'
import { runAgentTurn, compactConversation } from './loop'
import type { AgentHost } from './tools'

/** Proveedor simulado (API de Anthropic): devuelve las respuestas guionadas en orden y guarda lo que recibió. */
function fakeAnthropic(replies: unknown[]) {
  const seen: Array<Record<string, unknown>> = []
  vi.stubGlobal('fetch', async (_url: string, init: { body: string; headers: Record<string, string> }) => {
    seen.push({ ...JSON.parse(init.body), headers: init.headers })
    const body = (replies.shift() ?? { content: [{ type: 'text', text: 'done' }], usage: { input_tokens: 1, output_tokens: 1 } }) as { __status?: number }
    return new Response(JSON.stringify(body), { status: body.__status ?? 200 })
  })
  return seen
}

function host() {
  const h = makeEngine()
  const host: AgentHost = {
    doc: h.doc,
    runScript: (t) => h.engine.runScript(parseScript(t), { finish: 'cancel' }),
    select: (ids) => h.setSelection(ids),
    setProperties: () => 0,
    undo: () => {},
    commands: () => h.engine.getCommands(),
    ucsName: () => 'World',
  }
  return { h, host }
}

const cfg = { provider: 'anthropic' as const, model: 'test-model', apiKey: 'test-key' }
const toolUse = (script: string) => ({ content: [{ type: 'text', text: 'Drawing it.' }, { type: 'tool_use', id: 't1', name: 'run_commands', input: { script } }], usage: { input_tokens: 900, output_tokens: 40 } })

afterEach(() => vi.unstubAllGlobals())

describe('Ciclo del agente (navegador)', () => {
  it('el modelo pide run_commands, el navegador lo ejecuta y le devuelve el resultado; termina con texto', async () => {
    const seen = fakeAnthropic([toolUse('CIRCLE 0,0 10'), { content: [{ type: 'text', text: 'A circle of radius 10.' }], usage: { input_tokens: 1200, output_tokens: 10 } }])
    const { h, host: hh } = host()
    const r = await runAgentTurn([], 'draw a circle', { cfg, host: hh, mode: 'auto', approve: async () => true })
    expect(h.doc.entities.filter((e) => e.type === 'CIRCLE')).toHaveLength(1)
    expect(r.context).toBe(1210)
    expect(r.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
    // Segunda llamada: lleva el resultado de la herramienta; la key va en la cabecera, nunca en la URL.
    const second = seen[1] as { messages: Array<{ content: Array<{ type: string; content: string }> }>; headers: Record<string, string> }
    expect(second.messages[2].content[0].type).toBe('tool_result')
    expect(second.messages[2].content[0].content).toContain('CIRCLE center 0,0,0 r 10')
    expect(second.headers['x-api-key']).toBe('test-key')
  })

  it('modo preguntar: un lote rechazado no corre y el modelo se entera', async () => {
    const seen = fakeAnthropic([toolUse('CIRCLE 0,0 10')])
    const { h, host: hh } = host()
    await runAgentTurn([], 'draw', { cfg, host: hh, mode: 'ask', approve: async () => false })
    expect(h.doc.entities).toHaveLength(0)
    expect(JSON.stringify(seen[1].messages)).toContain('The user rejected this script')
  })

  it('si el proveedor corta a mitad de turno, lo hecho queda en la conversación para seguir', async () => {
    fakeAnthropic([toolUse('CIRCLE 0,0 10'), { __status: 400, error: { message: 'quota exceeded' } }])
    const { h, host: hh } = host()
    const r = await runAgentTurn([], 'draw', { cfg, host: hh, mode: 'auto', approve: async () => true })
    expect(r.error?.message).toContain('quota exceeded')
    expect(r.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool'])
    expect(h.doc.entities).toHaveLength(1)
  })

  it('COMPACT reemplaza la conversación por un resumen', async () => {
    fakeAnthropic([{ content: [{ type: 'text', text: 'User wants a plate; circle c1 at 0,0 r 10.' }], usage: { input_tokens: 10, output_tokens: 5 } }])
    const out = await compactConversation([{ role: 'user', text: 'draw' }, { role: 'assistant', text: 'ok', toolCalls: [] }], cfg)
    expect(out[0]).toMatchObject({ role: 'user' })
    expect((out[0] as { text: string }).text).toContain('circle c1')
  })
})
