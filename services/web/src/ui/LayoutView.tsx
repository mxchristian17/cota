import { paperSnapProxies } from '../core/layout/transspatial'
import { isolation, viewLayers, viewLayersOff } from '../core/editing/isolation'
import { annoScaleOf, paperPerModel } from '../core/layout/scale'
import { openContextMenu } from './DimContextMenu'
import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { PAPER_COLOR, Viewport, type CameraState, type ViewportData } from '../render/Viewport'
import { useStore } from '../store/store'
import { sysvars } from '../core/commands/sysvars'
import type { Pt } from '../core/math'
import type { Entity, ViewportEntity } from '../core/document/types'
import type { VisualStyle } from '../core/view'
import { pickPreviewColor } from '../core/preview'
import { paperSizeMm, printableArea } from '../core/layout/paper'
import { MAX_ACTIVE_VP, layoutViewports, viewportAt } from '../core/layout/layouts'
import { modelViewHeight, viewportCorners } from '../core/layout/viewport'
import { unitToMm } from '../core/layout/scale'
import { fieldContextFor } from '../core/fields/context'
import { DRAWING_EXT } from '../core/io/paths'
import { focusCommandLine } from './focus'
import { paperCams } from '../render/viewMemory'

/** Cámara del papel por layout: se conserva al cambiar de pestaña. */

type Rect = { left: number; top: number; width: number; height: number }
type Floats = MutableRefObject<Map<string, Viewport>>

const st = useStore.getState

/** Datos comunes del provider de un viewport de layout (papel o flotante). */
function baseData(
  vp: Viewport,
  entities: ViewportData['entities'],
  active: boolean,
  layers: ViewportData['layers'] = viewLayers(st().doc.layers),
  annoScale = 1,
  linetypes: ViewportData['linetypes'] = st().doc.linetypeContext('paper'),
): ViewportData {
  const s = st()
  return {
    revision: s.doc.revision + isolation.rev * 1e-6, // las capas apagadas sólo en pantalla también redibujan
    entities,
    blocks: s.doc.blocks,
    layers,
    selection: active ? (s.picked.length ? [...s.selection, ...s.picked] : s.selection) : [],
    gridSnap: s.gridSnap,
    gridStep: s.gridStep,
    esnap: s.esnap,
    ucs: vp.getUcs(),
    osnap: s.osnap,
    osnapOverride: s.engine.osnapOverride(),
    snapBase: s.engine.snapBase(),
    snapLive: s.engine.snapEntities(),
    ortho: s.ortho,
    pointPrompt: active && s.engine.awaitingPoint,
    previewColor: pickPreviewColor(s.layerSvc.get(s.currentLayerId)?.color ?? '#ffffff', PAPER_COLOR),
    otrack: s.otrack,
        polarAng: s.polar ? sysvars.POLARANG : undefined,
    // Los campos de los textos (rótulo) se evalúan con los datos del layout activo.
    fields: fieldContextFor(s.doc, s.docName + DRAWING_EXT, s.doc.activeTab),
    // Cotas anotativas: en el papel a 1:1; dentro de un viewport, a la escala del viewport.
    annoScale,
    linetypes,
    attdisp: s.doc.attdisp,
  }
}

/** Clic derecho con un prompt activo = Enter (CAD clásico). */
const rightClickEnter = (): boolean => {
  const s = st()
  // Como el CAD clásico: en "Select objects" el clic derecho es Enter; en los demás prompts, el menú.
  if (!s.engine.isSelecting) return false
  s.submitCommand('')
  focusCommandLine()
  return true
}

/** Doble clic en el papel: dentro de un viewport → MSPACE por él; fuera → PSPACE (con el motor ocioso). */
function toggleSpace(world: Pt): void {
  const s = st()
  if (s.engine.busy || s.engine.hasPending) return
  s.setMsViewport(viewportAt(s.doc, world.x, world.y))
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

/** ¿La cámara del viewport ya coincide con la de su entidad? (tolerancia relativa). */
function sameCamera(a: CameraState, b: CameraState): boolean {
  const t = 1e-9 * Math.max(1, Math.abs(a.radius), Math.abs(b.radius))
  return (
    near(a.az, b.az, 1e-9) &&
    near(a.el, b.el, 1e-9) &&
    near(a.radius, b.radius, t) &&
    a.target.every((v, i) => near(v, b.target[i], t))
  )
}

/** Cámara que corresponde a la entidad VIEWPORT (alto visible = alto en papel / escala). */
function cameraOf(e: ViewportEntity, units: string): CameraState {
  const p = e.props
  return { target: [...p.target], az: p.az, el: p.el, radius: modelViewHeight(p, units) }
}

/**
 * La vista de un flotante cambió (zoom/pan/órbita/VIEW en MSPACE): se escribe en su entidad sin revisión
 * nueva. Devuelve la cámara que quedó en la entidad (o null si no hubo cambio).
 */
function writeView(id: string, vp: Viewport): CameraState | null {
  const s = st()
  const e = s.doc.getEntity(id)
  if (!e || e.type !== 'VIEWPORT') return null
  const cam = vp.getCamera()
  if (sameCamera(cam, cameraOf(e, s.doc.units))) return null
  e.props.target = cam.target
  e.props.az = cam.az
  e.props.el = cam.el
  e.props.scale = e.props.height / (cam.radius * unitToMm(s.doc.units))
  s.viewportViewChanged()
  return cameraOf(e, s.doc.units)
}

interface FloatingProps {
  entity: ViewportEntity
  rect: Rect
  clipPath?: string
  active: boolean
  /** VPMAX: ocupa toda el área de dibujo; la navegación no se guarda en la entidad (VPMIN la restaura). */
  maximized: boolean
  paperRef: MutableRefObject<Viewport | null>
  floats: Floats
}

/** Viewport flotante: una instancia de `Viewport` sobre el modelo, ubicada y recortada sobre la hoja. */
function FloatingViewport({ entity, rect, clipPath, active, maximized, paperRef, floats }: FloatingProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const vpRef = useRef<Viewport | null>(null)
  const ready = useRef(false)
  const maxRef = useRef(maximized)
  maxRef.current = maximized
  /** Última cámara de la entidad ya aplicada (o escrita): sólo un cambio de la entidad mueve la cámara. */
  const applied = useRef<CameraState | null>(null)
  const lastStyle = useRef<VisualStyle | null>(null)
  const id = entity.id

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const isMs = () => st().doc.msViewportId === id
    const vp: Viewport = new Viewport(
      host,
      {
        onPointerMove: (w) => {
          if (isMs()) st().setCursor(w)
        },
        onClick: (w, pickedId, snapped, shift, raw, deferred) => {
          st().viewportClick(w, pickedId, snapped, shift, raw, deferred)
          focusCommandLine()
        },
        onBoxSelect: (r, crossing, shift) => {
          st().boxSelect(r, crossing, (p) => vp.project(p), shift)
          focusCommandLine()
        },
        onRealtimeMenu: (x, y) => st().setRealtimeMenu({ x, y }),
        onEntityDoubleClick: (entityId) => st().entityDoubleClick(entityId),
        onGripActivate: (entityId, grip) => {
          st().beginGripEdit(entityId, grip)
          focusCommandLine()
        },
        onRightClickCommand: rightClickEnter,
        onContextMenu: openContextMenu,
        isSelectMode: () => st().isSelectMode(),
        selectionArea: () => st().selectionArea(),
        isCommandActive: () => useStore.getState().engine.busy,
        onActivate: () => st().setActiveViewport(vp),
        onViewChange: () => {
          if (!ready.current || maxRef.current) return
          const cam = writeView(id, vp)
          if (cam) applied.current = cam
        },
        // Display locked: la rueda y el pan mueven el papel, no la vista del modelo.
        onLockedWheel: (e) => paperRef.current?.wheelZoom(e.clientX, e.clientY, e.deltaY),
        onLockedPan: (dx, dy) => paperRef.current?.panPx(dx, dy),
      },
      'floating',
    )
    vpRef.current = vp
    floats.current.set(id, vp)
    st().registerViewport(vp)
    // VP Freeze: las capas congeladas en este viewport no se dibujan ni dan snaps. Se recalcula sólo al
    // cambiar el documento o la lista (el provider corre en cada cuadro).
    let memo: { key: string; entities: ViewportData['entities']; layers: ViewportData['layers'] } | null = null
    vp.setProvider(() => {
      const doc = st().doc
      const e = doc.getEntity(id)
      const frozen = e?.type === 'VIEWPORT' ? e.props.frozenLayers : []
      const key = `${doc.revision}|${frozen.join(',')}|${isolation.rev}`
      if (memo?.key !== key) {
        // Las capas apagadas sólo en pantalla (vista mobile) se tratan como congeladas en el viewport.
        const set = new Set([...frozen, ...viewLayersOff])
        memo = set.size
          ? {
              key,
              entities: doc.modelEntities.filter((m) => !set.has(m.layer)),
              layers: doc.layers.map((l) => (set.has(l.id) ? { ...l, visible: false } : l)),
            }
          : { key, entities: doc.modelEntities, layers: doc.layers }
      }
      // PSLTSCALE: los trazos miden en el papel lo mismo que en el espacio papel.
      const lt = doc.linetypeContext(e?.type === 'VIEWPORT' ? { paperPerModel: paperPerModel(e.props.scale, doc.units) } : 'model')
      const data = baseData(vp, memo.entities, isMs(), memo.layers, e?.type === 'VIEWPORT' ? annoScaleOf(e.props.scale, doc.units) : undefined, lt)
      // Grosores de capa a escala del papel (un viewport a 1:2 los dibuja igual de gruesos en la hoja).
      if (e?.type === 'VIEWPORT') data.lwUnitsPerMm = 1 / paperPerModel(e.props.scale, doc.units)
      return data
    })
    vp.setPreviewProvider((c) => (isMs() ? st().computePreview(c) : []))
    return () => {
      ready.current = false
      lastStyle.current = null
      applied.current = null
      floats.current.delete(id)
      st().unregisterViewport(vp)
      vp.dispose()
      vpRef.current = null
    }
  }, [id]) // la instancia vive lo que su entidad; el resto se sincroniza en el efecto de abajo

  // Entidad → cámara (escala, vista, bloqueo y estilo) cuando la entidad cambió (paleta, escala, undo…).
  // No se compara con la cámara viva: un VIEW/ZOOM recién hecho aún no se escribió en la entidad (lo
  // hace el próximo cuadro) y se perdería. Maximizado, la vista es libre y al restaurar vuelve a la de
  // la entidad.
  useEffect(() => {
    const vp = vpRef.current
    if (!vp) return
    const want = cameraOf(entity, st().doc.units)
    if (maximized) applied.current = null
    else if (!applied.current || !sameCamera(applied.current, want)) {
      if (!sameCamera(vp.getCamera(), want)) vp.setCamera(want)
      applied.current = want
    }
    vp.setNavLocked(entity.props.locked && !maximized)
    if (lastStyle.current !== entity.props.visualStyle) {
      lastStyle.current = entity.props.visualStyle
      vp.setVisualStyle(entity.props.visualStyle)
    }
    ready.current = true
  })

  return (
    <div
      ref={hostRef}
      className={`layout-vp-host${active ? ' active' : ''}${maximized ? ' maximized' : ''}`}
      style={maximized ? undefined : { ...rect, clipPath }}
      data-testid={`layout-vp-${id}`}
    />
  )
}

/** Rectángulo en píxeles (relativo al contenedor) de una caja del papel en mm. */
function rectOf(paper: Viewport, x0: number, y0: number, x1: number, y1: number): Rect | null {
  const a = paper.project({ x: x0, y: y0, z: 0 })
  const b = paper.project({ x: x1, y: y1, z: 0 })
  if (!a || !b) return null
  return { left: Math.min(a[0], b[0]), top: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]) }
}

/**
 * Vista de una pestaña de layout: hoja de papel con sombra y área imprimible, viewports
 * flotantes con vista viva del modelo (máx. `MAX_ACTIVE_VP`) y, por encima, el papel (entidades en mm).
 * En PSPACE se edita el papel; en MSPACE el modelo a través del viewport activo (borde resaltado).
 */
export function LayoutView({ layoutId }: { layoutId: string }) {
  useStore((s) => s.version)
  const doc = useStore((s) => s.doc)
  const picking = useStore((s) => s.prompt.length > 0)
  const paperHostRef = useRef<HTMLDivElement>(null)
  const paperRef = useRef<Viewport | null>(null)
  const floats = useRef(new Map<string, Viewport>())
  const [, setFrame] = useState(0)
  const [cross, setCross] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const host = paperHostRef.current
    if (!host) return
    let ready = false
    const paper: Viewport = new Viewport(
      host,
      {
        onPointerMove: (w) => {
          if (st().activeViewport === paper) st().setCursor(w)
        },
        onClick: (w, pickedId, snapped, shift, raw, deferred) => {
          const s = st()
          if (s.doc.inPaperSpace) s.viewportClick(w, pickedId, snapped, shift, raw, deferred)
          else {
            // En MSPACE, un clic sobre otro viewport lo hace activo (como el CAD clásico).
            const id = viewportAt(s.doc, w.x, w.y)
            if (id) s.setMsViewport(id)
          }
          focusCommandLine()
        },
        onBoxSelect: (r, crossing, shift) => {
          st().boxSelect(r, crossing, (p) => paper.project(p), shift)
          focusCommandLine()
        },
        onRealtimeMenu: (x, y) => st().setRealtimeMenu({ x, y }),
        onEntityDoubleClick: (entityId, world) => {
          const s = st()
          if (!s.doc.inPaperSpace) return toggleSpace(world)
          s.entityDoubleClick(entityId) // el rótulo (bloque con atributos) abre su editor
        },
        onEmptyDoubleClick: toggleSpace,
        onGripActivate: (entityId, grip) => {
          st().beginGripEdit(entityId, grip)
          focusCommandLine()
        },
        onRightClickCommand: rightClickEnter,
        onContextMenu: openContextMenu,
        isSelectMode: () => st().doc.inPaperSpace && st().isSelectMode(),
        selectionArea: () => (st().doc.inPaperSpace ? st().selectionArea() : null),
        isCommandActive: () => useStore.getState().engine.busy,
        onActivate: () => {
          if (st().doc.inPaperSpace) st().setActiveViewport(paper)
        },
        // Pan/zoom del papel: reubica hoja y viewports (sin regenerar geometría).
        onViewChange: () => {
          if (!ready) return
          paperCams.set(layoutId, paper.getCamera())
          setFrame((f) => f + 1)
        },
      },
      'paper',
    )
    paperRef.current = paper
    paper.paneKey = `paper:${layoutId}`
    st().registerViewport(paper)
    // Desde el papel, los snaps también toman el modelo visto por los viewports (trans-espacial).
    let extras: { rev: number; list: Entity[] } | null = null
    paper.setProvider(() => {
      const doc = st().doc
      const paperEnts = doc.layoutEntities(layoutId)
      const data = baseData(paper, paperEnts, doc.inPaperSpace)
      data.lwUnitsPerMm = 1 // el papel se dibuja en mm
      if (!doc.inPaperSpace) return data
      if (extras?.rev !== doc.revision) extras = { rev: doc.revision, list: paperSnapProxies(paperEnts, doc.modelEntities, doc.blocks, doc.layers, doc.units) }
      return { ...data, snapExtras: extras.list }
    })
    paper.setPreviewProvider((c) => (st().doc.inPaperSpace ? st().computePreview(c) : []))
    const l = st().doc.getLayout(layoutId)
    const { width, height } = l ? paperSizeMm(l.pageSetup) : { width: 420, height: 297 }
    paper.setSheet(width, height)
    const saved = paperCams.get(layoutId)
    // Primera vez: la hoja entera con un 8 % de aire (vista en planta del papel).
    const aspect = host.clientWidth / Math.max(1, host.clientHeight) || 1
    const top = { az: -Math.PI / 2, el: Math.PI / 2 }
    paper.setCamera(saved ?? { target: [width / 2, height / 2, 0], ...top, radius: Math.max(height, width / aspect) * 1.08 })
    ready = true
    setFrame((f) => f + 1)
    return () => {
      st().unregisterViewport(paper)
      paperRef.current = null
      paper.dispose()
    }
  }, [layoutId])

  // Viewport activo de la app: el papel en PSPACE o el flotante de MSPACE (los efectos hijos ya corrieron).
  useEffect(() => {
    const s = st()
    const ms = s.doc.msViewportId
    const target = ms ? floats.current.get(ms) : paperRef.current
    if (target && s.activeViewport !== target) s.setActiveViewport(target)
  })

  const paper = paperRef.current
  const layout = doc.getLayout(layoutId)
  const ms = doc.msViewportId
  const maxId = doc.maximizedViewportId
  let sheet: Rect | null = null
  let printable: Rect | null = null
  const hosts: { entity: ViewportEntity; rect: Rect; clipPath?: string }[] = []
  if (paper && layout) {
    const { width, height } = paperSizeMm(layout.pageSetup)
    paper.setSheet(width, height)
    sheet = rectOf(paper, 0, 0, width, height)
    const a = printableArea(layout.pageSetup)
    printable = rectOf(paper, a.minX, a.minY, a.maxX, a.maxY)
    // Vista viva para los viewports encendidos hasta MAXACTVP; el de MSPACE siempre la tiene.
    const on = layoutViewports(doc).filter((v) => v.props.on && (!maxId || v.id === maxId))
    const live = on.slice(0, MAX_ACTIVE_VP)
    const msVp = on.find((v) => v.id === ms)
    if (msVp && !live.includes(msVp)) live[live.length - 1] = msVp
    for (const v of live) {
      const c = viewportCorners(v.props)
      const rect = rectOf(paper, c[0][0], c[0][1], c[2][0], c[2][1])
      if (!rect) continue
      let clipPath: string | undefined
      if (v.props.clip && v.props.clip.length >= 3) {
        const pts = v.props.clip.map(([x, y]) => paper.project({ x, y, z: 0 }) ?? [0, 0])
        clipPath = `polygon(${pts.map(([x, y]) => `${x - rect.left}px ${y - rect.top}px`).join(', ')})`
      }
      hosts.push({ entity: v, rect, clipPath })
    }
  }

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setCross({ x: e.clientX - r.left, y: e.clientY - r.top })
  }

  return (
    <div
      className={`viewport layout-view${ms ? ' mspace' : ''}`}
      data-testid="layout-view"
      onMouseMove={onMouseMove}
      onMouseUp={() => focusCommandLine()}
      onMouseLeave={() => setCross(null)}
    >
      {sheet && <div className="layout-sheet" style={sheet} data-testid="layout-sheet" />}
      {printable && <div className="layout-printable" style={printable} />}
      {hosts.map((h) => (
        <FloatingViewport
          key={h.entity.id}
          entity={h.entity}
          rect={h.rect}
          clipPath={h.clipPath}
          active={h.entity.id === ms}
          maximized={h.entity.id === maxId}
          paperRef={paperRef}
          floats={floats}
        />
      ))}
      <div className="layout-paper-host" ref={paperHostRef} />
      {maxId && (
        <button className="vpmin-btn" data-testid="vpmin" title="Restore the viewport (VPMIN)" onClick={() => st().setMsViewport(null)}>
          Minimize viewport
        </button>
      )}
      {cross && (
        <>
          <div className="crosshair-v" style={{ left: cross.x }} />
          <div className="crosshair-h" style={{ top: cross.y }} />
          {!picking && <div className="crosshair-box" style={{ left: cross.x, top: cross.y }} />}
        </>
      )}
    </div>
  )
}
