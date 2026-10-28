import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/store'

export function AiDialog() {
  const open = useStore((s) => s.aiOpen)
  const close = useStore((s) => s.closeAi)
  const hasKey = useStore((s) => s.aiHasKey)
  const processing = useStore((s) => s.aiProcessing)
  const message = useStore((s) => s.aiMessage)
  const hasProposal = useStore((s) => s.aiHasProposal)
  const changes = useStore((s) => s.aiChanges)
  const minimized = useStore((s) => s.aiMinimized)
  const setMinimized = useStore((s) => s.setAiMinimized)
  const provider = useStore((s) => s.aiProvider)
  const apiBase = useStore((s) => s.aiApiBase)
  const model = useStore((s) => s.aiModel)
  const lod = useStore((s) => s.aiLod)
  const setLod = useStore((s) => s.setAiLod)
  const log = useStore((s) => s.aiLog)
  const setAiConfig = useStore((s) => s.setAiConfig)
  const submit = useStore((s) => s.submitAiPrompt)
  const accept = useStore((s) => s.acceptAiProposal)
  const discard = useStore((s) => s.discardAiProposal)

  const [text, setText] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' })
  }, [log])
  const [cProvider, setCProvider] = useState('openai')
  const [cBase, setCBase] = useState('')
  const [cModel, setCModel] = useState('')
  const [cKey, setCKey] = useState('')

  if (!open) return null

  // Minimizado: chip flotante (sin backdrop) para ver/previsualizar el viewport mientras genera.
  if (minimized) {
    const last = log.length > 0 ? log[log.length - 1] : ''
    const status = processing
      ? last || 'generating…'
      : hasProposal
        ? `${changes.length} change(s) — review`
        : 'AI'
    return (
      <button className="ai-min-chip" onClick={() => setMinimized(false)} data-testid="ai-min-chip">
        {processing && <span className="ai-spinner" />}
        <span>AI · {status}</span>
        <span className="ai-min-restore">▢</span>
      </button>
    )
  }

  const configMode = !hasKey || showConfig

  const saveConfig = () => {
    if (!cModel.trim() || !cKey.trim()) return
    void setAiConfig({ provider: cProvider, apiBase: cBase.trim(), model: cModel.trim(), apiKey: cKey.trim() }).then(() => {
      setShowConfig(false)
      setCKey('')
    })
  }
  const run = () => {
    if (text.trim() && !processing) void submit(text)
  }

  return (
    <div className="modal-backdrop" onClick={close} data-testid="ai-dialog">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(640px, 94vw)' }}>
        <div className="modal-header">
          <h2>AI — generate / edit model</h2>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="icon-btn" onClick={() => setMinimized(true)} title="Minimize (keep working / preview)" data-testid="ai-minimize">
              ─
            </button>
            <button className="icon-btn" onClick={close} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        {configMode ? (
          <div className="form" data-testid="ai-config">
            <p className="muted" style={{ fontSize: 12 }}>
              Configure your LLM provider. The API key is stored in your account (server-side) and never
              returned to the browser. NVIDIA/other OpenAI-compatible endpoints: provider “openai” + API base.
            </p>
            <label>
              Provider
              <select className="field" value={cProvider} onChange={(e) => setCProvider(e.target.value)} data-testid="ai-provider">
                <option value="openai">openai (OpenAI / NVIDIA / compatible)</option>
                <option value="google">google (Gemini)</option>
                <option value="anthropic">anthropic (Claude)</option>
              </select>
            </label>
            <label>
              API base (optional, e.g. https://integrate.api.nvidia.com/v1)
              <input className="field" value={cBase} onChange={(e) => setCBase(e.target.value)} data-testid="ai-base" autoComplete="off" />
            </label>
            <label>
              Model (e.g. z-ai/glm-5.2, gpt-4o, gemini-1.5-pro)
              <input className="field" value={cModel} onChange={(e) => setCModel(e.target.value)} data-testid="ai-model" autoComplete="off" />
            </label>
            <label>
              API key
              <input className="field" type="password" value={cKey} onChange={(e) => setCKey(e.target.value)} data-testid="ai-key" autoComplete="off" />
            </label>
            {message && <div className="muted" style={{ fontSize: 12 }}>{message}</div>}
            <div className="theme-presets">
              <button className="btn" onClick={saveConfig} data-testid="ai-save-config">Save provider</button>
              {hasKey && (
                <button className="link-btn" onClick={() => setShowConfig(false)}>Cancel</button>
              )}
            </div>
          </div>
        ) : (
          <div className="form">
            <textarea
              className="field ai-textarea"
              placeholder="Describe what to create or change… e.g. 'Add a 100x50 box and a cylinder of radius 20, then subtract the cylinder from the box.'"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && run()}
              disabled={processing}
              autoFocus
              data-testid="ai-prompt"
            />
            <div className="muted" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Detail
                <select
                  value={lod}
                  onChange={(e) => setLod(Number(e.target.value))}
                  disabled={processing}
                  data-testid="ai-lod"
                >
                  <option value={0}>LOD0 · coarse</option>
                  <option value={1}>LOD1 · simple</option>
                  <option value={2}>LOD2 · detailed</option>
                  <option value={3}>LOD3 · very detailed</option>
                </select>
              </label>
              <span>· {provider} · {model || '(no model)'}{apiBase ? ` · ${apiBase}` : ''} ·{' '}
                <button className="link-btn" onClick={() => setShowConfig(true)} data-testid="ai-reconfigure">reconfigure</button>
              </span>
            </div>

            {processing && (
              <div className="ai-processing" data-testid="ai-processing">
                <span className="ai-spinner" /> Working… (auto-retries with backoff on rate-limits/errors).
                You can minimize (─) to keep viewing the model.
              </div>
            )}
            {log.length > 0 && (
              <div className="ai-log" data-testid="ai-log">
                {log.map((line, i) => (
                  <div key={i} className="ai-log-line">
                    {line}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}
            {!processing && message && <div className="ai-message" data-testid="ai-message">{message}</div>}

            {hasProposal ? (
              <>
                <div className="ai-changes" data-testid="ai-changes">
                  <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                    Proposed changes ({changes.length}) — highlighted in the viewport:
                  </div>
                  <ul>
                    {changes.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
                <div className="theme-presets" data-testid="ai-proposal-actions">
                  <button className="btn active" onClick={accept} data-testid="ai-accept">Accept changes</button>
                  <button className="btn" onClick={discard} data-testid="ai-discard">Discard</button>
                </div>
              </>
            ) : (
              <button className="btn" onClick={run} disabled={processing || !text.trim()} data-testid="ai-generate">
                Generate (Ctrl+Enter)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
