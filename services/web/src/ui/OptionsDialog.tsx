import { useEffect, useState } from 'react'
import { useStore, type TemplateEntry } from '../store/store'
import { NO_TEMPLATE_ID } from '../core/layout/template'
import { DARK_THEME, LIGHT_THEME, type Theme } from '../core/theme'
import { sysvars, type PersistedSysvars } from '../core/commands/sysvars'

/** Variables numéricas de FILLET/CHAMFER expuestas en OPTIONS. */
const NUMERIC_VARS: Array<{ key: 'FILLETRAD' | 'CHAMFERA' | 'CHAMFERB' | 'CHAMFERC' | 'CHAMFERD'; label: string }> = [
  { key: 'FILLETRAD', label: 'Fillet radius' },
  { key: 'CHAMFERA', label: 'Chamfer distance 1' },
  { key: 'CHAMFERB', label: 'Chamfer distance 2' },
  { key: 'CHAMFERC', label: 'Chamfer length' },
  { key: 'CHAMFERD', label: 'Chamfer angle (°)' },
]

const COLOR_FIELDS: Array<{ key: keyof Theme; label: string }> = [
  { key: 'background', label: 'Background' },
  { key: 'gridMajor', label: 'Grid (major)' },
  { key: 'gridMinor', label: 'Grid (minor)' },
  { key: 'crosshairColor', label: 'Crosshair' },
]

export function OptionsDialog() {
  const open = useStore((s) => s.optionsOpen)
  const close = useStore((s) => s.closeOptions)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const setSysvars = useStore((s) => s.setSysvars)
  useStore((s) => s.sysvarRev)
  const defaultTemplate = useStore((s) => s.defaultTemplate)
  const setDefaultTemplate = useStore((s) => s.setDefaultTemplate)
  const listTemplates = useStore((s) => s.listTemplates)
  const [templates, setTemplates] = useState<TemplateEntry[]>([])
  useEffect(() => {
    if (open) void listTemplates().then(setTemplates)
  }, [open, listTemplates])

  if (!open) return null

  const sameAs = (t: Theme): boolean =>
    (['background', 'gridMajor', 'gridMinor', 'crosshairColor'] as const).every((k) => theme[k] === t[k])

  return (
    <div className="modal-backdrop" onClick={close} data-testid="options-dialog">
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Options</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="form">
          <div className="theme-presets">
            <button
              className={`btn${sameAs(DARK_THEME) ? ' active' : ''}`}
              onClick={() => setTheme(DARK_THEME)}
              data-testid="theme-dark"
            >
              Dark
            </button>
            <button
              className={`btn${sameAs(LIGHT_THEME) ? ' active' : ''}`}
              onClick={() => setTheme(LIGHT_THEME)}
              data-testid="theme-light"
            >
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
          <h3>Fillet / Chamfer</h3>
          {NUMERIC_VARS.map((f) => (
            <label key={f.key} className="color-row">
              <span>{f.label}</span>
              <input
                className="field"
                type="number"
                min={0}
                value={sysvars[f.key]}
                onChange={(e) => setSysvars({ [f.key]: Number(e.target.value) })}
                data-testid={`sysvar-${f.key}`}
              />
            </label>
          ))}
          <label className="color-row">
            <span>Chamfer method</span>
            <select
              className="field"
              value={sysvars.CHAMMODE}
              onChange={(e) => setSysvars({ CHAMMODE: e.target.value as PersistedSysvars['CHAMMODE'] })}
              data-testid="sysvar-CHAMMODE"
            >
              <option value="Distance">Distance</option>
              <option value="Angle">Angle</option>
            </select>
          </label>
          <label className="color-row">
            <span>Trim objects</span>
            <input
              type="checkbox"
              checked={sysvars.TRIMMODE === 1}
              onChange={(e) => setSysvars({ TRIMMODE: e.target.checked ? 1 : 0 })}
              data-testid="sysvar-TRIMMODE"
            />
          </label>
          <h3>Layouts</h3>
          <label>
            <span>Default template for new layouts (and Layout1 of new drawings)</span>
            <select
              className="field"
              value={defaultTemplate}
              onChange={(e) => void setDefaultTemplate(e.target.value)}
              data-testid="default-template"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value={NO_TEMPLATE_ID}>None (viewport only)</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  )
}
