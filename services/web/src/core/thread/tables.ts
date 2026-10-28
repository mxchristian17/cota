/**
 * Roscas normalizadas para THREAD: métrica ISO gruesa y fina (ISO 261/724), Whitworth BSW (BS 84), BSP
 * cilíndrica G (ISO 228-1) y trapezoidal ISO (ISO 2904). Diámetros en mm.
 */

export type ThreadSeries = 'M' | 'MF' | 'BSW' | 'BSP' | 'TR'

export const SERIES_LABEL: Record<ThreadSeries, string> = {
  M: 'ISO metric coarse',
  MF: 'ISO metric fine',
  BSW: 'Whitworth BSW',
  BSP: 'BSP (G)',
  TR: 'ISO trapezoidal',
}

/** Una rosca concreta: nominal `d`, paso `pitch` y diámetros de fondo exterior (`d3`) e interior (`D1`). */
export interface ThreadSpec {
  series: ThreadSeries
  /** Designación ISO/IRAM (`M10`, `M10x1,25`, `W 3/8"`, `G 1/2`, `Tr 20x4`). */
  designation: string
  d: number
  pitch: number
  /** Hilos por pulgada (series en pulgadas). */
  tpi?: number
  /** Diámetro de fondo de la rosca exterior (eje). */
  d3: number
  /** Diámetro menor de la rosca interior (agujero). */
  D1: number
}

const COARSE: Array<[number, number]> = [
  [1, 0.25], [1.2, 0.25], [1.4, 0.3], [1.6, 0.35], [1.8, 0.35], [2, 0.4], [2.2, 0.45], [2.5, 0.45], [3, 0.5], [3.5, 0.6],
  [4, 0.7], [4.5, 0.75], [5, 0.8], [6, 1], [7, 1], [8, 1.25], [10, 1.5], [12, 1.75], [14, 2], [16, 2], [18, 2.5], [20, 2.5],
  [22, 2.5], [24, 3], [27, 3], [30, 3.5], [33, 3.5], [36, 4], [39, 4], [42, 4.5], [45, 4.5], [48, 5], [52, 5], [56, 5.5],
  [60, 5.5], [64, 6], [68, 6],
]

/** Paso fino de uso preferente de cada diámetro (el primero que lista ISO 261). */
const FINE: Array<[number, number]> = [
  [1, 0.2], [1.2, 0.2], [1.4, 0.2], [1.6, 0.2], [1.8, 0.2], [2, 0.25], [2.2, 0.25], [2.5, 0.35], [3, 0.35], [3.5, 0.35],
  [4, 0.5], [4.5, 0.5], [5, 0.5], [6, 0.75], [7, 0.75], [8, 1], [10, 1.25], [12, 1.5], [14, 1.5], [16, 1.5], [18, 1.5],
  [20, 1.5], [22, 1.5], [24, 2], [27, 2], [30, 2], [33, 2], [36, 3], [39, 3], [42, 3], [45, 3], [48, 3], [52, 4], [56, 4],
  [60, 4], [64, 4], [68, 4],
]

/** [tamaño en pulgadas, hilos por pulgada, diámetro mayor mm]. */
const BSW: Array<[string, number, number]> = [
  ['1/8', 40, 3.175], ['3/16', 24, 4.763], ['1/4', 20, 6.35], ['5/16', 18, 7.938], ['3/8', 16, 9.525], ['7/16', 14, 11.113],
  ['1/2', 12, 12.7], ['9/16', 12, 14.288], ['5/8', 11, 15.875], ['3/4', 10, 19.05], ['7/8', 9, 22.225], ['1', 8, 25.4],
  ['1 1/8', 7, 28.575], ['1 1/4', 7, 31.75], ['1 1/2', 6, 38.1], ['1 3/4', 5, 44.45], ['2', 4.5, 50.8], ['2 1/4', 4, 57.15],
  ['2 1/2', 4, 63.5], ['2 3/4', 3.5, 69.85], ['3', 3.5, 76.2],
]

const BSP: Array<[string, number, number]> = [
  ['1/16', 28, 7.723], ['1/8', 28, 9.728], ['1/4', 19, 13.157], ['3/8', 19, 16.662], ['1/2', 14, 20.955], ['5/8', 14, 22.911],
  ['3/4', 14, 26.441], ['7/8', 14, 30.201], ['1', 11, 33.249], ['1 1/8', 11, 37.897], ['1 1/4', 11, 41.91], ['1 1/2', 11, 47.803],
  ['1 3/4', 11, 53.746], ['2', 11, 59.614], ['2 1/4', 11, 65.71], ['2 1/2', 11, 75.184], ['2 3/4', 11, 81.534], ['3', 11, 87.884],
  ['3 1/2', 11, 100.33], ['4', 11, 113.03], ['4 1/2', 11, 125.73], ['5', 11, 138.43], ['5 1/2', 11, 151.13], ['6', 11, 163.83],
]

/** Trapezoidal ISO 2904: diámetro y paso normal. */
const TRAP: Array<[number, number]> = [
  [8, 1.5], [10, 2], [12, 3], [14, 3], [16, 4], [18, 4], [20, 4], [22, 5], [24, 5], [26, 5], [28, 5], [30, 6], [32, 6], [36, 6],
  [40, 7], [44, 7], [48, 8], [52, 8], [60, 9], [70, 10], [80, 10], [90, 12], [100, 12], [120, 14],
]

/** Número con coma decimal (IRAM), sin ceros de más. */
export const fmtThread = (n: number): string => String(Number(n.toFixed(3))).replace('.', ',')

const r3 = (n: number): number => Number(n.toFixed(3))

function metric(series: 'M' | 'MF', d: number, p: number): ThreadSpec {
  return {
    series,
    designation: series === 'M' ? `M${fmtThread(d)}` : `M${fmtThread(d)}x${fmtThread(p)}`,
    d,
    pitch: p,
    d3: r3(d - 1.226869 * p),
    D1: r3(d - 1.082532 * p),
  }
}

function inch(series: 'BSW' | 'BSP', size: string, tpi: number, d: number): ThreadSpec {
  const p = 25.4 / tpi
  const d1 = r3(d - 1.280654 * p)
  return { series, designation: series === 'BSW' ? `W ${size}"` : `G ${size}`, d, pitch: r3(p), tpi, d3: d1, D1: d1 }
}

/** Huelgo de cresta `ac` de ISO 2904 según el paso. */
const trapClearance = (p: number): number => (p <= 1.5 ? 0.15 : p <= 5 ? 0.25 : p <= 12 ? 0.5 : 1)

function trapezoidal(d: number, p: number): ThreadSpec {
  const h3 = 0.5 * p + trapClearance(p)
  return { series: 'TR', designation: `Tr ${fmtThread(d)}x${fmtThread(p)}`, d, pitch: p, d3: r3(d - 2 * h3), D1: r3(d - p) }
}

export const THREADS: Record<ThreadSeries, ThreadSpec[]> = {
  M: COARSE.map(([d, p]) => metric('M', d, p)),
  MF: FINE.map(([d, p]) => metric('MF', d, p)),
  BSW: BSW.map(([s, t, d]) => inch('BSW', s, t, d)),
  BSP: BSP.map(([s, t, d]) => inch('BSP', s, t, d)),
  TR: TRAP.map(([d, p]) => trapezoidal(d, p)),
}

export const SERIES_ORDER: ThreadSeries[] = ['M', 'MF', 'BSW', 'BSP', 'TR']

/**
 * La rosca más próxima de cada serie al diámetro `dia`: en un eje (`internal = false`) se compara con el
 * nominal; en un agujero, con el diámetro menor D1 (el agujero es el diámetro de la broca).
 */
export function nearestThreads(dia: number, internal: boolean): ThreadSpec[] {
  const key = (t: ThreadSpec) => (internal ? t.D1 : t.d)
  return SERIES_ORDER.map((s) => THREADS[s].reduce((best, t) => (Math.abs(key(t) - dia) < Math.abs(key(best) - dia) ? t : best)))
}

/**
 * Opción por defecto: la más próxima de la lista, salvo que la métrica gruesa (la primera) quede a menos del
 * 2 % del diámetro: entonces ésa, que es la de uso general.
 */
export function closestIndex(list: ThreadSpec[], dia: number, internal: boolean): number {
  if (list.length && Math.abs((internal ? list[0].D1 : list[0].d) - dia) <= 0.02 * dia + 1e-9) return 0
  let best = 0
  list.forEach((t, i) => {
    const k = internal ? t.D1 : t.d
    const kb = internal ? list[best].D1 : list[best].d
    if (Math.abs(k - dia) < Math.abs(kb - dia) - 1e-9) best = i
  })
  return best
}

/** Profundidad de la rosca (radial) de un lado: eje = (d − d3)/2, agujero = (d − D1)/2. */
export const threadDepth = (t: ThreadSpec, internal: boolean): number => (t.d - (internal ? t.D1 : t.d3)) / 2

/** Separación mínima entre la línea gruesa y la fina en el papel (ISO 6410). */
export const MIN_THREAD_GAP_MM = 0.7

/** Datos de la rosca guardados en su arco (2D) o en el sólido (3D). */
export interface ThreadInfo {
  series: ThreadSeries
  designation: string
  d: number
  pitch: number
  internal: boolean
}

export const threadInfo = (t: ThreadSpec, internal: boolean): ThreadInfo => ({ series: t.series, designation: t.designation, d: t.d, pitch: t.pitch, internal })
