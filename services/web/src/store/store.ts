import { docsUrl } from '../core/about'
import { chooseFile, chooseFiles } from './filePicker'
import { frozenLayerIds, layerEditable, layerShown } from '../core/layers/visibility'
import { type ProjStd } from '../core/viewNet'
import { setChainBase } from '../core/commands/impl/dim'
import { reassociatePoint } from '../core/dimension/assoc'
import type { DimStyleDef, DimVarName, DimVars } from '../core/dimension/style'
import type { Deferred } from '../core/geom/tangency'
import { create } from 'zustand'
import { DocumentModel, MODEL_TAB } from '../core/document/DocumentModel'
import { setTraceSnapshot, traceLog } from '../core/session/traceLog'
import { noteCloseHit, notePoint } from '../core/geom/note'
import { LayerService } from '../core/layers/LayerService'
import { CommandEngine } from '../core/commands/CommandEngine'
import { registerDefaultCommands } from '../core/commands/registry'
import { applySysvars, persistedSysvars, sysvars, type PersistedSysvars } from '../core/commands/sysvars'
import type { AppHooks, Command, Measure } from '../core/commands/types'
import type { DimensionProps, DocumentData, DrawingVars, Entity, HatchIsland, SolidProps, EntityProps, EntityType, ImageEntity, ImageProps, LineType, NoteColor, PageSetup } from '../core/document/types'
import { IMAGE_EXTS, imageFileName, isImageFile } from '../core/geom/image'
import { drawingImages } from '../core/commands/impl/image'
import { rebuildHatchLoops } from '../core/hatch/assoc'
import { DEFAULT_THEME, normalizeTheme, type Theme } from '../core/theme'
import { DEFAULT_OSNAP, normalizeOsnap, type OsnapConfig, type OsnapKind } from '../core/snap/osnap'
import type { Pt, Vec3 } from '../core/math'
import type { PreviewShape } from '../core/preview'
import { isWorldUcs, normalizeUcs, sameUcs, ucsToDef, WORLD_UCS, type Ucs } from '../core/ucs'
import { paneKeyOf, paneState, paperCams } from '../render/viewMemory'
import { clearViewLayers, endIsolation, isHidden } from '../core/editing/isolation'
import { touchConfig } from '../render/touchGesture'
import type { SavedViews } from '../core/document/types'
import { DEFAULT_PALETTE, normalizePalette, type PaletteState } from '../core/ui/palette'
import { dockToolbar, normalizeToolbar, normalizeToolbars, type ToolbarSide, type ToolbarState, type ToolbarStates } from '../core/ui/toolbar'
import { DEFAULT_TOOLBARS, findToolbar } from '../core/ui/toolbars'
import { pickPrefs, readLocalPrefs, writeLocalPrefs, type Prefs } from '../core/ui/prefs'
import { enterFullscreen, exitFullscreen, fileAccept, isPhone, mobileParam, type ViewMode } from '../ui/appWindow'
import { DEFAULT_VISUAL_STYLE, VISUAL_STYLES, type CameraMode, type ViewName, type VisualStyle } from '../core/view'
import type { CameraState, Viewport } from '../render/Viewport'
import { entitiesInScreenBox, entityOutline, type RectPx } from '../core/editing/bounds'
import { scaleEntity, translateEntity } from '../core/editing/edit'
import { addTransformed, applyTransform, mirrorAxis, mirrorTransform, rotateTransform, type EntityTransform } from '../core/editing/transform'
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
import { fromVec3, toVec3 } from '../core/math'
import { MM_TO_PT, modelPlotPage, pdfDocument, PlotRasters, type PdfPage, type PdfRaster, type PlotArea } from '../core/io/pdf'
import { decodeRaster } from '../core/io/rasterDecode'
import { layoutPage, plotLayouts } from '../core/io/layoutPlot'
import { DEFAULT_PLOT, plotPage, type PlotSettings } from '../core/io/plotSettings'
import { paperPerModel, unitToMm } from '../core/layout/scale'
import { PAPER_SIZES, defaultPageSetup } from '../core/layout/paper'
import { newViewportProps } from '../core/layout/viewport'
import { fieldContextFor, resolveFieldTexts } from '../core/fields/context'
import { exportObj, importObj, type ObjMesh } from '../core/io/obj'
import { exportDxf, importDxf, type DxfImportResult } from '../core/io/dxf'
import { dwgErrorMessage, dwgVersion, dxfTextToDwg, importCadInWorker } from '../core/io/dwg'
import {
  ensurePermission,
  fsaSupported,
  fileHandleAt,
  filesNamed,
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
import { DRAWING_EXT, DRAWING_EXTS, isBackupFile, isDrawingFile, splitDrawingPath, drawingFileName, joinPath } from '../core/io/paths'
import { selectableEntities } from '../core/commands/selectionSets'
import { DEFAULT_FLATSHOT, flatshotItems, type FlatshotOptions } from '../core/projection/flatshot'
import { alignDrawingViews, isDrawingView, isShaded, showsHidden, viewBlockEntities } from '../core/drawing/views'
import { shadeViewTriangles } from '../core/projection/shade'
import { solidThreads, threadViewItems } from '../core/thread/geometry'
import { parseScript } from '../core/commands/script'
import type { ScriptResult } from '../core/commands/CommandEngine'
import { solidTopology } from '../core/editing/topology'
import { onSolidsChanged, solidMesh, solidMeshWithSurfaces } from '../render/csg'
import { onKernelMessage } from '../render/occtKernel'
import { parseStl } from '../core/io/stl'
import { requestViewGen } from '../ui/ViewGenDialog'
import { DRAWING_TEMPLATE_EXT, drawingFromTemplate, makeTemplate, parseTemplate as parseDrawingTemplate, readDefaultTemplate, writeDefaultTemplate, type DrawingTemplate } from '../core/io/drawingTemplate'
import { ApiError, api, type DocumentSummary } from '../core/io/apiClient'

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
/** Comandos que no cambian el dibujo: no necesitan una copia para deshacer. */
const VIEW_ONLY_COMMANDS = new Set(['ZOOM', 'PAN', 'REDRAW', 'REGEN', 'LIST', 'ID', 'DIST', 'HELP'])

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
  /** Entrada dinámica (DYN / F12): tras el primer punto, `x,y` tecleado es relativo sin `@`. */
  dynInput: boolean
  /** Rastreo polar (POLAR / F10): ángulos múltiplos de POLARANG desde el punto base. Excluye a ORTHO. */
  polar: boolean
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
  /** Panel del agente abierto (abierto la primera vez) y pestaña "Agents" a la derecha cuando está cerrado. */
  agentOpen: boolean
  agentTab: boolean
  setAgentPanel: (patch: { open?: boolean; tab?: boolean }) => void
  /** Vista para el celular (PRD076): `auto` = la mobile en teléfonos; `mobile`/`full` = elegida a mano. */
  viewMode: ViewMode
  /** `?mobile=1`/`?mobile=0` en la dirección: fuerza la vista en esta pestaña hasta que se elija otra (no se guarda). */
  viewForce: boolean | null
  /** Última medición de DIST (la muestra la vista mobile, con el tramo medido dibujado). */
  lastMeasure: Measure | null
  setMeasure: (m: Measure | null) => void
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
  /** Ventana/cruce pedido con W/C en el prompt de selección (el visor la abre con ese tipo). */
  selectionArea: () => 'window' | 'crossing' | null
  cancel: () => void
  setCurrentLayer: (id: string) => void
  createLayer: (name: string) => void
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
  setEntitiesCommon: (ids: string[], key: 'lineType' | 'ltScale' | 'color' | 'lineWeight', value: string | number) => void
  /** Menú del clic derecho en el modo Realtime de ZOOM/PAN. */
  realtimeMenu: { x: number; y: number } | null
  setRealtimeMenu: (m: { x: number; y: number } | null) => void
  /** Acción del menú Realtime: Exit, Pan, Zoom, Zoom Window, Zoom Original, Zoom Extents. */
  realtimeAction: (a: 'exit' | 'pan' | 'zoom' | 'orbit' | 'forbit' | 'corbit' | 'window' | 'original' | 'extents') => void
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
  toggleDynInput: () => void
  togglePolar: () => void
  /** Ctrl+Shift+A: selección de grupos (PICKSTYLE) sí/no. */
  togglePickstyle: () => void
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
  /** Nota rápida cuyo texto se edita sobre ella misma (doble clic), con su rectángulo en la página; null = ninguna. */
  noteEdit: { id: string; text: string; color: NoteColor; rect: { left: number; top: number; width: number; height: number } } | null
  openNoteEditor: (id: string) => void
  closeNoteEditor: (save: boolean, text?: string) => void
  openDwgProps: () => void
  closeDwgProps: () => void
  setDrawingProps: (patch: Partial<DocumentData['meta']>) => void
  /** *VP Freeze*: congela/descongela la capa en el viewport de MSPACE. */
  setLayerVpFrozen: (id: string, frozen: boolean) => void
  /** *New VP Freeze*: la capa nace congelada en los viewports nuevos. */
  setLayerNewVpFreeze: (id: string, frozen: boolean) => void
  toggleAutosave: () => void
  /** Ajustes de pantalla: pantalla limpia, línea de comandos compacta, cubo de vistas. */
  setScreen: (patch: { cleanScreen?: boolean; commandLineCompact?: boolean; viewCubeOn?: boolean; viewNetStd?: ProjStd; mobileView?: boolean }) => void
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
  plotOpen: boolean
  qselectOpen: boolean
  /** Diálogo SCRIPT (multicomandos): texto inicial y si viene de un enlace compartido; null = cerrado. */
  scriptDialog: { text: string; shared: boolean } | null
  openScript: (text?: string, shared?: boolean) => void
  closeScript: () => void
  /**
   * Multicomandos en una sola operación (un paso de deshacer). `finish: 'cancel'` cancela el comando que quede
   * esperando al final; `'leave'` (por defecto) lo deja para seguir a mano.
   */
  runScript: (text: string, opts?: { finish?: 'cancel' | 'leave'; fresh?: boolean }) => Promise<ScriptResult>
  /** Capa, color, tipo de línea o grosor de objetos existentes (agente), en un paso de deshacer. Devuelve cuántos. */
  setObjectProps: (ids: string[], p: { layer?: string; color?: string; linetype?: string; lineweight?: number }) => number
  openQselect: () => void
  closeQselect: () => void
  /** QSELECT ▸ OK: deja seleccionados esos objetos (o los suma a la selección actual). */
  applyQselect: (ids: string[], append: boolean) => void
  /** Opciones del último PLOT del modelo (se recuerdan en la sesión). */
  plotSettings: PlotSettings
  /** Página que saldría con esas opciones (para la vista previa), y si se puede usar Display (vista en planta). */
  plotPreview: (s: PlotSettings) => { page: PdfPage; empty: boolean; layout: string | null; displayAvailable: boolean; scale: number | null; rasters?: PlotRasters }
  /** Cierra el diálogo de PLOT: 'plot' descarga el PDF con esas opciones. */
  resolvePlot: (r: 'plot' | 'window' | 'cancel', s?: PlotSettings) => void
  /** PUBLISH: un PDF con una página por layout (en el orden de las pestañas). */
  publishLayouts: (ids: string[]) => void
  importFile: () => void
  /** OPEN ▸ Device: selector de archivos del sistema (.cota/.dxf/.dwg), fuera de la carpeta de trabajo. */
  openFromDevice: () => void
  /** Abre como dibujo un archivo elegido del dispositivo (sin ruta: SAVE lo guarda como nuevo). */
  openDeviceFile: (file: File) => Promise<void>
  /** Archivos elegidos o soltados sobre Cota: el plano (si hay uno) se abre y las imágenes se le cargan. */
  openDeviceFiles: (files: File[]) => Promise<void>
  /** Selector de los archivos de las imágenes del dibujo (un plano guarda sólo su ruta). */
  attachImages: () => void
  /** Carga los píxeles de las imágenes del dibujo desde esos archivos, asociados por el nombre; devuelve cuántas. */
  attachImageFiles: (files: File[]) => Promise<number>
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
  /** Guarda el dibujo (carpeta, cuenta o descarga); true si quedó guardado. */
  saveDocument: () => Promise<boolean>
  /** Copia de recuperación `.sv$` del dibujo en la carpeta local (SAVETIME); no cuenta como guardado. */
  writeRecovery: () => Promise<void>
  /** ¿Hay cambios desde que se abrió, se creó o se guardó el dibujo? */
  isDirty: () => boolean
  /** El dibujo actual cuenta como guardado (al terminar de arrancar la app). */
  markSaved: () => void
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

/** Al exportar a DXF/DWG, los sólidos de Cota salen como la malla de sus caras: la pieza se conserva tal como se ve. */
const solidsAsMeshes = (list: Entity[]): Entity[] => list.map((e) => (e.type === 'SOLID3D' ? ({ ...e, type: 'MESH3D', props: solidMesh(e.props) } as Entity) : e))

/** Qué se pierde de cada entidad que entra simplificada al abrir un DWG/DXF. */
/** Contenido de un archivo como data URL (los píxeles de una imagen viajan así dentro del dibujo). */
const fileDataUrl = (f: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? ''))
    r.onerror = () => reject(r.error ?? new Error('read failed'))
    r.readAsDataURL(f)
  })

const SIMPLIFIED_NOTE: Record<string, string> = {
  PDFUNDERLAY: 'file name: the underlay is an external file',
  DWFUNDERLAY: 'file name: the underlay is an external file',
  DGNUNDERLAY: 'file name: the underlay is an external file',
  OLE2FRAME: 'frame only',
  WIPEOUT: 'the mask is not applied',
  SHAPE: 'a point: its drawing is in an external shape file',
}

/** Página de una hoja de DWG/DXF: el papel estándar de ese tamaño o uno personalizado. */
function dxfPageSetup(s: { width: number; height: number; margins: [number, number, number, number] }): PageSetup {
  const [short, long] = [Math.min(s.width, s.height), Math.max(s.width, s.height)]
  const known = Object.entries(PAPER_SIZES).find(([, p]) => Math.abs(p.size[0] - short) < 1 && Math.abs(p.size[1] - long) < 1)?.[0]
  return {
    ...defaultPageSetup(known ?? 'CUSTOM'),
    ...(known ? {} : { customSize: [short, long] as [number, number] }),
    orientation: s.width >= s.height ? 'landscape' : 'portrait',
    marginsMm: s.margins,
  }
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

/** Registra un cambio de selección como paso de deshacer (lo arma el store; ver `SelUndo`). */
let selectionStep: ((prev: string[], next: string[]) => void) | null = null

export const useStore = create<AppState>((set, get) => {
  const doc = DocumentModel.createDefault()
  const layerSvc = new LayerService(doc)

  // Handles de la File System Access API: viven fuera del estado de React (no son serializables).
  let workspaceDir: FsDirHandle | null = null
  let currentFile: FsFileHandle | null = null
  /** Revisión del dibujo la última vez que se abrió, creó o guardó (para avisar de cambios sin guardar). */
  let savedRev = doc.revision
  const markSaved = () => (savedRev = doc.revision)

  /** Aplica el tema a todos los viewports vivos y a las variables CSS. */
  const applyTheme = (theme: Theme) => {
    get().viewports.forEach((vp) => vp.setTheme(theme))
    setCrosshairVars(theme)
  }

  // --- Importación de geometría (reutilizada por OBJ/DXF/DWG) ---
  /** Importa un DXF al dibujo actual; con `asDrawing` (OPEN de un .dxf/.dwg) además toma su `$CLAYER`. */
  /**
   * DWG → DXF: primero en el navegador (acad-ts, sin servidor); si el archivo no se puede leer ahí y hay un servidor
   * con conversor, se le pide a él.
   */
  const readDwg = async (data: ArrayBuffer): Promise<DxfImportResult> => {
    const version = dwgVersion(data)
    if (!version) throw new Error('the file is not a DWG drawing.')
    try {
      return await importCadInWorker('dwg', data, { light: isPhone() })
    } catch (local) {
      try {
        return importDxf(await api.dwgToDxf(data), { light: isPhone() })
      } catch {
        // Sin servidor (o sin conversor): el motivo útil es el del lector local.
        throw new Error(`this DWG (${version}) could not be read: ${dwgErrorMessage(local)}`)
      }
    }
  }
  /** Vista con que se guardó el último DXF/DWG abierto (VPORT *Active): se encuadra ahí, como el CAD clásico. */
  let openedView: DxfImportResult['view']
  /**
   * Encuadre al abrir un DXF/DWG: la vista con que se guardó (en planta o en 3D, como la tenía el visor activo) y, si
   * es en planta y no muestra nada del dibujo, todo. El rectángulo guardado entra entero en la pantalla (en un teléfono
   * en vertical se ve más alto que en el CAD de escritorio).
   */
  const frameOpenedDrawing = () => {
    const v = openedView
    openedView = undefined
    const vp = get().activeViewport
    if (!vp) return
    const ext = v && vp.kind === 'model' ? vp.extentsBox() : null
    if (v && ext) {
      const [dx, dy, dz] = v.direction
      const plan = Math.hypot(dx, dy) < 1e-9 && dz > 0
      if (plan) {
        if (!vp.isPlanView()) vp.setView('TOP')
      } else vp.setViewDir(Math.atan2(dy, dx), Math.atan2(dz, Math.hypot(dx, dy)))
      // El centro guardado está en el plano de la vista, relativo al punto mirado.
      const { right, up } = vp.viewAxes()
      const [cx, cy] = v.center
      const c = [0, 1, 2].map((i) => v.target[i] + cx * right[i] + cy * up[i])
      const hw = (v.height * v.aspect) / 2
      const hh = v.height / 2
      const shows = !plan || (c[0] + hw >= ext.min[0] && c[0] - hw <= ext.max[0] && c[1] + hh >= ext.min[1] && c[1] - hh <= ext.max[1])
      if (shows) {
        vp.fitViewRect({ x: c[0], y: c[1], z: c[2] }, hw * 2, hh * 2)
        return
      }
    }
    vp.zoomExtents()
  }
  /** Hojas de un DWG/DXF: reemplazan a las que trae un dibujo nuevo. */
  const applyDxfLayouts = (specs: NonNullable<DxfImportResult['layouts']>, layerId: (name: string) => string) => {
    const empty = doc.layouts.filter((l) => !l.entities.length)
    for (const l of empty) doc.renameLayout(l.id, `~${l.id}`) // sus nombres quedan libres para las hojas del archivo
    const tabs = specs.map((s) => {
      const layout = doc.addLayout(doc.findLayoutByName(s.name) ? undefined : s.name, dxfPageSetup(s))
      layout.initialized = true
      return { layout, s }
    })
    for (const l of empty) doc.removeLayout(l.id)
    const back = doc.activeTab
    for (const { layout, s } of tabs) {
      doc.setActiveTab(layout.id)
      for (const e of s.entities) {
        doc.addEntity({ type: e.type, layer: layerId(e.layerName), props: e.props, lineType: e.lineType ?? 'BYLAYER', ltScale: e.ltScale ?? 1, color: e.color ?? 'BYLAYER', lineWeight: e.lineWeight ?? -1, ...(e.transparency ? { transparency: e.transparency } : {}) })
      }
      for (const v of s.viewports) {
        const props = newViewportProps(v.center, v.width, v.height)
        Object.assign(props, { target: v.target, az: v.az, el: v.el, scale: v.mmPerUnit / unitToMm(doc.units), locked: v.locked, on: v.on })
        doc.addEntity({ type: 'VIEWPORT', layer: layerId(v.layerName), props })
      }
    }
    doc.setActiveTab(back)
  }
  /** Carga en el dibujo un DXF ya interpretado (en el hilo aparte de lectura o acá). */
  const applyDxf = (r: DxfImportResult, asDrawing = false): number => {
    const { currentLayer, layers, entities, dimStyles, linetypes, vars, view, unsupported } = r
    if (asDrawing) openedView = view
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
      const added = doc.addEntity({ type: e.type, layer: layerId, props: e.props, lineType: e.lineType ?? 'BYLAYER', ltScale: e.ltScale ?? 1, color: e.color ?? 'BYLAYER', lineWeight: e.lineWeight ?? -1, ...(e.transparency ? { transparency: e.transparency } : {}) })
      if (added.lineType && added.lineType !== 'BYBLOCK') doc.loadLinetype(added.lineType)
      if (added.type === 'DIMENSION' && doc.dimStyleDef(added.props.styleName ?? '')) doc.restyleDimension(added.props, added.props.styleName, added.props.overrides)
    }
    if (unsupported.length) print(`Unsupported entities skipped: ${unsupported.join(', ')}.`)
    if (r.meshedSolids) print(`${r.meshedSolids} 3D solid(s) read with their faces (as meshes).`)
    if (r.wireSolids) print(`${r.wireSolids} 3D solid(s) shown by their edges (wireframe): their faces could not be read.`)
    const noFile = entities.filter((e) => e.type === 'IMAGE' && !(e.props as ImageProps).data)
    if (noFile.length) {
      const names = [...new Set(noFile.map((e) => imageFileName(e.props as ImageProps)).filter(Boolean))]
      print(`${noFile.length} image(s) use external files${names.length ? ` (${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''})` : ''}: load them with ${isPhone() ? 'Menu ▸ Load images' : 'IMAGE'}, or open them together with the drawing.`)
    }
    if (r.simplified) print(`Simplified on open: ${Object.entries(r.simplified).map(([k, n]) => `${n} ${k} (${SIMPLIFIED_NOTE[k] ?? 'simplified'})`).join(', ')}.`)
    if (asDrawing && r.layouts?.length) applyDxfLayouts(r.layouts, (n) => idByName.get(n.toLowerCase()) ?? doc.firstLayerId)
    const clayer = currentLayer && idByName.get(currentLayer.toLowerCase())
    if (asDrawing) set({ currentLayerId: clayer || doc.firstLayerId })
    return entities.length
  }
  /** Las imágenes del plano que están en la carpeta de trabajo (junto al plano o en su raíz) se cargan solas. */
  const loadFolderImages = async (folder: string): Promise<void> => {
    const dir = workspaceDir
    if (!dir) return
    const names = [...new Set(drawingImages(doc).filter((e) => !e.props.data).map((e) => imageFileName(e.props)).filter(Boolean))]
    if (!names.length) return
    const handles = [...(await filesNamed(dir, folder, names)), ...(folder ? await filesNamed(dir, '', names) : [])]
    const files: File[] = []
    for (const h of handles) {
      const f = await h.getFile().catch(() => null)
      if (f instanceof Blob) files.push(f as File)
    }
    if (files.length) await get().attachImageFiles(files)
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
    pushSnapshot('import')
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
  // Núcleo de sólidos exacto: cuando llegan sus resultados se redibuja con la geometría nueva (el primero enseguida;
  // mientras siguen llegando, a lo sumo cada 0,75 s o el doble de lo que tardó el último redibujo) y sus fallas se avisan.
  let kernelRedraw: ReturnType<typeof setTimeout> | null = null
  let kernelRedrawAt = 0
  let kernelRedrawCost = 0
  const redrawSolids = () => {
    kernelRedraw = null
    kernelRedrawAt = performance.now()
    get().redraw()
    requestAnimationFrame(() => requestAnimationFrame(() => (kernelRedrawCost = performance.now() - kernelRedrawAt)))
  }
  onSolidsChanged(() => {
    if (kernelRedraw) return
    const gap = Math.max(750, 2 * kernelRedrawCost)
    kernelRedraw = setTimeout(redrawSolids, Math.max(0, kernelRedrawAt + gap - performance.now()))
  })
  onKernelMessage((line) => print(line))
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
  /** Selección anterior: cada cambio de selección hecho por el usuario (fuera de un comando) es un paso de Ctrl+Z. */
  interface SelUndo {
    kind: 'selection'
    ids: string[]
  }
  type UndoEntry = DocumentData | ViewUndo | SelUndo
  const isView = (e: UndoEntry | undefined): e is ViewUndo => !!e && (e as ViewUndo).kind === 'view'
  const isSel = (e: UndoEntry | undefined): e is SelUndo => !!e && (e as SelUndo).kind === 'selection'
  /** Cambios de selección que no son pasos: los de deshacer/rehacer y los que hace un comando (al terminar la vacía). */
  let selQuiet = false
  const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i])
  selectionStep = (prev, next) => {
    if (selQuiet || get().engine.busy || sameIds(prev, next)) return
    undoStack.push({ kind: 'selection', ids: prev })
    if (undoStack.length > MAX_UNDO) undoStack.shift()
  }
  /** Deshace o rehace un paso de selección; false si ya no cambia nada (sus objetos no existen o es la misma). */
  const applySelStep = (e: SelUndo, other: UndoEntry[], verb: string): boolean => {
    const ids = e.ids.filter((id) => doc.getEntity(id))
    const cur = get().selection
    if (sameIds(ids, cur)) return false
    other.push({ kind: 'selection', ids: cur })
    selQuiet = true
    set({ selection: ids })
    selQuiet = false
    print(`${verb}: selection.`)
    return true
  }
  const undoStack: UndoEntry[] = []
  const redoStack: UndoEntry[] = []
  /** Qué hizo cada paso de deshacer (EXTRUDE, cambio de capa…), para decirlo al deshacerlo o rehacerlo. */
  const undoLabels = new WeakMap<object, string>()
  const stepMessage = (verb: string, label: string | undefined) => (label ? `${verb}: ${label}.` : `${verb}.`)
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
  const modelMeshes = (ids: string[] | null): { meshes: Mesh[]; hints: CircleHint[]; colors: string[]; threaded: SolidProps[] } => {
    const shown = new Map(doc.layers.map((l) => [l.id, layerShown(l)]))
    const colorOf = new Map(doc.layers.map((l) => [l.id, l.color]))
    const colors: string[] = []
    const pick = ids ? new Set(ids) : null
    const src = pick ? doc.modelEntities.filter((e) => pick.has(e.id)) : doc.modelEntities
    const meshes: Mesh[] = []
    const hints: CircleHint[] = []
    const threaded: SolidProps[] = []
    for (const e of expandEntities(src, doc.blocks, { skipLayers: frozenLayerIds(doc.layers) })) {
      if (shown.get(e.layer) === false) continue
      if (e.type === 'SOLID3D') {
        const m = solidMeshWithSurfaces(e.props)
        if (m.vertices.length) {
          meshes.push(m)
          colors.push(colorOf.get(e.layer) ?? '#c0c0c0')
        }
        hints.push(...solidCircleHints(e.props))
        if (solidThreads(e.props).length) threaded.push(e.props)
      } else if (e.type === 'MESH3D') {
        meshes.push({ vertices: e.props.vertices, faces: e.props.faces })
        colors.push(colorOf.get(e.layer) ?? '#c0c0c0')
      }
    }
    return { meshes, hints, colors, threaded }
  }
  /** Proyección 2D (líneas ocultas) de lo 3D visible del modelo, o de los objetos `ids`. */
  const projectModel = (ids: string[] | null, basis: ProjBasis, opts: { showObscured: boolean; tangential: boolean }): ProjItem[] => {
    const { meshes, hints, threaded } = modelMeshes(ids)
    if (!meshes.length) return []
    // Roscas (THREAD): las líneas finas ISO 6410 de cada vista; las ocultas sólo si la vista las muestra.
    const threads = threaded.flatMap((p) => threadViewItems(p, basis, solidTopology(p), 0)).filter((it) => opts.showObscured || !it.hidden)
    return [...flatshotItems(meshes, hints, basis, opts), ...threads]
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
  /** Dibujo nuevo desde una plantilla; sus preferencias (colores, osnaps, estilo…) pasan a ser las del usuario. */
  const applyTemplate = (t: DrawingTemplate, full = true) => {
    if (full) pushSnapshot('template')
    doc.load(drawingFromTemplate(t, 'drawing1'))
    if (t.prefs) {
      set(prefsPatch(t.prefs))
      saveConfig()
    }
    if (full) {
      restoreModelUcs()
      currentFile = null
      set({ docId: null, docName: 'drawing1', docFolder: '', fsFilePath: null, currentLayerId: doc.currentLayer ?? doc.firstLayerId, selection: [], viewportLayout: doc.viewportLayout })
      bump()
      markSaved()
    }
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
  let plotResolve: ((r: 'plot' | 'window' | 'cancel') => void) | null = null
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

  /** Lotes de multicomandos en curso: sus comandos no dejan pasos de deshacer propios (el lote deja uno). */
  let scriptDepth = 0
  const pushSnapshot = (label?: string) => {
    const snap = doc.toJSON()
    if (label) undoLabels.set(snap, label)
    undoStack.push(snap)
    if (undoStack.length > MAX_UNDO) undoStack.shift()
    redoStack.length = 0
  }
  /** CRUD de layouts con paso de undo; si falla (nombre inválido…) imprime el motivo y no deja rastro. */
  const layoutOp = (fn: () => void): boolean => {
    pushSnapshot('layout')
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
  /** Panel que hay que activar cuando se monte (al abrir un dibujo con otra cantidad de paneles). */
  let pendingActivePane: string | null = null
  /**
   * Vistas que viajan con el dibujo al guardarlo: cámara y UCS de cada panel del modelo (los montados, en vivo; los
   * que están desmontados porque se está en un layout, los recordados), el panel activo, la vista del papel de cada
   * layout y el estilo visual.
   */
  const collectViews = (): SavedViews => {
    const n = doc.viewportLayout
    const live = (key: string) => get().viewports.find((v) => v.paneKey === key)
    const panes: SavedViews['panes'] = []
    for (let i = 0; i < n; i++) {
      const key = paneKeyOf(n, i)
      const vp = live(key)
      const st = vp ? { cam: vp.getCamera(), ucs: vp.getUcs() } : paneState.get(key)
      if (!st) break
      panes.push({ cam: structuredClone(st.cam), ...(isWorldUcs(st.ucs) ? {} : { ucs: ucsToDef(st.ucs) }) })
    }
    const activeKey = get().activeViewport?.paneKey ?? ''
    const active = Math.max(0, panes.findIndex((_, i) => paneKeyOf(n, i) === activeKey))
    const paper: Record<string, SavedViews['panes'][number]['cam']> = {}
    for (const l of doc.layouts) {
      const vp = live(`paper:${l.id}`)
      const cam = vp ? vp.getCamera() : paperCams.get(l.id)
      if (cam) paper[l.id] = structuredClone(cam)
    }
    return { panes, active, paper, visualStyle: get().visualStyle }
  }
  /** Al abrir un dibujo: sus vistas guardadas (o, si no trae, planta a extensiones) en los paneles y el papel. */
  const applyViews = () => {
    endIsolation() // los objetos ocultos con ISOLATEOBJECTS/HIDEOBJECTS son del dibujo anterior
    clearViewLayers() // y las capas apagadas sólo en pantalla (vista mobile)
    const v = doc.savedViews
    paneState.clear()
    paperCams.clear()
    const n = doc.viewportLayout
    if (v) {
      v.panes.forEach((p, i) => paneState.set(paneKeyOf(n, i), { cam: p.cam, ucs: p.ucs ? normalizeUcs(p.ucs) : { ...WORLD_UCS } }))
      for (const [id, cam] of Object.entries(v.paper ?? {})) paperCams.set(id, cam)
      if (v.visualStyle && VISUAL_STYLES.includes(v.visualStyle as VisualStyle)) set({ visualStyle: v.visualStyle as VisualStyle })
    }
    // Los paneles ya montados (la misma cantidad de paneles y la misma pestaña) no se vuelven a crear: se fijan acá.
    for (const vp of get().viewports) {
      const key = vp.paneKey ?? ''
      if (vp.kind === 'model') {
        const st = paneState.get(key)
        if (v?.visualStyle) vp.setVisualStyle(get().visualStyle)
        if (st) {
          vp.setCamera(st.cam)
          vp.setUcs(st.ucs)
        } else {
          if (!vp.isPlanView()) vp.setView('TOP')
          vp.zoomExtents()
        }
      } else if (vp.kind === 'paper' && key.startsWith('paper:')) {
        const cam = paperCams.get(key.slice(6))
        if (cam) vp.setCamera(cam)
      }
    }
    // El panel activo; si todavía no existe (cambió la cantidad de paneles), se activa cuando se monte.
    pendingActivePane = v && doc.activeTab === MODEL_TAB ? paneKeyOf(n, v.active ?? 0) : null
    const act = pendingActivePane ? get().viewports.find((x) => x.paneKey === pendingActivePane) : undefined
    if (act) {
      pendingActivePane = null
      set({ activeViewport: act, ucs: act.getUcs() })
    }
    if (!v) restoreModelUcs() // la vista en planta no le cambia la UCS que trae el dibujo
  }
  /** Nombre de la UCS de cada panel (el desplegable muestra el del activo), mientras siga siendo esa UCS. */
  const paneUcsNames = new Map<string, { ucs: Ucs; name: string | null }>()
  /** Activa un panel: el store espeja su UCS (la de los puntos tecleados) y su nombre. */
  const activatePane = (vp: Viewport) => {
    const ucs = vp.getUcs()
    const known = vp.paneKey ? paneUcsNames.get(vp.paneKey) : undefined
    const ucsName = known && sameUcs(known.ucs, ucs) ? known.name : isWorldUcs(ucs) ? 'World' : null
    set({ activeViewport: vp, ucs, ucsName })
  }
  /** Al abrir/crear un dibujo, los paneles del modelo toman la UCS guardada en él. */
  const restoreModelUcs = () => {
    const u = normalizeUcs(doc.modelUcs ?? WORLD_UCS)
    for (const vp of get().viewports) if (vp.kind === 'model') vp.setUcs(u)
    // El nombre que muestra el desplegable de UCS: World, o ninguno para la que trae el dibujo.
    set({ ucs: u, ucsName: isWorldUcs(u) ? 'World' : null })
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
  // Píxeles de las imágenes del dibujo para el PDF, por sus datos (se decodifican una vez, antes de plotear).
  const rasterCache = new Map<string, PdfRaster | null>()
  const ensureRasters = async (): Promise<boolean> => {
    let added = false
    for (const e of drawingImages(doc)) {
      const d = e.props.data
      if (!d || rasterCache.has(d)) continue
      rasterCache.set(d, await decodeRaster(d))
      added = true
    }
    return added
  }
  const plotRasters = () => new PlotRasters(new Map([...rasterCache].filter((x): x is [string, PdfRaster] => !!x[1])))
  const layoutPlotInput = (layoutId: string, base: string, rasters?: PlotRasters) => {
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
      rasters,
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
    selQuiet = true
    set({
      selection: [],
      currentLayerId: stillThere ? get().currentLayerId : doc.firstLayerId,
    })
    selQuiet = false
    bump()
  }

  const app: AppHooks = {
    newDocument: () => get().newDocument(),
    isDirty: () => get().isDirty(),
    saveNow: () => get().saveDocument(),
    openDialog: () => void get().openDocumentsDialog(),
    save: (name) => {
      if (name && name.trim()) {
        const before = `${get().docFolder}/${get().docName}`
        // "carpeta/sub/nombre" fija carpeta + nombre; un nombre simple conserva la carpeta actual.
        if (name.includes('/')) get().setDocPath(name.trim())
        else get().setDocName(name.trim())
        // Guardar como: otro nombre es otro archivo (el que estaba abierto queda como estaba).
        if (`${get().docFolder}/${get().docName}` !== before) {
          currentFile = null
          set({ docId: null, fsFilePath: null })
        }
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
    viewPlane: () => get().activeViewport?.viewPlane() ?? null,
    setViewportLayout: (n) => get().setViewportLayout(n),
    exportPdf: () => get().exportPdf(),
    qselect: () => get().openQselect(),
    script: () => get().openScript(),
    solidMesh: (e) => (e.type === 'SOLID3D' ? solidMesh(e.props) : e.type === 'MESH3D' ? e.props : null),
    plotDialog: (window) =>
      new Promise((resolve) => {
        plotResolve?.('cancel')
        plotResolve = resolve
        const s = get().plotSettings
        set({ plotOpen: true, plotSettings: window ? { ...s, area: 'window', window } : s })
      }),
    publish: (ids) => get().publishLayouts(ids),
    importFile: () => get().importFile(),
    openFromDevice: () => get().openFromDevice(),
    attachImages: () => get().attachImages(),
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
    reportMeasure: (m) => get().setMeasure(m),
    viewGenDialog: (initial) => requestViewGen(initial),
    template: async (action) => {
      const name = get().docName || 'drawing'
      if (action === 'status') return readDefaultTemplate() ? 'New drawings start from your default template.' : 'New drawings start from the built-in settings.'
      if (action === 'clear') {
        writeDefaultTemplate(null)
        return 'Default template cleared: new drawings start from the built-in settings.'
      }
      const current = () => makeTemplate(doc.toJSON(), collectPrefs() as unknown as Record<string, unknown>)
      if (action === 'default') {
        return writeDefaultTemplate(current()) ? 'The current settings are now the default template for new drawings.' : 'The browser does not allow saving the template.'
      }
      if (action === 'save') {
        const blob = new Blob([JSON.stringify(current(), null, 1)], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${name}${DRAWING_TEMPLATE_EXT}`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
        return `Template saved as "${a.download}".`
      }
      // Open: un dibujo nuevo desde un archivo de plantilla.
      const file = await chooseFile(fileAccept(`${DRAWING_TEMPLATE_EXT},.json`))
      if (!file) return 'No template opened.'
      const t = parseDrawingTemplate(await file.text())
      if (!t) return `"${file.name}" is not a drawing template.`
      applyTemplate(t)
      return `New drawing from the template "${file.name}". Use TEMPLATE ▸ Default to start every new drawing from it.`
    },
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
      const dxf = exportDxf(solidsAsMeshes(entities), doc.layers, get().currentLayerId, doc.dimStyles, { linetypes: doc.linetypes, vars: doc.toJSON().vars })
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
      pushSnapshot('projection')
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

  // TRACEBACK: lo que un comando le pide a la app no es una acción del usuario (al repetir, el comando lo vuelve a pedir).
  for (const [k, v] of Object.entries(app)) {
    if (typeof v === 'function') (app as unknown as Record<string, unknown>)[k] = (...a: unknown[]) => traceLog.nested(() => (v as (...x: unknown[]) => unknown)(...a))
  }
  const engine = new CommandEngine({
    doc,
    currentLayerId: () => get().currentLayerId,
    isOrtho: () => get().ortho,
    viewPlane: () => get().activeViewport?.viewPlane() ?? null,
    isDynInput: () => get().dynInput,
    currentCursor: () => get().cursor,
    trackPath: () => get().activeViewport?.trackPath() ?? null,
    currentUcs: () => get().ucs,
    currentSelection: () => get().selection,
    onSelectionChange: (ids) => {
      selQuiet = true
      set({ selection: ids })
      selQuiet = false
    },
    onPicked: (ids) => set({ picked: ids }),
    app,
    onPrompt: (prompt) => set({ prompt }),
    onPrint: print,
    onChange: () => bump(),
    onOpenHelp: () => set({ helpOpen: true }),
    onOpenDocs: (path) => window.open(docsUrl(path), '_blank', 'noopener'),
    onBeforeCommand: (name) => {
      get().viewports.forEach((vp) => vp.cancelPendingBox()) // un comando cierra la ventana de selección abierta
      if (name === 'UNDO' || name === 'REDO') {
        capturedBefore = null
        return
      }
      capturedVars = JSON.stringify(persistedSysvars())
      // Dentro de un lote de multicomandos el paso de deshacer es el del lote entero. Los que sólo miran no dejan paso
      // (copiar un dibujo de decenas de miles de objetos antes de cada ZOOM se notaba en un teléfono).
      capturedBefore = scriptDepth || VIEW_ONLY_COMMANDS.has(name) ? null : doc.toJSON()
      capturedRev = doc.revision
    },
    onAfterCommand: (name, discard) => {
      // FILLETRAD, CHAMFERA… cambiados desde un comando se guardan en la config del usuario.
      if (capturedVars !== null && capturedVars !== JSON.stringify(persistedSysvars())) saveConfig()
      capturedVars = null
      if (discard && capturedBefore) {
        // Ctrl+Z a mitad del comando: vuelve el dibujo a como estaba al empezarlo (el comando se rehace sin el último paso).
        if (doc.revision !== capturedRev) {
          doc.load(capturedBefore, true)
          afterRestore()
        }
        capturedBefore = null
        return
      }
      if (name === 'UNDO' || name === 'REDO' || !capturedBefore) return
      if (doc.revision !== capturedRev) {
        undoLabels.set(capturedBefore, name)
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
      dynInput: s.dynInput,
      polar: s.polar,
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
      agentOpen: s.agentOpen,
      agentTab: s.agentTab,
      viewMode: s.viewMode,
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
    if (typeof d.dynInput === 'boolean') patch.dynInput = d.dynInput
    if (typeof d.polar === 'boolean') patch.polar = d.polar
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
    if (typeof d.agentOpen === 'boolean') patch.agentOpen = d.agentOpen
    if (typeof d.agentTab === 'boolean') patch.agentTab = d.agentTab
    if (d.viewMode === 'auto' || d.viewMode === 'mobile' || d.viewMode === 'full') patch.viewMode = d.viewMode
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
    dynInput: false,
    polar: false,
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
      if (a === 'pan' || a === 'zoom' || a === 'orbit' || a === 'forbit' || a === 'corbit') vp?.setRealtime(a)
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
    plotOpen: false,
    plotSettings: { ...DEFAULT_PLOT },
    qselectOpen: false,
    scriptDialog: null,
    openScript: (text = '', shared = false) => set({ scriptDialog: { text, shared } }),
    closeScript: () => set({ scriptDialog: null }),
    runScript: async (text, opts = {}) => {
      // `fresh`: empieza en la línea de comandos vacía (cancela lo que hubiera); si no, alimenta al comando en curso.
      if (opts.fresh && engine.isBusy()) engine.cancel()
      const before = doc.toJSON()
      const rev = doc.revision
      const inputs = parseScript(text)
      scriptDepth++
      try {
        const r = await engine.runScript(inputs, { finish: opts.finish ?? 'leave' })
        if (!r.ok && r.failedAt !== undefined) print(`Script stopped at input ${r.failedAt + 1} (${inputs[r.failedAt] === '' ? '""' : inputs[r.failedAt]}).`)
        return r
      } finally {
        scriptDepth--
        // Todo el lote es un solo paso de deshacer.
        if (!scriptDepth && doc.revision !== rev) {
          undoLabels.set(before, 'SCRIPT')
          undoStack.push(before)
          if (undoStack.length > MAX_UNDO) undoStack.shift()
          redoStack.length = 0
        }
      }
    },
    setObjectProps: (ids, p) => {
      const list = ids.map((id) => doc.getEntity(id)).filter((e): e is Entity => !!e)
      if (!list.length) return 0
      pushSnapshot('properties')
      const layerId = p.layer ? doc.layers.find((l) => l.name.toLowerCase() === p.layer!.toLowerCase())?.id : undefined
      for (const e of list) {
        if (layerId) e.layer = layerId
        if (p.color !== undefined) {
          if (p.color.toUpperCase() === 'BYLAYER') delete e.color
          else e.color = p.color
        }
        if (p.linetype !== undefined) {
          if (p.linetype.toUpperCase() === 'BYLAYER') delete e.lineType
          else e.lineType = p.linetype
        }
        if (p.lineweight !== undefined) {
          if (p.lineweight < 0) delete e.lineWeight
          else e.lineWeight = p.lineweight
        }
      }
      doc.touch()
      bump()
      return list.length
    },
    openQselect: () => set({ qselectOpen: true }),
    closeQselect: () => set({ qselectOpen: false }),
    applyQselect: (ids, append) => {
      const next = append ? mergeSelection(get().selection, ids) : ids
      set({ qselectOpen: false, selection: next })
      print(`${ids.length} item(s) selected.`)
    },
    cleanScreen: false,
    commandLineCompact: false,
    viewCubeOn: true,
    agentOpen: true,
    agentTab: true,
    viewMode: 'auto',
    viewForce: mobileParam(),
    lastMeasure: null,
    setMeasure: (m) => {
      set({ lastMeasure: m })
      get().viewports.forEach((vp) => vp.invalidate())
    },
    setAgentPanel: (patch) => {
      set({ ...(patch.open !== undefined ? { agentOpen: patch.open } : {}), ...(patch.tab !== undefined ? { agentTab: patch.tab } : {}) })
      saveConfig()
    },
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
      if (e?.type === 'NOTE') {
        get().openNoteEditor(id)
        return
      }
      // Un bloque sin atributos se abre en el editor de bloques (BEDIT), como el CAD clásico.
      if (e?.type === 'INSERT' && !e.props.attributes?.length && !e.props.name.startsWith('*') && !doc.editingBlock && !engine.busy) {
        get().selectEntity(id)
        get().runMacro(['BEDIT'])
        return
      }
      // Cualquier objeto abre sus propiedades; un bloque con atributos, su editor de atributos.
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
          pushSnapshot('attributes')
          attrs.forEach((a, i) => (a.value = values[i] ?? a.value))
          doc.touch()
          bump()
        })
    },
    dwgPropsOpen: false,
    noteEdit: null,
    openNoteEditor: (id) => {
      const e = doc.getEntity(id)
      const vp = get().activeViewport
      if (e?.type !== 'NOTE' || !vp) return
      const pts = [notePoint(e.props, 0, 0), notePoint(e.props, 1, 0), notePoint(e.props, 1, 1), notePoint(e.props, 0, 1)].map((p) => vp.pageOf(p))
      if (pts.some((p) => !p)) return
      const xs = pts.map((p) => p![0])
      const ys = pts.map((p) => p![1])
      const rect = { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
      set({ noteEdit: { id, text: e.props.text, color: e.props.color, rect } })
    },
    closeNoteEditor: (save, text) => {
      const ed = get().noteEdit
      if (!ed) return
      set({ noteEdit: null })
      const e = doc.getEntity(ed.id)
      if (!save || e?.type !== 'NOTE' || text === undefined || text === e.props.text) return
      pushSnapshot('note text')
      e.props.text = text
      doc.touch()
      bump()
    },
    openDwgProps: () => set({ dwgPropsOpen: true }),
    closeDwgProps: () => set({ dwgPropsOpen: false }),
    setDrawingProps: (patch) => {
      pushSnapshot('drawing properties')
      doc.setMeta(patch)
      bump()
    },
    viewportLayout: 1,
    camAz: -Math.PI / 2,
    camEl: Math.PI / 2,
    camMode: 'ortho',

    registerViewport: (vp) => {
      vp.onViewRecorded = (cam, ucs) => recordViewUndo(vp, cam, ucs)
      const first = !get().activeViewport
      set((s) => ({ viewports: [...s.viewports, vp], activeViewport: s.activeViewport ?? vp }))
      if (pendingActivePane && vp.paneKey === pendingActivePane) {
        pendingActivePane = null
        // Después de que el panel tome su cámara y su UCS guardadas (se fijan apenas se registra).
        setTimeout(() => activatePane(vp), 0)
      } else if (first) setTimeout(() => get().activeViewport === vp && activatePane(vp), 0)
    },
    unregisterViewport: (vp) => {
      const viewports = get().viewports.filter((v) => v !== vp)
      if (get().activeViewport !== vp) return set({ viewports })
      // Al pasar del modelo a un layout (o al revés) el panel que queda manda: su UCS, no la del que se fue.
      set({ viewports, activeViewport: viewports[0] ?? null })
      if (viewports[0]) activatePane(viewports[0])
    },
    setActiveViewport: (vp) => activatePane(vp),
    setViewportLayout: (n) => {
      const layout = Math.max(1, Math.min(4, Math.round(n)))
      doc.setViewportLayout(layout)
      set({ viewportLayout: layout })
      bump()
    },
    setActiveTab: (id) => {
      if (id === doc.activeTab && !doc.msViewportId) return
      if (doc.editingBlock) {
        print(`Close the Block Editor first (BCLOSE): block "${doc.editingBlock}" is open.`)
        return
      }
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
        // La cruz de una nota rápida la cierra (se puede deshacer).
        const hit = pickedId ? doc.getEntity(pickedId) : undefined
        if (hit?.type === 'NOTE' && noteCloseHit(hit.props, [(raw ?? world).x, (raw ?? world).y, (raw ?? world).z])) {
          pushSnapshot('erase')
          doc.removeEntity(hit.id)
          set({ selection: get().selection.filter((x) => x !== hit.id) })
          bump()
          return
        }
        // Selección libre estilo CAD clásico: cada click ACUMULA; con Shift resta; el click en vacío
        // (sin entidad bajo el cursor) limpia la selección, igual que una ventana que no toma nada.
        if (!pickedId) {
          if (get().selection.length > 0) set({ selection: [] })
          return
        }
        set({ selection: mergeSelection(get().selection, engine.withGroups([pickedId]), subtract) })
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
      // Como el CAD clásico: Espacio (o Enter) pasa de STRETCH a MOVE, ROTATE, SCALE y MIRROR, que actúan sobre todo
      // lo seleccionado desde el grip; Base point cambia el punto base, Copy deja copias hasta salir, eXit (o Esc) sale.
      const targets = () => {
        const ids = get().selection.includes(entityId) ? get().selection : [entityId]
        return ids.filter((id) => {
          const e = doc.getEntity(id)
          return !!e && layerEditable(layerSvc.get(e.layer))
        })
      }
      const ghosts = (fn: EntityTransform): PreviewShape[] =>
        targets().flatMap((id) => {
          const e = doc.getEntity(id)
          const next = e && fn(structuredClone(e))
          return next ? entityOutline({ ...next, id } as Entity).filter((p) => p.length >= 2).map((points) => ({ kind: 'polyline' as const, points })) : []
        })
      const inPlace = (fn: (e: Entity) => void): EntityTransform => (e) => {
        fn(e)
        return e
      }
      const modes = ['STRETCH', 'MOVE', 'ROTATE', 'SCALE', 'MIRROR'] as const
      void (async () => {
        let mode = 0
        let base = fromVec3(grip.point)
        let copy = false
        for (;;) {
          const name = modes[mode]
          const opts = { keywords: ['Base point', 'Copy', 'eXit'], enterKeyword: 'next' }
          const tail = `or [Base point/Copy/eXit]: `
          print(`** ${name}${copy ? ' (multiple)' : ''} **`)
          let fn: EntityTransform | null = null
          let key: string | null = null
          if (name === 'ROTATE') {
            const b = toVec3(base)
            const at = (deg: number) => rotateTransform(b, (deg * Math.PI) / 180)
            const r = await engine.requestGripValue('angle', `Specify rotation angle ${tail}`, base, (c) => ghosts(at((Math.atan2(c.y - base.y, c.x - base.x) * 180) / Math.PI)), opts)
            if (r.kind === 'angle') fn = at(r.deg)
            else key = r.kind === 'keyword' ? r.keyword : 'eXit'
          } else if (name === 'SCALE') {
            const b = toVec3(base)
            const by = (f: number) => inPlace((e) => scaleEntity(e, b, f))
            const r = await engine.requestGripValue('distance', `Specify scale factor ${tail}`, base, (c) => ghosts(by(Math.hypot(c.x - base.x, c.y - base.y, c.z - base.z) || 1)), opts)
            if (r.kind === 'distance' && r.value > 0) fn = by(r.value)
            else key = r.kind === 'keyword' ? r.keyword : r.kind === 'distance' ? 'next' : 'eXit'
          } else {
            const verb = name === 'STRETCH' ? 'stretch point' : name === 'MOVE' ? 'move point' : 'second point'
            const pointFn = (c: Pt): EntityTransform | null => {
              const d: Vec3 = [c.x - base.x, c.y - base.y, c.z - base.z]
              if (name === 'MOVE') return inPlace((e) => translateEntity(e, d[0], d[1], d[2]))
              if (name === 'MIRROR') {
                const ax = mirrorAxis(toVec3(base), toVec3(c))
                return ax ? mirrorTransform(ax) : null
              }
              // STRETCH: sólo el objeto del grip, con su grip llevado al punto (desde el punto base).
              return (e) => {
                if (e.id !== entityId) return e
                applyGrip(e, grip, [grip.point[0] + d[0], grip.point[1] + d[1], grip.point[2] + d[2]])
                return e
              }
            }
            const look = (c: Pt) => {
              const f = pointFn(c)
              if (!f) return []
              return name === 'STRETCH' ? preview({ x: grip.point[0] + c.x - base.x, y: grip.point[1] + c.y - base.y, z: grip.point[2] + c.z - base.z }) : ghosts(f)
            }
            const r = await engine.requestGripPoint(`Specify ${verb} ${tail}`, base, look, opts)
            if (r.kind === 'point') {
              if (name === 'STRETCH' && !copy) {
                const d = [r.point.x - base.x, r.point.y - base.y, r.point.z - base.z]
                get().gripEdit(entityId, grip, [grip.point[0] + d[0], grip.point[1] + d[1], grip.point[2] + d[2]], r.pick?.id ?? null)
                return
              }
              fn = pointFn(r.point)
            } else key = r.kind === 'keyword' ? r.keyword : 'eXit'
          }
          if (key === 'next') {
            mode = (mode + 1) % modes.length
            continue
          }
          if (key === 'Copy') {
            copy = true
            continue
          }
          if (key === 'Base point') {
            const b = await engine.requestGripPoint('Specify base point: ', base, () => [])
            if (b.kind === 'point') base = b.point
            continue
          }
          if (!fn) return // eXit o Esc
          pushSnapshot('grip edit')
          const ids = name === 'STRETCH' ? [entityId] : targets()
          const res = copy ? addTransformed(doc, ids, fn) : applyTransform(doc, ids, fn)
          doc.touch()
          if (!copy) set({ selection: res.ids })
          bump()
          if (!copy) return
        }
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
      pushSnapshot('grip edit')
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
        return layerEditable(l) && !isHidden(e.id)
      })
      const area = engine.selectionArea
      const cross = area ? area === 'crossing' : crossing
      const expand = (e: Entity): Entity[] => expandEntities([e], doc.blocks, { attdisp: doc.attdisp })
      const ids = entitiesInScreenBox(selectable, rect, cross, project, expand)
      // Como el CAD clásico: dentro de un comando avisa lo que quedó afuera por estar en una capa bloqueada.
      const reportLocked = () => {
        const locked = doc.entities.filter((e) => {
          const l = layerSvc.get(e.layer)
          return !!l && l.locked && l.visible && !l.frozen
        })
        const n = locked.length ? entitiesInScreenBox(locked, rect, cross, project, expand).length : 0
        if (n) print(`${n} ${n === 1 ? 'was' : 'were'} on a locked layer.`)
      }
      if (area) {
        engine.completeArea(ids)
        reportLocked()
      } else if (engine.isSelecting) {
        if (subtract) engine.removePicks(ids)
        else engine.addPicks(ids)
        reportLocked()
      } else if (!engine.busy) {
        // La ventana también acumula (CAD clásico); con Shift resta lo encerrado.
        set({ selection: mergeSelection(get().selection, engine.withGroups(ids), subtract) })
      }
    },
    isSelectMode: () => engine.isSelecting || (!engine.hasPending && !engine.busy),
    selectionArea: () => engine.selectionArea,
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
      pushSnapshot('layer change')
      for (const e of movable) e.layer = id
      doc.touch()
      print(`${movable.length} object(s) moved to layer "${target.name}".`)
      bump()
    },
    createLayer: (name) => {
      try {
        pushSnapshot('new layer')
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
        pushSnapshot('layer rename')
        layerSvc.rename(id, name)
        bump()
      } catch (err) {
        print(err instanceof Error ? err.message : 'Could not rename the layer')
      }
    },
    setLayerPrintable: (id, printable) => {
      const l = layerSvc.get(id)
      if (!l) return
      pushSnapshot('layer change')
      l.printable = printable
      doc.touch()
      bump()
    },
    setLayerVpFrozen: (id, frozen) => {
      const vp = doc.msViewportId ? doc.getEntity(doc.msViewportId) : undefined
      if (vp?.type !== 'VIEWPORT') return
      pushSnapshot('layer change')
      const rest = vp.props.frozenLayers.filter((l) => l !== id)
      vp.props.frozenLayers = frozen ? [...rest, id] : rest
      doc.touch()
      bump()
    },
    setLayerNewVpFreeze: (id, frozen) => {
      pushSnapshot('layer change')
      layerSvc.setNewVpFreeze(id, frozen)
      bump()
    },
    setLayerColor: (id, color) => {
      pushSnapshot('layer color')
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
      pushSnapshot('layer delete')
      layerSvc.remove(id)
      bump()
      print(`Layer "${layer?.name ?? id}" deleted.`)
    },
    setLayerLineWeight: (id, w) => {
      pushSnapshot('layer lineweight')
      layerSvc.setLineWeight(id, w)
      bump()
    },
    setLayerLineType: (id, t) => {
      pushSnapshot('layer linetype')
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
      pushSnapshot('load linetypes')
      for (const n of names) doc.loadLinetype(n)
      bump()
    },
    deleteLinetype: (name) => {
      if (doc.linetypeInUse(name)) return false
      pushSnapshot('linetype delete')
      const ok = doc.deleteLinetype(name)
      bump()
      return ok
    },
    setDrawingVar: (name, value) => {
      pushSnapshot('drawing variable')
      doc.setVar(name, value)
      bump()
    },
    setEntitiesCommon: (ids, key, value) => {
      const ents = ids.map((id) => doc.getEntity(id)).filter((e): e is Entity => !!e && !layerSvc.get(e.layer)?.locked)
      if (!ents.length) return
      pushSnapshot('properties')
      for (const e of ents) {
        if (key === 'color') {
          // 'BYLAYER' (o vacío) vuelve al color de la capa.
          const c = String(value)
          if (!c || c.toUpperCase() === 'BYLAYER') delete e.color
          else e.color = c.toLowerCase()
        } else if (key === 'lineWeight') {
          const v = Number(value)
          if (!(v >= 0)) delete e.lineWeight
          else e.lineWeight = v
        } else if (key === 'ltScale') {
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
      // Como el CAD clásico: ORTHO y POLAR no van juntos.
      set(next && get().polar ? { ortho: true, polar: false } : { ortho: next })
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
    togglePickstyle: () => {
      sysvars.PICKSTYLE = sysvars.PICKSTYLE ? 0 : 1
      print(`<Group selection ${sysvars.PICKSTYLE ? 'on' : 'off'}>`)
      saveConfig()
    },
    togglePolar: () => {
      const next = !get().polar
      set(next && get().ortho ? { polar: true, ortho: false } : { polar: next })
      print(next ? `<Polar on: every ${sysvars.POLARANG}°>` : '<Polar off>')
      saveConfig()
    },
    toggleDynInput: () => {
      const next = !get().dynInput
      set({ dynInput: next })
      print(next ? '<Dynamic input on: x,y after the first point is relative (# = absolute)>' : '<Dynamic input off: x,y is absolute (@ = relative)>')
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
      const ucsName = name ?? (isWorldUcs(ucs) ? 'World' : null)
      if (vp?.paneKey && !temporary) paneUcsNames.set(vp.paneKey, { ucs, name: ucsName })
      set({ ucs, ucsName })
      if (sysvars.UCSFOLLOW && vp && !temporary && !sameUcs(prev, ucs)) vp.planView(ucs)
    },
    openDimStyle: () => set({ dimStyleOpen: true }),
    closeDimStyle: () => set({ dimStyleOpen: false }),
    setCurrentDimStyle: (name) => {
      if (doc.setCurrentDimStyle(name)) bump()
    },
    saveDimStyle: (def) => {
      pushSnapshot('dimension style')
      doc.saveDimStyle(def)
      bump()
    },
    renameDimStyle: (from, to) => {
      try {
        pushSnapshot('dimension style')
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
        pushSnapshot('dimension style')
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
      pushSnapshot('dimension style')
      for (const id of ids) {
        const e = doc.getEntity(id)
        if (e?.type === 'DIMENSION') doc.restyleDimension(e.props, styleName, e.props.overrides)
      }
      bump()
    },
    setDimensionsVar: (ids, name, value) => {
      pushSnapshot('dimension variable')
      for (const id of ids) {
        const e = doc.getEntity(id)
        if (e?.type === 'DIMENSION') doc.setDimensionVar(e.props, name, value)
      }
      bump()
    },
    openDimMenu: (x, y, world) => set({ dimMenu: { x, y, world } }),
    setCannoscale: (v) => {
      pushSnapshot('annotation scale')
      doc.setCannoscale(v)
      doc.touch()
      bump()
    },
    closeDimMenu: () => set({ dimMenu: null }),
    editDimensions: (ids, fn) => {
      pushSnapshot('dimension edit')
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
      const kernel = sysvars.SOLIDKERNEL
      applySysvars(patch as Record<string, unknown>)
      set((s) => ({ sysvarRev: s.sysvarRev + 1 }))
      saveConfig()
      if (sysvars.SOLIDKERNEL !== kernel) get().redraw() // los sólidos se rehacen con el otro núcleo
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
        if (!engine.busy) pushSnapshot('visual style') // desde VSCURRENT el undo lo registra el comando
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
    setScreen: ({ mobileView, ...patch }) => {
      // En un teléfono, volver a la vista mobile es volver a `auto`; en una computadora, salir de ella también.
      if (mobileView !== undefined) set({ viewForce: null, viewMode: mobileView ? (isPhone() ? 'auto' : 'mobile') : isPhone() ? 'full' : 'auto' })
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
      undoLabels.set(aiBackup, 'AI')
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
    publishLayouts: async (ids) => {
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
      await ensureRasters()
      const rasters = plotRasters()
      const bytes = plotLayouts(layouts.map((l) => layoutPlotInput(l.id, base, rasters)))
      downloadBytes(bytes, `${base}.pdf`)
      print(`<Published ${layouts.length} sheet(s) to "${base}.pdf">`)
    },
    exportPdf: async () => {
      // -PLOT y PLOT ▸ Plot: el layout activo 1:1 con su Page Setup, o el modelo con las opciones del diálogo.
      const base = get().docName || 'drawing'
      await ensureRasters()
      const r = get().plotPreview(get().plotSettings)
      if (r.empty && !r.layout) {
        print('Nothing to plot (no printable/visible geometry).')
        return
      }
      doc.meta.plotted = new Date().toISOString() // campo PlotDate
      const name = r.layout ? `${base}-${r.layout}.pdf` : `${base}.pdf`
      downloadBytes(pdfDocument([r.page], r.rasters), name)
      print(`<Plotted "${name}">`)
    },
    plotPreview: (st) => {
      const base = get().docName || 'drawing'
      const layout = doc.activeLayout
      const vp = get().activeViewport
      const displayAvailable = !layout && !!vp && vp.kind === 'model' && vp.isPlanView()
      // Las imágenes que falten se decodifican aparte y la vista previa se rehace cuando están.
      void ensureRasters().then((added) => added && bump())
      const rasters = plotRasters()
      const withImages = (page: PdfPage): PdfPage => ({ ...page, images: rasters.used })
      if (layout) {
        // Layout: la hoja 1:1 en su papel, con cada viewport a escala (Page Setup).
        return { page: withImages(layoutPage(layoutPlotInput(layout.id, base, rasters))), empty: false, layout: layout.name, displayAvailable, scale: 1, rasters }
      }
      const fields = fieldContextFor(doc, base + DRAWING_EXT, doc.activeTab)
      const entities = resolveFieldTexts(expandEntities(doc.entities, doc.blocks, { attdisp: doc.attdisp, skipLayers: frozenLayerIds(doc.layers) }), fields)
      const area: PlotArea | undefined =
        st.area === 'window' && st.window ? st.window : st.area === 'display' && displayAvailable ? (vp!.displayRect() ?? undefined) : undefined
      const { page, empty, transform } = modelPlotPage(entities, doc.layers, {
        page: plotPage(st),
        linetypes: doc.linetypeContext('model'),
        area,
        center: st.center,
        scale: st.scale === null ? undefined : paperPerModel(st.scale, doc.units) * MM_TO_PT,
        style: { plotStyle: st.plotStyle, lineWeights: st.lineWeights },
        rasters,
      })
      // Escala papel:dibujo que resulta (la de "ajustar al papel" se calcula).
      return { page: withImages(page), empty, layout: null, displayAvailable, scale: empty ? null : transform.s / MM_TO_PT / unitToMm(doc.units), rasters }
    },
    resolvePlot: (r, st) => {
      const res = plotResolve
      plotResolve = null
      set(st ? { plotOpen: false, plotSettings: st } : { plotOpen: false })
      if (r === 'plot') get().exportPdf()
      res?.(r)
    },
    importFile: () => {
      chooseFiles(fileAccept(`.obj,.dxf,.dwg,${DRAWING_EXTS.join(',')}`), ([file]) => {
        const name = file.name.toLowerCase()
        // Un .cota no se "importa" sobre el dibujo actual: se abre como dibujo.
        if (isDrawingFile(name)) {
          void get().openDeviceFile(file)
          return
        }
        // Sin filtro en el selector (pantallas táctiles), cualquier archivo puede llegar.
        if (!['.obj', '.dxf', '.dwg'].some((x) => name.endsWith(x))) {
          print(`"${file.name}" cannot be imported: use a .obj, .dxf or .dwg file.`)
          return
        }
        const reader = new FileReader()
        if (name.endsWith('.dwg')) {
          // DWG: se convierte a DXF (en el navegador; si no puede, en el servidor) y se importa como DXF.
          reader.onload = () => {
            print('Reading DWG…')
            readDwg(reader.result as ArrayBuffer)
              .then((r) => runImport(() => applyDxf(r), (n) => `Imported ${n} entity(ies) from DWG.`))
              .catch((err) => print(`DWG import failed: ${err instanceof Error ? err.message : String(err)}`))
          }
          reader.readAsArrayBuffer(file)
          return
        }
        if (name.endsWith('.dxf')) {
          // En el hilo aparte, como al abrir (también el DXF binario).
          void file
            .arrayBuffer()
            .then((buf) => importCadInWorker('dxf', buf, { light: isPhone() }))
            .then((r) => runImport(() => applyDxf(r), (n) => `Imported ${n} entity(ies) from DXF.`))
            .catch((err) => print(`DXF import failed: ${err instanceof Error ? err.message : String(err)}`))
          return
        }
        reader.onload = () => runImport(() => importObjText(String(reader.result ?? '')), (n) => `Imported ${n} mesh(es) from OBJ.`)
        reader.readAsText(file)
      })
    },
    openFromDevice: () => {
      // Se puede elegir el plano junto con sus imágenes: se cargan al abrirlo.
      const accept = fileAccept(`${DRAWING_EXTS.join(',')},.dxf,.dwg,${MODEL_EXTS.join(',')},${IMAGE_EXTS.join(',')}`)
      chooseFiles(accept, (files) => void get().openDeviceFiles(files), true)
    },
    openDeviceFiles: async (files) => {
      const images = files.filter((f) => isImageFile(f.name))
      const file = files.find((f) => !isImageFile(f.name))
      if (!file && !images.length) return
      if (file) await get().openDeviceFile(file)
      else if (!drawingImages(doc).length) return void get().openDeviceFile(images[0]) // una foto sola no es un plano
      if (images.length) await get().attachImageFiles(images)
    },
    attachImages: () => chooseFiles(fileAccept(IMAGE_EXTS.join(',')), (files) => void get().attachImageFiles(files), true),
    attachImageFiles: async (files) => {
      const images = drawingImages(doc)
      if (!images.length) {
        print('The drawing has no images to load.')
        return 0
      }
      const key = (path: string) => (path.split(/[\\/]/).pop() ?? path).toLowerCase()
      const stem = (path: string) => key(path).replace(/\.[^.]+$/, '')
      const wanted = new Set(images.filter((e) => !e.props.data).map((e) => key(e.props.file)))
      // Por el nombre; si no, por el nombre sin extensión (p. ej. el TIF convertido a PNG); si falta una sola y se
      // eligió un solo archivo, ése.
      const pick = (e: ImageEntity): File | undefined =>
        files.find((f) => key(f.name) === key(e.props.file)) ??
        files.find((f) => stem(f.name) === stem(e.props.file)) ??
        (files.length === 1 && wanted.size === 1 && !e.props.data ? files[0] : undefined)
      const read = new Map<File, string | null>()
      const dataOf = async (f: File): Promise<string | null> => {
        if (!read.has(f)) read.set(f, await fileDataUrl(f).catch(() => null))
        return read.get(f) ?? null
      }
      const plan: Array<{ e: ImageEntity; data: string }> = []
      for (const e of images) {
        const f = pick(e)
        const data = f && (await dataOf(f))
        if (data) plan.push({ e, data })
      }
      const unused = files.filter((f) => !plan.some((x) => pick(x.e) === f)).map((f) => f.name)
      if (!plan.length) {
        print(`None of the chosen files is an image of the drawing (it uses ${[...new Set(images.map((e) => imageFileName(e.props)))].join(', ')}).`)
        return 0
      }
      pushSnapshot('image')
      for (const { e, data } of plan) e.props.data = data
      doc.touch()
      bump()
      const still = images.filter((e) => !e.props.data).length
      print(`Loaded ${plan.length} image(s)${still ? `; ${still} still without their file` : ''}.${unused.length ? ` Not used: ${unused.join(', ')}.` : ''}`)
      return plan.length
    },
    openDeviceFile: async (file) => {
      const lower = file.name.toLowerCase()
      const name = splitDrawingPath(file.name).name || 'drawing1'
      // Sin ruta: el próximo SAVE crea un archivo nuevo (carpeta de trabajo) o un documento en la nube.
      const detached = { docId: null, docName: name, docFolder: '', fsFilePath: null, openOpen: false, selection: [] }
      try {
        if (isDrawingFile(lower)) {
          const data = JSON.parse(await file.text()) as DocumentData
          pushSnapshot('open')
          doc.load(data)
          currentFile = null
          set({ ...detached, currentLayerId: doc.currentLayer, viewportLayout: doc.viewportLayout })
          restoreModelUcs()
          applyViews()
          print(`Opened "${file.name}" from the device.`)
        } else if (MODEL_EXTS.some((x) => lower.endsWith(x))) {
          // Modelos 3D (STL, OBJ, STEP, IGES): un dibujo nuevo con cada cuerpo como malla.
          const meshes = await readModelFile(file, lower)
          pushSnapshot('open')
          doc.reset()
          for (const m of meshes) doc.addEntity({ type: 'MESH3D', layer: doc.currentLayer, props: { vertices: m.vertices, faces: m.faces } })
          currentFile = null
          set({ ...detached, viewportLayout: doc.viewportLayout })
          restoreModelUcs()
          print(`Opened "${file.name}" from the device (${meshes.length} mesh(es)).`)
        } else if (!lower.endsWith('.dxf') && !lower.endsWith('.dwg')) {
          // Sin filtro en el selector (pantallas táctiles), cualquier archivo puede llegar.
          print(`"${file.name}" cannot be opened: use a ${DRAWING_EXT}, .dxf, .dwg or 3D model (${MODEL_EXTS.join(', ')}) file.`)
          return
        } else {
          // En el hilo aparte: la pantalla sigue respondiendo (un plano grande tarda en un teléfono).
          let r: DxfImportResult
          if (lower.endsWith('.dwg')) {
            print('Reading DWG…')
            r = await readDwg(await file.arrayBuffer())
          } else {
            print('Reading DXF…')
            r = await importCadInWorker('dxf', await file.arrayBuffer(), { light: isPhone() })
          }
          pushSnapshot('open')
          doc.reset()
          const n = applyDxf(r, true)
          currentFile = null
          set({ ...detached, viewportLayout: doc.viewportLayout })
          restoreModelUcs()
          print(`Opened "${file.name}" from the device (${n} entities).`)
        }
        bump()
        markSaved()
        frameOpenedDrawing()
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
      const dxf = exportDxf(solidsAsMeshes(expandEntities(doc.entities, doc.blocks, { attdisp: doc.attdisp })), doc.layers, get().currentLayerId, doc.dimStyles, {
        linetypes: doc.linetypes,
        vars: doc.toJSON().vars,
      })
      if (format === 'DXF') {
        download(dxf, 'dxf', 'application/dxf')
        return
      }
      // DWG: el DXF se convierte en el navegador (acad-ts); si falla y hay servidor con conversor, lo hace él.
      print('Writing DWG…')
      // Si el navegador no puede y tampoco hay servidor, el mensaje es el del navegador (el del servidor, "Request
      // failed", no explica nada).
      dxfTextToDwg(dxf)
        .catch(async (local) => {
          try {
            return await api.dxfToDwg(dxf)
          } catch {
            throw local
          }
        })
        .then((bytes) => download(bytes, 'dwg', 'image/vnd.dwg'))
        .catch((err) => print(`DWG export failed: ${dwgErrorMessage(err)}`))
    },
    computePreview: (cursor) => {
      const shapes = engine.computePreview(cursor)
      // Vista mobile: el tramo de la última medición queda dibujado mientras se ve su tarjeta.
      const m = touchConfig.mode === 'mobile' && !engine.busy ? get().lastMeasure : null
      return m ? [...shapes, { kind: 'line', a: m.a, b: m.b }] : shapes
    },
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
      pushSnapshot('erase')
      for (const id of removable) doc.removeEntity(id)
      set({ selection: [] })
      bump()
      print(`Erased ${removable.length} object(s).`)
    },
    undo: () => {
      // A mitad de un comando, Ctrl+Z vuelve a la etapa anterior del comando (no deshace el dibujo).
      if (get().engine.busy && get().engine.stepBack()) return
      while (undoStack.length > 0) {
        const e = undoStack.pop()!
        if (isSel(e)) {
          if (applySelStep(e, redoStack, 'Undo')) return
          continue
        }
        if (isView(e)) {
          const back = applyViewUndo(e)
          if (!back) continue // su viewport ya no existe: se salta
          redoStack.push(back)
          print('Undo: view.')
          return
        }
        const label = undoLabels.get(e)
        const redoSnap = doc.toJSON()
        if (label) undoLabels.set(redoSnap, label)
        redoStack.push(redoSnap)
        doc.load(e, true)
        afterRestore()
        print(stepMessage('Undo', label))
        return
      }
      print('Nothing to undo.')
    },
    redo: () => {
      while (redoStack.length > 0) {
        const e = redoStack.pop()!
        if (isSel(e)) {
          if (applySelStep(e, undoStack, 'Redo')) return
          continue
        }
        if (isView(e)) {
          const back = applyViewUndo(e)
          if (!back) continue
          undoStack.push(back)
          print('Redo: view.')
          return
        }
        const label = undoLabels.get(e)
        const undoSnap = doc.toJSON()
        if (label) undoLabels.set(undoSnap, label)
        undoStack.push(undoSnap)
        doc.load(e, true)
        afterRestore()
        print(stepMessage('Redo', label))
        return
      }
      print('Nothing to redo.')
    },
    updateEntityLayer: (id, layerId) => {
      const e = doc.getEntity(id)
      if (!e) return
      pushSnapshot('layer change')
      e.layer = layerId
      doc.touch()
      bump()
    },
    updateEntityNumber: (id, path, value) => {
      const e = doc.getEntity(id)
      if (!e) return
      pushSnapshot('properties')
      applyNumber(e, path, value)
      doc.touch()
      bump()
    },
    updateEntityField: (id, key, value) => {
      const e = doc.getEntity(id)
      if (!e) return
      const l = layerSvc.get(e.layer)
      if (l && l.locked) return
      pushSnapshot('properties')
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
      pushSnapshot('new drawing')
      const t = readDefaultTemplate()
      if (t) applyTemplate(t, false)
      else doc.reset()
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
      endIsolation()
      // Un dibujo nuevo empieza en planta (sin la vista ni la UCS del anterior).
      for (const vp of get().viewports) if (vp.kind === 'model') vp.setView('TOP')
      restoreModelUcs()
      markSaved()
    },
    isDirty: () => doc.revision !== savedRev,
    markSaved,
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
      doc.setSavedViews(collectViews()) // la vista de cada panel y del papel viaja con el dibujo
      doc.setCurrentLayer(get().currentLayerId) // CLAYER: la capa de trabajo viaja con el dibujo
      // Carpeta recordada que el navegador volvió a dejar en "preguntar" (pestaña nueva): SAVE es un gesto, se
      // pide el permiso acá en vez de descargar el archivo como si no hubiera carpeta.
      if (!workspaceDir && get().fsPending) await get().reconnectWorkspace()
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
        markSaved()
        return true
      }
      // Modo carpeta local: el dibujo se escribe como .cota en la carpeta elegida.
      if (workspaceDir) {
        if (!(await ensurePermission(workspaceDir))) {
          print('Permission to write in the folder was denied.')
          return false
        }
        const text = JSON.stringify(doc.toJSON())
        // Con otro nombre o carpeta (SAVE con un nombre nuevo, o el nombre cambiado arriba) es otro archivo: el que estaba
        // abierto queda como estaba.
        const path = get().fsFilePath
        if (currentFile && path && path.toLowerCase() !== joinPath(docFolder, drawingFileName(docName, DRAWING_EXT)).toLowerCase()) currentFile = null
        // ISAVEBAK: la versión que se va a pisar queda como `nombre.bak` (si no se puede, el guardado sigue igual).
        const dir = workspaceDir
        const backup = async (h: FsFileHandle | null): Promise<void> => {
          if (!h || !sysvars.ISAVEBAK) return
          try {
            const old = await readTextFile(h)
            const bak = old ? await fileHandleAt(dir, docFolder, drawingFileName(docName, '.bak'), { create: true }) : null
            if (bak) await writeTextFile(bak, old)
          } catch {
            /* sin copia */
          }
        }
        try {
          await backup(currentFile ?? (await fileHandleAt(workspaceDir, docFolder, drawingFileName(docName, DRAWING_EXT))))
          if (currentFile) {
            await writeTextFile(currentFile, text)
            print(`<Saved "${get().fsFilePath ?? docName}">`)
            markSaved()
            return true
          }
          const written = await writeDrawing(workspaceDir, docFolder, docName, text, DRAWING_EXT)
          if (!written) {
            print('Could not create the file in the working folder.')
            return false
          }
          currentFile = written.handle
          set({ fsFilePath: written.path, docId: null })
          print(`<Saved "${written.path}">`)
          markSaved()
          return true
        } catch {
          print('Save failed: the file could not be written.')
          return false
        }
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
        markSaved()
        return true
      } catch (err) {
        print(err instanceof ApiError ? `Save failed: ${err.message}` : 'Save failed: network error')
        return false
      }
    },
    openDocumentsDialog: async () => {
      // Carpeta recordada que el navegador volvió a dejar en "preguntar" (pestaña nueva): OPEN es un gesto del
      // usuario, así que se pide el permiso acá mismo.
      if (!workspaceDir && get().fsPending) await get().reconnectWorkspace()
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
      // Sin carpeta: sin servidor (la demo) o sin sesión, el diálogo explica las opciones en vez de fallar.
      if (!CLOUD_ENABLED || !get().token) {
        set({ docList: [], fsList: [], openOpen: true })
        return
      }
      try {
        const list = await api.listDocuments()
        set({ docList: list, fsList: [], openOpen: true })
      } catch {
        print('The server is not available: open a file from this device or choose a working folder.')
        set({ docList: [], fsList: [], openOpen: true })
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
    writeRecovery: async () => {
      // Sólo en la carpeta local y con el permiso ya dado (no se pide en segundo plano).
      if (!workspaceDir || (await permissionState(workspaceDir)) !== 'granted') return
      const { docFolder, docName } = get()
      try {
        const h = await fileHandleAt(workspaceDir, docFolder, drawingFileName(docName, '.sv$'), { create: true })
        if (!h) return
        await writeTextFile(h, JSON.stringify(doc.toJSON()))
        print(`<Automatic save to "${joinPath(docFolder, drawingFileName(docName, '.sv$'))}">`)
      } catch {
        /* la copia de recuperación no es imprescindible */
      }
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
        if (fileName.toLowerCase().endsWith('.dxf')) {
          // En el hilo aparte, como al abrir del equipo (también el DXF binario).
          const f = await handle.getFile()
          const r = await importCadInWorker('dxf', f.arrayBuffer ? await f.arrayBuffer() : (new TextEncoder().encode(await f.text()).buffer as ArrayBuffer), { light: isPhone() })
          pushSnapshot('open')
          doc.reset()
          const n = applyDxf(r, true)
          currentFile = null // un DXF importado se guarda como .cota nuevo
          set({ docId: null, docName: name, docFolder: folder, fsFilePath: null, openOpen: false, selection: [] })
          print(`Imported "${path}" (${n} entities).`)
          await loadFolderImages(folder)
          markSaved()
          frameOpenedDrawing()
        } else {
          const text = await readTextFile(handle)
          pushSnapshot('open')
          doc.load(JSON.parse(text) as DocumentData)
          restoreModelUcs()
          applyViews()
          // Una copia `.bak`/`.sv$` se abre como el dibujo sin guardar: SAVE la escribe como `nombre.cota`.
          const backupCopy = isBackupFile(fileName)
          currentFile = backupCopy ? null : handle
          set({
            docId: null,
            docName: name,
            docFolder: folder,
            fsFilePath: backupCopy ? null : path,
            currentLayerId: doc.currentLayer,
            openOpen: false,
            selection: [],
            viewportLayout: doc.viewportLayout,
          })
          print(backupCopy ? `Opened the copy "${path}": SAVE writes it as "${drawingFileName(name, DRAWING_EXT)}".` : `Opened "${path}".`)
          if (!backupCopy) markSaved()
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
        applyViews()
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
        markSaved()
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

// TRACEBACK: cada acción iniciada por el usuario (no las que unas acciones llaman a otras) queda en el registro de la
// sesión con sus argumentos, para repetirla (`core/session/traceLog`). Se excluyen las de consulta, las muy frecuentes
// (cursor, vistas: van aparte como `view`) y las que llevan credenciales.
const TRACE_SKIP = new Set([
  'setCursor', 'registerViewport', 'unregisterViewport', 'viewportViewChanged', 'setCameraState', 'isSelectMode',
  'selectionArea', 'listTemplates', 'isDirty', 'plotPreview', 'computePreview', 'listCommands', 'writeRecovery',
  'restoreSession', 'notify', 'login', 'logout', 'setAiConfig', 'markSaved', 'setActiveViewport',
])
const TRACE_CHECKPOINT = /^(open|load|new|import|reset|restore|delete)/i
{
  setTraceSnapshot(() => useStore.getState().doc.toJSON())
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(useStore.getState())) {
    if (typeof v !== 'function' || TRACE_SKIP.has(k)) continue
    const fn = v as (...a: unknown[]) => unknown
    patch[k] = (...args: unknown[]) => {
      if (traceLog.recording) {
        traceLog.record(k, args)
        if (TRACE_CHECKPOINT.test(k)) traceLog.markCheckpoint()
      }
      return traceLog.nested(() => fn(...args))
    }
  }
  useStore.setState(patch as Partial<AppState>)
}
// Avisos y errores de consola (informativos, sin repetir el mismo mensaje dentro del segundo).
{
  let lastMsg = ''
  let lastAt = 0
  for (const level of ['warn', 'error'] as const) {
    const orig = console[level].bind(console)
    console[level] = (...a: unknown[]) => {
      const msg = a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(' ').slice(0, 500)
      if (msg !== lastMsg || Date.now() - lastAt > 1000) traceLog.record('error', [level, msg])
      ;[lastMsg, lastAt] = [msg, Date.now()]
      orig(...a)
    }
  }
}
// La selección resultante de cada cambio (informativa: ayuda a verificar la repetición).
useStore.subscribe((s, prev) => {
  if (s.selection !== prev.selection) traceLog.record('selection', [s.selection.slice(0, 500)])
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

// Cada cambio de selección del usuario es un paso de Ctrl+Z (el store decide cuáles; ver `selectionStep`).
useStore.subscribe((s, prev) => {
  if (s.selection !== prev.selection) selectionStep?.(prev.selection, s.selection)
})
