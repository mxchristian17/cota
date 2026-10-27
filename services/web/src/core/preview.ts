import type { Pt, Vec3 } from './math'

/** Formas temporales de previsualización (rubber-band) mientras se ejecuta un comando. */
export type PreviewShape =
  | { kind: 'line'; a: Pt; b: Pt }
  | { kind: 'circle'; center: Pt; radius: number; normal?: Vec3 }
  | { kind: 'polyline'; points: Pt[] }

/**
 * Candidatos para el color del rubber-band, en orden de preferencia: amarillo (el del CAD clásico) y
 * cian como alterno cuando el amarillo se confundiría con la capa actual o con el fondo.
 */
export const PREVIEW_COLORS = [0xffcc00, 0x00ffff, 0xff00ff] as const

type Rgb = readonly [number, number, number]

function toRgb(color: string | number): Rgb {
  if (typeof color === 'number') return [(color >> 16) & 255, (color >> 8) & 255, color & 255]
  const h = color.trim().replace('#', '')
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h.padEnd(6, '0').slice(0, 6)
  const n = parseInt(full, 16)
  return Number.isNaN(n) ? [255, 255, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Distancia perceptual aproximada (0 = idénticos, 1 = opuestos); pesos clásicos de luminancia. */
function colorDistance(a: Rgb, b: Rgb): number {
  const dr = (a[0] - b[0]) / 255
  const dg = (a[1] - b[1]) / 255
  const db = (a[2] - b[2]) / 255
  return Math.sqrt((2 * dr * dr + 4 * dg * dg + 3 * db * db) / 9)
}

let lastKey = ''
let lastColor: number = PREVIEW_COLORS[0]

/**
 * Elige el color del rubber-band: el primer candidato que se distinga **tanto** del color de la capa
 * actual como del fondo; si ninguno llega al umbral, el que maximice la distancia mínima a ambos.
 * Memoiza la última combinación (el provider del viewport lo consulta en cada frame).
 */
export function pickPreviewColor(layerColor: string | number, background: string | number): number {
  const key = `${layerColor}|${background}`
  if (key === lastKey) return lastColor
  const layer = toRgb(layerColor)
  const bg = toRgb(background)
  let best: number = PREVIEW_COLORS[0]
  let bestScore = -1
  for (const candidate of PREVIEW_COLORS) {
    const rgb = toRgb(candidate)
    const score = Math.min(colorDistance(rgb, layer), colorDistance(rgb, bg))
    if (score >= 0.25) {
      best = candidate
      break
    }
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  lastKey = key
  lastColor = best
  return best
}

/**
 * Restringe un punto a UNO de los ejes (X, Y o Z) respecto a `base` (modo ORTHO), eligiendo el eje
 * con mayor delta — como en el CAD clásico, que en 3D incluye el eje vertical. Trabaja en el sistema en que
 * se le pasen los puntos (el motor lo aplica en coordenadas de UCS).
 */
export function constrainOrtho(base: Pt, p: Pt): Pt {
  const dx = p.x - base.x
  const dy = p.y - base.y
  const dz = p.z - base.z
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  const az = Math.abs(dz)
  if (ax >= ay && ax >= az) return { x: p.x, y: base.y, z: base.z }
  if (ay >= az) return { x: base.x, y: p.y, z: base.z }
  return { x: base.x, y: base.y, z: p.z }
}
