import { useEffect, useState } from 'react'
import type { GenView, ViewGenChoice } from '../core/drawing/viewgen'
import { focusCommandLine } from './focus'

/** Pedido abierto por VIEWGEN (fuera del store: la respuesta es una promesa). */
let request: { initial: ViewGenChoice; resolve: (c: ViewGenChoice | null) => void } | null = null
const listeners = new Set<() => void>()

export function requestViewGen(initial: ViewGenChoice): Promise<ViewGenChoice | null> {
  request?.resolve(null)
  return new Promise((resolve) => {
    request = { initial, resolve }
    listeners.forEach((l) => l())
  })
}

const LABEL: Record<GenView, string> = {
  TOP: 'Top', BOTTOM: 'Bottom', FRONT: 'Front', BACK: 'Back', LEFT: 'Left', RIGHT: 'Right',
  ISO: 'SE iso', SWISO: 'SW iso', NEISO: 'NE iso', NWISO: 'NW iso',
}

/** Celdas del esquema (fila, columna) según la disposición: el alzado al centro y las demás vistas a su alrededor. */
function cells(std: 'E' | 'A'): Array<[GenView, number, number]> {
  const e = std === 'E'
  return [
    ['SWISO', 0, 0], [e ? 'BOTTOM' : 'TOP', 0, 1], ['ISO', 0, 2],
    [e ? 'RIGHT' : 'LEFT', 1, 0], ['FRONT', 1, 1], [e ? 'LEFT' : 'RIGHT', 1, 2], ['BACK', 1, 3],
    ['NWISO', 2, 0], [e ? 'TOP' : 'BOTTOM', 2, 1], ['NEISO', 2, 2],
  ]
}

/** Diálogo de VIEWGEN: esquema de las vistas para marcar cuáles se generan, ISO-E / ISO-A y líneas ocultas. */
export function ViewGenDialog() {
  const [, setTick] = useState(0)
  const [c, setC] = useState<ViewGenChoice | null>(null)
  useEffect(() => {
    const l = () => {
      setC(request ? { ...request.initial, views: [...request.initial.views] } : null)
      setTick((t) => t + 1)
    }
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  if (!c || !request) return null
  const done = (r: ViewGenChoice | null) => {
    const q = request
    request = null
    setC(null)
    q?.resolve(r)
    focusCommandLine()
  }
  const toggle = (v: GenView) => v !== 'FRONT' && setC({ ...c, views: c.views.includes(v) ? c.views.filter((x) => x !== v) : [...c.views, v] })
  return (
    <div className="modal-backdrop" onClick={() => done(null)} data-testid="viewgen-dialog" translate="no">
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && done(null)}>
        <div className="modal-header">
          <h2>Generate views</h2>
          <button className="icon-btn" onClick={() => done(null)} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="viewgen-hint">Choose the views to generate around the front view.</p>
        <div className="viewgen-grid">
          {cells(c.std).map(([v, row, col]) => (
            <button
              key={v}
              className={'viewgen-cell' + (c.views.includes(v) || v === 'FRONT' ? ' on' : '') + (v.endsWith('ISO') ? ' iso' : '')}
              style={{ gridRow: row + 1, gridColumn: col + 1 }}
              disabled={v === 'FRONT'}
              onClick={() => toggle(v)}
              data-testid={`viewgen-${v}`}
            >
              {LABEL[v]}
            </button>
          ))}
        </div>
        <div className="viewgen-options">
          <label>
            <input type="radio" name="viewgen-std" checked={c.std === 'E'} onChange={() => setC({ ...c, std: 'E' })} data-testid="viewgen-iso-e" /> ISO-E (first angle)
          </label>
          <label>
            <input type="radio" name="viewgen-std" checked={c.std === 'A'} onChange={() => setC({ ...c, std: 'A' })} data-testid="viewgen-iso-a" /> ISO-A (third angle)
          </label>
          <label>
            <input type="checkbox" checked={c.hidden} onChange={(e) => setC({ ...c, hidden: e.target.checked })} /> Hidden lines
          </label>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={() => done(null)}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => done(c)} data-testid="viewgen-ok">
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
