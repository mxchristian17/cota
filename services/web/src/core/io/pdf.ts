import { layerShown } from '../layers/visibility'
import type { Entity, Layer, PlotStyle, ShadeProps } from '../document/types'
import { entityBounds } from '../editing/bounds'
import { solidWireframe } from '../editing/solid'
import { meshWireframe } from '../editing/mesh'
import { ellipsePoints, isEllipseArc } from '../geom/ellipse'
import { tessellateArc } from '../geom/arc'
import { polylinePoints } from '../geom/polyline'
import { LINE_SPACING, textSize, textTop } from '../geom/text'
import { dimDisplay, type DimContext } from '../dimension/dimGeometry'
import { viewportRing } from '../layout/viewport'
import { byLayerOrder } from '../layers/order'
import { entityPattern, type LinetypeContext } from '../linetype/linetypes'
import { entityDashes } from '../linetype/dash'
import { hatchFrame, hatchRings, hatchStrokesCached, isSolidHatch, to3 } from '../hatch/geometry'
import { isWide, polylineBand } from '../geom/plineWidth'
import type { Vec3 } from '../math'

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
export function strokeStyleOps(layer: Layer | undefined, style: PlotStyleOpts = DEFAULT_STYLE): string {
  const [r, g, b] = plotColor(layer?.color ?? '#000000', style.plotStyle)
  const lwMm = style.lineWeights ? layer?.lineWeight || DEFAULT_LW_MM : THIN_LW_MM
  const lw = Math.max(0.1, lwMm * MM_TO_PT)
  return `${f(r)} ${f(g)} ${f(b)} RG\n${f(r)} ${f(g)} ${f(b)} rg\n${f(lw)} w\n[] 0 d\n`
}

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

/** Punto (elemento de largo 0 de un tipo de línea): trazo nulo con extremo redondo. */
export function dotStroke(x: number, y: number): string {
  return `${f(x)} ${f(y)} m\n${f(x)} ${f(y)} l\nS\n`
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
): { ops: string; done: boolean } | null {
  const line = (pts: Vec3[]): string => {
    if (pts.length < 2) return ''
    return pts.map((q, i) => {
      const [x, y] = map(q)
      return `${f(x)} ${f(y)} ${i === 0 ? 'm' : 'l'}\n`
    }).join('') + 'S\n'
  }
  if (e.type === 'HATCH') {
    if (isSolidHatch(e.props)) {
      const fr = hatchFrame(e.props)
      return { ops: fillRings(hatchRings(e.props, fr).map((r) => r.map((q) => map(to3(q, fr))))), done: true }
    }
    const s = hatchStrokesCached(e.props)
    let ops = ''
    for (const [a, b] of s.segs) ops += line([a, b])
    for (const d of s.dots) ops += dotStroke(...map(d))
    return { ops, done: true }
  }
  let ops = ''
  if (e.type === 'POLYLINE' && isWide(e.props)) {
    for (const q of polylineBand(e.props)) ops += fillRings([q.map(map)])
  }
  const dashes = lt ? entityDashes(e, entityPattern(e, layerOf, lt), lt.plinegen) : null
  if (dashes) {
    for (const d of dashes.dashes) ops += line(d)
    for (const d of dashes.dots) ops += dotStroke(...map(d))
    return { ops, done: true }
  }
  return ops ? { ops, done: false } : null
}

/** Sanea texto a Latin-1 imprimible para Helvetica (reemplaza símbolos no soportados). */
/** Caracteres de WinAnsi fuera de Latin-1 (0x80–0x9F): rayas, comillas tipográficas, €, …, •. */
const WIN_ANSI: Record<string, string> = {
  '€': '\x80', '…': '\x85', '‘': '\x91', '’': '\x92', '“': '\x93', '”': '\x94', '•': '\x95', '–': '\x96', '—': '\x97', '™': '\x99',
}

export function pdfText(s: string): string {
  return s
    .replace(/⌀/g, 'Ø')
    .replace(/⌒/g, '')
    .replace(/[€…‘’“”•–—™]/g, (c) => WIN_ANSI[c])
    .replace(/[^\x20-\xFF]/g, '?')
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
export function textTm(txt: string, o: [number, number], u: [number, number], v: [number, number]): string {
  if (Math.abs(u[0] * v[1] - u[1] * v[0]) < 1e-6) return ''
  return `BT\n/F1 1 Tf\n${f(u[0])} ${f(u[1])} ${f(v[0])} ${f(v[1])} ${f(o[0])} ${f(o[1])} Tm\n(${pdfText(txt)}) Tj\nET\n`
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
export function plotContentStream(entities: Entity[], layers: Layer[], t: PlotTransform, style?: PlotStyleOpts, dim?: DimContext, lt?: LinetypeContext): string {
  const layerMap = new Map(layers.map((l) => [l.id, l]))
  const layerOf = (id: string) => layerMap.get(id)
  const toPage = (q: Vec3): [number, number] => worldToPage(q[0], q[1], t)
  let out = '1 J\n1 j\n' // extremos y uniones redondeados
  for (const e of entities) {
    const layer = layerMap.get(e.layer)
    if (!layerShown(layer) || (layer && !layer.printable)) continue
    out += strokeStyleOps(layer, style)
    if (e.type === 'SHADE') {
      out += shadeOps(e.props, toPage, style?.plotStyle ?? 'color')
      continue
    }
    const special = specialOps(e, layerOf, lt, toPage)
    if (special) {
      out += special.ops
      if (special.done) continue
    }
    switch (e.type) {
      case 'LINE':
        out += polyStroke([[e.props.start[0], e.props.start[1]], [e.props.end[0], e.props.end[1]]], t)
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
        const size = Math.max(4, e.props.height * t.s)
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
            const dy = -(i + 1) * h * LINE_SPACING + h * 0.25
            const o = worldToPage(px + offX * c - dy * sn, py + offX * sn + dy * c, t)
            out += textTm(ln, o, [c * size, sn * size], [-sn * size, c * size])
          })
          break
        }
        for (let i = 0; i < lines.length; i++) {
          const top = textTop(e.props)
          const wy = top[1] - (i + 1) * e.props.height * LINE_SPACING + e.props.height * 0.25
          const [tx, ty] = worldToPage(top[0] + offX, wy, t)
          out += `BT\n/F1 ${f(size)} Tf\n${f(tx)} ${f(ty)} Td\n(${pdfText(lines[i])}) Tj\nET\n`
        }
        break
      }
      case 'DIMENSION': {
        // Texto vectorial: los trazos del texto se plotean como líneas, igual que en pantalla.
        const d = dimDisplay(e.props, dim)
        for (const [a, c] of d.lines) out += polyStroke([[a[0], a[1]], [c[0], c[1]]], t)
        for (const st of d.textStrokes) out += polyStroke(st.map((q) => [q[0], q[1]]), t)
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
    }
  }
  return out
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
}

/** Documento PDF 1.4 con una o más páginas (Helvetica como única fuente). */
export function pdfDocument(pages: PdfPage[]): Uint8Array {
  // 1 catálogo, 2 árbol de páginas, 3 fuente; luego por página: objeto página + su contenido.
  const kids = pages.map((_, i) => `${4 + 2 * i} 0 R`).join(' ')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    // WinAnsi: los textos van en Latin-1 (acentos, ñ, °).
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]
  pages.forEach((p, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(p.w)} ${f(p.h)}] /Contents ${5 + 2 * i} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
      `<< /Length ${latin1Bytes(p.content).length} >>\nstream\n${p.content}\nendstream`,
    )
  })

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(latin1Bytes(pdf).length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefOffset = latin1Bytes(pdf).length
  const n = objects.length + 1
  pdf += `xref\n0 ${n}\n0000000000 65535 f \n`
  for (const off of offsets) pdf += `${off.toString().padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return latin1Bytes(pdf)
}

/** Página del ploteo del modelo (para el PDF y su vista previa). */
export function modelPlotPage(entities: Entity[], layers: Layer[], opts: PlotOptions = {}): { page: PdfPage; transform: PlotTransform; empty: boolean } {
  const page = opts.page ?? PAGE_SIZES.A4
  const margin = opts.marginPt ?? 28 // ~1 cm
  const layerMap = new Map(layers.map((l) => [l.id, l]))
  // De la capa de más abajo a la de más arriba: lo último que se pinta queda encima.
  const printable = byLayerOrder(entities, layers).filter((e) => {
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
  let content = inArea.length > 0 ? plotContentStream(inArea, layers, transform, opts.style, undefined, opts.linetypes) : ''
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
  return { bytes: pdfDocument([page]), transform, empty }
}
