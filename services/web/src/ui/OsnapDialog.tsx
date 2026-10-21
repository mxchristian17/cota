import { useStore } from '../store/store'
import { OSNAP_KINDS, OSNAP_LABELS } from '../core/snap/osnap'

export function OsnapDialog() {
  const open = useStore((s) => s.osnapOpen)
  const close = useStore((s) => s.closeOsnap)
  const osnap = useStore((s) => s.osnap)
  const setOsnap = useStore((s) => s.setOsnap)
  const setAllOsnap = useStore((s) => s.setAllOsnap)
  const esnap = useStore((s) => s.esnap)
  const toggleEsnap = useStore((s) => s.toggleEsnap)

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={close} data-testid="osnap-dialog">
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Object Snap</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="form">
          <label className="osnap-row">
            <input type="checkbox" checked={esnap} onChange={toggleEsnap} data-testid="osnap-enabled" />
            <span>Object Snap On (F3)</span>
          </label>
          <div className="osnap-grid">
            {OSNAP_KINDS.map((k) => (
              <label key={k} className="osnap-row">
                <input
                  type="checkbox"
                  checked={osnap[k]}
                  onChange={(e) => setOsnap(k, e.target.checked)}
                  data-testid={`osnap-${k}`}
                />
                <span>{OSNAP_LABELS[k]}</span>
              </label>
            ))}
          </div>
          <div className="theme-presets">
            <button className="btn" onClick={() => setAllOsnap(true)} data-testid="osnap-all">
              Select all
            </button>
            <button className="btn" onClick={() => setAllOsnap(false)} data-testid="osnap-none">
              Clear all
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
