import { useMemo } from 'react'
import { useStore } from '../store/store'
import type { HatchIsland, HatchProps } from '../core/document/types'
import { hatchPatterns, PATTERN_NAMES, SOLID, USER } from '../core/hatch/patterns'
import { hatchStrokes } from '../core/hatch/geometry'
import { focusCommandLine } from './focus'

/** Muestra de un patrón en un cuadrado de 28 px (escala ajustada para que se vea su dibujo). */
function PatternSwatch({ name, units }: { name: string; units: string }) {
  const lines = useMemo(() => {
    if (name === SOLID) return null
    const def = name === USER ? null : hatchPatterns(units).find((p) => p.name === name)
    // Tamaño típico del motivo: el mayor desplazamiento entre líneas o trazo.
    const size = def ? Math.max(...def.lines.flatMap((l) => [Math.abs(l.delta[1]), Math.abs(l.delta[0]), ...l.dashes.map(Math.abs)])) || 1 : 1
    const scale = 7 / size
    const props: HatchProps = {
      loops: [{ vertices: [[0, 0, 0], [28, 0, 0], [28, 28, 0], [0, 28, 0]] }],
      pattern: name,
      scale,
      angle: 0,
      origin: [0, 0, 0],
      island: 'normal',
      spacing: 5,
      imperial: /^(in|inch|inches|ft|feet)$/i.test(units) || undefined,
    }
    return hatchStrokes(props)
  }, [name, units])
  return (
    <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden>
      {lines === null ? (
        <rect x={0} y={0} width={28} height={28} fill="currentColor" />
      ) : (
        <>
          {lines.segs.map(([a, b], i) => (
            <line key={i} x1={a[0]} y1={28 - a[1]} x2={b[0]} y2={28 - b[1]} stroke="currentColor" strokeWidth={0.8} />
          ))}
          {lines.dots.map((d, i) => (
            <circle key={`d${i}`} cx={d[0]} cy={28 - d[1]} r={0.6} fill="currentColor" />
          ))}
        </>
      )}
    </svg>
  )
}

const ISLANDS: Array<{ v: HatchIsland; label: string }> = [
  { v: 'normal', label: 'Normal' },
  { v: 'outer', label: 'Outer' },
  { v: 'ignore', label: 'Ignore' },
]

/**
 * Panel *Hatch Creation* / *Hatch Editor*, el equivalente de la pestaña contextual de la cinta del
 * CAD clásico: se muestra mientras corren HATCH o HATCHEDIT y lo que se cambia se aplica en vivo.
 */
export function HatchPanel() {
  useStore((s) => s.version)
  const panel = useStore((s) => s.hatchPanel)
  const doc = useStore((s) => s.doc)
  const apply = useStore((s) => s.applyHatchSetting)
  const submit = useStore((s) => s.submitCommand)
  if (!panel) return null
  const first = panel.ids.map((id) => doc.getEntity(id)).find((e) => e?.type === 'HATCH')
  const h = first?.type === 'HATCH' ? first.props : null
  const v = doc.vars
  const pattern = (h?.pattern ?? v.HPNAME).toUpperCase()
  const scale = h ? h.scale : v.HPSCALE
  const angle = h ? Math.round(((h.angle * 180) / Math.PI) * 1e6) / 1e6 : v.HPANG
  const spacing = h ? (h.spacing ?? 1) : v.HPSPACE
  const dbl = h ? !!h.double : v.HPDOUBLE === 1
  const island: HatchIsland = h ? h.island : (['normal', 'outer', 'ignore'] as const)[v.HPISLANDDETECTION]
  const assoc = h ? !!h.assoc : v.HPASSOC === 1
  const num = (s: string) => {
    const n = Number(s.replace(',', '.'))
    return isFinite(n) ? n : null
  }
  const done = () => {
    submit('')
    focusCommandLine()
  }
  return (
    <div className="hatch-panel" data-testid="hatch-panel" onMouseDown={(e) => e.stopPropagation()}>
      <div className="hp-group">
        <span className="hp-title">{panel.mode === 'create' ? 'Hatch Creation — Pattern' : 'Hatch Editor — Pattern'}</span>
        <div className="hp-gallery">
          {PATTERN_NAMES.map((n) => (
            <button
              key={n}
              className={`hp-swatch${pattern === n ? ' selected' : ''}`}
              title={n === USER ? 'User defined' : n}
              onClick={() => apply({ pattern: n })}
              data-testid={`hatch-pattern-${n}`}
            >
              <PatternSwatch name={n} units={doc.units} />
            </button>
          ))}
        </div>
      </div>
      <div className="hp-group">
        <span className="hp-title">Properties</span>
        {pattern === USER ? (
          <>
            <label>
              Spacing{' '}
              <input
                className="field"
                defaultValue={spacing}
                key={`sp${spacing}`}
                onBlur={(e) => {
                  const n = num(e.target.value)
                  if (n && n > 0 && n !== spacing) apply({ spacing: n })
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                data-testid="hatch-spacing"
              />
            </label>
            <label>
              <input type="checkbox" checked={dbl} onChange={(e) => apply({ double: e.target.checked })} /> Double
            </label>
          </>
        ) : (
          pattern !== SOLID && (
            <label>
              Scale{' '}
              <input
                className="field"
                defaultValue={scale}
                key={`sc${scale}`}
                onBlur={(e) => {
                  const n = num(e.target.value)
                  if (n && n > 0 && n !== scale) apply({ scale: n })
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                data-testid="hatch-scale"
              />
            </label>
          )
        )}
        {pattern !== SOLID && (
          <label>
            Angle{' '}
            <input
              className="field"
              defaultValue={angle}
              key={`an${angle}`}
              onBlur={(e) => {
                const n = num(e.target.value)
                if (n !== null && n !== angle) apply({ angleDeg: n })
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              data-testid="hatch-angle"
            />
          </label>
        )}
      </div>
      <div className="hp-group">
        <span className="hp-title">Options</span>
        <label>
          <input type="checkbox" checked={assoc} disabled={panel.mode === 'edit' && !assoc} onChange={(e) => apply({ assoc: e.target.checked })} data-testid="hatch-assoc" />{' '}
          Associative
        </label>
        <label>
          Islands{' '}
          <select className="field" value={island} onChange={(e) => apply({ island: e.target.value as HatchIsland })} data-testid="hatch-island">
            {ISLANDS.map((i) => (
              <option key={i.v} value={i.v}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button className="btn primary" onClick={done} data-testid="hatch-close">
        {panel.mode === 'create' ? 'Close Hatch Creation' : 'Close Hatch Editor'}
      </button>
    </div>
  )
}
