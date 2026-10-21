import { useEffect, useState } from 'react'
import { useStore } from '../store/store'
import { BYBLOCK, BYLAYER, CONTINUOUS, linetypeLibrary } from '../core/linetype/linetypes'
import type { FlatshotDestination, FlatshotOptions } from '../core/projection/flatshot'
import { focusCommandLine } from './focus'

const DESTINATIONS: Array<[FlatshotDestination, string]> = [
  ['insert', 'Insert as new block'],
  ['replace', 'Replace existing block'],
  ['file', 'Export to a file'],
]

/**
 * Diálogo *Flatshot* del CAD clásico: destino, líneas visibles (*Foreground lines*), líneas ocultas
 * (*Obscured lines*, se muestran sólo si se tilda *Show*) y aristas tangentes. En Cota el color va por capa
 * (no hay color por objeto): las líneas del bloque toman el de la capa de la inserción.
 */
export function FlatshotDialog() {
  const open = useStore((s) => s.flatshotOpen)
  const saved = useStore((s) => s.flatshotOptions)
  const resolve = useStore((s) => s.resolveFlatshot)
  const doc = useStore((s) => s.doc)
  const [o, setO] = useState<FlatshotOptions>(saved)

  useEffect(() => {
    if (open) setO(saved)
  }, [open, saved])

  if (!open) return null
  const names = [BYBLOCK, BYLAYER, CONTINUOUS, ...new Set([...doc.linetypes.map((l) => l.name), ...linetypeLibrary(doc.units).map((l) => l.name)])].filter(
    (n, i, a) => a.findIndex((x) => x.toUpperCase() === n.toUpperCase()) === i,
  )
  const done = (r: FlatshotOptions | null) => {
    resolve(r)
    focusCommandLine()
  }
  const ltSelect = (value: string, onChange: (v: string) => void, testid: string, disabled = false) => (
    <select className="field" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} data-testid={testid}>
      {names.map((n) => (
        <option key={n} value={n}>
          {n === BYBLOCK ? 'ByBlock' : n === BYLAYER ? 'ByLayer' : n}
        </option>
      ))}
    </select>
  )

  return (
    <div className="modal-backdrop" onClick={() => done(null)} data-testid="flatshot-dialog">
      <div className="modal modal-sm flatshot-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Flatshot</h2>
          <button className="icon-btn" onClick={() => done(null)} aria-label="Close">
            ✕
          </button>
        </div>
        <fieldset className="flatshot-group">
          <legend>Destination</legend>
          {DESTINATIONS.map(([v, label]) => (
            <label key={v} className="flatshot-row">
              <input type="radio" name="flatshot-dest" checked={o.destination === v} onChange={() => setO({ ...o, destination: v })} data-testid={`flatshot-dest-${v}`} /> {label}
            </label>
          ))}
        </fieldset>
        <fieldset className="flatshot-group">
          <legend>Foreground lines</legend>
          <label className="flatshot-row">
            Linetype {ltSelect(o.foregroundLinetype, (v) => setO({ ...o, foregroundLinetype: v }), 'flatshot-fg-lt')}
          </label>
          <p className="muted flatshot-note">Color: by the layer of the block reference.</p>
        </fieldset>
        <fieldset className="flatshot-group">
          <legend>Obscured lines</legend>
          <label className="flatshot-row">
            <input type="checkbox" checked={o.showObscured} onChange={(e) => setO({ ...o, showObscured: e.target.checked })} data-testid="flatshot-show-obscured" /> Show
          </label>
          <label className="flatshot-row">
            Linetype {ltSelect(o.obscuredLinetype, (v) => setO({ ...o, obscuredLinetype: v }), 'flatshot-ob-lt', !o.showObscured)}
          </label>
        </fieldset>
        <label className="flatshot-row">
          <input type="checkbox" checked={o.tangential} onChange={(e) => setO({ ...o, tangential: e.target.checked })} data-testid="flatshot-tangential" /> Include tangential edges
        </label>
        <div className="modal-actions">
          <button className="btn primary" onClick={() => done(o)} data-testid="flatshot-create">
            Create
          </button>
          <button className="btn" onClick={() => done(null)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
