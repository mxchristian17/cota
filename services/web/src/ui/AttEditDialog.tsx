import { useEffect, useState } from 'react'
import { useStore } from '../store/store'

/** Editor de atributos (Edit Attributes / Enhanced Attribute Editor): un valor por tag. */
export function AttEditDialog() {
  const dialog = useStore((s) => s.attDialog)
  const close = useStore((s) => s.closeAttDialog)
  const [values, setValues] = useState<string[]>([])

  useEffect(() => setValues(dialog?.items.map((i) => i.value) ?? []), [dialog])
  if (!dialog) return null
  const ok = () => close(values)

  return (
    <div className="modal-backdrop" onClick={() => close(null)} data-testid="att-dialog">
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{dialog.title}</h2>
          <button className="icon-btn" onClick={() => close(null)} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="form">
          {dialog.items.map((it, i) => (
            <label key={it.tag} title={it.tag}>
              <span>
                {it.prompt} <span className="muted">({it.tag})</span>
              </span>
              <input
                className="field"
                value={values[i] ?? ''}
                autoFocus={i === 0}
                onChange={(e) => setValues(values.map((v, j) => (j === i ? e.target.value : v)))}
                onKeyDown={(e) => e.key === 'Enter' && ok()}
                data-testid={`att-value-${it.tag}`}
              />
            </label>
          ))}
          <div className="theme-presets">
            <button className="btn active" onClick={ok} data-testid="att-ok">
              OK
            </button>
            <button className="btn" onClick={() => close(null)}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
