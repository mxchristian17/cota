import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../store/store'
import { ViewportView } from '../ViewportView'
import { OpenDialog } from '../OpenDialog'
import { LoginDialog } from '../LoginDialog'
import { BRAND_HTML } from '../brand'
import { enterFullscreen } from '../appWindow'
import { MODEL_TAB } from '../../core/document/DocumentModel'
import { CLOUD_ENABLED } from '../../core/io/backend'
import { setViewLayerOff, viewLayersOff } from '../../core/editing/isolation'
import { touchConfig } from '../../render/touchGesture'
import { ABOUT } from '../../core/about'
import type { ViewName, VisualStyle } from '../../core/view'
import type { Entity } from '../../core/document/types'

/**
 * Vista mobile para obra (PRD076): abrir dibujos, orbitar con los dedos, medir con DIST, estilos visuales, vistas,
 * layouts y capas sólo en pantalla. No es el editor: no hay línea de comandos y el dibujo no se modifica.
 */
type Sheet = null | 'views' | 'style' | 'layers' | 'menu'

const STYLES: [VisualStyle, string][] = [
  ['2dwireframe', '2D wireframe'],
  ['3dwireframe', 'Wireframe'],
  ['hidden', 'Hidden'],
  ['shaded', 'Shaded'],
  ['shadedEdges', 'Shaded + edges'],
]

const VIEWS: [ViewName, string][] = [
  ['TOP', 'Top'],
  ['FRONT', 'Front'],
  ['RIGHT', 'Right'],
  ['BOTTOM', 'Bottom'],
  ['BACK', 'Back'],
  ['LEFT', 'Left'],
  ['SWISO', 'Iso SW'],
  ['ISO', 'Iso SE'],
  ['NEISO', 'Iso NE'],
  ['NWISO', 'Iso NW'],
]

const st = useStore.getState

/** Íconos de la barra (trazo, del color del texto): se ven igual en cualquier teléfono, a diferencia de los emoji. */
const ICONS: Record<string, string> = {
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  views: 'M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5l8 4.5 8-4.5M12 12v9',
  style: 'M12 3a9 9 0 1 0 0 18Zm0 0a9 9 0 0 1 0 18',
  layers: 'M12 4 21 9l-9 5-9-5 9-5ZM3 14l9 5 9-5',
  measure: 'M3 16 16 3l5 5L8 21l-5-5ZM7 12l2 2M10 9l2 2M13 6l2 2',
  orbit: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4',
  pan: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
}

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg className="m-ico" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
      {name === 'style' && <path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor" stroke="none" />}
    </svg>
  )
}

/**
 * ¿Dibujo 3D? Sólidos o mallas, o una profundidad (Z) de más del 5 % de su extensión en planta. Mira los puntos de
 * líneas, polilíneas, círculos y puntos (el resto no cambia la respuesta en la práctica).
 */
function is3DDrawing(entities: readonly Entity[]): boolean {
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  const add = (p: readonly number[]) => {
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], p[i] ?? 0)
      hi[i] = Math.max(hi[i], p[i] ?? 0)
    }
  }
  for (const e of entities) {
    if (e.type === 'SOLID3D' || e.type === 'MESH3D') return true
    if (e.type === 'LINE') {
      add(e.props.start)
      add(e.props.end)
    } else if (e.type === 'POLYLINE') e.props.vertices.forEach(add)
    else if (e.type === 'CIRCLE') add(e.props.center)
    else if (e.type === 'POINT') add(e.props.position)
  }
  const plan = Math.max(hi[0] - lo[0], hi[1] - lo[1])
  return isFinite(plan) && plan > 0 && hi[2] - lo[2] > plan * 0.05
}

/** Número legible: hasta 3 decimales, sin ceros de más. */
const num = (n: number): string => String(Math.round(n * 1000) / 1000)

export function MobileApp() {
  useStore((s) => s.version) // nombre, layouts y capas viven en el documento
  const doc = useStore((s) => s.doc)
  const docName = useStore((s) => s.docName)
  const prompt = useStore((s) => s.prompt)
  const busy = useStore((s) => s.engine.busy)
  const measure = useStore((s) => s.lastMeasure)
  const style = useStore((s) => s.visualStyle)
  const token = useStore((s) => s.token)
  const output = useStore((s) => s.output)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [measuring, setMeasuring] = useState(false)
  const [, redraw] = useState(0)
  const inModel = doc.activeTab === MODEL_TAB

  // Un dedo orbita si el dibujo es 3D (sólidos, mallas o profundidad real: las aristas de un DWG 3D son líneas); en un
  // dibujo 2D, desplaza. Se puede cambiar a mano.
  const has3D = useMemo(() => is3DDrawing(doc.modelEntities), [doc.revision, docName])
  const [orbitPick, setOrbitPick] = useState<boolean | null>(null)
  useEffect(() => setOrbitPick(null), [docName])
  const orbit = inModel && (orbitPick ?? has3D)
  touchConfig.oneFinger = orbit ? 'orbit' : 'pan'

  useEffect(() => {
    touchConfig.mode = 'mobile'
    // Lo que hubiera en curso en el editor no sigue acá (no hay línea de comandos para terminarlo).
    if (st().engine.busy) st().cancel()
    return () => {
      touchConfig.mode = 'editor'
    }
  }, [])
  // Sin línea de comandos, lo que dice la apertura ("Reading DWG…", "Opened…", lo que no se pudo importar, un error) se
  // muestra en un aviso. Mientras lee, cuenta los segundos: un plano grande tarda en un teléfono.
  const [toast, setToast] = useState<string | null>(null)
  const [since, setSince] = useState(0)
  const [, tick] = useState(0)
  // Momento en que se tocó Abrir (0 = no se está abriendo); cancelar el selector no avisa, así que caduca solo.
  const opening = useRef(0)
  const said = useRef<string[]>([])
  const lastOut = useRef(output)
  useEffect(() => {
    const prev = lastOut.current
    if (output === prev) return
    lastOut.current = output
    // Varios mensajes seguidos llegan en un solo render: se toman todos los nuevos (al tope del historial, el último).
    const fresh = output.length > prev.length ? output.slice(prev.length) : output.slice(-1)
    const line = fresh[fresh.length - 1]
    if (!line || Date.now() - opening.current > 600_000) return
    const done = /^Opened |could not|cannot|not available|failed/i.test(line)
    for (const l of fresh) {
      if (/^Reading /.test(l)) setSince(Date.now())
      else said.current.push(l)
    }
    if (!done) {
      setToast(line)
      return
    }
    opening.current = 0
    setSince(0)
    // Al terminar: el resultado y, antes, lo que se avisó en el medio (p. ej. entidades que no se importan).
    setToast([line, ...said.current.filter((l) => l !== line)].slice(0, 3).join('\n'))
    said.current = []
    const t = setTimeout(() => setToast(null), /^Opened /.test(line) ? 6000 : 9000)
    return () => clearTimeout(t)
  }, [output])
  useEffect(() => {
    if (!since) return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [since])
  // La medición es del espacio y del dibujo en que se hizo.
  useEffect(() => {
    if (st().lastMeasure) st().setMeasure(null)
  }, [doc.activeTab, docName])
  // DIST terminó (o se canceló): se deja de medir.
  useEffect(() => {
    if (measuring && !busy) setMeasuring(false)
  }, [busy, measuring])

  const startMeasure = () => {
    opening.current = 0
    const s = st()
    if (s.engine.busy) s.cancel()
    if (!s.esnap) s.toggleEsnap() // apuntar a extremos, medios y centros
    st().setMeasure(null)
    setSheet(null)
    setMeasuring(true)
    s.submitCommand('DIST')
  }
  const stopMeasure = () => {
    st().cancel()
    setMeasuring(false)
  }
  const open = () => {
    setSheet(null)
    opening.current = Date.now()
    said.current = []
    if (CLOUD_ENABLED && token) void st().openDocumentsDialog()
    else st().openFromDevice()
  }
  const second = /second/i.test(prompt)
  const viewButton = (v: ViewName, label: string) => (
    <button
      key={v}
      className="m-opt"
      onClick={() => {
        st().activeViewport?.setView(v)
        setSheet(null)
      }}
      data-testid={`m-view-${v}`}
    >
      {label}
    </button>
  )

  return (
    <div className="mobile-app" data-testid="mobile-app">
      <header className="m-top">
        <span className="brand" aria-label="Cota" dangerouslySetInnerHTML={{ __html: BRAND_HTML }} />
        <span className="m-name" data-testid="m-name">
          {docName}
        </span>
        <select className="field m-space" value={doc.activeTab} onChange={(e) => st().setActiveTab(e.target.value)} aria-label="Model or layout" data-testid="m-space">
          <option value={MODEL_TAB}>Model</option>
          {doc.layouts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button className="m-icon" onClick={() => setSheet(sheet === 'menu' ? null : 'menu')} aria-label="Menu" data-testid="m-menu">
          ⋮
        </button>
      </header>

      <section className="m-canvas">
        <ViewportView single />
        {measuring && (
          <div className="m-pill" data-testid="m-measure-hint">
            <span>{second ? 'Point 2 of 2' : 'Point 1 of 2'} · drag the ring, lift to set</span>
            <button className="btn" onClick={stopMeasure} data-testid="m-measure-cancel">
              Cancel
            </button>
          </div>
        )}
        {!measuring && measure && (
          <div className="m-card" data-testid="m-measure">
            <div className="m-res-head">
              <span className="m-dist" data-testid="m-dist">
                {num(measure.dist)}
              </span>
              <button className="btn primary" onClick={startMeasure} data-testid="m-measure-again">
                Again
              </button>
              <button className="m-icon m-close" onClick={() => st().setMeasure(null)} aria-label="Close" data-testid="m-measure-close">
                ✕
              </button>
            </div>
            <div className="m-deltas">
              <span>ΔX {num(measure.dx)}</span>
              <span>ΔY {num(measure.dy)}</span>
              <span>ΔZ {num(measure.dz)}</span>
            </div>
            <div className="muted m-angle">
              Angle {num(measure.angXY)}° in XY{Math.abs(measure.angFromXY) > 1e-9 ? ` · ${num(measure.angFromXY)}° from XY` : ''}
            </div>
          </div>
        )}
        {toast && (
          <div className="m-toast" onClick={() => setToast(null)} data-testid="m-toast">
            {toast}
            {since > 0 && <span className="muted"> {Math.round((Date.now() - since) / 1000)} s</span>}
          </div>
        )}
        {inModel && (
          <button className="m-fab" onClick={() => setOrbitPick(!orbit)} title="What one finger does" data-testid="m-orbit">
            <Icon name={orbit ? 'orbit' : 'pan'} />
            <span>{orbit ? 'Orbit' : 'Pan'}</span>
          </button>
        )}
      </section>

      <nav className="m-bar">
        <button className="m-btn" onClick={() => st().activeViewport?.zoomExtents()} data-testid="m-fit">
          <Icon name="fit" />Fit
        </button>
        <button className={'m-btn' + (sheet === 'views' ? ' on' : '')} disabled={!inModel} onClick={() => setSheet(sheet === 'views' ? null : 'views')} data-testid="m-views">
          <Icon name="views" />Views
        </button>
        <button className={'m-btn' + (sheet === 'style' ? ' on' : '')} onClick={() => setSheet(sheet === 'style' ? null : 'style')} data-testid="m-style">
          <Icon name="style" />Style
        </button>
        <button className={'m-btn' + (sheet === 'layers' ? ' on' : '')} onClick={() => setSheet(sheet === 'layers' ? null : 'layers')} data-testid="m-layers">
          <Icon name="layers" />Layers
        </button>
        <button className={'m-btn' + (measuring ? ' on' : '')} onClick={measuring ? stopMeasure : startMeasure} data-testid="m-measure-btn">
          <Icon name="measure" />Measure
        </button>
      </nav>

      {sheet && (
        <div className="m-sheet-backdrop" onClick={() => setSheet(null)}>
          <div className="m-sheet" onClick={(e) => e.stopPropagation()} data-testid={`m-sheet-${sheet}`}>
            {sheet === 'views' && (
              <>
                <h3>Views</h3>
                <div className="m-grid">
                  {VIEWS.slice(0, 6).map(([v, label]) => viewButton(v, label))}
                </div>
                <div className="m-grid m-grid-4">
                  {VIEWS.slice(6).map(([v, label]) => viewButton(v, label))}
                </div>
              </>
            )}
            {sheet === 'style' && (
              <>
                <h3>Visual style</h3>
                <div className="m-grid">
                  {STYLES.map(([v, label]) => (
                    <button
                      key={v}
                      className={'m-opt' + (style === v ? ' on' : '')}
                      onClick={() => {
                        st().setVisualStyle(v)
                        setSheet(null)
                      }}
                      data-testid={`m-style-${v}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {sheet === 'layers' && (
              <>
                <h3>Layers (only on this screen)</h3>
                <div className="m-list">
                  {[...doc.layers]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((l) => {
                      const offInDrawing = !l.visible || !!l.frozen
                      const shown = !offInDrawing && !viewLayersOff.has(l.id)
                      return (
                        <button
                          key={l.id}
                          className={'m-row' + (shown ? '' : ' off')}
                          disabled={offInDrawing}
                          onClick={() => {
                            setViewLayerOff(l.id, shown)
                            redraw((n) => n + 1)
                          }}
                          aria-pressed={shown}
                          data-testid={`m-layer-${l.name}`}
                        >
                          <span className="m-swatch" style={{ background: l.color }} />
                          <span className="m-row-name">{l.name}</span>
                          <span className="muted">{l.frozen ? 'frozen in the drawing' : offInDrawing ? 'off in the drawing' : shown ? 'On' : 'Off'}</span>
                        </button>
                      )
                    })}
                </div>
              </>
            )}
            {sheet === 'menu' && (
              <div className="m-list">
                <button className="m-row" onClick={open} data-testid="m-open">
                  Open drawing…
                </button>
                {CLOUD_ENABLED && !token && (
                  <button
                    className="m-row"
                    onClick={() => {
                      setSheet(null)
                      st().openLoginDialog()
                    }}
                    data-testid="m-login"
                  >
                    Log in
                  </button>
                )}
                <button
                  className="m-row"
                  onClick={() => {
                    setSheet(null)
                    void enterFullscreen()
                  }}
                  data-testid="m-fullscreen"
                >
                  Full screen
                </button>
                <button className="m-row" onClick={() => st().setScreen({ mobileView: false })} data-testid="m-full-editor">
                  Full editor
                </button>
                {/* La versión: para saber si el teléfono ya tiene la última (recargar la trae). */}
                <p className="muted m-version" data-testid="m-version">
                  {ABOUT.name} {ABOUT.version}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      <OpenDialog />
      <LoginDialog />
    </div>
  )
}
