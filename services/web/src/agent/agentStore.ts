import { create } from 'zustand'
import { useStore } from '../store/store'
import { idbGet, idbSet } from '../core/io/idb'
import { agentBridge } from '../core/agentBridge'
import { OPENAI_BASE, PROVIDERS, ProviderError, type ChatMessage, type ProviderConfig, type ProviderId } from './providers'
import { api } from '../core/io/apiClient'
import { CLOUD_ENABLED } from '../core/io/backend'
import { compactConversation, runAgentTurn, type AgentEvent, type ApplyMode } from './loop'
import type { AgentHost } from './tools'

/**
 * Estado del panel del agente (modo navegador): ajustes, conversaciones guardadas en IndexedDB (no se pierden al
 * recargar), la key del usuario (guardada o sólo en memoria, según lo que eligió UNA vez) y el turno en curso.
 */
export interface Conversation {
  id: string
  title: string
  updatedAt: number
  messages: ChatMessage[]
  /** Tokens de la última llamada: el contexto usado. */
  context: number
}

export interface AgentSettings {
  provider: ProviderId
  model: string
  baseUrl: string
  mode: ApplyMode
}

/** Lo que se muestra de cada paso (texto del agente y herramientas usadas). */
export type FeedItem = { kind: 'user' | 'assistant' | 'error'; text: string } | { kind: 'tool'; name: string; summary: string; isError?: boolean }

type KeyDecision = 'remember' | 'session'

const SETTINGS_KEY = 'cota.agent.settings'
const DECISION_KEY = 'cota.agent.keyDecision'
const CONV_KEY = 'agent.conversations'
const KEYS_KEY = 'agent.keys'
/** Contexto que se toma como 100 % en el medidor (los modelos de frontera rondan los 200 k tokens). */
export const CONTEXT_LIMIT = 200_000

const read = <T,>(k: string, def: T): T => {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : def
  } catch {
    return def
  }
}
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* almacenamiento bloqueado: queda en memoria */
  }
}

/**
 * Modo servidor (Docker): hay backend y sesión iniciada. La key vive en el servidor (nunca vuelve al navegador), el
 * modelo lo llama el backend con pydantic-ai y las conversaciones se guardan en su base de datos.
 */
export const serverMode = (): boolean => CLOUD_ENABLED && !!useStore.getState().email

/** Proveedor del panel → configuración del backend (OpenRouter y los compatibles van por la API de OpenAI). */
const serverProvider = (p: ProviderId, baseUrl: string): { provider: string; api_base: string | null } =>
  p === 'anthropic' ? { provider: 'anthropic', api_base: null } : p === 'gemini' ? { provider: 'google', api_base: null } : { provider: 'openai', api_base: p === 'openrouter' ? OPENAI_BASE.openrouter! : p === 'compatible' ? baseUrl.trim() || null : null }

/** Keys sólo en memoria (si el usuario eligió no guardarlas). */
const sessionKeys = new Map<ProviderId, string>()

interface AgentState {
  open: boolean
  settings: AgentSettings
  /** null = todavía no eligió si guarda la key (se pregunta una sola vez). */
  keyDecision: KeyDecision | null
  /** Hay key para el proveedor actual. */
  hasKey: boolean
  conversations: Conversation[]
  currentId: string | null
  feed: FeedItem[]
  running: boolean
  /** Lote esperando aprobación (modo preguntar). */
  pending: { script: string; resolve: (ok: boolean) => void } | null
  /** Key escrita esperando la decisión de guardarla o no. */
  keyAwaitingDecision: string | null
  toggle: (open?: boolean) => void
  load: () => Promise<void>
  setSettings: (p: Partial<AgentSettings>) => void
  setKey: (key: string) => Promise<void>
  decideKey: (d: KeyDecision) => Promise<void>
  forgetKey: () => Promise<void>
  send: (text: string) => Promise<void>
  stop: () => void
  answer: (ok: boolean) => void
  newChat: () => void
  openChat: (id: string) => void
  compact: () => Promise<boolean>
}

let abort: AbortController | null = null

const DEFAULT: AgentSettings = { provider: 'anthropic', model: PROVIDERS.anthropic.model, baseUrl: '', mode: 'ask' }

async function storedKey(p: ProviderId): Promise<string | null> {
  if (sessionKeys.has(p)) return sessionKeys.get(p)!
  return ((await idbGet<Record<string, string>>(KEYS_KEY)) ?? {})[p] ?? null
}

/** El AgentHost del navegador: las herramientas actúan sobre el dibujo abierto. */
function browserHost(): AgentHost {
  const s = () => useStore.getState()
  return {
    get doc() {
      return s().doc
    },
    runScript: (t) => s().runScript(t, { finish: 'cancel', fresh: true }),
    select: (ids) => useStore.setState({ selection: ids }),
    setProperties: (ids, p) => s().setObjectProps(ids, p),
    undo: (k) => {
      for (let i = 0; i < k; i++) s().undo()
    },
    commands: () => s().engine.getCommands(),
    ucsName: () => s().ucsName,
    captureView: () => s().activeViewport?.captureImage() ?? null,
  }
}

/** Pasos de una conversación para mostrar (sin el detalle de las herramientas). */
function feedOf(messages: ChatMessage[]): FeedItem[] {
  const out: FeedItem[] = []
  for (const m of messages) {
    if (m.role === 'user') out.push({ kind: 'user', text: m.text })
    else if (m.role === 'assistant') {
      if (m.text) out.push({ kind: 'assistant', text: m.text })
    } else for (const r of m.results) out.push({ kind: 'tool', name: r.name, summary: r.text.split('\n')[0].slice(0, 120), isError: r.isError })
  }
  return out
}

export const useAgentStore = create<AgentState>((set, get) => {
  const saveConvs = (list: Conversation[], changed?: Conversation) => {
    set({ conversations: list })
    if (!serverMode()) return void idbSet(CONV_KEY, list)
    const c = changed ?? list[0]
    if (c) void api.putAgentConversation(c.id, { title: c.title, messages: c.messages, context: c.context }).catch(() => undefined)
  }
  const current = (): Conversation | undefined => get().conversations.find((c) => c.id === get().currentId)
  const refreshKey = async () => {
    if (serverMode()) {
      const c = await api.getAiConfig().catch(() => null)
      return set({ hasKey: !!c?.has_key && !!c.model })
    }
    set({ hasKey: !!(await storedKey(get().settings.provider)) })
  }
  const cfg = async (): Promise<ProviderConfig | null> => {
    if (serverMode()) return get().hasKey ? { provider: 'server', model: '', apiKey: '' } : null
    const { provider, model, baseUrl } = get().settings
    const apiKey = await storedKey(provider)
    return apiKey ? { provider, model, baseUrl, apiKey } : null
  }

  return {
    open: false,
    settings: { ...DEFAULT, ...read<Partial<AgentSettings>>(SETTINGS_KEY, {}) },
    keyDecision: read<KeyDecision | null>(DECISION_KEY, null),
    hasKey: false,
    conversations: [],
    currentId: null,
    feed: [],
    running: false,
    pending: null,
    keyAwaitingDecision: null,
    toggle: (open) => {
      const next = open ?? !get().open
      set({ open: next })
      if (next) void get().load()
    },
    load: async () => {
      const list = serverMode()
        ? ((await api.agentConversations().catch(() => [])) as Array<Conversation & { updated_at: string }>).map((c) => ({ ...c, updatedAt: Date.parse(c.updated_at) || Date.now() }))
        : ((await idbGet<Conversation[]>(CONV_KEY)) ?? [])
      const cur = list.find((c) => c.id === get().currentId) ?? list[0]
      set({ conversations: list, currentId: cur?.id ?? null, feed: cur ? feedOf(cur.messages) : [] })
      await refreshKey()
    },
    setSettings: (p) => {
      const settings = { ...get().settings, ...p }
      if (p.provider && !p.model) settings.model = PROVIDERS[p.provider].model
      set({ settings })
      write(SETTINGS_KEY, settings)
      void refreshKey()
    },
    setKey: async (key) => {
      const k = key.trim()
      if (serverMode()) {
        const { provider, model, baseUrl } = get().settings
        if (!k || !model.trim()) return
        await api.putAiConfig({ ...serverProvider(provider, baseUrl), model: model.trim(), api_key: k })
        return refreshKey()
      }
      if (!k) return
      // La primera vez se pregunta si se guarda; la decisión queda para las próximas keys.
      if (!get().keyDecision) return set({ keyAwaitingDecision: k })
      await storeKey(get().settings.provider, k, get().keyDecision!)
      await refreshKey()
    },
    decideKey: async (d) => {
      write(DECISION_KEY, d)
      const k = get().keyAwaitingDecision
      set({ keyDecision: d, keyAwaitingDecision: null })
      if (k) await storeKey(get().settings.provider, k, d)
      await refreshKey()
    },
    forgetKey: async () => {
      const p = get().settings.provider
      sessionKeys.delete(p)
      const all = (await idbGet<Record<string, string>>(KEYS_KEY)) ?? {}
      delete all[p]
      await idbSet(KEYS_KEY, all)
      await refreshKey()
    },
    send: async (text) => {
      const t = text.trim()
      if (!t || get().running) return
      const c = await cfg()
      if (!c) return set({ feed: [...get().feed, { kind: 'error', text: 'Set your API key first (⚙).' }] })
      let conv = current()
      if (!conv) {
        conv = { id: `c${Date.now()}`, title: t.slice(0, 50), updatedAt: Date.now(), messages: [], context: 0 }
        saveConvs([conv, ...get().conversations], conv)
        set({ currentId: conv.id })
      }
      abort = new AbortController()
      set({ running: true, feed: [...get().feed, { kind: 'user', text: t }] })
      const onEvent = (e: AgentEvent) => {
        if (e.kind === 'assistant') set({ feed: [...get().feed, { kind: 'assistant', text: e.text }] })
        else if (e.kind === 'tool') set({ feed: [...get().feed, { kind: 'tool', name: e.name, summary: e.result.split('\n')[0].slice(0, 120), isError: e.isError }] })
      }
      const id = conv.id
      try {
        const r = await runAgentTurn(conv.messages, t, {
          cfg: c,
          host: browserHost(),
          mode: get().settings.mode,
          approve: (script) => new Promise<boolean>((resolve) => set({ pending: { script, resolve } })),
          onEvent,
          signal: abort.signal,
        })
        const done = { ...conv, messages: r.messages, context: r.context, updatedAt: Date.now() }
        saveConvs(get().conversations.map((x) => (x.id === id ? done : x)), done)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') set({ feed: [...get().feed, { kind: 'error', text: err instanceof ProviderError ? err.message : String((err as Error).message ?? err) }] })
      } finally {
        abort = null
        set({ running: false, pending: null })
      }
    },
    stop: () => {
      abort?.abort()
      get().pending?.resolve(false)
    },
    answer: (ok) => {
      const p = get().pending
      set({ pending: null })
      p?.resolve(ok)
    },
    newChat: () => set({ currentId: null, feed: [] }),
    openChat: (id) => {
      const c = get().conversations.find((x) => x.id === id)
      if (c) set({ currentId: id, feed: feedOf(c.messages) })
    },
    compact: async () => {
      const conv = current()
      const c = await cfg()
      if (!conv || !conv.messages.length || !c || get().running) return false
      set({ running: true })
      try {
        const messages = await compactConversation(conv.messages, c)
        const done = { ...conv, messages, context: 0, updatedAt: Date.now() }
        saveConvs(get().conversations.map((x) => (x.id === conv.id ? done : x)), done)
        set({ feed: [...feedOf(messages)] })
      } catch (err) {
        set({ feed: [...get().feed, { kind: 'error', text: `COMPACT failed: ${(err as Error).message}` }] })
      } finally {
        set({ running: false })
      }
      return true
    },
  }
})

async function storeKey(p: ProviderId, key: string, d: KeyDecision): Promise<void> {
  if (d === 'session') {
    sessionKeys.set(p, key)
    return
  }
  const all = (await idbGet<Record<string, string>>(KEYS_KEY)) ?? {}
  all[p] = key
  await idbSet(KEYS_KEY, all)
}

// AGENT y COMPACT (comandos) llegan por el puente.
agentBridge.set((a) => {
  const s = useAgentStore.getState()
  if (a === 'toggle') {
    s.toggle()
    return true
  }
  if (!s.currentId) return false
  void s.compact()
  return true
})
