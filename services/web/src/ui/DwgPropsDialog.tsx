import { useEffect, useState } from 'react'
import { useStore } from '../store/store'
import type { DocumentData } from '../core/document/types'

type Meta = DocumentData['meta']
const FIELDS: { key: 'title' | 'subject' | 'author' | 'keywords'; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'subject', label: 'Subject' },
  { key: 'author', label: 'Author' },
  { key: 'keywords', label: 'Keywords' },
]

/** DWGPROPS: propiedades del dibujo y propiedades personalizadas (alimentan los campos). */
export function DwgPropsDialog() {
  const open = useStore((s) => s.dwgPropsOpen)
  const close = useStore((s) => s.closeDwgProps)
  const save = useStore((s) => s.setDrawingProps)
  const doc = useStore((s) => s.doc)
  const [draft, setDraft] = useState<Meta>({})
  const [custom, setCustom] = useState<[string, string][]>([])

  useEffect(() => {
    if (!open) return
    setDraft({ ...doc.meta })
    setCustom(Object.entries(doc.meta.custom ?? {}))
  }, [open, doc])

  if (!open) return null
  const apply = () => {
    const entries = custom.map(([k, v]) => [k.trim(), v] as [string, string]).filter(([k]) => k)
    save({ title: draft.title, subject: draft.subject, author: draft.author, keywords: draft.keywords, custom: Object.fromEntries(entries) })
    close()
  }

  return (
    <div className="modal-backdrop" onClick={close} data-testid="dwgprops-dialog">
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Drawing Properties</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="form">
          {FIELDS.map((f) => (
            <label key={f.key}>
              <span>{f.label}</span>
              <input
                className="field"
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                data-testid={`dwgprops-${f.key}`}
              />
            </label>
          ))}
          <h3>Custom</h3>
          {custom.map(([k, v], i) => (
            <div key={i} className="custom-prop-row">
              <input
                className="field"
                placeholder="Name"
                value={k}
                onChange={(e) => setCustom(custom.map((c, j) => (j === i ? [e.target.value, c[1]] : c)))}
                data-testid={`dwgprops-custom-name-${i}`}
              />
              <input
                className="field"
                placeholder="Value"
                value={v}
                onChange={(e) => setCustom(custom.map((c, j) => (j === i ? [c[0], e.target.value] : c)))}
                data-testid={`dwgprops-custom-value-${i}`}
              />
              <button className="icon-btn" title="Remove" onClick={() => setCustom(custom.filter((_, j) => j !== i))}>
                🗑
              </button>
            </div>
          ))}
          <button className="btn" onClick={() => setCustom([...custom, ['', '']])} data-testid="dwgprops-add-custom">
            Add custom property
          </button>
          <div className="theme-presets">
            <button className="btn active" onClick={apply} data-testid="dwgprops-ok">
              OK
            </button>
            <button className="btn" onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
