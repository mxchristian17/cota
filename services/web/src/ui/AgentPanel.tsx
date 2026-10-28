import { useEffect, useRef, useState } from 'react'
import { CONTEXT_LIMIT, useAgentStore } from '../agent/agentStore'
import { PROVIDERS, type ProviderId } from '../agent/providers'
import { focusCommandLine } from './focus'

/**
 * Panel del agente (colapsable, a la derecha): conversación con un LLM que maneja Cota con las herramientas del
 * agente. Cada usuario usa su propia key; las conversaciones quedan en el navegador.
 */
export function AgentPanel() {
  const open = useAgentStore((s) => s.open)
  if (!open) return null
  return <AgentBody />
}

function AgentBody() {
  const s = useAgentStore()
  const [showSettings, setShowSettings] = useState(!s.hasKey)
  const [text, setText] = useState('')
  const feedEnd = useRef<HTMLDivElement>(null)
  const conv = s.conversations.find((c) => c.id === s.currentId)
  const used = conv?.context ?? 0
  const pct = Math.min(100, Math.round((used / CONTEXT_LIMIT) * 100))

  useEffect(() => {
    // Bloque sin valor de retorno: en Chrome reciente scrollIntoView devuelve una promesa, y un efecto sólo puede
    // devolver su función de limpieza.
    feedEnd.current?.scrollIntoView({ block: 'end' })
  }, [s.feed.length, s.pending])
  useEffect(() => {
    if (!s.hasKey) setShowSettings(true)
  }, [s.hasKey])

  const send = () => {
    const t = text
    setText('')
    void s.send(t)
  }

  return (
    <aside className="agent-panel" data-testid="agent-panel">
      <div className="agent-head">
        <strong>Agent</strong>
        <select className="field agent-convs" value={s.currentId ?? ''} onChange={(e) => (e.target.value ? s.openChat(e.target.value) : s.newChat())} data-testid="agent-convs">
          <option value="">New conversation</option>
          {s.conversations.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <button className="icon-btn" title="Settings" onClick={() => setShowSettings(!showSettings)} data-testid="agent-settings-btn">
          ⚙
        </button>
        <button
          className="icon-btn"
          title="Close"
          onClick={() => {
            s.toggle(false)
            focusCommandLine()
          }}
          data-testid="agent-close"
        >
          ✕
        </button>
      </div>
      {showSettings && <Settings onDone={() => setShowSettings(false)} />}
      <div className="agent-meter" title={`${used.toLocaleString()} of ~${CONTEXT_LIMIT.toLocaleString()} tokens`} data-testid="agent-meter">
        <span>Context {pct}%</span>
        <div className="agent-bar">
          <div style={{ width: `${pct}%` }} />
        </div>
        <button className="btn btn-sm" disabled={!conv?.messages.length || s.running} onClick={() => void s.compact()} data-testid="agent-compact">
          Compact
        </button>
      </div>
      <div className="agent-feed" data-testid="agent-feed">
        {!s.feed.length && <p className="muted agent-hint">Ask for what you want to model, e.g. “a 100×60 plate with four Ø8 holes 10 mm from the corners”.</p>}
        {s.feed.map((f, i) =>
          f.kind === 'tool' ? (
            <div key={i} className={`agent-tool${f.isError ? ' agent-err' : ''}`}>
              {f.name} · {f.summary}
            </div>
          ) : (
            <div key={i} className={`agent-msg agent-${f.kind}`}>
              {f.text}
            </div>
          ),
        )}
        {s.pending && (
          <div className="agent-approve" data-testid="agent-approve">
            <div className="muted">Run these commands?</div>
            <pre>{s.pending.script}</pre>
            <div className="agent-row">
              <button className="btn" onClick={() => s.answer(false)} data-testid="agent-reject">
                Reject
              </button>
              <button className="btn primary" onClick={() => s.answer(true)} data-testid="agent-accept">
                Run
              </button>
            </div>
          </div>
        )}
        {s.running && !s.pending && <div className="muted agent-hint">Working…</div>}
        <div ref={feedEnd} />
      </div>
      <div className="agent-input">
        <textarea
          className="field"
          value={text}
          placeholder="Message the agent (Enter sends, Shift+Enter new line)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          data-testid="agent-input"
        />
        <div className="agent-row">
          <select className="field" value={s.settings.mode} onChange={(e) => s.setSettings({ mode: e.target.value as 'auto' | 'ask' })} title="Apply mode" data-testid="agent-mode">
            <option value="ask">Ask before running</option>
            <option value="auto">Run automatically</option>
          </select>
          {s.running ? (
            <button className="btn" onClick={s.stop} data-testid="agent-stop">
              Stop
            </button>
          ) : (
            <button className="btn primary" onClick={send} disabled={!text.trim()} data-testid="agent-send">
              Send
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}

/** Proveedor, modelo y key. La primera key pregunta si se guarda en el navegador (una sola vez). */
function Settings({ onDone }: { onDone: () => void }) {
  const s = useAgentStore()
  const [key, setKey] = useState('')
  const p = PROVIDERS[s.settings.provider]
  return (
    <div className="agent-settings form" data-testid="agent-settings">
      <label>
        Provider
        <select className="field" value={s.settings.provider} onChange={(e) => s.setSettings({ provider: e.target.value as ProviderId })} data-testid="agent-provider">
          {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
            <option key={id} value={id}>
              {PROVIDERS[id].label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Model
        <input className="field" value={s.settings.model} onChange={(e) => s.setSettings({ model: e.target.value })} data-testid="agent-model" />
      </label>
      {(s.settings.provider === 'compatible' || s.settings.provider === 'openai') && (
        <label>
          Base URL
          <input className="field" value={s.settings.baseUrl} placeholder="https://api.example.com/v1" onChange={(e) => s.setSettings({ baseUrl: e.target.value })} data-testid="agent-base" />
        </label>
      )}
      <label>
        API key {s.hasKey && <span className="muted">(set)</span>}
        <input className="field" type="password" autoComplete="off" value={key} placeholder={s.hasKey ? '••••••••' : 'Paste your key'} onChange={(e) => setKey(e.target.value)} data-testid="agent-key" />
      </label>
      <p className="muted agent-small">
        Your key goes only from this browser to {p.label}. Cota has no key of its own.{' '}
        {p.keyUrl && (
          <a href={p.keyUrl} target="_blank" rel="noreferrer">
            Get a key
          </a>
        )}
      </p>
      {s.keyAwaitingDecision ? (
        <div className="agent-approve" data-testid="agent-key-decision">
          <strong>Remember this key in this browser?</strong>
          <p className="agent-small">
            If you remember it, it is stored unencrypted in this browser’s storage: anyone using this browser profile, or a
            malicious extension, could read it. Do it only on your own computer, and prefer a key with a spending limit.
            If not, it stays in memory and you paste it again after reloading. You choose once; the choice is kept.
          </p>
          <div className="agent-row">
            <button className="btn" onClick={() => void s.decideKey('session').then(onDone)} data-testid="agent-key-session">
              Only this session
            </button>
            <button className="btn primary" onClick={() => void s.decideKey('remember').then(onDone)} data-testid="agent-key-remember">
              Remember on this device
            </button>
          </div>
        </div>
      ) : (
        <div className="agent-row">
          {s.hasKey && (
            <button className="btn" onClick={() => void s.forgetKey()} data-testid="agent-key-forget">
              Forget key
            </button>
          )}
          <button
            className="btn primary"
            disabled={!key.trim() && !s.hasKey}
            onClick={() => {
              const k = key
              setKey('')
              void s.setKey(k).then(() => useAgentStore.getState().keyAwaitingDecision === null && onDone())
            }}
            data-testid="agent-save"
          >
            Save
          </button>
        </div>
      )}
    </div>
  )
}
