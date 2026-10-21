import { ISO_AZ, type ViewName } from './view'

/**
 * Cubo desplegado en Monge: las seis caras como las vistas de un plano, dispuestas según el método de
 * proyección. Es el cubo de navegación de la app.
 *
 * - **ISO-E** (primer diedro, europeo, predeterminado): la planta va DEBAJO del alzado, la vista izquierda a la
 *   DERECHA, la derecha a la IZQUIERDA y la posterior a la derecha de la izquierda.
 * - **ISO-A** (tercer diedro, americano): la planta va ARRIBA, la derecha a la derecha, la izquierda a la izquierda.
 *
 * Cada celda tiene ejes propios (`u` a la derecha, `v` hacia arriba, en el mundo) elegidos para que las aristas
 * compartidas en el desplegado sean aristas reales del cubo: así el punto de la cámara pasa de una celda a la
 * vecina sin saltos al orbitar. Mundo: X este, Y norte, Z arriba (FRONT mira desde −Y, como `CameraController`).
 */

export type ProjStd = 'E' | 'A'
export type FaceName = 'TOP' | 'BOTTOM' | 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT'
export type V3 = [number, number, number]
export type Side = 'left' | 'right' | 'top' | 'bottom'

export interface NetCell {
  face: FaceName
  col: number
  row: number
  /** Normal exterior de la cara (dirección desde la que se ve esa vista). */
  n: V3
  /** Derecha de la celda, en el mundo. */
  u: V3
  /** Arriba de la celda, en el mundo. */
  v: V3
}

export const NET_COLS = 4
export const NET_ROWS = 3

const X: V3 = [1, 0, 0]
const Y: V3 = [0, 1, 0]
const Z: V3 = [0, 0, 1]
const neg = (a: V3): V3 => [-a[0], -a[1], -a[2]]
const add = (...vs: V3[]): V3 => vs.reduce<V3>((s, a) => [s[0] + a[0], s[1] + a[1], s[2] + a[2]], [0, 0, 0])
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const unit = (a: V3): V3 => {
  const L = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / L, a[1] / L, a[2] / L]
}

const NETS: Record<ProjStd, NetCell[]> = {
  A: [
    { face: 'LEFT', col: 0, row: 1, n: neg(X), u: neg(Y), v: Z },
    { face: 'FRONT', col: 1, row: 1, n: neg(Y), u: X, v: Z },
    { face: 'RIGHT', col: 2, row: 1, n: X, u: Y, v: Z },
    { face: 'BACK', col: 3, row: 1, n: Y, u: neg(X), v: Z },
    { face: 'TOP', col: 1, row: 0, n: Z, u: X, v: Y },
    { face: 'BOTTOM', col: 1, row: 2, n: neg(Z), u: X, v: neg(Y) },
  ],
  // El desplegado A girado 180° alrededor del alzado, con la posterior pegada a la vista izquierda.
  E: [
    { face: 'RIGHT', col: 0, row: 1, n: X, u: neg(Y), v: neg(Z) },
    { face: 'FRONT', col: 1, row: 1, n: neg(Y), u: neg(X), v: neg(Z) },
    { face: 'LEFT', col: 2, row: 1, n: neg(X), u: Y, v: neg(Z) },
    { face: 'BACK', col: 3, row: 1, n: Y, u: X, v: neg(Z) },
    { face: 'BOTTOM', col: 1, row: 0, n: neg(Z), u: neg(X), v: Y },
    { face: 'TOP', col: 1, row: 2, n: Z, u: neg(X), v: neg(Y) },
  ],
}

export const netCells = (std: ProjStd): NetCell[] => NETS[std]

/** Dirección hacia el observador (objetivo → ojo) de un azimut y una elevación, como `CameraController`. */
export function eyeDir(az: number, el: number): V3 {
  const ce = Math.cos(el)
  return [ce * Math.cos(az), ce * Math.sin(az), Math.sin(el)]
}

export function dirToAzEl(d: V3): { az: number; el: number } {
  const u = unit(d)
  const el = Math.asin(Math.max(-1, Math.min(1, u[2])))
  // En los polos el azimut no está definido: se usa el de la planta (mirando con el norte arriba).
  const az = Math.abs(u[2]) > 1 - 1e-9 ? -Math.PI / 2 : Math.atan2(u[1], u[0])
  return { az, el }
}

/** Vector del lado de una celda, en el mundo. */
export const sideVec = (c: NetCell, s: Side): V3 => (s === 'left' ? neg(c.u) : s === 'right' ? c.u : s === 'top' ? c.v : neg(c.v))

const FACE_OF: Array<[V3, FaceName]> = [
  [X, 'RIGHT'],
  [neg(X), 'LEFT'],
  [Y, 'BACK'],
  [neg(Y), 'FRONT'],
  [Z, 'TOP'],
  [neg(Z), 'BOTTOM'],
]
/** Cara cuya normal es el eje `a` (vector unitario de un eje). */
export const faceOfAxis = (a: V3): FaceName => FACE_OF.find(([n]) => dot(n, a) > 0.5)![1]

/** Cara vecina en el cubo por el lado `s` de la celda. */
export const neighborFace = (c: NetCell, s: Side): FaceName => faceOfAxis(sideVec(c, s))

/** Dirección de vista de la arista del lado `s` de la celda (entre su cara y la vecina). */
export const edgeDir = (c: NetCell, s: Side): V3 => unit(add(c.n, sideVec(c, s)))

/** Dirección de vista de una esquina de la celda (`sx` −1 izquierda / 1 derecha, `sy` −1 abajo / 1 arriba). */
export const cornerDir = (c: NetCell, sx: -1 | 1, sy: -1 | 1): V3 =>
  unit(add(c.n, sx > 0 ? c.u : neg(c.u), sy > 0 ? c.v : neg(c.v)))

/**
 * Punto de la cámara sobre el desplegado, en celdas (x hacia la derecha, y hacia abajo): la dirección del ojo
 * corta la cara dominante del cubo y ese punto se ubica dentro de su celda.
 */
export function cameraOnNet(az: number, el: number, std: ProjStd): { x: number; y: number; face: FaceName } {
  const e = eyeDir(az, el)
  const cells = netCells(std)
  let best = cells[0]
  for (const c of cells) if (dot(e, c.n) > dot(e, best.n)) best = c
  const k = dot(e, best.n) || 1
  const a = Math.max(-1, Math.min(1, dot(e, best.u) / k))
  const b = Math.max(-1, Math.min(1, dot(e, best.v) / k))
  return { x: best.col + 0.5 + a / 2, y: best.row + 0.5 - b / 2, face: best.face }
}

const ISO_EL = Math.atan(1 / Math.SQRT2)
const sameAngle = (a: number, b: number): boolean => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-6

/** Isométrica estándar (ISO, SWISO, NEISO, NWISO) de una dirección de esquina superior, o null. */
export function isoNameOf(d: V3): ViewName | null {
  const { az, el } = dirToAzEl(d)
  if (Math.abs(el - ISO_EL) > 1e-6) return null
  return ((Object.keys(ISO_AZ) as ViewName[]).find((n) => sameAngle(ISO_AZ[n]!, az)) ?? null) as ViewName | null
}

const ORDER: FaceName[] = ['TOP', 'BOTTOM', 'FRONT', 'BACK', 'LEFT', 'RIGHT']
/** Nombre de una arista por sus dos caras, en orden fijo (TOP·FRONT, FRONT·RIGHT…). */
export const edgeName = (a: FaceName, b: FaceName): string =>
  [a, b].sort((p, q) => ORDER.indexOf(p) - ORDER.indexOf(q)).join('·')

/** Nombre de una esquina por sus tres caras (TOP·FRONT·RIGHT…). */
export function cornerName(d: V3): string {
  const faces = FACE_OF.filter(([n]) => dot(n, d) > 0.3).map(([, f]) => f)
  return faces.sort((p, q) => ORDER.indexOf(p) - ORDER.indexOf(q)).join('·')
}

/** ¿La cámara mira exactamente en esa dirección? (para resaltar la cara, arista o esquina activa). */
export const looksAlong = (az: number, el: number, d: V3): boolean => dot(eyeDir(az, el), unit(d)) > 1 - 1e-6
