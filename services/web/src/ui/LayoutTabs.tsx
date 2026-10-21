import { useEffect, useState } from 'react'
import { useStore } from '../store/store'
import { MODEL_TAB } from '../core/document/DocumentModel'
import { focusCommandLine } from './focus'

interface Menu {
  x: number
  y: number
  /** Layout sobre el que se abrió el menú (null = pestaña Model). */
  id: string | null
}

/** Pestañas `Model | Layout1 | … | +` compactas, integradas en la barra de estado. */
export function LayoutTabs() {
  useStore((s) => s.version) // nombres/orden/pestaña activa viven en el documento
  const doc = useStore((s) => s.doc)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const newLayout = useStore((s) => s.newLayout)
  const copyLayout = useStore((s) => s.copyLayout)
  const renameLayout = useStore((s) => s.renameLayout)
  const deleteLayout = useStore((s) => s.deleteLayout)
  const moveLayout = useStore((s) => s.moveLayout)
  const openTemplateDialog = useStore((s) => s.openTemplateDialog)
  const openPageSetup = useStore((s) => s.openPageSetup)
  const exportPdf = useStore((s) => s.exportPdf)
  const publishLayouts = useStore((s) => s.publishLayouts)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const active = doc.activeTab
  const layouts = doc.layouts
  const go = (id: string) => {
    setActiveTab(id)
    focusCommandLine()
  }
  const commitRename = () => {
    if (editing) renameLayout(editing.id, editing.name)
    setEditing(null)
    focusCommandLine()
  }
  const run = (fn: () => void) => () => {
    setMenu(null)
    fn()
    focusCommandLine()
  }
  const target = menu?.id ? doc.getLayout(menu.id) : undefined
  const idx = target ? layouts.indexOf(target) : -1

  return (
    <span className="layout-tabs" data-testid="layout-tabs">
      <button
        className={'layout-tab' + (active === MODEL_TAB ? ' active' : '')}
        data-testid="tab-Model"
        onClick={() => go(MODEL_TAB)}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY, id: null })
        }}
      >
        Model
      </button>
      {layouts.map((l) =>
        editing?.id === l.id ? (
          <input
            key={l.id}
            className="layout-tab-edit"
            autoFocus
            value={editing.name}
            data-testid="tab-rename"
            onChange={(e) => setEditing({ id: l.id, name: e.target.value })}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') commitRename()
              else if (e.key === 'Escape') setEditing(null)
            }}
          />
        ) : (
          <button
            key={l.id}
            className={'layout-tab' + (active === l.id ? ' active' : '')}
            data-testid={`tab-${l.name}`}
            title="Double-click to rename; right-click for options"
            onClick={() => go(l.id)}
            onDoubleClick={() => setEditing({ id: l.id, name: l.name })}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, id: l.id })
            }}
          >
            {l.name}
          </button>
        ),
      )}
      <button className="layout-tab add" title="New layout" data-testid="tab-add" onClick={run(newLayout)}>
        +
      </button>
      {menu && (
        <div
          className="context-menu"
          style={{ left: menu.x, bottom: window.innerHeight - menu.y }}
          data-testid="layout-menu"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button onClick={run(newLayout)}>New layout</button>
          <button onClick={run(() => openTemplateDialog('from'))} data-testid="layout-from-template">
            From template…
          </button>
          <button onClick={run(() => publishLayouts(layouts.map((l) => l.id)))} data-testid="layout-publish">
            Publish all layouts…
          </button>
          {target && (
            <>
              <hr />
              <button onClick={run(() => setEditing({ id: target.id, name: target.name }))}>Rename</button>
              <button onClick={run(() => copyLayout(target.id))}>Duplicate</button>
              <button disabled={idx <= 0} onClick={run(() => moveLayout(target.id, -1))}>
                Move left
              </button>
              <button disabled={idx >= layouts.length - 1} onClick={run(() => moveLayout(target.id, 1))}>
                Move right
              </button>
              <button
                disabled={layouts.length <= 1}
                data-testid="layout-delete"
                onClick={run(() => {
                  if (window.confirm(`The layout "${target.name}" will be permanently deleted.`)) deleteLayout(target.id)
                })}
              >
                Delete
              </button>
              <hr />
              <button onClick={run(() => openPageSetup(target.id))} data-testid="layout-pagesetup">
                Page setup…
              </button>
              <button
                onClick={run(() => {
                  setActiveTab(target.id)
                  exportPdf()
                })}
              >
                Plot…
              </button>
              <button onClick={run(() => openTemplateDialog('save', target.id))} data-testid="layout-save-template">
                Save as template…
              </button>
            </>
          )}
        </div>
      )}
    </span>
  )
}
