import { lineSpan } from '../geom/xline'
import { loopPolyline } from '../region/region'
import { imagePoint, imageRing } from '../geom/image'
import { layerShown } from '../layers/visibility'
import type { Entity, ImageProps, Layer, PlotStyle, ShadeProps } from '../document/types'
import { entityBounds } from '../editing/bounds'
import { solidWireframe } from '../editing/solid'
import { meshWireframe } from '../editing/mesh'
import { ellipsePoints, isEllipseArc } from '../geom/ellipse'
import { tessellateArc } from '../geom/arc'
import { polylinePoints } from '../geom/polyline'
import { BASELINE_DROP, fontMetrics, lineSpacingOf, textSize, textTop, textStrokePolylines } from '../geom/text'
import { dimDisplay, type DimContext } from '../dimension/dimGeometry'
import { viewportRing } from '../layout/viewport'
import { entityPattern, type LinetypeContext } from '../linetype/linetypes'
import { entityDashes } from '../linetype/dash'
import { hatchFrame, hatchRings, hatchStrokesCached, isSolidHatch, to3 } from '../hatch/geometry'
import { isWide, polylineBand } from '../geom/plineWidth'
import type { Vec3 } from '../math'
import { zlibSync } from 'fflate'

/** Puntos PDF por milímetro (1 pulgada = 72 pt = 25.4 mm). */
export const MM_TO_PT = 72 / 25.4
const KAPPA = 0.5522847498307936

export interface PageSize {
  w: number
  h: number
}

/** Tamaños en puntos (landscape: ancho > alto). */
export const PAGE_SIZES: Record<string, PageSize> = {
  A4: { w: 841.89, h: 595.28 },
  A3: { w: 1190.55, h: 841.89 },
  A2: { w: 1683.78, h: 1190.55 },
  A1: { w: 2383.94, h: 1683.78 },
  A0: { w: 3370.39, h: 2383.94 },
  LETTER: { w: 792, h: 612 },
  LEGAL: { w: 1008, h: 612 },
  TABLOID: { w: 1224, h: 792 },
}

/** Área de dibujo en el XY del mundo. */
export interface PlotArea {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface PlotOptions {
  page?: PageSize
  marginPt?: number
  /** Tipos de línea del dibujo; sin él, todo continuo. */
  linetypes?: LinetypeContext
  /** Puntos de papel por unidad de dibujo. Si se omite, se ajusta al contenido (fit). */
  scale?: number
  /** Qué se plotea (Display, Window): se recorta a ella. Sin ella, las extensiones del dibujo. */
  area?: PlotArea
  /** Centrar en el papel (por defecto); si no, el área arranca en la esquina de abajo a la izquierda del margen. */
  center?: boolean
  /** Estilo de ploteo (color/monocromo/grises) y lineweights. */
  style?: PlotStyleOpts
  /** Píxeles de las imágenes; sin ellos, sólo su marco. */
  rasters?: PlotRasters
}

export interface PlotTransform {
  s: number
  ox: number
  oy: number
}

const DEFAULT_LW_MM = 0.25
/** Ancho con lineweights apagados (PAGESETUP): la línea más fina, como el CAD clásico. */
const THIN_LW_MM = 0.1

/** Estilo de ploteo de una hoja: CTB color/monocromo/grises y si se imprimen lineweights. */
export interface PlotStyleOpts {
  plotStyle: PlotStyle
  lineWeights: boolean
}

const DEFAULT_STYLE: PlotStyleOpts = { plotStyle: 'color', lineWeights: true }

function drawingBounds(entities: Entity[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let any = false
  for (const e of entities) {
    const b = entityBounds(e)
    if (!isFinite(b.minX)) continue
    any = true
    minX = Math.min(minX, b.minX)
    minY = Math.min(minY, b.minY)
    maxX = Math.max(maxX, b.maxX)
    maxY = Math.max(maxY, b.maxY)
  }
  return any ? { minX, minY, maxX, maxY } : null
}

/** Transformación mundo→papel (fit al contenido o escala fija), centrada en la página. */
export function computePlotTransform(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  page: PageSize,
  margin: number,
  scale?: number,
  center = true,
): PlotTransform {
  const spanX = Math.max(1e-6, bounds.maxX - bounds.minX)
  const spanY = Math.max(1e-6, bounds.maxY - bounds.minY)
  const availW = page.w - 2 * margin
  const availH = page.h - 2 * margin
  const s = scale ?? Math.min(availW / spanX, availH / spanY)
  // Centrado del contenido en el área imprimible (o desde su esquina de abajo a la izquierda).
  const ox = margin + (center ? (availW - spanX * s) / 2 : 0) - bounds.minX * s
  const oy = margin + (center ? (availH - spanY * s) / 2 : 0) - bounds.minY * s
  return { s, ox, oy }
}

/** Proyecta un punto de mundo (XY) a coordenadas de papel (origen abajo-izquierda, y hacia arriba). */
export function worldToPage(x: number, y: number, t: PlotTransform): [number, number] {
  return [t.ox + x * t.s, t.oy + y * t.s]
}

/** Número compacto para el content stream (3 decimales). */
export const f = (n: number): string => (Math.round(n * 1000) / 1000).toString()
/** Puntos y tramos de un patrón o de un tipo de línea: a 0,1 pt (0,035 mm), invisible en una textura; un sombreado
 *  denso tiene cientos de miles. */
const f1 = (n: number): string => (Math.round(n * 10) / 10).toString()

function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(v.slice(0, 2), 16) / 255
  const g = parseInt(v.slice(2, 4), 16) / 255
  const b = parseInt(v.slice(4, 6), 16) / 255
  return [Number.isFinite(r) ? r : 0, Number.isFinite(g) ? g : 0, Number.isFinite(b) ? b : 0]
}

/**
 * Color de tinta en el papel: el blanco (color 7 del CAD clásico) se imprime negro; monocromo → todo negro;
 * escala de grises → la luminancia del color.
 */
export function plotColor(hex: string, style: PlotStyle): [number, number, number] {
  const [r, g, b] = hexToRgb01(hex)
  if (style === 'monochrome' || (r > 0.99 && g > 0.99 && b > 0.99)) return [0, 0, 0]
  if (style === 'grayscale') {
    const y = 0.299 * r + 0.587 * g + 0.114 * b
    return [y, y, y]
  }
  return [r, g, b]
}

/**
 * Operadores de color y ancho de una capa (lineweight en mm absolutos del papel). Los tipos de línea no
 * usan el patrón de trazo del PDF: los trazos se generan como geometría, igual que en pantalla.
 */
export function strokeStyleOps(layer: Layer | undefined, style: PlotStyleOpts = DEFAULT_STYLE, own?: Pick<Entity, 'color' | 'lineWeight'>): string {
  // Color y grosor propios del objeto, o los de su capa (ByLayer).
  const [r, g, b] = plotColor((own?.color?.startsWith('#') ? own.color : undefined) ?? layer?.color ?? '#000000', style.plotStyle)
  const lw0 = own?.lineWeight !== undefined && own.lineWeight >= 0 ? own.lineWeight : layer?.lineWeight
  const lwMm = style.lineWeights ? lw0 || DEFAULT_LW_MM : THIN_LW_MM
  const lw = Math.max(0.1, lwMm * MM_TO_PT)
  return `${f(r)} ${f(g)} ${f(b)} RG\n${f(r)} ${f(g)} ${f(b)} rg\n${f(lw)} w\n[] 0 d\n`
}

/**
 * Operadores de una entidad con su estilo. Con transparencia, de verdad (lo de abajo se ve a través): un estado
 * gráfico `/GaNN` con la opacidad en %, que `pdfDocument` declara.
 */
export function entityOps(layer: Layer | undefined, style: PlotStyleOpts | undefined, own: Pick<Entity, 'color' | 'lineWeight' | 'transparency'>, body: string): string {
  if (!body) return ''
  const opacity = Math.round((1 - Math.min(1, Math.max(0, own.transparency ?? 0))) * 100)
  const ops = strokeStyleOps(layer, style, own) + body
  return opacity < 100 ? `q\n/Ga${opacity} gs\n${ops}Q\n` : ops
}

/**
 * Orden de pintado: el orden de dibujo de los objetos (lo último encima, como el CAD clásico), con los textos al final
 * como en pantalla (donde van sobre el dibujo).
 */
export type PaintLayer = 'draw' | 'text'
export const paintLayer = (e: Entity): PaintLayer => (e.type === 'TEXT' ? 'text' : 'draw')
export const paintOrder = (b: Record<PaintLayer, string>): string => b.draw + b.text

/**
 * Sombreado de una vista: cada triángulo relleno con su color, en el orden en que viene (de atrás
 * hacia adelante). En gris o monocromo se plotea su luminancia.
 */
export function shadeOps(p: ShadeProps, map: (q: Vec3) => [number, number], plotStyle: PlotStyle): string {
  let s = ''
  for (let i = 0, k = 0; i + 8 < p.tris.length; i += 9, k += 3) {
    let [r, g, b] = [p.colors[k] ?? 0.7, p.colors[k + 1] ?? 0.7, p.colors[k + 2] ?? 0.7]
    if (plotStyle !== 'color') r = g = b = 0.3 * r + 0.59 * g + 0.11 * b
    const pts = [0, 3, 6].map((o) => map([p.tris[i + o], p.tris[i + o + 1], p.tris[i + o + 2]]))
    s += `${f(r)} ${f(g)} ${f(b)} rg\n` + pts.map(([x, y], j) => `${f(x)} ${f(y)} ${j === 0 ? 'm' : 'l'}\n`).join('') + 'h\nf\n'
  }
  return s
}

/** Relleno par-impar de varios anillos (ya en puntos del PDF). */
export function fillRings(rings: Array<[number, number][]>): string {
  let s = ''
  for (const r of rings) {
    if (r.length < 3) continue
    s += r.map(([x, y], i) => `${f(x)} ${f(y)} ${i === 0 ? 'm' : 'l'}\n`).join('') + 'h\n'
  }
  return s ? s + 'f*\n' : ''
}

/**
 * Operadores de las partes "especiales" de una entidad: sombreado (patrón o relleno), banda de
 * una polilínea ancha y trazos de un tipo de línea. `map` lleva un punto de mundo a puntos del PDF.
 * Devuelve null si la entidad se traza como siempre.
 */
export function specialOps(
  e: Entity,
  layerOf: (id: string) => Layer | undefined,
  lt: LinetypeContext | undefined,
  map: (p: Vec3) => [number, number],
  clip?: { minX: number; minY: number; maxX: number; maxY: number },
): { ops: string; done: boolean } | null {
  // Los tramos (de un patrón, de un tipo de línea) van como subtrayectos de un solo trazo; los que caen fuera del
  // recorte (el contorno de un viewport) no se escriben.
  const out = (x: number, y: number) => !!clip && (x < clip.minX || x > clip.maxX || y < clip.minY || y > clip.maxY)
  const line = (pts: Vec3[]): string => {
    if (pts.length < 2) return ''
    const m = pts.map(map)
    if (clip && (m.every(([x]) => x < clip.minX) || m.every(([x]) => x > clip.maxX) || m.every(([, y]) => y < clip.minY) || m.every(([, y]) => y > clip.maxY))) return ''
    return m.map(([x, y], i) => `${f1(x)} ${f1(y)} ${i === 0 ? 'm' : 'l'}\n`).join('')
  }
  const dot = (q: Vec3): string => {
    const [x, y] = map(q)
    if (out(x, y)) return ''
    const p = `${f1(x)} ${f1(y)}`
    return `${p} m\n${p} l\n`
  }
  const stroked = (s: string) => (s ? s + 'S\n' : '')
  if (e.type === 'HATCH') {
    if (isSolidHatch(e.props)) {
      const fr = hatchFrame(e.props)
      const ops = fillRings(hatchRings(e.props, fr).map((r) => r.map((q) => map(to3(q, fr)))))
      // Máscara (WIPEOUT): del color del papel.
      return { ops: e.props.wipeout && ops ? `q\n1 1 1 rg\n${ops}Q\n` : ops, done: true }
    }
    const s = hatchStrokesCached(e.props)
    let ops = ''
    for (const [a, b] of s.segs) ops += line([a, b])
    for (const d of s.dots) ops += dot(d)
    return { ops: stroked(ops), done: true }
  }
  let ops = ''
  if (e.type === 'POLYLINE' && isWide(e.props)) {
    for (const q of polylineBand(e.props)) ops += fillRings([q.map(map)])
  }
  const dashes = lt ? entityDashes(e, entityPattern(e, layerOf, lt), lt.plinegen) : null
  if (dashes) {
    let st = ''
    for (const d of dashes.dashes) st += line(d)
    for (const d of dashes.dots) st += dot(d)
    return { ops: ops + stroked(st), done: true }
  }
  return ops ? { ops, done: false } : null
}

/** Sanea texto a Latin-1 imprimible para Helvetica (reemplaza símbolos no soportados). */
/** Caracteres de WinAnsi fuera de Latin-1 (0x80–0x9F): rayas, comillas tipográficas, €, …, •. */
const WIN_ANSI: Record<string, string> = {
  '€': '\x80', '‚': '\x82', 'ƒ': '\x83', '„': '\x84', '…': '\x85', '†': '\x86', '‡': '\x87', 'ˆ': '\x88', '‰': '\x89', 'Š': '\x8a',
  '‹': '\x8b', 'Œ': '\x8c', 'Ž': '\x8e', '‘': '\x91', '’': '\x92', '“': '\x93', '”': '\x94', '•': '\x95', '–': '\x96', '—': '\x97',
  '˜': '\x98', '™': '\x99', 'š': '\x9a', '›': '\x9b', 'œ': '\x9c', 'ž': '\x9e', 'Ÿ': '\x9f',
}
/** Símbolos que Helvetica no tiene, con su equivalente más cercano (en lugar de "?"). */
const NEAR: Record<string, string> = { '≈': '~', '≤': '<=', '≥': '>=', '−': '-', '∅': 'Ø', '⌀': 'Ø', '⌒': '', '→': '->', '←': '<-', '×': '\xd7' }

export function pdfText(s: string): string {
  return s
    .replace(/[≈≤≥−∅⌀⌒→←×]/g, (c) => NEAR[c])
    .replace(/[^\x20-\xFF]/g, (c) => WIN_ANSI[c] ?? '?')
    .replace(/([\\()])/g, '\\$1')
}

function catmullRom(cps: [number, number][], perSeg = 12): [number, number][] {
  if (cps.length < 2) return cps
  const out: [number, number][] = []
  const pt = (i: number) => cps[Math.max(0, Math.min(cps.length - 1, i))]
  for (let i = 0; i < cps.length - 1; i++) {
    const p0 = pt(i - 1)
    const p1 = pt(i)
    const p2 = pt(i + 1)
    const p3 = pt(i + 2)
    for (let k = 0; k < perSeg; k++) {
      const u = k / perSeg
      const u2 = u * u
      const u3 = u2 * u
      const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3)
      const y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3)
      out.push([x, y])
    }
  }
  out.push(cps[cps.length - 1])
  return out
}

/**
 * Texto con matriz afín (`Tm`, fuente de cuerpo 1): `u`/`v` son los ejes de la línea de base y de la
 * altura **en puntos** (ya incluyen el tamaño), `o` el origen de la línea de base. Un texto visto de
 * canto (ejes colineales) no se dibuja.
 */
export function textTm(txt: string, o: [number, number], u: [number, number], v: [number, number], font = '/F1'): string {
  if (Math.abs(u[0] * v[1] - u[1] * v[0]) < 1e-6) return ''
  return `BT\n${font} 1 Tf\n${f(u[0])} ${f(u[1])} ${f(v[0])} ${f(v[1])} ${f(o[0])} ${f(o[1])} Tm\n(${pdfText(txt)}) Tj\nET\n`
}

/** Operadores PDF de una polilínea (en mundo), trazada. */
export function polyStroke(pts: [number, number][], t: PlotTransform, closed = false): string {
  if (pts.length < 2) return ''
  const [sx, sy] = worldToPage(pts[0][0], pts[0][1], t)
  let s = `${f(sx)} ${f(sy)} m\n`
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = worldToPage(pts[i][0], pts[i][1], t)
    s += `${f(px)} ${f(py)} l\n`
  }
  return s + (closed ? 'h\nS\n' : 'S\n')
}

function circleStroke(cx: number, cy: number, r: number, t: PlotTransform): string {
  const [pcx, pcy] = worldToPage(cx, cy, t)
  const rp = r * t.s
  const k = rp * KAPPA
  return (
    `${f(pcx + rp)} ${f(pcy)} m\n` +
    `${f(pcx + rp)} ${f(pcy + k)} ${f(pcx + k)} ${f(pcy + rp)} ${f(pcx)} ${f(pcy + rp)} c\n` +
    `${f(pcx - k)} ${f(pcy + rp)} ${f(pcx - rp)} ${f(pcy + k)} ${f(pcx - rp)} ${f(pcy)} c\n` +
    `${f(pcx - rp)} ${f(pcy - k)} ${f(pcx - k)} ${f(pcy - rp)} ${f(pcx)} ${f(pcy - rp)} c\n` +
    `${f(pcx + k)} ${f(pcy - rp)} ${f(pcx + rp)} ${f(pcy - k)} ${f(pcx + rp)} ${f(pcy)} c\n` +
    'S\n'
  )
}

/** Genera el content stream (operadores) del dibujo proyectado a papel. */
export function plotContentStream(entities: Entity[], layers: Layer[], t: PlotTransform, style?: PlotStyleOpts, dim?: DimContext, lt?: LinetypeContext, rasters?: PlotRasters): string {
  const layerMap = new Map(layers.map((l) => [l.id, l]))
  const layerOf = (id: string) => layerMap.get(id)
  const toPage = (q: Vec3): [number, number] => worldToPage(q[0], q[1], t)
  const paint: Record<PaintLayer, string> = { draw: '', text: '' }
  for (const e of entities) {
    const layer = layerMap.get(e.layer)
    if (!layerShown(layer) || (layer && !layer.printable)) continue
    paint[paintLayer(e)] += entityOps(layer, style, e, entityBody(e))
  }
  return '1 J\n1 j\n' + paintOrder(paint) // extremos y uniones redondeados

  function entityBody(e: Entity): string {
    let out = ''
    if (e.type === 'SHADE') return shadeOps(e.props, toPage, style?.plotStyle ?? 'color')
    const special = specialOps(e, layerOf, lt, toPage)
    if (special) {
      out += special.ops
      if (special.done) return out
    }
    switch (e.type) {
      case 'LINE':
        out += polyStroke(lineSpan(e.props).map((p): [number, number] => [p[0], p[1]]), t)
        break
      case 'CIRCLE':
        // Un círculo fuera del plano XY se proyecta en planta como lo que es (elipse o recta).
        if (Math.abs(e.props.normal[2]) > 1 - 1e-9) out += circleStroke(e.props.center[0], e.props.center[1], e.props.radius, t)
        else out += polyStroke(tessellateArc({ ...e.props, startAngle: 0, endAngle: 0 }, 96).map((v) => [v[0], v[1]]), t, true)
        break
      case 'ARC':
        out += polyStroke(tessellateArc(e.props).map((v) => [v[0], v[1]]), t)
        break
      case 'ELLIPSE':
        // Un arco de elipse no se cierra; la elipse completa sí.
        out += polyStroke(
          ellipsePoints(e.props, 64, false).map((v) => [v[0], v[1]]),
          t,
          !isEllipseArc(e.props),
        )
        break
      case 'RECTANGLE': {
        const [x, y] = e.props.corner
        const w = e.props.width
        const h = e.props.height
        out += polyStroke([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], t, true)
        break
      }
      case 'POLYLINE':
        // Los tramos con bulge se tesselan; el anillo ya viene cerrado si corresponde.
        out += polyStroke(polylinePoints(e.props).map((v) => [v[0], v[1]]), t)
        break
      case 'REGION':
        // El contorno de cada lazo, como el CAD clásico (una región no se rellena al plotear).
        for (const l of e.props.loops) out += polyStroke(polylinePoints(loopPolyline(l, e.props.normal)).map((v) => [v[0], v[1]]), t)
        break
      case 'SPLINE':
        out += polyStroke(catmullRom(e.props.controlPoints.map((v) => [v[0], v[1]])), t)
        break
      case 'SOLID3D':
        for (const poly of solidWireframe(e.props)) out += polyStroke(poly.map((v) => [v[0], v[1]]), t)
        break
      case 'MESH3D':
        for (const poly of meshWireframe(e.props)) out += polyStroke(poly.map((v) => [v[0], v[1]]), t)
        break
      case 'TEXT': {
        if (e.props.stroke && !(e.props.runs && e.props.runs.map((r) => r.s).join('') === e.props.text)) {
          // Fuente de un trazo (SHX): sus trazos, como en pantalla.
          for (const pl of textStrokePolylines(e.props)) out += polyStroke(pl.map((q) => [q[0], q[1]]), t)
          break
        }
        // Helvetica: el alto del texto es el de sus mayúsculas, como en pantalla.
        const size = Math.max(4, (e.props.height * t.s) / fontMetrics('Helvetica').cap)
        const ls = lineSpacingOf(e.props)
        const lines = e.props.text.split('\n')
        const w = textSize(e.props).width
        const offX = e.props.justify === 'center' ? -w / 2 : e.props.justify === 'right' ? -w : 0
        if (Math.abs(e.props.rotation) > 1e-9) {
          // Texto girado: matriz afín con su rotación (en planta).
          const h = e.props.height
          const c = Math.cos(e.props.rotation)
          const sn = Math.sin(e.props.rotation)
          const [px, py] = textTop(e.props)
          lines.forEach((ln, i) => {
            const dy = -h * (BASELINE_DROP + i * ls)
            const o = worldToPage(px + offX * c - dy * sn, py + offX * sn + dy * c, t)
            const k = e.props.widthFactor ?? 1 // factor de ancho: a lo largo del renglón
            out += textTm(ln, o, [c * size * k, sn * size * k], [-sn * size, c * size], pdfFont(e.props))
          })
          break
        }
        for (let i = 0; i < lines.length; i++) {
          const top = textTop(e.props)
          const wy = top[1] - e.props.height * (BASELINE_DROP + i * ls)
          const [tx, ty] = worldToPage(top[0] + offX, wy, t)
          // Tz: escala horizontal (factor de ancho del texto, en %).
          const tz = e.props.widthFactor && Math.abs(e.props.widthFactor - 1) > 1e-6 ? `${f(e.props.widthFactor * 100)} Tz\n` : ''
          out += `BT\n${pdfFont(e.props)} ${f(size)} Tf\n${tz}${f(tx)} ${f(ty)} Td\n(${pdfText(lines[i])}) Tj\nET\n`
        }
        break
      }
      case 'DIMENSION': {
        // Texto vectorial: los trazos del texto se plotean como líneas, igual que en pantalla.
        const d = dimDisplay(e.props, dim)
        for (const [a, c] of d.lines) out += polyStroke([[a[0], a[1]], [c[0], c[1]]], t)
        const sv = e.props.style
        if (e.props.textFont && d.text.value && !d.text.value.includes('\n') && !sv.DIMTOL && !sv.DIMLIM && !sv.DIMALT) {
          // Texto con fuente TrueType (como en pantalla): Helvetica centrada en su lugar, con su giro.
          const h = d.text.height
          const size = (h * t.s) / fontMetrics('Helvetica').cap
          const w = textSize({ position: [0, 0, 0], text: d.text.value, height: h, rotation: 0, justify: 'left', normal: [0, 0, 1], font: e.props.textFont }).width
          const [dx, dy] = [d.text.dir[0], d.text.dir[1]]
          const [ux, uy] = [d.text.up[0], d.text.up[1]]
          const o = worldToPage(d.text.pos[0] - (dx * w) / 2 - (ux * h) / 2, d.text.pos[1] - (dy * w) / 2 - (uy * h) / 2, t)
          out += textTm(d.text.value, o, [dx * size, dy * size], [ux * size, uy * size])
        } else for (const st of d.textStrokes) out += polyStroke(st.map((q) => [q[0], q[1]]), t)
        for (const poly of d.fills) {
          const pts = poly.map((q) => worldToPage(q[0], q[1], t))
          out += pts.map(([x, y], i) => `${f(x)} ${f(y)} ${i === 0 ? 'm' : 'l'}\n`).join('') + 'h\nf\n'
        }
        break
      }
      case 'INSERT':
        break // las inserciones se expanden a geometría de mundo antes de trazar
      case 'VIEWPORT':
        // Sólo el marco (su contenido lo proyecta el ploteo del layout).
        out += polyStroke(viewportRing(e.props).map((v) => [v[0], v[1]]), t)
        break
      case 'IMAGE': {
        // Sus píxeles (si se cargó el archivo) y su marco.
        const name = rasters?.name(e.props)
        if (name) out += imageOps(e.props, toPage, name)
        out += polyStroke(imageRing(e.props).map((v) => [v[0], v[1]]), t)
        break
      }
    }
    return out
  }
}

function latin1Bytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

export interface PlotResult {
  bytes: Uint8Array
  transform: PlotTransform
  empty: boolean
}

/** Página de un PDF: tamaño en puntos y content stream. */
export interface PdfPage {
  w: number
  h: number
  content: string
  /** Las imágenes que usa (`/ImN`), para la vista previa. */
  images?: Map<string, PdfRaster>
}

/** Píxeles de una imagen para el PDF: RGB de 8 bits (y su alfa, si tiene transparencia), o un JPEG tal cual. */
export interface PdfRaster {
  w: number
  h: number
  rgb: Uint8Array
  alpha?: Uint8Array
  /** El archivo JPEG (RGB), que el PDF lleva sin recomprimir. */
  jpeg?: Uint8Array
}

/**
 * Imágenes de un ploteo: los píxeles de cada archivo (por sus datos) y los que usa el PDF, con un nombre `/ImN` por
 * archivo y desvanecido (el desvanecido se mezcla con el papel, como en pantalla con el fondo).
 */
export class PlotRasters {
  readonly used = new Map<string, PdfRaster>()
  private readonly names = new Map<string, string>()
  constructor(private readonly byData: Map<string, PdfRaster>) {}
  name(p: ImageProps): string | undefined {
    const r = p.data ? this.byData.get(p.data) : undefined
    if (!r) return undefined
    const fade = Math.round(Math.max(0, Math.min(100, p.fade ?? 0)))
    const key = `${fade}|${p.data}`
    let n = this.names.get(key)
    if (!n) {
      n = `Im${this.names.size}`
      this.names.set(key, n)
      this.used.set(n, fade ? { w: r.w, h: r.h, rgb: r.rgb.map((c) => Math.round(c + ((255 - c) * fade) / 100)), alpha: r.alpha } : r)
    }
    return n
  }
}

/** Una imagen en su lugar (la matriz lleva el cuadrado unidad de la imagen a sus esquinas), recortada por su marco. */
export function imageOps(p: ImageProps, map: (q: Vec3) => [number, number], name: string): string {
  const [w, h] = p.size
  const o = map(imagePoint(p, -0.5, h - 0.5))
  const r = map(imagePoint(p, w - 0.5, h - 0.5))
  const t = map(imagePoint(p, -0.5, -0.5))
  const clip = imageRing(p).map(map)
  const path = clip.map(([x, y], i) => `${f(x)} ${f(y)} ${i === 0 ? 'm' : 'l'}\n`).join('')
  return `q\n${path}h\nW n\n${f(r[0] - o[0])} ${f(r[1] - o[1])} ${f(t[0] - o[0])} ${f(t[1] - o[1])} ${f(o[0])} ${f(o[1])} cm\n/${name} Do\nQ\n`
}

/** Componentes de color de un JPEG (marcador SOF), o 0 si no se reconoce. */
function jpegComponents(b: Uint8Array): number {
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) return 0
    const m = b[i + 1]
    const len = (b[i + 2] << 8) | b[i + 3]
    if (m >= 0xc0 && m <= 0xc3) return b[i + 9]
    i += 2 + len
  }
  return 0
}

/** Helvetica, negrita, itálica y negrita itálica (`/F1`…`/F4`). */
const FONTS = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique']
export const pdfFont = (t: { bold?: boolean; italic?: boolean }): string => `/F${1 + (t.bold ? 1 : 0) + (t.italic ? 2 : 0)}`

/**
 * Documento PDF 1.4 con una o más páginas: Helvetica (con sus variantes) como fuente, los contenidos comprimidos
 * (Flate) y los estados de transparencia que usen (`/GaNN gs`, opacidad en %).
 */
export function pdfDocument(pages: PdfPage[], rasters?: PlotRasters): Uint8Array {
  // 1 catálogo, 2 árbol de páginas, 3–6 fuentes; luego por página: objeto página + su contenido; al final, las
  // imágenes (cada una con su máscara de transparencia, si tiene).
  const first = 3 + FONTS.length
  const images = [...(rasters?.used ?? new Map<string, PdfRaster>())]
  const imageObj = new Map<string, number>()
  let nextObj = first + 2 * pages.length
  for (const [name, r] of images) {
    imageObj.set(name, nextObj)
    nextObj += r.alpha ? 2 : 1
  }
  const kids = pages.map((_, i) => `${first + 2 * i} 0 R`).join(' ')
  const objects: Array<string | Uint8Array> = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    // WinAnsi: los textos van en Latin-1 (acentos, ñ, °).
    ...FONTS.map((name) => `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`),
  ]
  const fonts = FONTS.map((_, i) => `/F${i + 1} ${3 + i} 0 R`).join(' ')
  pages.forEach((p, i) => {
    const alphas = [...new Set([...p.content.matchAll(/\/Ga(\d+) gs/g)].map((m) => Number(m[1])))]
    const gs = alphas.length ? ` /ExtGState << ${alphas.map((a) => `/Ga${a} << /ca ${a / 100} /CA ${a / 100} >>`).join(' ')} >>` : ''
    const used = [...new Set([...p.content.matchAll(/\/(Im\d+) Do/g)].map((m) => m[1]))].filter((n) => imageObj.has(n))
    const xo = used.length ? ` /XObject << ${used.map((n) => `/${n} ${imageObj.get(n)} 0 R`).join(' ')} >>` : ''
    const data = zlibSync(latin1Bytes(p.content), { level: 6 })
    const head = latin1Bytes(`<< /Length ${data.length} /Filter /FlateDecode >>\nstream\n`)
    const stream = new Uint8Array(head.length + data.length + 10)
    stream.set(head)
    stream.set(data, head.length)
    stream.set(latin1Bytes('\nendstream'), head.length + data.length)
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(p.w)} ${f(p.h)}] /Contents ${first + 1 + 2 * i} 0 R /Resources << /Font << ${fonts} >>${gs}${xo} >> >>`, stream)
  })
  const streamObj = (dict: string, data: Uint8Array): Uint8Array => {
    const head = latin1Bytes(`<< ${dict} /Length ${data.length} >>\nstream\n`)
    const out = new Uint8Array(head.length + data.length + 10)
    out.set(head)
    out.set(data, head.length)
    out.set(latin1Bytes('\nendstream'), head.length + data.length)
    return out
  }
  for (const [name, r] of images) {
    const base = `/Type /XObject /Subtype /Image /Width ${r.w} /Height ${r.h} /BitsPerComponent 8`
    const mask = r.alpha ? ` /SMask ${imageObj.get(name)! + 1} 0 R` : ''
    const jpeg = r.jpeg && jpegComponents(r.jpeg) === 3 && !r.alpha
    objects.push(jpeg ? streamObj(`${base} /ColorSpace /DeviceRGB /Filter /DCTDecode`, r.jpeg!) : streamObj(`${base} /ColorSpace /DeviceRGB /Filter /FlateDecode${mask}`, zlibSync(r.rgb, { level: 6 })))
    if (r.alpha) objects.push(streamObj(`${base} /ColorSpace /DeviceGray /Filter /FlateDecode`, zlibSync(r.alpha, { level: 6 })))
  }

  const parts: Uint8Array[] = []
  let size = 0
  const put = (b: Uint8Array | string) => {
    const bytes = typeof b === 'string' ? latin1Bytes(b) : b
    parts.push(bytes)
    size += bytes.length
  }
  put('%PDF-1.4\n')
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(size)
    put(`${i + 1} 0 obj\n`)
    put(body)
    put('\nendobj\n')
  })
  const xrefOffset = size
  const n = objects.length + 1
  let tail = `xref\n0 ${n}\n0000000000 65535 f \n`
  for (const off of offsets) tail += `${off.toString().padStart(10, '0')} 00000 n \n`
  put(tail + `trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)
  const pdf = new Uint8Array(size)
  let at = 0
  for (const b of parts) {
    pdf.set(b, at)
    at += b.length
  }
  return pdf
}

/** Página del ploteo del modelo (para el PDF y su vista previa). */
export function modelPlotPage(entities: Entity[], layers: Layer[], opts: PlotOptions = {}): { page: PdfPage; transform: PlotTransform; empty: boolean } {
  const page = opts.page ?? PAGE_SIZES.A4
  const margin = opts.marginPt ?? 28 // ~1 cm
  const layerMap = new Map(layers.map((l) => [l.id, l]))
  // En su orden de dibujo: lo último que se pinta queda encima.
  const printable = entities.filter((e) => {
    const l = layerMap.get(e.layer)
    return !l || (layerShown(l) && l.printable)
  })
  const area = opts.area
  const inArea = area
    ? printable.filter((e) => {
        const b = entityBounds(e)
        return b.maxX >= area.minX && b.minX <= area.maxX && b.maxY >= area.minY && b.minY <= area.maxY
      })
    : printable
  const bounds = area ?? drawingBounds(printable) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  const transform = computePlotTransform(bounds, page, margin, opts.scale, opts.center ?? true)
  let content = inArea.length > 0 ? plotContentStream(inArea, layers, transform, opts.style, undefined, opts.linetypes, opts.rasters) : ''
  if (area && content) {
    // Lo que sale del área no se plotea (como la ventana de ploteo del CAD clásico).
    const [x0, y0] = worldToPage(area.minX, area.minY, transform)
    const [x1, y1] = worldToPage(area.maxX, area.maxY, transform)
    content = `q
${f(x0)} ${f(y0)} m
${f(x1)} ${f(y0)} l
${f(x1)} ${f(y1)} l
${f(x0)} ${f(y1)} l
h
W n
${content}Q
`
  }
  return { page: { w: page.w, h: page.h, content }, transform, empty: inArea.length === 0 }
}

/** Genera un PDF vectorial (una página) del dibujo, respetando line weight/color/printable/visible. */
export function exportPdf(entities: Entity[], layers: Layer[], opts: PlotOptions = {}): PlotResult {
  const { page, transform, empty } = modelPlotPage(entities, layers, opts)
  return { bytes: pdfDocument([page], opts.rasters), transform, empty }
}
