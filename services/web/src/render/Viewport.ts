import { hiddenLayerIds, layerEditable, layerVisible } from '../core/layers/visibility'
import type { Deferred } from '../core/geom/tangency'
import * as THREE from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import type { Pt, Vec3 } from '../core/math'
import type { AttDisp, BlockDef, DimensionEntity, Entity, Layer, MeshEntity, SolidEntity } from '../core/document/types'
import { PREVIEW_COLORS, type PreviewShape } from '../core/preview'
import { expandEntities } from '../core/editing/block'
import { entityOutline } from '../core/editing/bounds'
import { computeSnap, type SnapResult, type SnapType } from '../core/snap/SnapService'
import { computeTracking } from '../core/snap/tracking'
import { singleOsnap, type OsnapConfig, type OsnapKind } from '../core/snap/osnap'
import { segmentsOfEntity } from '../core/snap/segments'
import { dimDisplay } from '../core/dimension/dimGeometry'
import { isWorldUcs, ORTHO_UCS, orthoUcs, sameUcs, ucsZ, WORLD_UCS, type OrthoUcsName, type Ucs } from '../core/ucs'
import { sysvars } from '../core/commands/sysvars'
import { isSmall, lodActive, sizeSignature, type SizeSig } from '../core/render/lod'
import { faceUcsAt, type FaceHit } from '../core/editing/faceUcs'
import { rayFaces, solidTopology } from '../core/editing/topology'
import { DEFAULT_VISUAL_STYLE, type CameraMode, type ViewName, type VisualStyle } from '../core/view'
import { CameraController } from './CameraController'
import { previewSolidGeometry, solidEdgePositions, solidGeometry } from './csg'
import { pointMarkTexture } from './pointMarks'
import { ellipsePoints } from '../core/geom/ellipse'
import { arcBasis, tessellateArc } from '../core/geom/arc'
import { polylinePoints } from '../core/geom/polyline'
import { LINE_SPACING, attdefText, textAxes, textCorners, textTop } from '../core/geom/text'
import { entityGrips, type Grip } from '../core/editing/grips'
import { viewportRing } from '../core/layout/viewport'
import { evaluateFields, fieldSegments, hasFields, type FieldContext } from '../core/fields/fields'
import { drawOrder } from '../core/layers/order'
import { entityPattern, type LinetypeContext } from '../core/linetype/linetypes'
import { entityDashes, linetypePaths, type DashResult } from '../core/linetype/dash'
import { hatchFrame, hatchRegions, hatchRings, hatchStrokesCached, isSolidHatch, to3, type Ring } from '../core/hatch/geometry'
import { isWide, polylineBand } from '../core/geom/plineWidth'
import type { HatchEntity } from '../core/document/types'

/** Distancia de `p` al segmento a→b. */
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
  const L = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z
  const t = L > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / L)) : 0
  return Math.hypot(p.x - a.x - ab.x * t, p.y - a.y - ab.y * t, p.z - a.z - ab.z * t)
}

export interface ViewportData {
  revision: number
  entities: Entity[]
  /** Tabla de bloques (para expandir las inserciones a geometría de mundo). */
  blocks: BlockDef[]
  layers: Layer[]
  selection: string[]
  gridSnap: boolean
  gridStep: number
  /** Grilla visible (GRID, F7); sin el dato, visible. Sólo el viewport del modelo la dibuja. */
  gridOn?: boolean
  esnap: boolean
  ucs: Ucs
  osnap: OsnapConfig
  /** Override de snap de un solo uso (cen/end/mid/…), o null. */
  osnapOverride: OsnapKind | null
  /** Punto base del prompt activo (rubber-band), para perpendicular/tangent. */
  snapBase: Pt | null
  /** Hay un prompt esperando un punto/distancia → activar object snap y previsualización. */
  pointPrompt: boolean
  /** Color del rubber-band, ya elegido para contrastar con la capa actual y el fondo. */
  previewColor: number
  /** Object snap tracking activo (OTRACK / F11). */
  otrack: boolean
  /** Rastreo polar (POLAR / F10): incremento de ángulo en grados, o ausente si está apagado. */
  polarAng?: number
  /** UCS dinámica habilitada en este momento (primer punto de un comando de dibujo). */
  ducs?: boolean
  /** Contexto de los campos de los textos (`%<\AcVar …>%`); sin él se muestran tal cual. */
  fields?: FieldContext
  /** ATTDISP del dibujo (atributos de bloque visibles). */
  attdisp?: AttDisp
  /** Escala de anotación de este viewport (cotas anotativas): unidades de dibujo por mm de papel. */
  annoScale?: number
  /** Tipos de línea del dibujo con la escala de este espacio; sin él, todo continuo. */
  linetypes?: LinetypeContext
  /**
   * Entidades que sólo dan snaps (no se dibujan ni se seleccionan): en el papel, el modelo visto por los
   * viewports (trans-espacial). Un clic que captura un snap de una de ellas la toma como objeto.
   */
  snapExtras?: Entity[]
  /** Geometría en curso del comando (tramos de una PLINE todavía sin guardar): sólo da snaps. */
  snapLive?: Entity[]
  /** ORTHO activo (los cruces de la recta de ortho con los objetos dan INT). */
  ortho?: boolean
  /**
   * Grosores de línea en pantalla (layouts): unidades del dibujo por mm de papel (1 en el papel; 1/escala en un
   * viewport flotante). Sin él (espacio modelo) las líneas son finas.
   */
  lwUnitsPerMm?: number
}

export interface RectPx {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface ViewportCallbacks {
  onPointerMove?: (world: Pt) => void
  /** `snapped` = el punto quedó fijado por un object snap (no grilla): El CAD clásico lo hace ganar a ORTHO.
   *  `shift` = se clickeó con Shift → resta de la selección en vez de sumar. */
  onClick?: (world: Pt, pickedId: string | null, snapped: boolean, shift: boolean, raw: Pt, deferred?: Deferred, face?: Ucs) => void
  /** Caja de selección en píxeles de pantalla; `crossing` = arrastre derecha→izquierda;
   *  `shift` = resta lo encerrado de la selección. */
  onBoxSelect?: (rectPx: RectPx, crossing: boolean, shift: boolean) => void
  /** Un clic sobre un grip lo activa e inicia su edición (el punto final se fija luego). */
  onGripActivate?: (entityId: string, grip: Grip) => void
  /** La vista cambió la UCS del viewport (UCSORTHO): el store espeja la del activo. */
  onUcsChange?: (ucs: Ucs, name?: string) => void
  /** Doble clic sobre una entidad: la selecciona y abre la paleta de Propiedades. */
  onEntityDoubleClick?: (entityId: string, world: Pt) => void
  /** Clic derecho con un prompt de comando activo = Enter (CAD clásico). Devuelve true si lo consumió. */
  onRightClickCommand?: () => boolean
  /** ¿Hay un comando en curso? Entonces la selección sólo se resalta: sin grips (como el CAD clásico). */
  isCommandActive?: () => boolean
  /** Clic derecho sin arrastrar (sin prompt activo): menú contextual en (clientX, clientY). */
  onContextMenu?: (clientX: number, clientY: number, world: Pt) => void
  isSelectMode?: () => boolean
  /** Ventana o cruce pedido con W/C: la ventana se abre aunque el clic caiga sobre un objeto y su tipo es fijo. */
  selectionArea?: () => 'window' | 'crossing' | null
  onCameraChange?: (az: number, el: number, mode: CameraMode) => void
  /** Se invoca cuando este viewport recibe interacción (para marcarlo como activo). */
  onActivate?: () => void
  /** Cualquier cambio de cámara (pan, zoom, órbita o tamaño): el layout reubica hoja y viewports. */
  onViewChange?: () => void
  /** Doble clic sin entidad bajo el cursor (en el papel: entrar/salir de MSPACE). */
  onEmptyDoubleClick?: (world: Pt) => void
  /** Clic derecho en el modo Realtime de ZOOM/PAN: menú del CAD clásico. */
  onRealtimeMenu?: (clientX: number, clientY: number) => void
  /** Con la navegación bloqueada (viewport *display locked*), la rueda y el pan se derivan al papel. */
  onLockedWheel?: (e: WheelEvent) => void
  onLockedPan?: (dx: number, dy: number) => void
}

/**
 * Clase de viewport: `model` = panel del espacio modelo; `paper` = hoja de un layout (fondo
 * transparente sobre la hoja HTML, vista TOP fija, sin grilla); `floating` = viewport flotante de un
 * layout (fondo de papel, sin grilla, siempre ortográfico; su cámara la fija la entidad VIEWPORT).
 */
export type ViewportKind = 'model' | 'paper' | 'floating'

/** Estado de cámara exportable (para sincronizar un viewport flotante con su entidad). */
export interface CameraState {
  target: Vec3
  az: number
  el: number
  radius: number
  /** Proyección (sólo paneles del modelo; los flotantes son siempre ortográficos). */
  mode?: CameraMode
  /** "Arriba" de una vista en planta de una UCS (PLAN); ausente = el de la orientación. */
  up?: Vec3
}

/** Vistas que recuerda ZOOM Previous por viewport (en el CAD clásico: 10). */
export const VIEW_HISTORY = 10

const BG_COLOR = 0x1e1e1e
const HIGHLIGHT = 0x00e5ff
/** Color de la hoja de papel de los layouts. */
export const PAPER_COLOR = '#ffffff'
/** Caras sombreadas de color 7 sobre el papel (el negro no deja ver el sombreado). */
const FACE_ON_PAPER = '#b8b8b8'

/** Acumuladores de geometría fusionada por material (batching para modelos pesados). */
interface MeshBatch { pos: number[]; nor: number[]; ranges: { s: number; id: string }[]; n: number }
interface LineBatch { pos: number[]; ranges: { s: number; id: string }[]; n: number }
/**
 * La grilla va debajo de todo: se dibuja primero y no escribe profundidad. Antes, con el orden de
 * capas negativo se dibujaba después de las entidades y tapaba las líneas que caían justo sobre
 * una línea de la grilla (un rectángulo en múltiplos del paso, los ejes).
 */
function underlayGrid(g: THREE.GridHelper): THREE.GridHelper {
  g.renderOrder = -1e9
  const mats = Array.isArray(g.material) ? g.material : [g.material]
  for (const m of mats) m.depthWrite = false
  return g
}

/** Puntos de los tipos de línea y patrones (elementos de largo 0). */
interface PointBatch { pos: number[] }

/**
 * Regiones de relleno de un sombreado en triángulos de mundo (regla par-impar con sus agujeros).
 */
function hatchTriangles(e: HatchEntity): number[] {
  const f = hatchFrame(e.props)
  const out: number[] = []
  for (const g of hatchRegions(hatchRings(e.props, f))) {
    const contour = g.outer.map(([x, y]) => new THREE.Vector2(x, y))
    const holes = g.holes.map((h: Ring) => h.map(([x, y]) => new THREE.Vector2(x, y)))
    const all = [...g.outer, ...g.holes.flat()]
    for (const tri of THREE.ShapeUtils.triangulateShape(contour, holes)) {
      for (const k of tri) out.push(...to3(all[k], f))
    }
  }
  return out
}
/**
 * Caras sombreadas apenas corridas hacia atrás en profundidad: lo que se dibuja sobre ellas en el mismo
 * plano (aristas, cotas y textos sobre una cara) gana sin pelear con la malla.
 */
const FACE_OFFSET = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }
const GRIP_COLOR = 0x1a6fff // grip en reposo (azul el CAD clásico)
const GRIP_HOVER = 0x33ff66 // grip bajo el cursor

export class Viewport {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly controller = new CameraController()
  private readonly entityGroup = new THREE.Group()
  /** Contornos de las superficies curvas de los sólidos, según la vista (no se seleccionan). */
  private readonly silhouetteGroup = new THREE.Group()
  private silhouetteKey = ''
  private silhouetteMs = 0
  private readonly previewGroup = new THREE.Group()
  private readonly snapGroup = new THREE.Group()
  /** UCS dinámica (DUCS): cara plana de un sólido bajo el cursor y su resaltado. */
  private ducsFace: FaceHit | null = null
  private readonly ducsGroup = new THREE.Group()
  private readonly gripGroup = new THREE.Group()
  /** Grips visibles (de las entidades seleccionadas) con su entidad de origen, para hit-test. */
  private grips: { grip: Grip; entityId: string }[] = []
  private hoverGrip = -1
  /** Se presionó el botón sobre un grip: el próximo `up` (sin arrastre) lo activa. */
  private gripArmed = false
  // El rubber-band se dibuja SIEMPRE sobre la escena (sin depth-test) y último en el orden de
  // render, como en el CAD clásico: lo que se está dibujando no queda tapado por sólidos ni por líneas.
  private readonly previewMaterial = new THREE.LineBasicMaterial({
    color: PREVIEW_COLORS[0],
    depthTest: false,
    depthWrite: false,
  })
  /** Marcador del snap: siempre encima de la geometría (en 3D un sólido no lo tapa). */
  private readonly snapMaterial = new THREE.LineBasicMaterial({ color: 0x33ff99, depthTest: false, depthWrite: false })
  /** Líneas de alineación del tracking: punteadas, siempre visibles (como el CAD clásico). */
  private readonly trackMaterial = new THREE.LineDashedMaterial({
    color: 0x33ff99,
    dashSize: 6,
    gapSize: 4,
    depthTest: false,
    depthWrite: false,
    opacity: 0.9,
    transparent: true,
  })
  /** Materiales compartidos por los overlays: viven lo que el viewport (se liberan en `dispose`). */
  private readonly overlayMaterials = new Set<THREE.Material>([this.previewMaterial, this.snapMaterial, this.trackMaterial])
  private readonly raycaster = new THREE.Raycaster()
  private previewProvider: ((cursor: Pt) => PreviewShape[]) | null = null
  private data: ViewportData | null = null
  private snapResult: SnapResult = { point: { x: 0, y: 0, z: 0 }, type: null }
  private readonly lastWorldRaw: Pt = { x: 0, y: 0, z: 0 }
  private readonly lastWorld: Pt = { x: 0, y: 0, z: 0 }
  private width = 1
  private height = 1
  private lastRevision = -1
  private lastSelectionKey = ''
  /** Hay textos con campos: un cambio del contexto (nombre del layout, fecha, escala…) los re-evalúa. */
  private hasFieldTexts = false
  private lastFieldsKey = ''
  private lastCamKey = ''
  private lastOrient = ''
  /** Render on-demand: solo se dibuja cuando algo cambió (cámara, datos, selección, snap, preview…). */
  private dirty = true
  /** Entidades expandidas (bloques resueltos), cacheadas por revisión. */
  private expanded: Entity[] | null = null
  /** Dibujo por tamaño en pantalla: activo, clase de cada pieza (true = punto) y balde de zoom. */
  private lodOn = false
  private lodSmall = new Map<string, boolean>()
  private lodBucket = ''
  /** Por entidad: orden de dibujo de su capa (mayor = más arriba) y su posición en la lista. */
  private pickOrder = new Map<string, { o: number; i: number }>()
  /** Esferas envolventes (mundo) por entidad expandida, para el culling espacial del snap. */
  private snapSpheres: { c: THREE.Vector3; r: number }[] | null = null
  private raf = 0
  private dragging: 'pan' | 'orbit' | 'forbit' | 'rtzoom' | null = null
  /** Historial de vistas para ZOOM Previous. */
  private viewHistory: CameraState[] = []
  private lastWheelAt = 0
  private lastMiddleDown = 0
  /** Modo Realtime de ZOOM/PAN: el arrastre con el botón izquierdo navega. */
  private realtime: 'zoom' | 'pan' | 'orbit' | 'forbit' | 'corbit' | null = null
  /** 3DCORBIT: giro que sigue después de soltar (px por cuadro). */
  private spin: { dx: number; dy: number } | null = null
  private lastDrag = { dx: 0, dy: 0 }
  /** Vista al entrar en Realtime (*Zoom Original*). */
  private realtimeOrigin: CameraState | null = null
  private readonly lastPan = new THREE.Vector2()
  /** Dónde se apretó el botón derecho (para distinguir clic de arrastre de órbita). */
  private rightDown: [number, number] | null = null
  /** Entidades que dan snaps (visibles + extras del papel); se recalcula con los datos. */
  private snapList: Entity[] | null = null
  private readonly keyLight = new THREE.DirectionalLight(0xffffff, 2.2)
  private readonly fillLight = new THREE.DirectionalLight(0xffffff, 0.35)
  private snapListKey = ''
  /** Líneas con grosor de los layouts (la fina queda para el pick). */
  private wideLines: { thin: THREE.LineSegments; wide: LineSegments2; mm: number }[] = []
  private lineweightZoom = -1
  /** Objetos que se ven pero no se seleccionan (capas congeladas o bloqueadas). */
  private unpickable = new Set<string>()
  private snapLiveRef: Entity[] | undefined
  /** Escala de anotación con la que se dibujaron las cotas anotativas (cambia con la escala del viewport). */
  private lastAnnoScale: number | undefined = undefined
  private readonly lastPx: [number, number] = [0, 0]
  private boxStartPx: [number, number] | null = null
  /** Ventana de selección abierta por un clic en vacío: espera el clic de la esquina opuesta. */
  private boxPending = false
  private curPx: [number, number] = [0, 0]
  private draggingBox = false
  private boxActive = false
  private readonly boxEl: HTMLDivElement
  /** Icono de la UCS: SVG sobre el canvas, sólo en el modelo. */
  private readonly ucsIconEl: SVGSVGElement | null = null
  private ucsIconKey = ''
  private dimLabels: { el: HTMLDivElement; pos: THREE.Vector3; height: number }[] = []
  private textLabels: { el: HTMLDivElement; pos: THREE.Vector3; height: number; u: THREE.Vector3; v: THREE.Vector3; justify: string }[] = []
  private grid!: THREE.GridHelper
  private bgColor = new THREE.Color(BG_COLOR)
  private visualStyle: VisualStyle = DEFAULT_VISUAL_STYLE
  /** UCS propio del viewport (cada panel mantiene el suyo). */
  private ucs: Ucs = { ...WORLD_UCS }
  /** Puntos adquiridos para el object snap tracking (máx. 3, como el CAD clásico). */
  private tracked: Pt[] = []
  /** Líneas de alineación vigentes (se dibujan punteadas mientras el tracking captura). */
  private trackLines: [Pt, Pt][] = []
  /** Hover sostenido sobre un snap: clave del punto, instante inicial y si ya se consumió. */
  private hoverKey = ''
  private hoverSince = 0
  private hoverConsumed = false
  /** Estado anterior del prompt de punto: al terminar un comando se sueltan los puntos adquiridos. */
  private lastPointPrompt = false
  /** Estado del prompt de punto (activo y punto base) del último tick: si cambia, se re-dibuja. */
  private lastPromptKey = ''
  private readonly ro: ResizeObserver
  /** Navegación bloqueada: rueda/pan se derivan por callback (viewport *display locked*). */
  private navLocked = false
  /** Hoja del layout (mm), incluida en ZOOM Extents del papel. */
  private sheet: { w: number; h: number } | null = null

  constructor(
    private readonly container: HTMLElement,
    private readonly cb: ViewportCallbacks = {},
    readonly kind: ViewportKind = 'model',
  ) {
    const paper = kind === 'paper'
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: paper })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    if (kind === 'model') this.scene.background = new THREE.Color(BG_COLOR)
    else {
      // Papel: transparente sobre la hoja HTML; flotante: fondo de papel. El "tinte" (color 7 → negro,
      // estilo hidden) se calcula contra el blanco del papel.
      this.bgColor = new THREE.Color(PAPER_COLOR)
      this.scene.background = paper ? null : new THREE.Color(PAPER_COLOR)
      if (paper) this.renderer.setClearColor(0x000000, 0)
      this.controller.minRadius = 1e-4
      this.controller.maxRadius = 1e9
    }

    this.grid = underlayGrid(new THREE.GridHelper(1000, 100, 0x444444, 0x2a2a2a))
    this.grid.visible = kind === 'model'
    this.orientGrid()
    this.scene.add(this.grid)
    // Iluminación por defecto como el CAD clásico: dos luces distantes que siguen a la cámara (ver `aimLights`), así
    // las caras con distinta orientación nunca quedan del mismo tono, se mire desde donde se mire.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45))
    this.scene.add(this.keyLight, this.keyLight.target, this.fillLight, this.fillLight.target)
    this.scene.add(this.entityGroup, this.silhouetteGroup, this.previewGroup, this.snapGroup, this.gripGroup, this.ducsGroup)
    this.ducsGroup.renderOrder = 11
    // Overlays por encima de la geometría: preview < glifos de snap < grips.
    this.previewGroup.renderOrder = 10
    this.snapGroup.renderOrder = 11
    this.gripGroup.renderOrder = 12

    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'
    // El buffer va en píxeles físicos (setPixelRatio); el tamaño en pantalla lo fija el contenedor. Sin esto,
    // en pantallas de alta densidad (retina, escala 150–200 %) el canvas se veía al doble y recortado.
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.renderer.domElement.style.touchAction = 'none'

    this.boxEl = document.createElement('div')
    this.boxEl.style.cssText =
      'position:absolute;pointer-events:none;display:none;border:1px solid;background:rgba(255,255,255,0.06);z-index:5'
    container.appendChild(this.boxEl)
    if (kind === 'model') {
      this.ucsIconEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      this.ucsIconEl.setAttribute('data-testid', 'ucs-icon')
      this.ucsIconEl.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:4;overflow:visible'
      container.appendChild(this.ucsIconEl)
    }

    this.attachEvents()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.resize()
    // El primer cuadro va en el próximo frame: sus callbacks (cámara, modo de selección…) pueden referirse al
    // viewport que todavía se está construyendo (`const vp = new Viewport(…)` del componente).
    this.raf = requestAnimationFrame(this.tick)
  }

  setProvider(provider: () => ViewportData): void {
    this.provider = provider
  }
  private provider: (() => ViewportData) | null = null

  setPreviewProvider(provider: (cursor: Pt) => PreviewShape[]): void {
    this.previewProvider = provider
  }

  /** Aplica el tema visual: fondo de la escena y colores de la grilla. */
  setTheme(t: { background: string; gridMajor: string; gridMinor: string }): void {
    if (this.kind !== 'model') return // la hoja es blanca con cualquier tema
    this.bgColor = new THREE.Color(t.background)
    this.scene.background = new THREE.Color(t.background)
    this.scene.remove(this.grid)
    this.grid.geometry.dispose()
    const mat = this.grid.material
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else mat.dispose()
    const visible = this.grid.visible
    this.grid = underlayGrid(new THREE.GridHelper(1000, 100, new THREE.Color(t.gridMajor), new THREE.Color(t.gridMinor)))
    this.grid.visible = visible
    this.orientGrid()
    this.scene.add(this.grid)
    this.invalidate()
  }

  /** Estilo visual del viewport (2D/3D wireframe, shaded, shaded+edges, hidden). */
  setVisualStyle(mode: VisualStyle): void {
    if (this.visualStyle === mode) return
    this.visualStyle = mode
    this.lastRevision = -1 // fuerza el rebuild en el próximo tick
  }

  /** Fuerza el redibujo/regeneración de la escena en el próximo tick (REDRAW/REGEN). */
  forceRebuild(): void {
    this.lastRevision = -1
    this.lastSelectionKey = '\u0000'
  }

  /** UCS propio del viewport. */
  getUcs(): Ucs {
    return this.ucs
  }
  setUcs(ucs: Ucs): void {
    this.ucs = ucs
    this.orientGrid() // la grilla se reubica/reorienta con el UCS
    this.updateUcsIcon()
    this.invalidate()
  }

  /**
   * Icono de la UCS (UCSICON): ejes X (rojo), Y (verde) y Z (azul) en proyección paralela. Con el
   * bit "origen" se dibuja en el origen de la UCS si entra en pantalla; si no, abajo a la izquierda. "W"
   * marca la UCS universal; una cruz roja, que el plano XY se ve de canto (el lápiz roto del CAD clásico).
   */
  updateUcsIcon(force = false): void {
    const el = this.ucsIconEl
    if (!el) return
    if (force) this.ucsIconKey = ''
    const flags = sysvars.UCSICON
    const cam = this.controller.camera
    cam.updateMatrixWorld()
    const o = this.ucs.origin
    const at = flags & 2 ? this.controller.project(new THREE.Vector3(o.x, o.y, o.z)) : null
    const m = 40
    const inside = at && at[0] > m && at[0] < this.width - m && at[1] > m && at[1] < this.height - m
    const [cx, cy] = inside ? at : [34, this.height - 34]
    const rot = new THREE.Matrix3().setFromMatrix4(cam.matrixWorldInverse)
    const key = `${flags}|${cx.toFixed(1)},${cy.toFixed(1)}|${cam.matrixWorldInverse.elements.map((v) => v.toFixed(4)).join(',')}|${this.ucs.x}|${this.ucs.y}`
    if (key === this.ucsIconKey) return
    this.ucsIconKey = key
    if (!(flags & 1)) {
      el.innerHTML = ''
      return
    }
    const L = 30
    const axes: Array<[Vec3, string, string]> = [
      [this.ucs.x, '#e05a5a', 'X'],
      [this.ucs.y, '#5ac85a', 'Y'],
      [ucsZ(this.ucs), '#5a8cff', 'Z'],
    ]
    const parts = axes.map(([d, color, label]) => {
      const v = new THREE.Vector3(...d).applyMatrix3(rot)
      const [ex, ey] = [cx + v.x * L, cy - v.y * L]
      if (Math.hypot(v.x, v.y) < 0.08) return '' // eje de punta: no se dibuja
      const [lx, ly] = [cx + v.x * (L + 9), cy - v.y * (L + 9)]
      return (
        `<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width="2"/>` +
        `<text x="${lx}" y="${ly}" fill="${color}" font-size="10" font-family="monospace" text-anchor="middle" dominant-baseline="middle">${label}</text>`
      )
    })
    if (isWorldUcs(this.ucs)) parts.push(`<text x="${cx + 7}" y="${cy + 12}" fill="#c8c8c8" font-size="9" font-family="monospace">W</text>`)
    if (this.edgeOn()) parts.push(`<line x1="${cx - 8}" y1="${cy - 8}" x2="${cx + 8}" y2="${cy + 8}" stroke="#ff4040" stroke-width="2"/>`)
    el.innerHTML = parts.join('')
  }

  setView(name: ViewName): void {
    if (this.kind === 'paper') return // el papel siempre se mira en planta
    this.recordView()
    this.controller.setView(name)
    if (this.kind === 'floating') this.controller.setMode('ortho') // la escala exige proyección paralela
    // UCSORTHO (D2): las vistas ortogonales activan su UCS ortogonal; las isométricas no.
    if (sysvars.UCSORTHO && name in ORTHO_UCS) {
      const u = orthoUcs(name as OrthoUcsName)
      if (!sameUcs(u, this.ucs)) {
        this.setUcs(u)
        // Nombre del CAD clásico de la UCS ortogonal (*FRONT*…); la de TOP es la universal.
        this.cb.onUcsChange?.(u, name === 'TOP' ? 'World' : name[0] + name.slice(1).toLowerCase())
      }
    }
    this.orientGrid()
    this.fitExtents() // al fijar una vista, encuadrar el contenido (estilo CAD clásico)
  }
  /** Vista desde una dirección (arista o esquina del cubo desplegado): no cambia la UCS y encuadra. */
  setViewDir(az: number, el: number): void {
    if (this.kind === 'paper') return
    this.recordView()
    this.controller.setAngles(az, el)
    if (this.kind === 'floating') this.controller.setMode('ortho')
    this.orientGrid()
    this.fitExtents()
  }

  /** Vista en planta de una UCS (PLAN/UCSFOLLOW): mira por −Z con su Y hacia arriba y encuadra. */
  planView(u: Ucs): void {
    if (this.kind === 'paper') return
    this.recordView()
    this.controller.setPlan(ucsZ(u), [...u.y] as [number, number, number])
    this.orientGrid()
    this.fitExtents()
  }

  /** Derecha y arriba de la pantalla en mundo (para `UCS View`). */
  viewAxes(): { right: Vec3; up: Vec3 } {
    const cam = this.controller.camera
    cam.updateMatrixWorld()
    const r = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0)
    const u = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1)
    return { right: [r.x, r.y, r.z], up: [u.x, u.y, u.z] }
  }

  setMode(mode: CameraMode): void {
    if (this.kind !== 'model') return
    this.controller.setMode(mode)
  }

  /** Cámara actual (objetivo, orientación y alto visible). */
  getCamera(): CameraState {
    const c = this.controller
    const up = c.fixedUp
    return { target: [c.target.x, c.target.y, c.target.z], az: c.az, el: c.el, radius: c.radius, mode: c.mode, ...(up ? { up } : {}) }
  }

  // --- Navegación ---------------------------------------------------------------------------

  /**
   * Avisa que la vista está por cambiar, con la vista de antes: UNDO/REDO deshacen los cambios de
   * vista como en el CAD clásico. Lo asigna el store al registrar el viewport.
   */
  onViewRecorded: ((before: CameraState, ucs: Ucs) => void) | null = null
  /** Panel al que corresponde ("<paneles>-<índice>" del modelo, "paper:<layout>"): su vista se guarda con el dibujo. */
  paneKey: string | null = null

  /** Guarda la vista actual en el historial (antes de cambiarla), sin repetir la última. */
  recordView(): void {
    const s = this.getCamera()
    this.onViewRecorded?.(s, this.getUcs())
    const last = this.viewHistory[this.viewHistory.length - 1]
    if (last && JSON.stringify(last) === JSON.stringify(s)) return
    this.viewHistory.push(s)
    if (this.viewHistory.length > VIEW_HISTORY) this.viewHistory.shift()
  }

  /** ZOOM Previous: vuelve a la vista anterior. false si no hay. */
  zoomPrevious(): boolean {
    const s = this.viewHistory.pop()
    if (!s) return false
    this.onViewRecorded?.(this.getCamera(), this.getUcs())
    this.applyCamera(s)
    return true
  }

  /** Cantidad de vistas anteriores guardadas. */
  get previousViews(): number {
    return this.viewHistory.length
  }

  /** Alto visible actual (unidades de mundo), para `ZOOM Center` y `nX`. */
  viewHeight(): number {
    return this.controller.viewHeight
  }

  /** ZOOM Center: centro y alto visible. */
  zoomCenter(c: Pt, height: number): void {
    this.recordView()
    this.controller.target.set(c.x, c.y, c.z)
    this.controller.viewHeight = height
    this.invalidate()
  }

  /** ZOOM nX: el alto visible se divide por `f`, desde el centro de la vista. */
  zoomScale(f: number): void {
    if (!(f > 0)) return
    this.recordView()
    this.controller.viewHeight = this.controller.viewHeight / f
    this.invalidate()
  }

  /** Encuadra una caja (ZOOM Object/All). */
  zoomBox(min: Vec3, max: Vec3): void {
    this.recordView()
    this.controller.fitBounds(new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)), 1.05)
    this.invalidate()
  }

  /** -PAN: desplaza el dibujo `d` (la vista se mueve al revés). */
  panBy(d: Vec3): void {
    this.recordView()
    this.controller.target.set(this.controller.target.x - d[0], this.controller.target.y - d[1], this.controller.target.z - d[2])
    this.controller.update()
    this.invalidate()
  }

  /** Rectángulo visible en el plano del objetivo: centro, ejes de pantalla y tamaño (ZOOM Dynamic). */
  viewRect(): { center: Vec3; right: Vec3; up: Vec3; width: number; height: number } {
    const { right, up } = this.viewAxes()
    const h = this.controller.viewHeight
    const t = this.controller.target
    return { center: [t.x, t.y, t.z], right, up, width: (h * this.controller.pxWidth) / this.controller.pxHeight, height: h }
  }

  /** Caja de lo dibujado (la extensión), o null si no hay nada. */
  extentsBox(): { min: Vec3; max: Vec3 } | null {
    const box = new THREE.Box3().setFromObject(this.entityGroup)
    if (box.isEmpty() || ![box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(isFinite)) return null
    return { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] }
  }

  /** ¿La vista mira en planta (a lo largo de ±Z del mundo)? */
  isPlanView(): boolean {
    return Math.abs(Math.abs(this.controller.el) - Math.PI / 2) < 0.02
  }

  /** Rectángulo del XY del mundo que se ve en el viewport (para PLOT ▸ Display); null si no está en planta. */
  displayRect(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (!this.isPlanView()) return null
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const xs: number[] = []
    const ys: number[] = []
    for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const out = new THREE.Vector3()
      if (!this.controller.rayFromNdc(nx, ny).intersectPlane(plane, out)) return null
      xs.push(out.x)
      ys.push(out.y)
    }
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
  }

  /** Modo Realtime (ZOOM ↵ / PAN): `null` sale. */
  setRealtime(mode: 'zoom' | 'pan' | 'orbit' | 'forbit' | 'corbit' | null): void {
    this.spin = null
    if (mode && !this.realtime) {
      this.realtimeOrigin = this.getCamera()
      this.recordView()
    }
    this.realtime = mode
    this.renderer.domElement.style.cursor = mode === 'zoom' ? 'zoom-in' : mode === 'pan' ? 'grab' : mode ? 'move' : ''
  }

  /** *Zoom Original*: la vista al entrar en Realtime. */
  realtimeOriginal(): void {
    if (this.realtimeOrigin) this.applyCamera(this.realtimeOrigin)
  }

  /** Aplica una vista guardada (sin registrarla). */
  private applyCamera(s: CameraState): void {
    this.setCamera(s)
  }

  /** Vista que encuadra la ventana `a`–`b`, sin aplicarla ni registrarla (-VIEW Window). */
  windowState(a: Pt, b: Pt): CameraState {
    const saved = this.getCamera()
    const min = new THREE.Vector3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z) - 1)
    const max = new THREE.Vector3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z) + 1)
    this.controller.fitBounds(new THREE.Box3(min, max), 1.02)
    const s = this.getCamera()
    this.setCamera(saved)
    return s
  }

  /** UNDO/REDO de una vista: la aplica sin registrarla en el historial ni en la pila de deshacer. */
  undoView(s: CameraState): void {
    this.applyCamera(s)
  }

  /** Restaura una vista guardada (-VIEW Restore), registrando la actual para ZOOM Previous. */
  restoreView(s: CameraState): void {
    this.recordView()
    this.applyCamera(s)
  }

  /**
   * Fija la cámara desde afuera: viewport flotante ← su entidad VIEWPORT (siempre ortográfica) o panel
   * del modelo que se restaura al volver de un layout.
   */
  setCamera(s: CameraState): void {
    const c = this.controller
    c.target.set(s.target[0], s.target[1], s.target[2])
    c.az = s.az
    c.el = s.el
    c.radius = s.radius
    c.mode = this.kind === 'model' ? (s.mode ?? 'ortho') : 'ortho'
    c.fixedUp = s.up ?? null
    c.update()
    this.orientGrid()
    this.invalidate()
  }

  /** Bloquea la navegación propia (rueda/pan se derivan a `onLockedWheel`/`onLockedPan`). */
  setNavLocked(locked: boolean): void {
    this.navLocked = locked
  }

  /** Hoja del layout en mm (el papel la incluye en ZOOM Extents). */
  setSheet(w: number, h: number): void {
    this.sheet = { w, h }
  }

  /** Zoom de rueda hacia el punto de pantalla indicado (también lo usa el papel para la rueda derivada). */
  wheelZoom(clientX: number, clientY: number, deltaY: number): void {
    // Una tanda de rueda (sin pausa de 0,4 s) es un solo paso de ZOOM Previous.
    const now = performance.now()
    if (now - this.lastWheelAt > 400) this.recordView()
    this.lastWheelAt = now
    const [nx, ny] = this.ndc(clientX, clientY)
    const before = this.worldOnViewPlane(nx, ny)
    // ZOOMFACTOR (3–100, 60 = 1,1 por paso) y ZOOMWHEEL (1 = rueda hacia adelante aleja), como el CAD clásico.
    const k = 1 + Math.min(100, Math.max(3, sysvars.ZOOMFACTOR)) / 600
    const out = (deltaY > 0) !== (sysvars.ZOOMWHEEL === 1)
    this.controller.zoom(out ? k : 1 / k)
    const after = this.worldOnViewPlane(nx, ny)
    // Zoom hacia el cursor: mantiene fijo el punto bajo el cursor en CUALQUIER vista
    // (usa un plano que enfrenta la cámara a través del target, no el plano Z=0).
    if (before && after) {
      this.controller.target.add(before.sub(after))
      this.controller.update()
    }
  }

  /** Pan en píxeles de pantalla. */
  panPx(dx: number, dy: number): void {
    this.controller.pan(dx, dy)
  }

  /** Proyecta un punto de mundo a píxeles del canvas (para selección/snap en el store). */
  project(p: Pt): [number, number] | null {
    return this.controller.project(new THREE.Vector3(p.x, p.y, p.z))
  }

  /** Encuadra todo el contenido dibujado (ZOOM Extents). */
  zoomExtents(): void {
    this.recordView()
    this.fitExtents()
  }

  private fitExtents(): void {
    const box = new THREE.Box3().setFromObject(this.entityGroup)
    if (this.sheet) box.union(new THREE.Box3(new THREE.Vector3(0, 0, -1), new THREE.Vector3(this.sheet.w, this.sheet.h, 1)))
    // Bounds vacíos o NO finitos (una geometría degenerada puede dar NaN) → no romper la cámara.
    const finite =
      isFinite(box.min.x) && isFinite(box.min.y) && isFinite(box.min.z) &&
      isFinite(box.max.x) && isFinite(box.max.y) && isFinite(box.max.z)
    if (box.isEmpty() || !finite) {
      this.controller.target.set(0, 0, 0)
      this.controller.radius = 200
      this.controller.update()
      return
    }
    this.controller.fitBounds(box)
  }

  /** Encuadra el rectángulo definido por dos puntos de mundo (ZOOM Window). */
  zoomWindow(a: Pt, b: Pt): void {
    this.recordView()
    const min = new THREE.Vector3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z) - 1)
    const max = new THREE.Vector3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z) + 1)
    this.controller.fitBounds(new THREE.Box3(min, max), 1.02) // la ventana, casi sin margen
  }

  private attachEvents(): void {
    const el = this.renderer.domElement
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('dblclick', this.onDoubleClick)
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('wheel', this.onWheel, { passive: false })
    el.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  /** Coordenadas de píxel relativas al canvas (origen arriba-izquierda). */
  private pxOf(clientX: number, clientY: number): [number, number] {
    const rect = this.renderer.domElement.getBoundingClientRect()
    return [clientX - rect.left, clientY - rect.top]
  }

  private onPointerMove = (e: PointerEvent): void => {
    // Botón derecho: hasta moverse unos píxeles es un clic (menú contextual), no una órbita.
    const rd = this.rightDown
    if (this.dragging && rd && Math.hypot(e.clientX - rd[0], e.clientY - rd[1]) >= 4) this.rightDown = null
    if (this.dragging && !this.rightDown) {
      const dx = e.clientX - this.lastPan.x
      const dy = e.clientY - this.lastPan.y
      this.lastPan.set(e.clientX, e.clientY)
      if (this.navLocked) {
        if (this.dragging === 'pan') this.cb.onLockedPan?.(dx, dy)
      } else if (this.dragging === 'pan') this.controller.pan(dx, dy)
      else if (this.dragging === 'rtzoom') {
        // Zoom Realtime: subir medio alto de la ventana acerca al doble (bajar, aleja), desde el centro.
        this.controller.zoom(Math.pow(2, dy / Math.max(1, this.controller.pxHeight / 2)))
      } else if (this.dragging === 'forbit') this.controller.freeOrbit(dx, dy)
      else this.controller.orbit(dx, dy)
      this.lastDrag = { dx, dy }
    }
    const px = this.pxOf(e.clientX, e.clientY)
    this.lastPx[0] = px[0]
    this.lastPx[1] = px[1]
    this.updateDucs(e.clientX, e.clientY)
    const raw = this.screenToWorld(e.clientX, e.clientY)
    this.lastWorldRaw.x = raw.x
    this.lastWorldRaw.y = raw.y
    this.lastWorldRaw.z = raw.z
    // Object snap solo durante un prompt de punto (como el CAD clásico) → el hover en reposo no cuesta nada.
    const snapped = this.needSnap() ? this.snapAt(raw) : { point: raw, type: null as SnapType | null }
    this.snapResult = snapped
    this.updateTrackingAcquisition()
    this.lastWorld.x = snapped.point.x
    this.lastWorld.y = snapped.point.y
    this.lastWorld.z = snapped.point.z
    if (this.draggingBox && this.boxStartPx) {
      this.curPx = px
      const d = Math.hypot(px[0] - this.boxStartPx[0], px[1] - this.boxStartPx[1])
      if (d > 4) this.boxActive = true
    }
    // Hover de grips: resalta el grip bajo el cursor (verde). El cursor sigue siendo la cruz, como el CAD clásico
    // (antes aparecía la mano del navegador encima de la cruz).
    const prev = this.hoverGrip
    this.hoverGrip = this.grips.length ? this.gripAt(px) : -1
    if (this.hoverGrip !== prev) this.invalidate()
    // Re-dibuja solo si algo sigue al cursor: snap, rubber-band de comando, arrastre o caja de selección.
    if (this.dragging || this.draggingBox || this.data?.pointPrompt || this.needSnap()) this.invalidate()
    this.cb.onPointerMove?.(snapped.point)
  }

  /** Índice del grip cuyo centro proyectado cae más cerca del cursor (dentro del umbral), o −1. */
  private gripAt(px: [number, number]): number {
    let best = -1
    let bestD = 9
    for (let i = 0; i < this.grips.length; i++) {
      const pr = this.controller.project(new THREE.Vector3(...this.grips[i].grip.point))
      if (!pr) continue
      const d = Math.hypot(pr[0] - px[0], pr[1] - px[1])
      if (d <= bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }

  private onDoubleClick = (e: MouseEvent): void => {
    if (e.button !== 0) return
    const id = this.pickAt(e.clientX, e.clientY)
    const world = this.screenToWorld(e.clientX, e.clientY)
    if (id) this.cb.onEntityDoubleClick?.(id, world)
    else this.cb.onEmptyDoubleClick?.(world)
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.cb.onActivate?.() // este viewport pasa a ser el activo
    if (this.realtime && e.button === 2) {
      // Realtime: el clic derecho abre el menú del CAD clásico (Exit/Pan/Zoom/…).
      e.preventDefault()
      this.cb.onRealtimeMenu?.(e.clientX, e.clientY)
      return
    }
    if (this.realtime && e.button === 0) {
      this.spin = null // un clic detiene la órbita continua
      this.dragging = this.realtime === 'zoom' ? 'rtzoom' : this.realtime === 'pan' ? 'pan' : this.realtime === 'forbit' ? 'forbit' : 'orbit'
      this.lastPan.set(e.clientX, e.clientY)
      this.renderer.domElement.setPointerCapture(e.pointerId)
      if (this.realtime === 'pan') this.renderer.domElement.style.cursor = 'grabbing'
      e.preventDefault()
      return
    }
    if (e.button === 1) {
      // Doble clic con el botón central: ZOOM Extents (CAD clásico).
      const now = performance.now()
      if (now - this.lastMiddleDown < 350) {
        this.lastMiddleDown = 0
        this.zoomExtents()
        this.invalidate()
        e.preventDefault()
        return
      }
      this.lastMiddleDown = now
    }
    if (e.button === 2 && this.cb.onRightClickCommand?.()) {
      // Clic derecho con un prompt activo actúa como Enter (p. ej. TRIM: "todas las aristas cortan").
      e.preventDefault()
      return
    }
    if (e.button === 1 || e.button === 2) {
      // El CAD clásico: botón central = PAN, Shift + central = ORBIT; botón derecho = ORBIT.
      // El papel no orbita: cualquier arrastre lo desplaza.
      this.dragging = (e.button === 2 || e.shiftKey) && this.kind !== 'paper' ? 'orbit' : 'pan'
      if (!this.navLocked) this.recordView() // ZOOM Previous vuelve a la vista de antes del arrastre
      this.lastPan.set(e.clientX, e.clientY)
      this.rightDown = e.button === 2 ? [e.clientX, e.clientY] : null
      this.renderer.domElement.setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }
    if (e.button === 0 && this.cb.isSelectMode?.()) {
      // Si el cursor está sobre un grip de la selección, se "arma": el próximo click lo activa
      // (no se inicia una caja de selección).
      if (!this.cb.isCommandActive?.() && this.gripAt(this.pxOf(e.clientX, e.clientY)) >= 0) {
        this.gripArmed = true
        return
      }
      if (this.boxPending) return // el clic que cierra la ventana se resuelve al soltar
      this.boxStartPx = this.pxOf(e.clientX, e.clientY)
      this.curPx = this.boxStartPx
      this.draggingBox = true
      this.boxActive = false
    }
  }

  /** Cierra sin seleccionar la ventana abierta con un clic (Esc). */
  cancelPendingBox(): void {
    if (!this.boxPending) return
    this.boxPending = false
    this.boxActive = false
    this.boxStartPx = null
    this.boxEl.style.display = 'none'
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (this.realtime && e.button === 0 && this.dragging) {
      // 3DCORBIT: al soltar en movimiento, la vista sigue girando con esa velocidad hasta el próximo clic.
      if (this.realtime === 'corbit' && Math.hypot(this.lastDrag.dx, this.lastDrag.dy) > 0.5) this.spin = { ...this.lastDrag }
      this.dragging = null
      this.renderer.domElement.releasePointerCapture(e.pointerId)
      if (this.realtime === 'pan') this.renderer.domElement.style.cursor = 'grab'
      return
    }
    if (this.dragging && (e.button === 1 || e.button === 2)) {
      this.dragging = null
      this.invalidate() // siluetas pendientes de la órbita
      this.renderer.domElement.releasePointerCapture(e.pointerId)
      const down = this.rightDown
      this.rightDown = null
      // Clic derecho sin arrastre: menú contextual (la órbita sólo cambió unos píxeles, se mantiene).
      if (e.button === 2 && down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 4) {
        this.cb.onContextMenu?.(e.clientX, e.clientY, this.screenToWorld(e.clientX, e.clientY))
      }
      return
    }
    if (e.button === 0 && this.gripArmed) {
      // Un clic sobre un grip lo activa e inicia la edición (define el punto final luego).
      this.gripArmed = false
      const gi = this.gripAt(this.pxOf(e.clientX, e.clientY))
      if (gi >= 0 && this.grips[gi]) {
        this.cb.onGripActivate?.(this.grips[gi].entityId, this.grips[gi].grip)
        return
      }
      // El cursor se salió del grip: cae al comportamiento normal de click.
    }
    if (e.button === 0) {
      const start = this.boxStartPx
      const cur0 = this.pxOf(e.clientX, e.clientY)
      // Clic simple en vacío en modo selección: abre la ventana (la otra esquina va con el próximo clic).
      const forced = this.cb.selectionArea?.() ?? null
      if (!this.boxPending && !this.boxActive && start && this.cb.isSelectMode?.() && (forced || !this.pickAt(e.clientX, e.clientY))) {
        this.boxPending = true
        this.boxActive = true
        this.draggingBox = true
        this.curPx = cur0
        this.updateBox()
        return
      }
      if (this.boxPending) this.boxPending = false
      if (this.boxActive && this.boxStartPx) {
        const cur = this.pxOf(e.clientX, e.clientY)
        this.cb.onBoxSelect?.(
          {
            minX: Math.min(this.boxStartPx[0], cur[0]),
            maxX: Math.max(this.boxStartPx[0], cur[0]),
            minY: Math.min(this.boxStartPx[1], cur[1]),
            maxY: Math.max(this.boxStartPx[1], cur[1]),
          },
          forced ? forced === 'crossing' : cur[0] < this.boxStartPx[0], // derecha→izquierda = crossing
          e.shiftKey,
        )
      } else {
        this.updateDucs(e.clientX, e.clientY)
        const raw = this.screenToWorld(e.clientX, e.clientY)
        const snap = this.snapAt(raw)
        const snapped = snap.type !== null && snap.type !== 'grid'
        const deferred: Deferred | undefined = snap.deferred ? { ...snap.deferred, hint: [snap.point.x, snap.point.y, snap.point.z] } : undefined
        // Snap sobre geometría del modelo vista desde el papel: ese es el objeto tocado (trans-espacial).
        const extra = snapped && snap.owner && this.data?.snapExtras?.some((x) => x.id === snap.owner) ? snap.owner : null
        this.cb.onClick?.(snap.point, extra ?? this.pickAt(e.clientX, e.clientY), snapped, e.shiftKey, raw, deferred, this.ducsFace?.ucs)
      }
      this.boxStartPx = null
      this.draggingBox = false
      this.boxActive = false
      this.boxEl.style.display = 'none'
    }
  }

  /** Dibuja/oculta el rectángulo de goma (overlay HTML en píxeles, correcto en cualquier vista). */
  private updateBox(): void {
    if (!this.boxActive || !this.boxStartPx) {
      this.boxEl.style.display = 'none'
      return
    }
    const [sx, sy] = this.boxStartPx
    const [cx, cy] = this.curPx
    const forced = this.cb.selectionArea?.() ?? null
    const crossing = forced ? forced === 'crossing' : cx < sx
    this.boxEl.style.display = 'block'
    this.boxEl.style.left = `${Math.min(sx, cx)}px`
    this.boxEl.style.top = `${Math.min(sy, cy)}px`
    this.boxEl.style.width = `${Math.abs(cx - sx)}px`
    this.boxEl.style.height = `${Math.abs(cy - sy)}px`
    this.boxEl.style.borderStyle = crossing ? 'dashed' : 'solid'
    this.boxEl.style.borderColor = crossing ? '#33ff66' : '#3399ff'
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    if (this.navLocked) this.cb.onLockedWheel?.(e)
    else this.wheelZoom(e.clientX, e.clientY, e.deltaY)
  }

  /** Punto de mundo bajo (nx,ny) sobre el plano que pasa por el target y enfrenta la cámara. */
  private worldOnViewPlane(nx: number, ny: number): THREE.Vector3 | null {
    const ray = this.controller.rayFromNdc(nx, ny)
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      this.controller.viewDirection(),
      this.controller.target,
    )
    const out = new THREE.Vector3()
    return ray.intersectPlane(plane, out) ? out : null
  }

  private ndc(clientX: number, clientY: number): [number, number] {
    const rect = this.renderer.domElement.getBoundingClientRect()
    return [((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1)]
  }

  /**
   * Plano de dibujo: el XY de la UCS del viewport, por su origen (CAD clásico). Si la vista lo mira
   * de canto (< ~1°), el plano perpendicular a la vista por el origen de la UCS (desvío D3: en el CAD clásico los
   * puntos quedan indefinidos).
   */
  private edgeOn(): boolean {
    const z = ucsZ(this.ucs)
    const v = this.controller.viewDirection()
    return Math.abs(z[0] * v.x + z[1] * v.y + z[2] * v.z) < 0.02
  }

  /** Normal del eje del mundo más cercano a la vista, hacia el observador (respaldo de vista de canto). */
  private viewAxisNormal(): Vec3 {
    const v = this.controller.viewDirection()
    const [ax, ay, az] = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)]
    const n: Vec3 = az >= ax && az >= ay ? [0, 0, 1] : ay >= ax ? [0, 1, 0] : [1, 0, 0]
    return n[0] * v.x + n[1] * v.y + n[2] * v.z > 0 ? [-n[0], -n[1], -n[2]] : n
  }

  /** Normal del plano de dibujo: la Z de la UCS (eje de extrusión de primitivas, normal de círculos…). */
  constructionNormal(): Vec3 {
    return this.edgeOn() ? this.viewAxisNormal() : ucsZ(this.ucs)
  }

  /** Normal de la anotación nueva: con la UCS 3D es la misma Z de la UCS. */
  facingNormal(): Vec3 {
    return this.constructionNormal()
  }

  /** Rayo de picking por el punto de mundo `p`: origen, dirección unitaria y ~8 px de tolerancia. */
  viewRay(p: Pt): { origin: Vec3; dir: Vec3; tol: number } {
    const v = new THREE.Vector3(p.x, p.y, p.z).project(this.controller.camera)
    const { origin: o, direction: d } = this.controller.rayFromNdc(v.x, v.y)
    return { origin: [o.x, o.y, o.z], dir: [d.x, d.y, d.z], tol: 8 * (this.controller.worldPerPx() || 1) }
  }

  /** Orienta la grilla al plano de dibujo (el XY de la UCS, con su X) y la ubica en el origen de la UCS. */
  private orientGrid(): void {
    const n = this.constructionNormal()
    // GridHelper nace en el plano XZ (normal +Y): local X → X de la UCS, local Y → normal, local Z → −Y.
    const ux = this.edgeOn() ? arcBasis(n).u : this.ucs.x
    const x = new THREE.Vector3(...ux)
    const y = new THREE.Vector3(...n)
    const z = new THREE.Vector3().crossVectors(x, y)
    this.grid.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
    const o = this.ucs.origin
    this.grid.position.set(o.x, o.y, o.z)
  }

  /**
   * UCS dinámica (UCSDETECT): durante el primer punto de un comando de dibujo, la cara plana de
   * un sólido bajo el cursor fija temporalmente el plano de dibujo y se resalta (como el CAD clásico).
   */
  private updateDucs(clientX: number, clientY: number): void {
    const prev = this.ducsFace
    this.ducsFace = null
    if (this.kind === 'model' && this.data?.ducs) {
      const layers = new Map(this.data.layers.map((l) => [l.id, l]))
      const solids = this.data.entities.filter((e) => e.type === 'SOLID3D' && layerEditable(layers.get(e.layer)))
      if (solids.length) {
        const [nx, ny] = this.ndc(clientX, clientY)
        const ray = this.controller.rayFromNdc(nx, ny)
        const hit = faceUcsAt(solids, [ray.origin.x, ray.origin.y, ray.origin.z], [ray.direction.x, ray.direction.y, ray.direction.z], 0, this.ucs.x)
        if (hit?.planar) this.ducsFace = hit
      }
    }
    const key = (f: FaceHit | null) => (f ? `${f.solidId}|${f.face}` : '')
    if (key(prev) === key(this.ducsFace)) return
    this.disposeGroup(this.ducsGroup)
    if (this.ducsFace) {
      const pos: number[] = []
      for (const l of this.ducsFace.outline) for (let i = 0; i + 1 < l.length; i++) pos.push(...l[i], ...l[i + 1])
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      const seg = new THREE.LineSegments(g, new THREE.LineDashedMaterial({ color: 0x55c8ff, dashSize: 4 * (this.controller.worldPerPx() || 1), gapSize: 3 * (this.controller.worldPerPx() || 1), depthTest: false }))
      seg.computeLineDistances()
      this.ducsGroup.add(seg)
    }
    this.invalidate()
  }

  private constructionPlane(): THREE.Plane {
    // UCS dinámica: el cursor se mueve sobre la cara plana del sólido que tiene debajo.
    const u = this.ducsFace?.ucs ?? null
    const o = u ? u.origin : this.ucs.origin
    const origin = new THREE.Vector3(o.x, o.y, o.z)
    const n = u ? ucsZ(u) : this.constructionNormal()
    return new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(n[0], n[1], n[2]), origin)
  }

  screenToWorld(clientX: number, clientY: number): Pt {
    const [nx, ny] = this.ndc(clientX, clientY)
    const ray = this.controller.rayFromNdc(nx, ny)
    const out = new THREE.Vector3()
    if (ray.intersectPlane(this.constructionPlane(), out)) return { x: out.x, y: out.y, z: out.z }
    return { x: this.lastWorldRaw.x, y: this.lastWorldRaw.y, z: this.lastWorldRaw.z }
  }

  pickAt(clientX: number, clientY: number): string | null {
    this.raycaster.params.Line = { threshold: 6 * this.controller.worldPerPx() }
    this.raycaster.params.Points = { threshold: 5 * this.controller.worldPerPx() }
    // El pick ve las dos caras de cada triángulo (una booleana puede dejar caras invertidas) y usa esferas
    // envolventes al día (un sólido recalculado conserva la geometría con otra forma): si no, a veces un clic
    // sobre un sólido no lo tomaba y había que seleccionarlo con una ventana.
    const sides = new Map<THREE.Material, THREE.Side>()
    this.entityGroup.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere() // sólo las nuevas (antes: todas en cada clic)
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        if (!sides.has(mat)) sides.set(mat, mat.side)
        mat.side = THREE.DoubleSide
      }
    })
    const cast = (x: number, y: number) => {
      const [nx, ny] = this.ndc(x, y)
      this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.controller.camera)
      return this.raycaster.intersectObjects(this.entityGroup.children, true)
    }
    let hits = cast(clientX, clientY)
    // Un rayo que pasa justo por una arista de la teselación (p. ej. el vértice superior de un cilindro
    // horizontal visto en planta, en x = 0) puede no tocar ningún triángulo por redondeo: se reintenta
    // corrido un píxel.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (hits.length) break
      hits = cast(clientX + dx, clientY + dy)
    }
    sides.forEach((side, mat) => (mat.side = side))
    const found: { id: string; h: THREE.Intersection }[] = []
    for (const h of hits) {
      // Geometría fusionada (batch): resolver el id por el rango del triángulo/segmento impactado.
      let id: string | null
      if (h.object.userData.pointIds) id = (h.object.userData.pointIds as string[])[h.index ?? -1] ?? null
      else if (h.object.userData.ranges) id = this.resolveRange(h.object, h)
      else {
        let obj: THREE.Object3D | null = h.object
        while (obj && !obj.userData.entityId) obj = obj.parent
        id = (obj?.userData.entityId as string | undefined) ?? null
      }
      // Las capas congeladas o bloqueadas se ven pero no se seleccionan: el clic sigue hacia lo que está detrás.
      if (id && !this.unpickable.has(id)) found.push({ id, h })
    }
    if (found.length === 0) return this.solidUnder(clientX, clientY)
    // Orden de capas: entre lo que está a la misma profundidad (p. ej. todo el dibujo 2D) gana
    // la capa de más arriba; dentro de la capa, lo más cercano al cursor y después lo más nuevo.
    const tol = 3 * this.controller.worldPerPx() + 1e-9
    const d0 = found[0].h.distance
    const [cx, cy] = this.pxOf(clientX, clientY)
    const px = (p: THREE.Vector3): number => {
      const pr = this.controller.project(p)
      return pr ? Math.hypot(pr[0] - cx, pr[1] - cy) : Infinity
    }
    const near = found.filter((f) => f.h.distance <= d0 + tol)
    // El relleno de un sombreado sólo gana si no hay una línea cerca del cursor.
    const low = (f: { h: THREE.Intersection }): number => (f.h.object.userData.lowPick ? 1 : 0)
    near.sort((a, b) => {
      if (low(a) !== low(b)) return low(a) - low(b)
      const oa = this.pickOrder.get(a.id)
      const ob = this.pickOrder.get(b.id)
      return (ob?.o ?? -Infinity) - (oa?.o ?? -Infinity) || px(a.h.point) - px(b.h.point) || (ob?.i ?? 0) - (oa?.i ?? 0)
    })
    return near[0].id
  }

  /**
   * Sólido bajo el cursor por sus caras (topología), para un clic dentro de la pieza aunque no se dibujen sus caras
   * (estilos de alambre) o la malla no se haya impactado.
   */
  private solidUnder(clientX: number, clientY: number): string | null {
    const d = this.data
    if (!d) return null
    const solids = d.entities.filter((e) => e.type === 'SOLID3D' && !this.unpickable.has(e.id) && layerVisible(d.layers.find((l) => l.id === e.layer)))
    if (!solids.length) return null
    const [nx, ny] = this.ndc(clientX, clientY)
    const ray = this.controller.rayFromNdc(nx, ny)
    const o: Vec3 = [ray.origin.x, ray.origin.y, ray.origin.z]
    const dir: Vec3 = [ray.direction.x, ray.direction.y, ray.direction.z]
    let best: { id: string; t: number } | null = null
    for (const e of solids) {
      if (e.type !== 'SOLID3D') continue
      const topo = solidTopology(e.props)
      if (!topo) continue
      for (const h of rayFaces(topo, o, dir)) if (!best || h.t < best.t) best = { id: e.id, t: h.t }
    }
    return best?.id ?? null
  }

  private resize(): void {
    this.width = Math.max(1, this.container.clientWidth)
    this.height = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(this.width, this.height, false)
    this.lineweightZoom = -1
    this.controller.setSize(this.width, this.height)
  }

  /** Marca la escena como "sucia" → se re-dibuja en el próximo tick. */
  private invalidate(): void {
    this.dirty = true
  }

  /** ¿El snap está activo ahora? (solo durante un prompt de punto/distancia, como el CAD clásico). */
  private needSnap(): boolean {
    const d = this.data
    return !!d && d.pointPrompt && (d.esnap || d.osnapOverride !== null || d.otrack || !!(d.polarAng && d.snapBase && !d.ortho))
  }

  private entities(): Entity[] {
    const d = this.data
    if (!d) return []
    if (!this.expanded) this.expanded = expandEntities(d.entities, d.blocks, { attdisp: d.attdisp })
    return this.expanded
  }

  /** Esfera envolvente (mundo) de una entidad, para descartarla rápido si está lejos del cursor. */
  private snapSpheresFor(ents: Entity[]): { c: THREE.Vector3; r: number }[] {
    if (this.snapSpheres && this.snapSpheres.length === ents.length) return this.snapSpheres
    const out = ents.map((e) => {
      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
      for (const poly of entityOutline(e)) {
        for (const p of poly) {
          minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); minZ = Math.min(minZ, p.z)
          maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); maxZ = Math.max(maxZ, p.z)
        }
      }
      if (!isFinite(minX)) return { c: new THREE.Vector3(), r: Infinity } // sin contorno → nunca se descarta
      const c = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2)
      return { c, r: Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2 }
    })
    this.snapSpheres = out
    return out
  }

  private snapAt(raw: Pt): SnapResult {
    // Datos al día: entre un comando que cambia capas y el próximo frame el cursor ya puede pedir snaps.
    const d = (this.data = this.provider?.() ?? this.data)
    if (!d) return { point: raw, type: null }
    const override = d.osnapOverride
    // Las capas apagadas o congeladas no dan snaps: la lista se rehace si cambian los datos o la visibilidad.
    const hidden = hiddenLayerIds(d.layers)
    const listKey = `${d.revision}|${[...hidden].join(',')}|${d.snapExtras?.length ?? 0}`
    if (this.snapListKey !== listKey || this.snapLiveRef !== d.snapLive) {
      this.snapLiveRef = d.snapLive
      this.snapListKey = listKey
      this.snapList = null
      this.snapSpheres = null
    }
    if (!this.snapList) {
      const own = hidden.size ? this.entities().filter((e) => !hidden.has(e.layer)) : this.entities()
      this.snapList = own.concat(d.snapExtras ?? [], d.snapLive ?? [])
    }
    const all = this.snapList
    // Culling espacial: solo las entidades cuya esfera proyectada cae cerca del cursor (clave para
    // modelos pesados: evita generar candidatos de snap sobre miles de objetos lejanos).
    const spheres = this.snapSpheresFor(all)
    const wpp = this.controller.worldPerPx() || 1
    const [cx, cy] = this.lastPx
    const near: Entity[] = []
    for (let i = 0; i < all.length; i++) {
      const s = spheres[i]
      if (!isFinite(s.r)) { near.push(all[i]); continue }
      const pr = this.controller.project(s.c)
      if (!pr) continue
      if (Math.hypot(pr[0] - cx, pr[1] - cy) <= s.r / wpp + 16) near.push(all[i])
    }
    const result = computeSnap(raw, near, {
      gridSnap: d.gridSnap,
      gridStep: d.gridStep,
      esnap: override ? true : d.esnap,
      ucs: d.ucs,
      osnap: override ? singleOsnap(override) : d.osnap,
      explicitOsnap: !!override,
      base: d.snapBase,
      cursorPx: this.lastPx,
      pixelThreshold: 10,
      project: (p) => this.controller.project(new THREE.Vector3(p.x, p.y, p.z)),
      depth: (p) => this.controller.camera.position.distanceTo(new THREE.Vector3(p.x, p.y, p.z)),
    })

    // INT/APPINT sobre el tramo en curso: con ORTHO la dirección del rubber-band queda fija y se marcan sus cruces
    // con los objetos cercanos (las intersecciones "que se vienen" mientras se dibuja).
    const os = override ? singleOsnap(override) : d.osnap
    if (d.ortho && d.snapBase && (override || d.esnap) && (os.intersection || os.apparentIntersection)) {
      const hit = this.orthoCrossing(raw, d.snapBase, near)
      // Gana el marcador más cercano al cursor (p. ej. el cruce con un círculo antes que su centro).
      const px = (p: Pt) => {
        const pr = this.controller.project(new THREE.Vector3(p.x, p.y, p.z))
        return pr ? Math.hypot(pr[0] - this.lastPx[0], pr[1] - this.lastPx[1]) : Infinity
      }
      if (hit && (result.type === null || result.type === 'grid' || px(hit) < px(result.point))) {
        this.trackLines = []
        return { point: hit, type: 'intersection' }
      }
    }

    // Object snap tracking: los osnaps directos ganan; el tracking sólo actúa cuando no hay captura
    // (o sólo hay grilla), como en el CAD clásico.
    this.trackLines = []
    // Rastreo polar (POLAR): cerca (10 px) de un múltiplo de POLARANG desde el punto base, el cursor corre por ese
    // rayo, punteado, y lo tecleado como distancia va en esa dirección. Los osnaps directos ganan.
    if (d.polarAng && d.snapBase && d.pointPrompt && !d.ortho && (result.type === null || result.type === 'grid')) {
      const polar = this.polarTrack(raw, d.snapBase, d.polarAng)
      if (polar) {
        this.trackLines = [polar.line]
        return { point: polar.point, type: 'tracking' }
      }
    }
    if (d.otrack && this.tracked.length > 0 && (result.type === null || result.type === 'grid')) {
      const track = computeTracking(raw, this.tracked, {
        cursorPx: this.lastPx,
        project: (p) => this.controller.project(new THREE.Vector3(p.x, p.y, p.z)),
        pixelThreshold: 10,
        axes: this.trackingAxes(),
        entities: near,
        lineLength: 400 * (this.controller.worldPerPx() || 1),
      })
      if (track) {
        this.trackLines = track.lines
        return { point: track.point, type: 'tracking' }
      }
    }
    return result
  }

  /**
   * Cruce de la recta de ORTHO desde `base` (el eje de la UCS más cercano a la dirección del cursor) con los
   * objetos, si cae a menos de 10 px del cursor. Rectas exactas; círculos y arcos, analíticos.
   */
  private orthoCrossing(raw: Pt, base: Pt, ents: Entity[]): Pt | null {
    const asPt = (a: Vec3): Pt => ({ x: a[0], y: a[1], z: a[2] })
    const [ux, uy] = [asPt(this.ucs.x), asPt(this.ucs.y)]
    const d = { x: raw.x - base.x, y: raw.y - base.y, z: raw.z - base.z }
    const dotv = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y + a.z * b.z
    const dir = Math.abs(dotv(d, ux)) >= Math.abs(dotv(d, uy)) ? ux : uy
    const along = (t: number): Pt => ({ x: base.x + dir.x * t, y: base.y + dir.y * t, z: base.z + dir.z * t })
    const cursorT = dotv(d, dir)
    const cands: number[] = []
    for (const e of ents) {
      if ((e.type === 'CIRCLE' || e.type === 'ARC') && Math.abs(e.props.normal?.[2] ?? 1) > 1 - 1e-9 && Math.abs(dir.z) < 1e-9) {
        // |base + t·dir − c|² = r² (en el plano XY).
        const [cx, cy] = e.props.center
        const fx = base.x - cx
        const fy = base.y - cy
        const b = fx * dir.x + fy * dir.y
        const disc = b * b - (fx * fx + fy * fy - e.props.radius * e.props.radius)
        if (disc < 0) continue
        for (const t of [-b - Math.sqrt(disc), -b + Math.sqrt(disc)]) {
          if (e.type === 'ARC') {
            const p = along(t)
            const segs = segmentsOfEntity(e)
            const onArc = segs.some(([a, q]) => distToSegment(p, a, q) < e.props.radius * 0.02)
            if (!onArc) continue
          }
          cands.push(t)
        }
        continue
      }
      for (const [a, q] of segmentsOfEntity(e)) {
        // Recta base+t·dir contra el segmento a→q, en el plano de la UCS.
        const ex = { x: q.x - a.x, y: q.y - a.y, z: q.z - a.z }
        const n = { x: dir.y * ex.z - dir.z * ex.y, y: dir.z * ex.x - dir.x * ex.z, z: dir.x * ex.y - dir.y * ex.x }
        const nn = dotv(n, n)
        if (nn < 1e-18) continue // paralelos
        const w = { x: a.x - base.x, y: a.y - base.y, z: a.z - base.z }
        const c1 = { x: w.y * ex.z - w.z * ex.y, y: w.z * ex.x - w.x * ex.z, z: w.x * ex.y - w.y * ex.x }
        const c2 = { x: w.y * dir.z - w.z * dir.y, y: w.z * dir.x - w.x * dir.z, z: w.x * dir.y - w.y * dir.x }
        const t = dotv(c1, n) / nn
        const s = dotv(c2, n) / nn
        if (s < -1e-9 || s > 1 + 1e-9) continue
        const p = along(t)
        const pq = { x: a.x + ex.x * s, y: a.y + ex.y * s, z: a.z + ex.z * s }
        if (Math.hypot(p.x - pq.x, p.y - pq.y, p.z - pq.z) > 1e-6 * Math.max(1, Math.hypot(ex.x, ex.y, ex.z))) continue // se cruzan en el espacio
        cands.push(t)
      }
    }
    let best: Pt | null = null
    let bestPx = 10
    const c0 = along(cursorT)
    const cur = this.controller.project(new THREE.Vector3(c0.x, c0.y, c0.z))
    if (!cur) return null
    for (const t of cands) {
      if (Math.abs(t) < 1e-9) continue // el propio punto base
      const p = along(t)
      const pr = this.controller.project(new THREE.Vector3(p.x, p.y, p.z))
      if (!pr) continue
      const dpx = Math.hypot(pr[0] - cur[0], pr[1] - cur[1])
      if (dpx <= bestPx) {
        bestPx = dpx
        best = p
      }
    }
    return best
  }

  /** Ejes (mundo) de las alineaciones de tracking: los ejes X/Y de la UCS del viewport. */
  /** Rayo polar más cercano al cursor desde `base` (en el plano de la UCS), si pasa a menos de 10 px. */
  private polarTrack(raw: Pt, base: Pt, stepDeg: number): { point: Pt; line: [Pt, Pt] } | null {
    const [ux, uy] = this.trackingAxes()
    const d = { x: raw.x - base.x, y: raw.y - base.y, z: raw.z - base.z }
    const lx = d.x * ux.x + d.y * ux.y + d.z * ux.z
    const ly = d.x * uy.x + d.y * uy.y + d.z * uy.z
    if (Math.hypot(lx, ly) < 1e-9) return null
    const step = (Math.max(0.1, stepDeg) * Math.PI) / 180
    const a = Math.round(Math.atan2(ly, lx) / step) * step
    const dir = { x: ux.x * Math.cos(a) + uy.x * Math.sin(a), y: ux.y * Math.cos(a) + uy.y * Math.sin(a), z: ux.z * Math.cos(a) + uy.z * Math.sin(a) }
    const t = d.x * dir.x + d.y * dir.y + d.z * dir.z
    if (t <= 0) return null
    const point = { x: base.x + dir.x * t, y: base.y + dir.y * t, z: base.z + dir.z * t }
    const pp = this.controller.project(new THREE.Vector3(point.x, point.y, point.z))
    if (!pp || Math.hypot(pp[0] - this.lastPx[0], pp[1] - this.lastPx[1]) > 10) return null
    const far = t + 400 * (this.controller.worldPerPx() || 1)
    return { point, line: [base, { x: base.x + dir.x * far, y: base.y + dir.y * far, z: base.z + dir.z * far }] }
  }

  private trackingAxes(): [Pt, Pt] {
    const [x, y] = [this.ucs.x, this.ucs.y]
    return [{ x: x[0], y: x[1], z: x[2] }, { x: y[0], y: y[1], z: y[2] }]
  }

  /**
   * Adquisición de puntos para el tracking: detenerse (~600 ms) sobre un punto de snap lo adquiere;
   * volver a detenerse sobre uno adquirido lo libera (CAD clásico). Máximo 3 puntos vivos.
   */
  private updateTrackingAcquisition(): void {
    const d = this.data
    if (!d?.otrack || !d.pointPrompt) return
    const { type, point } = this.snapResult
    if (!type || type === 'grid' || type === 'tracking') {
      this.hoverKey = ''
      this.hoverConsumed = false
      return
    }
    const key = `${point.x.toFixed(4)},${point.y.toFixed(4)},${point.z.toFixed(4)}`
    const now = performance.now()
    if (key !== this.hoverKey) {
      this.hoverKey = key
      this.hoverSince = now
      this.hoverConsumed = false
      return
    }
    if (this.hoverConsumed || now - this.hoverSince < 600) return
    this.hoverConsumed = true
    const i = this.tracked.findIndex((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}` === key)
    if (i >= 0) this.tracked.splice(i, 1) // ya estaba: se libera
    else {
      this.tracked.push({ x: point.x, y: point.y, z: point.z })
      if (this.tracked.length > 3) this.tracked.shift()
    }
    this.invalidate()
  }

  /** Orienta las luces respecto de la cámara: la principal desde arriba a la izquierda del observador, la de relleno
   *  desde abajo a la derecha. */
  private aimLights(): void {
    const cam = this.controller.camera
    const place = (l: THREE.DirectionalLight, x: number, y: number, z: number) => {
      l.position.set(x, y, z).applyQuaternion(cam.quaternion).add(cam.position)
      l.target.position.copy(cam.position)
      l.target.updateMatrixWorld()
    }
    place(this.keyLight, -0.45, 0.6, 1)
    place(this.fillLight, 0.6, -0.5, 0.4)
  }

  /** Limpia los puntos adquiridos (al terminar el comando o con ESC). */
  clearTracking(): void {
    if (this.tracked.length === 0 && this.trackLines.length === 0) return
    this.tracked = []
    this.trackLines = []
    this.invalidate()
  }

  private disposeGroup(group: THREE.Group): void {
    group.traverse((obj) => {
      const any = obj as unknown as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] }
      if (!obj.userData.cachedGeom) any.geometry?.dispose()
      // Los materiales compartidos de los overlays (preview, snap, tracking) se reutilizan en el próximo
      // cuadro: liberarlos obligaría a recompilar su programa en cada movimiento del cursor.
      if (any.material && !this.overlayMaterials.has(any.material as THREE.Material)) {
        if (Array.isArray(any.material)) any.material.forEach((m) => m.dispose())
        else any.material.dispose()
      }
    })
    group.clear()
  }

  private entityLinePoints(e: Entity): THREE.Vector3[] | null {
    switch (e.type) {
      case 'POINT':
        return null // se dibuja con su marca (pointsLayer), no como línea
      case 'LINE':
        return [new THREE.Vector3(...e.props.start), new THREE.Vector3(...e.props.end)]
      case 'CIRCLE':
        // En el plano de su normal (círculos en cualquier UCS).
        return tessellateArc({ ...e.props, startAngle: 0, endAngle: 0 }, 96).map((p) => new THREE.Vector3(p[0], p[1], p[2]))
      case 'ARC':
        // Tesselación proporcional al barrido: un arco chico no gasta los 96 del círculo completo.
        return tessellateArc(e.props).map((v) => new THREE.Vector3(...v))
      case 'ELLIPSE':
        return ellipsePoints(e.props, 96, true).map((v) => new THREE.Vector3(...v))
      case 'RECTANGLE': {
        const [x, y, z] = e.props.corner
        const w = e.props.width
        const h = e.props.height
        return [
          new THREE.Vector3(x, y, z),
          new THREE.Vector3(x + w, y, z),
          new THREE.Vector3(x + w, y + h, z),
          new THREE.Vector3(x, y + h, z),
          new THREE.Vector3(x, y, z),
        ]
      }
      case 'POLYLINE':
        // `polylinePoints` tessela los tramos con bulge y ya cierra el anillo si corresponde.
        return polylinePoints(e.props).map((v) => new THREE.Vector3(...v))
      case 'SPLINE': {
        if (e.props.controlPoints.length < 2) return null
        const cps = e.props.controlPoints.map((v) => new THREE.Vector3(...v))
        return new THREE.CatmullRomCurve3(cps).getPoints(Math.max(32, cps.length * 16))
      }
      case 'VIEWPORT':
        return viewportRing(e.props).map((v) => new THREE.Vector3(...v))
      case 'ATTDEF':
        return null
      case 'SOLID3D':
      case 'MESH3D':
      case 'DIMENSION':
      case 'TEXT':
      case 'INSERT':
      case 'HATCH':
      case 'SHADE':
        return null
    }
  }

  /**
   * Cota: líneas, rellenos (flechas) y el texto vectorial como trazos en el plano de la cota,
   * así escala con el zoom igual que el resto del dibujo (sin overlay HTML ni tamaño mínimo).
   */
  private buildDimension(e: DimensionEntity, color: THREE.Color): THREE.Object3D {
    const fields = this.data?.fields
    const t = e.props.textOverride
    const props = fields && t && hasFields(t) ? { ...e.props, textOverride: evaluateFields(t, fields) } : e.props
    const d = dimDisplay(props, { annoScale: this.data?.annoScale })
    // Object3D y no Group: un Group reinicia el `groupOrder` de three y rompería el orden de capas.
    const group = new THREE.Object3D()
    group.userData.entityId = e.id
    const pts: number[] = []
    for (const [s, en] of d.lines) pts.push(s[0], s[1], s[2], en[0], en[1], en[2])
    for (const st of d.textStrokes) for (let i = 0; i + 1 < st.length; i++) pts.push(...st[i], ...st[i + 1])
    if (pts.length > 0) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
      const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }))
      lines.userData.entityId = e.id
      group.add(lines)
    }
    const tri: number[] = []
    for (const poly of d.fills) for (let i = 1; i + 1 < poly.length; i++) tri.push(...poly[0], ...poly[i], ...poly[i + 1])
    if (tri.length > 0) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3))
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }))
      mesh.userData.entityId = e.id
      group.add(mesh)
    }
    return group
  }

  /** Construye una entidad TEXT: overlay HTML (texto visible que escala con el zoom) + un plano
   *  invisible sobre su caja para poder seleccionarlo con click (pickAt). */
  private buildText(e: import('../core/document/types').TextEntity, color: THREE.Color, selected: boolean): void {
    const fields = this.data?.fields
    const segments = fields && hasFields(e.props.text) ? fieldSegments(e.props.text, fields) : null
    // Con campos: la caja de selección se mide sobre el texto evaluado.
    const t = segments ? { ...e.props, text: segments.map((s) => s.text).join('') } : e.props
    const el = document.createElement('div')
    if (segments) {
      // FIELDDISPLAY=1: los campos evaluados llevan fondo gris (sólo en pantalla, no se plotea).
      for (const s of segments) {
        const span = document.createElement('span')
        span.textContent = s.text
        if (s.field) span.style.background = 'rgba(140,140,140,0.45)'
        el.appendChild(span)
      }
    } else el.textContent = t.text
    el.style.cssText =
      `position:absolute;pointer-events:none;white-space:pre;font-family:monospace;line-height:${LINE_SPACING};` +
      `text-align:${t.justify};transform-origin:top left;color:${selected ? '#00e5ff' : '#' + color.getHexString()};z-index:4`
    this.container.appendChild(el)
    const ax = textAxes(t)
    this.textLabels.push({
      el,
      pos: new THREE.Vector3(...textTop(t)),
      height: t.height,
      u: new THREE.Vector3(...ax.u),
      v: new THREE.Vector3(...ax.v),
      justify: t.justify,
    })
    // Plano invisible (2 triángulos sobre la caja) para selección por click.
    const c = textCorners(t)
    const pos = [...c[0], ...c[1], ...c[2], ...c[0], ...c[2], ...c[3]]
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    const mesh = new THREE.Mesh(
      geom,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    )
    mesh.userData.entityId = e.id
    this.entityGroup.add(mesh)
  }

  private clearTextLabels(): void {
    for (const l of this.textLabels) l.el.remove()
    this.textLabels = []
  }

  private updateTextLabels(): void {
    const wpp = this.controller.worldPerPx()
    for (const l of this.textLabels) {
      const px = this.controller.project(l.pos)
      if (!px) {
        l.el.style.display = 'none'
        continue
      }
      l.el.style.display = 'block'
      const font = Math.max(7, l.height / wpp)
      l.el.style.fontSize = `${font}px`
      l.el.style.left = `${px[0]}px`
      l.el.style.top = `${px[1]}px`
      const ax = l.justify === 'right' ? '-100%' : l.justify === 'center' ? '-50%' : '0'
      // Los ejes reales del texto (dirección `u` y "arriba" `v`, en su plano) proyectados a la pantalla
      //: en cualquier vista y UCS el texto se ve con su giro, su escorzo y, visto de atrás,
      // espejado como en el CAD clásico. Un px local equivale a `height / font` unidades de mundo.
      const k = l.height / font
      const pu = this.controller.project(l.pos.clone().addScaledVector(l.u, l.height))
      const pv = this.controller.project(l.pos.clone().addScaledVector(l.v, l.height))
      if (pu && pv) {
        const s = k / l.height
        const [a, b] = [(pu[0] - px[0]) * s, (pu[1] - px[1]) * s]
        const [c, d] = [-(pv[0] - px[0]) * s, -(pv[1] - px[1]) * s]
        l.el.style.transform = `matrix(${a},${b},${c},${d},0,0) translate(${ax},0)`
      } else l.el.style.transform = `translate(${ax},0)`
    }
  }

  private clearDimLabels(): void {
    for (const l of this.dimLabels) l.el.remove()
    this.dimLabels = []
  }

  /**
   * Construye un grupo malla+aristas de sólido/mesh según el estilo visual del viewport.
   * `sharedGeom` = true cuando `geom` pertenece al cache CSG (no debe liberarse).
   */
  private styledSolidGroup(
    geom: THREE.BufferGeometry,
    color: THREE.Color,
    selected: boolean,
    id: string,
    sharedGeom: boolean,
    edgePositions?: Float32Array,
  ): THREE.Object3D {
    const style = this.visualStyle
    const showMesh = style === 'shaded' || style === 'shadedEdges' || style === 'hidden'
    const showEdges = style !== 'shaded'
    const group = new THREE.Object3D() // no Group: ver buildDimension (orden de capas)
    group.userData.entityId = id

    if (showMesh) {
      // 'hidden': malla del color de fondo (oculta las aristas traseras por profundidad).
      // Sin iluminación: las caras son del color plano del fondo (blanco en el papel), como el CAD clásico.
      const material =
        style === 'hidden'
          ? new THREE.MeshBasicMaterial({ color: this.bgColor, ...FACE_OFFSET })
          : new THREE.MeshStandardMaterial({ color: new THREE.Color(this.faceHex('#' + color.getHexString())), metalness: 0.1, roughness: 0.75, flatShading: false, ...FACE_OFFSET })
      const mesh = new THREE.Mesh(geom, material)
      mesh.userData.entityId = id
      if (sharedGeom) mesh.userData.cachedGeom = true
      group.add(mesh)
    }
    if (showEdges) {
      // Aristas oscuras sobre superficie sombreada; en wireframe/hidden, del color de la entidad.
      const edgeColor = selected ? HIGHLIGHT : style === 'shadedEdges' ? 0x111111 : color
      let eg: THREE.BufferGeometry
      if (edgePositions) {
        eg = new THREE.BufferGeometry()
        eg.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3))
      } else eg = new THREE.EdgesGeometry(geom, 30) // 30°: oculta el facetado de paredes curvas
      const edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: edgeColor }))
      edges.userData.entityId = id
      group.add(edges)
    }
    // Si la malla no se muestra y la geometría es propia (no del cache), liberarla.
    if (!showMesh && !sharedGeom) geom.dispose()
    return group
  }

  private buildSolid(e: SolidEntity, color: THREE.Color, selected: boolean): THREE.Object3D {
    return this.styledSolidGroup(solidGeometry(e.props), color, selected, e.id, true, solidEdgePositions(e.props))
  }

  /** Geometría indexada (con normales) de una malla poligonal (MESH3D). */
  private meshGeometry(props: MeshEntity['props']): THREE.BufferGeometry {
    const geom = new THREE.BufferGeometry()
    const pos: number[] = []
    for (const v of props.vertices) pos.push(v[0], v[1], v[2])
    const idx: number[] = []
    for (const f of props.faces) for (let i = 1; i + 1 < f.length; i++) idx.push(f[0], f[i], f[i + 1])
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geom.setIndex(idx)
    geom.computeVertexNormals()
    return geom
  }

  private buildMesh(e: MeshEntity, color: THREE.Color, selected: boolean): THREE.Object3D {
    return this.styledSolidGroup(this.meshGeometry(e.props), color, selected, e.id, false)
  }

  /** Tamaño en píxeles de una esfera vista desde la cámara (perspectiva: según su distancia). */
  private sizePx(c: Vec3, r: number): number {
    return (2 * r) / (this.controller.worldPerPxAt({ x: c[0], y: c[1], z: c[2] }) || 1)
  }

  /**
   * Clasifica sólidos y mallas en "punto" o "completa". Devuelve true si alguna pieza cambió de
   * clase (entonces hay que reconstruir los lotes).
   */
  private classifyLod(entities: Entity[]): boolean {
    const minPx = sysvars.RENDERMINPX
    this.lodOn = lodActive(entities, minPx)
    if (!this.lodOn) {
      const had = this.lodSmall.size > 0
      this.lodSmall.clear()
      return had
    }
    let changed = false
    const next = new Map<string, boolean>()
    for (const e of entities) {
      const sig = sizeSignature(e)
      if (!sig || !isFinite(sig.r)) continue
      // D3: la firma viaja con el dibujo (se guarda en el .cota con la clave de su contenido).
      if ((e as { size?: SizeSig }).size?.k !== sig.k) (e as { size?: SizeSig }).size = sig
      const prev = this.lodSmall.get(e.id)
      const small = isSmall(this.sizePx(sig.c, sig.r), minPx, prev)
      if (small) next.set(e.id, true)
      if ((prev ?? false) !== small) changed = true
    }
    if (next.size !== this.lodSmall.size) changed = true
    this.lodSmall = next
    return changed
  }

  private rebuild(entities: Entity[], layers: Layer[], selection: Set<string>): void {
    this.classifyLod(entities)
    this.lodBucket = this.lodBucketKey()
    this.disposeGroup(this.entityGroup)
    this.clearDimLabels()
    this.clearTextLabels()
    const layerMap = new Map(layers.map((l) => [l.id, l]))
    // Orden de capas: `renderOrder` por capa (0 = la de arriba, negativos debajo) y lo
    // seleccionado encima de todo. Con depthFunc LessEqual, lo coplanar dibujado después gana; la
    // profundidad real sigue mandando en 3D.
    const order = drawOrder(layers)
    const bottom = -layers.length
    const orderOf = (e: Entity): number => order.get(e.layer) ?? bottom
    this.pickOrder = new Map(entities.map((e, i) => [e.id, { o: orderOf(e), i }]))
    /** Asigna el orden a lo que `buildEntity` acaba de agregar. */
    const individual = (e: Entity): void => {
      const from = this.entityGroup.children.length
      this.buildEntity(e, layerMap, selection)
      const ro = selection.has(e.id) ? 1 : orderOf(e)
      for (const c of this.entityGroup.children.slice(from)) c.traverse((o) => (o.renderOrder = ro))
    }
    const style = this.visualStyle
    const showMesh = style === 'shaded' || style === 'shadedEdges' || style === 'hidden'
    const showEdges = style !== 'shaded'
    // Batches por material (clave = color): fusionan la geometría estática (no seleccionada) para bajar
    // de miles de draw calls a unas pocas decenas → orbit fluido en modelos pesados. `ranges` mapea
    // cada tramo de vértices a su entityId (para el pick).
    const meshB = new Map<string, MeshBatch>()
    const edgeB = new Map<string, LineBatch>()
    const lineB = new Map<string, LineBatch>()
    const pointB = new Map<string, PointBatch>()
    /** Recorridos completos (invisibles) de lo que se dibuja con trazos: el pick toma también los huecos. */
    const pickB = new Map<string, LineBatch>()
    /** Piezas chicas dibujadas como un punto: posiciones, color e id de cada una (para el pick). */
    const lodB = new Map<string, { pos: number[]; ids: string[] }>()
    const markB = new Map<string, { pos: number[]; ids: string[] }>()
    /** Rellenos de sombreados (sólidos visibles; los de patrón, invisibles para el pick). */
    const fillB = new Map<string, MeshBatch>()
    const ltCtx = this.data?.linetypes
    const layerOf = (id: string) => layerMap.get(id)
    const getMesh = (k: string): MeshBatch => { let b = meshB.get(k); if (!b) { b = { pos: [], nor: [], ranges: [], n: 0 }; meshB.set(k, b) } return b }
    const getLine = (m: Map<string, LineBatch>, k: string): LineBatch => { let b = m.get(k); if (!b) { b = { pos: [], ranges: [], n: 0 }; m.set(k, b) } return b }
    const getPoints = (m: Map<string, PointBatch>, k: string): PointBatch => { let b = m.get(k); if (!b) { b = { pos: [] }; m.set(k, b) } return b }
    const bgHex = '#' + this.bgColor.getHexString()
    // Grosor de capa (mm; 0 = Default, 0.25 mm) sólo en los layouts.
    const lwUnits = this.data?.lwUnitsPerMm
    const lwKey = (l: Layer | undefined, own?: number): string => (lwUnits ? `|${(own !== undefined && own >= 0 ? own : l?.lineWeight) || 0.25}` : '')
    this.wideLines = []

    this.unpickable = new Set(entities.filter((e) => !layerEditable(layerMap.get(e.layer))).map((e) => e.id))
    for (const e of entities) {
      try {
        const layer = layerMap.get(e.layer)
        if (!layerVisible(layer)) continue
        const selected = selection.has(e.id)
        const colorHex = this.layerHex(layer, e.color)

        // Individuales: seleccionadas (resaltado), anotaciones y polilíneas anchas.
        if ((selected && e.type !== 'SHADE') || e.type === 'DIMENSION' || e.type === 'TEXT' || e.type === 'ATTDEF') {
          individual(e)
          continue
        }
        if (e.type === 'SHADE') {
          // Debajo de todo lo de su capa (las líneas de la vista quedan encima).
          const from = this.entityGroup.children.length
          this.buildEntity(e, layerMap, selection)
          for (const c of this.entityGroup.children.slice(from)) c.renderOrder = orderOf(e) - 0.75
          continue
        }
        const ro = orderOf(e)
        if (e.type === 'POINT') {
          const k = `${ro}|${colorHex}`
          let b = markB.get(k)
          if (!b) markB.set(k, (b = { pos: [], ids: [] }))
          b.pos.push(...e.props.position)
          b.ids.push(e.id)
          continue
        }
        if ((e.type === 'SOLID3D' || e.type === 'MESH3D') && this.lodSmall.get(e.id)) {
          // Más chica que RENDERMINPX: un punto en su centro, sin evaluar su CSG.
          const sig = sizeSignature(e)!
          const k = `${ro}|${colorHex}`
          let b = lodB.get(k)
          if (!b) lodB.set(k, (b = { pos: [], ids: [] }))
          b.pos.push(sig.c[0], sig.c[1], sig.c[2])
          b.ids.push(e.id)
          continue
        }
        if (e.type === 'SOLID3D' || e.type === 'MESH3D') {
          const g = e.type === 'SOLID3D' ? solidGeometry(e.props) : this.meshGeometry(e.props)
          if (showMesh) {
            const ng = g.index ? g.toNonIndexed() : g
            if (!ng.getAttribute('normal')) ng.computeVertexNormals()
            const p = ng.getAttribute('position')
            const nr = ng.getAttribute('normal')
            const b = getMesh(`${ro}|${style === 'hidden' ? `${bgHex}|flat` : this.faceHex(colorHex)}`)
            b.ranges.push({ s: b.n, id: e.id })
            const pa = p.array as ArrayLike<number>
            const na = nr.array as ArrayLike<number>
            for (let i = 0; i < pa.length; i++) { b.pos.push(pa[i]); b.nor.push(na[i]) }
            b.n += p.count
            if (ng !== g) ng.dispose()
          }
          if (showEdges) {
            let pa: ArrayLike<number>
            if (e.type === 'SOLID3D') pa = solidEdgePositions(e.props)
            else {
              const eg = new THREE.EdgesGeometry(g, 30)
              pa = eg.getAttribute('position').array as ArrayLike<number>
              eg.dispose()
            }
            const b = getLine(edgeB, `${ro}|${style === 'shadedEdges' ? '#111111' : colorHex}${lwKey(layer, e.lineWeight)}`)
            b.ranges.push({ s: b.n, id: e.id })
            for (let i = 0; i < pa.length; i++) b.pos.push(pa[i])
            b.n += pa.length / 3
          }
          if (e.type === 'MESH3D') g.dispose() // temporal (solidGeometry está cacheada → no se libera)
          continue
        }
        if (e.type === 'HATCH') {
          // Detrás del contorno (HPDRAWORDER = 3): medio escalón por debajo de su capa.
          const hro = ro - 0.5
          const strokes = hatchStrokesCached(e.props)
          if (strokes.segs.length) {
            const b = getLine(lineB, `${hro}|${colorHex}`)
            b.ranges.push({ s: b.n, id: e.id })
            for (const [a, c] of strokes.segs) b.pos.push(a[0], a[1], a[2], c[0], c[1], c[2])
            b.n += strokes.segs.length * 2
          }
          for (const d of strokes.dots) getPoints(pointB, `${hro}|${colorHex}`).pos.push(d[0], d[1], d[2])
          const tris = hatchTriangles(e)
          if (tris.length) {
            const k = `${hro}|${colorHex}|${isSolidHatch(e.props) ? 'solid' : 'pick'}`
            let b = fillB.get(k)
            if (!b) fillB.set(k, (b = { pos: [], nor: [], ranges: [], n: 0 }))
            b.ranges.push({ s: b.n, id: e.id })
            for (let i = 0; i < tris.length; i++) b.pos.push(tris[i])
            b.n += tris.length / 3
          }
          continue
        }
        if (e.type === 'POLYLINE' && isWide(e.props)) {
          individual(e) // banda rellena
          continue
        }
        const dashes = ltCtx ? entityDashes(e, entityPattern(e, layerOf, ltCtx), ltCtx.plinegen) : null
        if (dashes) {
          // Tipo de línea: los trazos al lote visible; el recorrido entero, invisible, para el pick.
          const b = getLine(lineB, `${ro}|${colorHex}${lwKey(layer, e.lineWeight)}`)
          b.ranges.push({ s: b.n, id: e.id })
          for (const d of dashes.dashes) for (let i = 0; i + 1 < d.length; i++) {
            b.pos.push(d[i][0], d[i][1], d[i][2], d[i + 1][0], d[i + 1][1], d[i + 1][2])
            b.n += 2
          }
          for (const d of dashes.dots) getPoints(pointB, `${ro}|${colorHex}`).pos.push(d[0], d[1], d[2])
          const pk = getLine(pickB, `${ro}|${colorHex}`)
          pk.ranges.push({ s: pk.n, id: e.id })
          for (const path of linetypePaths(e, ltCtx?.plinegen) ?? []) for (let i = 0; i + 1 < path.length; i++) {
            pk.pos.push(path[i][0], path[i][1], path[i][2], path[i + 1][0], path[i + 1][1], path[i + 1][2])
            pk.n += 2
          }
          continue
        }
        const verts = this.entityLinePoints(e)
        if (!verts || verts.length < 2) continue
        const b = getLine(lineB, `${ro}|${colorHex}${lwKey(layer, e.lineWeight)}`)
        b.ranges.push({ s: b.n, id: e.id })
        for (let i = 0; i + 1 < verts.length; i++) {
          const a = verts[i]
          const c = verts[i + 1]
          b.pos.push(a.x, a.y, a.z, c.x, c.y, c.z)
        }
        b.n += (verts.length - 1) * 2
      } catch (err) {
        // Una entidad malformada no debe romper el rebuild ni congelar el viewport.
        console.warn(`Cota: no se pudo construir la entidad ${e.id} (${e.type}); se omite.`, err)
      }
    }

    if (showMesh) for (const [k, b] of meshB) this.addMeshBatch(b, k)
    if (showEdges) for (const [k, b] of edgeB) this.addLineBatch(b, k)
    for (const [k, b] of lineB) this.addLineBatch(b, k)
    for (const [k, b] of pointB) this.addPointBatch(b, k)
    for (const [k, b] of pickB) this.addLineBatch(b, k, true)
    for (const [k, b] of fillB) this.addFillBatch(b, k)
    for (const [k, b] of lodB) this.addLodPoints(b, k)
    for (const [k, b] of markB) this.addPointMarks(b, k)
  }

  /** POINT: su marca según PDMODE, del tamaño de PDSIZE (se ajusta al zoom en `updateLineweights`). */
  private addPointMarks(b: { pos: number[]; ids: string[] }, key: string): void {
    const [ro, colorHex] = key.split('|')
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
    const mat = new THREE.PointsMaterial({ color: new THREE.Color(colorHex), size: this.pointMarkPx(), sizeAttenuation: false, map: pointMarkTexture(sysvars.PDMODE), transparent: true, alphaTest: 0.35 })
    const pts = new THREE.Points(g, mat)
    pts.renderOrder = Number(ro)
    pts.userData.pointIds = b.ids
    pts.userData.pointMark = true
    this.entityGroup.add(pts)
  }

  /** Lado en píxeles de la marca de los POINT (PDSIZE del CAD clásico). */
  private pointMarkPx(): number {
    const h = this.renderer.domElement.clientHeight || 600
    const s = sysvars.PDSIZE
    const px = s > 0 ? s / (this.controller.worldPerPx() || 1) : s < 0 ? (h * -s) / 100 : h * 0.05
    return Math.max(4, Math.min(256, px))
  }

  /** Piezas chicas: 2 px, seleccionables (el pick resuelve el id por el índice del punto). */
  private addLodPoints(b: { pos: number[]; ids: string[] }, key: string): void {
    const [ro, colorHex] = key.split('|')
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(colorHex), size: 3, sizeAttenuation: false }))
    pts.renderOrder = Number(ro)
    pts.userData.pointIds = b.ids
    this.entityGroup.add(pts)
  }

  /** Balde de zoom para reclasificar (cada 25 % de cambio; en perspectiva también al mover la cámara). */
  private lodBucketKey(): string {
    const c = this.controller
    const z = Math.round(Math.log(c.worldPerPx() || 1) / Math.log(1.25))
    if (c.mode === 'ortho') return `${z}`
    const p = c.camera.position
    const step = (c.radius || 1) / 4
    return `${z}|${Math.round(p.x / step)},${Math.round(p.y / step)},${Math.round(p.z / step)}`
  }

  /** Puntos de los tipos de línea/patrones: 2 px fijos (como el punto del CAD clásico), no seleccionables. */
  private addPointBatch(b: PointBatch, key: string): void {
    if (!b.pos.length) return
    const [ro, colorHex] = key.split('|')
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(colorHex), size: 2, sizeAttenuation: false }))
    pts.renderOrder = Number(ro)
    pts.raycast = () => {} // el pick lo resuelve el recorrido invisible
    this.entityGroup.add(pts)
  }

  /**
   * Relleno de sombreados: `solid` se ve; `pick` es invisible y sólo sirve para seleccionar un
   * sombreado haciendo clic dentro. Ambos pierden contra las líneas cercanas al cursor (`lowPick`).
   */
  private addFillBatch(b: MeshBatch, key: string): void {
    if (!b.pos.length) return
    const [ro, colorHex, kind] = key.split('|')
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
    const visible = kind === 'solid'
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex), side: THREE.DoubleSide, visible, ...FACE_OFFSET }))
    mesh.userData.ranges = b.ranges
    mesh.userData.rangeKind = 'mesh'
    mesh.userData.lowPick = true
    mesh.renderOrder = Number(ro)
    this.entityGroup.add(mesh)
  }

  /** Crea una malla fusionada (un draw call) a partir de un batch, con `ranges` para el pick. La clave
   *  del lote es `orden|color`: el orden de la capa pasa a `renderOrder`. */
  private addMeshBatch(b: MeshBatch, key: string): void {
    if (b.pos.length === 0) return
    const [ro, colorHex, flat] = key.split('|')
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3))
    const mesh = new THREE.Mesh(
      g,
      flat
        ? new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex), ...FACE_OFFSET }) // estilo hidden: sin luz
        : new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), metalness: 0.1, roughness: 0.75, ...FACE_OFFSET }),
    )
    mesh.userData.ranges = b.ranges
    mesh.userData.rangeKind = 'mesh'
    mesh.renderOrder = Number(ro)
    this.entityGroup.add(mesh)
  }

  /** Crea un LineSegments fusionado (un draw call) a partir de un batch, con `ranges` para el pick.
   *  `pickOnly`: invisible (recorrido completo de una línea con trazos). */
  private addLineBatch(b: LineBatch, key: string, pickOnly = false): void {
    if (b.pos.length === 0) return
    const [ro, colorHex, lw] = key.split('|')
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
    const seg = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(colorHex), visible: !pickOnly }))
    seg.userData.ranges = b.ranges
    seg.userData.rangeKind = 'line'
    seg.renderOrder = Number(ro)
    this.entityGroup.add(seg)
    if (lw && !pickOnly && this.data?.lwUnitsPerMm) {
      // Línea con grosor (en píxeles según el zoom): se ve en lugar de la fina, que queda para el pick.
      const wg = new LineSegmentsGeometry().setPositions(b.pos)
      const mat = new LineMaterial({ color: new THREE.Color(colorHex).getHex(), linewidth: 1 })
      mat.resolution.set(this.width, this.height)
      const wide = new LineSegments2(wg, mat)
      wide.renderOrder = Number(ro)
      wide.raycast = () => {}
      wide.visible = false
      this.entityGroup.add(wide)
      this.wideLines.push({ thin: seg, wide, mm: Number(lw) })
    }
    this.lineweightZoom = -1
  }

  /**
   * Grosores en pantalla: cada línea con grosor mide `mm` de papel al zoom actual; por debajo de 1,5 px se dibuja la
   * línea fina (como el CAD clásico, que no baja de un píxel).
   */
  private updateLineweights(): void {
    // Los POINT con PDSIZE en unidades de dibujo cambian de tamaño en pantalla con el zoom.
    if (sysvars.PDSIZE > 0) {
      const px = this.pointMarkPx()
      for (const o of this.entityGroup.children) if (o.userData.pointMark) ((o as THREE.Points).material as THREE.PointsMaterial).size = px
    }
    const units = this.data?.lwUnitsPerMm
    if (!this.wideLines.length || !units) return
    const wpp = this.controller.worldPerPx() || 1
    if (wpp === this.lineweightZoom) return
    this.lineweightZoom = wpp
    for (const w of this.wideLines) {
      const px = (w.mm * units) / wpp
      const show = px > 1.5
      w.wide.visible = show
      ;(w.thin.material as THREE.LineBasicMaterial).visible = !show
      if (show) {
        const m = w.wide.material as LineMaterial
        m.linewidth = px
        m.resolution.set(this.width, this.height)
      }
    }
  }

  /** Resuelve el entityId de un impacto de raycast sobre una geometría fusionada (búsqueda binaria). */
  private resolveRange(obj: THREE.Object3D, hit: THREE.Intersection): string | null {
    const ranges = obj.userData.ranges as { s: number; id: string }[] | undefined
    if (!ranges) return null
    const v = obj.userData.rangeKind === 'mesh' ? (hit.faceIndex ?? -1) * 3 : hit.index ?? -1
    if (v < 0) return null
    let lo = 0
    let hi = ranges.length - 1
    let ans = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (ranges[mid].s <= v) { ans = mid; lo = mid + 1 } else hi = mid - 1
    }
    return ans >= 0 ? ranges[ans].id : null
  }

  private lightBg(): boolean {
    const { r, g, b } = this.bgColor
    return 0.299 * r + 0.587 * g + 0.114 * b > 0.6
  }

  /** Color de dibujo: el blanco (color 7 del CAD clásico) se dibuja negro sobre fondos claros (papel). */
  /**
   * Color 7 del CAD clásico ("blanco/negro"): una capa blanca se ve negra sobre fondo claro (modo claro, papel) y una
   * negra se ve blanca sobre fondo oscuro. Los demás colores se muestran tal cual, como en el CAD clásico.
   */
  private ink(hex: string): string {
    const h = hex.toLowerCase()
    if (h === '#ffffff' || h === '#fff') return this.lightBg() ? '#000000' : hex
    if (h === '#000000' || h === '#000') return this.lightBg() ? hex : '#ffffff'
    return hex
  }

  /**
   * Color con que se ve una capa: el color 7 según el fondo; las congeladas en grises (#222 a #CCC según la
   * luminosidad de su color) y las bloqueadas atenuadas (como LAYLOCKFADECTL 50). Las dos se ven y dan snaps.
   */
  private layerHex(layer: Layer | undefined, own?: string): string {
    // Color propio del objeto, o el de su capa (ByLayer); congeladas y bloqueadas se atenúan igual.
    const hex = this.ink((own?.startsWith('#') ? own : undefined) ?? layer?.color ?? '#ffffff')
    if (!layer?.frozen && !layer?.locked) return hex
    const color = new THREE.Color(hex)
    if (layer.frozen) {
      const c = color.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace)
      const g = (0x22 + (0xcc - 0x22) * (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b)) / 255
      color.setRGB(g, g, g, THREE.SRGBColorSpace)
    } else color.lerp(new THREE.Color(this.bgColor), 0.5)
    return '#' + color.getHexString()
  }

  /**
   * Contornos (siluetas) de las caras curvas de los sólidos vistos desde la cámara: donde una superficie suave pasa de
   * mirar al observador a darle la espalda (los lados de un cilindro, el borde de una esfera o de un tubo barrido).
   * Se recalculan al cambiar la vista; si es costoso, sólo cuando se suelta la órbita.
   */
  private updateSilhouettes(): void {
    const d = this.data
    const style = this.visualStyle
    const cam = this.controller.camera
    const persp = this.controller.mode !== 'ortho'
    const dir = new THREE.Vector3()
    cam.getWorldDirection(dir)
    const q = (v: number) => Math.round(v * 2000)
    const key = d && style !== 'shaded' ? `${style}|${this.lastRevision}|${this.lastSelectionKey}|${q(dir.x)},${q(dir.y)},${q(dir.z)}${persp ? `|${q(cam.position.x)},${q(cam.position.y)},${q(cam.position.z)}` : ''}` : ''
    if (key === this.silhouetteKey) return
    if (key && this.dragging && this.silhouetteMs > 30) return // pesado: se actualiza al terminar de orbitar
    this.silhouetteKey = key
    this.disposeGroup(this.silhouetteGroup)
    if (!key || !d) return
    const t0 = performance.now()
    const layers = new Map(d.layers.map((l) => [l.id, l]))
    const sel = new Set(d.selection)
    const byColor = new Map<string, number[]>()
    const toViewer = dir.clone().negate()
    for (const e of this.entities()) {
      if (e.type !== 'SOLID3D' || this.lodSmall.get(e.id)) continue
      const layer = layers.get(e.layer)
      if (!layerVisible(layer)) continue
      const topo = solidTopology(e.props)
      if (!topo) continue
      const { verts, normals, triFace, links } = topo
      const hex = sel.has(e.id) ? '#' + new THREE.Color(HIGHLIGHT).getHexString() : style === 'shadedEdges' ? '#111111' : this.layerHex(layer, e.color)
      let out = byColor.get(hex)
      if (!out) byColor.set(hex, (out = []))
      for (const [ta, tb, a, b] of links) {
        if (triFace[ta] !== triFace[tb]) continue // entre caras distintas: arista viva, ya dibujada
        const [na, nb] = [normals[ta], normals[tb]]
        if (na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2] > 1 - 1e-9) continue // misma faceta plana
        const [pa, pb] = [verts[a], verts[b]]
        let v = toViewer
        if (persp) v = new THREE.Vector3((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2).sub(cam.position).negate()
        const da = na[0] * v.x + na[1] * v.y + na[2] * v.z
        const db = nb[0] * v.x + nb[1] * v.y + nb[2] * v.z
        if (da > 0 !== db > 0) out.push(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2])
      }
    }
    for (const [hex, pos] of byColor) {
      if (!pos.length) continue
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      const seg = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(hex) }))
      seg.raycast = () => {}
      this.silhouetteGroup.add(seg)
    }
    this.silhouetteMs = performance.now() - t0
  }

  /** Caras sombreadas: el negro del color 7 sobre papel se aclara a gris para que se lea el sombreado. */
  private faceHex(hex: string): string {
    return hex === '#000000' && this.lightBg() ? FACE_ON_PAPER : hex
  }

  /** Construye una entidad y la agrega al grupo (aislada para poder capturar errores por entidad). */
  private buildEntity(e: Entity, layerMap: Map<string, Layer>, selection: Set<string>): void {
    {
      const layer = layerMap.get(e.layer)
      if (!layerVisible(layer)) return
      const selected = selection.has(e.id)
      const color = new THREE.Color(selected ? HIGHLIGHT : this.layerHex(layer, e.color))
      if (e.type === 'SOLID3D') {
        this.entityGroup.add(this.buildSolid(e, color, selected))
        return
      }
      if (e.type === 'MESH3D') {
        this.entityGroup.add(this.buildMesh(e, color, selected))
        return
      }
      if (e.type === 'DIMENSION') {
        this.entityGroup.add(this.buildDimension(e, color))
        return
      }
      if (e.type === 'TEXT') {
        this.buildText(e, color, selected)
        return
      }
      if (e.type === 'ATTDEF') {
        // Suelto se ve su tag (dentro de un bloque lo reemplaza el valor del atributo).
        this.buildText({ id: e.id, type: 'TEXT', layer: e.layer, props: attdefText(e.props) }, color, selected)
        return
      }
      if (e.type === 'HATCH') {
        this.entityGroup.add(this.buildHatch(e, color))
        return
      }
      if (e.type === 'SHADE') {
        this.entityGroup.add(this.buildShade(e, selected))
        return
      }
      const vertices = this.entityLinePoints(e)
      if (!vertices || vertices.length < 2) return
      if (e.type === 'POLYLINE' && isWide(e.props)) this.entityGroup.add(this.buildBand(e.id, polylineBand(e.props), color))
      const ltCtx = this.data?.linetypes
      const dashes = ltCtx ? entityDashes(e, entityPattern(e, (id) => layerMap.get(id), ltCtx), ltCtx.plinegen) : null
      if (dashes) {
        this.entityGroup.add(this.buildDashes(e, dashes, color, linetypePaths(e, ltCtx?.plinegen) ?? []))
        return
      }
      const geom = new THREE.BufferGeometry().setFromPoints(vertices)
      const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color }))
      line.userData.entityId = e.id
      this.entityGroup.add(line)
    }
  }

  /** Trazos de un tipo de línea (individual: seleccionado) con su recorrido invisible para el pick. */
  private buildDashes(e: Entity, d: DashResult, color: THREE.Color, paths: Vec3[][]): THREE.Object3D {
    const group = new THREE.Object3D()
    group.userData.entityId = e.id
    const seg = (polys: Vec3[][], visible: boolean): THREE.LineSegments => {
      const pos: number[] = []
      for (const p of polys) for (let i = 0; i + 1 < p.length; i++) pos.push(...p[i], ...p[i + 1])
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, visible }))
      l.userData.entityId = e.id
      return l
    }
    group.add(seg(d.dashes, true), seg(paths, false))
    if (d.dots.length) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(d.dots.flat(), 3))
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 2, sizeAttenuation: false }))
      pts.raycast = () => {}
      group.add(pts)
    }
    return group
  }

  /** Banda rellena de una polilínea ancha. */
  private buildBand(id: string, quads: Vec3[][], color: THREE.Color): THREE.Object3D {
    const pos: number[] = []
    for (const q of quads) pos.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3])
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, ...FACE_OFFSET }))
    mesh.userData.entityId = id
    return mesh
  }

  /** Sombreado individual (seleccionado): líneas del patrón y relleno (visible si es SOLID). */
  /**
   * Sombreado de una vista de dibujo: triángulos con su color, pintados en orden (de atrás hacia
   * adelante, sin prueba de profundidad) y debajo de las líneas de la vista.
   */
  private buildShade(e: Extract<Entity, { type: 'SHADE' }>, selected: boolean): THREE.Object3D {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(e.props.tris, 3))
    const col: number[] = []
    const n = e.props.tris.length / 9
    for (let i = 0; i < n; i++) {
      const [r, gr, b] = [e.props.colors[i * 3] ?? 0.7, e.props.colors[i * 3 + 1] ?? 0.7, e.props.colors[i * 3 + 2] ?? 0.7]
      const k = selected ? 0.6 : 1
      for (let v = 0; v < 3; v++) col.push(r * k, gr * k, b * k + (selected ? 0.35 : 0))
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    // Profundidad real en z (debajo del papel, ver `shadeViewTriangles`): las piezas que se cruzan se resuelven.
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }))
    mesh.userData.entityId = e.id
    mesh.userData.lowPick = true // como el relleno de un sombreado: una línea cercana gana el pick
    return mesh
  }

  private buildHatch(e: HatchEntity, color: THREE.Color): THREE.Object3D {
    const group = new THREE.Object3D()
    group.userData.entityId = e.id
    const s = hatchStrokesCached(e.props)
    if (s.segs.length) {
      const pos: number[] = []
      for (const [a, b] of s.segs) pos.push(...a, ...b)
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }))
      l.userData.entityId = e.id
      group.add(l)
    }
    if (s.dots.length) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(s.dots.flat(), 3))
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 2, sizeAttenuation: false }))
      pts.raycast = () => {}
      group.add(pts)
    }
    const tris = hatchTriangles(e)
    if (tris.length) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3))
      // Seleccionado: el relleno sólido se ve con el color de resaltado pero semitransparente.
      const solid = isSolidHatch(e.props)
      const mesh = new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, visible: solid, transparent: solid, opacity: 0.6, ...FACE_OFFSET }),
      )
      mesh.userData.entityId = e.id
      mesh.userData.lowPick = true
      group.add(mesh)
    }
    return group
  }

  /**
   * Trazos del marcador de un snap, en el plano de la **pantalla** (ejes derecha/arriba de la cámara): en
   * FRONT, RIGHT o una isométrica se ve igual que en planta, como en el CAD clásico. `r` en unidades de
   * mundo a la distancia del punto.
   */
  private glyphPoints(type: SnapType, c: Pt, r: number): Pt[][] {
    const cam = this.controller.camera
    cam.updateMatrixWorld()
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).normalize()
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).normalize()
    const p = (x: number, y: number): Pt => ({
      x: c.x + right.x * x + up.x * y,
      y: c.y + right.y * x + up.y * y,
      z: c.z + right.z * x + up.z * y,
    })
    switch (type) {
      case 'endpoint':
        return [[p(-r, -r), p(r, -r), p(r, r), p(-r, r), p(-r, -r)]]
      case 'midpoint':
        return [[p(-r, -r), p(r, -r), p(0, r), p(-r, -r)]]
      case 'center': {
        const seg: Pt[] = []
        for (let i = 0; i <= 24; i++) {
          const a = (i / 24) * Math.PI * 2
          seg.push(p(r * Math.cos(a), r * Math.sin(a)))
        }
        return [seg]
      }
      case 'quadrant':
        return [[p(0, r), p(r, 0), p(0, -r), p(-r, 0), p(0, r)]]
      case 'intersection':
        return [[p(-r, -r), p(r, r)], [p(-r, r), p(r, -r)]]
      case 'apparentIntersection':
        // Aspa dentro de una caja (el CAD clásico la distingue así de la intersección real).
        return [
          [p(-r, -r), p(r, r)],
          [p(-r, r), p(r, -r)],
          [p(-r, -r), p(r, -r), p(r, r), p(-r, r), p(-r, -r)],
        ]
      case 'tracking':
        // Cruz de alineación.
        return [[p(-r, 0), p(r, 0)], [p(0, -r), p(0, r)]]
      case 'perpendicular':
        return [[p(-r, -r), p(r, -r)], [p(0, -r), p(0, r)]]
      case 'tangent': {
        const seg: Pt[] = []
        for (let i = 0; i <= 24; i++) {
          const a = (i / 24) * Math.PI * 2
          seg.push(p(r * Math.cos(a), r * Math.sin(a)))
        }
        return [seg, [p(-r, r), p(r, r)]]
      }
      case 'geometricCenter': {
        // Círculo con un asterisco (el centroide del CAD clásico).
        const seg: Pt[] = []
        for (let i = 0; i <= 24; i++) {
          const a = (i / 24) * Math.PI * 2
          seg.push(p(r * Math.cos(a), r * Math.sin(a)))
        }
        const k = r * 0.6
        return [seg, [p(-k, 0), p(k, 0)], [p(0, -k), p(0, k)], [p(-k, -k), p(k, k)], [p(-k, k), p(k, -k)]]
      }
      case 'node': {
        const seg: Pt[] = []
        for (let i = 0; i <= 24; i++) {
          const a = (i / 24) * Math.PI * 2
          seg.push(p(r * Math.cos(a), r * Math.sin(a)))
        }
        return [seg, [p(-r, -r), p(r, r)], [p(-r, r), p(r, -r)]]
      }
      case 'nearest':
        return [[p(-r, -r), p(r, -r), p(-r, r), p(r, r), p(-r, -r)]]
      case 'grid':
        return [[p(-r, 0), p(r, 0)], [p(0, -r), p(0, r)]]
    }
  }

  /** Un puntito de largo `len` corrido (dx, dy) en el plano de la pantalla desde `c`. */
  private glyphOffsetDots(c: Pt, dx: number, dy: number, len: number): Pt[][] {
    const cam = this.controller.camera
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).normalize()
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).normalize()
    const at = (x: number, y: number): Pt => ({ x: c.x + right.x * x + up.x * y, y: c.y + right.y * x + up.y * y, z: c.z + right.z * x + up.z * y })
    return [[at(dx, dy), at(dx + len, dy)]]
  }

  private updateSnapGlyph(): void {
    this.disposeGroup(this.snapGroup)
    // Marcas "+" de los puntos adquiridos para el tracking y sus líneas de alineación.
    if ((this.data?.otrack || this.data?.polarAng) && this.data.pointPrompt) {
      for (const tp of this.data.otrack ? this.tracked : []) {
        for (const seg of this.glyphPoints('tracking', tp, 5 * this.controller.worldPerPxAt(tp))) {
          const geom = new THREE.BufferGeometry().setFromPoints(seg.map((p) => new THREE.Vector3(p.x, p.y, p.z)))
          this.snapGroup.add(new THREE.Line(geom, this.snapMaterial))
        }
      }
      for (const [a, b] of this.trackLines) {
        const geom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(a.x, a.y, a.z),
          new THREE.Vector3(b.x, b.y, b.z),
        ])
        const line = new THREE.Line(geom, this.trackMaterial)
        line.computeLineDistances() // necesario para el punteado
        this.snapGroup.add(line)
      }
    }
    const { type, point } = this.snapResult
    if (!type || !this.needSnap()) return
    const at = this.controller.worldPerPxAt(point)
    const segs = this.glyphPoints(type, point, 7 * at)
    if (this.snapResult.deferred) {
      // Diferido: tres puntitos a la derecha del marcador, como el "…" del CAD clásico.
      for (let i = 0; i < 3; i++) {
        segs.push(...this.glyphOffsetDots(point, (10 + i * 4) * at, -7 * at, at))
      }
    }
    for (const seg of segs) {
      const geom = new THREE.BufferGeometry().setFromPoints(seg.map((p) => new THREE.Vector3(p.x, p.y, p.z)))
      this.snapGroup.add(new THREE.Line(geom, this.snapMaterial))
    }
  }

  private updatePreview(): void {
    this.disposeGroup(this.previewGroup)
    // Color de contraste: evita que el rubber-band se confunda con la capa actual o con el fondo.
    const wanted = this.data?.previewColor
    if (wanted !== undefined && this.previewMaterial.color.getHex() !== wanted) {
      this.previewMaterial.color.setHex(wanted)
    }
    const shapes = this.previewProvider?.(this.lastWorld) ?? []
    for (const s of shapes) {
      if (s.kind === 'line') {
        const geom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(s.a.x, s.a.y, s.a.z),
          new THREE.Vector3(s.b.x, s.b.y, s.b.z),
        ])
        this.previewGroup.add(new THREE.Line(geom, this.previewMaterial))
      } else if (s.kind === 'circle' && s.radius > 0) {
        // En el plano de la normal (un círculo en FRONT queda vertical); sin normal, en XY.
        const { u, v } = arcBasis(s.normal)
        const pts = Array.from({ length: 97 }, (_, i) => {
          const a = (i / 96) * Math.PI * 2
          const [c, sn] = [Math.cos(a) * s.radius, Math.sin(a) * s.radius]
          return new THREE.Vector3(s.center.x + u[0] * c + v[0] * sn, s.center.y + u[1] * c + v[1] * sn, s.center.z + u[2] * c + v[2] * sn)
        })
        this.previewGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.previewMaterial))
      } else if (s.kind === 'polyline' && s.points.length >= 2) {
        const pts = s.points.map((p) => new THREE.Vector3(p.x, p.y, p.z))
        this.previewGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.previewMaterial))
      } else if (s.kind === 'solid') {
        const g = previewSolidGeometry(s.props)
        if (!g) continue
        // Sombreado translúcido del color del rubber-band (respeta la profundidad del modelo) + sus aristas vivas.
        const fill = new THREE.Mesh(
          g,
          new THREE.MeshLambertMaterial({ color: this.previewMaterial.color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
        )
        const edges = new THREE.EdgesGeometry(g, 30)
        this.previewGroup.add(fill, new THREE.LineSegments(edges, this.previewMaterial))
      }
    }
  }

  /** Máximo de grips dibujados a la vez (evita costo con selecciones enormes). */
  private static readonly MAX_GRIPS = 400

  /** Dibuja un cuadrado de grip encarado a la cámara en el punto `p` (siempre por encima). */
  private addGripSquare(p: THREE.Vector3, color: number, right: THREE.Vector3, up: THREE.Vector3, s: number): void {
    const a = p.clone().addScaledVector(right, -s).addScaledVector(up, -s)
    const b = p.clone().addScaledVector(right, s).addScaledVector(up, -s)
    const c = p.clone().addScaledVector(right, s).addScaledVector(up, s)
    const dd = p.clone().addScaledVector(right, -s).addScaledVector(up, s)
    const geom = new THREE.BufferGeometry().setFromPoints([a, b, c, a, c, dd])
    const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }))
    mesh.renderOrder = 999
    this.gripGroup.add(mesh)
  }

  /**
   * Recalcula y dibuja los grips de las entidades seleccionadas (cuadrados encarados a la cámara,
   * siempre visibles). Solo en modo selección. Mantiene `this.grips` para el hit-test del cursor.
   * Al iniciar la edición el prompt del motor toma el control (modo selección off) y los grips se ocultan;
   * el fantasma de la deformación lo dibuja la previsualización del comando.
   */
  private updateGrips(): void {
    this.disposeGroup(this.gripGroup)
    const cam = this.controller.camera
    // La matriz de cámara la refresca render(); updateGrips corre ANTES, así que la forzamos aquí
    // para que el billboard encare la vista ACTUAL (si no, los grips quedan orientados a la vista previa).
    cam.updateMatrixWorld(true)
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0)
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1)
    const s = 4.5 * this.controller.worldPerPx()

    const d = this.data
    const selectMode = (this.cb.isSelectMode?.() ?? true) && !this.cb.isCommandActive?.()
    if (!d || !selectMode || d.selection.length === 0) {
      this.grips = []
      this.hoverGrip = -1
      return
    }
    const layerMap = new Map(d.layers.map((l) => [l.id, l]))
    const sel = new Set(d.selection)
    const list: { grip: Grip; entityId: string }[] = []
    for (const e of d.entities) {
      if (!sel.has(e.id)) continue
      const layer = layerMap.get(e.layer)
      if (!layerVisible(layer)) continue
      for (const grip of entityGrips(e)) {
        list.push({ grip, entityId: e.id })
        if (list.length >= Viewport.MAX_GRIPS) break
      }
      if (list.length >= Viewport.MAX_GRIPS) break
    }
    this.grips = list
    if (this.hoverGrip >= list.length) this.hoverGrip = -1

    for (let i = 0; i < list.length; i++) {
      const color = i === this.hoverGrip ? GRIP_HOVER : GRIP_COLOR
      this.addGripSquare(new THREE.Vector3(...list[i].grip.point), color, right, up, s)
    }
  }

  /** Reposiciona las etiquetas de cota y ajusta su tamaño de fuente al zoom (texto en unidades de mundo). */
  private updateDimLabels(): void {
    const wpp = this.controller.worldPerPx()
    for (const l of this.dimLabels) {
      const px = this.controller.project(l.pos)
      if (!px) {
        l.el.style.display = 'none'
        continue
      }
      l.el.style.display = 'block'
      l.el.style.left = `${px[0]}px`
      l.el.style.top = `${px[1]}px`
      l.el.style.fontSize = `${Math.max(7, l.height / wpp)}px`
    }
  }

  private tick = (): void => {
    // Todo el cuerpo va protegido: un error puntual (geometría degenerada, etc.) NUNCA debe
    // detener el loop de animación y congelar el viewport. Pase lo que pase, se re-agenda el RAF.
    try {
      this.data = this.provider?.() ?? null
      if (this.spin && !this.dragging) {
        this.controller.orbit(this.spin.dx, this.spin.dy)
        this.invalidate()
      }
      // Fuera del primer punto de un comando de dibujo, la UCS dinámica no aplica: se borra el resaltado.
      if (this.ducsFace && !this.data?.ducs) {
        this.ducsFace = null
        this.disposeGroup(this.ducsGroup)
        this.invalidate()
      }
      const data = this.data
      // Adquisición de puntos para el tracking: el cursor "en reposo" no genera eventos de puntero,
      // así que el conteo del hover se evalúa en el loop (barato: sólo compara una clave).
      const prompting = !!data?.pointPrompt
      // Al empezar o terminar un prompt de punto se descarta el último snap: uno viejo (de otro comando o de una
      // capa que ya se apagó) no debe adquirirse para el tracking aunque el cursor no se mueva.
      if (prompting !== this.lastPointPrompt) {
        const w = this.lastWorldRaw
        this.snapResult = { point: { x: w.x, y: w.y, z: w.z }, type: null }
        this.hoverKey = ''
        this.hoverConsumed = false
      }
      this.updateTrackingAcquisition()
      // Al terminar el comando (se cierra el prompt de punto) se sueltan los puntos adquiridos,
      // como hace el CAD clásico: el tracking vive dentro de una operación.
      if (this.lastPointPrompt && !prompting) this.clearTracking()
      this.lastPointPrompt = prompting
      // El rubber-band depende del prompt: al cancelar (ESC), terminar o avanzar a otro punto (aunque el
      // cursor no se mueva) se vuelve a dibujar, así no queda un trazo provisorio colgado en pantalla.
      // GRID / F7: la grilla del modelo se muestra u oculta.
      const gridVisible = this.kind === 'model' && data?.gridOn !== false
      if (this.grid.visible !== gridVisible) {
        this.grid.visible = gridVisible
        this.invalidate()
      }
      const base = data?.snapBase
      const promptKey = prompting ? (base ? `${base.x},${base.y},${base.z}` : '-') : ''
      if (promptKey !== this.lastPromptKey) {
        this.lastPromptKey = promptKey
        this.invalidate()
      }
      if (data) {
        const selKey = data.selection.join(',')
        const fieldsKey = this.hasFieldTexts && data.fields ? JSON.stringify(data.fields) : this.lastFieldsKey
        if (data.revision !== this.lastRevision || selKey !== this.lastSelectionKey || fieldsKey !== this.lastFieldsKey || data.annoScale !== this.lastAnnoScale) {
          this.lastRevision = data.revision
          this.lastAnnoScale = data.annoScale
          this.lastSelectionKey = selKey
          this.expanded = expandEntities(data.entities, data.blocks, { attdisp: data.attdisp })
          this.snapList = null
          this.hasFieldTexts = this.expanded.some(
            (e) => (e.type === 'TEXT' && hasFields(e.props.text)) || (e.type === 'DIMENSION' && !!e.props.textOverride && hasFields(e.props.textOverride)),
          )
          this.lastFieldsKey = this.hasFieldTexts && data.fields ? JSON.stringify(data.fields) : ''
          this.snapSpheres = null // el índice espacial de snap se reconstruye con los datos nuevos
          this.rebuild(this.expanded, data.layers, new Set(data.selection))
          this.invalidate()
        }
      }

      // Cambio de cámara (orientación + pan + zoom + tamaño) → re-dibujar.
      const c = this.controller
      const camKey = `${c.az.toFixed(4)},${c.el.toFixed(4)},${c.mode},${c.target.x.toFixed(3)},${c.target.y.toFixed(3)},${c.target.z.toFixed(3)},${c.radius.toFixed(3)},${this.width}x${this.height}`
      if (camKey !== this.lastCamKey) {
        this.lastCamKey = camKey
        this.invalidate()
        const orient = `${c.az.toFixed(4)},${c.el.toFixed(4)},${c.mode}`
        if (orient !== this.lastOrient) {
          this.lastOrient = orient
          this.orientGrid() // la grilla sigue el plano de construcción de la vista
          this.cb.onCameraChange?.(c.az, c.el, c.mode)
        }
        this.cb.onViewChange?.()
        this.updateUcsIcon()
        // al cambiar el zoom de forma apreciable, las piezas pueden cambiar de clase.
        if (this.lodOn && this.expanded && data) {
          const bucket = this.lodBucketKey()
          if (bucket !== this.lodBucket) {
            this.lodBucket = bucket
            if (this.classifyLod(this.expanded)) {
              this.rebuild(this.expanded, data.layers, new Set(data.selection))
              this.lodBucket = this.lodBucketKey()
            }
          }
        }
      }

      // Render ON-DEMAND: solo cuando algo cambió (clave para modelos pesados en reposo).
      if (this.dirty) {
        this.updateSnapGlyph()
        this.updateBox()
        this.updatePreview()
        this.updateGrips()
        this.updateDimLabels()
        this.updateTextLabels()
        this.aimLights()
        this.updateLineweights()
        this.updateSilhouettes()
        this.renderer.render(this.scene, this.controller.camera)
        this.dirty = false
      }
    } catch (err) {
      console.warn('Cota: render loop error (continuing).', err)
    } finally {
      this.raf = requestAnimationFrame(this.tick)
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.disposeGroup(this.entityGroup)
    this.disposeGroup(this.previewGroup)
    this.disposeGroup(this.snapGroup)
    this.disposeGroup(this.gripGroup)
    this.clearDimLabels()
    this.clearTextLabels()
    this.previewMaterial.dispose()
    this.trackMaterial.dispose()
    this.snapMaterial.dispose()
    this.renderer.dispose()
    if (this.boxEl.parentElement === this.container) this.container.removeChild(this.boxEl)
    if (this.ucsIconEl?.parentElement === this.container) this.container.removeChild(this.ucsIconEl)
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
