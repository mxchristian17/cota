import { useState } from 'react'
import { useStore } from '../store/store'
import { DIM_TABS, DIM_VAR_INFO, formatDimVar, resolveDimVars, type DimTab, type DimVars } from '../core/dimension/style'
import { DimPreview } from './DimPreview'
import { DimVarInput } from './DimVarInput'
import { focusCommandLine } from './focus'

type Edit = { kind: 'new' | 'modify' | 'override'; name: string; vars: DimVars }

/**
 * Administrador de estilos de cota (`DIMSTYLE`), como el del CAD clásico: lista de estilos con
 * vista previa, *Set Current*, *New* (a partir de otro), *Modify*, *Override*, *Compare*, *Rename* y
 * *Delete*; la edición tiene las siete pestañas y vista previa en vivo.
 */
export function DimStyleDialog() {
  const open = useStore((s) => s.dimStyleOpen)
  return open ? <DimStyleBody /> : null
}

function DimStyleBody() {
  useStore((s) => s.version)
  const doc = useStore((s) => s.doc)
  const close = useStore((s) => s.closeDimStyle)
  const setCurrent = useStore((s) => s.setCurrentDimStyle)
  const save = useStore((s) => s.saveDimStyle)
  const rename = useStore((s) => s.renameDimStyle)
  const remove = useStore((s) => s.deleteDimStyle)
  const setOverrides = useStore((s) => s.setDimStyleOverrides)
  const [selected, setSelected] = useState(doc.currentDimStyle)
  const [edit, setEdit] = useState<Edit | null>(null)
  const [tab, setTab] = useState<DimTab>('Lines')
  const [newName, setNewName] = useState<{ name: string; from: string } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [compare, setCompare] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const styles = doc.dimStyles
  const sel = doc.dimStyleDef(selected) ?? styles[0]
  const overrides = doc.dimOverrides
  const hasOverrides = Object.keys(overrides).length > 0
  const onClose = () => {
    close()
    focusCommandLine()
  }

  if (edit) {
    const base = edit.kind === 'override' ? doc.dimStyleDef(doc.currentDimStyle)?.vars : undefined
    const ok = () => {
      if (edit.kind === 'override') setOverrides(edit.vars)
      else save({ name: edit.name, vars: edit.vars })
      if (edit.kind === 'new') setSelected(edit.name)
      setEdit(null)
    }
    const title = edit.kind === 'new' ? `New Dimension Style: ${edit.name}` : edit.kind === 'modify' ? `Modify Dimension Style: ${edit.name}` : `Override Current Style: ${edit.name}`
    return (
      <div className="modal-backdrop" data-testid="dimstyle-dialog">
        <div className="modal modal-lg dimstyle-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{title}</h2>
          </div>
          <div className="dimstyle-tabs" role="tablist">
            {DIM_TABS.map((t) => (
              <button key={t} className={'btn' + (t === tab ? ' active' : '')} onClick={() => setTab(t)} data-testid={`dimstyle-tab-${t}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="dimstyle-edit">
            <div className="dimstyle-fields">
              {DIM_VAR_INFO.filter((v) => v.tab === tab).map((info) => (
                <DimVarInput
                  key={info.name}
                  info={info}
                  value={edit.vars[info.name]}
                  overridden={!!base && base[info.name] !== edit.vars[info.name]}
                  onChange={(v) => setEdit({ ...edit, vars: { ...edit.vars, [info.name]: v } })}
                />
              ))}
            </div>
            <DimPreview vars={edit.vars} testId="dimstyle-preview" />
          </div>
          <div className="theme-presets">
            <button className="btn active" onClick={ok} data-testid="dimstyle-ok">
              OK
            </button>
            <button className="btn" onClick={() => setEdit(null)}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  const compareRows =
    compare && sel
      ? DIM_VAR_INFO.filter((v) => (doc.dimStyleDef(compare)?.vars[v.name] ?? null) !== sel.vars[v.name])
      : []

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="dimstyle-dialog">
      <div className="modal modal-lg dimstyle-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Dimension Style Manager</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="muted">
          Current dimension style: <b>{doc.currentDimStyle}</b>
          {hasOverrides && ' (with style overrides)'}
        </p>
        <div className="dimstyle-main">
          <ul className="dimstyle-list" data-testid="dimstyle-list">
            {styles.map((st) => (
              <li key={st.name}>
                {renaming === st.name ? (
                  <input
                    className="field"
                    autoFocus
                    defaultValue={st.name}
                    data-testid="dimstyle-rename-input"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (rename(st.name, e.currentTarget.value)) setSelected(e.currentTarget.value.trim())
                        setRenaming(null)
                      } else if (e.key === 'Escape') setRenaming(null)
                    }}
                    onBlur={() => setRenaming(null)}
                  />
                ) : (
                  <button className={'doc-open' + (st.name === sel?.name ? ' active' : '')} onClick={() => setSelected(st.name)} data-testid={`dimstyle-item-${st.name}`}>
                    {st.name === doc.currentDimStyle ? '● ' : ''}
                    {st.name}
                    {st.vars.ANNOTATIVE ? ' ⚖' : ''}
                  </button>
                )}
                {st.name === doc.currentDimStyle && hasOverrides && <div className="muted dimstyle-ov">&lt;style overrides&gt;</div>}
              </li>
            ))}
          </ul>
          <div className="dimstyle-side">
            {sel && <DimPreview vars={sel.name === doc.currentDimStyle ? doc.currentDimVars : sel.vars} testId="dimstyle-list-preview" />}
            {compare && (
              <div className="dimstyle-compare" data-testid="dimstyle-compare">
                <b>
                  {sel?.name} vs {compare}
                </b>
                {compareRows.length === 0 ? (
                  <p className="muted">No differences.</p>
                ) : (
                  <table className="layer-table">
                    <tbody>
                      {compareRows.map((v) => (
                        <tr key={v.name}>
                          <td title={v.label}>{v.name}</td>
                          <td>{formatDimVar(v.name, sel?.vars[v.name])}</td>
                          <td>{formatDimVar(v.name, doc.dimStyleDef(compare)?.vars[v.name])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
          <div className="dimstyle-buttons">
            <button className="btn" disabled={!sel || sel.name === doc.currentDimStyle} onClick={() => sel && setCurrent(sel.name)} data-testid="dimstyle-setcurrent">
              Set Current
            </button>
            <button className="btn" onClick={() => setNewName({ name: `Copy of ${sel?.name ?? 'Standard'}`, from: sel?.name ?? 'Standard' })} data-testid="dimstyle-new">
              New…
            </button>
            <button className="btn" disabled={!sel} onClick={() => sel && setEdit({ kind: 'modify', name: sel.name, vars: { ...sel.vars } })} data-testid="dimstyle-modify">
              Modify…
            </button>
            <button
              className="btn"
              onClick={() => setEdit({ kind: 'override', name: doc.currentDimStyle, vars: doc.currentDimVars })}
              data-testid="dimstyle-override"
            >
              Override…
            </button>
            {hasOverrides && (
              <button className="btn" onClick={() => setOverrides(null)} data-testid="dimstyle-clear-overrides">
                Clear overrides
              </button>
            )}
            <select className="field" value={compare ?? ''} onChange={(e) => setCompare(e.target.value || null)} title="Compare with" data-testid="dimstyle-compare-select">
              <option value="">Compare…</option>
              {styles.filter((s) => s.name !== sel?.name).map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="btn" disabled={!sel} onClick={() => sel && setRenaming(sel.name)} data-testid="dimstyle-rename">
              Rename
            </button>
            <button
              className="btn"
              disabled={!sel || sel.name === doc.currentDimStyle}
              onClick={() => {
                if (sel && remove(sel.name)) setSelected(doc.currentDimStyle)
                else setError('The style is current or in use.')
              }}
              data-testid="dimstyle-delete"
            >
              Delete
            </button>
          </div>
        </div>
        {newName && (
          <div className="form dimstyle-newform">
            <label>
              <span>New style name</span>
              <input className="field" value={newName.name} onChange={(e) => setNewName({ ...newName, name: e.target.value })} data-testid="dimstyle-new-name" />
            </label>
            <label>
              <span>Start with</span>
              <select className="field" value={newName.from} onChange={(e) => setNewName({ ...newName, from: e.target.value })}>
                {styles.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="theme-presets">
              <button
                className="btn active"
                disabled={!newName.name.trim() || !!doc.dimStyleDef(newName.name.trim())}
                onClick={() => {
                  const from = doc.dimStyleDef(newName.from)
                  setEdit({ kind: 'new', name: newName.name.trim(), vars: resolveDimVars(from?.vars) })
                  setNewName(null)
                }}
                data-testid="dimstyle-new-continue"
              >
                Continue
              </button>
              <button className="btn" onClick={() => setNewName(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {error && <p className="muted">{error}</p>}
      </div>
    </div>
  )
}
