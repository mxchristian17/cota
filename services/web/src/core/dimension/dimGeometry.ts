import type { Vec3 } from '../math'
import type { DimensionProps } from '../document/types'
import { layoutText, textWidth, type Pt2, type Stroke } from '../text/strokeFont'
import { arrowGeometry, isTick } from './arrows'
import { dimTextContent, formatAngle, formatLinear, type DimTextContent } from './format'
import { BUILTIN_DIM_VARS, type ArrowType, type DimVars } from './style'

/**
 * Geometría de las cotas: un único cálculo para pantalla, PDF, snaps y DXF, con las variables
 * del estilo resuelto de la cota (`props.style`): separación/prolongación de referencias, longitud fija,
 * supresiones, `DIMDLE`, posición del texto (`DIMTAD`/`DIMJUST`), alineación con **legibilidad**,
 * `DIMGAP` con corte de la línea de cota, recuadro, lógica de *Fit*, flechas del CAD clásico, marcas de
 * centro y texto vectorial (`core/text/strokeFont`).
 */

// --- Vectores ---
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
const norm = (a: Vec3): Vec3 => {
  const l = len(a)
  return l < 1e-12 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l]
}
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t))
const WORLD_Z: Vec3 = [0, 0, 1]

/** Normal del plano de la cota (hacia el observador); +Z si no tiene. */
const normalOf = (p: DimensionProps): Vec3 => {
  const n = p.normal ? norm(p.normal) : WORLD_Z
  return len(n) < 1e-9 ? WORLD_Z : n
}

/** Proyección de `q` sobre el plano de normal `n` que pasa por `o`. */
const onPlane = (q: Vec3, o: Vec3, n: Vec3): Vec3 => sub(q, scale(n, dot(sub(q, o), n)))

/** Estilo por defecto (compatibilidad: tests y llamadas sin estilo). */
export const DEFAULT_DIM_STYLE: DimVars = { ...BUILTIN_DIM_VARS['IRAM 4513'] }

export interface DimText {
  /** Centro del texto principal. */
  pos: Vec3
  /** Texto principal completo (con prefijos y tolerancia en línea). */
  value: string
  height: number
  /** Dirección de lectura (unitaria, en el plano) y "arriba" del texto. */
  dir: Vec3
  up: Vec3
}

export interface DimDisplay {
  /** Segmentos: líneas de cota y de referencia, líderes, marcas, flechas de trazo, recuadros. */
  lines: [Vec3, Vec3][]
  /** Polígonos rellenos (flechas cerradas, puntos). */
  fills: Vec3[][]
  /** Trazos del texto vectorial, ya en el mundo. */
  textStrokes: Vec3[][]
  /** Texto principal (para el DXF nativo, la paleta y el pick). */
  text: DimText
  /** Rectángulo del texto (4 esquinas) o null si no hay texto. */
  textBox: Vec3[] | null
  /** Normal del plano de la cota. */
  normal: Vec3
  /** Extremos de la línea de cota (cotas lineales/alineadas), para los grips de la línea. */
  handles?: [Vec3, Vec3]
  /** Puntas de las dos flechas (lineales y angulares), para *Flip Arrow*. */
  arrowTips?: [Vec3, Vec3]
  /** Tramos que `DIMBREAK` puede cortar (líneas de cota y de referencia, arcos), antes de los cortes. */
  breakable: [Vec3, Vec3][]
}

export interface DimContext {
  /** Escala de anotación (unidades de dibujo por mm de papel) para estilos anotativos o `DIMSCALE` = 0. */
  annoScale?: number
}

/**
 * Escala de anotación del modelo (`CANNOSCALE` del documento abierto): la que usan las cotas anotativas
 * cuando no se indica otra (selección, snaps, PDF del modelo). Los viewports de layout pasan la suya.
 */
let modelAnnoScale = 1
export function setModelAnnoScale(v: number): void {
  if (v > 0) modelAnnoScale = v
}

/** Factor de tamaño: `DIMSCALE`, o la escala de anotación si el estilo es anotativo (o `DIMSCALE` = 0). */
export function dimScaleFactor(s: DimVars, ctx?: DimContext): number {
  if (s.ANNOTATIVE || !(s.DIMSCALE > 0)) return ctx?.annoScale ?? modelAnnoScale
  return s.DIMSCALE
}

// --- Medida y texto ---

/**
 * Dirección de la línea de una cota lineal en su plano: rotada (`rotation`), horizontal o vertical (se
 * decide por hacia dónde se arrastró la línea de cota, en los ejes del plano: en FRONT, X y Z).
 */
export function linearDir(p: DimensionProps): Vec3 {
  const n = normalOf(p)
  if (p.rotation !== undefined) {
    const [x, y] = planeAxes(n)
    const r = (p.rotation * Math.PI) / 180
    return add(scale(x, Math.cos(r)), scale(y, Math.sin(r)))
  }
  // H/V en los ejes de la UCS con que se creó (`hdir`).
  const [x, y] = dimAxes(p)
  const [a, b] = p.points
  const mid = scale(add(a, b), 0.5)
  const d = sub(p.textPos, mid)
  return Math.abs(dot(d, y)) >= Math.abs(dot(d, x)) ? x : y
}

/** Ejes "horizontal" y "vertical" de un plano con su dirección horizontal `hdir` (grados). */
export function hAxes(n: Vec3, hdir?: number): [Vec3, Vec3] {
  const [x, y] = planeAxes(n)
  if (!hdir) return [x, y]
  const r = (hdir * Math.PI) / 180
  const [c, sn] = [Math.cos(r), Math.sin(r)]
  return [add(scale(x, c), scale(y, sn)), add(scale(x, -sn), scale(y, c))]
}

/** Ejes horizontal/vertical de una cota: los de su plano girados por `hdir`. */
export const dimAxes = (p: DimensionProps): [Vec3, Vec3] => hAxes(normalOf(p), p.hdir)

/** Sector angular de una cota ANGULAR/ARCLEN: centro, dirección inicial, normal y barrido (el que contiene `textPos`). */
export function angularSector(p: DimensionProps): { c: Vec3; s0: Vec3; n: Vec3; sweep: number; v1: Vec3; v2: Vec3 } {
  const [c, a, b] = p.points
  const v1 = norm(sub(a, c))
  const v2 = norm(sub(b, c))
  const view = normalOf(p)
  let n = norm(cross(v1, v2))
  if (len(n) < 1e-9) n = view
  // Plano orientado hacia el observador: así el texto nunca queda espejado.
  if (dot(n, view) < 0) n = scale(n, -1)
  const theta = Math.acos(Math.max(-1, Math.min(1, dot(v1, v2))))
  /** Ángulo antihorario de v1 a v2 visto desde n, en (0, 2π]. */
  const ccwAngle = (): number => {
    let a = Math.atan2(dot(cross(v1, v2), n), dot(v1, v2))
    if (a <= 1e-12) a += Math.PI * 2
    return a
  }
  if (p.angMode === 'arc') return { c, s0: v1, n, sweep: ccwAngle(), v1, v2 }
  if (p.angMode === 'points') {
    // El ángulo de v1 a v2 o el de v2 a v1 (su complemento a 360°): el que contiene el texto.
    const phi = ccwAngle()
    const t = sub(onPlane(p.textPos, c, n), c)
    let at = Math.atan2(dot(t, norm(cross(n, v1))), dot(t, v1))
    if (at < 0) at += Math.PI * 2
    return len(t) < 1e-9 || at <= phi ? { c, s0: v1, n, sweep: phi, v1, v2 } : { c, s0: v2, n, sweep: Math.PI * 2 - phi, v1, v2 }
  }
  if (p.dimType === 'ARCLEN') {
    // El barrido va de v1 a v2 en sentido antihorario visto desde n: si no, se arranca desde v2.
    const ccw = dot(cross(v1, v2), n) >= 0
    return ccw ? { c, s0: v1, n, sweep: theta, v1, v2 } : { c, s0: v2, n, sweep: theta, v1, v2 }
  }
  // El ángulo de `textPos` decide el cuadrante: entre v1 y v2, el opuesto o uno de los suplementarios.
  const t = sub(onPlane(p.textPos, c, n), c)
  // u1 → u2 en sentido antihorario visto desde n (con n hacia el observador puede ser v2 → v1).
  const ccw = dot(cross(v1, v2), n) >= 0
  const u1 = ccw ? v1 : v2
  const u2 = ccw ? v2 : v1
  const e2 = norm(cross(n, u1))
  let at = Math.atan2(dot(t, e2), dot(t, u1))
  if (at < 0) at += Math.PI * 2
  if (len(t) < 1e-9 || at <= theta) return { c, s0: u1, n, sweep: theta, v1, v2 }
  if (at >= Math.PI && at <= Math.PI + theta) return { c, s0: scale(u1, -1), n, sweep: theta, v1, v2 }
  if (at > theta && at < Math.PI) return { c, s0: u2, n, sweep: Math.PI - theta, v1, v2 }
  return { c, s0: scale(u2, -1), n, sweep: Math.PI - theta, v1, v2 }
}

/** Longitudes que mide una cota trans-espacial en unidades del modelo (no ángulos ni ordenadas). */
const TRANS_SCALED = new Set(['LINEAR', 'ALIGNED', 'RADIUS', 'JOGGED', 'DIAMETER', 'ARCLEN'])

/** Valor medido (distancia, ángulo en grados, radio…) según el tipo; las trans-espaciales, en el modelo. */
export function measureDim(p: DimensionProps): number {
  const raw = rawMeasure(p)
  return p.transScale && TRANS_SCALED.has(p.dimType) ? raw * p.transScale : raw
}

function rawMeasure(p: DimensionProps): number {
  const pts = p.points
  switch (p.dimType) {
    case 'LINEAR': {
      const d = linearDir(p)
      return Math.abs(dot(sub(pts[1], pts[0]), d))
    }
    case 'ALIGNED':
      return len(sub(pts[1], pts[0]))
    case 'ANGULAR':
      return (angularSector(p).sweep * 180) / Math.PI
    case 'RADIUS':
    case 'JOGGED':
      return len(sub(pts[1], pts[0]))
    case 'DIAMETER':
      return 2 * len(sub(pts[1], pts[0]))
    case 'ARCLEN': {
      const s = angularSector(p)
      return len(sub(pts[1], pts[0])) * s.sweep
    }
    case 'ORDINATE': {
      // Coordenada en los ejes de la UCS de la cota: X o Y del dato.
      const [x, y] = dimAxes(p)
      return dot(pts[0], p.axis === 'Y' ? y : x)
    }
    case 'LEADER':
    case 'MLEADER':
    case 'CENTER':
    case 'CENTERLINE':
      return 0
  }
}

/** Contenido de texto de la cota según su tipo (prefijos R/⌀/⌒, formato, alternas, tolerancias). */
export function dimContent(p: DimensionProps): DimTextContent {
  const s = p.style
  const v = measureDim(p)
  switch (p.dimType) {
    case 'ANGULAR':
      return dimTextContent(formatAngle(v, s), null, s, p.textOverride)
    case 'RADIUS':
    case 'JOGGED':
      return dimTextContent(formatLinear(v, s), v, s, p.textOverride, 'R')
    case 'DIAMETER':
      return dimTextContent(formatLinear(v, s), v, s, p.textOverride, '⌀')
    case 'ARCLEN':
      return dimTextContent(formatLinear(v, s), v, s, p.textOverride, s.DIMARCSYM === 0 ? '⌒' : '')
    case 'ORDINATE':
      return dimTextContent(formatLinear(Math.abs(v), s), Math.abs(v), s, p.textOverride)
    case 'LEADER':
    case 'MLEADER':
      return { main: p.textOverride ?? '', boxed: false }
    case 'CENTER':
    case 'CENTERLINE':
      return { main: '', boxed: false }
    default:
      return dimTextContent(formatLinear(v, s), v, s, p.textOverride)
  }
}

/** Texto principal de la cota (compatibilidad: paleta, DXF). */
export function formatDim(p: DimensionProps): string {
  const c = dimContent(p)
  return c.stack ? `${c.main} ${c.stack[0]}/${c.stack[1]}` : c.main
}

/** Bloque de texto en coordenadas locales (centrado en el origen): trazos, ancho y alto totales. */
interface TextBlock {
  strokes: Stroke[]
  w: number
  h: number
  boxed: boolean
  /** Distancia (hacia arriba) del centro del bloque al medio del primer renglón (textos de varios renglones). */
  firstLine: number
}

/** Interlineado de los textos de varios renglones (multileaders), como el de MTEXT. */
const LINE_SPACING = 5 / 3

function textBlock(c: DimTextContent, h: number, s: DimVars, arcAbove: boolean): TextBlock {
  if (!c.main && !c.stack) return { strokes: [], w: 0, h: 0, boxed: false, firstLine: 0 }
  const rows = c.main.split('\n')
  if (rows.length > 1) {
    // Varios renglones (multileader): alineados a la izquierda, primer renglón arriba.
    const ls = h * LINE_SPACING
    const lays = rows.map((r) => layoutText(r, h))
    const w = Math.max(...lays.map((l) => l.width))
    const H = h + (rows.length - 1) * ls
    const strokes: Stroke[] = []
    lays.forEach((l, i) => {
      for (const st of l.strokes) strokes.push(st.map(([x, y]) => [x - w / 2, y - i * ls + H / 2 - h] as Pt2))
    })
    return { strokes, w, h: H, boxed: c.boxed, firstLine: (H - h) / 2 }
  }
  const main = layoutText(c.main, h)
  let w = main.width
  const strokes: Stroke[] = [...main.strokes]
  if (c.stack) {
    const th = h * (s.DIMTFAC > 0 ? s.DIMTFAC : 1)
    const sep = c.main ? h * 0.3 : 0
    const up = layoutText(c.stack[0], th)
    const lo = layoutText(c.stack[1], th)
    const x0 = w + sep
    for (const st of up.strokes) strokes.push(st.map(([x, y]) => [x + x0, y + h - th + (th < h ? 0 : th * 0.55)] as Pt2))
    for (const st of lo.strokes) strokes.push(st.map(([x, y]) => [x + x0, y - (th < h ? 0 : th * 0.55)] as Pt2))
    w = x0 + Math.max(up.width, lo.width)
  }
  if (arcAbove) {
    // Símbolo de arco encima del texto (DIMARCSYM = 1).
    const n = 12
    strokes.push(Array.from({ length: n + 1 }, (_, i) => {
      const a = Math.PI * (0.1 + (0.8 * i) / n)
      return [w / 2 + (w / 2) * 0.9 * Math.cos(a), h * 1.15 + h * 0.3 * Math.sin(a)] as Pt2
    }))
  }
  // Centrar: el bloque va de −w/2 a w/2 y de −h/2 a h/2 (alto de mayúsculas).
  const centered = strokes.map((st) => st.map(([x, y]) => [x - w / 2, y - h / 2] as Pt2))
  return { strokes: centered, w, h, boxed: c.boxed, firstLine: 0 }
}

/** Plano de la cota: ejes x/y (para "horizontal" y legibilidad) a partir de la normal. */
export function planeAxes(n: Vec3): [Vec3, Vec3] {
  if (Math.abs(n[2]) > 1 - 1e-9) return [[1, 0, 0], [0, n[2] > 0 ? 1 : -1, 0]]
  const ref: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const x = norm(cross(ref, n))
  return [x, norm(cross(n, x))]
}

/** Dirección de lectura legible: de izquierda a derecha o de abajo hacia arriba (ISO 129). */
export function readable(d: Vec3, n: Vec3, horiz?: Vec3): Vec3 {
  const [x, y] = horiz ? [horiz, norm(cross(n, horiz))] : planeAxes(n)
  const a = Math.atan2(dot(d, y), dot(d, x))
  return a > Math.PI / 2 + 1e-9 || a <= -Math.PI / 2 + 1e-9 ? scale(d, -1) : d
}

interface Builder {
  lines: [Vec3, Vec3][]
  fills: Vec3[][]
  textStrokes: Vec3[][]
  text: DimText
  textBox: Vec3[] | null
  handles?: [Vec3, Vec3]
  arrowTips?: [Vec3, Vec3]
  breakable: [Vec3, Vec3][]
  /** Cortes automáticos (`DIMBREAK`): puntos donde la cota cruza otros objetos y radio del corte. */
  breakPts?: Vec3[]
  breakR: number
}

/** Ubica el bloque de texto en el mundo (centro `c`, dirección `u`, arriba `v`) con su recuadro. */
function placeText(b: Builder, tb: TextBlock, value: string, h: number, c: Vec3, u: Vec3, v: Vec3, gap: number): void {
  const P = ([x, y]: Pt2): Vec3 => add(c, add(scale(u, x), scale(v, y)))
  for (const st of tb.strokes) b.textStrokes.push(st.map(P))
  const hw = tb.w / 2 + gap
  const hh = tb.h / 2 + gap
  const box = [P([-hw, -hh]), P([hw, -hh]), P([hw, hh]), P([-hw, hh])]
  if (tb.w > 0) b.textBox = box
  if (tb.boxed && tb.w > 0) b.lines.push(...box.map((p, i) => [p, box[(i + 1) % 4]] as [Vec3, Vec3]))
  b.text = { pos: c, value, height: h, dir: u, up: v }
}

/** Medio largo, sobre una dirección `d`, del rectángulo (medio ancho `hw`, medio alto `hh`) de ejes `u`/`v`. */
function halfAlong(d: Vec3, u: Vec3, v: Vec3, hw: number, hh: number): number {
  const cu = Math.abs(dot(d, u))
  const cv = Math.abs(dot(d, v))
  const a = cu > 1e-9 ? hw / cu : Infinity
  const bb = cv > 1e-9 ? hh / cv : Infinity
  return Math.min(a, bb)
}

/** Tramos de a→e que quedan al quitar los intervalos [t0, t1] (distancias desde a). */
function cutSegment(a: Vec3, e: Vec3, cuts: Array<[number, number]>): [Vec3, Vec3][] {
  const L = len(sub(e, a))
  if (L < 1e-12) return []
  const d = scale(sub(e, a), 1 / L)
  const sorted = cuts.map(([x, y]) => [Math.max(0, Math.min(x, y)), Math.min(L, Math.max(x, y))] as [number, number]).filter(([x, y]) => y > x).sort((p, q) => p[0] - q[0])
  const out: [Vec3, Vec3][] = []
  let t = 0
  for (const [x, y] of sorted) {
    if (x > t) out.push([add(a, scale(d, t)), add(a, scale(d, x))])
    t = Math.max(t, y)
  }
  if (t < L) out.push([add(a, scale(d, t)), e])
  return out
}

/** Segmento cortable por `DIMBREAK`: se registra y se le quita lo que cae dentro de cada corte automático. */
function pushSeg(b: Builder, a: Vec3, e: Vec3): void {
  b.breakable.push([a, e])
  if (!b.breakPts) {
    b.lines.push([a, e])
    return
  }
  const L = len(sub(e, a))
  if (L < 1e-12) return
  const d = scale(sub(e, a), 1 / L)
  const r = b.breakR
  const cuts: Array<[number, number]> = []
  for (const q of b.breakPts) {
    const f = sub(a, q)
    const fd = dot(f, d)
    const disc = fd * fd - (dot(f, f) - r * r)
    if (disc > 0) cuts.push([-fd - Math.sqrt(disc), -fd + Math.sqrt(disc)])
  }
  b.lines.push(...cutSegment(a, e, cuts))
}

/** Agrega el segmento a→b quitando los intervalos [t0, t1] (distancias desde a). */
function pushBroken(b: Builder, a: Vec3, e: Vec3, cuts: Array<[number, number]>): void {
  for (const [x, y] of cutSegment(a, e, cuts)) pushSeg(b, x, y)
}

function pushArrow(b: Builder, kind: ArrowType, tip: Vec3, dir: Vec3, n: Vec3, size: number): void {
  const g = arrowGeometry(kind, tip, dir, n, size)
  b.lines.push(...g.lines)
  b.fills.push(...g.fills)
}

/** Línea de referencia de `from` (punto definitorio) hacia `to` (sobre la línea de cota), con DIMEXO/DIMEXE/DIMFXL. */
function extLine(b: Builder, from: Vec3, to: Vec3, s: DimVars, k: number): void {
  const L = len(sub(to, from))
  if (L < 1e-12) return
  const d = scale(sub(to, from), 1 / L)
  const exe = s.DIMEXE * k
  let start = s.DIMEXO * k
  if (s.DIMFXLON) start = Math.max(start, L - s.DIMFXL * k)
  if (start >= L + exe) return
  pushSeg(b, add(from, scale(d, start)), add(to, scale(d, exe)))
}

/** Marca de centro (`DIMCEN` > 0) o marca y líneas de centro (`DIMCEN` < 0) de un círculo de radio `r`. */
function centerMark(b: Builder, c: Vec3, r: number, n: Vec3, s: DimVars, k: number, axes?: [Vec3, Vec3]): void {
  const m = Math.abs(s.DIMCEN) * k
  if (m <= 0) return
  const [x, y] = axes ?? planeAxes(n)
  b.lines.push([add(c, scale(x, -m)), add(c, scale(x, m))], [add(c, scale(y, -m)), add(c, scale(y, m))])
  if (s.DIMCEN < 0) {
    for (const ax of [x, y]) {
      for (const sg of [-1, 1]) {
        const start = 2 * m
        const end = r + m
        if (end > start) b.lines.push([add(c, scale(ax, sg * start)), add(c, scale(ax, sg * end))])
      }
    }
  }
}

function newBuilder(): Builder {
  return { lines: [], fills: [], textStrokes: [], text: { pos: [0, 0, 0], value: '', height: 0, dir: [1, 0, 0], up: [0, 1, 0] }, textBox: null, breakable: [], breakR: 0 }
}

/** Geometría de visualización de una cota, recomputada de los parámetros y del estilo. */
export function dimDisplay(p: DimensionProps, ctx?: DimContext): DimDisplay {
  const s = p.style
  const k = dimScaleFactor(s, ctx)
  const b = newBuilder()
  if (p.autoBreaks?.length) {
    b.breakPts = p.autoBreaks
    b.breakR = (s.BREAKSIZE * k) / 2
  }
  let n: Vec3 = WORLD_Z
  switch (p.dimType) {
    case 'LINEAR':
    case 'ALIGNED':
      n = linearLike(b, p, s, k)
      break
    case 'ANGULAR':
    case 'ARCLEN':
      n = angularLike(b, p, s, k)
      break
    case 'RADIUS':
    case 'JOGGED':
    case 'DIAMETER':
      n = radial(b, p, s, k)
      break
    case 'ORDINATE':
      n = ordinate(b, p, s, k)
      break
    case 'LEADER':
    case 'MLEADER':
      n = leader(b, p, s, k)
      break
    case 'CENTERLINE':
      n = normalOf(p)
      centerLine(b, p, s, k)
      break
    case 'CENTER': {
      n = normalOf(p)
      const c = p.points[0]
      const m = (Math.abs(s.DIMCEN) || s.DIMASZ) * k
      centerMark(b, c, len(sub(p.textPos, c)) || m, n, { ...s, DIMCEN: s.DIMCEN === 0 ? s.DIMASZ : s.DIMCEN }, k, dimAxes(p))
      const [x, y] = dimAxes(p)
      b.text = { pos: c, value: '', height: s.DIMTXT * k, dir: x, up: y }
      break
    }
  }
  if (p.inspect && b.textBox) inspectFrame(b, p.inspect)
  return { lines: b.lines, fills: b.fills, textStrokes: b.textStrokes, text: b.text, textBox: b.textBox, handles: b.handles, arrowTips: b.arrowTips, breakable: b.breakable, normal: n }
}

/**
 * Cota de inspección (`DIMINSPECT`): etiqueta a la izquierda, valor y frecuencia a la derecha, separados
 * por líneas y encerrados en un marco redondeado o angular (o sin marco).
 */
function inspectFrame(b: Builder, ins: NonNullable<DimensionProps['inspect']>): void {
  const box = b.textBox!
  const { pos: c, dir: u, up: v, height: h } = b.text
  const hw = len(sub(box[1], box[0])) / 2
  const hh = len(sub(box[2], box[1])) / 2
  const gap = hh - h / 2
  const P = (x: number, y: number): Vec3 => add(c, add(scale(u, x), scale(v, y)))
  const word = (text: string, x0: number) => {
    const l = layoutText(text, h)
    for (const st of l.strokes) b.textStrokes.push(st.map(([x, y]) => P(x0 + x, y - h / 2)))
    return l.width
  }
  let xL = -hw
  let xR = hw
  if (ins.label) {
    const w = textWidth(ins.label, h)
    word(ins.label, xL - gap - w)
    b.lines.push([P(xL, -hh), P(xL, hh)])
    xL -= w + 2 * gap
  }
  if (ins.rate) {
    b.lines.push([P(xR, -hh), P(xR, hh)])
    xR += word(ins.rate, xR + gap) + 2 * gap
  }
  if (ins.shape === 'none') return
  b.lines.push([P(xL, hh), P(xR, hh)], [P(xL, -hh), P(xR, -hh)])
  if (ins.shape === 'angular') {
    b.lines.push([P(xL, hh), P(xL - hh, 0)], [P(xL - hh, 0), P(xL, -hh)], [P(xR, hh), P(xR + hh, 0)], [P(xR + hh, 0), P(xR, -hh)])
    return
  }
  const N = 12
  for (let i = 0; i < N; i++) {
    const a0 = Math.PI / 2 + (Math.PI * i) / N
    const a1 = Math.PI / 2 + (Math.PI * (i + 1)) / N
    b.lines.push([P(xL + hh * Math.cos(a0), hh * Math.sin(a0)), P(xL + hh * Math.cos(a1), hh * Math.sin(a1))])
    b.lines.push([P(xR - hh * Math.cos(a0), hh * Math.sin(a0)), P(xR - hh * Math.cos(a1), hh * Math.sin(a1))])
  }
}

// --- LINEAR / ALIGNED ---------------------------------------------------------------------------

interface FitResult {
  textInside: boolean
  arrowsInside: boolean
  arrowsShown: boolean
}

function fit(L: number, needText: number, needArrows: number, textAbove: boolean, s: DimVars): FitResult {
  const bothFit = textAbove ? L >= needText && L >= needArrows : L >= needText + needArrows
  const textFits = L >= needText
  const arrowsFit = L >= needArrows
  let textInside: boolean
  let arrowsInside: boolean
  if (s.DIMTIX) {
    textInside = true
    arrowsInside = bothFit || (textAbove && arrowsFit)
  } else if (bothFit) {
    textInside = arrowsInside = true
  } else {
    switch (s.DIMATFIT) {
      case 0:
        textInside = arrowsInside = false
        break
      case 1:
        arrowsInside = arrowsFit
        textInside = false
        break
      case 2:
        textInside = textFits
        arrowsInside = false
        break
      default:
        textInside = textFits
        arrowsInside = !textFits && arrowsFit
    }
  }
  return { textInside, arrowsInside, arrowsShown: arrowsInside || !s.DIMSOXD }
}

/**
 * Cotas con dos líneas de referencia y una línea de cota recta (LINEAR, ALIGNED). Devuelve la normal.
 * Reglas del CAD clásico: el texto va según `DIMTAD`/`DIMJUST`, alineado o horizontal según `DIMTIH`/`DIMTOH`,
 * siempre legible; si no entra, *Fit* decide qué sale; con `DIMTAD` = 0 la línea se corta alrededor del texto.
 */
function linearLike(b: Builder, p: DimensionProps, s: DimVars, k: number): Vec3 {
  const view = normalOf(p)
  let n: Vec3 = view
  let a = p.points[0]
  let c = p.points[1]
  let dir: Vec3
  if (p.dimType === 'LINEAR') {
    // Todo en el plano de la cota que pasa por el primer punto (en FRONT: XZ; en TOP: XY).
    c = onPlane(c, a, n)
    dir = linearDir(p)
  } else {
    dir = norm(sub(c, a))
    if (Math.abs(dot(sub(c, a), view)) < 1e-6 * Math.max(1, len(sub(c, a)))) {
      // ALIGNED planar: los extremos están en el plano de la vista.
      n = view
    } else {
      // ALIGNED 3D real: el plano que contiene la línea y mira lo más posible al observador.
      let nn = sub(view, scale(dir, dot(view, dir)))
      if (len(nn) < 1e-9) nn = cross(dir, Math.abs(dir[2]) < 0.9 ? WORLD_Z : [1, 0, 0])
      n = norm(nn)
    }
  }
  if (len(dir) < 1e-12) dir = planeAxes(n)[0]
  a = onPlane(a, a, n)
  const t = onPlane(p.textPos, a, n)
  const perp = norm(cross(n, dir))
  // Líneas de referencia: perpendiculares a la línea de cota, u oblicuas (DIMEDIT Oblique).
  let w = perp
  if (p.oblique !== undefined) {
    const o = (p.oblique * Math.PI) / 180
    const [px, py] = planeAxes(n)
    const ow = add(scale(px, Math.cos(o)), scale(py, Math.sin(o)))
    if (Math.abs(dot(ow, perp)) > 1e-6) w = ow
  }
  const toLine = (q: Vec3): Vec3 => add(q, scale(w, dot(sub(t, q), perp) / dot(w, perp)))
  const e1 = toLine(a)
  const e2 = toLine(c)
  const L = len(sub(e2, e1))
  const ldir = L > 1e-12 ? scale(sub(e2, e1), 1 / L) : dir
  const side = norm(sub(t, lerp(a, c, 0.5))) // lado hacia donde se sacó la cota (para DIMTAD = 2)

  // Referencias.
  if (!s.DIMSE1) extLine(b, a, e1, s, k)
  if (!s.DIMSE2) extLine(b, c, e2, s, k)

  // Texto y ajuste.
  const h = s.DIMTXT * k
  const gap = Math.abs(s.DIMGAP) * k
  const asz = s.DIMASZ * k
  const content = dimContent(p)
  const tb = textBlock(content, h, s, p.dimType === 'ARCLEN' && s.DIMARCSYM === 1)
  const ticks = isTick(s.DIMBLK1) && isTick(s.DIMBLK2)
  const alignedIn = !s.DIMTIH
  const alignedOut = !s.DIMTOH
  const horiz = n === normalOf(p) || dot(n, normalOf(p)) > 1 - 1e-9 ? dimAxes(p)[0] : planeAxes(n)[0]
  const textDirFor = (aligned: boolean): Vec3 => (p.textAngle !== undefined ? rotIn(horiz, n, p.textAngle) : aligned ? readable(ldir, n, horiz) : horiz)
  const uIn = textDirFor(alignedIn)
  const vIn = norm(cross(n, uIn))
  const along = (u: Vec3, v: Vec3): number => (tb.w > 0 ? 2 * halfAlong(ldir, u, v, tb.w / 2, tb.h / 2) : 0)
  const lineHorizontal = Math.abs(dot(ldir, horiz)) > 1 - 1e-6
  const tadEff = (aligned: boolean): number => (!aligned && !lineHorizontal && p.textAngle === undefined ? 0 : s.DIMTAD)
  const above = tadEff(alignedIn) !== 0
  const needText = (above ? tb.w : along(uIn, vIn)) + 2 * gap
  const needArrows = ticks ? 0 : 2 * asz
  const f = fit(L, tb.w > 0 ? needText : 0, needArrows, above, s)

  // Posición del texto.
  const mid = lerp(e1, e2, 0.5)
  let u = uIn
  let v = vIn
  let tc: Vec3
  let onLine = true // ¿el texto está sobre la línea de cota (para cortarla / prolongarla)?
  const offsetFor = (vv: Vec3, tad: number): number => {
    if (tad === 0) return 0
    const away = tad === 2 ? Math.sign(dot(vv, side) || 1) : tad === 4 ? -1 : 1
    return away * (gap + tb.h / 2)
  }
  if (p.textAt) {
    const ta = onPlane(p.textAt, e1, n)
    if (s.DIMTMOVE === 0) {
      // El texto se desliza junto a la línea de cota.
      const sAlong = dot(sub(ta, e1), ldir)
      tc = add(add(e1, scale(ldir, sAlong)), scale(v, offsetFor(v, tadEff(alignedIn))))
    } else {
      onLine = false
      tc = ta
      if (s.DIMTMOVE === 1) {
        // Líder del texto movido a la línea de cota.
        const target = mid
        const nearEdge = add(tc, scale(norm(sub(target, tc)), halfAlong(norm(sub(target, tc)), u, v, tb.w / 2 + gap, tb.h / 2 + gap)))
        if (len(sub(target, tc)) > tb.w / 2 + gap) b.lines.push([nearEdge, target])
      }
    }
  } else if (f.textInside) {
    const half = (above ? tb.w : along(u, v)) / 2
    let sAlong = L / 2
    if (s.DIMJUST === 1 || s.DIMJUST === 3) sAlong = Math.min(L / 2, (ticks ? 0 : asz) + gap + half)
    if (s.DIMJUST === 2 || s.DIMJUST === 4) sAlong = Math.max(L / 2, L - (ticks ? 0 : asz) - gap - half)
    if (s.DIMJUST === 3 || s.DIMJUST === 4) {
      // Sobre la línea de referencia: el texto corre paralelo a ella, más allá de la línea de cota.
      const eRef = s.DIMJUST === 3 ? e1 : e2
      const ow = norm(sub(eRef, s.DIMJUST === 3 ? a : c))
      u = readable(ow, n, horiz)
      v = norm(cross(n, u))
      tc = add(eRef, scale(ow, s.DIMEXE * k + gap + tb.w / 2))
      tc = add(tc, scale(v, offsetFor(v, 1) * (dot(v, ldir) >= 0 ? -1 : 1)))
      onLine = false
    } else {
      tc = add(add(e1, scale(ldir, sAlong)), scale(v, offsetFor(v, tadEff(alignedIn))))
    }
  } else {
    // Texto afuera, del lado de la segunda referencia, después de la flecha.
    u = textDirFor(alignedOut)
    v = norm(cross(n, u))
    const half = (tadEff(alignedOut) !== 0 ? tb.w : along(u, v)) / 2
    const out = (f.arrowsInside || ticks ? 0 : 2 * asz) + gap + half
    tc = add(add(e2, scale(ldir, out)), scale(v, offsetFor(v, tadEff(alignedOut))))
  }
  if (tb.w > 0 || content.main) placeText(b, tb, content.main, h, tc, u, v, gap)
  else b.text = { pos: mid, value: '', height: h, dir: u, up: v }
  b.handles = [e1, e2]
  b.arrowTips = [e1, e2]

  // Línea de cota y flechas.
  const dle = ticks ? s.DIMDLE * k : 0
  // Cortes manuales (`DIMBREAK Manual`), medidos desde el primer extremo de la línea de cota.
  const cuts: Array<[number, number]> = (p.breaks ?? []).map(([x, y]) => [x + dle, y + dle] as [number, number])
  if (p.jog !== undefined) {
    // Quiebre (`DIMJOGLINE`): zigzag de alto JOGHEIGHT × texto en la línea de cota.
    const jh = s.JOGHEIGHT * s.DIMTXT * k
    const vp = norm(cross(n, ldir))
    const J = (t: number, o: number): Vec3 => add(add(e1, scale(ldir, p.jog! + t)), scale(vp, o))
    cuts.push([p.jog + dle - jh / 2, p.jog + dle + jh / 2])
    b.lines.push([J(-jh / 2, 0), J(-jh / 6, jh / 2)], [J(-jh / 6, jh / 2), J(jh / 6, -jh / 2)], [J(jh / 6, -jh / 2), J(jh / 2, 0)])
  }
  // Corte alrededor del texto centrado sobre la línea.
  if (b.textBox && onLine && Math.abs(dot(sub(tc, e1), norm(cross(n, ldir)))) < 1e-6 * Math.max(1, L)) {
    const sT = dot(sub(tc, e1), ldir)
    const half = halfAlong(ldir, u, v, tb.w / 2 + gap, tb.h / 2 + gap)
    cuts.push([sT - half + dle, sT + half + dle])
  }
  const lineStart = add(e1, scale(ldir, -dle))
  const lineEnd = add(e2, scale(ldir, dle))
  // Flecha afuera (apuntando hacia adentro) según el ajuste, invertida con *Flip Arrow*.
  const inside = f.arrowsInside || ticks
  const [out1, out2] = arrowsOut(inside, ticks, p.flip)
  const drawMain = !out1 || !out2 || s.DIMTOFL || ticks
  if (drawMain) {
    // Supresión de mitades (DIMSD1/DIMSD2).
    const half = L / 2 + dle
    if (s.DIMSD1) cuts.push([0, half])
    if (s.DIMSD2) cuts.push([half, L + 2 * dle])
    pushBroken(b, lineStart, lineEnd, cuts)
  }
  if (f.arrowsShown) {
    // Flechas afuera apuntan hacia adentro, con su prolongación de línea.
    if (out1) {
      pushArrow(b, s.DIMBLK1, e1, ldir, n, asz)
      b.lines.push([add(e1, scale(ldir, -2 * asz)), e1])
    } else if (!(inside && s.DIMSD1)) pushArrow(b, s.DIMBLK1, e1, scale(ldir, -1), n, asz)
    if (out2) {
      pushArrow(b, s.DIMBLK2, e2, scale(ldir, -1), n, asz)
      if (f.textInside || p.textAt || inside) b.lines.push([e2, add(e2, scale(ldir, 2 * asz))])
    } else if (!(inside && s.DIMSD2)) pushArrow(b, s.DIMBLK2, e2, ldir, n, asz)
  }
  // Texto afuera sobre (o junto a) la prolongación: la línea llega hasta el final del texto.
  if (!f.textInside && !p.textAt && b.textBox && tb.w > 0) {
    const far = dot(sub(tc, e2), ldir) + halfAlong(ldir, u, v, tb.w / 2, tb.h / 2)
    const from = f.arrowsInside || ticks ? e2 : add(e2, scale(ldir, 2 * asz))
    const to = add(e2, scale(ldir, far))
    if (tadEff(alignedOut) !== 0 && dot(sub(to, from), ldir) > 0) b.lines.push([from, to])
    else if (tadEff(alignedOut) === 0 && !f.arrowsInside && !ticks) {
      const near = dot(sub(tc, e2), ldir) - halfAlong(ldir, u, v, tb.w / 2 + gap, tb.h / 2 + gap)
      if (near > 2 * asz) b.lines.push([from, add(e2, scale(ldir, near))])
    }
  }
  return n
}

/**
 * Una DIMLINEAR sin rotación decide horizontal/vertical por dónde quedó la línea de cota; antes de
 * moverla (grip, `DIMSPACE`) se fija su orientación actual para que no cambie.
 */
export function fixLinearRotation(p: DimensionProps): void {
  if (p.dimType !== 'LINEAR' || p.rotation !== undefined) return
  const [x, y] = planeAxes(normalOf(p))
  const dir = linearDir(p)
  p.rotation = Math.round((Math.atan2(dot(dir, y), dot(dir, x)) * 180) / Math.PI)
}

/** ¿Cada flecha va afuera (apuntando hacia adentro)? Según el ajuste, invertida por `flip` (no aplica a trazos). */
function arrowsOut(inside: boolean, ticks: boolean, flip: DimensionProps['flip']): [boolean, boolean] {
  if (ticks) return [false, false]
  return [!inside !== !!flip?.[0], !inside !== !!flip?.[1]]
}

/** *Flip Arrow* (CAD clásico): invierte la flecha más cercana a `at`. Devuelve false si la cota no tiene flechas. */
export function flipArrowNear(p: DimensionProps, at: Vec3): boolean {
  const tips = dimDisplay(p).arrowTips
  if (!tips) return false
  const i = len(sub(tips[0], at)) <= len(sub(tips[1], at)) ? 0 : 1
  const fl: [boolean, boolean] = [!!p.flip?.[0], !!p.flip?.[1]]
  fl[i] = !fl[i]
  if (fl[0] || fl[1]) p.flip = fl
  else delete p.flip
  return true
}

/** Rota `x` un ángulo (grados) alrededor de `n`. */
function rotIn(x: Vec3, n: Vec3, deg: number): Vec3 {
  const r = (deg * Math.PI) / 180
  return add(scale(x, Math.cos(r)), scale(norm(cross(n, x)), Math.sin(r)))
}

// --- ANGULAR / ARCLEN ---------------------------------------------------------------------------

function angularLike(b: Builder, p: DimensionProps, s: DimVars, k: number): Vec3 {
  const sec = angularSector(p)
  const { c, s0, n, sweep } = sec
  const e2 = norm(cross(n, s0))
  const radial = (ang: number): Vec3 => add(scale(s0, Math.cos(ang)), scale(e2, Math.sin(ang)))
  const tp = onPlane(p.textPos, c, n)
  let r = len(sub(tp, c))
  if (p.dimType === 'ARCLEN') r = Math.max(r, len(sub(p.points[1], c)) + s.DIMASZ * k)
  if (r < 1e-9) r = len(sub(p.points[1], c))
  const h = s.DIMTXT * k
  const gap = Math.abs(s.DIMGAP) * k
  const asz = s.DIMASZ * k

  // Referencias radiales desde los puntos definitorios (o el centro) hasta el arco.
  const ends = [radial(0), radial(sweep)]
  const defDist = (d: Vec3): number => {
    if (p.dimType === 'ARCLEN') return len(sub(p.points[1], c))
    // El punto definitorio de esa dirección (o 0 si es la prolongación opuesta de la línea).
    for (const q of [p.points[1], p.points[2]]) {
      const dq = sub(q, c)
      if (len(dq) > 1e-9 && dot(norm(dq), d) > 1 - 1e-9) return len(dq)
    }
    return 0
  }
  for (const [i, d] of ends.entries()) {
    if ((i === 0 && s.DIMSE1) || (i === 1 && s.DIMSE2)) continue
    const rd = defDist(d)
    if (r > rd + 1e-9) extLine(b, add(c, scale(d, rd)), add(c, scale(d, r)), s, k)
  }

  // Arco, flechas y texto.
  const L = r * sweep
  const content = dimContent(p)
  const tb = textBlock(content, h, s, p.dimType === 'ARCLEN' && s.DIMARCSYM === 1)
  const ticks = isTick(s.DIMBLK1) && isTick(s.DIMBLK2)
  const needArrows = ticks ? 0 : 2 * asz
  const above = s.DIMTAD !== 0
  const f = fit(L, tb.w + 2 * gap, needArrows, above, s)
  const midA = sweep / 2
  const midDir = radial(midA)
  const tangent = norm(cross(n, midDir))
  const horiz = dimAxes(p)[0]
  let u = p.textAngle !== undefined ? rotIn(horiz, n, p.textAngle) : s.DIMTIH ? horiz : readable(tangent, n, horiz)
  let v = norm(cross(n, u))
  let tc: Vec3
  let onArc = true
  if (p.textAt) {
    tc = onPlane(p.textAt, c, n)
    onArc = false
  } else if (f.textInside || f.arrowsInside) {
    const off = above ? gap + tb.h / 2 : 0
    tc = add(c, scale(midDir, r + off))
  } else {
    // Afuera: después del final del arco, siguiendo la tangente.
    u = s.DIMTOH ? horiz : readable(norm(cross(n, ends[1])), n, horiz)
    v = norm(cross(n, u))
    tc = add(add(c, scale(ends[1], r)), scale(norm(cross(n, ends[1])), 2 * asz + gap + tb.w / 2))
    tc = add(tc, scale(v, above ? gap + tb.h / 2 : 0))
    onArc = false
  }
  if (tb.w > 0) placeText(b, tb, content.main, h, tc, u, v, gap)
  else b.text = { pos: tc, value: '', height: h, dir: u, up: v }

  // Arco (cortado alrededor del texto si va centrado).
  const steps = Math.max(8, Math.ceil((sweep / Math.PI) * 48))
  let cutA0 = Infinity
  let cutA1 = -Infinity
  if (onArc && !above && tb.w > 0) {
    const half = (tb.w / 2 + gap) / r
    cutA0 = midA - half
    cutA1 = midA + half
  }
  const dle = ticks ? (s.DIMDLE * k) / r : 0
  const from = -dle
  const to = sweep + dle
  for (let i = 0; i < steps; i++) {
    const x0 = from + ((to - from) * i) / steps
    const x1 = from + ((to - from) * (i + 1)) / steps
    if (x1 > cutA0 && x0 < cutA1) continue
    pushSeg(b, add(c, scale(radial(x0), r)), add(c, scale(radial(x1), r)))
  }
  if (f.arrowsShown) {
    const t0 = norm(cross(n, ends[0]))
    const t1 = norm(cross(n, ends[1]))
    const p0 = add(c, scale(ends[0], r))
    const p1 = add(c, scale(ends[1], r))
    b.arrowTips = [p0, p1]
    const [out0, out1] = arrowsOut(f.arrowsInside || ticks, ticks, p.flip)
    if (out0) {
      pushArrow(b, s.DIMBLK1, p0, t0, n, asz)
      b.lines.push([add(p0, scale(t0, -2 * asz)), p0])
    } else pushArrow(b, s.DIMBLK1, p0, scale(t0, -1), n, asz)
    if (out1) {
      pushArrow(b, s.DIMBLK2, p1, scale(t1, -1), n, asz)
      b.lines.push([p1, add(p1, scale(t1, 2 * asz))])
    } else pushArrow(b, s.DIMBLK2, p1, t1, n, asz)
  }
  return n
}

// --- RADIUS / DIAMETER / JOGGED -----------------------------------------------------------------

function radial(b: Builder, p: DimensionProps, s: DimVars, k: number): Vec3 {
  const n = normalOf(p)
  const [c] = p.points
  const onC = onPlane(p.points[1], c, n)
  const r = len(sub(p.points[1], c))
  const tp = onPlane(p.textAt ?? p.textPos, c, n)
  let d = norm(sub(tp, c))
  if (len(d) < 1e-9) d = norm(sub(onC, c))
  if (len(d) < 1e-9) d = dimAxes(p)[0]
  const h = s.DIMTXT * k
  const gap = Math.abs(s.DIMGAP) * k
  const asz = s.DIMASZ * k
  const P = add(c, scale(d, r))
  const content = dimContent(p)
  const tb = textBlock(content, h, s, false)
  const dist = len(sub(tp, c))
  const inside = dist < r - 1e-9
  const dia = p.dimType === 'DIAMETER'
  const horiz = dimAxes(p)[0]
  const alignedT = inside ? !s.DIMTIH : !s.DIMTOH
  let u = p.textAngle !== undefined ? rotIn(horiz, n, p.textAngle) : alignedT ? readable(d, n, horiz) : horiz
  let v = norm(cross(n, u))
  const above = s.DIMTAD !== 0 && (alignedT || p.textAngle !== undefined)

  // DIMJOGGED: la línea arranca en el centro desplazado (`points[2]`), no en el centro real.
  const jogStart = p.dimType === 'JOGGED' && p.points[2] ? onPlane(p.points[2], c, n) : c
  if (inside) {
    // Línea desde el centro (o el punto opuesto en diámetros) hasta el borde, flecha hacia afuera.
    const start = dia ? add(c, scale(d, -r)) : jogStart
    const tc = add(tp, scale(v, above ? gap + tb.h / 2 : 0))
    if (tb.w > 0) placeText(b, tb, content.main, h, tc, u, v, gap)
    const cuts: Array<[number, number]> = []
    if (!above && tb.w > 0) {
      const sT = dot(sub(tc, start), d)
      const half = halfAlong(d, u, v, tb.w / 2 + gap, tb.h / 2 + gap)
      cuts.push([sT - half, sT + half])
    }
    if (p.dimType === 'JOGGED') joggedLine(b, start, P, s, k, n)
    else pushBroken(b, start, P, cuts)
    pushArrow(b, s.DIMBLK2, P, d, n, asz)
    if (dia) pushArrow(b, s.DIMBLK1, start, scale(d, -1), n, asz)
  } else {
    // Afuera: flecha sobre el borde apuntando al centro, líder hasta el texto (con apoyo si es horizontal).
    centerMark(b, c, r, n, s, k)
    pushArrow(b, s.DIMBLK2, P, scale(d, -1), n, asz)
    if (p.dimType === 'JOGGED') {
      joggedLine(b, jogStart, P, s, k, n)
      b.lines.push([P, tp])
    } else b.lines.push([P, tp])
    if (dia && s.DIMTOFL) b.lines.push([add(c, scale(d, -r)), P])
    let tc: Vec3
    if (alignedT && p.textAngle === undefined) {
      // Texto alineado con el líder, a continuación del punto marcado; la línea sigue bajo el texto.
      u = readable(d, n, horiz)
      v = norm(cross(n, u))
      tc = add(add(tp, scale(d, tb.w / 2 + gap)), scale(v, above ? gap + tb.h / 2 : 0))
      if (above) b.lines.push([tp, add(tp, scale(d, tb.w + 2 * gap))])
    } else {
      // Horizontal: apoyo (landing) horizontal hacia el lado del texto.
      const sideX = dot(d, horiz) >= 0 ? 1 : -1
      const land = add(tp, scale(horiz, sideX * asz))
      b.lines.push([tp, land])
      const tad = s.DIMTAD !== 0
      tc = add(add(land, scale(horiz, sideX * (tb.w / 2 + gap))), scale(v, tad ? gap + tb.h / 2 : 0))
      if (tad) b.lines.push([land, add(land, scale(horiz, sideX * (tb.w + 2 * gap)))])
    }
    if (tb.w > 0) placeText(b, tb, content.main, h, tc, u, v, gap)
  }
  if (!b.textBox) b.text = { pos: tp, value: content.main, height: h, dir: u, up: v }
  return n
}

/** Línea de radio con quiebre (DIMJOGGED): zigzag a mitad de camino con `DIMJOGANG`. */
function joggedLine(b: Builder, a: Vec3, e: Vec3, s: DimVars, k: number, n: Vec3): void {
  const d = norm(sub(e, a))
  const L = len(sub(e, a))
  const perp = norm(cross(n, d))
  const jh = s.DIMTXT * k * 1.5
  const ang = (Math.max(5, Math.min(90, s.DIMJOGANG)) * Math.PI) / 180
  const dx = jh / Math.tan(ang)
  const m = lerp(a, e, 0.5)
  const j1 = add(m, scale(d, -dx / 2))
  const j2 = add(add(m, scale(perp, jh)), scale(d, dx / 2))
  if (L < dx * 2) {
    b.lines.push([a, e])
    return
  }
  b.lines.push([a, j1], [j1, j2], [j2, add(e, scale(perp, jh))], [add(e, scale(perp, jh)), e])
}

// --- ORDINATE / LEADER --------------------------------------------------------------------------

function ordinate(b: Builder, p: DimensionProps, s: DimVars, k: number): Vec3 {
  const n = normalOf(p)
  const [px, py] = dimAxes(p)
  const f = p.points[0]
  const end = onPlane(p.textPos, f, n)
  const h = s.DIMTXT * k
  const gap = Math.abs(s.DIMGAP) * k
  // Líder perpendicular al eje medido (X datum → vertical); con quiebre si el final no está alineado.
  const axisDir: Vec3 = p.axis === 'Y' ? px : py
  const sgn = Math.sign(dot(sub(end, f), axisDir)) || 1
  const ld = scale(axisDir, sgn)
  const start = add(f, scale(ld, s.DIMEXO * k))
  const off = dot(sub(end, f), p.axis === 'Y' ? py : px)
  if (Math.abs(off) > 1e-9) {
    const total = dot(sub(end, f), ld)
    const j1 = add(f, scale(ld, total * 0.6))
    const j2 = add(j1, sub(end, add(f, scale(ld, total))))
    const jj = add(j2, scale(ld, total * 0.15))
    b.lines.push([start, j1], [j1, jj], [jj, end])
  } else b.lines.push([start, end])
  const content = dimContent(p)
  const tb = textBlock(content, h, s, false)
  const u = readable(ld, n, px)
  const v = norm(cross(n, u))
  const tc = add(end, scale(ld, gap + tb.w / 2))
  if (tb.w > 0) placeText(b, tb, content.main, h, tc, u, v, gap)
  return n
}

function leader(b: Builder, p: DimensionProps, s: DimVars, k: number): Vec3 {
  const n = normalOf(p)
  const [px, py] = dimAxes(p)
  const sizes = p.leaderSizes && p.leaderSizes.length > 0 ? p.leaderSizes : [p.points.length]
  const h = s.DIMTXT * k
  const gap = Math.abs(s.DIMGAP) * k
  const asz = s.DIMASZ * k
  let i = 0
  const landing = p.points[0] ? onPlane(p.textPos, p.points[0], n) : p.textPos
  for (const size of sizes) {
    const pts = p.points.slice(i, i + size)
    i += size
    const poly = pts.length >= 2 ? pts : pts.length === 1 ? [pts[0], landing] : []
    for (let j = 0; j + 1 < poly.length; j++) b.lines.push([poly[j], poly[j + 1]])
    if (p.dimType === 'MLEADER' && pts.length >= 1 && len(sub(poly[poly.length - 1], landing)) > 1e-9) b.lines.push([poly[poly.length - 1], landing])
    if (poly.length >= 2) pushArrow(b, s.DIMLDRBLK, poly[0], norm(sub(poly[0], poly[1])), n, asz)
  }
  // Texto a la derecha o izquierda del final del líder, con apoyo horizontal (multileader).
  const content = dimContent(p)
  const tb = textBlock(content, h, s, false)
  const last = p.points.length >= 1 ? p.points[Math.min(p.points.length, sizes[0]) - 1] : landing
  const sideX = dot(sub(landing, last), px) >= 0 ? 1 : -1
  const u = px
  const v = py
  if (p.dimType === 'MLEADER') {
    // Apoyo horizontal y texto a continuación, con el medio del primer renglón a la altura del apoyo.
    const land = add(landing, scale(px, sideX * asz))
    b.lines.push([landing, land])
    if (tb.w > 0) placeText(b, tb, content.main, h, add(add(land, scale(px, sideX * (gap + tb.w / 2))), scale(py, -tb.firstLine)), u, v, gap)
  } else if (tb.w > 0) placeText(b, tb, content.main, h, add(landing, scale(px, sideX * (gap + tb.w / 2))), u, v, gap)
  if (!b.textBox) b.text = { pos: landing, value: content.main, height: h, dir: u, up: v }
  return n
}

/**
 * Línea de centro entre dos líneas (`CENTERLINE`): `points` = [a1, b1, a2, b2]. Va de punto
 * medio a punto medio de sus extremos, prolongada y con el trazo de la línea CENTER (largo-corto).
 */
function centerLine(b: Builder, p: DimensionProps, s: DimVars, k: number): void {
  const [a1, b1, a2i, b2i] = p.points
  if (!b2i) return
  // Emparejar los extremos según el sentido de cada línea.
  const [a2, b2] = dot(sub(b1, a1), sub(b2i, a2i)) < 0 ? [b2i, a2i] : [a2i, b2i]
  const m1 = lerp(a1, a2, 0.5)
  const m2 = lerp(b1, b2, 0.5)
  const L = len(sub(m2, m1))
  if (L < 1e-12) return
  const d = scale(sub(m2, m1), 1 / L)
  const u = s.DIMTXT * k * 0.5
  const ext = 1.4 * s.DIMTXT * k
  const start = add(m1, scale(d, -ext))
  const total = L + 2 * ext
  // Patrón CENTER: largo 5, hueco 1, corto 1, hueco 1 (en unidades de medio alto de texto).
  const pattern = [5 * u, u, u, u]
  let t = 0
  let i = 0
  while (t < total - 1e-9) {
    const seg = Math.min(pattern[i % 4], total - t)
    if (i % 2 === 0) b.lines.push([add(start, scale(d, t)), add(start, scale(d, t + seg))])
    t += seg
    i++
  }
  b.text = { pos: m1, value: '', height: s.DIMTXT * k, dir: d, up: [0, 0, 1] }
}

/** Ancho del texto principal de una cota (para tests y ajustes). */
export function dimTextWidth(p: DimensionProps, ctx?: DimContext): number {
  return textWidth(dimContent(p).main, p.style.DIMTXT * dimScaleFactor(p.style, ctx))
}
