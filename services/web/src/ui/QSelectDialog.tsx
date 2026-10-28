import { useMemo, useState } from 'react'
import { useStore } from '../store/store'
import { qselectMatch, qselectProps, type QOperator } from '../core/editing/qselect'
import { selectableEntities } from '../core/commands/selectionSets'
import { focusCommandLine } from './focus'

const OPERATORS: Array<[QOperator, string]> = [
  ['=', '= Equals'],
  ['<>', '<> Not Equal'],
  ['>', '> Greater than'],
  ['<', '< Less than'],
  ['*', '* Wildcard Match'],
  ['all', 'Select All'],
]

/**
 * Diálogo *Quick Select* del CAD clásico: a qué se aplica (todo el dibujo o la selección actual), tipo de objeto,
 * propiedad, operador y valor; incluir o excluir lo que cumple y si se suma a la selección actual.
 */
export function QSelectDialog() {
  const open = useStore((s) => s.qselectOpen)
  if (!open) return null
  return <QSelectBody />
}

function QSelectBody() {
  const doc = useStore((s) => s.doc)
  const selection = useStore((s) => s.selection)
  const close = useStore((s) => s.closeQselect)
  const apply = useStore((s) => s.applyQselect)
  const [scope, setScope] = useState<'all' | 'selection'>(selection.length ? 'selection' : 'all')
  const base = useMemo(() => {
    const all = selectableEntities(doc)
    if (scope === 'all') return all
    const ids = new Set(selection)
    return all.filter((e) => ids.has(e.id))
  }, [doc, scope, selection])
  const types = useMemo(() => {
    const n = new Map<string, number>()
    for (const e of base) n.set(e.type, (n.get(e.type) ?? 0) + 1)
    return [...n.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [base])
  const [type, setType] = useState<string | null>(null)
  const props = qselectProps(type)
  const [prop, setProp] = useState('layer')
  const [op, setOp] = useState<QOperator>('=')
  const p = props.find((x) => x.key === prop) ?? props[0]
  const values = useMemo(() => {
    if (p.kind !== 'enum') return []
    return [...new Set(base.filter((e) => !type || e.type === type).map((e) => p.get(e, doc)).filter((v): v is string => typeof v === 'string'))].sort()
  }, [base, type, p, doc])
  const [value, setValue] = useState('')
  const [exclude, setExclude] = useState(false)
  const [append, setAppend] = useState(false)
  const shown = p.kind === 'enum' && !values.includes(value) ? (values[0] ?? '') : value
  const count = qselectMatch(doc, base, { type, prop: p.key, op, value: shown }).length

  const done = (ok: boolean) => {
    if (ok) {
      const hit = new Set(qselectMatch(doc, base, { type, prop: p.key, op, value: shown }).map((e) => e.id))
      const picked = exclude ? base.filter((e) => !hit.has(e.id)).map((e) => e.id) : [...hit]
      apply(picked, append)
    } else close()
    focusCommandLine()
  }

  return (
    <div className="modal-backdrop" onClick={() => done(false)} data-testid="qselect-dialog">
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Quick Select</h2>
          <button className="icon-btn" onClick={() => done(false)} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="form">
          <label>
            Apply to
            <select className="field" value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'selection')} data-testid="qselect-scope">
              <option value="all">Entire drawing</option>
              <option value="selection" disabled={!selection.length}>
                Current selection
              </option>
            </select>
          </label>
          <label>
            Object type
            <select
              className="field"
              value={type ?? ''}
              onChange={(e) => {
                setType(e.target.value || null)
                setProp('layer')
              }}
              data-testid="qselect-type"
            >
              <option value="">Multiple ({base.length})</option>
              {types.map(([t, n]) => (
                <option key={t} value={t}>
                  {t} ({n})
                </option>
              ))}
            </select>
          </label>
          <label>
            Properties
            <select className="field" value={p.key} onChange={(e) => setProp(e.target.value)} data-testid="qselect-prop">
              {props.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Operator
            <select className="field" value={op} onChange={(e) => setOp(e.target.value as QOperator)} data-testid="qselect-op">
              {OPERATORS.filter(([o]) => o !== '*' || p.kind !== 'number').map(([o, label]) => (
                <option key={o} value={o}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {op !== 'all' && (
            <label>
              Value
              {p.kind === 'enum' && op !== '*' ? (
                <select className="field" value={shown} onChange={(e) => setValue(e.target.value)} data-testid="qselect-value">
                  {values.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <input className="field" value={value} onChange={(e) => setValue(e.target.value)} data-testid="qselect-value" />
              )}
            </label>
          )}
          <div className="plot-inline">
            <label className="plot-check">
              <input type="radio" name="qselect-how" checked={!exclude} onChange={() => setExclude(false)} /> Include in new selection set
            </label>
            <label className="plot-check">
              <input type="radio" name="qselect-how" checked={exclude} onChange={() => setExclude(true)} data-testid="qselect-exclude" /> Exclude from new selection set
            </label>
          </div>
          <label className="plot-check">
            <input type="checkbox" checked={append} onChange={(e) => setAppend(e.target.checked)} data-testid="qselect-append" /> Append to current selection set
          </label>
        </div>
        <div className="modal-actions">
          <span className="muted" data-testid="qselect-count" style={{ marginRight: 'auto', alignSelf: 'center', fontSize: 12 }}>
            {exclude ? base.length - count : count} object(s)
          </span>
          <button className="btn" onClick={() => done(false)}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => done(true)} data-testid="qselect-ok">
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
