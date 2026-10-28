import { openContextMenu } from './DimContextMenu'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Viewport } from '../render/Viewport'
import { useStore } from '../store/store'
import { sysvars } from '../core/commands/sysvars'
import { VPORT_VIEWS, type CameraMode, type ViewName } from '../core/view'
import { isWorldUcs, normalizeUcs, WORLD_UCS } from '../core/ucs'
import { pickPreviewColor } from '../core/preview'
import { MODEL_TAB } from '../core/document/DocumentModel'
import { fieldContextFor } from '../core/fields/context'
import { DRAWING_EXT } from '../core/io/paths'
import { focusCommandLine } from './focus'
import { ViewNet } from './ViewNet'
import { LayoutView } from './LayoutView'
import { paneKeyOf, paneState } from '../render/viewMemory'
import { isolation, viewLayers } from '../core/editing/isolation'


function containerStyle(layout: number): CSSProperties {
  const two = { gridTemplateColumns: '1fr 1fr' }
  if (layout === 1) return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' }
  if (layout === 2) return { ...two, gridTemplateRows: '1fr' }
  return { ...two, gridTemplateRows: '1fr 1fr' } // 3 y 4
}

function paneStyle(layout: number, i: number): CSSProperties {
  if (layout === 2) return { gridColumn: i + 1, gridRow: 1 }
  if (layout === 3) {
    if (i === 0) return { gridColumn: 1, gridRow: '1 / 3' }
    return { gridColumn: 2, gridRow: i } // i=1→fila1, i=2→fila2
  }
  if (layout === 4) return { gridColumn: (i % 2) + 1, gridRow: Math.floor(i / 2) + 1 }
  return {}
}

/** Un panel = una instancia de Viewport sobre la escena compartida (mismo DocumentModel). */
/** Etiqueta del menú de UCS de un panel inactivo (su UCS propia: WCS o sin nombre). */
const paneUcsLabel = (vp: Viewport | null): string => (!vp || isWorldUcs(vp.getUcs()) ? 'WCS' : 'Unnamed')

function ViewportPane({ paneKey, view, style }: { paneKey: string; view?: ViewName; style: CSSProperties }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const vpRef = useRef<Viewport | null>(null)
  const [cross, setCross] = useState<{ x: number; y: number } | null>(null)
  // Estado de cámara PROPIO de este pane (alimenta su cubo de vistas).
  const [cam, setCam] = useState<{ az: number; el: number; mode: CameraMode }>({
    az: -Math.PI / 2,
    el: Math.PI / 2,
    mode: 'ortho',
  })

  const setCursor = useStore((s) => s.setCursor)
  const viewCubeOn = useStore((s) => s.viewCubeOn)
  const viewNetStd = useStore((s) => s.viewNetStd)
  const viewportClick = useStore((s) => s.viewportClick)
  const beginGripEdit = useStore((s) => s.beginGripEdit)
  const boxSelect = useStore((s) => s.boxSelect)
  const isSelectMode = useStore((s) => s.isSelectMode)
  const computePreview = useStore((s) => s.computePreview)
  const setCameraState = useStore((s) => s.setCameraState)
  const registerViewport = useStore((s) => s.registerViewport)
  const unregisterViewport = useStore((s) => s.unregisterViewport)
  const setActiveViewport = useStore((s) => s.setActiveViewport)
  const activeViewport = useStore((s) => s.activeViewport)
  // Mientras un comando pide un punto o selección, se oculta el pickbox central (crosshair limpio).
  const picking = useStore((s) => s.prompt.length > 0)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const isActive = () => useStore.getState().activeViewport === vp
    const vp: Viewport = new Viewport(host, {
      onPointerMove: (w) => {
        if (isActive()) setCursor(w)
      },
      onClick: (w, pickedId, snapped, shift, raw, deferred, face) => {
        setActiveViewport(vp)
        viewportClick(w, pickedId, snapped, shift, raw, deferred, face)
        focusCommandLine()
      },
      onBoxSelect: (rect, crossing, shift) => {
        setActiveViewport(vp)
        boxSelect(rect, crossing, (p) => vp.project(p), shift)
        focusCommandLine()
      },
      onRealtimeMenu: (x, y) => useStore.getState().setRealtimeMenu({ x, y }),
      onEntityDoubleClick: (entityId) => {
        setActiveViewport(vp)
        useStore.getState().entityDoubleClick(entityId)
      },
      onGripActivate: (entityId, grip) => {
        setActiveViewport(vp)
        beginGripEdit(entityId, grip)
        focusCommandLine()
      },
      // Clic derecho durante un prompt = Enter (CAD clásico). En TRIM confirma "todas las aristas cortan".
      onRightClickCommand: () => {
        const s = useStore.getState()
        // Como el CAD clásico: en "Select objects" el clic derecho es Enter; en los demás prompts, el menú.
        if (!s.engine.isSelecting) return false
        setActiveViewport(vp)
        s.submitCommand('')
        focusCommandLine()
        return true
      },
      onContextMenu: (x, y, world) => {
        setActiveViewport(vp)
        openContextMenu(x, y, world)
      },
      isSelectMode: () => isSelectMode(),
      selectionArea: () => useStore.getState().selectionArea(),
      isCommandActive: () => useStore.getState().engine.busy,
      onCameraChange: (az, el, mode) => {
        setCam({ az, el, mode }) // el cubo de vistas de este pane sigue su propia cámara
        if (isActive()) setCameraState(az, el, mode)
      },
      onActivate: () => setActiveViewport(vp),
      // VIEW/cubo de vistas con UCSORTHO cambia la UCS del viewport: el store espeja la del activo.
      onUcsChange: (u, name) => {
        if (isActive()) useStore.getState().setUcs(u, name)
      },
    })
    vpRef.current = vp
    vp.paneKey = paneKey
    registerViewport(vp)
    vp.setProvider(() => {
      const s = useStore.getState()
      return {
        // Lo oculto con ISOLATEOBJECTS/HIDEOBJECTS no se dibuja ni da snaps (la revisión cambia con el aislamiento).
        revision: s.doc.revision + isolation.rev * 1e-6,
        entities: isolation.hidden.size ? s.doc.entities.filter((e) => !isolation.hidden.has(e.id)) : s.doc.entities,
        blocks: s.doc.blocks,
        layers: viewLayers(s.doc.layers),
        selection: s.picked.length ? [...s.selection, ...s.picked] : s.selection,
        gridSnap: s.gridSnap,
        gridStep: s.gridStep,
        gridOn: s.gridOn,
        esnap: s.esnap,
        ucs: vp.getUcs(), // UCS propio del viewport
        osnap: s.osnap,
        osnapOverride: s.engine.osnapOverride(),
        snapBase: s.engine.snapBase(),
        snapLive: s.engine.snapEntities(),
        ortho: s.ortho,
        pointPrompt: s.engine.awaitingPoint,
        previewColor: pickPreviewColor(s.layerSvc.get(s.currentLayerId)?.color ?? '#ffffff', s.theme.background),
        otrack: s.otrack,
        polarAng: s.polar ? sysvars.POLARANG : undefined,
        ducs: s.engine.ducsEligible,
        fields: fieldContextFor(s.doc, s.docName + DRAWING_EXT, MODEL_TAB),
        attdisp: s.doc.attdisp,
        linetypes: s.doc.linetypeContext('model'),
      }
    })
    vp.setPreviewProvider((cursor) => computePreview(cursor))
    vp.setTheme(useStore.getState().theme)
    vp.setVisualStyle(useStore.getState().visualStyle)
    const saved = paneState.get(paneKey)
    if (saved) {
      vp.setCamera(saved.cam)
      vp.setUcs(saved.ucs)
    } else if (view) vp.setView(view)
    return () => {
      paneState.set(paneKey, { cam: vp.getCamera(), ucs: vp.getUcs() })
      unregisterViewport(vp)
      vp.dispose()
    }
    // paneKey identifica el panel dentro del layout; remonta al cambiar el layout.
  }, [paneKey])

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setCross({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  const active = activeViewport === vpRef.current
  const ucsName = useStore((s) => s.ucsName)
  useStore((s) => s.version) // la lista de UCS guardadas cambia con el documento
  const namedUcs = useStore.getState().doc.namedUcs().map((u) => u.name)
  return (
    <div
      className={`viewport-pane${active ? ' active' : ''}`}
      style={style}
      ref={hostRef}
      data-testid={`viewport-pane-${paneKey}`}
      onMouseMove={onMouseMove}
      onMouseUp={() => focusCommandLine()}
      onMouseLeave={() => setCross(null)}
    >
      {cross && (
        <>
          <div className="crosshair-v" style={{ left: cross.x }} />
          <div className="crosshair-h" style={{ top: cross.y }} />
          {!picking && <div className="crosshair-box" style={{ left: cross.x, top: cross.y }} />}
        </>
      )}
      {viewCubeOn && (
      <ViewNet
        az={cam.az}
        el={cam.el}
        mode={cam.mode}
        std={viewNetStd}
        onView={(v) => vpRef.current?.setView(v)}
        onViewDir={(az, el) => vpRef.current?.setViewDir(az, el)}
        onToggleMode={() => vpRef.current?.setMode(cam.mode === 'persp' ? 'ortho' : 'persp')}
        onToggleStd={() => useStore.getState().setScreen({ viewNetStd: viewNetStd === 'E' ? 'A' : 'E' })}
        ucs={{
          current: !active ? paneUcsLabel(vpRef.current) : ucsName === 'World' ? 'WCS' : (ucsName ?? 'Unnamed'),
          named: namedUcs,
          onPick: (name) => {
            const vp = vpRef.current
            if (!vp) return
            const s = useStore.getState()
            s.setActiveViewport(vp)
            if (name === '__new') return s.submitCommand('UCS')
            if (name === 'WCS') return s.setUcs({ ...WORLD_UCS }, 'World')
            const def = s.doc.getNamedUcs(name)
            if (def) s.setUcs(normalizeUcs(def), def.name)
          },
        }}
      />
      )}
    </div>
  )
}

/**
 * Área de dibujo: grilla de 1–4 viewports sobre la misma escena (el cubo de vistas controla el activo) o, con
 * una pestaña de layout activa, la hoja con sus viewports flotantes.
 */
export function ViewportView({ single = false }: { single?: boolean }) {
  const tab = useStore((s) => s.doc.activeTab) // se reevalúa en cada cambio del store
  // `single`: la vista mobile muestra sólo el panel principal aunque el dibujo tenga varios.
  const layout = useStore((s) => (single ? 1 : s.viewportLayout))
  const views = VPORT_VIEWS[layout] ?? VPORT_VIEWS[1]
  if (tab !== MODEL_TAB) return <LayoutView key={tab} layoutId={tab} />

  return (
    <div className="viewport" style={{ display: 'grid', ...containerStyle(layout) }}>
      {views.map((v, i) => (
        <ViewportPane key={paneKeyOf(layout, i)} paneKey={paneKeyOf(layout, i)} view={v} style={paneStyle(layout, i)} />
      ))}
    </div>
  )
}
