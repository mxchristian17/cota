import { useState } from 'react'
import { useStore } from '../store/store'

/**
 * Sólidos de un DWG/DXF recién abierto (SOLIDIMPORT = 0): convertirlos todos al modelo exacto ahora, o dejarlos como
 * mallas y convertir cada pieza al seleccionarla o editarla.
 */
export function SolidImportDialog() {
  const ask = useStore((s) => s.solidImportAsk)
  const choose = useStore((s) => s.solidImportChoose)
  const [remember, setRemember] = useState(false)
  if (!ask) return null
  return (
    <div className="modal-backdrop" data-testid="solid-import-dialog">
      <div className="modal solid-import-modal" role="dialog" aria-modal="true" aria-labelledby="solid-import-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="solid-import-title">3D solids in this drawing</h2>
        </div>
        <p className="solid-import-intro">
          The drawing has {ask.solids.toLocaleString()} 3D solid(s). Convert them all now to exact solids (edges, views and editing from the exact model; it takes a while and can
          be cancelled), or keep them as meshes and convert each piece when you select or edit it.
        </p>
        <label className="solid-import-remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} data-testid="solid-import-remember" /> Don&apos;t ask again (SOLIDIMPORT)
        </label>
        <div className="modal-actions">
          <button className="btn" onClick={() => choose(2, remember)} data-testid="solid-import-meshes">
            Keep as meshes
          </button>
          <button className="btn primary" onClick={() => choose(1, remember)} data-testid="solid-import-convert">
            Convert all
          </button>
        </div>
      </div>
    </div>
  )
}

/** Avance de la conversión completa de los sólidos importados, con cancelar. */
export function SolidConvertBar() {
  const p = useStore((s) => s.solidConvert)
  const cancel = useStore((s) => s.solidConvertCancel)
  if (!p) return null
  const pct = p.total ? Math.round((100 * p.done) / p.total) : 100
  return (
    <div className="solid-convert-bar" role="status" data-testid="solid-convert-bar">
      <span className="solid-convert-text">
        Converting solids: {p.done.toLocaleString()} / {p.total.toLocaleString()}
        {p.failed ? ` (${p.failed} kept as mesh)` : ''}
      </span>
      <progress max={100} value={pct} aria-label="Conversion progress" />
      <button className="btn" onClick={cancel} data-testid="solid-convert-cancel">
        Cancel
      </button>
    </div>
  )
}
