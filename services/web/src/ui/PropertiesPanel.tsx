import { assocState } from '../core/dimension/assoc'
import { useState } from 'react'
import { useStore } from '../store/store'
import type { DimensionEntity, Entity } from '../core/document/types'
import { entityFields, typeLabel, type PropField } from '../core/editing/props'
import { DIM_TABS, DIM_VAR_INFO, type DimTab } from '../core/dimension/style'
import { formatDim } from '../core/dimension/dimGeometry'
import { DimVarInput } from './DimVarInput'
import { BYBLOCK, BYLAYER, linetypeLabel } from '../core/linetype/linetypes'

/**
 * *General* de la paleta: tipo de línea y su escala, con una o varias entidades (`*VARIES*` si
 * difieren), como el CAD clásico.
 */
function CommonProps({ ents }: { ents: Entity[] }) {
  const doc = useStore((s) => s.doc)
  const setCommon = useStore((s) => s.setEntitiesCommon)
  const openLinetypes = useStore((s) => s.openLinetypeDialog)
  const ids = ents.map((e) => e.id)
  const lt = (e: Entity) => (e.lineType ?? BYLAYER).toUpperCase()
  const lts = (e: Entity) => e.ltScale ?? 1
  const ltSame = ents.every((e) => lt(e) === lt(ents[0])) ? lt(ents[0]) : undefined
  const scSame = ents.every((e) => lts(e) === lts(ents[0])) ? lts(ents[0]) : undefined
  return (
    <>
      <label className="prop-row">
        <span className="prop-key">Linetype</span>
        <select
          className="field prop-value"
          value={ltSame ?? ''}
          onChange={(e) => (e.target.value === '__other' ? openLinetypes() : setCommon(ids, 'lineType', e.target.value))}
          data-testid="prop-linetype"
        >
          {ltSame === undefined && <option value="">*VARIES*</option>}
          {[BYLAYER, BYBLOCK, ...doc.linetypes.map((d) => d.name)].map((n) => (
            <option key={n} value={n}>
              {linetypeLabel(n)}
            </option>
          ))}
          <option value="__other">Other…</option>
        </select>
      </label>
      <label className="prop-row">
        <span className="prop-key">Linetype scale</span>
        <input
          className="field prop-value"
          type="number"
          step="0.1"
          defaultValue={scSame ?? ''}
          placeholder="*VARIES*"
          key={`${ids.join(',')}|${scSame}`}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          onBlur={(e) => {
            const v = Number(e.target.value)
            if (e.target.value !== '' && v > 0 && v !== scSame) setCommon(ids, 'ltScale', v)
          }}
          data-testid="prop-ltscale"
        />
      </label>
    </>
  )
}

function NumberField(props: { label: string; value: number; readOnly?: boolean; onCommit: (v: number) => void }) {
  if (props.readOnly) {
    return (
      <div className="prop-row">
        <span className="prop-key">{props.label}</span>
        <span className="prop-value mono muted">{Number(props.value.toFixed(4))}</span>
      </div>
    )
  }
  // Sin ruido de punto flotante (0.832572 y no 0.8325718347040308); Enter sin tocar el valor no lo redondea.
  const shown = Number(props.value.toFixed(6))
  return (
    <label className="prop-row">
      <span className="prop-key">{props.label}</span>
      <input
        className="field prop-value"
        type="number"
        defaultValue={shown}
        key={props.value}
        // Enter fija el valor sin tener que sacar el foco; Esc descarta y vuelve al valor actual.
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            const v = Number(e.currentTarget.value)
            if (isFinite(v) && v !== shown) props.onCommit(v)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation() // Esc cancela la edición del campo, no la selección del dibujo
            e.currentTarget.value = String(shown)
          }
        }}
        onBlur={(e) => {
          const v = Number(e.target.value)
          if (isFinite(v) && v !== shown) props.onCommit(v)
        }}
      />
    </label>
  )
}

function TextField(props: { label: string; value: string; readOnly?: boolean; onCommit: (v: string) => void }) {
  if (props.readOnly) {
    return (
      <div className="prop-row">
        <span className="prop-key">{props.label}</span>
        <span className="prop-value mono muted">{props.value}</span>
      </div>
    )
  }
  return (
    <label className="prop-row">
      <span className="prop-key">{props.label}</span>
      <input
        className="field prop-value"
        type="text"
        defaultValue={props.value}
        key={props.value}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (e.currentTarget.value !== props.value) props.onCommit(e.currentTarget.value)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation() // Esc cancela la edición del campo, no la selección del dibujo
            e.currentTarget.value = props.value
          }
        }}
        onBlur={(e) => {
          if (e.target.value !== props.value) props.onCommit(e.target.value)
        }}
      />
    </label>
  )
}

function EnumField(props: { label: string; value: string; options: string[]; onCommit: (v: string) => void }) {
  return (
    <label className="prop-row">
      <span className="prop-key">{props.label}</span>
      <select className="field prop-value" value={props.value} onChange={(e) => props.onCommit(e.target.value)}>
        {props.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

function BoolField(props: { label: string; value: boolean; onCommit: (v: boolean) => void }) {
  return (
    <label className="prop-row">
      <span className="prop-key">{props.label}</span>
      <input
        className="prop-value"
        type="checkbox"
        checked={props.value}
        onChange={(e) => props.onCommit(e.target.checked)}
      />
    </label>
  )
}

function Field({ f, entityId }: { f: PropField; entityId: string }) {
  const update = useStore((s) => s.updateEntityField)
  switch (f.kind) {
    case 'number':
      return <NumberField label={f.label} value={f.value} readOnly={f.readOnly} onCommit={(v) => update(entityId, f.key, v)} />
    case 'text':
      return <TextField label={f.label} value={f.value} onCommit={(v) => update(entityId, f.key, v)} />
    case 'enum':
      return <EnumField label={f.label} value={f.value} options={f.options} onCommit={(v) => update(entityId, f.key, v)} />
    case 'bool':
      return <BoolField label={f.label} value={f.value} onCommit={(v) => update(entityId, f.key, v)} />
  }
}

function EntityProps({ e }: { e: Entity }) {
  return (
    <>
      {entityFields(e).map((f) => (
        <Field key={f.key} f={f} entityId={e.id} />
      ))}
    </>
  )
}

/**
 * Cotas en la paleta: estilo, texto y las categorías del CAD clásico (*Lines & Arrows, Text, Fit,
 * Primary Units, Alternate Units, Tolerances*). Edita una o varias cotas a la vez; lo que difiere del
 * estilo (override) se marca, y volver al valor del estilo quita el override.
 */
function DimensionPanel({ dims }: { dims: DimensionEntity[] }) {
  const doc = useStore((s) => s.doc)
  const setStyle = useStore((s) => s.setDimensionsStyle)
  const setVar = useStore((s) => s.setDimensionsVar)
  const update = useStore((s) => s.updateEntityField)
  const [open, setOpen] = useState<DimTab | null>('Text')
  const first = dims[0]
  const ids = dims.map((d) => d.id)
  const same = <T,>(f: (d: DimensionEntity) => T): T | undefined => (dims.every((d) => f(d) === f(first)) ? f(first) : undefined)
  const styleName = same((d) => d.props.styleName ?? 'Standard')
  return (
    <>
      <label className="prop-row">
        <span className="prop-key">Dim style</span>
        <select className="field prop-value" value={styleName ?? ''} onChange={(e) => setStyle(ids, e.target.value)} data-testid="prop-dimstyle">
          {styleName === undefined && <option value="">*varies*</option>}
          {doc.dimStyles.map((st) => (
            <option key={st.name} value={st.name}>
              {st.name}
            </option>
          ))}
        </select>
      </label>
      <div className="prop-row">
        <span className="prop-key">Associative</span>
        <span className="prop-value" data-testid="prop-dimassoc">
          {same((d) => assocState(d.props)) ?? '*varies*'}
        </span>
      </div>
      {dims.length === 1 && (
        <>
          <div className="prop-row">
            <span className="prop-key">Measurement</span>
            <span className="prop-value mono">{formatDim({ ...first.props, textOverride: null })}</span>
          </div>
          <label className="prop-row">
            <span className="prop-key">Text override</span>
            <input
              className="field prop-value"
              defaultValue={first.props.textOverride ?? ''}
              key={first.props.textOverride ?? ''}
              placeholder="<>"
              onKeyDown={(e) => e.key === 'Enter' && update(first.id, 'textOverride', e.currentTarget.value)}
              onBlur={(e) => e.target.value !== (first.props.textOverride ?? '') && update(first.id, 'textOverride', e.target.value)}
              data-testid="prop-textoverride"
            />
          </label>
        </>
      )}
      {DIM_TABS.map((tab) => (
        <div key={tab}>
          <div className="dim-category" onClick={() => setOpen(open === tab ? null : tab)} data-testid={`prop-dimcat-${tab}`}>
            {open === tab ? '▾' : '▸'} {tab === 'Lines' || tab === 'Symbols and Arrows' ? (tab === 'Lines' ? 'Lines' : 'Arrows & symbols') : tab}
          </div>
          {open === tab &&
            DIM_VAR_INFO.filter((v) => v.tab === tab).map((info) => {
              const value = same((d) => d.props.style[info.name])
              const overridden = dims.some((d) => d.props.overrides && info.name in d.props.overrides)
              return (
                <DimVarInput
                  key={info.name}
                  info={info}
                  value={value ?? first.props.style[info.name]}
                  overridden={overridden}
                  lazy
                  onChange={(v) => setVar(ids, info.name, v)}
                />
              )
            })}
        </div>
      ))}
    </>
  )
}

export function PropertiesPanel() {
  useStore((s) => s.version)
  const selection = useStore((s) => s.selection)
  const doc = useStore((s) => s.doc)
  const layerSvc = useStore((s) => s.layerSvc)
  const updateEntityLayer = useStore((s) => s.updateEntityLayer)

  return (
    <div className="panel">
      {selection.length === 0 && <p className="muted">No selection.</p>}
      {selection.length > 1 && <p className="muted">{selection.length} objects selected.</p>}
      {selection.length > 1 &&
        (() => {
          const ents = selection.map((id) => doc.getEntity(id)).filter((e): e is Entity => !!e)
          return (
            <div className="props" data-testid="properties">
              <CommonProps ents={ents} />
              {ents.every((e) => e.type === 'DIMENSION') && <DimensionPanel dims={ents as DimensionEntity[]} />}
            </div>
          )
        })()}
      {selection.length === 1 &&
        (() => {
          const e = doc.getEntity(selection[0])
          if (!e) return <p className="muted">—</p>
          return (
            <div className="props" data-testid="properties">
              <div className="prop-row">
                <span className="prop-key">Type</span>
                <span className="prop-value mono">{typeLabel(e)}</span>
              </div>
              <label className="prop-row">
                <span className="prop-key">Layer</span>
                <select
                  className="field prop-value"
                  value={e.layer}
                  onChange={(ev) => updateEntityLayer(e.id, ev.target.value)}
                >
                  {layerSvc.list().map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <CommonProps ents={[e]} />
              {e.type === 'DIMENSION' ? <DimensionPanel dims={[e]} /> : <EntityProps e={e} />}
            </div>
          )
        })()}
    </div>
  )
}
