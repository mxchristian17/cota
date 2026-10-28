import { useEffect, useState } from 'react'
import { useStore } from '../store/store'
import { sysvars } from '../core/commands/sysvars'
import { OSNAP_KINDS, OSNAP_LABELS } from '../core/snap/osnap'
import { focusCommandLine } from './focus'
import { isWorldUcs, WORLD_UCS, worldToUcs } from '../core/ucs'
import { STANDARD_SCALES, formatScale, standardScale } from '../core/layout/scale'
import { LayoutTabs } from './LayoutTabs'

/**
 * Controles del layout: botón MODEL/PAPER y, para el viewport de MSPACE (o el único VIEWPORT
 * seleccionado en el papel), su escala y el candado *display locked*.
 */
function LayoutControls() {
  useStore((s) => s.version)
  const doc = useStore((s) => s.doc)
  const selection = useStore((s) => s.selection)
  const toggleModelPaper = useStore((s) => s.toggleModelPaper)
  const updateEntityField = useStore((s) => s.updateEntityField)
  if (!doc.activeLayout) return null
  const ms = doc.msViewportId
  const picked = ms ?? (selection.length === 1 ? selection[0] : null)
  const e = picked ? doc.getEntity(picked) : undefined
  const vp = e?.type === 'VIEWPORT' ? e : undefined
  const std = vp ? standardScale(vp.props.scale) : undefined
  const run = (fn: () => void) => () => {
    fn()
    focusCommandLine()
  }
  return (
    <span className="status-toggles layout-controls">
      <button
        className={'status-toggle' + (ms ? ' on' : '')}
        title="Model or paper space (MSPACE / PSPACE)"
        data-testid="space-toggle"
        onClick={run(toggleModelPaper)}
      >
        {ms ? 'MODEL' : 'PAPER'}
      </button>
      {vp && (
        <>
          <select
            className="field vp-scale"
            title="Viewport scale"
            data-testid="vp-scale"
            value={std?.label ?? 'custom'}
            onChange={(ev) => {
              updateEntityField(vp.id, 'standardScale', ev.target.value)
              focusCommandLine()
            }}
          >
            {!std && <option value="custom">{formatScale(vp.props.scale)}</option>}
            {STANDARD_SCALES.map((s) => (
              <option key={s.label} value={s.label}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            className={'status-toggle' + (vp.props.locked ? ' on' : '')}
            title="Viewport display locked: zoom and pan move the sheet, not the view"
            data-testid="vp-lock"
            aria-pressed={vp.props.locked}
            onClick={run(() => updateEntityField(vp.id, 'locked', !vp.props.locked))}
          >
            LOCK
          </button>
        </>
      )}
    </span>
  )
}

/**
 * Botón OSNAP (F3) con su lista de modos: la flecha ▾ o el clic derecho abren un menú con
 * una casilla por modo, "Select all", "Clear all" y "Object Snap Settings…". El menú queda abierto
 * mientras se tildan modos; se cierra con Escape o clic afuera.
 */
function OsnapControl() {
  const esnap = useStore((s) => s.esnap)
  const osnap = useStore((s) => s.osnap)
  const toggleEsnap = useStore((s) => s.toggleEsnap)
  const setOsnap = useStore((s) => s.setOsnap)
  const setAllOsnap = useStore((s) => s.setAllOsnap)
  const openOsnap = useStore((s) => s.openOsnap)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    setMenu({ x: r.left, y: r.top })
  }
  const done = (fn: () => void) => () => {
    setMenu(null)
    fn()
    focusCommandLine()
  }
  return (
    <span className="osnap-control">
      <button
        className={'status-toggle' + (esnap ? ' on' : '')}
        title="Object snap (F3) — right-click for the snap modes"
        data-testid="esnap-toggle"
        aria-pressed={esnap}
        onClick={() => {
          toggleEsnap()
          focusCommandLine()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          show(e.currentTarget)
        }}
      >
        OSNAP
      </button>
      <button
        className="status-toggle osnap-arrow"
        title="Object snap modes"
        aria-label="Object snap modes"
        data-testid="osnap-menu-toggle"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => (menu ? setMenu(null) : show(e.currentTarget.previousElementSibling as HTMLElement))}
      >
        ▾
      </button>
      {menu && (
        <div
          className="context-menu osnap-menu"
          style={{ left: menu.x, bottom: window.innerHeight - menu.y + 2 }}
          data-testid="osnap-menu"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {OSNAP_KINDS.map((k) => (
            <button
              key={k}
              role="menuitemcheckbox"
              aria-checked={osnap[k]}
              data-testid={`osnap-menu-${k}`}
              onClick={() => setOsnap(k, !osnap[k])}
            >
              <span className="check">{osnap[k] ? '✓' : ''}</span>
              {OSNAP_LABELS[k]}
            </button>
          ))}
          <hr />
          <button onClick={() => setAllOsnap(true)} data-testid="osnap-menu-all">
            <span className="check" />
            Select all
          </button>
          <button onClick={() => setAllOsnap(false)} data-testid="osnap-menu-none">
            <span className="check" />
            Clear all
          </button>
          <hr />
          <button onClick={done(openOsnap)} data-testid="osnap-menu-settings">
            <span className="check" />
            Object Snap Settings…
          </button>
        </div>
      )}
    </span>
  )
}

export function StatusBar() {
  const cursor = useStore((s) => s.cursor)
  const currentLayerId = useStore((s) => s.currentLayerId)
  const layerSvc = useStore((s) => s.layerSvc)
  const ortho = useStore((s) => s.ortho)
  const gridSnap = useStore((s) => s.gridSnap)
  const otrack = useStore((s) => s.otrack)
  const ucs = useStore((s) => s.ucs)
  const toggleOrtho = useStore((s) => s.toggleOrtho)
  const toggleSnap = useStore((s) => s.toggleSnap)
  const gridOn = useStore((s) => s.gridOn)
  const setGrid = useStore((s) => s.setGrid)
  const toggleOtrack = useStore((s) => s.toggleOtrack)
  const dynInput = useStore((s) => s.dynInput)
  const polar = useStore((s) => s.polar)
  const togglePolar = useStore((s) => s.togglePolar)
  const toggleDynInput = useStore((s) => s.toggleDynInput)
  const setUcs = useStore((s) => s.setUcs)
  const setCurrentLayer = useStore((s) => s.setCurrentLayer)
  const openLayers = useStore((s) => s.openLayers)
  useStore((s) => s.version) // refresca la lista de capas al crear/renombrar
  const engine = useStore((s) => s.engine)
  useStore((s) => s.prompt) // re-render al entrar/salir de un prompt (cambia el modo relativo)
  const layer = layerSvc.get(currentLayerId)

  const isWorld = isWorldUcs(ucs)
  const local = worldToUcs(cursor, ucs)
  // Al continuar desde un punto (hay base) se muestra el Δ y la distancia desde él.
  const base = engine.snapBase()
  const rel = base ? worldToUcs(base, ucs) : null

  const withFocus = (fn: () => void) => () => {
    fn()
    focusCommandLine()
  }

  return (
    <div className="statusbar" data-testid="statusbar">
      <LayoutTabs />
      {rel ? (
        <span className="mono" data-testid="coords" title="Relative to base point">
          @ {(local.x - rel.x).toFixed(2)} , {(local.y - rel.y).toFixed(2)}
          {Math.abs(local.z - rel.z) > 1e-6 ? ` , ${(local.z - rel.z).toFixed(2)}` : ''} &nbsp; ‹
          {Math.hypot(local.x - rel.x, local.y - rel.y, local.z - rel.z).toFixed(2)}›
        </span>
      ) : (
        <span className="mono" data-testid="coords">
          X {local.x.toFixed(2)} &nbsp; Y {local.y.toFixed(2)} &nbsp; Z {local.z.toFixed(2)}
        </span>
      )}
      <span className="layer-indicator">
        <span className="swatch" style={{ background: layer?.color ?? '#fff' }} />
        {/* Combo de capa actual (equivale al control de capas de la cinta del CAD clásico): con objetos
            seleccionados, elegir una capa los mueve a ella. */}
        <select
          className="field layer-select"
          value={currentLayerId}
          title="Current layer (with objects selected, moves them to that layer)"
          data-testid="layer-select"
          onChange={(e) => {
            setCurrentLayer(e.target.value)
            focusCommandLine()
          }}
        >
          {layerSvc.list().map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button
          className="status-toggle"
          title="Layer Properties Manager (LAYER / LA)"
          data-testid="open-layers"
          onClick={withFocus(openLayers)}
        >
          ⛭
        </button>
      </span>
      <span className="status-toggles">
        <button
          className={'status-toggle' + (gridOn ? ' on' : '')}
          title="Grid display (F7)"
          data-testid="grid-toggle"
          aria-pressed={gridOn}
          onClick={withFocus(() => setGrid())}
        >
          GRID
        </button>
        <button
          className={'status-toggle' + (gridSnap ? ' on' : '')}
          title="Grid snap (F9)"
          data-testid="snap-toggle"
          aria-pressed={gridSnap}
          onClick={withFocus(toggleSnap)}
        >
          SNAP
        </button>
        <button
          className={'status-toggle' + (ortho ? ' on' : '')}
          title="Orthogonal mode (F8)"
          data-testid="ortho-toggle"
          aria-pressed={ortho}
          onClick={withFocus(toggleOrtho)}
        >
          ORTHO
        </button>
        <button
          className={'status-toggle' + (polar ? ' on' : '')}
          title={`Polar tracking (F10): angles every ${sysvars.POLARANG}° from the base point (POLARANG)`}
          data-testid="polar-toggle"
          aria-pressed={polar}
          onClick={withFocus(togglePolar)}
        >
          POLAR
        </button>
        <OsnapControl />
        <button
          className={'status-toggle' + (otrack ? ' on' : '')}
          title="Object snap tracking (F11): pause over a point to acquire it"
          data-testid="otrack-toggle"
          aria-pressed={otrack}
          onClick={withFocus(toggleOtrack)}
        >
          OTRACK
        </button>
        <button
          className={'status-toggle' + (dynInput ? ' on' : '')}
          title={dynInput ? 'Dynamic input (F12): x,y after the first point is relative; # = absolute' : 'Dynamic input (F12) off: x,y is absolute; @ = relative'}
          data-testid="dyn-toggle"
          aria-pressed={dynInput}
          onClick={withFocus(toggleDynInput)}
        >
          DYN
        </button>
        <button
          className={'status-toggle' + (isWorld ? '' : ' on')}
          title={isWorld ? 'World UCS (use UCS command)' : 'Click to reset to World UCS'}
          data-testid="ucs-toggle"
          onClick={withFocus(() => setUcs({ ...WORLD_UCS }))}
        >
          UCS
        </button>
      </span>
      <LayoutControls />
      <AnnoScaleControl />
      <FullscreenButton />
      <CleanScreenButton />
    </div>
  )
}

/** Escala de anotación del modelo (`CANNOSCALE`): tamaño de las cotas anotativas en el Model. */
function AnnoScaleControl() {
  useStore((s) => s.version)
  const doc = useStore((s) => s.doc)
  const setCannoscale = useStore((s) => s.setCannoscale)
  if (doc.activeLayout) return null
  const std = standardScale(doc.cannoscale)
  return (
    <span className="status-toggles">
      <select
        className="field vp-scale"
        title="Annotation scale (CANNOSCALE): size of annotative dimensions in model space"
        data-testid="anno-scale"
        value={std?.label ?? 'custom'}
        onChange={(ev) => {
          const s = STANDARD_SCALES.find((x) => x.label === ev.target.value)
          if (s) setCannoscale(s.value)
          focusCommandLine()
        }}
      >
        {!std && <option value="custom">{formatScale(doc.cannoscale)}</option>}
        {STANDARD_SCALES.map((s) => (
          <option key={s.label} value={s.label}>
            {s.label}
          </option>
        ))}
      </select>
    </span>
  )
}

/** Pantalla completa total (FULLSCREEN). */
function FullscreenButton() {
  const on = useStore((s) => s.fullscreen)
  const setFullscreen = useStore((s) => s.setFullscreen)
  return (
    <button
      className={`status-toggle screen-btn${on ? ' on' : ''}`}
      title={on ? 'Exit full screen (FULLSCREEN; or hold Esc)' : 'Full screen: no browser or system bars (FULLSCREEN)'}
      data-testid="fullscreen-toggle"
      aria-pressed={on}
      onClick={() => {
        setFullscreen()
        focusCommandLine()
      }}
    >
      ⤢
    </button>
  )
}

/** Botón *Clean Screen* del extremo derecho de la barra de estado del CAD clásico (Ctrl+0). */
function CleanScreenButton() {
  const on = useStore((s) => s.cleanScreen)
  const setScreen = useStore((s) => s.setScreen)
  return (
    <button
      className={`status-toggle${on ? ' on' : ''}`}
      title={on ? 'Restore toolbars and palettes (Ctrl+0)' : 'Clean screen: hide toolbars and palettes (Ctrl+0)'}
      data-testid="clean-screen"
      onClick={() => {
        setScreen({ cleanScreen: !on })
        focusCommandLine()
      }}
    >
      ⛶
    </button>
  )
}
