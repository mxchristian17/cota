export type CameraMode = 'ortho' | 'persp'

/** `ISO` es la isométrica SE (SEISO del CAD clásico); las otras tres son SWISO, NEISO y NWISO. */
export type ViewName = 'TOP' | 'BOTTOM' | 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT' | 'ISO' | 'SWISO' | 'NEISO' | 'NWISO'

export const VIEW_NAMES: ViewName[] = ['TOP', 'BOTTOM', 'FRONT', 'BACK', 'LEFT', 'RIGHT', 'ISO', 'SWISO', 'NEISO', 'NWISO']

/** Azimut del observador de cada isométrica (SE, SW, NE, NW), elevación atan(1/√2). */
export const ISO_AZ: Partial<Record<ViewName, number>> = {
  ISO: -Math.PI / 4,
  SWISO: (-3 * Math.PI) / 4,
  NEISO: Math.PI / 4,
  NWISO: (3 * Math.PI) / 4,
}

/** VPORTS 1–4: vista de cada panel (undefined = deja la vista actual; en un layout, planta). */
export const VPORT_VIEWS: Record<number, (ViewName | undefined)[]> = {
  1: [undefined],
  2: ['TOP', 'ISO'],
  3: ['TOP', 'FRONT', 'ISO'],
  4: ['TOP', 'FRONT', 'LEFT', 'ISO'],
}

/** Estilos visuales por viewport, estilo CAD clásico VSCURRENT. */
export type VisualStyle = '2dwireframe' | '3dwireframe' | 'shaded' | 'shadedEdges' | 'hidden'

export const VISUAL_STYLES: VisualStyle[] = ['2dwireframe', '3dwireframe', 'shaded', 'shadedEdges', 'hidden']

export const DEFAULT_VISUAL_STYLE: VisualStyle = 'shadedEdges'

/**
 * Estado de una vista (cámara): objetivo, orientación, alto visible y proyección; `up` = el "arriba" de
 * una vista en planta de una UCS (PLAN). Lo usan el historial de ZOOM Previous y las vistas guardadas.
 */
export interface ViewState {
  target: [number, number, number]
  az: number
  el: number
  radius: number
  mode?: CameraMode
  up?: [number, number, number]
}

/** Vista guardada del dibujo (-VIEW Save): la cámara y, con UCSVIEW = 1, la UCS. */
export interface NamedView {
  name: string
  view: ViewState
  ucs?: { origin: [number, number, number]; xAxis: [number, number, number]; yAxis: [number, number, number] }
}
