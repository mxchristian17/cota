import type { Vec3 } from '../math'
import type { ViewportProps } from '../document/types'
import { ISO_AZ, VIEW_NAMES, type ViewName } from '../view'
import { paperPerModel, unitToMm } from './scale'

const ISO_EL = Math.atan(1 / Math.SQRT2)
const EL_LIMIT = 1.5533 // mismo umbral que CameraController: por encima, el "arriba" de pantalla es +Y

/** Azimut/elevación de las vistas estándar (idénticas a `CameraController.setView`). */
export function viewAngles(name: ViewName): { az: number; el: number } {
  switch (name) {
    case 'TOP':
      return { az: -Math.PI / 2, el: Math.PI / 2 }
    case 'BOTTOM':
      return { az: -Math.PI / 2, el: -Math.PI / 2 }
    case 'FRONT':
      return { az: -Math.PI / 2, el: 0 }
    case 'BACK':
      return { az: Math.PI / 2, el: 0 }
    case 'RIGHT':
      return { az: 0, el: 0 }
    case 'LEFT':
      return { az: Math.PI, el: 0 }
    case 'ISO':
    case 'SWISO':
    case 'NEISO':
    case 'NWISO':
      return { az: ISO_AZ[name]!, el: ISO_EL }
  }
}

const VIEW_ORDER: ViewName[] = VIEW_NAMES

/** Vista estándar que corresponde a az/el, o undefined si es una vista libre (órbita). */
export function viewNameOf(az: number, el: number): ViewName | undefined {
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
  return VIEW_ORDER.find((n) => {
    const v = viewAngles(n)
    return Math.abs(wrap(v.az - az)) < 1e-6 && Math.abs(v.el - el) < 1e-6
  })
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * Base de la vista (la misma que arma `THREE.Camera.lookAt` en `CameraController`): `right`/`up` de
 * pantalla y `out`, desde el objetivo hacia la cámara.
 */
export function viewBasis(az: number, el: number): { right: Vec3; up: Vec3; out: Vec3 } {
  const ce = Math.cos(el)
  const out: Vec3 = [ce * Math.cos(az), ce * Math.sin(az), Math.sin(el)]
  const worldUp: Vec3 = Math.abs(el) > EL_LIMIT ? [0, 1, 0] : [0, 0, 1]
  const right = unit(cross(worldUp, out))
  return { right, up: cross(out, right), out }
}

/** Proyecta un punto del modelo al papel (mm) a través del viewport (proyección paralela). */
export function modelToPaper(p: Vec3, vp: ViewportProps, units: string): [number, number] {
  const { right, up } = viewBasis(vp.az, vp.el)
  const k = paperPerModel(vp.scale, units)
  const d: Vec3 = [p[0] - vp.target[0], p[1] - vp.target[1], p[2] - vp.target[2]]
  return [vp.center[0] + dot(d, right) * k, vp.center[1] + dot(d, up) * k]
}

/** Alto del modelo (unidades) visible en el viewport: lo que encuadra su cámara ortográfica. */
export function modelViewHeight(vp: Pick<ViewportProps, 'height' | 'scale'>, units: string): number {
  return vp.height / paperPerModel(vp.scale, units)
}

/**
 * Encuadra una caja del modelo en el viewport (MVIEW Fit / extensiones): centra el objetivo y elige la
 * escala que la hace entrar con un margen `pad`. Sin caja → 1:1 en el origen.
 */
export function fitViewport(
  box: { min: Vec3; max: Vec3 } | null,
  vp: Pick<ViewportProps, 'width' | 'height' | 'az' | 'el'>,
  units: string,
  pad = 1.05,
): { target: Vec3; scale: number } {
  if (!box) return { target: [0, 0, 0], scale: 1 }
  const { right, up } = viewBasis(vp.az, vp.el)
  const c: Vec3 = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2]
  let ex = 0
  let ey = 0
  for (let i = 0; i < 8; i++) {
    const q: Vec3 = [
      (i & 1 ? box.max[0] : box.min[0]) - c[0],
      (i & 2 ? box.max[1] : box.min[1]) - c[1],
      (i & 4 ? box.max[2] : box.min[2]) - c[2],
    ]
    ex = Math.max(ex, Math.abs(dot(q, right)))
    ey = Math.max(ey, Math.abs(dot(q, up)))
  }
  if (ex < 1e-9 && ey < 1e-9) return { target: c, scale: 1 }
  // mm de papel por unidad de modelo que hacen entrar la caja en ambos sentidos
  const kx = ex < 1e-9 ? Infinity : vp.width / (2 * ex * pad)
  const ky = ey < 1e-9 ? Infinity : vp.height / (2 * ey * pad)
  return { target: c, scale: Math.min(kx, ky) / unitToMm(units) }
}

/** Viewport nuevo con valores por defecto (vista TOP 1:1, encendido, sin bloquear). */
export function newViewportProps(center: Vec3, width: number, height: number): ViewportProps {
  const { az, el } = viewAngles('TOP')
  return {
    center,
    width,
    height,
    target: [0, 0, 0],
    az,
    el,
    scale: 1,
    locked: false,
    on: true,
    visualStyle: '2dwireframe',
    shadePlot: 'asDisplayed',
    frozenLayers: [],
  }
}

/** Esquinas del rectángulo del viewport en el papel (antihorario desde abajo-izquierda). */
export function viewportCorners(vp: Pick<ViewportProps, 'center' | 'width' | 'height'>): [number, number][] {
  const [cx, cy] = vp.center
  const hw = vp.width / 2
  const hh = vp.height / 2
  return [
    [cx - hw, cy - hh],
    [cx + hw, cy - hh],
    [cx + hw, cy + hh],
    [cx - hw, cy + hh],
  ]
}

/** Contorno cerrado del viewport en el papel (polígono de recorte o rectángulo), z = 0. */
export function viewportRing(vp: Pick<ViewportProps, 'center' | 'width' | 'height' | 'clip'>): Vec3[] {
  const pts = vp.clip && vp.clip.length >= 3 ? vp.clip : viewportCorners(vp)
  const ring = pts.map(([x, y]): Vec3 => [x, y, 0])
  return [...ring, ring[0]]
}

/**
 * Lleva el marco del viewport a la caja `[minX, minY, maxX, maxY]` del papel sin mover el modelo en la
 * hoja: el objetivo se corre lo mismo que el centro (convertido a unidades de modelo).
 */
export function refitViewport(vp: ViewportProps, box: [number, number, number, number], units: string): void {
  const [minX, minY, maxX, maxY] = box
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const k = paperPerModel(vp.scale, units)
  const { right, up } = viewBasis(vp.az, vp.el)
  const dx = (cx - vp.center[0]) / k
  const dy = (cy - vp.center[1]) / k
  vp.target = [0, 1, 2].map((i) => vp.target[i] + right[i] * dx + up[i] * dy) as Vec3
  vp.center = [cx, cy, 0]
  vp.width = Math.max(1e-3, maxX - minX)
  vp.height = Math.max(1e-3, maxY - minY)
}

/** Caja de un contorno del papel. */
function ringBox(ring: [number, number][]): [number, number, number, number] {
  const xs = ring.map((p) => p[0])
  const ys = ring.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/**
 * VPCLIP: fija el contorno de recorte (el marco pasa a ser su caja) o lo quita (`null`: queda el
 * rectángulo de esa caja). La vista del modelo no se mueve en el papel.
 */
export function setViewportClip(vp: ViewportProps, ring: [number, number][] | null, units: string): void {
  if (ring) {
    refitViewport(vp, ringBox(ring), units)
    vp.clip = ring.map(([x, y]) => [x, y])
  } else if (vp.clip) {
    refitViewport(vp, ringBox(vp.clip), units)
    delete vp.clip
  }
}

/**
 * Tras mover un vértice del recorte (grip), el marco se agranda/achica simétrico respecto del centro
 * para seguir cubriendo el contorno (el centro y el objetivo no cambian: no hace falta conocer unidades).
 */
export function coverClip(vp: ViewportProps): void {
  if (!vp.clip?.length) return
  const [cx, cy] = vp.center
  vp.width = Math.max(1e-3, 2 * Math.max(...vp.clip.map(([x]) => Math.abs(x - cx))))
  vp.height = Math.max(1e-3, 2 * Math.max(...vp.clip.map(([, y]) => Math.abs(y - cy))))
}
