import { NAMED_COLORS, colorLabel } from '../core/document/objectProps'

/**
 * Lista de color de un objeto, como el control de color del CAD clásico: ByLayer, los siete con nombre, el actual si
 * es otro y "Select Color…" (selector del sistema). `value` undefined = varios distintos (*VARIES*).
 */
export function ColorSelect(props: { value: string | undefined; onPick: (v: string) => void; testId: string; className: string; label?: string; title?: string }) {
  const { value } = props
  const special = value === 'BYLAYER' || value === 'BYBLOCK'
  const own = value && !special && !NAMED_COLORS.some(([c]) => c === value.toLowerCase()) ? value.toLowerCase() : null
  const pickOther = () => {
    const input = document.createElement('input')
    input.type = 'color'
    input.value = own ?? '#ffffff'
    input.onchange = () => props.onPick(input.value)
    input.click()
  }
  const select = (
    <select
      className={props.className}
      title={props.title}
      value={value === undefined ? '' : special ? value : value.toLowerCase()}
      onChange={(e) => (e.target.value === '__other' ? pickOther() : props.onPick(e.target.value))}
      data-testid={props.testId}
    >
      {value === undefined && <option value="">*VARIES*</option>}
      <option value="BYLAYER">ByLayer</option>
      {/* ByBlock: el de la inserción (objetos de un bloque traído de un DWG/DXF). */}
      <option value="BYBLOCK">ByBlock</option>
      {NAMED_COLORS.map(([c, name]) => (
        <option key={c} value={c}>
          {name}
        </option>
      ))}
      {own && <option value={own}>{colorLabel(own)}</option>}
      <option value="__other">Select Color…</option>
    </select>
  )
  if (!props.label) return select
  return (
    <label className="prop-row">
      <span className="prop-key">{props.label}</span>
      {select}
    </label>
  )
}
