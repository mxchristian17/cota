import { afterEach, describe, expect, it, vi } from 'vitest'
import { callModel, type ChatMessage } from './providers'

afterEach(() => vi.unstubAllGlobals())

/** Respuesta de una API compatible con OpenAI; guarda a dónde y qué se mandó. */
function fakeOpenAi() {
  const seen: Array<{ url: string; body: { model: string; messages: Array<{ role: string; content: unknown }> }; headers: Record<string, string> }> = []
  vi.stubGlobal('fetch', async (url: string, init: { body: string; headers: Record<string, string> }) => {
    seen.push({ url, body: JSON.parse(init.body), headers: init.headers })
    const reply = { choices: [{ message: { content: 'ok', tool_calls: [{ id: 'c1', function: { name: 'run_commands', arguments: '{"script":"LINE 0,0 10,0"}' } }] } }], usage: { prompt_tokens: 10, completion_tokens: 2 } }
    return new Response(JSON.stringify(reply), { status: 200 })
  })
  return seen
}

const history: ChatMessage[] = [
  { role: 'user', text: 'Draw a line' },
  { role: 'assistant', text: '', toolCalls: [{ id: 't1', name: 'look', args: {} }] },
  { role: 'tool', results: [{ id: 't1', name: 'look', text: '1 line', image: 'data:image/png;base64,AAAA' }] },
]

describe('proveedores del agente', () => {
  it('DeepSeek: su API, su key, y sin imágenes (sólo lee texto): la captura se cambia por una nota', async () => {
    const seen = fakeOpenAi()
    const r = await callModel({ provider: 'deepseek', model: 'deepseek-chat', apiKey: 'k' }, 'system', history, [])
    expect(seen[0].url).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(seen[0].headers.authorization).toBe('Bearer k')
    expect(seen[0].body.model).toBe('deepseek-chat')
    const sent = JSON.stringify(seen[0].body.messages)
    expect(sent).not.toContain('image_url')
    expect(seen[0].body.messages.find((m) => m.role === 'tool')?.content).toContain('reads text only')
    expect(r.toolCalls).toEqual([{ id: 'c1', name: 'run_commands', args: { script: 'LINE 0,0 10,0' } }])
  })

  it('DeepSeek por OpenRouter tampoco recibe imágenes; un modelo que ve, sí', async () => {
    const seen = fakeOpenAi()
    await callModel({ provider: 'openrouter', model: 'deepseek/deepseek-chat', apiKey: 'k' }, 'system', history, [])
    await callModel({ provider: 'openai', model: 'gpt-5', apiKey: 'k' }, 'system', history, [])
    expect(JSON.stringify(seen[0].body.messages)).not.toContain('image_url')
    expect(JSON.stringify(seen[1].body.messages)).toContain('image_url')
  })
})
