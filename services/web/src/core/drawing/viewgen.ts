import type { ViewName } from '../view'

/** Vistas que puede generar VIEWGEN: las seis caras y las cuatro isométricas. */
export type GenView = 'TOP' | 'BOTTOM' | 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT' | 'ISO' | 'SWISO' | 'NEISO' | 'NWISO'
export const ISO_VIEWS: GenView[] = ['ISO', 'SWISO', 'NEISO', 'NWISO']

export interface ViewGenChoice {
  views: GenView[]
  /** Disposición: ISO-E (primer diedro, por defecto) o ISO-A (tercer diedro). */
  std: 'E' | 'A'
  /** Con líneas ocultas (a trazos) en las vistas ortogonales. */
  hidden: boolean
}

export const DEFAULT_VIEWGEN: ViewGenChoice = { views: ['FRONT', 'TOP', 'LEFT', 'ISO'], std: 'E', hidden: true }

export interface Placed {
  view: GenView
  /** Centro relativo al del alzado (FRONT), en unidades de la vista a escala 1. */
  x: number
  y: number
  /** Alineación con el alzado: vertical (misma x), horizontal (misma y) o libre (isométricas). */
  align: 'v' | 'h' | 'free'
}

/**
 * Disposición de Monge alrededor del alzado. ISO-E: la planta (TOP) debajo, la vista inferior arriba, la izquierda
 * a la derecha, la derecha a la izquierda y la posterior a continuación de la izquierda. ISO-A: al revés (planta
 * arriba, derecha a la derecha, posterior a continuación de la derecha). Las isométricas van en las esquinas libres
 * de la cruz: SE arriba a la derecha, SW arriba a la izquierda, NE abajo a la derecha, NW abajo a la izquierda.
 */
export function mongeLayout(choice: ViewGenChoice, size: (v: GenView) => { w: number; h: number }, gap: number): Placed[] {
  const has = (v: GenView) => choice.views.includes(v)
  const f = size('FRONT')
  const out: Placed[] = [{ view: 'FRONT', x: 0, y: 0, align: 'free' }]
  const e = choice.std === 'E'
  const above: GenView = e ? 'BOTTOM' : 'TOP'
  const below: GenView = e ? 'TOP' : 'BOTTOM'
  const onLeft: GenView = e ? 'RIGHT' : 'LEFT'
  const onRight: GenView = e ? 'LEFT' : 'RIGHT'
  let top = f.h / 2
  let bottom = -f.h / 2
  let left = -f.w / 2
  let right = f.w / 2
  if (has(above)) {
    const s = size(above)
    out.push({ view: above, x: 0, y: f.h / 2 + gap + s.h / 2, align: 'v' })
  }
  if (has(below)) {
    const s = size(below)
    out.push({ view: below, x: 0, y: -(f.h / 2 + gap + s.h / 2), align: 'v' })
  }
  if (has(onLeft)) {
    const s = size(onLeft)
    out.push({ view: onLeft, x: -(f.w / 2 + gap + s.w / 2), y: 0, align: 'h' })
  }
  let x = f.w / 2
  for (const v of [onRight, 'BACK'] as GenView[]) {
    if (!has(v)) continue
    const s = size(v)
    out.push({ view: v, x: x + gap + s.w / 2, y: 0, align: 'h' })
    x += gap + s.w
  }
  for (const p of out) {
    const s = size(p.view)
    top = Math.max(top, p.y + s.h / 2)
    bottom = Math.min(bottom, p.y - s.h / 2)
    left = Math.min(left, p.x - s.w / 2)
    right = Math.max(right, p.x + s.w / 2)
  }
  // Isométricas: en la fila de arriba/abajo y la columna izquierda/derecha de la cruz (o pegadas al alzado).
  const colR = has(onRight) ? f.w / 2 + gap + size(onRight).w / 2 : null
  const colL = has(onLeft) ? -(f.w / 2 + gap + size(onLeft).w / 2) : null
  const rowT = has(above) ? f.h / 2 + gap + size(above).h / 2 : null
  const rowB = has(below) ? -(f.h / 2 + gap + size(below).h / 2) : null
  const corner: Record<string, [number, number]> = { ISO: [1, 1], SWISO: [-1, 1], NEISO: [1, -1], NWISO: [-1, -1] }
  // Cada isométrica va a su esquina, salvo que esa esquina agrande la lámina y haya otra libre dentro de la cruz
  // (en ISO-E con planta y lateral izquierda, la SE va abajo a la derecha, junto a la planta).
  const inside = ([sx, sy]: [number, number]) => (sx > 0 ? colR : colL) !== null && (sy > 0 ? rowT : rowB) !== null
  const taken = new Set<string>()
  for (const v of ISO_VIEWS) {
    if (!has(v)) continue
    const s = size(v)
    const [nx, ny] = corner[v]
    const options: Array<[number, number]> = [[nx, ny], [nx, -ny], [-nx, ny], [-nx, -ny]]
    const [sx, sy] = options.find((c) => inside(c) && !taken.has(String(c))) ?? options.find((c) => !taken.has(String(c))) ?? corner[v]
    taken.add(String([sx, sy]))
    const cx = sx > 0 ? (colR ?? f.w / 2 + gap + s.w / 2) : (colL ?? -(f.w / 2 + gap + s.w / 2))
    const cy = sy > 0 ? (rowT ?? f.h / 2 + gap + s.h / 2) : (rowB ?? -(f.h / 2 + gap + s.h / 2))
    out.push({ view: v, x: cx, y: cy, align: 'free' })
  }
  return out
}

/** Extensión total de una disposición (para elegir la escala). */
export function layoutExtent(placed: Placed[], size: (v: GenView) => { w: number; h: number }): { w: number; h: number; cx: number; cy: number } {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const p of placed) {
    const s = size(p.view)
    x0 = Math.min(x0, p.x - s.w / 2)
    x1 = Math.max(x1, p.x + s.w / 2)
    y0 = Math.min(y0, p.y - s.h / 2)
    y1 = Math.max(y1, p.y + s.h / 2)
  }
  return { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
}

export const asViewName = (v: GenView): ViewName => v as ViewName
