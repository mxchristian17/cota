import type { DocumentData } from '../document/types'

// Por defecto same-origin bajo `/api` (proxeado por Vite/Nginx al backend). Se
// puede forzar una URL absoluta con VITE_API_BASE_URL (implica CORS habilitado).
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api'

export interface DocumentSummary {
  id: string
  name: string
  folder: string
  updated_at: string
}

/** Operación sobre el modelo propuesta por el LLM. */
export interface AiOp {
  action: 'add' | 'delete' | 'update'
  id?: string | null
  type?: string | null
  layer: string
  props?: Record<string, unknown> | null
}

export interface DocumentPayload {
  id: string
  name: string
  folder: string
  data: DocumentData
  created_at: string
  updated_at: string
}

export interface UserProfile {
  id: number
  email: string
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

interface FastApiErrorItem {
  loc?: unknown[]
  msg?: string
}

/** Convierte el `detail` de FastAPI en un mensaje legible. Los 422 traen un array de errores de
 *  validación (p. ej. "password: String should have at least 12 characters"), no un string. */
function formatApiDetail(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail) return detail
  if (Array.isArray(detail)) {
    const parts = detail
      .map((e) => {
        if (e && typeof e === 'object') {
          const it = e as FastApiErrorItem
          const loc = Array.isArray(it.loc) ? it.loc.slice(1).join('.') : ''
          const msg = typeof it.msg === 'string' ? it.msg : ''
          return loc ? `${loc}: ${msg}` : msg
        }
        return String(e)
      })
      .filter(Boolean)
    if (parts.length) return parts.join('; ')
  }
  return fallback || 'Request failed'
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    // La sesión vive en una cookie HttpOnly: nunca se guarda un JWT en localStorage.
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!res.ok) {
    let detail: unknown = res.statusText
    try {
      const j = await res.json()
      detail = j.detail ?? detail
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    throw new ApiError(res.status, formatApiDetail(detail, res.statusText))
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** POST de bytes/texto crudos (conversión DWG). Devuelve la respuesta cruda. */
async function requestRaw(path: string, contentType: string, body: BodyInit): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': contentType }
  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, credentials: 'include', body })
  if (!res.ok) {
    let detail: unknown = res.statusText
    try {
      const j = await res.json()
      detail = j.detail ?? detail
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    throw new ApiError(res.status, formatApiDetail(detail, res.statusText))
  }
  return res
}

export const api = {
  register: (email: string, password: string) =>
    request<UserProfile>('POST', '/auth/register', { email, password }),
  login: (email: string, password: string) =>
    request<{ user: UserProfile }>('POST', '/auth/login', {
      email,
      password,
    }),
  me: () => request<UserProfile>('GET', '/auth/me'),
  logout: () => request<void>('POST', '/auth/logout'),
  listDocuments: () => request<DocumentSummary[]>('GET', '/documents'),
  createDocument: (name: string, data: DocumentData, folder = '') =>
    request<DocumentPayload>('POST', '/documents', { name, folder, data }),
  updateDocument: (id: string, name: string, data: DocumentData, folder = '') =>
    request<DocumentPayload>('PUT', `/documents/${id}`, { name, folder, data }),
  getDocument: (id: string) => request<DocumentPayload>('GET', `/documents/${id}`),
  deleteDocument: (id: string) => request<void>('DELETE', `/documents/${id}`),
  getConfig: () => request<{ data: Record<string, unknown> }>('GET', '/config'),
  putConfig: (data: Record<string, unknown>) =>
    request<{ data: Record<string, unknown> }>('PUT', '/config', { data }),
  // IA / LLM. La api key vive en el backend por usuario (no vuelve al cliente).
  getAiConfig: () =>
    request<{ provider: string; api_base: string | null; model: string; has_key: boolean }>('GET', '/ai/config'),
  putAiConfig: (cfg: { provider: string; api_base: string | null; model: string; api_key: string }) =>
    request<{ provider: string; api_base: string | null; model: string; has_key: boolean }>('PUT', '/ai/config', cfg),
  // Agente en modo servidor: cada llamada al modelo la hace el backend con la key guardada; las herramientas corren acá.
  agentStep: (body: { system: string; messages: unknown[]; tools: unknown[] }) =>
    request<{ text: string; tool_calls: Array<{ id: string; name: string; args: Record<string, unknown> }>; usage: { input: number; output: number } }>('POST', '/agent/step', body),
  agentConversations: () => request<Array<{ id: string; title: string; messages: unknown[]; context: number; updated_at: string }>>('GET', '/agent/conversations'),
  putAgentConversation: (id: string, c: { title: string; messages: unknown[]; context: number }) =>
    request<{ id: string }>('PUT', `/agent/conversations/${encodeURIComponent(id)}`, c),
  aiGenerate: (prompt: string, document: unknown, lod?: number) =>
    request<{ operations: AiOp[]; message: string }>('POST', '/ai/generate', { prompt, document, lod }),
  // Igual que aiGenerate pero con progreso en vivo (SSE): `onEvent` recibe cada evento del pipeline
  // (start/plan/part_start/part_done/retry/…) y la promesa resuelve con el resultado final.
  aiGenerateStream: async (
    prompt: string,
    document: unknown,
    lod: number | undefined,
    onEvent: (ev: Record<string, unknown>) => void,
  ): Promise<{ operations: AiOp[]; message: string }> => {
    const res = await fetch(`${BASE_URL}/ai/generate/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ prompt, document, lod }),
    })
    if (!res.ok || !res.body) {
      let detail = res.statusText
      try {
        const j = await res.json()
        detail = j.detail ?? detail
      } catch {
        /* sin cuerpo JSON */
      }
      throw new ApiError(res.status, typeof detail === 'string' ? detail : 'Request failed')
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let result: { operations: AiOp[]; message: string } | null = null
    let errorMsg: string | null = null
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const dataLine = chunk.split('\n').find((l) => l.startsWith('data:'))
        if (!dataLine) continue
        const json = dataLine.slice(5).trim()
        if (!json) continue
        let ev: Record<string, unknown>
        try {
          ev = JSON.parse(json)
        } catch {
          continue
        }
        if (ev.type === 'result') {
          result = { operations: (ev.operations as AiOp[]) ?? [], message: (ev.message as string) ?? '' }
        } else if (ev.type === 'error') {
          errorMsg = (ev.message as string) ?? 'AI error'
        } else {
          onEvent(ev)
        }
      }
    }
    if (errorMsg) throw new ApiError(502, errorMsg)
    if (!result) throw new ApiError(502, 'AI stream ended without a result')
    return result
  },
  // Conversión DWG<->DXF (requiere binario en el backend).
  convertStatus: () => request<{ dwgToDxf: boolean; dxfToDwg: boolean }>('GET', '/convert/status'),
  dwgToDxf: (dwg: ArrayBuffer) =>
    requestRaw('/convert/dwg-to-dxf', 'application/octet-stream', dwg).then((r) => r.text()),
  dxfToDwg: (dxf: string) =>
    requestRaw('/convert/dxf-to-dwg', 'application/dxf', dxf).then((r) => r.arrayBuffer()),
}
