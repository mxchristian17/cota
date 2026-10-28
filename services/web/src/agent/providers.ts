import type { ToolDef } from './tools'
import { api } from '../core/io/apiClient'

/**
 * Proveedores de LLM llamados DESDE EL NAVEGADOR con la key del usuario (modo demo, sin backend). Formato neutro de
 * mensajes y un adaptador por API: Anthropic, Gemini y OpenAI-compatible (OpenAI, OpenRouter —que da acceso a
 * DeepSeek, Kimi, GLM y otros sin problemas de CORS— o cualquier `baseUrl`).
 */
export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'compatible' | 'server'

export interface ProviderConfig {
  provider: ProviderId
  model: string
  apiKey: string
  /** Sólo `compatible` (y opcional en `openai`): p. ej. https://api.deepseek.com/v1 */
  baseUrl?: string
}

export const PROVIDERS: Record<ProviderId, { label: string; model: string; keyUrl?: string }> = {
  anthropic: { label: 'Anthropic', model: 'claude-sonnet-5-5', keyUrl: 'https://console.anthropic.com/settings/keys' },
  openai: { label: 'OpenAI', model: 'gpt-5', keyUrl: 'https://platform.openai.com/api-keys' },
  gemini: { label: 'Google Gemini (free tier: Flash models)', model: 'gemini-3.5-flash', keyUrl: 'https://aistudio.google.com/apikey' },
  openrouter: { label: 'OpenRouter (DeepSeek, Kimi, GLM…)', model: 'deepseek/deepseek-chat', keyUrl: 'https://openrouter.ai/keys' },
  compatible: { label: 'OpenAI-compatible (base URL)', model: '' },
  server: { label: 'Server (your account)', model: '' },
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  /** Firma de razonamiento de Gemini 3: hay que devolverla tal cual con la llamada en las vueltas siguientes. */
  signature?: string
  /** Modelo que firmó (una firma sólo vale para su modelo). */
  signedBy?: string
}

export interface ToolResultMsg {
  id: string
  name: string
  text: string
  image?: string
  isError?: boolean
}

export type ChatMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[]; raw?: unknown }
  | { role: 'tool'; results: ToolResultMsg[] }

export interface ModelReply {
  text: string
  toolCalls: ToolCall[]
  /** Respuesta tal como la guarda el servidor (modo Docker): vuelve en la próxima llamada sin perder nada. */
  raw?: unknown
  /** Tokens de entrada de esta llamada (el tamaño del contexto) y de salida. */
  usage: { input: number; output: number }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly retryAfterMs = 0,
  ) {
    super(message)
  }
}

const b64 = (dataUrl: string) => dataUrl.replace(/^data:image\/png;base64,/, '')

/** Esperas ante 429/5xx (cupo por minuto o demanda alta del proveedor, comunes en los niveles gratis). */
const RETRY_MS = [2000, 6000, 15000, 30000, 45000, 60000]
/** Más que esto (p. ej. el cupo diario de un nivel gratis) no se espera: se avisa. */
const MAX_WAIT_MS = 90_000

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })

async function post(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await postOnce(url, headers, body, signal)
    } catch (err) {
      const status = err instanceof ProviderError ? err.status : 0
      if (!(status === 429 || status >= 500) || attempt >= RETRY_MS.length) throw err
      const wait = err instanceof ProviderError && err.retryAfterMs ? err.retryAfterMs + 500 : RETRY_MS[attempt]
      if (wait > MAX_WAIT_MS) throw err
      await sleep(wait, signal)
    }
  }
}

async function postOnce(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ProviderError('Could not reach the provider from the browser (network or CORS). OpenRouter works from the browser for most models.')
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const e = json.error as { message?: string } | string | undefined
    const after = Number(res.headers.get('retry-after'))
    throw new ProviderError(`${res.status}: ${typeof e === 'string' ? e : (e?.message ?? res.statusText)}`, res.status, Number.isFinite(after) && after > 0 ? after * 1000 : retryDelayOf(json))
  }
  return json
}

/** Espera que pide Google en el cuerpo del 429 (`RetryInfo.retryDelay`, p. ej. "24.4s" o "10h48m15s"), en ms. */
function retryDelayOf(json: Record<string, unknown>): number {
  const details = ((json.error as { details?: Array<{ retryDelay?: string }> } | undefined)?.details ?? []).map((d) => d.retryDelay).find(Boolean)
  const m = details ? /^(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?$/.exec(details) : null
  return m ? ((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000 : 0
}

/** Una llamada al modelo con las herramientas; devuelve texto y pedidos de herramientas. */
export async function callModel(cfg: ProviderConfig, system: string, messages: ChatMessage[], tools: ToolDef[], signal?: AbortSignal): Promise<ModelReply> {
  if (cfg.provider === 'server') return server(system, messages, tools)
  if (cfg.provider === 'anthropic') return anthropic(cfg, system, messages, tools, signal)
  if (cfg.provider === 'gemini') return gemini(cfg, system, messages, tools, signal)
  return openaiCompatible(cfg, system, messages, tools, signal)
}

async function anthropic(cfg: ProviderConfig, system: string, messages: ChatMessage[], tools: ToolDef[], signal?: AbortSignal): Promise<ModelReply> {
  const msgs = messages.map((m) => {
    if (m.role === 'user') return { role: 'user', content: m.text }
    if (m.role === 'assistant')
      return { role: 'assistant', content: [...(m.text ? [{ type: 'text', text: m.text }] : []), ...m.toolCalls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args }))] }
    return {
      role: 'user',
      content: m.results.map((r) => ({
        type: 'tool_result',
        tool_use_id: r.id,
        is_error: !!r.isError,
        content: r.image ? [{ type: 'text', text: r.text }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64(r.image) } }] : r.text,
      })),
    }
  })
  const json = await post(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    { model: cfg.model, max_tokens: 8192, system, messages: msgs, ...(tools.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}) },
    signal,
  )
  const blocks = (json.content as Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>) ?? []
  const usage = json.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } | undefined
  return {
    text: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n'),
    toolCalls: blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id!, name: b.name!, args: b.input ?? {} })),
    usage: { input: (usage?.input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0), output: usage?.output_tokens ?? 0 },
  }
}

export const OPENAI_BASE: Partial<Record<ProviderId, string>> = { openai: 'https://api.openai.com/v1', openrouter: 'https://openrouter.ai/api/v1' }

/** Modo servidor (Docker): el backend llama al modelo con pydantic-ai y la key guardada del usuario. */
async function server(system: string, messages: ChatMessage[], tools: ToolDef[]): Promise<ModelReply> {
  try {
    const r = await api.agentStep({ system, messages, tools })
    return { text: r.text, toolCalls: r.tool_calls, usage: r.usage, raw: r.raw }
  } catch (err) {
    throw new ProviderError(err instanceof Error ? err.message : String(err))
  }
}

async function openaiCompatible(cfg: ProviderConfig, system: string, messages: ChatMessage[], tools: ToolDef[], signal?: AbortSignal): Promise<ModelReply> {
  const base = (cfg.baseUrl?.trim() || OPENAI_BASE[cfg.provider] || '').replace(/\/+$/, '')
  if (!base) throw new ProviderError('Set the base URL of the OpenAI-compatible API.')
  const msgs: unknown[] = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (m.role === 'user') msgs.push({ role: 'user', content: m.text })
    else if (m.role === 'assistant')
      msgs.push({
        role: 'assistant',
        content: m.text || null,
        ...(m.toolCalls.length ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : {}),
      })
    else {
      for (const r of m.results) msgs.push({ role: 'tool', tool_call_id: r.id, content: r.isError ? `ERROR: ${r.text}` : r.text })
      // Las imágenes no van en mensajes de herramienta: siguen como un mensaje del usuario.
      const imgs = m.results.filter((r) => r.image)
      if (imgs.length) msgs.push({ role: 'user', content: imgs.map((r) => ({ type: 'image_url', image_url: { url: r.image } })) })
    }
  }
  const json = await post(
    `${base}/chat/completions`,
    { authorization: `Bearer ${cfg.apiKey}`, ...(cfg.provider === 'openrouter' ? { 'x-title': 'Cota' } : {}) },
    { model: cfg.model, messages: msgs, ...(tools.length ? { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) } : {}) },
    signal,
  )
  const msg = ((json.choices as Array<{ message: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>) ?? [])[0]?.message
  const usage = json.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined
  return {
    text: msg?.content ?? '',
    toolCalls: (msg?.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, args: safeJson(c.function.arguments) })),
    usage: { input: usage?.prompt_tokens ?? 0, output: usage?.completion_tokens ?? 0 },
  }
}

const safeJson = (s: string): Record<string, unknown> => {
  try {
    return JSON.parse(s || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Firma que Gemini acepta para llamadas de otro modelo (docs de "thought signatures"). */
const FOREIGN_SIGNATURE = 'skip_thought_signature_validator'

/** Gemini acepta un subconjunto de JSON Schema: se quitan las claves que no conoce. */
function geminiSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(geminiSchema)
  if (!s || typeof s !== 'object') return s
  return Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'minItems' && k !== 'maxItems').map(([k, v]) => [k, geminiSchema(v)]))
}

async function gemini(cfg: ProviderConfig, system: string, messages: ChatMessage[], tools: ToolDef[], signal?: AbortSignal): Promise<ModelReply> {
  const contents = messages.map((m) => {
    if (m.role === 'user') return { role: 'user', parts: [{ text: m.text }] }
    if (m.role === 'assistant')
      return {
        role: 'model',
        // La firma vuelve tal cual al modelo que la dio; si la conversación cambió de modelo (cupo agotado, otro
        // proveedor), va la firma comodín que Gemini acepta para historial ajeno.
        parts: [
          ...(m.text ? [{ text: m.text }] : []),
          ...m.toolCalls.map((c) => ({ functionCall: { id: c.id, name: c.name, args: c.args }, thoughtSignature: c.signature && c.signedBy === cfg.model ? c.signature : FOREIGN_SIGNATURE })),
        ],
      }
    return {
      role: 'user',
      parts: m.results.flatMap((r) => [
        { functionResponse: { id: r.id, name: r.name, response: { content: r.isError ? `ERROR: ${r.text}` : r.text } } },
        ...(r.image ? [{ inlineData: { mimeType: 'image/png', data: b64(r.image) } }] : []),
      ]),
    }
  })
  const json = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`,
    { 'x-goog-api-key': cfg.apiKey },
    { systemInstruction: { parts: [{ text: system }] }, contents, ...(tools.length ? { tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: geminiSchema(t.parameters) })) }] } : {}) },
    signal,
  )
  const parts =
    ((json.candidates as Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean; thoughtSignature?: string; functionCall?: { id?: string; name: string; args?: Record<string, unknown> } }> } }>) ?? [])[0]?.content?.parts ?? []
  const usage = json.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number } | undefined
  let k = 0
  return {
    text: parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('\n'),
    toolCalls: parts
      .filter((p) => p.functionCall)
      .map((p) => ({ id: p.functionCall!.id ?? `call_${Date.now()}_${k++}`, name: p.functionCall!.name, args: p.functionCall!.args ?? {}, ...(p.thoughtSignature ? { signature: p.thoughtSignature, signedBy: cfg.model } : {}) })),
    usage: { input: usage?.promptTokenCount ?? 0, output: usage?.candidatesTokenCount ?? 0 },
  }
}
