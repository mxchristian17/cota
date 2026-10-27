import { frozenLayerIds, layerEditable, layerShown } from '../core/layers/visibility'
import { type ProjStd } from '../core/viewNet'
import { setChainBase } from '../core/commands/impl/dim'
import { reassociatePoint } from '../core/dimension/assoc'
import type { DimStyleDef, DimVarName, DimVars } from '../core/dimension/style'
import type { Deferred } from '../core/geom/tangency'
import { create } from 'zustand'
import { DocumentModel, MODEL_TAB } from '../core/document/DocumentModel'
import { LayerService } from '../core/layers/LayerService'
import { CommandEngine } from '../core/commands/CommandEngine'
import { registerDefaultCommands } from '../core/commands/registry'
import { applySysvars, persistedSysvars, sysvars, type PersistedSysvars } from '../core/commands/sysvars'
import type { AppHooks, Command } from '../core/commands/types'
import type { DimensionProps, DocumentData, DrawingVars, Entity, HatchIsland, SolidProps, EntityProps, EntityType, LineType, PageSetup } from '../core/document/types'
import { rebuildHatchLoops } from '../core/hatch/assoc'
import { DEFAULT_THEME, normalizeTheme, type Theme } from '../core/theme'
import { DEFAULT_OSNAP, normalizeOsnap, type OsnapConfig, type OsnapKind } from '../core/snap/osnap'
import type { Pt, Vec3 } from '../core/math'
import type { PreviewShape } from '../core/preview'
import { isWorldUcs, normalizeUcs, sameUcs, ucsToDef, WORLD_UCS, type Ucs } from '../core/ucs'
import { DEFAULT_PALETTE, normalizePalette, type PaletteState } from '../core/ui/palette'
import { dockToolbar, normalizeToolbar, normalizeToolbars, type ToolbarSide, type ToolbarState, type ToolbarStates } from '../core/ui/toolbar'
import { DEFAULT_TOOLBARS, findToolbar } from '../core/ui/toolbars'
import { pickPrefs, readLocalPrefs, writeLocalPrefs, type Prefs } from '../core/ui/prefs'
import { enterFullscreen, exitFullscreen } from '../ui/appWindow'
import { DEFAULT_VISUAL_STYLE, VISUAL_STYLES, type CameraMode, type ViewName, type VisualStyle } from '../core/view'
import type { CameraState, Viewport } from '../render/Viewport'
import { entitiesInScreenBox, entityOutline, type RectPx } from '../core/editing/bounds'
import { applyGrip, type Grip } from '../core/editing/grips'
import { mergeSelection } from '../core/editing/selection'
import { applyField } from '../core/editing/props'
import { expandEntities, blockAttdefs } from '../core/editing/block'
import { activateTab, defaultMsViewport, neighborTab, nextMsViewport, setupDefaultSheet, type SheetInit } from '../core/layout/layouts'
import {
  BUILTIN_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  NO_TEMPLATE_ID,
  TEMPLATE_EXT,
  LEGACY_TEMPLATE_EXT,
  addLayoutFromBuiltin,
  addLayoutFromTemplate,
  builtinSheetInit,
  layoutToTemplate,
  parseTemplate,
  templateSheetInit,
  type LayoutTemplate,
} from '../core/layout/template'
import { layoutViews, mergeSegments, orthoProject, projectHidden, segmentsBounds, snapToHints, solidCircleHints, viewHints, viewOffsets, type CircleHint, type Mesh, type ProjBasis, type ProjItem } from '../core/projection/orthographic'
import { fromVec3 } from '../core/math'
import { exportPdf } from '../core/io/pdf'
import { plotLayouts } from '../core/io/layoutPlot'
import { fieldContextFor, resolveFieldTexts } from '../core/fields/context'
import { exportObj, importObj, type ObjMesh } from '../core/io/obj'
import { exportDxf, importDxf } from '../core/io/dxf'
import {
  ensurePermission,
  fsaSupported,
  fileHandleAt,
  listFilesIn,
  listDrawings,
  permissionState,
  pickWorkspace,
  readTextFile,
  writeDrawing,
  writeTextFile,
  type FsDirHandle,
  type FsFileHandle,
  type LocalDrawing,
} from '../core/io/fileSystem'
import { CLOUD_ENABLED } from '../core/io/backend'
import { idbDelete, idbGet, idbSet } from '../core/io/idb'
import { DRAWING_EXT, DRAWING_EXTS, isDrawingFile, splitDrawingPath } from '../core/io/paths'
import { selectableEntities } from '../core/commands/selectionSets'
import { DEFAULT_FLATSHOT, flatshotItems, type FlatshotOptions } from '../core/projection/flatshot'
import { alignDrawingViews, isDrawingView, isShaded, showsHidden, viewBlockEntities } from '../core/drawing/views'
import { shadeViewTriangles } from '../core/projection/shade'
import { solidMesh, solidMeshWithSurfaces } from '../render/csg'
import { parseStl } from '../core/io/stl'
import { ApiError, api, type DocumentSummary } from '../core/io/apiClient'
import { moveLayerTo } from '../core/layers/order'

/** Plantilla de layout disponible (incluida, en la carpeta de trabajo o en la biblioteca del navegador). */
/** Ajustes del panel de sombreado. */
export interface HatchSettingsPatch {
  pattern?: string
  scale?: number
  angleDeg?: number
  spacing?: number
  double?: boolean
  island?: HatchIsland
  assoc?: boolean
}

export interface TemplateEntry {
  id: string
  name: string
  source: 'builtin' | 'folder' | 'library'
}

const MAX_OUTPUT = 200
const MAX_UNDO = 100

export interface AppState {
  readonly doc: DocumentModel
  readonly layerSvc: LayerService
  readonly engine: CommandEngine
  version: number
  currentLayerId: string
  prompt: string
  output: string[]
  cursor: Pt
  helpOpen: boolean
  ortho: boolean
  /** Grilla visible en el modelo (GRID, F7). */
  gridOn: boolean
  /** Pantalla completa elegida (FULLSCREEN): se recuerda y se reactiva con el primer gesto. */
  fullscreen: boolean
  gridSnap: boolean
  gridStep: number
  esnap: boolean
  /** Object snap tracking (OTRACK / F11): alineaciones desde puntos adquiridos. */
  otrack: boolean
  ucs: Ucs
  /** Nombre de la UCS actual si es una guardada o World; null = sin nombre. */
  ucsName: string | null
  /** Administrador de estilos de cota abierto (`DIMSTYLE`). */
  dimStyleOpen: boolean
  /** Menú contextual de cotas (clic derecho con cotas seleccionadas), en coordenadas de pantalla. */
  dimMenu: { x: number; y: number; world: Vec3 } | null
  theme: Theme
  optionsOpen: boolean
  /** Contador que cambia cuando se modifican las variables persistidas (re-render de OPTIONS). */
  sysvarRev: number
  osnap: OsnapConfig
  osnapOpen: boolean
  visualStyle: VisualStyle
  /** Paleta de Propiedades: abierta/minimizada, acople y geometría. */
  propsPalette: PaletteState
  /** Barras de herramientas: visible, acoplada (borde y orden) o flotante, por id. */
  toolbars: ToolbarStates
  /** Diálogo TOOLBAR: lista de barras para mostrar u ocultar. */
  toolbarDialogOpen: boolean
  /** Alto (px) del historial de la línea de comandos (se recuerda). */
  cmdHeight: number
  /** Modal del administrador de capas (comando LAYER). */
  layersOpen: boolean
  autosave: boolean
  /** Diálogo de FLATSHOT abierto y sus últimas opciones. */
  flatshotOpen: boolean
  flatshotOptions: FlatshotOptions
  /** Cierra el diálogo de FLATSHOT: con opciones = Create, null = Cancel. */
  resolveFlatshot: (opts: FlatshotOptions | null) => void
  /** Pantalla limpia (CLEANSCREENON, Ctrl+0): oculta barras y paletas para dibujar con todo el espacio. */
  cleanScreen: boolean
  /** Línea de comandos compacta (COMMANDLINEHIDE, Ctrl+9): sólo la fila de entrada, sin el historial. */
  commandLineCompact: boolean
  /** Cubo de vistas visible (NAVVCUBE). */
  viewCubeOn: boolean
  /** Disposición del cubo desplegado: ISO-E (primer diedro, predeterminada) o ISO-A. */
  viewNetStd: ProjStd
  // IA / LLM
  aiOpen: boolean
  aiProcessing: boolean
  aiMessage: string
  aiHasKey: boolean
  aiProvider: string
  aiApiBase: string
  aiModel: string
  aiHasProposal: boolean
  aiChanges: string[]
  aiMinimized: boolean
  aiLod: number
  aiLog: string[]
  /** Objetos que el comando en curso tomó con un clic: se ven resaltados (no son la selección). */
  picked: string[]
  selection: string[]
  // auth / persistencia
  token: string | null
  email: string | null
  docId: string | null
  docName: string
  docFolder: string
  loginOpen: boolean
  openOpen: boolean
  docList: DocumentSummary[]
  // --- Carpeta local del sistema ---
  /** El navegador soporta la File System Access API (Chrome/Edge). */
  fsSupported: boolean
  /** Nombre de la carpeta de trabajo elegida, o null si se trabaja contra el backend. */
  fsFolderName: string | null
  /** Ruta relativa del archivo abierto dentro de esa carpeta. */
  fsFilePath: string | null
  /** Hay una carpeta recordada pero el navegador espera un gesto para devolver el permiso. */
  fsPending: boolean
  /** Dibujos encontrados en la carpeta local (alimenta el diálogo Open). */
  fsList: LocalDrawing[]
  authError: string | null
  viewports: Viewport[]
  activeViewport: Viewport | null
  viewportLayout: number
  camAz: number
  camEl: number
  camMode: CameraMode

  registerViewport: (vp: Viewport) => void
  unregisterViewport: (vp: Viewport) => void
  setActiveViewport: (vp: Viewport) => void
  setViewportLayout: (n: number) => void
  /** Pestaña activa: `MODEL_TAB` o id de layout. Cancela el comando en curso. */
  setActiveTab: (id: string) => void
  /** Ctrl+PgUp/PgDn: pestaña vecina (circular). */
  cycleTab: (delta: number) => void
  newLayout: () => void
  copyLayout: (id: string) => void
  /** Renombra un layout; devuelve false (e imprime el motivo) si el nombre no es válido. */
  renameLayout: (id: string, name: string) => boolean
  deleteLayout: (id: string) => void
  moveLayout: (id: string, delta: number) => void
  /** Entra al modelo por un viewport del layout (MSPACE) o vuelve al papel (null). */
  setMsViewport: (id: string | null) => void
  /** La vista de un viewport flotante cambió (sin tocar la geometría): refresca la UI. */
  viewportViewChanged: () => void
  /** Botón MODEL/PAPER de la barra de estado: alterna MSPACE (último viewport) y PSPACE. */
  toggleModelPaper: () => void
  /** Ctrl+R: siguiente viewport (flotante en MSPACE o panel de Model). */
  cycleViewport: () => void
  setCameraState: (az: number, el: number, mode: CameraMode) => void
  setView: (v: ViewName) => void
  setCameraMode: (m: CameraMode) => void
  submitCommand: (text: string) => void
  /** `subtract` = el click llegó con Shift: resta de la selección en vez de sumar (CAD clásico). */
  viewportClick: (world: Pt, pickedId: string | null, snapped?: boolean, subtract?: boolean, raw?: Pt, deferred?: Deferred, face?: Ucs) => void
  /** Activa un grip (1 clic): inicia la edición; el punto final se fija con el mouse o por coordenadas. */
  beginGripEdit: (entityId: string, grip: Grip) => void
  gripEdit: (entityId: string, grip: Grip, to: [number, number, number], pickedId?: string | null) => void
  boxSelect: (
    rect: RectPx,
    crossing: boolean,
    project: (p: Pt) => [number, number] | null,
    subtract?: boolean,
  ) => void
  isSelectMode: () => boolean
  cancel: () => void
  setCurrentLayer: (id: string) => void
  createLayer: (name: string) => void
  /** Orden de capas: mueve la capa a la posición `to` de la lista (0 = se dibuja arriba). */
  moveLayer: (id: string, to: number) => void
  setLayerColor: (id: string, color: string) => void
  deleteLayer: (id: string) => void
  setLayerLineWeight: (id: string, w: number) => void
  setLayerLineType: (id: string, t: LineType) => void
  /** Administrador de tipos de línea (LINETYPE); con `layerId` elige el tipo de esa capa. */
  linetypeDialog: { layerId?: string } | null
  openLinetypeDialog: (opts?: { layerId?: string }) => void
  closeLinetypeDialog: () => void
  /** Carga tipos de línea de la biblioteca (`Load…`). */
  loadLinetypes: (names: string[]) => void
  /** Borra un tipo de línea que no se usa (false si está en uso). */
  deleteLinetype: (name: string) => boolean
  /** Variable del dibujo (LTSCALE, CELTYPE, CELTSCALE…), un paso de undo. */
  setDrawingVar: <K extends keyof DrawingVars>(name: K, value: DrawingVars[K]) => void
  /** Tipo de línea o su escala en varios objetos (paleta de Propiedades). */
  setEntitiesCommon: (ids: string[], key: 'lineType' | 'ltScale', value: string | number) => void
  /** Menú del clic derecho en el modo Realtime de ZOOM/PAN. */
  realtimeMenu: { x: number; y: number } | null
  setRealtimeMenu: (m: { x: number; y: number } | null) => void
  /** Acción del menú Realtime: Exit, Pan, Zoom, Zoom Window, Zoom Original, Zoom Extents. */
  realtimeAction: (a: 'exit' | 'pan' | 'zoom' | 'window' | 'original' | 'extents') => void
  /** Panel *Hatch Creation* / *Hatch Editor*: los sombreados a los que se aplican los cambios. */
  hatchPanel: { mode: 'create' | 'edit'; ids: string[] } | null
  setHatchPanel: (p: { mode: 'create' | 'edit'; ids: string[] } | null) => void
  /** Cambia un ajuste del panel: la variable HP* (al crear) y los sombreados del panel. */
  applyHatchSetting: (patch: HatchSettingsPatch) => void
  toggleLayerVisible: (id: string) => void
  toggleLayerLock: (id: string) => void
  /** Freeze/Thaw: la capa actual no se congela; congelar quita sus objetos de la selección. */
  toggleLayerFrozen: (id: string) => void
  setCursor: (p: Pt) => void
  openHelp: () => void
  closeHelp: () => void
  toggleOrtho: () => void
  /** GRID / F7: muestra u oculta la grilla; sin argumento, alterna. */
  setGrid: (on?: boolean) => void
  /** FULLSCREEN: pantalla completa total; sin argumento, alterna. `apply = false` sólo anota la preferencia. */
  setFullscreen: (on?: boolean, apply?: boolean) => void
  toggleSnap: () => void
  toggleEsnap: () => void
  toggleOtrack: () => void
  setUcs: (ucs: Ucs, name?: string, temporary?: boolean) => void
  openDimStyle: () => void
  closeDimStyle: () => void
  /** Estilo de cota actual (combo de la barra de cotas). */
  setCurrentDimStyle: (name: string) => void
  /** DIMSTYLE: crear/modificar, renombrar, borrar estilos y overrides del actual. */
  saveDimStyle: (def: DimStyleDef) => void
  renameDimStyle: (from: string, to: string) => boolean
  deleteDimStyle: (name: string) => boolean
  setDimStyleOverrides: (vars: DimVars | null) => void
  /** Paleta: estilo o variable (override) de una o varias cotas. */
  setDimensionsStyle: (ids: string[], styleName: string) => void
  setDimensionsVar: (ids: string[], name: DimVarName, value: unknown) => void
  openDimMenu: (x: number, y: number, world: Vec3) => void
  /** Escala de anotación del modelo (`CANNOSCALE`), relación papel:modelo. */
  setCannoscale: (v: number) => void
  closeDimMenu: () => void
  /** Edita in-place las cotas indicadas (un paso de undo). */
  editDimensions: (ids: string[], fn: (p: DimensionProps) => void) => void
  /** *Continue/Baseline Dimension* desde una cota existente (menú contextual). */
  chainFromDimension: (id: string, baseline: boolean) => void
  setTheme: (patch: Partial<Theme>) => void
  openOptions: () => void
  closeOptions: () => void
  /** Cambia variables de FILLET/CHAMFER persistidas (diálogo OPTIONS). */
  setSysvars: (patch: Partial<PersistedSysvars>) => void
  setOsnap: (kind: OsnapKind, value: boolean) => void
  setAllOsnap: (value: boolean) => void
  openOsnap: () => void
  closeOsnap: () => void
  setVisualStyle: (mode: VisualStyle) => void
  /** Muestra/oculta la paleta de Propiedades (comando PROPERTIES, botón ☰). */
  toggleProperties: () => void
  openProperties: () => void
  setPropsPalette: (patch: Partial<PaletteState>) => void
  /** Cambia una barra; al acoplarla a otro borde (o al volver de flotante) va al final de ese borde. */
  setToolbar: (id: string, patch: Partial<ToolbarState>) => void
  /** Acopla una barra en un borde, en la posición `index` entre las que ya están (arrastrar y soltar). */
  dockToolbarAt: (id: string, side: ToolbarSide, index?: number) => void
  setAllToolbars: (visible: boolean) => void
  /** Vuelve todas las barras a su estado inicial (sólo Dimension visible). */
  resetToolbars: () => void
  openToolbarDialog: () => void
  closeToolbarDialog: () => void
  /** Botón de barra: cancela el comando en curso y teclea el comando con sus respuestas; los de referencia
   *  a objetos (`transparent`) entran en el prompt actual. */
  runMacro: (steps: string[], transparent?: boolean) => void
  setCmdHeight: (h: number) => void
  /** Aplica preferencias guardadas (navegador o cuenta). */
  applyPrefs: (d: Record<string, unknown>) => void
  openLayers: () => void
  closeLayers: () => void
  renameLayer: (id: string, name: string) => void
  setLayerPrintable: (id: string, printable: boolean) => void
  /** Layout cuyo Page Setup se está editando (diálogo PAGESETUP), o null. */
  pageSetupFor: string | null
  openPageSetup: (layoutId?: string) => void
  closePageSetup: () => void
  applyPageSetup: (layoutId: string, ps: PageSetup) => void
  /** Diálogo de plantillas: crear desde plantilla o guardar un layout como plantilla. */
  templateDialog: { mode: 'from' | 'save'; layoutId?: string } | null
  openTemplateDialog: (mode: 'from' | 'save', layoutId?: string) => void
  closeTemplateDialog: () => void
  listTemplates: () => Promise<TemplateEntry[]>
  newLayoutFromTemplate: (id: string, name?: string) => Promise<void>
  /** Layout desde un `.cotat` abierto del disco. */
  newLayoutFromTemplateText: (text: string, name?: string) => void
  saveLayoutAsTemplate: (layoutId: string, name: string) => Promise<void>
  /** Plantilla predeterminada de los layouts nuevos (OPTIONS): id de `listTemplates` o `none`. */
  defaultTemplate: string
  setDefaultTemplate: (id: string) => Promise<void>
  /** Diálogo de atributos abierto (INSERT con ATTDIA=1, EATTEDIT, doble clic en un bloque). */
  attDialog: { title: string; items: { tag: string; prompt: string; value: string }[] } | null
  /** Cierra el diálogo de atributos con los valores (o null = cancelar). */
  closeAttDialog: (values: string[] | null) => void
  /** Doble clic sobre una entidad: bloque con atributos → editor de atributos; si no, Propiedades. */
  entityDoubleClick: (id: string) => void
  /** Diálogo DWGPROPS (propiedades del dibujo para los campos). */
  dwgPropsOpen: boolean
  openDwgProps: () => void
  closeDwgProps: () => void
  setDrawingProps: (patch: Partial<DocumentData['meta']>) => void
  /** *VP Freeze*: congela/descongela la capa en el viewport de MSPACE. */
  setLayerVpFrozen: (id: string, frozen: boolean) => void
  /** *New VP Freeze*: la capa nace congelada en los viewports nuevos. */
  setLayerNewVpFreeze: (id: string, frozen: boolean) => void
  toggleAutosave: () => void
  /** Ajustes de pantalla: pantalla limpia, línea de comandos compacta, cubo de vistas. */
  setScreen: (patch: { cleanScreen?: boolean; commandLineCompact?: boolean; viewCubeOn?: boolean; viewNetStd?: ProjStd }) => void
  redraw: () => void
  openAi: () => void
  closeAi: () => void
  setAiConfig: (cfg: { provider: string; apiBase: string; model: string; apiKey: string }) => Promise<void>
  submitAiPrompt: (text: string) => Promise<void>
  acceptAiProposal: () => void
  discardAiProposal: () => void
  setAiMinimized: (v: boolean) => void
  setAiLod: (n: number) => void
  exportPdf: () => void
  /** PUBLISH: un PDF con una página por layout (en el orden de las pestañas). */
  publishLayouts: (ids: string[]) => void
  importFile: () => void
  /** OPEN ▸ Device: selector de archivos del sistema (.cota/.dxf/.dwg), fuera de la carpeta de trabajo. */
  openFromDevice: () => void
  /** Abre como dibujo un archivo elegido del dispositivo (sin ruta: SAVE lo guarda como nuevo). */
  openDeviceFile: (file: File) => Promise<void>
  exportModel: (format: 'OBJ' | 'DXF' | 'DWG') => void
  computePreview: (cursor: Pt) => PreviewShape[]
  listCommands: () => Command[]
  clearSelection: () => void
  /** Deja seleccionada exactamente una entidad (doble clic en el viewport). */
  selectEntity: (id: string) => void
  /** Ctrl+A: con un prompt de selección agrega todo (ALL); sin comando, selecciona todo. */
  selectAll: () => void
  deleteSelection: () => void
  undo: () => void
  redo: () => void
  updateEntityLayer: (id: string, layerId: string) => void
  updateEntityNumber: (id: string, path: string, value: number) => void
  /** Edita una propiedad de la entidad (número/texto/enum/booleano) desde la paleta de Propiedades. */
  updateEntityField: (id: string, key: string, value: number | string | boolean) => void
  // auth actions
  login: (email: string, password: string, register: boolean) => Promise<void>
  restoreSession: () => Promise<void>
  logout: () => Promise<void>
  /** Escribe una línea en la salida de la línea de comandos (feedback al usuario). */
  notify: (line: string) => void
  closeLogin: () => void
  openLoginDialog: () => void
  // document actions
  newDocument: () => void
  saveDocument: () => Promise<void>
  openDocumentsDialog: () => Promise<void>
  /** Elige (o cambia) la carpeta de trabajo del sistema. */
  pickWorkspaceFolder: () => Promise<void>
  /** Reconecta la carpeta recordada tras recargar (requiere gesto del usuario). */
  reconnectWorkspace: () => Promise<void>
  /** Desconecta la carpeta local y vuelve a guardar en el backend. */
  useCloudStorage: () => void
  /** Abre un dibujo de la carpeta local por su ruta relativa. */
  openLocalDrawing: (path: string) => Promise<void>
  loadDocument: (id: string) => Promise<void>
  deleteDocument: (id: string) => Promise<void>
  closeOpen: () => void
  setDocName: (name: string) => void
  /** Fija carpeta + nombre desde una ruta "carpeta/sub/nombre" (para el campo editable / SAVE). */
  setDocPath: (path: string) => void
}

/** Refleja el color/tamaño de crosshair del tema en variables CSS. */
function setCrosshairVars(theme: Theme): void {
  if (typeof document === 'undefined') return
  const r = document.documentElement.style
  r.setProperty('--crosshair-color', theme.crosshairColor)
  r.setProperty('--crosshair-size', `${theme.crosshairSize}px`)
}
setCrosshairVars(DEFAULT_THEME)

/** Clave del handle de la carpeta de trabajo en IndexedDB. */
const WORKSPACE_KEY = 'workspaceDir'

/** Modelos 3D que OPEN abre como un dibujo nuevo (cada cuerpo, una malla). */
const MODEL_EXTS = ['.stl', '.obj', '.step', '.stp', '.iges', '.igs']

async function readModelFile(file: File, lower: string): Promise<Array<Pick<ObjMesh, 'vertices' | 'faces'>>> {
  if (lower.endsWith('.stl')) return [parseStl(await file.arrayBuffer())]
  if (lower.endsWith('.obj')) {
    const meshes = importObj(await file.text())
    if (!meshes.length) throw new Error('the OBJ file has no faces')
    return meshes
  }
  const { readCadFile } = await import('../core/io/occt')
  return readCadFile(await file.arrayBuffer(), lower.endsWith('.step') || lower.endsWith('.stp') ? 'step' : 'iges')
}

export const useStore = create<AppState>((set, get) => {
  const doc = DocumentModel.createDefault()
  const layerSvc = new LayerService(doc)

  // Handles de la File System Access API: viven fuera del estado de React (no son serializables).
  let workspaceDir: FsDirHandle | null = null
  let currentFile: FsFileHandle | null = null

  /** Aplica el tema a todos los viewports vivos y a las variables CSS. */
  const applyTheme = (theme: Theme) => {
    get().viewports.forEach((vp) => vp.setTheme(theme))
    setCrosshairVars(theme)
  }

  // --- Importación de geometría (reutilizada por OBJ/DXF/DWG) ---
  /** Importa un DXF al dibujo actual; con `asDrawing` (OPEN de un .dxf/.dwg) además toma su `$CLAYER`. */
  const importDxfText = (text: string, asDrawing = false): number => {
    const { currentLayer, layers, entities, dimStyles, linetypes, vars, unsupported } = importDxf(text)
    // Tipos de línea: los del LTYPE del archivo; al abrir un DXF también sus variables.
    for (const d of linetypes) if (asDrawing || !doc.linetype(d.name)) doc.loadLinetype(d.name, d, true)
    if (asDrawing) for (const [k, v] of Object.entries(vars)) doc.setVar(k as keyof DrawingVars, v as never)
    // Estilos de cota: al abrir un DXF mandan los del archivo; al importar en otro dibujo, los existentes.
    for (const st of dimStyles) if (asDrawing || !doc.dimStyleDef(st.name)) doc.saveDimStyle(st)
    const idByName = new Map(doc.layers.map((l) => [l.name.toLowerCase(), l.id]))
    for (const ls of layers) {
      const key = ls.name.toLowerCase()
      if (idByName.has(key)) continue
      try {
        const l = layerSvc.create(ls.name, {
          color: ls.color,
          lineWeight: ls.lineWeight,
          lineType: ls.lineType,
          visible: ls.visible,
          locked: ls.locked,
          printable: ls.printable,
          frozen: ls.frozen,
        })
        idByName.set(key, l.id)
      } catch {
        /* nombre duplicado: reutilizar el existente */
      }
    }
    for (const e of entities) {
      const layerId = idByName.get(e.layerName.toLowerCase()) ?? doc.firstLayerId
      const added = doc.addEntity({ type: e.type, layer: layerId, props: e.props, lineType: e.lineType ?? 'BYLAYER', ltScale: e.ltScale ?? 1 })
      if (added.lineType && added.lineType !== 'BYBLOCK') doc.loadLinetype(added.lineType)
      if (added.type === 'DIMENSION' && doc.dimStyleDef(added.props.styleName ?? '')) doc.restyleDimension(added.props, added.props.styleName, undefined)
    }
    if (unsupported.length) print(`Unsupported entities skipped: ${unsupported.join(', ')}.`)
    const clayer = currentLayer && idByName.get(currentLayer.toLowerCase())
    if (asDrawing) set({ currentLayerId: clayer || doc.firstLayerId })
    return entities.length
  }
  const importObjText = (text: string): number => {
    const layer = get().currentLayerId
    const meshes = importObj(text)
    for (const m of meshes) {
      doc.addEntity({ type: 'MESH3D', layer, props: { vertices: m.vertices, faces: m.faces } })
    }
    return meshes.length
  }
  /** Envuelve un importador con snapshot de undo + reencuadre + mensajes. */
  const runImport = (importer: () => number, label: (n: number) => string) => {
    pushSnapshot()
    const n = importer()
    if (n === 0) {
      undoStack.pop()
      print('Nothing imported.')
      return
    }
    bump()
    get().activeViewport?.zoomExtents()
    print(label(n))
  }

  const print = (line: string) => set((s) => ({ output: [...s.output, line].slice(-MAX_OUTPUT) }))
  const bump = () => {
    doc.updateAssociativeDims() // las cotas asociativas siguen a la geometría
    doc.updateAssociativeHatches() // y los sombreados asociativos a su contorno
    // Las vistas proyectadas siguen alineadas con su vista madre.
    if (doc.activeLayout && alignDrawingViews(doc.activeLayout.entities)) doc.touch()
    set((s) => ({ version: s.version + 1 }))
  }

  // --- Undo/redo (snapshots del documento y cambios de vista) ---
  /**
   * Paso de deshacer de una vista: como el CAD clásico, ZOOM, PAN, la rueda, la órbita y las vistas se
   * deshacen; los cambios de vista seguidos se combinan en un solo paso ("Combine zoom and pan commands").
   */
  interface ViewUndo {
    kind: 'view'
    vp: Viewport
    cam: CameraState
    ucs: Ucs
  }
  type UndoEntry = DocumentData | ViewUndo
  const isView = (e: UndoEntry | undefined): e is ViewUndo => !!e && (e as ViewUndo).kind === 'view'
  const undoStack: UndoEntry[] = []
  const redoStack: UndoEntry[] = []
  let restoringView = false
  /** Id de la capa `name` (la crea si no existe), p. ej. MD_Visible / MD_Hidden de las vistas de dibujo. */
  const ensureLayerId = (name: string, lineType?: string, color?: string): string => {
    const l = doc.layers.find((x) => x.name.toLowerCase() === name.toLowerCase())
    if (l) return l.id
    try {
      return layerSvc.create(name, { ...(lineType ? { lineType } : {}), ...(color ? { color } : {}) }).id
    } catch {
      return doc.firstLayerId
    }
  }
  /** Base de proyección de la vista del viewport activo (FLATSHOT, VIEWBASE ▸ Current). */
  const currentViewBasis = (): ProjBasis | null => {
    const vp = get().activeViewport
    if (!vp) return null
    const { right, up } = vp.viewAxes()
    const out: Vec3 = [right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0]]
    return { right, up, out }
  }
  /** Mallas (y círculos exactos) de lo 3D visible del modelo, o de los objetos `ids`. */
  const modelMeshes = (ids: string[] | null): { meshes: Mesh[]; hints: CircleHint[]; colors: string[] } => {
    const shown = new Map(doc.layers.map((l) => [l.id, layerShown(l)]))
    const colorOf = new Map(doc.layers.map((l) => [l.id, l.color]))
    const colors: string[] = []
    const pick = ids ? new Set(ids) : null
    const src = pick ? doc.modelEntities.filter((e) => pick.has(e.id)) : doc.modelEntities
    const meshes: Mesh[] = []
    const hints: CircleHint[] = []
    for (const e of expandEntities(src, doc.blocks, { skipLayers: frozenLayerIds(doc.layers) })) {
      if (shown.get(e.layer) === false) continue
      if (e.type === 'SOLID3D') {
        const m = solidMeshWithSurfaces(e.props)
        if (m.vertices.length) {
          meshes.push(m)
          colors.push(colorOf.get(e.layer) ?? '#c0c0c0')
        }
        hints.push(...solidCircleHints(e.props))
      } else if (e.type === 'MESH3D') {
        meshes.push({ vertices: e.props.vertices, faces: e.props.faces })
        colors.push(colorOf.get(e.layer) ?? '#c0c0c0')
      }
    }
    return { meshes, hints, colors }
  }
  /** Proyección 2D (líneas ocultas) de lo 3D visible del modelo, o de los objetos `ids`. */
  const projectModel = (ids: string[] | null, basis: ProjBasis, opts: { showObscured: boolean; tangential: boolean }): ProjItem[] => {
    const { meshes, hints } = modelMeshes(ids)
    return meshes.length ? flatshotItems(meshes, hints, basis, opts) : []
  }
  /** Centro 3D (caja envolvente) de lo que se documenta, proyectado a la vista: el origen común de las vistas. */
  const viewOrigin = (ids: string[] | null, basis: ProjBasis): [number, number] | null => {
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    for (const m of modelMeshes(ids).meshes) {
      for (const v of m.vertices) for (let k = 0; k < 3; k++) [lo[k], hi[k]] = [Math.min(lo[k], v[k]), Math.max(hi[k], v[k])]
    }
    if (!isFinite(lo[0])) return null
    const c = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2)
    const dotb = (b: number[]) => c[0] * b[0] + c[1] * b[1] + c[2] * b[2]
    return [dotb(basis.right), dotb(basis.up)]
  }
  /** Firma del modelo (para saber si una vista de dibujo quedó desactualizada). */
  const modelSignature = (): string => {
    const text = JSON.stringify(doc.modelEntities.map((e) => [e.id, e.type, e.layer, e.props])) + JSON.stringify(doc.blocks.filter((b) => !b.name.startsWith('*')))
    let h = 2166136261
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
    return `${text.length}:${(h >>> 0).toString(36)}`
  }
  /** VIEWUPDATE: recalcula las vistas de dibujo desactualizadas (o todas con `force`). */
  const updateDrawingViews = (ids: string[] | null, force = false): number => {
    const sig = modelSignature()
    const layers = { visible: ensureLayerId('MD_Visible', undefined, '#ffffff'), hidden: ensureLayerId('MD_Hidden', 'HIDDEN', '#ffffff') }
    let n = 0
    for (const l of [doc.modelEntities, ...doc.layouts.map((x) => x.entities)]) {
      for (const e of l) {
        if (!isDrawingView(e) || (ids && !ids.includes(e.id))) continue
        const v = e.props.view
        if (!force && v.sig === sig) continue
        const items = projectModel(v.source, v.basis, { showObscured: showsHidden(v.hidden), tangential: true })
        const shade = isShaded(v.hidden) ? (() => {
          const { meshes, colors } = modelMeshes(v.source)
          return shadeViewTriangles(meshes, colors, v.basis)
        })() : null
        doc.setBlock({ name: e.props.name, entities: viewBlockEntities(items, layers, shade, viewOrigin(v.source, v.basis)).entities })
        v.sig = sig
        n++
      }
    }
    if (n) doc.touch()
    return n
  }
  /** Resolución pendiente del diálogo de FLATSHOT (fuera del estado: no es serializable). */
  let flatshotResolve: ((o: FlatshotOptions | null) => void) | null = null
  const recordViewUndo = (vp: Viewport, cam: CameraState, ucs: Ucs) => {
    if (restoringView) return
    const top = undoStack[undoStack.length - 1]
    if (isView(top) && top.vp === vp) return // se combina con el cambio de vista anterior
    undoStack.push({ kind: 'view', vp, cam, ucs })
    if (undoStack.length > MAX_UNDO) undoStack.shift()
    redoStack.length = 0
  }
  /** Aplica un paso de vista y devuelve el opuesto (para la otra pila); null si su viewport ya no existe. */
  const applyViewUndo = (e: ViewUndo): ViewUndo | null => {
    if (!get().viewports.includes(e.vp)) return null
    const back: ViewUndo = { kind: 'view', vp: e.vp, cam: e.vp.getCamera(), ucs: e.vp.getUcs() }
    restoringView = true
    try {
      e.vp.undoView(e.cam)
      if (JSON.stringify(e.ucs) !== JSON.stringify(back.ucs)) {
        e.vp.setUcs(e.ucs)
        if (e.vp === get().activeViewport) set({ ucs: e.ucs })
      }
    } finally {
      restoringView = false
    }
    return back
  }
  let capturedBefore: DocumentData | null = null
  let capturedRev = 0
  let capturedVars: string | null = null
  /** Resolución pendiente del diálogo de atributos (fuera del estado: no es serializable). */
  let attResolve: ((values: string[] | null) => void) | null = null
  // Backup del documento antes de aplicar una propuesta de IA (para accept/discard).
  let aiBackup: DocumentData | null = null

  const pushSnapshot = () => {
    undoStack.push(doc.toJSON())
    if (undoStack.length > MAX_UNDO) undoStack.shift()
    redoStack.length = 0
  }
  /** CRUD de layouts con paso de undo; si falla (nombre inválido…) imprime el motivo y no deja rastro. */
  const layoutOp = (fn: () => void): boolean => {
    pushSnapshot()
    try {
      fn()
      bump()
      return true
    } catch (err) {
      undoStack.pop()
      print(err instanceof Error ? err.message : String(err))
      return false
    }
  }
  // --- Plantillas de layout ---
  const TEMPLATE_FOLDER = 'plantillas'
  const TEMPLATE_LIB_KEY = 'layoutTemplates'
  const DEFAULT_TEMPLATE_KEY = 'defaultLayoutTemplate'
  /** Contenido de la plantilla predeterminada guardada (las incluidas se arman al vuelo). */
  let defaultTemplateData: LayoutTemplate | null = null
  const templateLibrary = async () => (await idbGet<Record<string, LayoutTemplate>>(TEMPLATE_LIB_KEY)) ?? {}
  const readSavedTemplate = async (id: string): Promise<LayoutTemplate | null> => {
    const i = id.indexOf(':')
    const src = id.slice(0, i)
    const name = id.slice(i + 1)
    if (src === 'library') return (await templateLibrary())[name] ?? null
    if (src === 'folder' && workspaceDir) {
      const h =
        (await fileHandleAt(workspaceDir, TEMPLATE_FOLDER, name + TEMPLATE_EXT)) ??
        (await fileHandleAt(workspaceDir, TEMPLATE_FOLDER, name + LEGACY_TEMPLATE_EXT))
      return h ? parseTemplate(await readTextFile(h)) : null
    }
    return null
  }
  /** Cómo nace la hoja de un layout nuevo, según la plantilla predeterminada. */
  const sheetInit = (): SheetInit =>
    builtinSheetInit(get().defaultTemplate) ?? (defaultTemplateData ? templateSheetInit(defaultTemplateData) : setupDefaultSheet)
  /** UCS anteriores para `UCS Previous` y bandera para no apilar la que se restaura. */
  const ucsHistory: Ucs[] = []
  let restoringPrevious = false
  /** Al abrir/crear un dibujo, los paneles del modelo toman la UCS guardada en él. */
  const restoreModelUcs = () => {
    const u = normalizeUcs(doc.modelUcs ?? WORLD_UCS)
    for (const vp of get().viewports) if (vp.kind === 'model') vp.setUcs(u)
    set({ ucs: u })
  }
  const downloadText = (text: string, name: string, mime: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: mime }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  /** Hoja de un layout lista para plotear: bloques expandidos, campos evaluados y mallas para las ocultas. */
  const layoutPlotInput = (layoutId: string, base: string) => {
    const layout = doc.getLayout(layoutId)!
    const fields = fieldContextFor(doc, base + DRAWING_EXT, layoutId)
    const expand = (list: Entity[]) => resolveFieldTexts(expandEntities(list, doc.blocks, { attdisp: doc.attdisp, skipLayers: frozenLayerIds(doc.layers) }), fields)
    return {
      layout,
      paper: expand(layout.entities),
      model: expand(doc.modelEntities),
      layers: doc.layers,
      units: doc.units,
      meshOf: (e: Entity) => (e.type === 'SOLID3D' ? solidMesh(e.props) : e.type === 'MESH3D' ? e.props : null),
      linetypes: doc.linetypeContext('paper'),
    }
  }
  const downloadBytes = (bytes: Uint8Array, name: string) => {
    const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const afterRestore = () => {
    const stillThere = doc.layers.some((l) => l.id === get().currentLayerId)
    set({
      selection: [],
      currentLayerId: stillThere ? get().currentLayerId : doc.firstLayerId,
    })
    bump()
  }

  const app: AppHooks = {
    newDocument: () => get().newDocument(),
    openDialog: () => void get().openDocumentsDialog(),
    save: (name) => {
      if (name && name.trim()) {
        // "carpeta/sub/nombre" fija carpeta + nombre; un nombre simple conserva la carpeta actual.
        if (name.includes('/')) get().setDocPath(name.trim())
        else get().setDocName(name.trim())
      }
      void get().saveDocument()
    },
    docName: () => get().docName,
    loginDialog: () => get().openLoginDialog(),
    isAuthenticated: () => get().token !== null,
    undo: () => get().undo(),
    redo: () => get().redo(),
    clearSelection: () => get().clearSelection(),
    setUcs: (ucs, name, temporary) => get().setUcs(ucs, name, temporary),
    getUcs: () => get().ucs,
    ucsName: () => get().ucsName,
    previousUcs: () => {
      const u = ucsHistory.pop()
      if (!u) return null
      restoringPrevious = true
      try {
        get().setUcs(u)
      } finally {
        restoringPrevious = false
      }
      return u
    },
    viewAxes: () => get().activeViewport?.viewAxes() ?? null,
    planView: (u) => get().activeViewport?.planView(u),
    setView: (v: ViewName) => get().activeViewport?.setView(v),
    setCameraMode: (m: CameraMode) => get().activeViewport?.setMode(m),
    constructionNormal: () => get().activeViewport?.constructionNormal() ?? [0, 0, 1],
    viewRay: (p) => get().activeViewport?.viewRay(p) ?? null,
    zoomExtents: () => get().activeViewport?.zoomExtents(),
    zoomWindow: (a, b) => get().activeViewport?.zoomWindow(a, b),
    zoomPrevious: () => get().activeViewport?.zoomPrevious() ?? false,
    viewHeight: () => get().activeViewport?.viewHeight() ?? 0,
    zoomCenter: (c, h) => get().activeViewport?.zoomCenter(c, h),
    zoomScale: (f) => get().activeViewport?.zoomScale(f),
    zoomBox: (min, max) => get().activeViewport?.zoomBox(min, max),
    extentsBox: () => get().activeViewport?.extentsBox() ?? null,
    isPlanView: () => get().activeViewport?.isPlanView() ?? true,
    panBy: (d) => get().activeViewport?.panBy(d),
    viewRect: () => get().activeViewport?.viewRect() ?? null,
    realtime: (mode) => {
      get().activeViewport?.setRealtime(mode)
      if (!mode) set({ realtimeMenu: null })
    },
    getViewState: () => get().activeViewport?.getCamera() ?? null,
    windowViewState: (a, b) => get().activeViewport?.windowState(a, b) ?? null,
    restoreViewState: (s) => get().activeViewport?.restoreView(s),
    openDimStyle: () => get().openDimStyle(),
    setCurrentLayer: (id) => set({ currentLayerId: id }),
    facingNormal: () => get().activeViewport?.facingNormal() ?? [0, 0, 1],
    setViewportLayout: (n) => get().setViewportLayout(n),
    exportPdf: () => get().exportPdf(),
    publish: (ids) => get().publishLayouts(ids),
    importFile: () => get().importFile(),
    openFromDevice: () => get().openFromDevice(),
    exportModel: (fmt) => get().exportModel(fmt),
    openOptions: () => get().openOptions(),
    openOsnap: () => get().openOsnap(),
    setVisualStyle: (m) => get().setVisualStyle(m),
    visualStyle: () => {
      const vp = doc.msViewportId ? doc.getEntity(doc.msViewportId) : undefined
      return vp?.type === 'VIEWPORT' && vp.props.visualStyle ? vp.props.visualStyle : get().visualStyle
    },
    toggleProperties: () => get().toggleProperties(),
    openLayers: () => get().openLayers(),
    openLinetypes: () => get().openLinetypeDialog(),
    preselection: () => [...get().selection],
    screen: (patch) => get().setScreen(patch),
    flatshotDialog: () =>
      new Promise<FlatshotOptions | null>((resolve) => {
        flatshotResolve?.(null)
        flatshotResolve = resolve
        set({ flatshotOpen: true })
      }),
    flatshotProject: (opts) => {
      // Todo lo 3D visible del modelo (FLATSHOT no pide selección), visto desde la cámara del viewport activo.
      const basis = currentViewBasis()
      return basis ? projectModel(null, basis, opts) : []
    },
    currentViewBasis: () => currentViewBasis(),
    projectModel: (ids, basis, opts) => projectModel(ids, basis, opts),
    viewOrigin: (ids, basis) => viewOrigin(ids, basis),
    shadeModel: (ids, basis) => {
      const { meshes, colors } = modelMeshes(ids)
      return shadeViewTriangles(meshes, colors, basis)
    },
    projectSegments: (ids, basis, tangential) => {
      const { meshes } = modelMeshes(ids)
      return meshes.length ? projectHidden(meshes, basis, { tangential }) : []
    },
    ensureLayer: (name, lineType, color) => ensureLayerId(name, lineType, color),
    updateDrawingViews: (ids, force) => updateDrawingViews(ids, force),
    downloadDxf: (entities, base) => {
      const dxf = exportDxf(entities, doc.layers, get().currentLayerId, doc.dimStyles, { linetypes: doc.linetypes, vars: doc.toJSON().vars })
      const blob = new Blob([dxf], { type: 'application/dxf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${base}.dxf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      return `${base}.dxf`
    },
    selectAll: () => {
      const ids = selectableEntities(doc).map((e) => e.id)
      set({ selection: ids })
      return ids.length
    },
    selectIds: (ids) => set({ selection: ids }),
    toolbar: (name, patch) => {
      const def = findToolbar(name)
      if (!def) return false
      get().setToolbar(def.id, patch)
      return true
    },
    openToolbars: () => get().openToolbarDialog(),
    grid: (on) => {
      get().setGrid(on)
      return get().gridOn
    },
    gridOn: () => get().gridOn,
    fullscreen: (on) => {
      get().setFullscreen(on)
      return get().fullscreen
    },
    hatchPanel: (p) => set({ hatchPanel: p }),
    pickWorkspaceFolder: () => void get().pickWorkspaceFolder(),
    useCloudStorage: () => get().useCloudStorage(),
    workspaceName: () => get().fsFolderName,
    redraw: () => get().redraw(),
    openDwgProps: () => get().openDwgProps(),
    openPageSetup: () => get().openPageSetup(),
    openTemplateDialog: (mode) => get().openTemplateDialog(mode),
    saveLayoutTemplate: (layoutId, name) => void get().saveLayoutAsTemplate(layoutId, name),
    sheetInit: () => sheetInit(),
    editAttributes: (title, items) =>
      new Promise<string[] | null>((resolve) => {
        attResolve?.(null) // un diálogo anterior sin cerrar se cancela
        attResolve = resolve
        set({ attDialog: { title, items } })
      }),
    openAi: () => get().openAi(),
    projectOrthographic: (ids, firstAngle, origin) => {
      // Reúne mallas teseladas de los sólidos/mallas indicados (o de todo el documento si no hay ids).
      const targets = ids.length ? (ids.map((id) => doc.getEntity(id)).filter(Boolean) as Entity[]) : doc.entities
      const meshes: Mesh[] = []
      const solidHints: SolidProps[] = []
      const collect = (e: Entity): void => {
        if (e.type === 'SOLID3D') {
          const m = solidMesh(e.props)
          if (m.vertices.length) meshes.push(m)
          solidHints.push(e.props)
        } else if (e.type === 'MESH3D') {
          meshes.push({ vertices: e.props.vertices, faces: e.props.faces })
        } else if (e.type === 'INSERT') {
          for (const c of expandEntities([e], doc.blocks)) collect(c)
        }
      }
      for (const e of targets) collect(e)
      if (meshes.length === 0) {
        print('No 3D solids to project.')
        return 0
      }
      const views = { front: orthoProject(meshes, 'front'), top: orthoProject(meshes, 'top'), right: orthoProject(meshes, 'right') }
      const laid = layoutViews(views.front, views.top, views.right, firstAngle)
      // Círculos exactos de las primitivas (cilindros, conos, esferas) para las cotas: ⌀40, no ⌀39,95.
      const offs = viewOffsets(views.front, views.top, views.right, firstAngle)
      const circleHints = solidHints.flatMap(solidCircleHints)
      const hints = [...viewHints(circleHints, 'front'), ...viewHints(circleHints, 'top', offs.top), ...viewHints(circleHints, 'right', offs.right)]
      if (laid.length === 0) {
        print('Nothing to project.')
        return 0
      }
      // Capas de proyección: visibles (continua) y ocultas (rayada).
      const ensureProjLayer = (name: string, lineType: 'CONTINUOUS' | 'DASHED'): string => {
        const existing = doc.layers.find((l) => l.name === name)
        if (existing) return existing.id
        try {
          return layerSvc.create(name, { lineType }).id
        } catch {
          return doc.firstLayerId
        }
      }
      pushSnapshot()
      const visLayer = ensureProjLayer('PROJ', 'CONTINUOUS')
      const hidLayer = ensureProjLayer('PROJ-HIDDEN', 'DASHED')
      // Como el CAD clásico: líneas, arcos y círculos (no miles de tramos sueltos).
      const bb = segmentsBounds(laid)
      const items = snapToHints(mergeSegments(laid, Math.max(Math.hypot(bb.maxU - bb.minU, bb.maxV - bb.minV) * 2e-4, 1e-6)), hints)
      const at = (p: [number, number]): [number, number, number] => [origin[0] + p[0], origin[1] + p[1], origin[2]]
      for (const it of items) {
        const layer = it.hidden ? hidLayer : visLayer
        if (it.kind === 'line') doc.addEntity({ type: 'LINE', layer, props: { start: at(it.a), end: at(it.b) } })
        else if (it.kind === 'circle') doc.addEntity({ type: 'CIRCLE', layer, props: { center: at(it.c), radius: it.r, normal: [0, 0, 1] } })
        else doc.addEntity({ type: 'ARC', layer, props: { center: at(it.c), radius: it.r, startAngle: it.a0, endAngle: it.a1, normal: [0, 0, 1] } })
      }
      doc.touch()
      bump()
      print(`Projected ${meshes.length} solid(s) → ${items.length} object(s) (ISO ${firstAngle ? 'E' : 'A'}).`)
      return items.length
    },
  }

  const engine = new CommandEngine({
    doc,
    currentLayerId: () => get().currentLayerId,
    isOrtho: () => get().ortho,
    currentCursor: () => get().cursor,
    currentUcs: () => get().ucs,
    currentSelection: () => get().selection,
    onSelectionChange: (ids) => set({ selection: ids }),
    onPicked: (ids) => set({ picked: ids }),
    app,
    onPrompt: (prompt) => set({ prompt }),
    onPrint: print,
    onChange: () => bump(),
    onOpenHelp: () => set({ helpOpen: true }),
    onBeforeCommand: (name) => {
      get().viewports.forEach((vp) => vp.cancelPendingBox()) // un comando cierra la ventana de selección abierta
      if (name === 'UNDO' || name === 'REDO') {
        capturedBefore = null
        return
      }
      capturedBefore = doc.toJSON()
      capturedRev = doc.revision
      capturedVars = JSON.stringify(persistedSysvars())
    },
    onAfterCommand: (name) => {
      // FILLETRAD, CHAMFERA… cambiados desde un comando se guardan en la config del usuario.
      if (capturedVars !== null && capturedVars !== JSON.stringify(persistedSysvars())) saveConfig()
      capturedVars = null
      if (name === 'UNDO' || name === 'REDO' || !capturedBefore) return
      if (doc.revision !== capturedRev) {
        undoStack.push(capturedBefore)
        if (undoStack.length > MAX_UNDO) undoStack.shift()
        redoStack.length = 0
      }
      capturedBefore = null
    },
  })
  registerDefaultCommands(engine)

  /** Preferencias de interfaz y visualización del usuario. */
  const collectPrefs = (): Prefs => {
    const s = get()
    return {
      ortho: s.ortho,
      gridOn: s.gridOn,
      fullscreen: s.fullscreen,
      gridSnap: s.gridSnap,
      esnap: s.esnap,
      otrack: s.otrack,
      gridStep: s.gridStep,
      theme: s.theme,
      osnap: s.osnap,
      visualStyle: s.visualStyle,
      propsPalette: s.propsPalette,
      toolbars: s.toolbars,
      autosave: s.autosave,
      cleanScreen: s.cleanScreen,
      commandLineCompact: s.commandLineCompact,
      cmdHeight: s.cmdHeight,
      viewCubeOn: s.viewCubeOn,
      viewNetStd: s.viewNetStd,
      sysvars: persistedSysvars(),
      savedAt: Date.now(),
    }
  }

  let remoteSave: ReturnType<typeof setTimeout> | null = null
  /**
   * Guarda las preferencias: siempre en el navegador (al instante, así recargar no pierde nada) y, con sesión,
   * también en la cuenta (agrupando los cambios seguidos).
   */
  const saveConfig = () => {
    const prefs = collectPrefs()
    writeLocalPrefs(prefs)
    if (!get().token) return
    if (remoteSave) clearTimeout(remoteSave)
    remoteSave = setTimeout(() => {
      remoteSave = null
      void api.putConfig(prefs).catch(() => {})
    }, 400)
  }

  /** Estado que corresponde a unas preferencias guardadas (lo inválido o desconocido se ignora). */
  const prefsPatch = (d: Record<string, unknown>): Partial<AppState> => {
    const patch: Partial<AppState> = {}
    if (typeof d.ortho === 'boolean') patch.ortho = d.ortho
    if (typeof d.gridOn === 'boolean') patch.gridOn = d.gridOn
    if (typeof d.fullscreen === 'boolean') patch.fullscreen = d.fullscreen
    if (typeof d.gridSnap === 'boolean') patch.gridSnap = d.gridSnap
    if (typeof d.esnap === 'boolean') patch.esnap = d.esnap
    if (typeof d.otrack === 'boolean') patch.otrack = d.otrack
    if (typeof d.gridStep === 'number' && d.gridStep > 0) patch.gridStep = d.gridStep
    if (d.theme && typeof d.theme === 'object') {
      const theme = normalizeTheme(d.theme)
      patch.theme = theme
      applyTheme(theme)
    }
    if (d.osnap && typeof d.osnap === 'object') patch.osnap = normalizeOsnap(d.osnap)
    if (typeof d.visualStyle === 'string' && VISUAL_STYLES.includes(d.visualStyle as VisualStyle)) {
      patch.visualStyle = d.visualStyle as VisualStyle
    }
    if (d.propsPalette && typeof d.propsPalette === 'object') patch.propsPalette = normalizePalette(d.propsPalette)
    // Compatibilidad con la config anterior (panel lateral único).
    else if (typeof d.sidebarOpen === 'boolean') patch.propsPalette = { ...DEFAULT_PALETTE, open: d.sidebarOpen }
    if (d.toolbars && typeof d.toolbars === 'object') patch.toolbars = normalizeToolbars(d.toolbars, DEFAULT_TOOLBARS)
    // Compatibilidad con la config anterior (sólo la barra Dimension).
    else if (d.dimToolbar && typeof d.dimToolbar === 'object') {
      patch.toolbars = { ...structuredClone(DEFAULT_TOOLBARS), dimension: normalizeToolbar(d.dimToolbar, DEFAULT_TOOLBARS.dimension) }
    }
    if (typeof d.autosave === 'boolean') patch.autosave = d.autosave
    if (typeof d.cleanScreen === 'boolean') patch.cleanScreen = d.cleanScreen
    if (typeof d.commandLineCompact === 'boolean') patch.commandLineCompact = d.commandLineCompact
    if (typeof d.cmdHeight === 'number' && d.cmdHeight >= 48 && d.cmdHeight <= 400) patch.cmdHeight = d.cmdHeight
    if (typeof d.viewCubeOn === 'boolean') patch.viewCubeOn = d.viewCubeOn
    if (d.viewNetStd === 'E' || d.viewNetStd === 'A') patch.viewNetStd = d.viewNetStd
    if (d.sysvars && typeof d.sysvars === 'object') {
      applySysvars(d.sysvars as Record<string, unknown>)
      patch.sysvarRev = get().sysvarRev + 1
    }
    return patch
  }

  /**
   * Al iniciar o restaurar la sesión: vale la copia más reciente entre la del navegador (ya aplicada al
   * arrancar) y la de la cuenta; la que pierde se pisa con la otra.
   */
  const applyUserConfig = async (): Promise<void> => {
    try {
      const remote = (await api.getConfig()).data as Prefs
      const local = readLocalPrefs()
      const which = pickPrefs(local, remote)
      if (which === 'remote') {
        set(prefsPatch(remote))
        get().viewports.forEach((vp) => vp.setVisualStyle(get().visualStyle))
        writeLocalPrefs({ ...remote, savedAt: typeof remote.savedAt === 'number' ? remote.savedAt : Date.now() })
      } else if (which === 'local' && local) {
        void api.putConfig(local).catch(() => {})
      }
    } catch {
      /* sin config previa o sin conexión: siguen las del navegador */
    }
  }

  /** Espera a que termine de cancelarse el comando en curso (la cancelación resuelve su prompt en diferido). */
  const whenIdle = (fn: () => void, tries = 50): void => {
    if (!engine.busy || tries <= 0) fn()
    else setTimeout(() => whenIdle(fn, tries - 1), 5)
  }

  return {
    doc,
    layerSvc,
    engine,
    version: 0,
    currentLayerId: '0',
    prompt: '',
    output: ['Cota — type HELP (or ?) for the list of commands.'],
    cursor: { x: 0, y: 0, z: 0 },
    helpOpen: false,
    ortho: false,
    gridOn: true,
    fullscreen: false,
    gridSnap: false,
    gridStep: 10,
    esnap: true,
    otrack: true,
    ucs: { ...WORLD_UCS },
    ucsName: 'World',
    dimStyleOpen: false,
    dimMenu: null,
    theme: { ...DEFAULT_THEME },
    optionsOpen: false,
    sysvarRev: 0,
    osnap: { ...DEFAULT_OSNAP },
    osnapOpen: false,
    visualStyle: DEFAULT_VISUAL_STYLE,
    propsPalette: { ...DEFAULT_PALETTE },
    toolbars: structuredClone(DEFAULT_TOOLBARS),
    toolbarDialogOpen: false,
    cmdHeight: 96,
    layersOpen: false,
    linetypeDialog: null,
    hatchPanel: null,
    realtimeMenu: null,
    setRealtimeMenu: (m) => set({ realtimeMenu: m }),
    realtimeAction: (a) => {
      const vp = get().activeViewport
      set({ realtimeMenu: null })
      if (a === 'pan' || a === 'zoom') vp?.setRealtime(a)
      else if (a === 'original') vp?.realtimeOriginal()
      else if (a === 'extents') vp?.zoomExtents()
      else {
        // Exit o Zoom Window: se termina el modo (Enter al prompt) y, para la ventana, ZOOM W.
        get().submitCommand('')
        if (a === 'window') setTimeout(() => (get().submitCommand('ZOOM'), setTimeout(() => get().submitCommand('W'), 0)), 0)
      }
    },
    autosave: false,
    flatshotOpen: false,
    flatshotOptions: { ...DEFAULT_FLATSHOT },
    cleanScreen: false,
    commandLineCompact: false,
    viewCubeOn: true,
    viewNetStd: 'E',
    aiOpen: false,
    aiProcessing: false,
    aiMessage: '',
    aiHasKey: false,
    aiProvider: 'openai',
    aiApiBase: '',
    aiModel: '',
    aiHasProposal: false,
    aiChanges: [],
    aiMinimized: false,
    aiLod: 2,
    aiLog: [],
    selection: [],
    picked: [],
    token: null,
    email: null,
    docId: null,
    docName: 'drawing1',
    docFolder: '',
    loginOpen: false,
    openOpen: false,
    docList: [],
    fsSupported: fsaSupported(),
    fsFolderName: null,
    fsFilePath: null,
    fsPending: false,
    fsList: [],
    authError: null,
    viewports: [],
    activeViewport: null,
    pageSetupFor: null,
    openPageSetup: (layoutId) => {
      const id = layoutId ?? doc.activeLayout?.id
      if (!id) return print('PAGESETUP applies to layouts: switch to a layout tab first.')
      set({ pageSetupFor: id })
    },
    closePageSetup: () => set({ pageSetupFor: null }),
    applyPageSetup: (layoutId, ps) => {
      // Como el CAD clásico, cambiar el papel no mueve las entidades de la hoja.
      layoutOp(() => doc.setPageSetup(layoutId, ps))
    },
    templateDialog: null,
    openTemplateDialog: (mode, layoutId) => {
      const id = layoutId ?? doc.activeLayout?.id
      if (mode === 'save' && !id) return print('Switch to the layout to save as a template.')
      set({ templateDialog: { mode, layoutId: id } })
    },
    closeTemplateDialog: () => set({ templateDialog: null }),
    listTemplates: async () => {
      const out: TemplateEntry[] = BUILTIN_TEMPLATES.map((t) => ({ id: t.id, name: t.name, source: 'builtin' }))
      if (workspaceDir) {
        for (const name of await listFilesIn(workspaceDir, TEMPLATE_FOLDER, [TEMPLATE_EXT, LEGACY_TEMPLATE_EXT])) out.push({ id: `folder:${name}`, name, source: 'folder' })
      }
      for (const name of Object.keys(await templateLibrary()).sort()) out.push({ id: `library:${name}`, name, source: 'library' })
      return out
    },
    newLayoutFromTemplate: async (id, name) => {
      if (id.startsWith('builtin:')) {
        layoutOp(() => print(`Layout "${addLayoutFromBuiltin(doc, id, get().currentLayerId, name)?.name}" created.`))
        return
      }
      const tpl = await readSavedTemplate(id)
      if (!tpl) return print('Template not found.')
      layoutOp(() => print(`Layout "${addLayoutFromTemplate(doc, tpl, name).name}" created from template.`))
    },
    newLayoutFromTemplateText: (text, name) => {
      const tpl = parseTemplate(text)
      if (!tpl) return print('That file is not a Cota layout template (.cotat).')
      layoutOp(() => print(`Layout "${addLayoutFromTemplate(doc, tpl, name).name}" created from template.`))
    },
    saveLayoutAsTemplate: async (layoutId, name) => {
      const clean = name.trim().replace(/[\\/:*?"<>|]/g, '_')
      if (!clean) return print('Template name required.')
      const text = JSON.stringify(layoutToTemplate(doc, layoutId, clean))
      if (workspaceDir && (await ensurePermission(workspaceDir))) {
        const w = await writeDrawing(workspaceDir, TEMPLATE_FOLDER, clean, text, TEMPLATE_EXT)
        print(w ? `Template saved: ${w.path}` : 'Could not write the template in the working folder.')
        return
      }
      // Sin carpeta: biblioteca del navegador + descarga del archivo.
      await idbSet(TEMPLATE_LIB_KEY, { ...(await templateLibrary()), [clean]: JSON.parse(text) as LayoutTemplate })
      downloadText(text, clean + TEMPLATE_EXT, 'application/json')
      print(`Template "${clean}" saved in the browser library and downloaded.`)
    },
    defaultTemplate: DEFAULT_TEMPLATE_ID,
    setDefaultTemplate: async (id) => {
      const builtin = id === NO_TEMPLATE_ID || id.startsWith('builtin:')
      const data = builtin ? null : await readSavedTemplate(id)
      if (!builtin && !data) return print('Template not found.')
      defaultTemplateData = data
      set({ defaultTemplate: id })
      await idbSet(DEFAULT_TEMPLATE_KEY, { id, data })
    },
    attDialog: null,
    closeAttDialog: (values) => {
      const r = attResolve
      attResolve = null
      set({ attDialog: null })
      r?.(values)
    },
    entityDoubleClick: (id) => {
      const e = doc.getEntity(id)
      // DBLCLKEDIT: un sombreado abre HATCHEDIT y una polilínea PEDIT, como el CAD clásico.
      if ((e?.type === 'HATCH' || e?.type === 'POLYLINE') && !get().engine.busy && !get().engine.hasPending) {
        get().selectEntity(id)
        get().submitCommand(e.type === 'HATCH' ? 'HATCHEDIT' : 'PEDIT')
        return
      }
      if (e?.type !== 'INSERT' || !e.props.attributes?.length) {
        get().selectEntity(id)
        get().openProperties()
        return
      }
      const attrs = e.props.attributes
      const defs = blockAttdefs(doc.getBlock(e.props.name))
      void app
        .editAttributes(
          `Enhanced Attribute Editor — ${e.props.name}`,
          attrs.map((a) => ({ tag: a.tag, prompt: defs.find((d) => d.tag === a.tag)?.prompt || a.tag, value: a.value })),
        )
        .then((values) => {
          if (!values || values.every((v, i) => v === attrs[i].value)) return
          pushSnapshot()
          attrs.forEach((a, i) => (a.value = values[i] ?? a.value))
          doc.touch()
          bump()
        })
    },
    dwgPropsOpen: false,
    openDwgProps: () => set({ dwgPropsOpen: true }),
    closeDwgProps: () => set({ dwgPropsOpen: false }),
    setDrawingProps: (patch) => {
      pushSnapshot()
      doc.setMeta(patch)
      bump()
    },
    viewportLayout: 1,
    camAz: -Math.PI / 2,
    camEl: Math.PI / 2,
    camMode: 'ortho',

    registerViewport: (vp) => {
      vp.onViewRecorded = (cam, ucs) => recordViewUndo(vp, cam, ucs)
      set((s) => ({ viewports: [...s.viewports, vp], activeViewport: s.activeViewport ?? vp }))
    },
    unregisterViewport: (vp) =>
      set((s) => {
        const viewports = s.viewports.filter((v) => v !== vp)
        return { viewports, activeViewport: s.activeViewport === vp ? (viewports[0] ?? null) : s.activeViewport }
      }),
    setActiveViewport: (vp) => set({ activeViewport: vp, ucs: vp.getUcs() }),
    setViewportLayout: (n) => {
      const layout = Math.max(1, Math.min(4, Math.round(n)))
      doc.setViewportLayout(layout)
      set({ viewportLayout: layout })
      bump()
    },
    setActiveTab: (id) => {
      if (id === doc.activeTab && !doc.msViewportId) return
      if (engine.busy || engine.hasPending) engine.cancel()
      get().viewports.forEach((vp) => vp.clearTracking())
      activateTab(doc, id, get().currentLayerId, sheetInit())
      // Al entrar a un layout, sus vistas de dibujo se ponen al día con el modelo (VIEWUPDATEAUTO).
      if (doc.activeLayout) updateDrawingViews(null)
      set({ selection: [] })
      bump()
    },
    cycleTab: (delta) => get().setActiveTab(neighborTab(doc, delta)),
    newLayout: () => layoutOp(() => print(`Layout "${doc.addLayout().name}" created.`)),
    copyLayout: (id) => layoutOp(() => print(`Layout "${doc.copyLayout(id).name}" created.`)),
    renameLayout: (id, name) => layoutOp(() => doc.renameLayout(id, name)),
    deleteLayout: (id) =>
      layoutOp(() => {
        const name = doc.getLayout(id)?.name
        doc.removeLayout(id)
        set({ selection: [] })
        print(`Layout "${name}" deleted.`)
      }),
    moveLayout: (id, delta) => layoutOp(() => doc.moveLayout(id, delta)),
    setMsViewport: (id) => {
      if (id === doc.msViewportId) return
      get().viewports.forEach((vp) => vp.clearTracking())
      doc.setMsViewport(id)
      set({ selection: [] })
      bump()
    },
    viewportViewChanged: bump,
    toggleModelPaper: () => {
      if (!doc.activeLayout) return
      if (doc.msViewportId) return get().setMsViewport(null)
      const id = defaultMsViewport(doc)
      if (id) get().setMsViewport(id)
      else print('There are no active model space viewports.')
    },
    cycleViewport: () => {
      const s = get()
      if (doc.activeLayout) {
        // Como el CAD clásico: sólo cicla entre viewports estando en el modelo (con VPMAX no hay otros).
        if (doc.msViewportId && !doc.maximizedViewportId) s.setMsViewport(nextMsViewport(doc))
        return
      }
      const i = s.activeViewport ? s.viewports.indexOf(s.activeViewport) : -1
      const next = s.viewports[(i + 1) % s.viewports.length]
      if (next) s.setActiveViewport(next)
    },
    setCameraState: (az, el, mode) => set({ camAz: az, camEl: el, camMode: mode }),
    setView: (v) => get().activeViewport?.setView(v),
    setCameraMode: (m) => get().activeViewport?.setMode(m),
    submitCommand: (text) => engine.submitText(text),
    viewportClick: (world, pickedId, snapped = false, subtract = false, raw?: Pt, deferred?: Deferred, face?: Ucs) => {
      if (engine.hasPending) {
        engine.submitClick(world, pickedId, snapped, subtract, raw, deferred, face)
      } else if (!engine.busy) {
        // Selección libre estilo CAD clásico: cada click ACUMULA; con Shift resta; el click en vacío
        // (sin entidad bajo el cursor) limpia la selección, igual que una ventana que no toma nada.
        if (!pickedId) {
          if (get().selection.length > 0) set({ selection: [] })
          return
        }
        set({ selection: mergeSelection(get().selection, [pickedId], subtract) })
      }
    },
    beginGripEdit: (entityId, grip) => {
      const e0 = doc.getEntity(entityId)
      if (!e0) return
      const l = layerSvc.get(e0.layer)
      if (l && !layerEditable(l)) return
      // Fantasma en vivo: clona la entidad y aplica el grip al cursor (el motor aplica ORTHO/snap).
      const preview = (cursor: Pt): PreviewShape[] => {
        const src = doc.getEntity(entityId)
        if (!src) return []
        const ghost = structuredClone(src)
        applyGrip(ghost, grip, [cursor.x, cursor.y, cursor.z])
        return entityOutline(ghost)
          .filter((poly) => poly.length >= 2)
          .map((poly) => ({ kind: 'polyline', points: poly }))
      }
      void (async () => {
        const r = await engine.requestGripPoint('Specify new location: ', fromVec3(grip.point), preview)
        if (r.kind === 'point') get().gripEdit(entityId, grip, [r.point.x, r.point.y, r.point.z], r.pick?.id ?? null)
      })()
    },
    gripEdit: (entityId, grip, to, pickedId) => {
      const e = doc.getEntity(entityId)
      if (!e) return
      const l = layerSvc.get(e.layer)
      if (l && !layerEditable(l)) return
      // No-op: fijar el grip en su mismo lugar no genera un paso de undo.
      const g = grip.point
      if (Math.hypot(to[0] - g[0], to[1] - g[1], to[2] - g[2]) < 1e-9) return
      pushSnapshot()
      applyGrip(e, grip, to)
      // Punto de cota arrastrado: se reasocia al objeto donde cayó (o deja de ser asociativo).
      if (e.type === 'DIMENSION' && grip.role.t === 'dim-point') {
        reassociatePoint(e.props, grip.role.index, pickedId && pickedId !== entityId ? doc.getEntity(pickedId) : undefined, doc.dimAssoc)
      }
      doc.touch()
      bump()
    },
    boxSelect: (rect, crossing, project, subtract = false) => {
      const selectable = doc.entities.filter((e) => {
        const l = layerSvc.get(e.layer)
        return layerEditable(l)
      })
      const ids = entitiesInScreenBox(selectable, rect, crossing, project)
      if (engine.isSelecting) {
        if (subtract) engine.removePicks(ids)
        else engine.addPicks(ids)
      } else if (!engine.busy) {
        // La ventana también acumula (CAD clásico); con Shift resta lo encerrado.
        set({ selection: mergeSelection(get().selection, ids, subtract) })
      }
    },
    isSelectMode: () => engine.isSelecting || (!engine.hasPending && !engine.busy),
    // ESC: cancela el comando/prompt en curso y, además, deselecciona (como el CAD clásico).
    cancel: () => {
      get().viewports.forEach((vp) => vp.cancelPendingBox()) // Esc cierra la ventana de selección abierta con un clic
      engine.cancel()
      get().viewports.forEach((vp) => vp.clearTracking()) // ESC también suelta los puntos de tracking
      if (get().selection.length > 0) set({ selection: [] })
    },
    // El CAD clásico: con objetos seleccionados, elegir una capa MUEVE esos objetos a la capa (un solo paso
    // de undo) y la capa actual NO cambia. Sin selección, sólo fija la capa actual.
    setCurrentLayer: (id) => {
      const target = layerSvc.get(id)
      if (!target) return
      const sel = get().selection
      if ((sel.length === 0 || engine.busy) && target.frozen) {
        print(`Cannot set frozen layer "${target.name}" current.`)
        return
      }
      if (sel.length === 0 || engine.busy) {
        set({ currentLayerId: id })
        return
      }
      const movable = sel
        .map((eid) => doc.getEntity(eid))
        .filter((e): e is Entity => {
          if (!e || e.layer === id) return false
          const l = layerSvc.get(e.layer)
          return !l || !l.locked // una entidad en capa bloqueada no se edita
        })
      if (movable.length === 0) return
      pushSnapshot()
      for (const e of movable) e.layer = id
      doc.touch()
      print(`${movable.length} object(s) moved to layer "${target.name}".`)
      bump()
    },
    moveLayer: (id, to) => {
      pushSnapshot()
      if (!moveLayerTo(doc.layers, id, to)) {
        undoStack.pop()
        return
      }
      doc.touch()
      bump()
    },
    createLayer: (name) => {
      try {
        pushSnapshot()
        const layer = layerSvc.create(name)
        print(`Layer "${layer.name}" created.`)
        bump()
      } catch (err) {
        undoStack.pop()
        print(err instanceof Error ? err.message : String(err))
      }
    },
    openProperties: () => {
      set((s) => ({ propsPalette: { ...s.propsPalette, open: true, minimized: false } }))
      saveConfig()
    },
    setPropsPalette: (patch) => {
      set((s) => ({ propsPalette: { ...s.propsPalette, ...patch } }))
      saveConfig()
    },
    setToolbar: (id, patch) => {
      set((s) => {
        const cur = s.toolbars[id]
        if (!cur) return {}
        let toolbars: ToolbarStates = { ...s.toolbars, [id]: { ...cur, ...patch } }
        const t = toolbars[id]
        if (t.docked && (!cur.docked || t.side !== cur.side)) toolbars = dockToolbar(toolbars, id, t.side)
        return { toolbars }
      })
      saveConfig()
    },
    dockToolbarAt: (id, side, index) => {
      if (!get().toolbars[id]) return
      set((s) => ({ toolbars: dockToolbar(s.toolbars, id, side, index) }))
      saveConfig()
    },
    setAllToolbars: (visible) => {
      set((s) => ({ toolbars: Object.fromEntries(Object.entries(s.toolbars).map(([id, t]) => [id, { ...t, visible }])) }))
      saveConfig()
    },
    resetToolbars: () => {
      set({ toolbars: structuredClone(DEFAULT_TOOLBARS) })
      saveConfig()
    },
    openToolbarDialog: () => set({ toolbarDialogOpen: true }),
    closeToolbarDialog: () => set({ toolbarDialogOpen: false }),
    runMacro: (steps, transparent = false) => {
      if (transparent) {
        // Referencia a objetos de un uso: sólo tiene sentido dentro de un comando que pide un punto.
        if (engine.hasPending) engine.submitText(steps[0])
        else print('Object snap overrides work inside a command that asks for a point.')
        return
      }
      if (engine.busy) {
        engine.cancel() // ^C^C de las macros de botón
        get().viewports.forEach((vp) => vp.clearTracking())
      }
      const next = (i: number): void => {
        if (i >= steps.length) return
        engine.submitText(steps[i])
        if (i + 1 < steps.length) setTimeout(() => next(i + 1), 0)
      }
      whenIdle(() => next(0))
    },
    setCmdHeight: (h) => {
      set({ cmdHeight: Math.max(48, Math.min(400, Math.round(h))) })
      saveConfig()
    },
    applyPrefs: (d) => set(prefsPatch(d)),
    openLayers: () => set({ layersOpen: true }),
    closeLayers: () => set({ layersOpen: false }),
    renameLayer: (id, name) => {
      try {
        pushSnapshot()
        layerSvc.rename(id, name)
        bump()
      } catch (err) {
        print(err instanceof Error ? err.message : 'Could not rename the layer')
      }
    },
    setLayerPrintable: (id, printable) => {
      const l = layerSvc.get(id)
      if (!l) return
      pushSnapshot()
      l.printable = printable
      doc.touch()
      bump()
    },
    setLayerVpFrozen: (id, frozen) => {
      const vp = doc.msViewportId ? doc.getEntity(doc.msViewportId) : undefined
      if (vp?.type !== 'VIEWPORT') return
      pushSnapshot()
      const rest = vp.props.frozenLayers.filter((l) => l !== id)
      vp.props.frozenLayers = frozen ? [...rest, id] : rest
      doc.touch()
      bump()
    },
    setLayerNewVpFreeze: (id, frozen) => {
      pushSnapshot()
      layerSvc.setNewVpFreeze(id, frozen)
      bump()
    },
    setLayerColor: (id, color) => {
      pushSnapshot()
      layerSvc.setColor(id, color)
      bump()
    },
    deleteLayer: (id) => {
      if (id === '0') {
        print('Cannot delete the default layer "0".')
        return
      }
      if (id === get().currentLayerId) {
        print('Cannot delete the current layer.')
        return
      }
      if (doc.entities.some((e) => e.layer === id)) {
        print('Cannot delete a layer that contains objects.')
        return
      }
      const layer = layerSvc.get(id)
      pushSnapshot()
      layerSvc.remove(id)
      bump()
      print(`Layer "${layer?.name ?? id}" deleted.`)
    },
    setLayerLineWeight: (id, w) => {
      pushSnapshot()
      layerSvc.setLineWeight(id, w)
      bump()
    },
    setLayerLineType: (id, t) => {
      pushSnapshot()
      const l = layerSvc.get(id)
      const d = doc.loadLinetype(t)
      if (l && d) {
        l.lineType = d.name
        doc.touch()
      }
      bump()
    },
    openLinetypeDialog: (opts) => set({ linetypeDialog: opts ?? {} }),
    closeLinetypeDialog: () => set({ linetypeDialog: null }),
    loadLinetypes: (names) => {
      if (!names.length) return
      pushSnapshot()
      for (const n of names) doc.loadLinetype(n)
      bump()
    },
    deleteLinetype: (name) => {
      if (doc.linetypeInUse(name)) return false
      pushSnapshot()
      const ok = doc.deleteLinetype(name)
      bump()
      return ok
    },
    setDrawingVar: (name, value) => {
      pushSnapshot()
      doc.setVar(name, value)
      bump()
    },
    setEntitiesCommon: (ids, key, value) => {
      const ents = ids.map((id) => doc.getEntity(id)).filter((e): e is Entity => !!e && !layerSvc.get(e.layer)?.locked)
      if (!ents.length) return
      pushSnapshot()
      for (const e of ents) {
        if (key === 'ltScale') {
          const v = Number(value)
          if (!(v > 0)) continue
          if (v === 1) delete e.ltScale
          else e.ltScale = v
        } else {
          const up = String(value).toUpperCase()
          if (up === 'BYLAYER') delete e.lineType
          else if (up === 'BYBLOCK') e.lineType = 'BYBLOCK'
          else if (doc.loadLinetype(up)) e.lineType = up
        }
      }
      doc.touch()
      bump()
    },
    setHatchPanel: (p) => set({ hatchPanel: p }),
    applyHatchSetting: (patch) => {
      const panel = get().hatchPanel
      // Al crear, el panel fija las variables HP* (como la pestaña Hatch Creation del CAD clásico).
      if (!panel || panel.mode === 'create') {
        if (patch.pattern !== undefined) doc.setVar('HPNAME', patch.pattern.toUpperCase())
        if (patch.scale !== undefined && patch.scale > 0) doc.setVar('HPSCALE', patch.scale)
        if (patch.angleDeg !== undefined) doc.setVar('HPANG', patch.angleDeg)
        if (patch.spacing !== undefined && patch.spacing > 0) doc.setVar('HPSPACE', patch.spacing)
        if (patch.double !== undefined) doc.setVar('HPDOUBLE', patch.double ? 1 : 0)
        if (patch.island !== undefined) doc.setVar('HPISLANDDETECTION', patch.island === 'normal' ? 0 : patch.island === 'outer' ? 1 : 2)
        if (patch.assoc !== undefined) doc.setVar('HPASSOC', patch.assoc ? 1 : 0)
      }
      for (const id of panel?.ids ?? []) {
        const e = doc.getEntity(id)
        if (e?.type !== 'HATCH') continue
        const h = e.props
        if (patch.pattern !== undefined) {
          const name = patch.pattern.toUpperCase()
          if (name !== h.pattern.toUpperCase()) delete h.custom
          h.pattern = name
        }
        if (patch.scale !== undefined && patch.scale > 0) h.scale = patch.scale
        if (patch.angleDeg !== undefined) h.angle = (patch.angleDeg * Math.PI) / 180
        if (patch.spacing !== undefined && patch.spacing > 0) h.spacing = patch.spacing
        if (patch.double !== undefined) h.double = patch.double
        if (patch.assoc === false) delete h.assoc
        if (patch.island !== undefined && patch.island !== h.island) {
          h.island = patch.island
          // Con el contorno conocido se recalculan las islas.
          const sources = h.assoc?.ids.map((x) => doc.getEntity(x))
          if (sources?.every((x): x is Entity => !!x)) {
            const loops = rebuildHatchLoops(h, sources)
            if (loops) h.loops = loops
          }
          doc.forgetHatch(id)
        }
      }
      doc.touch()
      bump()
    },
    toggleLayerVisible: (id) => {
      const l = layerSvc.get(id)
      if (l) layerSvc.setVisible(id, !l.visible)
      bump()
    },
    toggleLayerFrozen: (id) => {
      const l = layerSvc.get(id)
      if (!l) return
      if (!l.frozen && id === get().currentLayerId) {
        print('Cannot freeze the current layer.')
        return
      }
      layerSvc.setFrozen(id, !l.frozen)
      if (l.frozen) set({ selection: get().selection.filter((eid) => doc.getEntity(eid)?.layer !== id) })
      bump()
    },
    toggleLayerLock: (id) => {
      const l = layerSvc.get(id)
      if (l) layerSvc.setLocked(id, !l.locked)
      bump()
    },
    setCursor: (p) => set({ cursor: p }),
    openHelp: () => set({ helpOpen: true }),
    closeHelp: () => set({ helpOpen: false }),
    toggleOrtho: () => {
      const next = !get().ortho
      set({ ortho: next })
      print(`<Ortho ${next ? 'on' : 'off'}>`)
      saveConfig()
    },
    setGrid: (on) => {
      const next = on ?? !get().gridOn
      set({ gridOn: next })
      print(`<Grid ${next ? 'on' : 'off'}>`)
      saveConfig()
    },
    setFullscreen: (on, apply = true) => {
      const next = on ?? !get().fullscreen
      if (next !== get().fullscreen) {
        set({ fullscreen: next })
        saveConfig()
      }
      if (!apply) return
      if (next) {
        void enterFullscreen().then((ok) => {
          if (!ok) print('Full screen will turn on with your next click (the browser needs a click or key press).')
        })
      } else void exitFullscreen()
    },
    toggleSnap: () => {
      const next = !get().gridSnap
      set({ gridSnap: next })
      print(`<Snap ${next ? 'on' : 'off'}>`)
      saveConfig()
    },
    toggleEsnap: () => {
      const next = !get().esnap
      set({ esnap: next })
      print(`<Osnap ${next ? 'on' : 'off'}>`)
      saveConfig()
    },
    toggleOtrack: () => {
      const next = !get().otrack
      set({ otrack: next })
      if (!next) get().viewports.forEach((vp) => vp.clearTracking())
      print(`<Otrack ${next ? 'on' : 'off'}>`)
      saveConfig()
    },
    setUcs: (ucs, name, temporary = false) => {
      // UCS por viewport: se aplica al viewport activo; el store espeja el activo. La del modelo se guarda
      // en el dibujo. Las anteriores (hasta 10) quedan para `UCS Previous`. La UCS dinámica
      // (`temporary`) no entra en el historial ni se guarda.
      const prev = get().ucs
      if (!sameUcs(prev, ucs) && !restoringPrevious && !temporary) {
        ucsHistory.push(prev)
        if (ucsHistory.length > 10) ucsHistory.shift()
      }
      const vp = get().activeViewport
      if (vp && !sameUcs(vp.getUcs(), ucs)) vp.setUcs(ucs)
      if (doc.activeTab === MODEL_TAB && !temporary) doc.setModelUcs(isWorldUcs(ucs) ? null : ucsToDef(ucs))
      set({ ucs, ucsName: name ?? (isWorldUcs(ucs) ? 'World' : null) })
      if (sysvars.UCSFOLLOW && vp && !temporary && !sameUcs(prev, ucs)) vp.planView(ucs)
    },
    openDimStyle: () => set({ dimStyleOpen: true }),
    closeDimStyle: () => set({ dimStyleOpen: false }),
    setCurrentDimStyle: (name) => {
      if (doc.setCurrentDimStyle(name)) bump()
    },
    saveDimStyle: (def) => {
      pushSnapshot()
      doc.saveDimStyle(def)
      bump()
    },
    renameDimStyle: (from, to) => {
      try {
        pushSnapshot()
        doc.renameDimStyle(from, to)
        bump()
        return true
      } catch (err) {
        undoStack.pop()
        print(err instanceof Error ? err.message : String(err))
        return false
      }
    },
    deleteDimStyle: (name) => {
      try {
        pushSnapshot()
        doc.deleteDimStyle(name)
        bump()
        return true
      } catch (err) {
        undoStack.pop()
        print(err instanceof Error ? err.message : String(err))
        return false
      }
    },
    setDimStyleOverrides: (vars) => {
      if (vars) doc.replaceDimOverrides(vars)
      else doc.clearDimOverrides()
      bump()
    },
    setDimensionsStyle: (ids, styleName) => {
      pushSnapshot()
      for (const id of ids) {
        const e = doc.getEntity(id)
        if (e?.type === 'DIMENSION') doc.restyleDimension(e.props, styleName, e.props.overrides)
      }
      bump()
    },
    setDimensionsVar: (ids, name, value) => {
      pushSnapshot()
      for (const id of ids) {
        const e = doc.getEntity(id)
        if (e?.type === 'DIMENSION') doc.setDimensionVar(e.props, name, value)
      }
      bump()
    },
    openDimMenu: (x, y, world) => set({ dimMenu: { x, y, world } }),
    setCannoscale: (v) => {
      pushSnapshot()
      doc.setCannoscale(v)
      doc.touch()
      bump()
    },
    closeDimMenu: () => set({ dimMenu: null }),
    editDimensions: (ids, fn) => {
      pushSnapshot()
      for (const id of ids) {
        const e = doc.getEntity(id)
        if (e?.type === 'DIMENSION') fn(e.props)
      }
      doc.touch()
      bump()
    },
    chainFromDimension: (id, baseline) => {
      setChainBase(id)
      set({ selection: [] })
      engine.submitText(baseline ? 'DIMBASELINE' : 'DIMCONTINUE')
    },
    setTheme: (patch) => {
      const theme = normalizeTheme({ ...get().theme, ...patch })
      set({ theme })
      applyTheme(theme)
      saveConfig()
    },
    openOptions: () => set({ optionsOpen: true }),
    closeOptions: () => set({ optionsOpen: false }),
    setSysvars: (patch) => {
      applySysvars(patch as Record<string, unknown>)
      set((s) => ({ sysvarRev: s.sysvarRev + 1 }))
      saveConfig()
    },
    setOsnap: (kind, value) => {
      set((s) => ({ osnap: { ...s.osnap, [kind]: value } }))
      saveConfig()
    },
    setAllOsnap: (value) => {
      set((s) => {
        const osnap = { ...s.osnap }
        for (const k of Object.keys(osnap) as OsnapKind[]) osnap[k] = value
        return { osnap }
      })
      saveConfig()
    },
    openOsnap: () => set({ osnapOpen: true }),
    closeOsnap: () => set({ osnapOpen: false }),
    setVisualStyle: (mode) => {
      // En MSPACE el estilo es propiedad del viewport del layout (se guarda con el dibujo).
      const vp = doc.msViewportId ? doc.getEntity(doc.msViewportId) : undefined
      if (vp?.type === 'VIEWPORT') {
        if (!engine.busy) pushSnapshot() // desde VSCURRENT el undo lo registra el comando
        vp.props.visualStyle = mode
        doc.touch()
        bump()
        return
      }
      set({ visualStyle: mode })
      get().activeViewport?.setVisualStyle(mode)
      saveConfig()
    },
    toggleProperties: () => {
      // PROPERTIES la muestra desplegada (también si estaba colapsada); si ya se ve desplegada, la cierra.
      set((s) => {
        const p = s.propsPalette
        const showing = p.open && !p.minimized
        return { propsPalette: { ...p, open: !showing, minimized: showing ? p.minimized : false } }
      })
      saveConfig()
    },
    resolveFlatshot: (opts) => {
      const r = flatshotResolve
      flatshotResolve = null
      set(opts ? { flatshotOpen: false, flatshotOptions: opts } : { flatshotOpen: false })
      r?.(opts)
    },
    setScreen: (patch) => {
      set(patch)
      saveConfig()
    },
    toggleAutosave: () => {
      const next = !get().autosave
      set({ autosave: next })
      print(`<Autosave ${next ? 'on' : 'off'}>`)
      saveConfig()
    },
    redraw: () => {
      get().viewports.forEach((vp) => {
        vp.forceRebuild()
        vp.updateUcsIcon(true)
      })
      bump()
    },
    openAi: () => {
      if (!get().token) {
        print('AI requires login (the API key is stored per user).')
        get().openLoginDialog()
        return
      }
      set({ aiOpen: true, aiMinimized: false, aiMessage: '' })
      void api
        .getAiConfig()
        .then((c) =>
          set({ aiHasKey: c.has_key, aiProvider: c.provider || 'openai', aiApiBase: c.api_base || '', aiModel: c.model || '' }),
        )
        .catch(() => {})
    },
    closeAi: () => set({ aiOpen: false }),
    setAiMinimized: (v) => set({ aiMinimized: v }),
    setAiLod: (n) => set({ aiLod: Math.max(0, Math.min(3, Math.round(n))) }),
    setAiConfig: async (cfg) => {
      try {
        const c = await api.putAiConfig({
          provider: cfg.provider,
          api_base: cfg.apiBase || null,
          model: cfg.model,
          api_key: cfg.apiKey,
        })
        set({ aiHasKey: c.has_key, aiProvider: c.provider, aiApiBase: c.api_base || '', aiModel: c.model, aiMessage: 'Provider configured.' })
      } catch (e) {
        set({ aiMessage: `Config failed: ${e instanceof Error ? e.message : String(e)}` })
      }
    },
    submitAiPrompt: async (text) => {
      if (!text.trim() || get().aiProcessing) return
      set({ aiProcessing: true, aiMessage: 'Processing…', aiChanges: [], aiLog: [] })
      const pushLog = (line: string) => set((s) => ({ aiLog: [...s.aiLog, line].slice(-300) }))
      // Traduce cada evento del pipeline (SSE) a una línea de log legible en vivo.
      const onEvent = (ev: Record<string, unknown>) => {
        const t = ev.type
        if (t === 'start') pushLog(`🧠 Planning… (LOD${ev.lod ?? '?'})`)
        else if (t === 'plan') {
          const names = Array.isArray(ev.names) ? (ev.names as string[]) : []
          const head = names.slice(0, 8).join(', ')
          pushLog(`📐 Plan: ${ev.count ?? names.length} part(s) — ${head}${names.length > 8 ? '…' : ''}`)
        } else if (t === 'part_start') pushLog(`▸ modeling ${ev.name}…`)
        else if (t === 'part_done') {
          pushLog(ev.ok ? `✓ ${ev.name} — ${ev.solids} solid(s)` : `✗ ${ev.name} — skipped`)
        } else if (t === 'part_retry') pushLog(`↻ ${ev.name}: ${ev.reason} — regenerating`)
        else if (t === 'retry') {
          pushLog(`⏳ ${ev.label}: ${ev.reason} — retrying in ${ev.wait}s`)
        } else if (t === 'summary') {
          pushLog(`🏁 ${ev.solids} solid(s) across ${ev.parts}/${ev.total} part(s) in ${ev.seconds}s`)
        }
      }
      try {
        const res = await api.aiGenerateStream(text, doc.toJSON(), get().aiLod, onEvent)
        const backup = doc.toJSON() // para accept/discard
        const layerByName = new Map(doc.layers.map((l) => [l.name.toLowerCase(), l.id]))
        // Crea (una vez) la capa de una pieza y devuelve su id; agrupa la geometría por pieza.
        const ensureLayer = (name: string): string => {
          const key = name.trim().toLowerCase() || '0'
          const existing = layerByName.get(key)
          if (existing) return existing
          try {
            const l = layerSvc.create(name.trim())
            layerByName.set(key, l.id)
            return l.id
          } catch {
            return doc.firstLayerId
          }
        }
        const added: string[] = []
        const addByPart = new Map<string, number>() // resumen por pieza (capa)
        let dels = 0
        let upds = 0
        for (const op of res.operations) {
          if (op.action === 'add' && op.type && op.props) {
            const partName = op.layer || '0'
            const layer = partName === '0' ? doc.firstLayerId : ensureLayer(partName)
            try {
              const e = doc.addEntity({ type: op.type as EntityType, layer, props: op.props as unknown as EntityProps })
              added.push(e.id)
              addByPart.set(partName, (addByPart.get(partName) ?? 0) + 1)
            } catch {
              /* op inválida: se ignora */
            }
          } else if (op.action === 'delete' && op.id && doc.getEntity(op.id)) {
            doc.removeEntity(op.id)
            dels++
          } else if (op.action === 'update' && op.id && op.props) {
            const e = doc.getEntity(op.id)
            if (e) {
              // Sólo claves propias: `__proto__` u otras de la IA no tocan el prototipo.
              for (const [k, v] of Object.entries(op.props))
                if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') (e.props as unknown as Record<string, unknown>)[k] = v
              upds++
            }
          }
        }
        const changes: string[] = []
        for (const [part, n] of addByPart) changes.push(`+ ${part} — ${n} solid(s)`)
        if (dels) changes.push(`− ${dels} deletion(s)`)
        if (upds) changes.push(`~ ${upds} update(s)`)
        if (changes.length === 0) {
          // El modelo no devolvió operaciones dibujables: no hay nada para aceptar.
          set({
            aiProcessing: false,
            aiHasProposal: false,
            aiChanges: [],
            aiMessage: (res.message ? res.message + '\n\n' : '') + 'No drawable changes were generated. Try rephrasing (e.g. “draw a box 100x100x50 at the origin”).',
          })
          return
        }
        aiBackup = backup
        doc.touch()
        set({ selection: added, aiHasProposal: true, aiChanges: changes, aiMessage: res.message || 'Done.', aiProcessing: false })
        bump()
        get().activeViewport?.zoomExtents()
      } catch (e) {
        set({ aiProcessing: false, aiHasProposal: false, aiMessage: `AI error: ${e instanceof Error ? e.message : String(e)}` })
      }
    },
    acceptAiProposal: () => {
      if (!aiBackup) return
      undoStack.push(aiBackup) // el cambio de IA queda como un único paso de undo
      if (undoStack.length > MAX_UNDO) undoStack.shift()
      redoStack.length = 0
      aiBackup = null
      set({ aiHasProposal: false, aiChanges: [], selection: [], aiMessage: 'Changes applied.' })
      print('AI changes applied.')
    },
    discardAiProposal: () => {
      if (!aiBackup) return
      doc.load(aiBackup)
      aiBackup = null
      set({ aiHasProposal: false, aiChanges: [], selection: [], aiMessage: 'Changes discarded.' })
      bump()
      print('AI changes discarded.')
    },
    publishLayouts: (ids) => {
      const layouts = doc.layouts.filter((l) => ids.includes(l.id))
      if (!layouts.length) return print('No layouts to publish.')
      // Los layouts que nunca se abrieron se arman antes (rótulo + viewport), como al activarlos.
      if (layouts.some((l) => !l.initialized)) {
        const prev = doc.activeTab
        const ms = doc.msViewportId
        for (const l of layouts) if (!l.initialized) activateTab(doc, l.id, get().currentLayerId, sheetInit())
        doc.setActiveTab(prev)
        if (ms) doc.setMsViewport(ms)
        bump()
      }
      doc.meta.plotted = new Date().toISOString() // campo PlotDate
      const base = get().docName || 'drawing'
      const bytes = plotLayouts(layouts.map((l) => layoutPlotInput(l.id, base)))
      downloadBytes(bytes, `${base}.pdf`)
      print(`<Published ${layouts.length} sheet(s) to "${base}.pdf">`)
    },
    exportPdf: () => {
      const download = (bytes: Uint8Array, name: string) => {
        const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        print(`<Plotted "${name}">`)
      }
      const base = get().docName || 'drawing'
      const layout = doc.activeLayout
      doc.meta.plotted = new Date().toISOString() // campo PlotDate
      const fields = fieldContextFor(doc, base + DRAWING_EXT, doc.activeTab)
      if (layout) {
        // Layout: la hoja 1:1 en su papel, con cada viewport a escala.
        download(plotLayouts([layoutPlotInput(layout.id, base)]), `${base}-${layout.name}.pdf`)
        return
      }
      const { empty, bytes } = exportPdf(resolveFieldTexts(expandEntities(doc.entities, doc.blocks, { attdisp: doc.attdisp, skipLayers: frozenLayerIds(doc.layers) }), fields), doc.layers, { linetypes: doc.linetypeContext('model') })
      if (empty) {
        print('Nothing to plot (no printable/visible geometry).')
        return
      }
      download(bytes, `${base}.pdf`)
    },
    importFile: () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = `.obj,.dxf,.dwg,${DRAWING_EXTS.join(',')}`
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) return
        const name = file.name.toLowerCase()
        // Un .cota no se "importa" sobre el dibujo actual: se abre como dibujo.
        if (isDrawingFile(name)) {
          void get().openDeviceFile(file)
          return
        }
        const reader = new FileReader()
        if (name.endsWith('.dwg')) {
          // DWG: se convierte a DXF en el backend y luego se importa como DXF.
          reader.onload = () => {
            print('Converting DWG…')
            api
              .dwgToDxf(reader.result as ArrayBuffer)
              .then((dxfText) => runImport(() => importDxfText(dxfText), (n) => `Imported ${n} entity(ies) from DWG.`))
              .catch((err) =>
                print(
                  err instanceof ApiError && err.status === 501
                    ? 'DWG converter not available on the server.'
                    : `DWG import failed: ${err instanceof Error ? err.message : String(err)}`,
                ),
              )
          }
          reader.readAsArrayBuffer(file)
          return
        }
        reader.onload = () => {
          const text = String(reader.result ?? '')
          if (name.endsWith('.dxf')) runImport(() => importDxfText(text), (n) => `Imported ${n} entity(ies) from DXF.`)
          else runImport(() => importObjText(text), (n) => `Imported ${n} mesh(es) from OBJ.`)
        }
        reader.readAsText(file)
      }
      input.click()
    },
    openFromDevice: () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = `${DRAWING_EXTS.join(',')},.dxf,.dwg,${MODEL_EXTS.join(',')}`
      input.onchange = () => {
        const file = input.files?.[0]
        if (file) void get().openDeviceFile(file)
      }
      input.click()
    },
    openDeviceFile: async (file) => {
      const lower = file.name.toLowerCase()
      const name = splitDrawingPath(file.name).name || 'drawing1'
      // Sin ruta: el próximo SAVE crea un archivo nuevo (carpeta de trabajo) o un documento en la nube.
      const detached = { docId: null, docName: name, docFolder: '', fsFilePath: null, openOpen: false, selection: [] }
      try {
        if (isDrawingFile(lower)) {
          const data = JSON.parse(await file.text()) as DocumentData
          pushSnapshot()
          doc.load(data)
          currentFile = null
          set({ ...detached, currentLayerId: doc.currentLayer, viewportLayout: doc.viewportLayout })
          restoreModelUcs()
          print(`Opened "${file.name}" from the device.`)
        } else if (MODEL_EXTS.some((x) => lower.endsWith(x))) {
          // Modelos 3D (STL, OBJ, STEP, IGES): un dibujo nuevo con cada cuerpo como malla.
          const meshes = await readModelFile(file, lower)
          pushSnapshot()
          doc.reset()
          for (const m of meshes) doc.addEntity({ type: 'MESH3D', layer: doc.currentLayer, props: { vertices: m.vertices, faces: m.faces } })
          currentFile = null
          set({ ...detached, viewportLayout: doc.viewportLayout })
          restoreModelUcs()
          print(`Opened "${file.name}" from the device (${meshes.length} mesh(es)).`)
        } else {
          let dxf: string
          if (lower.endsWith('.dwg')) {
            print('Converting DWG…')
            dxf = await api.dwgToDxf(await file.arrayBuffer())
          } else dxf = await file.text()
          pushSnapshot()
          doc.reset()
          const n = importDxfText(dxf, true)
          currentFile = null
          set({ ...detached, viewportLayout: doc.viewportLayout })
          restoreModelUcs()
          print(`Opened "${file.name}" from the device (${n} entities).`)
        }
        bump()
        get().activeViewport?.zoomExtents()
      } catch (err) {
        if (err instanceof ApiError && err.status === 501) print('DWG converter not available on the server.')
        else print(`"${file.name}" could not be read (${err instanceof Error && err.message ? err.message : 'invalid file?'}).`)
      }
    },
    exportModel: (format) => {
      const docName = get().docName || 'drawing'
      const download = (content: BlobPart, ext: string, mime: string) => {
        const name = `${docName}.${ext}`
        const blob = new Blob([content], { type: mime })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        print(`<Exported "${name}">`)
      }
      if (format === 'OBJ') {
        const meshes: ObjMesh[] = []
        for (const e of expandEntities(doc.entities, doc.blocks)) {
          if (e.type === 'MESH3D') meshes.push({ name: e.id, vertices: e.props.vertices, faces: e.props.faces })
          else if (e.type === 'SOLID3D') {
            const m = solidMesh(e.props)
            meshes.push({ name: e.id, vertices: m.vertices, faces: m.faces })
          }
        }
        if (meshes.length === 0) {
          print('Nothing to export (no 3D geometry for OBJ).')
          return
        }
        download(exportObj(meshes), 'obj', 'text/plain')
        return
      }
      const dxf = exportDxf(expandEntities(doc.entities, doc.blocks, { attdisp: doc.attdisp }), doc.layers, get().currentLayerId, doc.dimStyles, {
        linetypes: doc.linetypes,
        vars: doc.toJSON().vars,
      })
      if (format === 'DXF') {
        download(dxf, 'dxf', 'application/dxf')
        return
      }
      // DWG: se genera el DXF y el backend lo convierte a DWG.
      print('Converting to DWG…')
      api
        .dxfToDwg(dxf)
        .then((bytes) => download(bytes, 'dwg', 'image/vnd.dwg'))
        .catch((err) =>
          print(
            err instanceof ApiError && err.status === 501
              ? 'DWG converter not available on the server.'
              : `DWG export failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
        )
    },
    computePreview: (cursor) => engine.computePreview(cursor),
    listCommands: () => engine.getCommands(),
    clearSelection: () => set({ selection: [] }),
    selectAll: () => {
      if (engine.isSelecting) {
        get().submitCommand('ALL')
        return
      }
      if (engine.busy) return
      set({ selection: selectableEntities(doc).map((e) => e.id) })
    },
    selectEntity: (id) => {
      if (!doc.getEntity(id)) return
      set({ selection: [id] })
    },
    deleteSelection: () => {
      const ids = get().selection
      if (ids.length === 0) return
      // Solo entidades en layers no bloqueados/visibles.
      const removable = ids.filter((id) => {
        const e = doc.getEntity(id)
        if (!e) return false
        const l = layerSvc.get(e.layer)
        return layerEditable(l)
      })
      if (removable.length === 0) return
      pushSnapshot()
      for (const id of removable) doc.removeEntity(id)
      set({ selection: [] })
      bump()
      print(`Erased ${removable.length} object(s).`)
    },
    undo: () => {
      while (undoStack.length > 0) {
        const e = undoStack.pop()!
        if (isView(e)) {
          const back = applyViewUndo(e)
          if (!back) continue // su viewport ya no existe: se salta
          redoStack.push(back)
          print('Undo: view.')
          return
        }
        redoStack.push(doc.toJSON())
        doc.load(e)
        afterRestore()
        print('Undo.')
        return
      }
      print('Nothing to undo.')
    },
    redo: () => {
      while (redoStack.length > 0) {
        const e = redoStack.pop()!
        if (isView(e)) {
          const back = applyViewUndo(e)
          if (!back) continue
          undoStack.push(back)
          print('Redo: view.')
          return
        }
        undoStack.push(doc.toJSON())
        doc.load(e)
        afterRestore()
        print('Redo.')
        return
      }
      print('Nothing to redo.')
    },
    updateEntityLayer: (id, layerId) => {
      const e = doc.getEntity(id)
      if (!e) return
      pushSnapshot()
      e.layer = layerId
      doc.touch()
      bump()
    },
    updateEntityNumber: (id, path, value) => {
      const e = doc.getEntity(id)
      if (!e) return
      pushSnapshot()
      applyNumber(e, path, value)
      doc.touch()
      bump()
    },
    updateEntityField: (id, key, value) => {
      const e = doc.getEntity(id)
      if (!e) return
      const l = layerSvc.get(e.layer)
      if (l && l.locked) return
      pushSnapshot()
      applyField(e, key, value)
      doc.touch()
      bump()
    },

    // --- auth ---
    login: async (email, password, register) => {
      set({ authError: null })
      try {
        if (register) await api.register(email, password)
        const { user } = await api.login(email, password)
        set({ token: 'session', email: user.email, loginOpen: false })
        print(`Signed in as ${user.email}.`)
        await applyUserConfig()
      } catch (err) {
        set({ authError: err instanceof ApiError ? err.message : 'Network error' })
      }
    },
    restoreSession: async () => {
      // Plantilla predeterminada de layouts (se guarda con su contenido: no depende de la carpeta).
      void idbGet<{ id: string; data: LayoutTemplate | null }>(DEFAULT_TEMPLATE_KEY).then((v) => {
        if (!v) return
        defaultTemplateData = v.data
        set({ defaultTemplate: v.id })
      })
      // Carpeta local recordada: si el permiso sigue vigente se reconecta sola; si el
      // navegador lo degradó a "prompt", se ofrece el botón Reconectar (necesita un gesto).
      void (async () => {
        const dir = await idbGet<FsDirHandle>(WORKSPACE_KEY)
        if (!dir) return
        const state = await permissionState(dir)
        if (state === 'granted') {
          workspaceDir = dir
          set({ fsFolderName: dir.name, fsPending: false })
        } else {
          set({ fsFolderName: dir.name, fsPending: true })
        }
      })()
      if (!CLOUD_ENABLED) return // compilación sin servidor: no hay sesión que restaurar
      try {
        const user = await api.me()
        set({ token: 'session', email: user.email })
        await applyUserConfig()
      } catch {
        // Una cookie vencida/ausente es el estado normal de un visitante anónimo.
      }
    },
    notify: (line) => print(line),
    logout: async () => {
      try {
        await api.logout()
      } finally {
        set({ token: null, email: null, docId: null })
        print('Signed out.')
      }
    },
    closeLogin: () => set({ loginOpen: false, authError: null }),
    openLoginDialog: () => set({ loginOpen: true, authError: null }),

    // --- documentos ---
    newDocument: () => {
      pushSnapshot()
      doc.reset()
      restoreModelUcs()
      currentFile = null // el próximo SAVE crea un archivo nuevo en la carpeta local
      set({
        docId: null,
        docName: 'drawing1',
        docFolder: '',
        fsFilePath: null,
        currentLayerId: doc.firstLayerId,
        selection: [],
        viewportLayout: 1,
      })
      bump()
    },
    setDocName: (name) => set({ docName: name }),
    setDocPath: (path) => {
      const trimmed = path.replace(/^\/+|\/+$/g, '')
      const i = trimmed.lastIndexOf('/')
      set({ docFolder: i >= 0 ? trimmed.slice(0, i) : '', docName: i >= 0 ? trimmed.slice(i + 1) : trimmed })
    },
    saveDocument: async () => {
      const { docId, docName, docFolder } = get()
      // Fecha de guardado (campo SaveDate). Sin `touch`: guardar no "modifica" el dibujo.
      doc.meta.modified = new Date().toISOString()
      doc.setCurrentLayer(get().currentLayerId) // CLAYER: la capa de trabajo viaja con el dibujo
      // Sin carpeta ni cuenta: se descarga el .cota (el navegador lo deja en Descargas).
      if (!workspaceDir && !get().token) {
        const file = `${docName || 'drawing'}${DRAWING_EXT}`
        const blob = new Blob([JSON.stringify(doc.toJSON())], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        print(`<Saved "${file}" to your downloads>`)
        return
      }
      // Modo carpeta local: el dibujo se escribe como .cota en la carpeta elegida.
      if (workspaceDir) {
        if (!(await ensurePermission(workspaceDir))) {
          print('Permission to write in the folder was denied.')
          return
        }
        const text = JSON.stringify(doc.toJSON())
        try {
          if (currentFile) {
            await writeTextFile(currentFile, text)
            print(`<Saved "${get().fsFilePath ?? docName}">`)
            return
          }
          const written = await writeDrawing(workspaceDir, docFolder, docName, text, DRAWING_EXT)
          if (!written) {
            print('Could not create the file in the working folder.')
            return
          }
          currentFile = written.handle
          set({ fsFilePath: written.path, docId: null })
          print(`<Saved "${written.path}">`)
        } catch {
          print('Save failed: the file could not be written.')
        }
        return
      }
      try {
        const data = doc.toJSON()
        if (docId) {
          await api.updateDocument(docId, docName, data, docFolder)
        } else {
          const created = await api.createDocument(docName, data, docFolder)
          set({ docId: created.id })
        }
        print(`<Saved "${docFolder ? docFolder + '/' : ''}${docName}">`)
      } catch (err) {
        print(err instanceof ApiError ? `Save failed: ${err.message}` : 'Save failed: network error')
      }
    },
    openDocumentsDialog: async () => {
      // Con carpeta local, el diálogo lista los archivos reales de esa carpeta.
      if (workspaceDir) {
        if (!(await ensurePermission(workspaceDir))) {
          print('Permission to read the folder was denied.')
          return
        }
        try {
          set({ fsList: await listDrawings(workspaceDir), docList: [], openOpen: true })
        } catch {
          print('Could not read the working folder.')
        }
        return
      }
      try {
        const list = await api.listDocuments()
        set({ docList: list, fsList: [], openOpen: true })
      } catch (err) {
        print(err instanceof ApiError ? err.message : 'Could not list documents')
      }
    },

    // --- Carpeta local del sistema ---
    pickWorkspaceFolder: async () => {
      if (!fsaSupported()) {
        print('This browser cannot open system folders (use Chrome or Edge); drawings stay in the cloud.')
        return
      }
      const dir = await pickWorkspace()
      if (!dir) return
      workspaceDir = dir
      currentFile = null
      await idbSet(WORKSPACE_KEY, dir)
      set({ fsFolderName: dir.name, fsFilePath: null, fsPending: false })
      print(`Working folder: "${dir.name}". SAVE/OPEN now use this folder.`)
    },
    reconnectWorkspace: async () => {
      const dir = workspaceDir ?? (await idbGet<FsDirHandle>(WORKSPACE_KEY))
      if (!dir) return
      if (!(await ensurePermission(dir))) {
        print('Permission to use the folder was denied.')
        return
      }
      workspaceDir = dir
      set({ fsFolderName: dir.name, fsPending: false })
      print(`Working folder: "${dir.name}".`)
    },
    useCloudStorage: () => {
      workspaceDir = null
      currentFile = null
      void idbDelete(WORKSPACE_KEY)
      set({ fsFolderName: null, fsFilePath: null, fsPending: false, fsList: [] })
      print('Working in the cloud: SAVE/OPEN use your account again.')
    },
    openLocalDrawing: async (path) => {
      if (!workspaceDir) return
      const { folder, name } = splitDrawingPath(path)
      const fileName = path.split('/').pop() as string
      const handle = await fileHandleAt(workspaceDir, folder, fileName)
      if (!handle) {
        print(`Could not open "${path}".`)
        return
      }
      try {
        const text = await readTextFile(handle)
        pushSnapshot()
        if (fileName.toLowerCase().endsWith('.dxf')) {
          doc.reset()
          const n = importDxfText(text, true)
          currentFile = null // un DXF importado se guarda como .cota nuevo
          set({ docId: null, docName: name, docFolder: folder, fsFilePath: null, openOpen: false, selection: [] })
          print(`Imported "${path}" (${n} entities).`)
        } else {
          doc.load(JSON.parse(text) as DocumentData)
          restoreModelUcs()
          currentFile = handle
          set({
            docId: null,
            docName: name,
            docFolder: folder,
            fsFilePath: path,
            currentLayerId: doc.currentLayer,
            openOpen: false,
            selection: [],
            viewportLayout: doc.viewportLayout,
          })
          print(`Opened "${path}".`)
        }
        bump()
      } catch {
        print(`"${path}" could not be read (invalid file?).`)
      }
    },
    loadDocument: async (id) => {
      try {
        const payload = await api.getDocument(id)
        doc.load(payload.data)
        restoreModelUcs()
        set({
          docId: payload.id,
          docName: payload.name,
          docFolder: payload.folder ?? '',
          currentLayerId: doc.currentLayer,
          openOpen: false,
          selection: [],
          viewportLayout: doc.viewportLayout,
        })
        bump()
        print(`Opened "${payload.name}".`)
      } catch (err) {
        print(err instanceof ApiError ? err.message : 'Could not open document')
      }
    },
    deleteDocument: async (id) => {
      try {
        await api.deleteDocument(id)
        const list = await api.listDocuments()
        set({ docList: list })
        if (get().docId === id) set({ docId: null })
      } catch (err) {
        print(err instanceof ApiError ? err.message : 'Could not delete document')
      }
    },
    closeOpen: () => set({ openOpen: false }),
  }
})

// Preferencias del usuario guardadas en este navegador: se aplican antes del primer render, así las
// barras, paletas y ayudas de dibujo aparecen como quedaron.
{
  const local = readLocalPrefs()
  if (local) useStore.getState().applyPrefs(local)
}

// Hook de depuración/E2E, solo en desarrollo: expone el store en window.
if (import.meta.env.DEV) {
  ;(window as unknown as { __cotaStore?: typeof useStore }).__cotaStore = useStore
}

/** Aplica un valor numérico a una propiedad de la entidad por "path" simple. */
function applyNumber(e: Entity, path: string, value: number): void {
  if (e.type === 'CIRCLE' && path === 'radius') e.props.radius = value
  else if (e.type === 'RECTANGLE' && path === 'width') e.props.width = value
  else if (e.type === 'RECTANGLE' && path === 'height') e.props.height = value
  else if (e.type === 'SOLID3D' && e.props.op === 'EXTRUDE' && path === 'height') e.props.height = value
}

// CLAYER: la capa actual se anota en el dibujo apenas cambia, no sólo al guardar; así cualquier
// camino de guardado (SAVE, autoguardado, DXF) la lleva y al abrir el .cota vuelve la misma capa.
useStore.subscribe((s, prev) => {
  if (s.currentLayerId !== prev.currentLayerId) s.doc.setCurrentLayer(s.currentLayerId)
})
