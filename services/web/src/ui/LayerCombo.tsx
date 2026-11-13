import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { shownLayer } from '../core/layers/selectionLayer'
import { useStore } from '../store/store'
import { LockIcon } from './LockIcon'

/** Con más capas que esto, la lista trae un filtro por nombre. */
const FILTER_FROM = 12

/**
 * Combo de capas (barras y barra de estado): muestra la capa de los objetos seleccionados, con "(+N)" si son varias, y
 * vuelve a la actual al deseleccionar. Elegir una capa con objetos seleccionados los mueve a ella; si no, la hace actual.
 * Como el control de capas del CAD clásico, cada fila de la lista prende o apaga, congela y bloquea su capa sin cerrarla.
 */
export function LayerCombo({ className, testId, onPicked }: { className: string; testId: string; onPicked: () => void }) {
  useStore((s) => s.version) // refresca capas y objetos movidos
  useStore((s) => s.prompt) // al entrar en un comando, los controles vuelven a la capa actual
  const doc = useStore((s) => s.doc)
  const engine = useStore((s) => s.engine)
  const layerSvc = useStore((s) => s.layerSvc)
  const currentLayerId = useStore((s) => s.currentLayerId)
  const selection = useStore((s) => s.selection)
  const setCurrentLayer = useStore((s) => s.setCurrentLayer)
  const toggleVisible = useStore((s) => s.toggleLayerVisible)
  const toggleFrozen = useStore((s) => s.toggleLayerFrozen)
  const toggleLock = useStore((s) => s.toggleLayerLock)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [place, setPlace] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const shown = shownLayer(currentLayerId, engine.busy ? [] : selection.map((id) => doc.getEntity(id)))
  const layer = layerSvc.get(shown.id)
  const label = `${layer?.name ?? ''}${shown.others > 0 ? ` (+${shown.others})` : ''}`
  const layers = layerSvc.list()

  const close = (): void => {
    setOpen(false)
    setFilter('')
  }

  // Debajo del botón, o arriba si no entra (el de la barra de estado está al pie de la pantalla).
  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const width = Math.max(r.width, 280)
    const left = Math.max(4, Math.min(r.left, window.innerWidth - width - 4))
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    setPlace(below >= 240 || below >= above ? { left, top: r.bottom + 2, width, maxHeight: below } : { left, bottom: window.innerHeight - r.top + 2, width, maxHeight: above })
  }, [open])

  // Un clic afuera o Esc cierran la lista.
  useEffect(() => {
    if (!open) return
    const onDown = (ev: MouseEvent) => {
      const t = ev.target as Node
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) close()
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      ev.stopPropagation()
      close()
      onPicked()
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, onPicked])

  const pick = (id: string): void => {
    setCurrentLayer(id)
    close()
    onPicked()
  }
  const q = filter.trim().toLowerCase()
  const rows = q ? layers.filter((l) => l.name.toLowerCase().includes(q)) : layers
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={className + ' layer-combo'}
        title="Layer of the selected objects (choosing one moves them to it); with nothing selected, the current layer. The list also turns layers on and off, freezes and locks them."
        data-testid={testId}
        data-value={shown.others > 0 ? '' : shown.id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="layer-swatch" style={{ background: layer?.color ?? 'transparent' }} />
        <span className="layer-combo-name">{label}</span>
        <span className="layer-combo-caret">▾</span>
      </button>
      {open &&
        place &&
        createPortal(
          <div
            ref={pop}
            className="layer-combo-pop"
            role="listbox"
            data-testid={`${testId}-list`}
            style={{ left: place.left, top: place.top, bottom: place.bottom, width: place.width, maxHeight: Math.max(160, place.maxHeight) }}
          >
            {layers.length > FILTER_FROM && (
              <input
                className="field layer-combo-filter"
                placeholder="Filter layers…"
                value={filter}
                autoFocus
                data-testid={`${testId}-filter`}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter' && rows.length === 1) pick(rows[0].id)
                }}
              />
            )}
            <div className="layer-combo-rows">
              {rows.map((l) => {
                const current = l.id === currentLayerId
                return (
                  <div key={l.id} className={'layer-combo-row' + (l.id === shown.id ? ' is-shown' : '')} role="option" aria-selected={l.id === shown.id} data-testid={`${testId}-row-${l.name}`}>
                    <button className="icon-btn" title={l.visible ? 'On: click to turn off (hide)' : 'Off: click to turn on'} aria-pressed={!l.visible} data-testid={`${testId}-visible-${l.name}`} onClick={() => toggleVisible(l.id)}>
                      {l.visible ? '👁' : '—'}
                    </button>
                    <button
                      className={'icon-btn' + (l.frozen ? ' layer-frozen' : '')}
                      title={current && !l.frozen ? 'The current layer cannot be frozen' : l.frozen ? 'Frozen: click to thaw' : 'Thawed: click to freeze'}
                      disabled={current && !l.frozen}
                      aria-pressed={!!l.frozen}
                      data-testid={`${testId}-freeze-${l.name}`}
                      onClick={() => toggleFrozen(l.id)}
                    >
                      {l.frozen ? '❄' : '☀'}
                    </button>
                    <button className="icon-btn" title={l.locked ? 'Locked: click to unlock' : 'Unlocked: click to lock'} aria-pressed={!!l.locked} data-testid={`${testId}-lock-${l.name}`} onClick={() => toggleLock(l.id)}>
                      <LockIcon locked={!!l.locked} />
                    </button>
                    <span className="layer-swatch" style={{ background: l.color }} />
                    <button className={'layer-combo-pick' + (l.visible && !l.frozen ? '' : ' is-off')} title={selection.length ? 'Move the selected objects to this layer' : 'Make this the current layer'} data-testid={`${testId}-pick-${l.name}`} onClick={() => pick(l.id)}>
                      {l.name}
                      {current && <span className="layer-combo-current"> (current)</span>}
                    </button>
                  </div>
                )
              })}
              {!rows.length && <div className="layer-combo-empty">No layer matches.</div>}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
