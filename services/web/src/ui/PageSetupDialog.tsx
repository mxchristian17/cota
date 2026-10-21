import { useEffect, useState } from 'react'
import { useStore } from '../store/store'
import type { PageSetup } from '../core/document/types'
import { PAPER_SIZES, paperSizeMm } from '../core/layout/paper'

const MARGINS = ['Top', 'Right', 'Bottom', 'Left'] as const

/** PAGESETUP: papel, orientación, márgenes y estilo de ploteo de un layout. */
export function PageSetupDialog() {
  const layoutId = useStore((s) => s.pageSetupFor)
  const close = useStore((s) => s.closePageSetup)
  const apply = useStore((s) => s.applyPageSetup)
  const doc = useStore((s) => s.doc)
  const layout = layoutId ? doc.getLayout(layoutId) : undefined
  const [ps, setPs] = useState<PageSetup | null>(null)

  useEffect(() => setPs(layout ? structuredClone(layout.pageSetup) : null), [layout])
  if (!layout || !ps) return null

  const patch = (p: Partial<PageSetup>) => setPs({ ...ps, ...p })
  const custom = ps.customSize ?? [210, 297]
  const size = paperSizeMm(ps)
  const ok = () => {
    apply(layout.id, ps)
    close()
  }

  return (
    <div className="modal-backdrop" onClick={close} data-testid="pagesetup-dialog">
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Page Setup — {layout.name}</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="form">
          <label>
            <span>Paper size</span>
            <select className="field" value={ps.paper} onChange={(e) => patch({ paper: e.target.value })} data-testid="pagesetup-paper">
              {Object.entries(PAPER_SIZES).map(([k, p]) => (
                <option key={k} value={k}>
                  {p.label}
                </option>
              ))}
              <option value="CUSTOM">Custom…</option>
            </select>
          </label>
          {ps.paper === 'CUSTOM' && (
            <div className="custom-prop-row">
              {(['Width', 'Height'] as const).map((label, i) => (
                <input
                  key={label}
                  className="field"
                  type="number"
                  min={10}
                  title={`${label} (mm)`}
                  value={custom[i]}
                  onChange={(e) => {
                    const next: [number, number] = [...custom]
                    next[i] = Math.max(10, Number(e.target.value) || 10)
                    patch({ customSize: next })
                  }}
                  data-testid={`pagesetup-custom-${label.toLowerCase()}`}
                />
              ))}
            </div>
          )}
          <label>
            <span>Orientation</span>
            <select
              className="field"
              value={ps.orientation}
              onChange={(e) => patch({ orientation: e.target.value as PageSetup['orientation'] })}
              data-testid="pagesetup-orientation"
            >
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          </label>
          <span className="muted">
            Sheet: {size.width} × {size.height} mm (changing the paper does not move objects)
          </span>
          <div className="custom-prop-row">
            {MARGINS.map((m, i) => (
              <input
                key={m}
                className="field"
                type="number"
                min={0}
                title={`${m} margin (mm)`}
                value={ps.marginsMm[i]}
                onChange={(e) => {
                  const next = [...ps.marginsMm] as PageSetup['marginsMm']
                  next[i] = Math.max(0, Number(e.target.value) || 0)
                  patch({ marginsMm: next })
                }}
                data-testid={`pagesetup-margin-${m.toLowerCase()}`}
              />
            ))}
          </div>
          <label>
            <span>Plot style</span>
            <select
              className="field"
              value={ps.plotStyle}
              onChange={(e) => patch({ plotStyle: e.target.value as PageSetup['plotStyle'] })}
              data-testid="pagesetup-plotstyle"
            >
              <option value="color">Color</option>
              <option value="monochrome">Monochrome</option>
              <option value="grayscale">Grayscale</option>
            </select>
          </label>
          {(
            [
              ['plotLineweights', 'Plot object lineweights'],
              ['paperspaceLast', 'Plot paperspace last'],
              ['hidePaperspaceObjects', 'Hide paperspace objects (hidden lines)'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="osnap-row">
              <input type="checkbox" checked={ps[k]} onChange={(e) => patch({ [k]: e.target.checked })} data-testid={`pagesetup-${k}`} />
              <span>{label}</span>
            </label>
          ))}
          <div className="theme-presets">
            <button className="btn active" onClick={ok} data-testid="pagesetup-ok">
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
