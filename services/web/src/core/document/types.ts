import type { Vec3 } from '../math'
import type { NamedView, VisualStyle } from '../view'
import type { DimStyleDef, DimVars } from '../dimension/style'

export interface Layer {
  id: string
  name: string
  color: string // hex, p.ej. "#ffffff"
  lineWeight: number // mm
  lineType: string
  locked: boolean
  visible: boolean
  printable: boolean
  /**
   * *Freeze*: no se dibuja, no se regenera, no da snaps, no se selecciona ni se plotea (en todo
   * el dibujo y en todos los viewports). La capa actual no puede estar congelada. Ausente = descongelada.
   */
  frozen?: boolean
  /** *New VP Freeze*: la capa nace congelada en los viewports de layout nuevos (VPLAYER Vpvisdflt). */
  newVpFreeze?: boolean
}

export interface UcsDef {
  id: string
  name: string
  origin: Vec3
  xAxis: Vec3
  yAxis: Vec3
}

export type EntityType =
  | 'LINE'
  | 'CIRCLE'
  | 'ARC'
  | 'ELLIPSE'
  | 'TEXT'
  | 'POLYLINE'
  | 'RECTANGLE'
  | 'SPLINE'
  | 'SOLID3D'
  | 'MESH3D'
  | 'DIMENSION'
  | 'INSERT'
  | 'VIEWPORT'
  | 'ATTDEF'
  | 'HATCH'
  | 'SHADE'
  | 'POINT'

/** Nombre de un tipo de línea de la tabla del dibujo, p. ej. `CONTINUOUS`, `HIDDEN`, `CENTER`. */
export type LineType = string

export interface LineProps {
  start: Vec3
  end: Vec3
}

/** Punto (POINT): una marca en el dibujo con el estilo de PDMODE/PDSIZE; da snap NODE. */
export interface PointProps {
  position: Vec3
}

export interface CircleProps {
  center: Vec3
  radius: number
  normal: Vec3
}

/**
 * Arco de circunferencia. Convención DXF: va de `startAngle` a `endAngle` **antihorario
 * dentro de su plano**; un arco dibujado en sentido horario se guarda con `normal = [0,0,-1]`.
 * Los helpers de `core/geom/arc.ts` resuelven ambos casos sin distinción.
 */
export interface ArcProps {
  center: Vec3
  radius: number
  /** Ángulo inicial en radianes, medido en el plano de `normal` desde su eje `u`. */
  startAngle: number
  /** Ángulo final en radianes (el arco va de start a end en sentido antihorario del plano). */
  endAngle: number
  normal: Vec3
}

/** Elipse en un plano arbitrario (estilo DXF): centro, semieje mayor (vector), relación menor/mayor
 *  y normal del plano. El semieje menor se deriva de `normal × major` con longitud |major|·ratio. */
export interface EllipseProps {
  center: Vec3
  major: Vec3
  ratio: number
  normal: Vec3
  /** Parámetro inicial del arco de elipse, en radianes (ausente = elipse completa). Códigos DXF 41/42. */
  startParam?: number
  endParam?: number
}

export interface PolylineProps {
  /**
   * Normal del plano de la polilínea: orienta los tramos curvos (*bulge*). Ausente = +Z (planta).
   */
  normal?: Vec3
  vertices: Vec3[]
  /**
   * Curvatura de cada tramo: `bulges[i]` corresponde al tramo `i → i+1` y vale la tangente
   * de un cuarto del ángulo incluido (0 o ausente = tramo recto). Es la convención de la
   * `LWPOLYLINE` del DXF, así que el round-trip con el CAD clásico es directo.
   */
  bulges?: number[]
  closed: boolean
  /**
   * Ancho de cada tramo, `[inicial, final]` como los códigos 40/41 de la LWPOLYLINE. Ausente = 0
   * (línea fina). Una polilínea ancha se dibuja rellena.
   */
  widths?: Array<[number, number]>
  /** *Ltype gen* (PEDIT): el patrón del tipo de línea corre continuo por los vértices. */
  ltGen?: boolean
  /** Curva de ajuste de PEDIT: `fit` (arcos por los vértices) o B-spline cuadrática/cúbica. */
  fit?: 'fit' | 'quadratic' | 'cubic'
  /** Vértices de control (el marco) de una polilínea ajustada: `Decurve` vuelve a ellos. */
  frame?: Vec3[]
  /** Tangente fijada en cada vértice del marco (PEDIT ▸ Edit vertex ▸ Tangent), radianes; null = automática. */
  tangents?: Array<number | null>
}

export interface RectangleProps {
  corner: Vec3
  width: number
  height: number
}

export interface SplineProps {
  controlPoints: Vec3[]
  degree: number
}

/** Referencia a un bloque (INSERT): ubica la geometría de una definición con escala y rotación (Z).
 *  Es una referencia REAL: al editar la definición del bloque, todas las inserciones se actualizan. */
export interface InsertProps {
  name: string // nombre del bloque referenciado (clave en DocumentData.blocks)
  position: Vec3 // punto de inserción (donde se coloca el origen/base del bloque)
  scale: Vec3 // escala por eje (X/Y/Z)
  rotation: number // rotación en su plano (alrededor de su normal), en radianes
  /** Normal del plano de la inserción (OCS del CAD clásico). Ausente = +Z (en planta). */
  normal?: Vec3
  /** Vista de dibujo (VIEWBASE/VIEWPROJ): la inserción muestra la proyección del modelo. */
  view?: import('../drawing/views').DrawingViewData
  /** Valores de los atributos de la inserción, por tag. Ubicación y estilo salen del ATTDEF. */
  attributes?: AttributeValue[]
}

/** Valor de un atributo en una inserción (el ATTRIB del CAD clásico). */
export interface AttributeValue {
  tag: string
  value: string
}

/**
 * Definición de atributo (ATTDEF): texto variable de un bloque. Dentro de una definición genera el
 * atributo de cada inserción; suelta en el dibujo muestra su tag, como el CAD clásico.
 */
export interface AttdefProps extends Omit<TextProps, 'text'> {
  tag: string
  prompt: string
  /** Valor por defecto (puede contener campos). */
  value: string
  /** No se dibuja ni se plotea (salvo ATTDISP ON). */
  invisible?: boolean
  /** Valor fijo: no se pide al insertar ni se edita. */
  constant?: boolean
  /** Toma el valor por defecto sin preguntarlo al insertar (editable después). */
  preset?: boolean
}

/** Texto (TEXT de una línea o MTEXT multilínea) en un plano. Las líneas se separan con `\n`. */
export interface TextProps {
  position: Vec3
  text: string
  height: number
  rotation: number // radianes en el plano
  justify: 'left' | 'center' | 'right'
  normal: Vec3
  /**
   * `text`: texto de un renglón del CAD clásico (TEXT/DTEXT): `position` es el punto de la línea base (al inicio,
   * centro o final según `justify`). `mtext`: párrafo (MTEXT): `position` es la esquina de arriba. Ausente (dibujos
   * anteriores, rótulos): como `mtext`, salvo que se muestra como TEXT si tiene un solo renglón.
   */
  kind?: 'text' | 'mtext'
}

export interface ExtrudeProps {
  op: 'EXTRUDE'
  /** Polígono base (en su propio plano) que se extruye a lo largo de `axis`. */
  profile: Vec3[]
  height: number
  /** Eje de extrusión (normal del plano del perfil). Ausente = +Z mundo (compat. con dibujos previos). */
  axis?: Vec3
}

/** Caja paramétrica: esquina mínima `origin` y extensión en +X/+Y/+Z. */
/** Orientación de una primitiva alineada a la UCS: ejes X e Y unitarios en mundo. */
export interface SolidBasis {
  x: Vec3
  y: Vec3
}

export interface BoxProps {
  op: 'BOX'
  origin: Vec3
  width: number
  depth: number
  height: number
  /** Ejes X/Y de la caja (alineada a la UCS); ausente = ejes del mundo. `origin` es su esquina. */
  basis?: SolidBasis
}

/** Cilindro paramétrico: centro de la base, radio, altura y teselación radial.
 *  `axis` es la dirección de extrusión (unitaria); por defecto +Z (mundo). Permite cilindros
 *  perpendiculares al plano de la vista activa (front/left/…), no solo verticales. */
export interface CylinderProps {
  op: 'CYLINDER'
  base: Vec3
  radius: number
  height: number
  segments: number
  axis?: Vec3
}

/** Cono paramétrico: centro de la base, radio, altura (al ápice), teselación y `axis` (por defecto +Z).
 *  `radiusTop` > 0 lo convierte en un tronco de cono (frustum); 0/omitido = cono completo. */
export interface ConeProps {
  op: 'CONE'
  base: Vec3
  radius: number
  height: number
  segments: number
  axis?: Vec3
  radiusTop?: number
}

/** Esfera paramétrica: centro, radio y teselación. */
export interface SphereProps {
  op: 'SPHERE'
  center: Vec3
  radius: number
  segments: number
}

/** Prisma: N-gono regular en XY a z=center[2], extruido +Z. `rotation` en radianes (default 0). */
export interface PrismProps {
  op: 'PRISM'
  center: Vec3
  radius: number
  sides: number
  height: number
  rotation?: number
  /** Ejes X/Y del prisma; ausente = ejes del mundo (la altura va por X × Y). */
  basis?: SolidBasis
}

/**
 * Revolución: `profile` = pares [radio, altura], revolucionado alrededor de un eje por `base`. `angle`
 * (radianes, con signo = sentido) default 2π.
 *
 * Sin `axis`/`ref` el eje es Z (perfiles del generador con IA). Con ellos (comando `REVOLVE`):
 * `axis` es la dirección del eje y `ref` la dirección (⟂ al eje) donde está el perfil al empezar; la
 * revolución gira de `ref` hacia `axis × ref`.
 */
export interface RevolveProps {
  op: 'REVOLVE'
  base: Vec3
  profile: Array<[number, number]>
  segments: number
  angle?: number
  axis?: Vec3
  ref?: Vec3
}

/** Toro: centro, radio (al centro del tubo), radio del tubo y eje (default +Z). */
export interface TorusProps {
  op: 'TORUS'
  center: Vec3
  radius: number
  tube: number
  segments: number
  axis?: Vec3
}

/** Barrido: perfil 2D cerrado barrido a lo largo de un path 3D. */
export interface SweepProps {
  op: 'SWEEP'
  profile: Array<[number, number]>
  path: Vec3[]
  steps?: number
  /**
   * Dirección de la X del perfil al inicio del recorrido. Ausente = la que elige el barrido por su
   * cuenta (compatibilidad); se fija al rotar o reflejar el sólido para que el perfil gire con él.
   */
  ref?: Vec3
  /** El perfil quedó espejado (MIRROR): su Y se invierte respecto del recorrido. */
  mirror?: boolean
  /** El recorrido son los puntos de control de una spline: se suaviza (como se dibuja) antes de barrer. */
  smooth?: boolean
}

/** Loft: secciones (anillos) con MISMA cantidad de vértices, unidas con caras laterales + tapas. */
export interface LoftProps {
  op: 'LOFT'
  sections: Vec3[][]
  closed?: boolean
}

/** Vaciado aproximado: `solid` menos una copia escalada hacia el centroide (pared ≈ thickness). */
export interface ShellProps {
  op: 'SHELL'
  solid: SolidProps
  thickness: number
}

/** Hoja de un árbol de sólido: extrusión o primitiva paramétrica. */
export type SolidLeaf =
  | ExtrudeProps
  | BoxProps
  | CylinderProps
  | ConeProps
  | SphereProps
  | PrismProps
  | RevolveProps
  | TorusProps
  | SweepProps
  | LoftProps

export interface BooleanProps {
  op: 'UNION' | 'SUBTRACT' | 'INTERSECT'
  operands: SolidProps[]
}

/**
 * Arista de un sólido, referida por un punto sobre ella: la topología se deriva de la malla
 * evaluada, así que la arista se vuelve a encontrar en cada evaluación. `base` (sólo CHAMFEREDGE) es
 * un punto sobre la cara de referencia, sobre la que se mide `d1`.
 */
export interface EdgeRef {
  at: Vec3
  base?: Vec3
}

/** Redondeo de aristas (FILLETEDGE): el sólido original queda intacto como hijo del nodo. */
export interface FilletEdgeProps {
  op: 'FILLETEDGE'
  solid: SolidProps
  edges: EdgeRef[]
  radius: number
}

/** Chaflán de aristas (CHAMFEREDGE): `d1` sobre la cara de referencia, `d2` sobre la otra. */
export interface ChamferEdgeProps {
  op: 'CHAMFEREDGE'
  solid: SolidProps
  edges: EdgeRef[]
  d1: number
  d2: number
}

export type EdgeBlendProps = FilletEdgeProps | ChamferEdgeProps

/** Árbol paramétrico de un sólido: hojas (extrusión/primitivas) combinadas por booleanas, vaciado (SHELL) o redondeo/chaflán de aristas. */
export type SolidProps = SolidLeaf | BooleanProps | ShellProps | EdgeBlendProps

/** Malla poligonal no paramétrica (p. ej. importada de OBJ): vértices + caras por índices. */
export interface MeshProps {
  vertices: Vec3[]
  /** Cada cara es una lista de índices a `vertices` (triángulos o polígonos convexos). */
  faces: number[][]
}

/** Tipos de cota soportados (taxonomía el CAD clásico). */
export const DIM_TYPES = [
  'LINEAR',
  'ALIGNED',
  'ANGULAR',
  'RADIUS',
  'DIAMETER',
  'JOGGED',
  'ARCLEN',
  'ORDINATE',
  'LEADER',
  'CENTER',
  'MLEADER',
  'CENTERLINE',
] as const
export type DimType = (typeof DIM_TYPES)[number]

/**
 * Referencia asociativa de un punto definitorio: entidad + qué punto de ella. Si la entidad
 * cambia, la cota se recalcula; si desaparece, la referencia se descarta (cota no asociativa).
 */
export interface DimAssocRef {
  id: string
  /** Extremo inicial/final, medio, centro, cuadrante, vértice `index`, o punto sobre la curva (`t`). */
  kind: 'start' | 'end' | 'mid' | 'center' | 'quadrant' | 'vertex' | 'on'
  index?: number
  t?: number
  /** Cota del papel asociada al modelo a través de este viewport (trans-espacial). */
  vp?: string
}

export interface DimensionProps {
  dimType: DimType
  /** Puntos definitorios (según el tipo: extremos, vértice, centro, etc.). */
  points: Vec3[]
  /** Posición de la línea de cota (y del texto, salvo que se haya movido con `textAt`). */
  textPos: Vec3
  /** Variables resueltas (estilo + overrides): lo que se dibuja. */
  style: DimVars
  /** Estilo de cota (`DIMSTYLE`); ausente en `.cota` previos (se migra a `Standard`). */
  styleName?: string
  /** Lo que difiere del estilo en esta cota (`DIMOVERRIDE`, paleta). */
  overrides?: Partial<DimVars>
  /** Texto manual que reemplaza la medida (null = medida automática); `<>` inserta la medida. */
  textOverride?: string | null
  /** Eje para ORDINATE ('X' o 'Y'). */
  axis?: 'X' | 'Y'
  /**
   * Normal del plano de la cota, **hacia el observador**: la de la vista al crearla (TOP = +Z,
   * FRONT = −Y…) o la del círculo/arco acotado. Define qué es "horizontal"/"vertical" y la lectura del
   * texto, así una cota en un plano vertical no queda espejada ni mide en el plano equivocado. Ausente = +Z.
   */
  normal?: Vec3
  /** Posición del texto movido por el usuario (grip, `DIMTEDIT`); ausente = automática. */
  textAt?: Vec3
  /** Ángulo del texto (`DIMTEDIT Angle`), grados; ausente = según la alineación del estilo. */
  textAngle?: number
  /** Ángulo de una cota lineal rotada (`DIMLINEAR Rotated`), grados; ausente = H/V según `textPos`. */
  rotation?: number
  /**
   * Dirección horizontal de la cota, grados desde la X de la base del plano: la X de la UCS al
   * crearla (código 51 de DXF). Define qué es H/V, la horizontal del texto y los ejes de las ordenadas.
   */
  hdir?: number
  /** Oblicuidad de las líneas de referencia (`DIMEDIT Oblique`), grados. */
  oblique?: number
  /** Asociatividad por punto definitorio. */
  assoc?: Array<DimAssocRef | null>
  /** Cortes manuales de la línea de cota (`DIMBREAK Manual`): tramos [t0, t1] desde el primer extremo. */
  breaks?: Array<[number, number]>
  /** Objetos que cortan la cota (`DIMBREAK`): los cortes se recalculan cuando cambia la geometría. */
  breakWith?: string[]
  /** Puntos de corte calculados de `breakWith` (derivado; lo actualiza `updateAssociativeDims`). */
  autoBreaks?: Vec3[]
  /** Cota de inspección (`DIMINSPECT`): etiqueta, frecuencia y forma del marco. */
  inspect?: { label: string; rate: string; shape: 'round' | 'angular' | 'none' }
  /** Quiebre en la línea de cota (`DIMJOGLINE`): distancia desde el primer extremo. */
  jog?: number
  /**
   * Cómo se elige el ángulo de una ANGULAR/ARCLEN: `lines` (dos rectas: el cuadrante donde está el texto,
   * por defecto), `points` (vértice y dos puntos: el ángulo o su complemento a 360°, también > 180°) o
   * `arc` (el barrido del arco, de `points[1]` a `points[2]` antihorario visto desde `normal`).
   */
  angMode?: 'lines' | 'points' | 'arc'
  /**
   * Cota trans-espacial (en el papel, asociada al modelo por un viewport): unidades de modelo por mm de
   * papel; las longitudes medidas se multiplican por él para mostrar la medida real del modelo.
   */
  transScale?: number
  /** Flechas invertidas con *Flip Arrow* (primera y segunda). */
  flip?: [boolean, boolean]
  /** Multileader: tramos de cada línea de guía (cantidad de puntos de cada una dentro de `points`). */
  leaderSizes?: number[]
  /** Multileader con bloque como contenido. */
  blockName?: string
}

/** Lazo cerrado de un sombreado: vértices y bulges como una LWPOLYLINE cerrada. */
export interface HatchLoop {
  vertices: Vec3[]
  bulges?: number[]
}

/** Línea de un patrón de sombreado (formato `.pat`): ángulo (grados), origen, desplazamiento y trazos. */
export interface PatternLine {
  angle: number
  origin: [number, number]
  /** Desplazamiento entre líneas sucesivas: a lo largo de la línea y perpendicular. */
  delta: [number, number]
  dashes: number[]
}

/** Detección de islas (HPISLANDDETECTION): alternada, sólo el área exterior o sin islas. */
export type HatchIsland = 'normal' | 'outer' | 'ignore'

/**
 * Sombreado (HATCH): lazos cerrados rellenos con la regla par-impar, en un plano. Las líneas del
 * patrón no se guardan: se regeneran a partir del nombre, la escala, el ángulo y el origen.
 */
export interface HatchProps {
  loops: HatchLoop[]
  /** Normal del plano (ausente = +Z). Los ángulos se miden desde la X de `arcBasis(normal)`. */
  normal?: Vec3
  /** Nombre del patrón de la biblioteca métrica, `SOLID` o `_USER` (líneas definidas por el usuario). */
  pattern: string
  scale: number
  /** Ángulo del patrón (radianes). */
  angle: number
  /** Origen del patrón (un punto del plano). */
  origin: Vec3
  /** `_USER`: separación entre líneas y doble rayado (a 90°). */
  spacing?: number
  double?: boolean
  island: HatchIsland
  /**
   * Asociativo: objetos del contorno (`ids`), puntos internos con los que se recalcula (`seeds`) y objetos
   * elegidos enteros con *Select objects* (`objects`). Ausente = no asociativo.
   */
  assoc?: { ids: string[]; seeds?: Vec3[]; objects?: string[] }
  /** Definición propia de un patrón que no está en la biblioteca (llega de un DXF). */
  custom?: PatternLine[]
  /** El patrón es el de la biblioteca en pulgadas: se creó en un dibujo en unidades imperiales. */
  imperial?: boolean
}

/** Cómo se plotea un viewport: como se ve, alambre o líneas ocultas. */
export type ShadePlot = 'asDisplayed' | 'wireframe' | 'hidden'

/**
 * Viewport flotante de un layout: ventana del papel hacia el modelo, a escala. Vive sólo en
 * el espacio papel; al ser entidad hereda selección, grips, MOVE/COPY/ERASE, undo y paleta.
 */
export interface ViewportProps {
  /** Centro en el papel (mm, z = 0). */
  center: Vec3
  /** Ancho y alto en el papel (mm). */
  width: number
  height: number
  /** Punto del modelo que queda en el centro del viewport. */
  target: Vec3
  /** Orientación de la vista: azimut y elevación en radianes (convención de `CameraController`). */
  az: number
  el: number
  /** Escala papel:modelo como relación de longitudes (1:50 → 0.02); las unidades del dibujo la convierten a mm. */
  scale: number
  /** *Display locked*: zoom/pan dentro del viewport no cambian la escala ni la vista. */
  locked: boolean
  on: boolean
  visualStyle: VisualStyle
  shadePlot: ShadePlot
  /** Capas congeladas sólo en este viewport (VPLAYER). */
  frozenLayers: string[]
  /** Contorno de recorte en el papel (VPCLIP); ausente = el rectángulo. */
  clip?: [number, number][]
}

export type EntityProps =
  | PointProps
  | LineProps
  | CircleProps
  | ArcProps
  | EllipseProps
  | TextProps
  | PolylineProps
  | RectangleProps
  | SplineProps
  | SolidProps
  | MeshProps
  | DimensionProps
  | InsertProps
  | ViewportProps
  | AttdefProps
  | HatchProps
  | ShadeProps

/**
 * Propiedades comunes de todo objeto: tipo de línea (ausente = ByLayer; `BYBLOCK` o un nombre de
 * la tabla) y su escala propia (ausente = 1).
 */
export interface EntityCommon {
  lineType?: string
  ltScale?: number
  /** Firma de tamaño de sólidos y mallas: esfera envolvente y clave del contenido. */
  size?: import('../render/lod').SizeSig
}

export interface PointEntity extends EntityCommon {
  id: string
  type: 'POINT'
  layer: string
  props: PointProps
}

export interface LineEntity extends EntityCommon {
  id: string
  type: 'LINE'
  layer: string
  props: LineProps
}

export interface CircleEntity extends EntityCommon {
  id: string
  type: 'CIRCLE'
  layer: string
  props: CircleProps
}

export interface ArcEntity extends EntityCommon {
  id: string
  type: 'ARC'
  layer: string
  props: ArcProps
}

export interface EllipseEntity extends EntityCommon {
  id: string
  type: 'ELLIPSE'
  layer: string
  props: EllipseProps
}

export interface TextEntity extends EntityCommon {
  id: string
  type: 'TEXT'
  layer: string
  props: TextProps
}

export interface PolylineEntity extends EntityCommon {
  id: string
  type: 'POLYLINE'
  layer: string
  props: PolylineProps
}

export interface RectangleEntity extends EntityCommon {
  id: string
  type: 'RECTANGLE'
  layer: string
  props: RectangleProps
}

export interface SplineEntity extends EntityCommon {
  id: string
  type: 'SPLINE'
  layer: string
  props: SplineProps
}

export interface SolidEntity extends EntityCommon {
  id: string
  type: 'SOLID3D'
  layer: string
  props: SolidProps
}

export interface MeshEntity extends EntityCommon {
  id: string
  type: 'MESH3D'
  layer: string
  props: MeshProps
}

export interface DimensionEntity extends EntityCommon {
  id: string
  type: 'DIMENSION'
  layer: string
  props: DimensionProps
}

export interface InsertEntity extends EntityCommon {
  id: string
  type: 'INSERT'
  layer: string
  props: InsertProps
}

export interface ViewportEntity extends EntityCommon {
  id: string
  type: 'VIEWPORT'
  layer: string
  props: ViewportProps
}

export interface AttdefEntity extends EntityCommon {
  id: string
  type: 'ATTDEF'
  layer: string
  props: AttdefProps
}

export interface HatchEntity extends EntityCommon {
  id: string
  type: 'HATCH'
  layer: string
  props: HatchProps
}

/**
 * Sombreado de una vista de dibujo: triángulos con su color, pintados en orden (de atrás hacia
 * adelante) y debajo de las líneas. Entidad interna de los bloques de las vistas sombreadas.
 */
export interface ShadeProps {
  /** Vértices: x, y, z de cada vértice, 9 números por triángulo. */
  tris: number[]
  /** Color de cada triángulo: r, g, b en 0..1 (3 números por triángulo). */
  colors: number[]
}

export interface ShadeEntity extends EntityCommon {
  id: string
  type: 'SHADE'
  layer: string
  props: ShadeProps
}

export type Entity =
  | PointEntity
  | LineEntity
  | CircleEntity
  | ArcEntity
  | EllipseEntity
  | TextEntity
  | PolylineEntity
  | RectangleEntity
  | SplineEntity
  | SolidEntity
  | MeshEntity
  | DimensionEntity
  | InsertEntity
  | ViewportEntity
  | AttdefEntity
  | HatchEntity
  | ShadeEntity

/**
 * Entidad a agregar. Sin `lineType`/`ltScale` es un objeto nuevo y toma `CELTYPE`/`CELTSCALE`; con
 * `BYLAYER`/1 explícitos (copias, importación) queda ByLayer y escala 1.
 */
export interface EntityInput extends EntityCommon {
  type: EntityType
  layer: string
  props: EntityProps
}

/** Definición de un bloque: geometría en coordenadas del bloque (origen = punto base de inserción). */
/** ATTDISP: Normal = según cada atributo; ON = todos visibles; OFF = ninguno. */
export type AttDisp = 'normal' | 'on' | 'off'

export interface BlockDef {
  name: string
  entities: Entity[]
}

export type PaperOrientation = 'landscape' | 'portrait'
export type PlotStyle = 'color' | 'monochrome' | 'grayscale'

/** Configuración de página de un layout (PAGESETUP). */
export interface PageSetup {
  /** Clave del papel en `PAPER_SIZES` (`core/layout/paper.ts`) o `'CUSTOM'`. */
  paper: string
  /** Tamaño en mm [ancho, alto] en vertical; sólo para papel personalizado. */
  customSize?: [number, number]
  orientation: PaperOrientation
  /** Márgenes no imprimibles en mm: [arriba, derecha, abajo, izquierda]. */
  marginsMm: [number, number, number, number]
  plotStyle: PlotStyle
  plotLineweights: boolean
  /** Plotear el papel después de los viewports. */
  paperspaceLast: boolean
  /** Líneas ocultas también en las entidades 3D del papel. */
  hidePaperspaceObjects: boolean
}

/** Layout (espacio papel): hoja con su configuración de página y entidades en mm del papel. */
export interface LayoutDef {
  id: string
  name: string
  pageSetup: PageSetup
  entities: Entity[]
  /** Ya se creó el viewport inicial (se crea al abrir el layout por primera vez, como el CAD clásico). */
  initialized?: boolean
}

/** Tipo de línea de la tabla del dibujo (ver `core/linetype/linetypes.ts`). */
export interface LinetypeDefData {
  name: string
  description: string
  pattern: number[]
}

/** Variables del dibujo; ausentes = valor inicial del CAD clásico. */
export interface DrawingVars {
  LTSCALE?: number
  CELTYPE?: string
  CELTSCALE?: number
  PSLTSCALE?: 0 | 1
  MSLTSCALE?: 0 | 1
  PLINEGEN?: 0 | 1
  HPNAME?: string
  HPSCALE?: number
  /** Grados. */
  HPANG?: number
  HPASSOC?: 0 | 1
  HPISLANDDETECTION?: 0 | 1 | 2
  HPSPACE?: number
  HPDOUBLE?: 0 | 1
  HPORIGIN?: [number, number]
  /** LIMITS: esquinas de los límites del modelo en el XY del mundo y su control. */
  LIMMIN?: [number, number]
  LIMMAX?: [number, number]
  LIMCHECK?: 0 | 1
  /** Proyección de las vistas de dibujo (VIEWSTD): primer diedro (ISO E / IRAM) o tercer diedro. */
  VIEWPROJECTION?: 'first' | 'third'
}

export interface DocumentData {
  schemaVersion: number
  id: string
  name: string
  units: string
  layers: Layer[]
  ucs: UcsDef[]
  entities: Entity[]
  /** Tabla de definiciones de bloque (referenciadas por INSERT). Ausente = sin bloques. */
  blocks?: BlockDef[]
  /** Cantidad de viewports del layout (1–4); ausente = 1. */
  viewportLayout?: number
  /** ATTDISP del dibujo (ausente = normal), como el ATTMODE del DWG. */
  attdisp?: AttDisp
  /** Layouts (espacio papel), en orden de pestaña. Ausente en `.cota` previos: se crea `Layout1`. */
  layouts?: LayoutDef[]
  /** Pestaña activa (id de layout); ausente = Model. */
  activeLayout?: string
  /** Capa actual al guardar (id), como el CLAYER del DWG; ausente = la primera capa. */
  currentLayer?: string
  /** TEXTSIZE: último alto de texto usado; ausente = 2.5. Como en el CAD clásico, vive en el dibujo. */
  textSize?: number
  /** Estilos de cota del dibujo; ausente en `.cota` previos (se crean al abrir). */
  dimStyles?: DimStyleDef[]
  /** Estilo de cota actual (`DIMSTYLE`). */
  dimStyle?: string
  /** Overrides del estilo actual para las cotas nuevas (variables `DIM*` tecleadas). */
  dimOverrides?: Partial<DimVars>
  /** Escala de anotación del modelo (`CANNOSCALE`), como relación papel:modelo (1:50 → 0.02). */
  cannoscale?: number
  /** DIMASSOC: 2 = cotas asociativas (por defecto), 1 = no asociativas. */
  dimAssoc?: 1 | 2
  /** Estado de las capas antes de `LAYISO` (para `LAYUNISO`). */
  layIso?: Array<{ id: string; visible: boolean; locked: boolean }>
  /** UCS actual del modelo; ausente = World. */
  modelUcs?: { origin: Vec3; xAxis: Vec3; yAxis: Vec3 }
  /** Tipos de línea cargados; `.cota` previos: se cargan los que usen sus capas. */
  linetypes?: LinetypeDefData[]
  /** Variables de tipo de línea y de sombreado guardadas en el dibujo, como en el DWG. */
  vars?: DrawingVars
  /** Vistas guardadas (-VIEW Save). */
  views?: NamedView[]
  meta: {
    /** Fechas ISO: creación, último guardado y último ploteo (campos CreateDate/SaveDate/PlotDate). */
    created?: string
    modified?: string
    plotted?: string
    author?: string
    title?: string
    subject?: string
    keywords?: string
    /** Propiedades personalizadas (DWGPROPS), disponibles como campos. */
    custom?: Record<string, string>
  }
}
