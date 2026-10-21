import { ARROW_LABELS, ARROW_TYPES, type DimVarInfo, type DimVars } from '../core/dimension/style'

/**
 * Control de una variable de cota según su tipo: número, entero, sí/no, lista, flecha, color
 * o grosor (con ByLayer). Lo usan el administrador DIMSTYLE y la paleta de Propiedades.
 */
export function DimVarInput({
  info,
  value,
  onChange,
  overridden,
  lazy,
}: {
  info: DimVarInfo
  value: DimVars[keyof DimVars]
  onChange: (v: unknown) => void
  overridden?: boolean
  /** Números y textos se aplican con Enter o al salir del campo (paleta: un paso de undo por cambio). */
  lazy?: boolean
}) {
  const id = `dimvar-${info.name}`
  const label = (
    <span className={'prop-key' + (overridden ? ' dim-overridden' : '')} title={info.name}>
      {info.label}
    </span>
  )
  let control: JSX.Element
  switch (info.kind) {
    case 'bool':
      control = <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} data-testid={id} />
      break
    case 'enum':
      control = (
        <select className="field prop-value" value={String(value)} onChange={(e) => onChange(Number(e.target.value))} data-testid={id}>
          {info.options!.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      )
      break
    case 'arrow':
      control = (
        <select className="field prop-value" value={String(value)} onChange={(e) => onChange(e.target.value)} data-testid={id}>
          {ARROW_TYPES.map((a) => (
            <option key={a} value={a}>
              {ARROW_LABELS[a]}
            </option>
          ))}
        </select>
      )
      break
    case 'color':
      control = (
        <span className="prop-value dimvar-color">
          <label className="muted">
            <input type="checkbox" checked={value === null} onChange={(e) => onChange(e.target.checked ? null : '#ffffff')} /> ByLayer
          </label>
          {value !== null && <input type="color" value={String(value)} onChange={(e) => onChange(e.target.value)} data-testid={id} />}
        </span>
      )
      break
    case 'lineweight':
      control = (
        <span className="prop-value dimvar-color">
          <label className="muted">
            <input type="checkbox" checked={value === null} onChange={(e) => onChange(e.target.checked ? null : 0.25)} /> ByLayer
          </label>
          {value !== null && (
            <input className="field" type="number" min={0} step={0.05} value={Number(value)} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} data-testid={id} />
          )}
        </span>
      )
      break
    case 'string':
      control = lazy ? (
        <LazyInput type="text" value={String(value)} id={id} parse={(t) => t} onCommit={onChange} />
      ) : (
        <input className="field prop-value" type="text" value={String(value)} onChange={(e) => onChange(e.target.value)} data-testid={id} />
      )
      break
    default:
      if (lazy) {
        control = (
          <LazyInput
            type="number"
            value={String(value)}
            id={id}
            parse={(t) => {
              const n = Number(t)
              if (!Number.isFinite(n) || (info.min !== undefined && n < info.min)) return undefined
              return info.kind === 'int' ? Math.round(n) : n
            }}
            onCommit={onChange}
          />
        )
        break
      }
      control = (
        <input
          className="field prop-value"
          type="number"
          step={info.kind === 'int' ? 1 : 0.125}
          min={info.min}
          value={Number(value)}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (!Number.isFinite(n) || (info.min !== undefined && n < info.min)) return
            onChange(info.kind === 'int' ? Math.round(n) : n)
          }}
          data-testid={id}
        />
      )
  }
  return (
    <label className="prop-row">
      {label}
      {control}
    </label>
  )
}

/** Campo que aplica su valor con Enter o al perder el foco (Esc descarta). */
function LazyInput({ type, value, id, parse, onCommit }: { type: string; value: string; id: string; parse: (t: string) => unknown; onCommit: (v: unknown) => void }) {
  const commit = (t: string) => {
    if (t === value) return
    const v = parse(t)
    if (v !== undefined) onCommit(v)
  }
  return (
    <input
      className="field prop-value"
      type={type}
      defaultValue={value}
      key={value}
      data-testid={id}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit(e.currentTarget.value)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          e.currentTarget.value = value
        }
      }}
      onBlur={(e) => commit(e.target.value)}
    />
  )
}
