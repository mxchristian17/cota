import type { CameraState } from './Viewport'
import type { Ucs } from '../core/ucs'

/**
 * Vistas que sobreviven al desmontaje de los paneles (ir a un layout y volver) y que se guardan con el dibujo.
 * `paneState`: cámara y UCS de cada panel del modelo, por clave "<cantidad de paneles>-<índice>".
 * `paperCams`: la vista del papel de cada layout (por id).
 */
export const paneState = new Map<string, { cam: CameraState; ucs: Ucs }>()
export const paperCams = new Map<string, CameraState>()

export const paneKeyOf = (layout: number, i: number): string => `${layout}-${i}`
