import { useEffect, useState } from 'react'
import { useStore, type TemplateEntry } from '../store/store'
import { NO_TEMPLATE_ID } from '../core/layout/template'
import { DARK_THEME, LIGHT_THEME, type Theme } from '../core/theme'
import { sysvars, type PersistedSysvars } from '../core/commands/sysvars'

type Key = keyof PersistedSysvars

/** Un campo de una variable del sistema: número, casilla (0/1) o lista de opciones. */
type Field =
  | { kind: 'number'; key: Key; label: string; min?: number; max?: number; step?: number }
  | { kind: 'check'; key: Key; label: string }
  | { kind: 'select'; key: Key; label: string; options: Array<[string | number, string]> }

/** Pestañas como las del diálogo de opciones del CAD clásico; la última que se usó se recuerda. */
const TABS = [
  { id: 'display', label: 'Display' },
  { id: 'files', label: 'Open and Save' },
  { id: 'drafting', label: 'Drafting' },
  { id: 'editing', label: 'Editing' },
  { id: 'user', label: 'User Preferences' },
] as const
type TabId = (typeof TABS)[number]['id']
const TAB_KEY = 'cota.optionsTab'

const COLOR_FIELDS: Array<{ key: keyof Theme; label: string }> = [
  { key: 'background', label: 'Background' },
  { key: 'gridMajor', label: 'Grid (major)' },
  { key: 'gridMinor', label: 'Grid (minor)' },
  { key: 'crosshairColor', label: 'Crosshair' },
]

const DISPLAY_FIELDS: Field[] = [
  { kind: 'select', key: 'UCSICON', label: 'UCS icon', options: [[0, 'Off'], [1, 'On, at the corner'], [3, 'On, at the origin when it fits']] },
  { kind: 'number', key: 'ZOOMFACTOR', label: 'Zoom step of the mouse wheel', min: 3, max: 100 },
  { kind: 'check', key: 'ZOOMWHEEL', label: 'Reverse the mouse wheel zoom' },
  { kind: 'number', key: 'RENDERMINPX', label: 'Hide text smaller than (px)', min: 0, max: 20 },
]

const DRAFTING_FIELDS: Field[] = [
  { kind: 'check', key: 'UCSDETECT', label: 'Dynamic UCS: draw on the face of a solid under the cursor' },
  { kind: 'check', key: 'UCSORTHO', label: 'Orthographic views set their UCS' },
  { kind: 'check', key: 'UCSFOLLOW', label: 'Changing the UCS shows its plan view' },
  { kind: 'check', key: 'UCSVIEW', label: 'Save the current UCS with named views' },
]

const EDITING_FIELDS: Array<{ title: string; fields: Field[] }> = [
  {
    title: 'Fillet / Chamfer',
    fields: [
      { kind: 'number', key: 'FILLETRAD', label: 'Fillet radius', min: 0 },
      { kind: 'number', key: 'CHAMFERA', label: 'Chamfer distance 1', min: 0 },
      { kind: 'number', key: 'CHAMFERB', label: 'Chamfer distance 2', min: 0 },
      { kind: 'number', key: 'CHAMFERC', label: 'Chamfer length', min: 0 },
      { kind: 'number', key: 'CHAMFERD', label: 'Chamfer angle (°)', min: 0, max: 90 },
      { kind: 'select', key: 'CHAMMODE', label: 'Chamfer method', options: [['Distance', 'Distance'], ['Angle', 'Angle']] },
      { kind: 'check', key: 'TRIMMODE', label: 'Trim objects' },
    ],
  },
  {
    title: 'Trim / Extend',
    fields: [
      { kind: 'check', key: 'EDGEMODE', label: 'Extend cutting edges to their apparent intersection' },
      { kind: 'select', key: 'PROJMODE', label: 'Projection', options: [['None', 'None (3D)'], ['Ucs', 'UCS'], ['View', 'View']] },
    ],
  },
  {
    title: 'Offset / Polyline',
    fields: [
      { kind: 'select', key: 'OFFSETGAPTYPE', label: 'Gaps of offset polylines', options: [[0, 'Extend the segments'], [1, 'Fillet with arcs'], [2, 'Chamfer']] },
      { kind: 'check', key: 'PEDITACCEPT', label: 'PEDIT turns lines and arcs into polylines without asking' },
    ],
  },
]

const USER_FIELDS: Field[] = [
  { kind: 'check', key: 'ATTDIA', label: 'Ask for block attributes in a dialog' },
  { kind: 'check', key: 'ATTREQ', label: 'Ask for attribute values when inserting a block' },
]

function readTab(): TabId {
  try {
    const t = localStorage.getItem(TAB_KEY)
    return TABS.some((x) => x.id === t) ? (t as TabId) : 'display'
  } catch {
    return 'display'
  }
}

function SysvarField({ f }: { f: Field }) {
  const setSysvars = useStore((s) => s.setSysvars)
  const value = sysvars[f.key] as unknown
  const id = `sysvar-${f.key}`
  if (f.kind === 'check') {
    return (
      <label className="color-row">
        <span>{f.label}</span>
        <input type="checkbox" checked={value === 1} onChange={(e) => setSysvars({ [f.key]: e.target.checked ? 1 : 0 } as Partial<PersistedSysvars>)} data-testid={id} />
      </label>
    )
  }
  if (f.kind === 'select') {
    const numeric = typeof f.options[0][0] === 'number'
    return (
      <label className="color-row">
        <span>{f.label}</span>
        <select
          className="field"
          value={String(value)}
          onChange={(e) => setSysvars({ [f.key]: numeric ? Number(e.target.value) : e.target.value } as Partial<PersistedSysvars>)}
          data-testid={id}
        >
          {f.options.map(([v, label]) => (
            <option key={String(v)} value={String(v)}>
              {label}
            </option>
          ))}
        </select>
      </label>
    )
  }
  return (
    <label className="color-row">
      <span>{f.label}</span>
      <input
        className="field"
        type="number"
        min={f.min}
        max={f.max}
        step={f.step ?? 'any'}
        value={value as number}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) setSysvars({ [f.key]: v } as Partial<PersistedSysvars>)
        }}
        data-testid={id}
      />
    </label>
  )
}

export function OptionsDialog() {
  const open = useStore((s) => s.optionsOpen)
  const close = useStore((s) => s.closeOptions)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  useStore((s) => s.sysvarRev)
  const defaultTemplate = useStore((s) => s.defaultTemplate)
  const setDefaultTemplate = useStore((s) => s.setDefaultTemplate)
  const listTemplates = useStore((s) => s.listTemplates)
  const autosave = useStore((s) => s.autosave)
  const agentTab = useStore((s) => s.agentTab)
  const setAgentPanel = useStore((s) => s.setAgentPanel)
  const toggleAutosave = useStore((s) => s.toggleAutosave)
  const openOsnap = useStore((s) => s.openOsnap)
  const submitCommand = useStore((s) => s.submitCommand)
  const [templates, setTemplates] = useState<TemplateEntry[]>([])
  const [tab, setTab] = useState<TabId>(readTab)
  useEffect(() => {
    if (open) void listTemplates().then(setTemplates)
  }, [open, listTemplates])

  if (!open) return null

  const pick = (t: TabId) => {
    setTab(t)
    try {
      localStorage.setItem(TAB_KEY, t)
    } catch {
      // Sin almacenamiento: se abre en Display la próxima vez.
    }
  }
  /** Cierra y ejecuta un comando con sus respuestas (cada una es una entrada de la línea de comandos). */
  const run = (...inputs: string[]) => {
    close()
    for (const i of inputs) submitCommand(i)
  }
  const sameAs = (t: Theme): boolean =>
    (['background', 'gridMajor', 'gridMinor', 'crosshairColor'] as const).every((k) => theme[k] === t[k])

  return (
    <div className="modal-backdrop" onClick={close} data-testid="options-dialog">
      <div className="modal modal-md options-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Options</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="options-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`options-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => pick(t.id)}
              data-testid={`options-tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="form options-body" role="tabpanel">
          {tab === 'display' && (
            <>
              <h3>Color scheme</h3>
              <div className="theme-presets">
                <button className={`btn${sameAs(DARK_THEME) ? ' active' : ''}`} onClick={() => setTheme(DARK_THEME)} data-testid="theme-dark">
                  Dark
                </button>
                <button className={`btn${sameAs(LIGHT_THEME) ? ' active' : ''}`} onClick={() => setTheme(LIGHT_THEME)} data-testid="theme-light">
                  Light
                </button>
              </div>
              {COLOR_FIELDS.map((f) => (
                <label key={f.key} className="color-row">
                  <span>{f.label}</span>
                  <input
                    type="color"
                    value={theme[f.key] as string}
                    onChange={(e) => setTheme({ [f.key]: e.target.value } as Partial<Theme>)}
                    data-testid={`theme-${f.key}`}
                  />
                </label>
              ))}
              <h3>Crosshair and view</h3>
              <label className="color-row">
                <span>Crosshair size (px)</span>
                <input
                  className="field"
                  type="number"
                  min={4}
                  max={60}
                  value={theme.crosshairSize}
                  onChange={(e) => setTheme({ crosshairSize: Number(e.target.value) })}
                  data-testid="theme-crosshair-size"
                />
              </label>
              {DISPLAY_FIELDS.map((f) => (
                <SysvarField key={f.key} f={f} />
              ))}
            </>
          )}
          {tab === 'files' && (
            <>
              <h3>Saving</h3>
              <label className="color-row">
                <span>Save the drawing automatically</span>
                <input type="checkbox" checked={autosave} onChange={() => toggleAutosave()} data-testid="options-autosave" />
              </label>
              <h3>Layouts</h3>
              <label>
                <span>Default template for new layouts (and Layout1 of new drawings)</span>
                <select className="field" value={defaultTemplate} onChange={(e) => void setDefaultTemplate(e.target.value)} data-testid="default-template">
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                  <option value={NO_TEMPLATE_ID}>None (viewport only)</option>
                </select>
              </label>
              <h3>Drawing template</h3>
              <p className="options-note">Units, layers, styles, layouts and these preferences, saved as a .cotatpl file. NEW starts from the default one.</p>
              <div className="options-actions">
                <button className="btn" onClick={() => run('TEMPLATE', 'Save')} data-testid="options-template-save">
                  Save as template…
                </button>
                <button className="btn" onClick={() => run('TEMPLATE', 'Open')}>
                  Open template…
                </button>
                <button className="btn" onClick={() => run('TEMPLATE', 'Default')}>
                  Use current as default
                </button>
                <button className="btn" onClick={() => run('TEMPLATE', 'Clear')}>
                  Forget default
                </button>
              </div>
            </>
          )}
          {tab === 'drafting' && (
            <>
              <h3>Object snaps</h3>
              <div className="options-actions">
                <button
                  className="btn"
                  onClick={() => {
                    close()
                    openOsnap()
                  }}
                  data-testid="options-osnap"
                >
                  Object snap settings…
                </button>
              </div>
              <h3>User coordinate system</h3>
              {DRAFTING_FIELDS.map((f) => (
                <SysvarField key={f.key} f={f} />
              ))}
            </>
          )}
          {tab === 'editing' &&
            EDITING_FIELDS.map((g) => (
              <div key={g.title}>
                <h3>{g.title}</h3>
                {g.fields.map((f) => (
                  <SysvarField key={f.key} f={f} />
                ))}
              </div>
            ))}
          {tab === 'user' && (
            <>
              <h3>Agent</h3>
              <label className="color-row">
                <span>Show the Agents tab on the right when the agent panel is closed</span>
                <input type="checkbox" checked={agentTab} onChange={(e) => setAgentPanel({ tab: e.target.checked })} data-testid="options-agent-tab" />
              </label>
              <h3>Blocks</h3>
              {USER_FIELDS.map((f) => (
                <SysvarField key={f.key} f={f} />
              ))}
              <h3>Units</h3>
              <div className="options-actions">
                <button className="btn" onClick={() => run('UNITS')}>
                  Drawing units…
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
