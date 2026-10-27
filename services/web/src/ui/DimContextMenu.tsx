import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '../store/store'
import type { DimensionEntity, DimensionProps } from '../core/document/types'
import { entityGrips } from '../core/editing/grips'
import { flipArrowNear } from '../core/dimension/dimGeometry'
import { focusCommandLine } from './focus'
import { openGeneralMenu } from './ContextMenu'
import type { Pt } from '../core/math'

const CHAINABLE = new Set(['LINEAR', 'ALIGNED', 'ANGULAR', 'ORDINATE'])
const PRECISIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8]
const isAngular = (p: DimensionProps) => p.dimType === 'ANGULAR'

/** Ítem con submenú desplegable al pasar el mouse (como los menús contextuales del CAD clásico). */
export function Sub({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="context-sub" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button data-testid={testId} onClick={() => setOpen(!open)}>
        <span className="check" />
        {label}
        <span className="sub-arrow">▸</span>
      </button>
      {open && <div className="context-menu context-submenu">{children}</div>}
    </div>
  )
}

/** Clic derecho sin arrastre en un viewport: con cotas seleccionadas y sin comando en curso, su menú. */
export function openContextMenu(x: number, y: number, world: Pt): void {
  const s = useStore.getState()
  // Fuera de las cotas seleccionadas (o con un comando en curso), el menú general.
  if (s.engine.hasPending || s.engine.busy || !s.selection.some((id) => s.doc.getEntity(id)?.type === 'DIMENSION')) {
    openGeneralMenu(x, y)
    return
  }
  s.openDimMenu(x, y, [world.x, world.y, world.z])
}

/**
 * Menú contextual de cotas: clic derecho con cotas seleccionadas. *Dim Text position*,
 * *Precision*, *Dim Style*, *Flip Arrow*, *Remove Style Overrides* y *Continue/Baseline Dimension*.
 */
export function DimContextMenu() {
  const menu = useStore((s) => s.dimMenu)
  const close = useStore((s) => s.closeDimMenu)
  useEffect(() => {
    if (!menu) return
    const onDown = () => close()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, close])
  return menu ? <DimMenuBody x={menu.x} y={menu.y} world={menu.world} /> : null
}

function DimMenuBody({ x, y, world }: { x: number; y: number; world: [number, number, number] }) {
  const s = useStore.getState()
  const doc = s.doc
  const dims = s.selection.map((id) => doc.getEntity(id)).filter((e): e is DimensionEntity => e?.type === 'DIMENSION')
  const ids = dims.map((d) => d.id)
  const one = dims.length === 1 ? dims[0] : null
  const act = (fn: () => void) => () => {
    s.closeDimMenu()
    fn()
    focusCommandLine()
  }
  const edit = (fn: (p: DimensionProps) => void) => act(() => s.editDimensions(ids, fn))
  const textMode = (tmove: 0 | 1 | 2) =>
    act(() => {
      s.setDimensionsVar(ids, 'DIMTMOVE', tmove)
      const grip = one && entityGrips(doc.getEntity(one.id)!).find((g) => g.role.t === 'dim-text')
      if (one && grip) s.beginGripEdit(one.id, grip)
    })
  const precOf = (p: DimensionProps) => (isAngular(p) ? p.style.DIMADEC : p.style.DIMDEC)
  const prec = dims.every((d) => precOf(d.props) === precOf(dims[0].props)) ? precOf(dims[0].props) : null
  const styleName = dims.every((d) => d.props.styleName === dims[0].props.styleName) ? dims[0].props.styleName : null
  const hasOverrides = dims.some((d) => d.props.overrides && Object.keys(d.props.overrides).length > 0)
  const left = Math.min(x, window.innerWidth - 200)
  const top = Math.min(y, window.innerHeight - 260)

  return (
    <div className="context-menu dim-menu" style={{ left, top }} data-testid="dim-menu" onPointerDown={(e) => e.stopPropagation()}>
      <Sub label="Dim Text position" testId="dim-menu-textpos">
        <button
          data-testid="dim-menu-above"
          onClick={edit((p) => {
            delete p.textAt
            doc.setDimensionVar(p, 'DIMTAD', 1)
          })}
        >
          Above dim line
        </button>
        <button
          data-testid="dim-menu-centered"
          onClick={edit((p) => {
            delete p.textAt
            doc.setDimensionVar(p, 'DIMTAD', 0)
          })}
        >
          Centered
        </button>
        <button
          data-testid="dim-menu-home"
          onClick={edit((p) => {
            delete p.textAt
            delete p.textAngle
          })}
        >
          Home text
        </button>
        <hr />
        <button disabled={!one} data-testid="dim-menu-move-alone" onClick={textMode(2)}>
          Move text alone
        </button>
        <button disabled={!one} data-testid="dim-menu-move-leader" onClick={textMode(1)}>
          Move with leader
        </button>
        <button disabled={!one} data-testid="dim-menu-move-dimline" onClick={textMode(0)}>
          Move with dim line
        </button>
      </Sub>
      <Sub label="Precision" testId="dim-menu-precision">
        {PRECISIONS.map((d) => (
          <button
            key={d}
            role="menuitemcheckbox"
            aria-checked={prec === d}
            data-testid={`dim-menu-prec-${d}`}
            onClick={edit((p) => doc.setDimensionVar(p, isAngular(p) ? 'DIMADEC' : 'DIMDEC', d))}
          >
            <span className="check">{prec === d ? '✓' : ''}</span>
            {d === 0 ? '0' : '0.' + '0'.repeat(d)}
          </button>
        ))}
      </Sub>
      <Sub label="Dim Style" testId="dim-menu-style">
        {doc.dimStyles.map((st) => (
          <button
            key={st.name}
            role="menuitemcheckbox"
            aria-checked={styleName === st.name}
            data-testid={`dim-menu-style-${st.name}`}
            onClick={act(() => s.setDimensionsStyle(ids, st.name))}
          >
            <span className="check">{styleName === st.name ? '✓' : ''}</span>
            {st.name}
          </button>
        ))}
        <hr />
        <button onClick={act(() => s.openDimStyle())}>
          <span className="check" />
          Other…
        </button>
      </Sub>
      <button data-testid="dim-menu-flip" onClick={edit((p) => flipArrowNear(p, world))}>
        <span className="check" />
        Flip Arrow
      </button>
      <button
        disabled={!hasOverrides}
        data-testid="dim-menu-remove-overrides"
        onClick={edit((p) => doc.restyleDimension(p, undefined, undefined))}
      >
        <span className="check" />
        Remove Style Overrides
      </button>
      {one && CHAINABLE.has(one.props.dimType) && (
        <>
          <hr />
          <button data-testid="dim-menu-continue" onClick={act(() => s.chainFromDimension(one.id, false))}>
            <span className="check" />
            Continue Dimension
          </button>
          <button data-testid="dim-menu-baseline" onClick={act(() => s.chainFromDimension(one.id, true))}>
            <span className="check" />
            Baseline Dimension
          </button>
        </>
      )}
      <hr />
      <button onClick={act(() => s.openProperties())}>
        <span className="check" />
        Properties
      </button>
    </div>
  )
}
