import { Fragment, useState } from 'react'
import { useStore } from '../store/store'
import type { Command } from '../core/commands/types'
import { VARIABLE_COMMANDS } from '../core/commands/registry'
import { CATEGORIES } from '../core/ui/menus'
import { TOOLBARS } from '../core/ui/toolbars'
import { focusCommandLine } from './focus'

type MenuEntry = { kind: 'cmd'; cmd: Command } | { kind: 'section'; title: string } | { kind: 'special'; id: string }

/** Vista ▸ Zoom (etiqueta, respuesta a ZOOM, descripción). */
const ZOOM_ITEMS: Array<[string, string, string]> = [
  ['Realtime', '', 'Drag to zoom (Esc/Enter to exit)'],
  ['Previous', 'P', 'Previous view'],
  ['Window', 'W', 'Zoom to a window'],
  ['Dynamic', 'D', 'Move/resize a view box over the whole drawing'],
  ['Scale', 'S', 'Scale factor: n, nX or nXP'],
  ['Center', 'C', 'Center point and height'],
  ['Object', 'O', 'Zoom to the selected objects'],
  ['In', '2x', 'Zoom in (2x)'],
  ['Out', '0.5x', 'Zoom out (0.5x)'],
  ['All', 'A', 'Limits and extents'],
  ['Extents', 'E', 'Everything drawn'],
]

export function CommandBar() {
  const listCommands = useStore((s) => s.listCommands)
  const submitCommand = useStore((s) => s.submitCommand)
  const toolbars = useStore((s) => s.toolbars)
  const setToolbar = useStore((s) => s.setToolbar)
  const [open, setOpen] = useState<string | null>(null)
  /** Posición del desplegable (fija: la barra puede desplazarse en ventanas angostas sin recortarlo). */
  const [at, setAt] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const place = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    setAt({ left: Math.max(0, Math.min(r.left, window.innerWidth - 270)), top: r.bottom })
  }

  const commands = listCommands()
  const byName = new Map(commands.map((c) => [c.name, c]))
  const covered = new Set<string>()
  const groups: { label: string; entries: MenuEntry[] }[] = []
  for (const cat of CATEGORIES) {
    const entries: MenuEntry[] = []
    for (const n of cat.names) {
      if (n.startsWith('§')) entries.push({ kind: 'section', title: n.slice(1) })
      else if (n.startsWith('@')) entries.push({ kind: 'special', id: n.slice(1) })
      else {
        const c = byName.get(n)
        if (!c) continue
        covered.add(c.name)
        entries.push({ kind: 'cmd', cmd: c })
      }
    }
    // Sin secciones vacías (un comando que no está registrado deja su título solo).
    const clean = entries.filter((e, i) => e.kind !== 'section' || (entries[i + 1] && entries[i + 1].kind !== 'section'))
    if (clean.some((e) => e.kind !== 'section')) groups.push({ label: cat.label, entries: clean })
  }
  const others = commands.filter((c) => !covered.has(c.name) && !VARIABLE_COMMANDS.has(c.name) && !c.name.startsWith('-'))
  if (others.length) groups.splice(groups.length - 1, 0, { label: 'Otros', entries: others.map((cmd) => ({ kind: 'cmd' as const, cmd })) })

  const run = (name: string) => {
    setOpen(null)
    submitCommand(name)
    focusCommandLine()
  }
  const doc = useStore((s) => s.doc)
  useStore((s) => s.version) // vistas guardadas
  /** Comando con sus respuestas, como las macros de menú del CAD clásico (`^C^C_zoom _p`). */
  const runSeq = (...steps: string[]) => {
    setOpen(null)
    const next = (i: number) => {
      if (i >= steps.length) return focusCommandLine()
      submitCommand(steps[i])
      setTimeout(() => next(i + 1), 0)
    }
    next(0)
  }

  return (
    <div
      className={`command-bar${open ? ' open' : ''}`}
      data-testid="command-bar"
      // La rueda desplaza los menús cuando no entran (ventana angosta).
      onWheel={(e) => {
        if (e.deltaY) e.currentTarget.scrollLeft += e.deltaY
      }}
    >
      {groups.map((g) => (
        <div
          key={g.label}
          className="command-menu"
          onMouseEnter={(e) => {
            if (!open) return
            place(e.currentTarget)
            setOpen(g.label)
          }}
        >
          <button
            className={`command-cat${open === g.label ? ' active' : ''}`}
            onClick={(e) => {
              place(e.currentTarget)
              setOpen(open === g.label ? null : g.label)
            }}
            data-testid={`command-cat-${g.label}`}
          >
            {g.label}
          </button>
          {open === g.label && (
            <div className="command-dropdown" style={{ position: 'fixed', left: at.left, top: at.top }} data-testid={`command-dropdown-${g.label}`}>
              {g.entries.map((en, i) =>
                en.kind === 'section' ? (
                  <div key={`s${i}`} className="command-section muted">
                    {en.title}
                  </div>
                ) : en.kind === 'cmd' ? (
                  <button key={en.cmd.name} className="command-item" onClick={() => run(en.cmd.name)} title={en.cmd.description} data-testid={`menu-cmd-${en.cmd.name}`}>
                    <span className="command-item-name mono">{en.cmd.name}</span>
                    <span className="command-item-alias mono">{en.cmd.aliases[0] ?? ''}</span>
                    <span className="command-item-desc">{en.cmd.description}</span>
                  </button>
                ) : en.id === 'zoom' ? (
                  <Fragment key="zoom">
                    {/* Vista ▸ Zoom del CAD clásico. */}
                    <div className="command-section muted">Zoom</div>
                    {ZOOM_ITEMS.map(([label, opt, desc]) => (
                      <button key={label} className="command-item" onClick={() => runSeq('ZOOM', opt)} title={desc} data-testid={`menu-zoom-${label}`}>
                        <span className="command-item-name mono">{label}</span>
                        <span className="command-item-alias mono">{opt || '↵'}</span>
                        <span className="command-item-desc">{desc}</span>
                      </button>
                    ))}
                  </Fragment>
                ) : en.id === 'views' ? (
                  <Fragment key="views">
                    {doc.namedViews().length > 0 && <div className="command-section muted">Named views</div>}
                    {doc.namedViews().map((v) => (
                      <button key={v.name} className="command-item" onClick={() => runSeq('-VIEW', 'R', v.name)} data-testid={`menu-view-${v.name}`}>
                        <span className="command-item-name mono">{v.name}</span>
                        <span className="command-item-alias mono" />
                        <span className="command-item-desc">Restore the named view</span>
                      </button>
                    ))}
                  </Fragment>
                ) : (
                  <Fragment key="toolbars">
                    {/* Herramientas ▸ Barras de herramientas: tilde = visible. */}
                    <div className="command-section muted">Toolbars</div>
                    {TOOLBARS.map((t) => (
                      <button
                        key={t.id}
                        className="command-item"
                        onClick={() => {
                          setToolbar(t.id, { visible: !toolbars[t.id]?.visible })
                          setOpen(null)
                          focusCommandLine()
                        }}
                        data-testid={`menu-toolbar-${t.id}`}
                      >
                        <span className="command-item-name mono">
                          <span className="command-check">{toolbars[t.id]?.visible ? '✓' : ''}</span>
                          {t.name}
                        </span>
                        <span className="command-item-alias mono" />
                        <span className="command-item-desc">{t.name} toolbar</span>
                      </button>
                    ))}
                    <div className="command-section muted" />
                  </Fragment>
                ),
              )}
            </div>
          )}
        </div>
      ))}
      {open && <div className="command-backdrop" onClick={() => setOpen(null)} />}
    </div>
  )
}
