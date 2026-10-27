import type { Entity, ShadeProps } from '../document/types'
import type { FlatshotOptions } from '../projection/flatshot'
import type { ProjBasis, ProjItem, ProjSegment } from '../projection/orthographic'
import type { Pt, Vec3 } from '../math'
import type { Deferred } from '../geom/tangency'
import type { DocumentModel } from '../document/DocumentModel'
import type { PreviewShape } from '../preview'
import type { Ucs } from '../ucs'
import type { CameraMode, ViewName, ViewState, VisualStyle } from '../view'
import type { SheetInit } from '../layout/layouts'

/** Datos del click que originó un punto: entidad bajo el cursor, punto sin snap y Shift. */
export interface PointPick {
  id: string | null
  raw: Pt
  shift: boolean
  /** TAN/PER diferido elegido con el clic: el comando resuelve el punto con el siguiente. */
  deferred?: Deferred
}

export type PointResult =
  | { kind: 'point'; point: Pt; pick?: PointPick }
  | { kind: 'keyword'; keyword: string }
  | { kind: 'cancel' }

export type DistanceResult =
  | { kind: 'distance'; value: number }
  | { kind: 'keyword'; keyword: string }
  | { kind: 'cancel' }

/** Ángulo en **grados** (positivo antihorario), tecleado o indicado con el cursor desde la base. */
export type AngleResult =
  | { kind: 'angle'; deg: number }
  | { kind: 'keyword'; keyword: string }
  | { kind: 'cancel' }

export interface GetPointOptions {
  /** Punto base (rubber-band, coordenadas relativas, PER/TAN). `null` = sin base aunque haya un punto previo. */
  base?: Pt | null
  keywords?: string[]
  /**
   * Keyword que devuelve un **Enter vacío** en vez de cancelar (el CAD clásico usa Enter como atajo de una
   * opción, p. ej. `ARC` continúa el último trazo). ESC siempre cancela.
   */
  enterKeyword?: string
  /** Texto libre que el prompt acepta como keyword (se devuelve tal cual), p. ej. `ZOOM 1/50xp`. */
  textKeyword?: RegExp
  /** Construye la previsualización (rubber-band) para la posición actual del cursor. */
  preview?: (cursor: Pt) => PreviewShape[]
  /** Esquina opuesta de una ventana: sin ortho, que la dejaría en línea con la primera (como el CAD clásico). */
  corner?: boolean
  /** Geometría ya definida del comando que todavía no está en el dibujo (los tramos de una PLINE): da snaps. */
  snapEntities?: Entity[]
}

export interface GetDistanceOptions {
  base: Pt
  keywords?: string[]
  /** Valor que devuelve un **Enter vacío** (el `<valor>` del prompt); sin él, Enter cancela. */
  default?: number
  preview?: (cursor: Pt) => PreviewShape[]
}

export interface GetAngleOptions {
  /** Vértice del ángulo: el cursor define la dirección respecto de este punto. */
  base: Pt
  /**
   * Cuando está presente, el ángulo indicado **con el cursor** se mide desde la dirección
   * `base → relativeTo` (ángulo *incluido*, como el `ARC ▸ Angle` del CAD clásico). Un número tecleado
   * se toma tal cual.
   */
  relativeTo?: Pt
  keywords?: string[]
  /** Ángulo (grados) que devuelve un Enter vacío; sin él, Enter cancela. */
  default?: number
  preview?: (cursor: Pt) => PreviewShape[]
}

/** Hooks de nivel de aplicación (auth, persistencia, undo) que exponen diálogos/acciones. */
export interface AppHooks {
  newDocument(): void
  openDialog(): void
  /** Guarda el dibujo; si se pasa `name`, lo renombra antes de guardar. */
  save(name?: string): void
  /** Nombre actual del dibujo (para prompt de SAVE). */
  docName(): string
  loginDialog(): void
  isAuthenticated(): boolean
  undo(): void
  redo(): void
  clearSelection(): void
  /**
   * Fija la UCS del viewport activo; `name` = la UCS guardada (o `World`) que se restauró.
   * `temporary` = UCS dinámica: no entra en `Previous` ni se guarda en el dibujo.
   */
  setUcs(ucs: Ucs, name?: string, temporary?: boolean): void
  /** UCS actual del viewport activo. */
  getUcs?(): Ucs
  /** Nombre de la UCS actual si es una guardada (null = sin nombre). */
  ucsName?(): string | null
  /** `UCS Previous`: restaura la anterior (hasta 10) y la devuelve; null si no hay. */
  previousUcs?(): Ucs | null
  /** Ejes de la pantalla en mundo (derecha y arriba) de la vista activa, para `UCS View`. */
  viewAxes?(): { right: Vec3; up: Vec3 } | null
  /** Vista en planta de una UCS (`PLAN`, `UCSFOLLOW`). */
  planView?(ucs: Ucs): void
  setView(view: ViewName): void
  setCameraMode(mode: CameraMode): void
  /** Normal del plano de construcción de la vista activa (eje de extrusión de primitivas 3D). */
  constructionNormal(): Vec3
  /**
   * Rayo de la vista activa que pasa por el punto de mundo `p`, con la tolerancia de picking (~8 px)
   * en unidades de mundo (picking de aristas de sólidos). null/ausente sin viewport.
   */
  viewRay?(p: Pt): { origin: Vec3; dir: Vec3; tol: number } | null
  zoomExtents(): void
  zoomWindow(a: Pt, b: Pt): void
  /** ZOOM Previous: vuelve a la vista anterior; false si no hay. */
  zoomPrevious?(): boolean
  /** Alto visible de la vista activa (unidades de mundo). */
  viewHeight?(): number
  /** ZOOM Center: centro y alto visible. */
  zoomCenter?(c: Pt, height: number): void
  /** ZOOM nX: divide el alto visible por `f`. */
  zoomScale?(f: number): void
  /** Encuadra una caja de mundo (ZOOM Object/All). */
  zoomBox?(min: Vec3, max: Vec3): void
  /** Extensión de lo dibujado en la vista activa (null si no hay nada). */
  extentsBox?(): { min: Vec3; max: Vec3 } | null
  /** ¿La vista activa mira en planta del mundo? */
  isPlanView?(): boolean
  /** -PAN: desplaza el dibujo `d`. */
  panBy?(d: Vec3): void
  /** Rectángulo visible en el plano del objetivo (ZOOM Dynamic). */
  viewRect?(): { center: Vec3; right: Vec3; up: Vec3; width: number; height: number } | null
  /** Modo Realtime de ZOOM/PAN (null sale). */
  realtime?(mode: 'zoom' | 'pan' | 'orbit' | 'forbit' | 'corbit' | null): void
  /** Vista que encuadraría la ventana `a`–`b`, sin aplicarla (-VIEW Window). */
  windowViewState?(a: Pt, b: Pt): ViewState | null
  /** Vista actual y restauración (vistas guardadas, ZOOM Dynamic). */
  getViewState?(): ViewState | null
  restoreViewState?(s: ViewState): void
  /** Abre el administrador de estilos de cota (`DIMSTYLE`). */
  openDimStyle(): void
  /** Fija la capa actual (sin mover la selección), p. ej. `-LAYER Set` o `LAYMCUR`. */
  setCurrentLayer?(id: string): void
  /** Normal del plano de construcción hacia el observador (plano de las cotas nuevas). */
  facingNormal?(): Vec3
  /** Cantidad de viewports del layout (1–4). */
  setViewportLayout(n: number): void
  /** Exporta el dibujo a PDF vectorial (descarga en el navegador). */
  exportPdf(): void
  /** PUBLISH: un PDF multipágina con los layouts indicados. */
  publish(layoutIds: string[]): void
  /** Abre un selector de archivo para importar OBJ/DXF al dibujo. */
  importFile(): void
  /** OPEN ▸ Device: selector de archivos del sistema (.cota/.dxf/.dwg). */
  openFromDevice(): void
  /** Exporta el dibujo al formato indicado (descarga en el navegador). */
  exportModel(format: 'OBJ' | 'DXF' | 'DWG'): void
  /** Abre el diálogo de configuración de UI (temas/colores). */
  openOptions(): void
  /** Abre el diálogo de object snaps (running osnaps). */
  openOsnap(): void
  /** Estilo visual del viewport activo (2D/3D wireframe, shaded, shaded+edges, hidden). */
  setVisualStyle(mode: VisualStyle): void
  /** Estilo visual vigente (el del viewport de MSPACE si se está dentro de uno). */
  visualStyle(): VisualStyle
  /** Muestra/oculta la paleta de Propiedades. */
  toggleProperties(): void
  /** Abre el administrador de capas (modal del comando LAYER). */
  openLayers(): void
  /** Abre el administrador de tipos de línea (LINETYPE). */
  openLinetypes?(): void
  /** Base de proyección de la vista actual del viewport activo (FLATSHOT, VIEWBASE ▸ Current). */
  currentViewBasis?(): ProjBasis | null
  /** Proyección 2D con líneas ocultas de lo 3D visible del modelo (o de los objetos `ids`). */
  projectModel?(ids: string[] | null, basis: ProjBasis, opts: { showObscured: boolean; tangential: boolean }): ProjItem[]
  /** Proyección, en coordenadas de la vista, del centro 3D de lo que se documenta (origen común de las vistas). */
  viewOrigin?(ids: string[] | null, basis: ProjBasis): [number, number] | null
  /** Triángulos sombreados de lo 3D visible del modelo (o de `ids`) vistos en `basis`. */
  shadeModel?(ids: string[] | null, basis: ProjBasis): ShadeProps
  /** Tramos de la proyección con sus extremos 3D, sin unir (SOLPROF sin proyectar). */
  projectSegments?(ids: string[] | null, basis: ProjBasis, tangential: boolean): ProjSegment[]
  /** Id de una capa por nombre; la crea (con su tipo de línea) si no existe. */
  ensureLayer?(name: string, lineType?: string, color?: string): string
  /** VIEWUPDATE: recalcula vistas de dibujo (las desactualizadas, o todas con `force`); devuelve cuántas. */
  updateDrawingViews?(ids: string[] | null, force?: boolean): number
  /** FLATSHOT: diálogo de opciones (null = Cancel). */
  flatshotDialog?(): Promise<FlatshotOptions | null>
  /** FLATSHOT: lo 3D visible proyectado según la vista actual (líneas, arcos y círculos 2D). */
  flatshotProject?(opts: { showObscured: boolean; tangential: boolean }): ProjItem[]
  /** Descarga entidades como DXF; devuelve el nombre del archivo. */
  downloadDxf?(entities: Entity[], baseName: string): string
  /** Pantalla limpia, línea de comandos compacta y cubo de vistas (CLEANSCREENON…, NAVVCUBE). */
  screen?(patch: { cleanScreen?: boolean; commandLineCompact?: boolean; viewCubeOn?: boolean }): void
  /** Deja seleccionados estos objetos (SELECTSIMILAR). */
  selectIds?(ids: string[]): void
  /** Selecciona todos los objetos seleccionables del espacio actual (Ctrl+A, SELECTALL). */
  selectAll?(): number
  /** Objetos seleccionados antes del comando (PEDIT por doble clic o noun-verb). */
  preselection?(): string[]
  /** -TOOLBAR: muestra, oculta, acopla o hace flotar una barra (por nombre o id); false si no existe. */
  toolbar?(name: string, patch: { visible?: boolean; docked?: boolean; side?: 'left' | 'right' | 'top' | 'bottom' }): boolean
  /** TOOLBAR: abre el diálogo con la lista de barras. */
  openToolbars?(): void
  /** GRID: muestra u oculta la grilla (sin argumento, alterna); devuelve el estado nuevo. */
  grid?(on?: boolean): boolean
  gridOn?(): boolean
  /** FULLSCREEN: pantalla completa total; sin argumento, alterna. Devuelve el estado elegido. */
  fullscreen?(on?: boolean): boolean
  /**
   * Panel *Hatch Creation* / *Hatch Editor*: muestra los ajustes de los sombreados `ids` mientras
   * corre HATCH/HATCHEDIT; null lo cierra.
   */
  hatchPanel?(p: { mode: 'create' | 'edit'; ids: string[] } | null): void
  /** Elige la carpeta del sistema donde guardar/abrir los dibujos. */
  pickWorkspaceFolder(): void
  /** Vuelve a guardar en la cuenta (backend) en vez de la carpeta local. */
  useCloudStorage(): void
  /** Carpeta de trabajo actual, o null si se usa la nube. */
  workspaceName(): string | null
  /** Redibuja/regenera todos los viewports (REDRAW/REGEN). */
  redraw(): void
  /** Abre el diálogo de propiedades del dibujo (DWGPROPS). */
  openDwgProps(): void
  /** PAGESETUP del layout activo. */
  openPageSetup(): void
  /** Diálogo de plantillas: crear un layout desde una plantilla o guardar el activo como plantilla. */
  openTemplateDialog(mode: 'from' | 'save'): void
  /** Guarda un layout como plantilla `.cotat` (carpeta de trabajo o biblioteca del navegador). */
  saveLayoutTemplate(layoutId: string, name: string): void
  /** Cómo se arma la hoja de un layout nuevo (plantilla predeterminada de OPTIONS); undefined = la de fábrica. */
  sheetInit(): SheetInit | undefined
  /**
   * Diálogo de atributos (INSERT con ATTDIA=1, EATTEDIT): un valor por ítem, o null si se cancela.
   */
  editAttributes(title: string, items: { tag: string; prompt: string; value: string }[]): Promise<string[] | null>
  /** Abre el asistente de IA (comando PROMPT): genera/edita el modelo con lenguaje natural. */
  openAi(): void
  /**
   * Proyecta los sólidos 3D indicados (o todos si la lista está vacía) a las vistas ortográficas
   * estándar (front/top/right) con líneas visibles y ocultas, dispuestas según ISO E (primer diedro)
   * o ISO A (tercer diedro). Devuelve la cantidad de segmentos generados.
   */
  projectOrthographic(ids: string[], firstAngle: boolean, origin: Vec3): number
}

/** API que un comando usa para interactuar con el usuario y el documento. */
export interface CommandContext {
  getPoint(prompt: string, opts?: GetPointOptions): Promise<PointResult>
  getDistance(prompt: string, opts: GetDistanceOptions): Promise<DistanceResult>
  /** Ángulo en grados: número tecleado, o dirección base→cursor al hacer click. */
  getAngle(prompt: string, opts: GetAngleOptions): Promise<AngleResult>
  /** Selección interactiva de objetos (click en viewport). Devuelve ids, o null si se cancela. */
  getSelection(prompt: string): Promise<string[] | null>
  /** Resalta objetos hasta que termina el comando (los encontrados por una ventana de STRETCH, etc.). */
  highlight(ids: string[]): void
  /**
   * Marca (resaltados) los objetos que el comando tomó con un clic (FILLET, OFFSET, BREAK…), sin cambiar la
   * selección: así se ve sobre qué se está trabajando. Se sueltan al terminar el comando.
   */
  markPicked(ids: string[]): void
  /** Selección (sin tomar la pre-selección) que también acepta opciones tecleadas. null si se cancela. */
  getSelectionOrKeyword(prompt: string, keywords: string[]): Promise<{ kind: 'selection'; ids: string[] } | { kind: 'keyword'; keyword: string } | null>
  /** Solicita texto libre por la línea de comandos (p. ej. nombre de archivo). null si se cancela. */
  getString(prompt: string, opts?: { default?: string }): Promise<string | null>
  print(msg: string): void
  openHelp(): void
  app: AppHooks
  doc: DocumentModel
  currentLayerId(): string
}

export interface Command {
  name: string
  aliases: string[]
  description: string
  /**
   * Comando 2D o de primitivas: con una UCS que no es la universal corre en el marco de la UCS
   * (coordenadas locales, plano XY y ángulos desde su X), como en el CAD clásico.
   */
  planar?: boolean
  run(ctx: CommandContext): Promise<void>
}
