import { useRef, useState } from 'react'
import { useStore } from '../store/store'
import { parseScript, scriptLink } from '../core/commands/script'
import { focusCommandLine } from './focus'

/**
 * SCRIPT: multicomandos. Se escriben o pegan las entradas (separadas por espacios o renglones; `""` es Enter y el
 * texto con espacios va entre comillas), se carga un `.scr` o se copia un enlace que las comparte. Un lote que llega
 * por enlace se muestra y sólo corre si el usuario lo confirma.
 */
export function ScriptDialog() {
  const d = useStore((s) => s.scriptDialog)
  if (!d) return null
  return <ScriptBody initial={d.text} shared={d.shared} />
}

function ScriptBody({ initial, shared }: { initial: string; shared: boolean }) {
  const close = useStore((s) => s.closeScript)
  const runScript = useStore((s) => s.runScript)
  const [text, setText] = useState(initial)
  const [note, setNote] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const inputs = parseScript(text).length

  const done = () => {
    close()
    focusCommandLine()
  }
  const run = () => {
    close()
    focusCommandLine()
    void runScript(text, { fresh: true })
  }
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(scriptLink(text, window.location.href))
      setNote('Link copied: whoever opens it sees this script and decides whether to run it.')
    } catch {
      setNote('Could not copy the link.')
    }
  }
  const load = async (f: File | undefined) => {
    if (f) setText(await f.text())
  }

  return (
    <div className="modal-backdrop" onClick={done} data-testid="script-dialog">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Script</h2>
          <button className="icon-btn" onClick={done} aria-label="Close">
            ✕
          </button>
        </div>
        {shared && (
          <p className="muted" data-testid="script-shared">
            This script comes from a shared link. Review it before running it: it will change your drawing.
          </p>
        )}
        <div className="form">
          <textarea
            className="field script-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder={'CIRCLE 50,50 20\nLINE 0,0 @100,0 @0,60 ""'}
            data-testid="script-text"
          />
          <p className="muted script-help">
            Inputs separated by spaces or new lines answer the prompts in order; "" is Enter; text with spaces goes in
            quotes. The whole script is one undo step.
          </p>
          {note && <p className="muted">{note}</p>}
        </div>
        <div className="modal-actions">
          <input ref={file} type="file" accept=".scr,.txt" hidden onChange={(e) => void load(e.target.files?.[0])} />
          <button className="btn" onClick={() => file.current?.click()} data-testid="script-load">
            Load .scr…
          </button>
          <button className="btn" onClick={() => void copyLink()} disabled={!inputs} data-testid="script-link">
            Copy link
          </button>
          <span className="muted" style={{ marginRight: 'auto', alignSelf: 'center', fontSize: 12 }}>
            {inputs} input(s)
          </span>
          <button className="btn" onClick={done}>
            Cancel
          </button>
          <button className="btn primary" onClick={run} disabled={!inputs} data-testid="script-run">
            Run
          </button>
        </div>
      </div>
    </div>
  )
}
