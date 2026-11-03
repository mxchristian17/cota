import { decodeTextCodes } from '../text/codes'
import type { Vec3 } from '../math'
import type { EntityProps, EntityType, ImageProps } from '../document/types'

/**
 * Entidades de DWG/DXF que Cota dibuja con sus piezas simples: multilíneas, multidirectrices, tolerancias geométricas,
 * marcos de imágenes y de referencias externas. Lo que se ve es lo mismo (salvo lo que se avisa al abrir), y al exportar
 * sale como esas piezas.
 */
type Codes = Array<[number, string]>
export interface Piece {
  type: EntityType
  props: EntityProps
}

const num = (c: Codes, code: number, def = 0): number => {
  const f = c.find((x) => x[0] === code)
  return f ? Number(f[1]) : def
}
const str = (c: Codes, code: number): string | undefined => c.find((x) => x[0] === code)?.[1].trim()
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a)
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [1, 0, 0]
}
const point = (c: Codes, i: number): Vec3 => [
  Number(c[i][1]),
  c[i + 1]?.[0] === c[i][0] + 10 ? Number(c[i + 1][1]) : 0,
  c[i + 2]?.[0] === c[i][0] + 20 ? Number(c[i + 2][1]) : 0,
]
const pointOf = (c: Codes, code: number): Vec3 => {
  const i = c.findIndex((x) => x[0] === code)
  return i >= 0 ? point(c, i) : [0, 0, 0]
}

const line = (start: Vec3, end: Vec3): Piece => ({ type: 'LINE', props: { start, end } })
const polyline = (vertices: Vec3[], closed = false): Piece => ({ type: 'POLYLINE', props: { vertices, closed } })
const text = (position: Vec3, value: string, height: number, rotation = 0, normal: Vec3 = [0, 0, 1], justify: 'left' | 'center' = 'left'): Piece => ({
  type: 'TEXT',
  props: { position, text: value, height, rotation, justify, normal, kind: 'text' },
})

/** XLINE / RAY: punto (10) y dirección (11). Son una LINE que se prolonga (`extend`), así se editan como cualquier línea. */
export function infiniteLine(c: Codes, extend: 'both' | 'end'): Piece {
  const start = pointOf(c, 10)
  return { type: 'LINE', props: { start, end: add(start, unit(pointOf(c, 11))), extend } }
}

/**
 * MLINE: cada vértice (11) trae la dirección del tramo (12), la del inglete (13) y, por elemento, su lista de parámetros
 * (74 = cuántos, 41 = valores): el primero es la distancia sobre el inglete y el segundo, sobre el tramo. Cada elemento
 * es una polilínea (sin las tapas del estilo, que el archivo no trae en la entidad).
 */
export function mline(c: Codes): Piece[] {
  const closed = (num(c, 71, 1) & 2) !== 0
  const nElems = num(c, 73, 0)
  const paths: Vec3[][] = Array.from({ length: nElems }, () => [])
  for (let i = 0; i < c.length; i++) {
    if (c[i][0] !== 11) continue
    const v = point(c, i)
    const iDir = c.findIndex((x, k) => k > i && x[0] === 12)
    const iMit = c.findIndex((x, k) => k > i && x[0] === 13)
    if (iDir < 0 || iMit < 0) break
    const dir = point(c, iDir)
    const mit = point(c, iMit)
    let k = iMit + 3
    for (let el = 0; el < nElems; el++) {
      while (k < c.length && c[k][0] !== 74 && c[k][0] !== 11) k++
      if (k >= c.length || c[k][0] !== 74) break
      const n = Number(c[k][1])
      const params: number[] = []
      for (let j = k + 1; j < c.length && params.length < n && c[j][0] === 41; j++) params.push(Number(c[j][1]))
      paths[el].push(add(add(v, mit, params[0] ?? 0), dir, params[1] ?? 0))
      k++
    }
  }
  return paths.filter((p) => p.length >= 2).map((p) => polyline(p, closed))
}

/** Flecha rellena en la punta `tip` de un tramo que viene de `from`. */
export function arrow(tip: Vec3, from: Vec3, size: number): Piece | null {
  if (!(size > 0) || Math.hypot(...sub(from, tip)) < 1e-9) return null
  const d = unit(sub(from, tip))
  const n = unit(cross([0, 0, 1], d))
  const base = add(tip, d, size)
  const ring = [tip, add(base, n, size / 6), add(base, n, -size / 6)]
  return { type: 'HATCH', props: { loops: [{ vertices: ring }], pattern: 'SOLID', scale: 1, angle: 0, origin: tip, island: 'outer' } as EntityProps }
}

/**
 * MULTILEADER: dentro de CONTEXT_DATA, el texto (304) con su punto (12) y alto (41), el tamaño de flecha (140) y cada
 * LEADER{…}: el punto de conexión (10) y sus LEADER_LINE{…} con los vértices (10) desde la flecha.
 */
export function multileader(c: Codes, plainText: (raw: string) => string): Piece[] {
  const out: Piece[] = []
  const open = c.findIndex(([k, v]) => k === 300 && v.trim() === 'CONTEXT_DATA{')
  const end = c.findIndex(([k, v], i) => i > open && k === 301 && v.trim() === '}')
  const ctx = open >= 0 ? c.slice(open + 1, end > open ? end : c.length) : c
  const size = num(ctx, 140, 0)
  for (let i = 0; i < ctx.length; i++) {
    if (ctx[i][0] !== 302) continue
    const close = ctx.findIndex(([k], j) => j > i && k === 303)
    const root = ctx.slice(i + 1, close > i ? close : ctx.length)
    const connection = pointOf(root, 10)
    for (let j = 0; j < root.length; j++) {
      if (root[j][0] !== 304 || root[j][1].trim() !== 'LEADER_LINE{') continue
      const pts: Vec3[] = []
      for (let k = j + 1; k < root.length && root[k][0] !== 305; k++) if (root[k][0] === 10) pts.push(point(root, k))
      pts.push(connection)
      if (pts.length < 2) continue
      out.push(polyline(pts))
      const a = arrow(pts[0], pts[1], size)
      if (a) out.push(a)
    }
    i = close > i ? close : i
  }
  const label = ctx.find(([k, v]) => k === 304 && !v.trim().startsWith('LEADER_LINE'))?.[1]
  if (label !== undefined && label.trim() && label.trim() !== 'LEADER') {
    const height = num(ctx, 41, 2.5)
    const at = pointOf(ctx.slice(0, Math.max(0, ctx.findIndex(([k]) => k === 302))), 12)
    out.push({ type: 'TEXT', props: { position: at, text: decodeTextCodes(plainText(label)), height, rotation: 0, justify: 'left', normal: [0, 0, 1], kind: 'mtext' } })
  }
  return out
}

/** Símbolos de tolerancia geométrica (fuente GDT) dibujados en un cuadrado de 0 a 1: tramos, círculos [cx, cy, r]. */
const GDT: Record<string, { l?: number[][]; c?: number[][] }> = {
  a: { l: [[0.15, 0.2, 0.85, 0.2], [0.15, 0.2, 0.75, 0.8]] }, // angularidad
  b: { l: [[0.15, 0.2, 0.85, 0.2], [0.5, 0.2, 0.5, 0.85]] }, // perpendicularidad
  c: { l: [[0.1, 0.25, 0.7, 0.25], [0.7, 0.25, 0.9, 0.75], [0.9, 0.75, 0.3, 0.75], [0.3, 0.75, 0.1, 0.25]] }, // planitud
  d: { l: [[0.15, 0.25, 0.85, 0.25]], c: [[0.5, 0.25, 0.35]] }, // perfil de superficie
  e: { c: [[0.5, 0.5, 0.33]] }, // circularidad
  f: { l: [[0.3, 0.15, 0.55, 0.85], [0.5, 0.15, 0.75, 0.85]] }, // paralelismo
  g: { c: [[0.5, 0.5, 0.28]], l: [[0.25, 0.1, 0.05, 0.85], [0.95, 0.15, 0.75, 0.9]] }, // cilindricidad
  h: { l: [[0.2, 0.2, 0.75, 0.75], [0.75, 0.75, 0.5, 0.72], [0.75, 0.75, 0.72, 0.5]] }, // alabeo circular
  i: { l: [[0.1, 0.5, 0.9, 0.5], [0.25, 0.3, 0.75, 0.3], [0.25, 0.7, 0.75, 0.7]] }, // simetría
  j: { c: [[0.5, 0.5, 0.27]], l: [[0.1, 0.5, 0.9, 0.5], [0.5, 0.1, 0.5, 0.9]] }, // posición
  k: { c: [[0.5, 0.3, 0.35]] }, // perfil de línea
  r: { c: [[0.5, 0.5, 0.17], [0.5, 0.5, 0.35]] }, // concentricidad
  t: { l: [[0.15, 0.2, 0.6, 0.65], [0.6, 0.65, 0.4, 0.62], [0.6, 0.65, 0.57, 0.45], [0.4, 0.2, 0.85, 0.65], [0.85, 0.65, 0.65, 0.62], [0.85, 0.65, 0.82, 0.45]] }, // alabeo total
}
/** Modificadores de la fuente GDT que se escriben como texto. */
const GDT_TEXT: Record<string, string> = { n: 'Ø', m: '(M)', l: '(L)', s: '(S)', p: '(P)', u: 'ST' }

/**
 * TOLERANCE: 10 = punto medio del lado izquierdo del primer renglón, 11 = eje X, 1 = contenido: renglones (`^J`) de
 * casillas (`%%v`) con los símbolos en fuente GDT (`{\Fgdt;j}`). Sale el marco, los símbolos y los textos.
 */
export function tolerance(c: Codes, height: number): Piece[] {
  const normal: Vec3 = [num(c, 210, 0), num(c, 220, 0), num(c, 230, 1)]
  const u = unit(pointOf(c, 11)[0] || pointOf(c, 11)[1] || pointOf(c, 11)[2] ? pointOf(c, 11) : [1, 0, 0])
  const v = unit(cross(normal, u))
  const o = pointOf(c, 10)
  const at = (x: number, y: number): Vec3 => add(add(o, u, x), v, y)
  const rot = Math.atan2(u[1], u[0])
  const box = height * 2
  const out: Piece[] = []
  const rows = (str(c, 1) ?? '').split(/\^J|\\P/i)
  let top = box / 2
  for (const row of rows) {
    const cells = row.split(/%%v/i).filter((cell, i, all) => cell.length > 0 || (i > 0 && i < all.length - 1 && all.slice(i).some((x) => x.length > 0)))
    if (!cells.length) continue
    let x = 0
    for (const cell of cells) {
      const symbols: string[] = []
      const value = cell.replace(/\{\\Fgdt;([a-z])\}/gi, (_, s: string) => {
        const k = s.toLowerCase()
        if (GDT[k]) {
          symbols.push(k)
          return ''
        }
        return GDT_TEXT[k] ?? ''
      })
      const plain = decodeTextCodes(value.replace(/[{}]/g, '').trim())
      const width = Math.max(box, symbols.length * box + plain.length * height * 0.75 + (plain ? height : 0))
      symbols.forEach((s, i) => {
        const sq = (a: number, b: number): Vec3 => at(x + i * box + a * box, top - box + b * box)
        for (const [ax, ay, bx, by] of GDT[s].l ?? []) out.push(line(sq(ax, ay), sq(bx, by)))
        for (const [cx, cy, r] of GDT[s].c ?? []) out.push({ type: 'CIRCLE', props: { center: sq(cx, cy), radius: r * box, normal } })
      })
      if (plain) out.push(text(at(x + symbols.length * box + height / 2, top - box / 2 - height / 2), plain, height, rot, normal))
      out.push(polyline([at(x, top), at(x + width, top), at(x + width, top - box), at(x, top - box)], true))
      x += width
    }
    top -= box
  }
  return out
}

/** Marco de una imagen (o de un objeto incrustado) con el nombre del archivo: el contenido vive fuera del dibujo. */
function frame(corners: Vec3[], label: string): Piece[] {
  const w = Math.hypot(...sub(corners[1], corners[0]))
  const h = Math.hypot(...sub(corners[3], corners[0]))
  const u = sub(corners[1], corners[0])
  const size = Math.max(Math.min(w, h) / 20, 1e-6)
  const pieces: Piece[] = [polyline(corners, true)]
  if (label) pieces.push(text(add(add(corners[0], [size, size, 0]), [0, 0, 0]), label, size, Math.atan2(u[1], u[0])))
  return pieces
}

/**
 * IMAGE: 10 = esquina, 11/12 = vectores de un píxel, 13/23 = tamaño en píxeles, 340 = definición con el archivo,
 * 280 = recorte activo con su contorno en píxeles (14/24), 283 = desvanecido. Los píxeles viven en el archivo: se
 * adjuntan después (ver `attachImages`).
 */
export function image(c: Codes, files: Map<string, string>): Piece[] {
  const size: [number, number] = [Math.max(1, num(c, 13, 1)), Math.max(1, num(c, 23, 1))]
  const xs = c.filter(([k]) => k === 14).map(([, x]) => Number(x))
  const ys = c.filter(([k]) => k === 24).map(([, y]) => Number(y))
  const clip = num(c, 280, 0) === 1 && xs.length >= 2 ? xs.map((x, i): [number, number] => [x, ys[i] ?? 0]) : undefined
  const fade = num(c, 283, 0)
  const props: ImageProps = { origin: pointOf(c, 10), u: pointOf(c, 11), v: pointOf(c, 12), size, file: files.get((str(c, 340) ?? '').toUpperCase()) ?? '', ...(clip ? { clip } : {}), ...(fade > 0 ? { fade } : {}) }
  return [{ type: 'IMAGE', props }]
}

/** PDFUNDERLAY / DWFUNDERLAY / DGNUNDERLAY: el archivo vive fuera; se marca el punto de inserción con su nombre. */
export function underlay(c: Codes, files: Map<string, string>, kind: string): Piece[] {
  const name = baseName(files.get((str(c, 340) ?? '').toUpperCase()))
  const scale = Math.abs(num(c, 41, 1)) || 1
  const rot = (num(c, 50, 0) * Math.PI) / 180
  return [text(pointOf(c, 10), `[${kind}${name ? `: ${name}` : ''}]`, scale, rot)]
}

/** OLE2FRAME: 10 = esquina superior izquierda, 11 = inferior derecha. */
export function oleFrame(c: Codes): Piece[] {
  const [a, b] = [pointOf(c, 10), pointOf(c, 11)]
  if (Math.hypot(...sub(a, b)) < 1e-9) return []
  return frame([[a[0], b[1], a[2]], [b[0], b[1], a[2]], [b[0], a[1], a[2]], [a[0], a[1], a[2]]], 'OLE')
}

const baseName = (path?: string): string => (path ?? '').split(/[\\/]/).pop() ?? ''

/** Ejes de la vista guardada en un VIEWPORT (dirección hacia el observador, sin giro). */
export function viewBasis(direction: Vec3): { az: number; el: number; right: Vec3; up: Vec3 } {
  const d = unit(direction)
  const plan = Math.hypot(d[0], d[1]) < 1e-9
  const az = plan ? -Math.PI / 2 : Math.atan2(d[1], d[0])
  const el = Math.atan2(d[2], Math.hypot(d[0], d[1]))
  const right: Vec3 = [-Math.sin(az), Math.cos(az), 0]
  return { az, el, right, up: cross(d, right) }
}
