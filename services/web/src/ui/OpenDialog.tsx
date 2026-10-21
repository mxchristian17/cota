import { useStore } from '../store/store'

export function OpenDialog() {
  const open = useStore((s) => s.openOpen)
  const close = useStore((s) => s.closeOpen)
  const docList = useStore((s) => s.docList)
  const loadDocument = useStore((s) => s.loadDocument)
  const deleteDocument = useStore((s) => s.deleteDocument)
  const fsFolderName = useStore((s) => s.fsFolderName)
  const fsList = useStore((s) => s.fsList)
  const openLocalDrawing = useStore((s) => s.openLocalDrawing)
  const openFromDevice = useStore((s) => s.openFromDevice)

  if (!open) return null

  /** Abrir un archivo suelto del equipo, fuera de la lista. */
  const deviceButton = (
    <div className="theme-presets">
      <button className="btn" onClick={openFromDevice} data-testid="open-from-device" title=".cota, .dxf or .dwg from this device">
        Open from device…
      </button>
    </div>
  )

  // Modo carpeta local: se listan los archivos reales, agrupados por subcarpeta.
  if (fsFolderName) {
    const groups = new Map<string, typeof fsList>()
    for (const f of fsList) {
      if (!groups.has(f.folder)) groups.set(f.folder, [])
      groups.get(f.folder)!.push(f)
    }
    const folders = [...groups.keys()].sort((a, b) => a.localeCompare(b))
    return (
      <div className="modal-backdrop" onClick={close} data-testid="open-dialog">
        <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Open drawing — 📁 {fsFolderName}</h2>
            <button className="icon-btn" onClick={close} aria-label="Close">
              ✕
            </button>
          </div>
          {deviceButton}
          {fsList.length === 0 ? (
            <p className="muted">No .cota or .dxf files in this folder yet.</p>
          ) : (
            <div className="doc-tree" data-testid="local-file-list">
              {folders.map((folder) => (
                <div key={folder || '(root)'} className="doc-group">
                  <div className="doc-group-title muted">📁 {folder || '(root)'}</div>
                  <ul className="doc-list">
                    {groups.get(folder)!.map((f) => (
                      <li key={f.path} className="doc-row">
                        <button className="doc-open" onClick={() => void openLocalDrawing(f.path)} data-testid={`local-${f.name}`}>
                          {f.name}
                          <span className="muted mono doc-ext"> {f.ext}</span>
                        </button>
                        <span className="muted doc-date">
                          {f.lastModified ? new Date(f.lastModified).toLocaleString() : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" onClick={close} data-testid="open-dialog">
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Open drawing</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        {deviceButton}
        {docList.length === 0 ? (
          <p className="muted">No saved drawings yet.</p>
        ) : (
          (() => {
            // Agrupa por carpeta de proyecto ("" = raíz), carpetas ordenadas alfabéticamente.
            const groups = new Map<string, typeof docList>()
            for (const d of docList) {
              const key = d.folder || ''
              if (!groups.has(key)) groups.set(key, [])
              groups.get(key)!.push(d)
            }
            const folders = [...groups.keys()].sort((a, b) => a.localeCompare(b))
            return (
              <div className="doc-tree">
                {folders.map((folder) => (
                  <div key={folder || '(root)'} className="doc-group">
                    <div className="doc-group-title muted">📁 {folder || '(root)'}</div>
                    <ul className="doc-list">
                      {groups.get(folder)!.map((d) => (
                        <li key={d.id} className="doc-row">
                          <button className="doc-open" onClick={() => void loadDocument(d.id)}>
                            {d.name}
                          </button>
                          <span className="muted doc-date">{new Date(d.updated_at).toLocaleString()}</span>
                          <button className="icon-btn" title="Delete" onClick={() => void deleteDocument(d.id)}>
                            🗑
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )
          })()
        )}
      </div>
    </div>
  )
}
