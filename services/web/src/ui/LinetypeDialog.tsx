import { useEffect, useState } from 'react'
import { useStore } from '../store/store'
import { BYBLOCK, BYLAYER, linetypeLabel, linetypeLibrary, patternLength } from '../core/linetype/linetypes'
import { applyPattern } from '../core/linetype/dash'

/** Muestra del patrón (como la columna *Appearance* del CAD clásico): una repetición ≈ 28 px. */
export function LinetypeSwatch({ pattern, width = 120 }: { pattern: number[]; width?: number }) {
  const P = patternLength(pattern)
  const k = P > 0 ? 28 / P : 1
  const r = applyPattern(
    [
      [2, 6, 0],
      [width - 2, 6, 0],
    ],
    pattern.map((x) => x * k),
  )
  return (
    <svg width={width} height={12} className="lt-swatch" aria-hidden>
      {r.dashes.map((d, i) => (
        <line key={i} x1={d[0][0]} y1={6} x2={d[d.length - 1][0]} y2={6} stroke="currentColor" strokeWidth={1.5} />
      ))}
      {r.dots.map((d, i) => (
        <circle key={`d${i}`} cx={d[0]} cy={6} r={1} fill="currentColor" />
      ))}
    </svg>
  )
}

/**
 * Administrador de tipos de línea (LINETYPE): cargados, actual, borrar los que no se usan, escala
 * global (LTSCALE), del objeto actual (CELTSCALE) y PSLTSCALE. Con `layerId` es el *Select Linetype* de
 * una capa (desde el administrador de capas).
 */
export function LinetypeDialog() {
  useStore((s) => s.version)
  const dlg = useStore((s) => s.linetypeDialog)
  const close = useStore((s) => s.closeLinetypeDialog)
  const doc = useStore((s) => s.doc)
  const load = useStore((s) => s.loadLinetypes)
  const del = useStore((s) => s.deleteLinetype)
  const setVar = useStore((s) => s.setDrawingVar)
  const setLayerLineType = useStore((s) => s.setLayerLineType)
  const layerSvc = useStore((s) => s.layerSvc)
  const notify = useStore((s) => s.notify)
  const [sel, setSel] = useState<string>(BYLAYER)
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<string[]>([])

  const layer = dlg?.layerId ? layerSvc.get(dlg.layerId) : undefined
  useEffect(() => {
    if (!dlg) return
    setSel(layer ? layer.lineType : doc.vars.CELTYPE.toUpperCase())
    setLoading(false)
    setPicked([])
  }, [dlg]) // al abrir: el valor inicial sale de la capa o de CELTYPE

  if (!dlg) return null
  const lib = linetypeLibrary(doc.units)
  const rows = [...(layer ? [] : [{ name: BYLAYER, description: '', pattern: [] }, { name: BYBLOCK, description: '', pattern: [] }]), ...doc.linetypes]
  const current = doc.vars.CELTYPE.toUpperCase()
  const ok = () => {
    if (layer) setLayerLineType(layer.id, sel)
    close()
  }
  const doLoad = () => {
    load(picked)
    if (picked.length) setSel(picked[picked.length - 1])
    setLoading(false)
    setPicked([])
  }

  return (
    <div className="modal-backdrop" onClick={close} data-testid="linetype-dialog">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{loading ? 'Load or Reload Linetypes' : layer ? `Select Linetype — ${layer.name}` : 'Linetype Manager'}</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        {loading ? (
          <div className="form">
            <div className="muted">File: {/^(in|inch|inches|ft|feet)$/i.test(doc.units) ? 'imperial library' : 'metric library'}</div>
            <div className="lt-list" data-testid="linetype-load-list">
              {lib.map((d) => {
                const on = picked.includes(d.name)
                return (
                  <label key={d.name} className={`lt-row${on ? ' selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setPicked(e.target.checked ? [...picked, d.name] : picked.filter((x) => x !== d.name))}
                      data-testid={`linetype-load-${d.name}`}
                    />
                    <span className="lt-name mono">{d.name}</span>
                    <LinetypeSwatch pattern={d.pattern} />
                    <span className="lt-desc muted">{doc.linetype(d.name) ? '(loaded)' : ''}</span>
                  </label>
                )
              })}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setLoading(false)}>
                Cancel
              </button>
              <button className="btn primary" onClick={doLoad} disabled={!picked.length} data-testid="linetype-load-ok">
                OK
              </button>
            </div>
          </div>
        ) : (
          <div className="form">
            {!layer && (
              <div className="muted" data-testid="linetype-current">
                Current Linetype: {linetypeLabel(current)}
              </div>
            )}
            <div className="lt-list" data-testid="linetype-list">
              {rows.map((d) => (
                <div
                  key={d.name}
                  className={`lt-row${sel === d.name ? ' selected' : ''}`}
                  onClick={() => setSel(d.name)}
                  onDoubleClick={() => (layer ? (setSel(d.name), setLayerLineType(layer.id, d.name), close()) : setVar('CELTYPE', d.name))}
                  data-testid={`linetype-row-${d.name}`}
                >
                  <span className="lt-name mono">
                    {linetypeLabel(d.name)}
                    {!layer && current === d.name ? ' ✓' : ''}
                  </span>
                  <LinetypeSwatch pattern={d.pattern} />
                  <span className="lt-desc muted">{d.description}</span>
                </div>
              ))}
            </div>
            <div className="theme-presets">
              <button className="btn" onClick={() => setLoading(true)} data-testid="linetype-load">
                Load…
              </button>
              {!layer && (
                <>
                  <button
                    className="btn"
                    onClick={() => {
                      if (sel === BYLAYER || sel === BYBLOCK || !del(sel)) notify(`The linetype ${linetypeLabel(sel)} is in use or cannot be deleted.`)
                    }}
                    data-testid="linetype-delete"
                  >
                    Delete
                  </button>
                  <button className="btn" onClick={() => setVar('CELTYPE', sel)} data-testid="linetype-current-btn">
                    Current
                  </button>
                </>
              )}
            </div>
            {!layer && (
              <>
                <h3>Details</h3>
                <label>
                  <span>Global scale factor (LTSCALE)</span>
                  <input
                    className="field"
                    type="number"
                    step="0.1"
                    min="0"
                    defaultValue={doc.vars.LTSCALE}
                    key={`lts${doc.vars.LTSCALE}`}
                    onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== doc.vars.LTSCALE && setVar('LTSCALE', Number(e.target.value))}
                    onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                    data-testid="linetype-ltscale"
                  />
                </label>
                <label>
                  <span>Current object scale (CELTSCALE)</span>
                  <input
                    className="field"
                    type="number"
                    step="0.1"
                    min="0"
                    defaultValue={doc.vars.CELTSCALE}
                    key={`cel${doc.vars.CELTSCALE}`}
                    onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== doc.vars.CELTSCALE && setVar('CELTSCALE', Number(e.target.value))}
                    onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                    data-testid="linetype-celtscale"
                  />
                </label>
                <label className="osnap-row">
                  <input type="checkbox" checked={doc.vars.PSLTSCALE === 1} onChange={(e) => setVar('PSLTSCALE', e.target.checked ? 1 : 0)} />
                  <span>Use paper space units for scaling (PSLTSCALE)</span>
                </label>
              </>
            )}
            <div className="modal-actions">
              <button className="btn primary" onClick={ok} data-testid="linetype-ok">
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
