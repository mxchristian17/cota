import { useEffect, useRef, useState } from 'react'
import { useStore, type TemplateEntry } from '../store/store'
import { LEGACY_TEMPLATE_EXT, TEMPLATE_EXT } from '../core/layout/template'

const SOURCE: Record<TemplateEntry['source'], string> = {
  builtin: 'Included',
  folder: 'Working folder',
  library: 'Browser library',
}

type Dialog = NonNullable<ReturnType<typeof useStore.getState>['templateDialog']>

/** Plantillas de layout: crear un layout "Desde plantilla…" o "Guardar como plantilla…". */
export function TemplateDialog() {
  const dialog = useStore((s) => s.templateDialog)
  // Un cuerpo nuevo por apertura: el nombre inicial se fija al montar (sin parpadeo ni carreras).
  return dialog ? <TemplateDialogBody key={`${dialog.mode}:${dialog.layoutId ?? ''}`} dialog={dialog} /> : null
}

function TemplateDialogBody({ dialog }: { dialog: Dialog }) {
  const close = useStore((s) => s.closeTemplateDialog)
  const listTemplates = useStore((s) => s.listTemplates)
  const fromTemplate = useStore((s) => s.newLayoutFromTemplate)
  const fromText = useStore((s) => s.newLayoutFromTemplateText)
  const save = useStore((s) => s.saveLayoutAsTemplate)
  const doc = useStore((s) => s.doc)
  const [list, setList] = useState<TemplateEntry[]>([])
  const [picked, setPicked] = useState('')
  const [name, setName] = useState(() => (dialog.mode === 'save' ? (doc.getLayout(dialog.layoutId ?? '')?.name ?? '') : ''))
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (dialog.mode !== 'from') return
    void listTemplates().then((l) => {
      setList(l)
      setPicked((p) => p || (l[0]?.id ?? ''))
    })
  }, [dialog.mode, listTemplates])

  const ok = () => {
    if (dialog.mode === 'save') void save(dialog.layoutId!, name)
    else if (picked) void fromTemplate(picked, name)
    close()
  }
  const openFile = (file: File | undefined) => {
    if (!file) return
    void file.text().then((text) => {
      fromText(text, name)
      close()
    })
  }

  return (
    <div className="modal-backdrop" onClick={close} data-testid="template-dialog">
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{dialog.mode === 'save' ? 'Save Layout as Template' : 'New Layout from Template'}</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="form">
          {dialog.mode === 'from' && (
            <div className="template-list" data-testid="template-list">
              {list.map((t) => (
                <label key={t.id} className="osnap-row">
                  <input type="radio" name="tpl" checked={picked === t.id} onChange={() => setPicked(t.id)} data-testid={`template-${t.name}`} />
                  <span>
                    {t.name} <span className="muted">· {SOURCE[t.source]}</span>
                  </span>
                </label>
              ))}
              <button className="btn" onClick={() => fileRef.current?.click()} data-testid="template-open-file">
                Open file…
              </button>
              <input ref={fileRef} type="file" accept={`${TEMPLATE_EXT},${LEGACY_TEMPLATE_EXT}`} hidden onChange={(e) => openFile(e.target.files?.[0])} />
            </div>
          )}
          <label>
            <span>{dialog.mode === 'save' ? 'Template name' : 'Layout name (optional)'}</span>
            <input
              className="field"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ok()}
              data-testid="template-name"
            />
          </label>
          <div className="theme-presets">
            <button className="btn active" onClick={ok} disabled={dialog.mode === 'save' ? !name.trim() : !picked} data-testid="template-ok">
              {dialog.mode === 'save' ? 'Save' : 'Create'}
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
