import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/store'
import { PAGE_SIZES } from '../core/io/pdf'
import { drawPdfPage } from '../core/io/pdfPreview'
import { PAPER_LABELS, type PlotAreaKind, type PlotSettings } from '../core/io/plotSettings'
import { STANDARD_SCALES } from '../core/layout/scale'
import type { PlotStyle } from '../core/document/types'
import { focusCommandLine } from './focus'

const AREAS: Array<[PlotAreaKind, string]> = [
  ['extents', 'Extents'],
  ['display', 'Display'],
  ['window', 'Window'],
]
const STYLES: Array<[PlotStyle, string]> = [
  ['color', 'Color'],
  ['monochrome', 'Monochrome'],
  ['grayscale', 'Grayscale'],
]

/** Escala papel:dibujo como razón legible (1:50, 2:1, 1:37.42). */
function ratio(v: number): string {
  const r = (n: number) => String(Number(n.toPrecision(4)))
  return v >= 1 ? `${r(v)}:1` : `1:${r(1 / v)}`
}

/** La escala estándar más grande que entra en el papel (al destildar "Fit to paper"). */
function fitting(fit: number | null): number {
  const ok = STANDARD_SCALES.filter((s) => fit === null || s.value <= fit * (1 + 1e-9))
  return ok.length ? Math.max(...ok.map((s) => s.value)) : Math.min(...STANDARD_SCALES.map((s) => s.value))
}

/**
 * Diálogo *Plot* del CAD clásico (salida a PDF vectorial): papel, orientación, área (Extents, Display o una
 * ventana), escala o ajuste al papel, centrado, estilo de ploteo y lineweights, con la vista previa de la hoja
 * tal como va a salir. En un layout manda su Page Setup: sólo se previsualiza y plotea.
 */
export function PlotDialog() {
  const open = useStore((s) => s.plotOpen)
  const saved = useStore((s) => s.plotSettings)
  const preview = useStore((s) => s.plotPreview)
  const resolve = useStore((s) => s.resolvePlot)
  const [o, setO] = useState<PlotSettings>(saved)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (open) setO(saved)
  }, [open, saved])

  const r = useMemo(() => (open ? preview(o) : null), [open, o, preview])

  useEffect(() => {
    const c = canvas.current
    if (!c || !r) return
    const box = c.parentElement!.getBoundingClientRect()
    drawPdfPage(c, r.page, Math.max(160, box.width), Math.max(140, box.height))
  }, [r])

  if (!open || !r) return null
  const done = (res: 'plot' | 'window' | 'cancel') => {
    resolve(res, res === 'cancel' ? undefined : o)
    if (res !== 'window') focusCommandLine()
  }
  const isLayout = r.layout !== null
  const area = o.area === 'display' && !r.displayAvailable ? 'extents' : o.area
  const scaleValue = o.scale === null ? '' : String(STANDARD_SCALES.findIndex((s) => Math.abs(s.value - o.scale!) <= o.scale! * 1e-6))

  return (
    <div className="modal-backdrop" onClick={() => done('cancel')} data-testid="plot-dialog">
      <div className="modal plot-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Plot — {isLayout ? r.layout : 'Model'}</h2>
          <button className="icon-btn" onClick={() => done('cancel')} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="plot-body">
          <div className="plot-options">
            <label className="plot-row">
              <span>Printer/plotter</span>
              <input className="field" value="PDF (vector)" readOnly />
            </label>
            {isLayout ? (
              <p className="plot-note muted" data-testid="plot-layout-note">
                The sheet plots at 1:1 with the paper, plot style and lineweights of its page setup (PAGESETUP).
              </p>
            ) : (
              <>
                <label className="plot-row">
                  <span>Paper size</span>
                  <select className="field" value={o.paper} onChange={(e) => setO({ ...o, paper: e.target.value })} data-testid="plot-paper">
                    {Object.keys(PAGE_SIZES).map((k) => (
                      <option key={k} value={k}>
                        {PAPER_LABELS[k] ?? k}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="plot-row">
                  <span>Orientation</span>
                  <span className="plot-inline">
                    <label>
                      <input type="radio" name="plot-orient" checked={!o.portrait} onChange={() => setO({ ...o, portrait: false })} data-testid="plot-landscape" /> Landscape
                    </label>
                    <label>
                      <input type="radio" name="plot-orient" checked={o.portrait} onChange={() => setO({ ...o, portrait: true })} data-testid="plot-portrait" /> Portrait
                    </label>
                  </span>
                </div>
                <div className="plot-row">
                  <span>Plot area</span>
                  <span className="plot-inline">
                    <select
                      className="field"
                      value={area}
                      onChange={(e) => {
                        const v = e.target.value as PlotAreaKind
                        if (v === 'window' && !o.window) done('window')
                        else setO({ ...o, area: v })
                      }}
                      data-testid="plot-area"
                    >
                      {AREAS.map(([v, label]) => (
                        <option key={v} value={v} disabled={v === 'display' && !r.displayAvailable}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {area === 'window' && (
                      <button className="btn" onClick={() => done('window')} data-testid="plot-window">
                        Window &lt;
                      </button>
                    )}
                  </span>
                </div>
                <div className="plot-row">
                  <span>Plot scale</span>
                  <span className="plot-inline">
                    <label>
                      <input
                        type="checkbox"
                        checked={o.scale === null}
                        onChange={(e) => setO({ ...o, scale: e.target.checked ? null : fitting(r.scale) })}
                        data-testid="plot-fit"
                      />{' '}
                      Fit to paper
                    </label>
                    <select
                      className="field"
                      value={scaleValue}
                      disabled={o.scale === null}
                      onChange={(e) => setO({ ...o, scale: STANDARD_SCALES[Number(e.target.value)].value })}
                      data-testid="plot-scale"
                    >
                      {o.scale === null && <option value="">{r.scale ? ratio(r.scale) : '—'}</option>}
                      {STANDARD_SCALES.map((s, i) => (
                        <option key={s.label} value={i}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </span>
                </div>
                <label className="plot-row plot-check">
                  <input type="checkbox" checked={o.center} onChange={(e) => setO({ ...o, center: e.target.checked })} data-testid="plot-center" /> Center the plot
                </label>
                <label className="plot-row">
                  <span>Plot style</span>
                  <select className="field" value={o.plotStyle} onChange={(e) => setO({ ...o, plotStyle: e.target.value as PlotStyle })} data-testid="plot-style">
                    {STYLES.map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="plot-row plot-check">
                  <input type="checkbox" checked={o.lineWeights} onChange={(e) => setO({ ...o, lineWeights: e.target.checked })} data-testid="plot-lineweights" /> Plot object lineweights
                </label>
              </>
            )}
          </div>
          <div className="plot-preview">
            <canvas ref={canvas} data-testid="plot-preview" />
            <span className="plot-caption muted" data-testid="plot-caption">
              {r.empty ? 'Nothing to plot in this area.' : `Scale ${r.scale ? ratio(r.scale) : '—'}`}
            </span>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={() => done('cancel')} data-testid="plot-cancel">
            Cancel
          </button>
          <button className="btn primary" onClick={() => done('plot')} disabled={r.empty && !isLayout} data-testid="plot-ok">
            Plot
          </button>
        </div>
      </div>
    </div>
  )
}
