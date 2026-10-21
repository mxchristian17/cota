import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/store'
import { focusCommandLine } from './focus'
import { ICONS } from './icons'
import { clampToolbar, dockedOn, dockSideAt, insertIndex, type ToolbarSide } from '../core/ui/toolbar'
import { itemTitle, TOOLBAR_BY_ID, TOOLBARS, type ToolbarCombo, type ToolbarDef } from '../core/ui/toolbars'
import { BYBLOCK, BYLAYER, linetypeLabel } from '../core/linetype/linetypes'

/**
 * Barras de herramientas clásicas: acopladas a un borde del área de dibujo (varias por borde) o flotantes con
 * título y cierre. Se arrastran por el agarre o el título; soltadas cerca de un borde (o sobre otras barras
 * acopladas) se acoplan ahí. Clic derecho: lista de barras con tildes, como los CAD de escritorio.
 */

const SIDES: ToolbarSide[] = ['top', 'left', 'right', 'bottom']
const SIDE_LABEL: Record<ToolbarSide, string> = { left: 'Left', right: 'Right', top: 'Top', bottom: 'Bottom' }

export function ToolIcon({ name }: { name: string }) {
  return <svg className="tb-icon" viewBox="0 0 16 16" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] ?? '' }} />
}

/** Rectángulo del área de dibujo (sus bordes son donde se acoplan las barras). */
const centerRect = () => document.querySelector('.center')?.getBoundingClientRect() ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }

/** Lista desplegable de una barra: capa actual, tipo de línea o estilo de cota. */
function Combo({ combo, testId }: { combo: ToolbarCombo; testId: string }) {
  useStore((s) => s.version) // refresca capas, tipos de línea y estilos
  const doc = useStore((s) => s.doc)
  const layerSvc = useStore((s) => s.layerSvc)
  const currentLayerId = useStore((s) => s.currentLayerId)
  const setCurrentLayer = useStore((s) => s.setCurrentLayer)
  const setCurrentDimStyle = useStore((s) => s.setCurrentDimStyle)
  const selection = useStore((s) => s.selection)
  const setCommon = useStore((s) => s.setEntitiesCommon)
  const setDrawingVar = useStore((s) => s.setDrawingVar)
  const openLinetypes = useStore((s) => s.openLinetypeDialog)
  const done = () => focusCommandLine()

  if (combo === 'layer') {
    return (
      <select className="field tb-combo" title="Current layer (with objects selected, moves them to that layer)" value={currentLayerId} data-testid={testId} onChange={(e) => (setCurrentLayer(e.target.value), done())}>
        {layerSvc.list().map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    )
  }
  if (combo === 'dimstyle') {
    return (
      <select className="field tb-combo" title="Current dimension style (DIMSTYLE)" value={doc.currentDimStyle} data-testid={testId} onChange={(e) => (setCurrentDimStyle(e.target.value), done())}>
        {doc.dimStyles.map((st) => (
          <option key={st.name} value={st.name}>
            {st.name}
          </option>
        ))}
      </select>
    )
  }
  // Tipo de línea: con objetos seleccionados, el de ellos; si no, el de los objetos nuevos (CELTYPE).
  const ents = selection.map((id) => doc.getEntity(id)).filter((e): e is NonNullable<typeof e> => !!e)
  const lt = (v?: string) => (v ?? BYLAYER).toUpperCase()
  const value = ents.length ? (ents.every((e) => lt(e.lineType) === lt(ents[0].lineType)) ? lt(ents[0].lineType) : '') : lt(doc.vars.CELTYPE)
  return (
    <select
      className="field tb-combo"
      title={ents.length ? 'Linetype of the selected objects' : 'Linetype of new objects (CELTYPE)'}
      value={value}
      data-testid={testId}
      onChange={(e) => {
        const v = e.target.value
        if (v === '__other') openLinetypes()
        else if (ents.length) setCommon(selection, 'lineType', v)
        else setDrawingVar('CELTYPE', v)
        done()
      }}
    >
      {value === '' && <option value="">*VARIES*</option>}
      {[BYLAYER, BYBLOCK, ...doc.linetypes.map((d) => d.name.toUpperCase())].map((n) => (
        <option key={n} value={n}>
          {linetypeLabel(n)}
        </option>
      ))}
      <option value="__other">Other…</option>
    </select>
  )
}

/** Botones y listas de una barra. Vertical no lleva listas (no entran), como en los CAD de escritorio. */
function ToolbarBody({ def, vertical }: { def: ToolbarDef; vertical: boolean }) {
  const runMacro = useStore((s) => s.runMacro)
  return (
    <div className="toolbar-body">
      {def.items.map((it, i) =>
        it.kind === 'sep' ? (
          <span key={i} className="tb-sep" />
        ) : it.kind === 'combo' ? (
          vertical ? null : <Combo key={i} combo={it.combo} testId={def.id === 'dimension' && it.combo === 'dimstyle' ? 'dim-style-select' : `combo-${def.id}-${it.combo}`} />
        ) : (
          <button
            key={i}
            className="tb-btn"
            title={itemTitle(it)}
            aria-label={it.label}
            data-testid={`tb-${def.id}-${it.icon}`}
            // Sin robar el foco: los botones de referencia a objetos entran en el prompt en curso.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              runMacro(it.run, it.transparent)
              focusCommandLine()
            }}
          >
            <ToolIcon name={it.icon} />
          </button>
        ),
      )}
    </div>
  )
}

/** Una barra (acoplada en su dock o flotante). */
function ToolbarView({ def, onMenu }: { def: ToolbarDef; onMenu: (id: string, x: number, y: number) => void }) {
  const tb = useStore((s) => s.toolbars[def.id])
  const setToolbar = useStore((s) => s.setToolbar)
  const dockToolbarAt = useStore((s) => s.dockToolbarAt)
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)

  // Al achicar la ventana, una barra flotante sigue visible.
  useEffect(() => {
    if (!tb || tb.docked || !tb.visible) return
    const onResize = () => {
      const c = clampToolbar(tb, ref.current?.offsetWidth ?? 300, window.innerWidth, window.innerHeight)
      if (c.x !== tb.x || c.y !== tb.y) setToolbar(def.id, c)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [tb, def.id, setToolbar])

  if (!tb?.visible) return null

  /** Arrastre desde el agarre (acoplada) o el título (flotante). Acoplada, se desancla al moverse 6 px. */
  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const rect = ref.current?.getBoundingClientRect()
    const ox = rect ? e.clientX - rect.left : 0
    const oy = rect ? e.clientY - rect.top : 0
    const sx = e.clientX
    const sy = e.clientY
    let moving = !tb.docked
    if (moving) setDrag({ x: e.clientX - ox, y: e.clientY - oy })
    const onMove = (ev: PointerEvent) => {
      if (!moving && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return
      moving = true
      setDrag({ x: ev.clientX - ox, y: ev.clientY - oy })
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDrag(null)
      if (!moving) return
      // Sobre un borde con barras, o cerca de un borde del dibujo: se acopla ahí, en el lugar donde cae.
      const over = SIDES.find((sd) => {
        const r = document.querySelector(`.tb-dock-${sd}`)?.getBoundingClientRect()
        return !!r && r.width > 0 && r.height > 0 && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom
      })
      const side = over ?? dockSideAt(ev.clientX, ev.clientY, centerRect())
      if (side) {
        const others = [...document.querySelectorAll<HTMLElement>(`.tb-dock-${side} > .toolbar`)].filter((el) => el.dataset.id !== def.id)
        dockToolbarAt(def.id, side, insertIndex(others.map((el) => el.getBoundingClientRect()), ev.clientX, ev.clientY, side))
      } else {
        setToolbar(def.id, { docked: false, ...clampToolbar({ x: ev.clientX - ox, y: ev.clientY - oy }, ref.current?.offsetWidth ?? 300, window.innerWidth, window.innerHeight) })
      }
      focusCommandLine()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const floating = !tb.docked || drag !== null
  const vertical = !floating && (tb.side === 'left' || tb.side === 'right')
  const pos = drag ?? { x: tb.x, y: tb.y }
  const testBase = `toolbar-${def.id}`
  return (
    <div
      ref={ref}
      className={'toolbar' + (floating ? ' toolbar-floating' : ` toolbar-docked toolbar-${tb.side}`)}
      style={floating ? { position: 'fixed', left: pos.x, top: pos.y, zIndex: 35 } : undefined}
      data-testid={testBase}
      data-id={def.id}
      data-dock={floating ? 'float' : tb.side}
      aria-label={`${def.name} toolbar`}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onMenu(def.id, e.clientX, e.clientY)
      }}
    >
      {floating ? (
        <div className="toolbar-title" onPointerDown={startDrag} onDoubleClick={() => setToolbar(def.id, { docked: true })} title="Drag to move; double-click to dock" data-testid={`${testBase}-title`}>
          <span>{def.name}</span>
          <button
            className="icon-btn"
            title="Close (Tools ▸ Toolbars to show it again)"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              setToolbar(def.id, { visible: false })
              focusCommandLine()
            }}
            data-testid={`${testBase}-close`}
          >
            ✕
          </button>
        </div>
      ) : (
        <span className="toolbar-grip" onPointerDown={startDrag} title={`${def.name} — drag to move`} data-testid={`${testBase}-grip`} />
      )}
      <ToolbarBody def={def} vertical={vertical} />
    </div>
  )
}

/** Menú contextual: acciones de la barra tocada y lista de todas las barras con tildes. */
function ToolbarMenu({ at, onClose }: { at: { id: string | null; x: number; y: number }; onClose: () => void }) {
  const toolbars = useStore((s) => s.toolbars)
  const setToolbar = useStore((s) => s.setToolbar)
  const openDialog = useStore((s) => s.openToolbarDialog)
  const tb = at.id ? toolbars[at.id] : null
  const act = (fn: () => void) => () => {
    fn()
    onClose()
    focusCommandLine()
  }
  // Que el menú entre en la ventana.
  const left = Math.min(at.x, window.innerWidth - 200)
  const top = Math.min(at.y, window.innerHeight - 24 * (TOOLBARS.length + 8))
  return (
    <>
      <div className="command-backdrop" onClick={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())} />
      <div className="toolbar-menu" style={{ left, top: Math.max(4, top) }} data-testid="toolbar-menu">
        {at.id && tb && (
          <>
            {SIDES.filter((sd) => !tb.docked || sd !== tb.side).map((sd) => (
              <button key={sd} className="command-item" onClick={act(() => setToolbar(at.id!, { docked: true, side: sd }))} data-testid={`toolbar-menu-dock-${sd}`}>
                Dock {SIDE_LABEL[sd]}
              </button>
            ))}
            {tb.docked && (
              <button className="command-item" onClick={act(() => setToolbar(at.id!, { docked: false }))} data-testid="toolbar-menu-float">
                Float
              </button>
            )}
            <button className="command-item" onClick={act(() => setToolbar(at.id!, { visible: false }))} data-testid="toolbar-menu-close">
              Close
            </button>
            <div className="toolbar-menu-sep" />
          </>
        )}
        {TOOLBARS.map((t) => (
          <button key={t.id} className="command-item" onClick={act(() => setToolbar(t.id, { visible: !toolbars[t.id]?.visible }))} data-testid={`toolbar-menu-${t.id}`}>
            <span className="command-check">{toolbars[t.id]?.visible ? '✓' : ''}</span>
            {t.name}
          </button>
        ))}
        <div className="toolbar-menu-sep" />
        <button className="command-item" onClick={act(openDialog)} data-testid="toolbar-menu-dialog">
          Toolbars…
        </button>
      </div>
    </>
  )
}

/** Menú contextual compartido por todas las barras y los bordes de acople. */
let openMenu: ((id: string | null, x: number, y: number) => void) | null = null

/** Borde de acople: las barras visibles acopladas a ese lado, en su orden. */
export function ToolbarDock({ side }: { side: ToolbarSide }) {
  const toolbars = useStore((s) => s.toolbars)
  const ids = dockedOn(toolbars, side)
  return (
    <div
      className={`tb-dock tb-dock-${side}`}
      data-testid={`tb-dock-${side}`}
      onContextMenu={(e) => {
        e.preventDefault()
        openMenu?.(null, e.clientX, e.clientY)
      }}
    >
      {ids.map((id) => {
        const def = TOOLBAR_BY_ID.get(id)
        return def ? <ToolbarView key={id} def={def} onMenu={(i, x, y) => openMenu?.(i, x, y)} /> : null
      })}
    </div>
  )
}

/** Barras flotantes y el menú contextual (una sola instancia, en App). */
export function FloatingToolbars() {
  const toolbars = useStore((s) => s.toolbars)
  const [menu, setMenu] = useState<{ id: string | null; x: number; y: number } | null>(null)
  useEffect(() => {
    openMenu = (id, x, y) => setMenu({ id, x, y })
    return () => {
      openMenu = null
    }
  }, [])
  return (
    <>
      {TOOLBARS.filter((t) => toolbars[t.id]?.visible && !toolbars[t.id].docked).map((t) => (
        <ToolbarView key={t.id} def={t} onMenu={(i, x, y) => setMenu({ id: i, x, y })} />
      ))}
      {menu && <ToolbarMenu at={menu} onClose={() => setMenu(null)} />}
    </>
  )
}

/** Diálogo TOOLBAR: tildar las barras visibles, mostrar u ocultar todas, volver a los valores iniciales. */
export function ToolbarDialog() {
  const open = useStore((s) => s.toolbarDialogOpen)
  const close = useStore((s) => s.closeToolbarDialog)
  const toolbars = useStore((s) => s.toolbars)
  const setToolbar = useStore((s) => s.setToolbar)
  const setAll = useStore((s) => s.setAllToolbars)
  const reset = useStore((s) => s.resetToolbars)
  if (!open) return null
  const done = () => {
    close()
    focusCommandLine()
  }
  return (
    <div className="modal-backdrop" onClick={done} data-testid="toolbar-dialog">
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Toolbars</h2>
          <button className="icon-btn" onClick={done} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="toolbar-dialog-list">
          {TOOLBARS.map((t) => (
            <label key={t.id} className="toolbar-dialog-item">
              <input type="checkbox" checked={!!toolbars[t.id]?.visible} onChange={(e) => setToolbar(t.id, { visible: e.target.checked })} data-testid={`toolbar-check-${t.id}`} />
              <ToolIcon name={(t.items.find((it) => it.kind === 'cmd') as { icon: string } | undefined)?.icon ?? ''} />
              <span>{t.name}</span>
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={() => setAll(true)} data-testid="toolbar-dialog-showall">
            Show all
          </button>
          <button className="btn" onClick={() => setAll(false)} data-testid="toolbar-dialog-hideall">
            Hide all
          </button>
          <button className="btn" onClick={reset} title="Only the Dimension toolbar, docked on the left" data-testid="toolbar-dialog-reset">
            Reset
          </button>
          <div className="spacer" />
          <button className="btn" onClick={done} data-testid="toolbar-dialog-close">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
