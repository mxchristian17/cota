import { useState } from 'react'
import { useStore } from '../store/store'
import { linetypeLabel } from '../core/linetype/linetypes'
import { focusCommandLine } from './focus'

/**
 * Administrador de capas (comando `LAYER`/`LA`), con el formato del *Layer Properties Manager* del
 * CAD clásico: una fila por capa con estado, nombre editable, On, Lock, color, lineweight, linetype y
 * Plot. Fijar la capa actual con objetos seleccionados los mueve a esa capa.
 */
/** Nombre de capa: se fija con Enter o al salir del campo (renombrar en cada tecla rompería el
 *  nombre único y generaría un paso de undo por carácter). */
function LayerNameInput({ id, name, onRename }: { id: string; name: string; onRename: (id: string, v: string) => void }) {
  const commit = (v: string) => {
    const next = v.trim()
    if (next && next !== name) onRename(id, next)
  }
  return (
    <input
      className="field layer-name-input"
      defaultValue={name}
      key={name}
      title="Layer name"
      data-testid={`layer-name-${name}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit(e.currentTarget.value)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          e.currentTarget.value = name
        }
      }}
      onBlur={(e) => commit(e.target.value)}
    />
  )
}

export function LayerDialog() {
  // Suscripción a `version` para refrescar ante cambios en las capas.
  useStore((s) => s.version)
  const open = useStore((s) => s.layersOpen)
  const close = useStore((s) => s.closeLayers)
  const layerSvc = useStore((s) => s.layerSvc)
  const currentLayerId = useStore((s) => s.currentLayerId)
  const selection = useStore((s) => s.selection)
  const setCurrent = useStore((s) => s.setCurrentLayer)
  const createLayer = useStore((s) => s.createLayer)
  const renameLayer = useStore((s) => s.renameLayer)
  const setColor = useStore((s) => s.setLayerColor)
  const setLineWeight = useStore((s) => s.setLayerLineWeight)
  const setLineType = useStore((s) => s.setLayerLineType)
  const openLinetypes = useStore((s) => s.openLinetypeDialog)
  const setPrintable = useStore((s) => s.setLayerPrintable)
  const toggleVisible = useStore((s) => s.toggleLayerVisible)
  const toggleLock = useStore((s) => s.toggleLayerLock)
  const toggleFrozen = useStore((s) => s.toggleLayerFrozen)
  const deleteLayer = useStore((s) => s.deleteLayer)
  const setVpFrozen = useStore((s) => s.setLayerVpFrozen)
  const setNewVpFreeze = useStore((s) => s.setLayerNewVpFreeze)
  const moveLayer = useStore((s) => s.moveLayer)
  // VP Freeze aplica al viewport de MSPACE (como el CAD clásico, la columna aparece con un viewport activo).
  const doc = useStore((s) => s.doc)
  const msVp = doc.msViewportId ? doc.getEntity(doc.msViewportId) : undefined
  const vpFrozen = msVp?.type === 'VIEWPORT' ? msVp.props.frozenLayers : null

  const [name, setName] = useState('')
  const [filter, setFilter] = useState('')
  // Arrastre de filas para el orden de dibujo: id de la fila arrastrada y fila de destino.
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null)

  if (!open) return null

  const all = layerSvc.list()
  const layers = all.filter((l) => l.name.toLowerCase().includes(filter.trim().toLowerCase()))
  const indexOf = (id: string) => all.findIndex((l) => l.id === id)

  const onAdd = () => {
    const n = name.trim()
    if (!n) return
    createLayer(n)
    setName('')
  }

  const onClose = () => {
    close()
    focusCommandLine()
  }

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="layer-dialog">
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Layer Properties Manager</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="layer-toolbar">
          <input
            className="field"
            placeholder="New layer name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAdd()}
            data-testid="new-layer-input"
          />
          <button className="btn" onClick={onAdd} data-testid="add-layer">
            New layer
          </button>
          <div className="spacer" />
          <input
            className="field"
            placeholder="Filter by name…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            data-testid="layer-filter"
          />
        </div>

        <p className="muted layer-hint">Layers higher in the list draw on top and win when picking: drag a row or use ▲▼.</p>

        {selection.length > 0 && (
          <p className="muted layer-hint">
            {selection.length} objeto(s) seleccionado(s): al fijar una capa se mueven a ella.
          </p>
        )}

        <div className="layer-table-wrap">
          <table className="layer-table" data-testid="layer-table">
            <thead>
              <tr>
                <th title="Draw order: the top row is drawn on top">Order</th>
                <th title="Current layer">Cur</th>
                <th>Name</th>
                <th title="On / off">On</th>
                <th title="Freeze / thaw in all viewports (the current layer cannot be frozen)">Freeze</th>
                <th title="Locked">Lock</th>
                <th>Color</th>
                <th title="Line weight (mm)">LW</th>
                <th>Linetype</th>
                <th title="Printable">Plot</th>
                {vpFrozen && <th title="Frozen in the current layout viewport">VP Freeze</th>}
                <th title="Frozen in new layout viewports">New VP Freeze</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {layers.map((l) => (
                <tr
                  key={l.id}
                  className={[l.id === currentLayerId ? 'current' : '', drag?.over === l.id && drag.id !== l.id ? 'drop-target' : '']
                    .filter(Boolean)
                    .join(' ') || undefined}
                  onDragOver={(e) => {
                    if (!drag) return
                    e.preventDefault()
                    if (drag.over !== l.id) setDrag({ ...drag, over: l.id })
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (drag) moveLayer(drag.id, indexOf(l.id))
                    setDrag(null)
                  }}
                  data-testid={`layer-row-${l.name}`}
                >
                  <td className="layer-order">
                    {/* Sólo la manija arrastra: así seleccionar texto en el nombre no mueve la fila. */}
                    <span
                      className="drag-handle"
                      title="Drag to reorder"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', l.id)
                        setDrag({ id: l.id, over: null })
                      }}
                      onDragEnd={() => setDrag(null)}
                      data-testid={`layer-drag-${l.name}`}
                    >
                      ⋮⋮
                    </span>
                    <button
                      className="icon-btn"
                      title="Move up (drawn above)"
                      disabled={indexOf(l.id) === 0}
                      onClick={() => moveLayer(l.id, indexOf(l.id) - 1)}
                      data-testid={`layer-up-${l.name}`}
                    >
                      ▲
                    </button>
                    <button
                      className="icon-btn"
                      title="Move down (drawn below)"
                      disabled={indexOf(l.id) === all.length - 1}
                      onClick={() => moveLayer(l.id, indexOf(l.id) + 1)}
                      data-testid={`layer-down-${l.name}`}
                    >
                      ▼
                    </button>
                  </td>
                  <td>
                    <button
                      className="icon-btn"
                      title="Set current layer (with objects selected, moves them to this layer)"
                      onClick={() => setCurrent(l.id)}
                      data-testid={`layer-${l.name}`}
                    >
                      {l.id === currentLayerId ? '●' : '○'}
                    </button>
                  </td>
                  <td>
                    <LayerNameInput id={l.id} name={l.name} onRename={renameLayer} />
                  </td>
                  <td>
                    <button className="icon-btn" title="Visibility" onClick={() => toggleVisible(l.id)}>
                      {l.visible ? '👁' : '—'}
                    </button>
                  </td>
                  <td>
                    <button
                      className={'icon-btn' + (l.frozen ? ' layer-frozen' : '')}
                      title={l.id === currentLayerId ? 'The current layer cannot be frozen' : l.frozen ? 'Frozen: click to thaw' : 'Thawed: click to freeze'}
                      disabled={l.id === currentLayerId && !l.frozen}
                      aria-pressed={!!l.frozen}
                      onClick={() => toggleFrozen(l.id)}
                      data-testid={`layer-freeze-${l.name}`}
                    >
                      {l.frozen ? '❄' : '☀'}
                    </button>
                  </td>
                  <td>
                    <button className="icon-btn" title="Lock" onClick={() => toggleLock(l.id)}>
                      {l.locked ? '🔒' : '🔓'}
                    </button>
                  </td>
                  <td>
                    <input
                      type="color"
                      className="layer-color"
                      value={l.color}
                      title="Color"
                      onChange={(e) => setColor(l.id, e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="field lw-input"
                      type="number"
                      step="0.05"
                      min="0"
                      title="Line weight (mm)"
                      value={l.lineWeight}
                      onChange={(e) => setLineWeight(l.id, Number(e.target.value))}
                    />
                  </td>
                  <td>
                    <select
                      className="field lt-input"
                      title="Line type"
                      value={l.lineType}
                      onChange={(e) => (e.target.value === '__other' ? openLinetypes({ layerId: l.id }) : setLineType(l.id, e.target.value))}
                      data-testid={`layer-lt-${l.name}`}
                    >
                      {doc.linetypes.map((d) => (
                        <option key={d.name} value={d.name}>
                          {linetypeLabel(d.name)}
                        </option>
                      ))}
                      <option value="__other">Other…</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={l.printable}
                      title="Include in plots (PDF)"
                      onChange={(e) => setPrintable(l.id, e.target.checked)}
                      data-testid={`layer-plot-${l.name}`}
                    />
                  </td>
                  {vpFrozen && (
                    <td>
                      <input
                        type="checkbox"
                        checked={vpFrozen.includes(l.id)}
                        title="Freeze in the current layout viewport (VPLAYER)"
                        onChange={(e) => setVpFrozen(l.id, e.target.checked)}
                        data-testid={`layer-vpfreeze-${l.name}`}
                      />
                    </td>
                  )}
                  <td>
                    <input
                      type="checkbox"
                      checked={!!l.newVpFreeze}
                      title="Frozen in new layout viewports (VPLAYER Vpvisdflt)"
                      onChange={(e) => setNewVpFreeze(l.id, e.target.checked)}
                      data-testid={`layer-newvpfreeze-${l.name}`}
                    />
                  </td>
                  <td>
                    <button
                      className="icon-btn"
                      title="Delete layer"
                      disabled={l.id === '0' || l.id === currentLayerId}
                      onClick={() => deleteLayer(l.id)}
                      data-testid={`delete-layer-${l.name}`}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
