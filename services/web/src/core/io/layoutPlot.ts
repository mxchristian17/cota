import { layerShown } from '../layers/visibility'
import type { Entity, Layer, LayoutDef, ViewportProps } from '../document/types'
import type { Vec3 } from '../math'
import { solidWireframe } from '../editing/solid'
import { meshWireframe } from '../editing/mesh'
import { ellipsePoints, isEllipseArc } from '../geom/ellipse'
import { tessellateArc } from '../geom/arc'
import { polylinePoints } from '../geom/polyline'
import { LINE_SPACING, textAxes, textSize, textTop } from '../geom/text'
import { projectHiddenGroups, type Mesh } from '../projection/orthographic'
import { dimDisplay, type DimContext } from '../dimension/dimGeometry'
import { paperSizeMm } from '../layout/paper'
import { paperPerModel } from '../layout/scale'
import { viewBasis, viewportRing } from '../layout/viewport'
import { MM_TO_PT, f, pdfDocument, plotContentStream, polyStroke, specialOps, strokeStyleOps, textTm, type PdfPage, type PlotStyleOpts, type PlotTransform } from './pdf'
import type { LinetypeContext } from '../linetype/linetypes'
import { byLayerOrder } from '../layers/order'

/** Hoja a plotear: el layout con su papel y el modelo que muestran sus viewports (bloques ya expandidos). */
export interface LayoutPlotInput {
  layout: LayoutDef
  /** Entidades del papel (mm), con las inserciones expandidas. */
  paper: Entity[]
  /** Entidades del modelo, con las inserciones expandidas. */
  model: Entity[]
  layers: Layer[]
  units: string
  /** Malla teselada de un sólido/malla 3D, para plotear con líneas ocultas (la provee el render). */
  meshOf?: MeshOf
  /** Tipos de línea con la escala del papel (LTSCALE) y PSLTSCALE. */
  linetypes?: LinetypeContext
}

export type MeshOf = (e: Entity) => Mesh | null

/** ¿El viewport se plotea con líneas ocultas? (*Shade plot* Hidden, o *As displayed* con estilo sombreado/oculto). */
export function plotsHidden(vp: Pick<ViewportProps, 'shadePlot' | 'visualStyle'>): boolean {
  if (vp.shadePlot === 'hidden') return true
  return vp.shadePlot === 'asDisplayed' && (vp.visualStyle === 'hidden' || vp.visualStyle === 'shaded' || vp.visualStyle === 'shadedEdges')
}

const is3d = (e: Entity): boolean => e.type === 'SOLID3D' || e.type === 'MESH3D'

/**
 * Aristas visibles de los sólidos con eliminación de líneas ocultas (oclusión entre todos), ya en mm del
 * papel y agrupadas por capa (color/lineweight de cada entidad).
 */
function hiddenLineOps(
  solids: Entity[],
  basis: { right: Vec3; up: Vec3; out: Vec3 },
  toPaper: (u: number, v: number) => [number, number],
  layerMap: Map<string, Layer>,
  style: PlotStyleOpts,
  meshOf: MeshOf,
  clip: Box | null,
): string {
  const items = solids.flatMap((e) => {
    const m = meshOf(e)
    return m && m.faces.length ? [{ e, m }] : []
  })
  const groups = projectHiddenGroups(items.map((it) => [it.m]), basis)
  let out = ''
  items.forEach((it, i) => {
    let body = ''
    for (const s of groups[i]) {
      if (s.hidden) continue // como el CAD clásico: las aristas ocultas no se plotean
      const pts = [toPaper(s.a[0], s.a[1]), toPaper(s.b[0], s.b[1])]
      if (!clip || overlaps(boxOf(pts), clip)) body += polyStroke(pts, PAPER)
    }
    if (body) out += strokeStyleOps(layerMap.get(it.e.layer), style, it.e) + body
  })
  return out
}

/** Papel 1:1: un milímetro del papel = `MM_TO_PT` puntos, origen abajo-izquierda. */
const PAPER: PlotTransform = { s: MM_TO_PT, ox: 0, oy: 0 }
const CIRCLE_STEPS = 72

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Catmull-Rom 3D por los puntos de control (mismo trazado que la spline en pantalla y en el PDF del modelo). */
function catmullRom3(cps: Vec3[], perSeg = 12): Vec3[] {
  if (cps.length < 2) return cps
  const out: Vec3[] = []
  const at = (i: number) => cps[Math.max(0, Math.min(cps.length - 1, i))]
  for (let i = 0; i < cps.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    for (let k = 0; k < perSeg; k++) {
      const u = k / perSeg
      const u2 = u * u
      const u3 = u2 * u
      out.push([0, 1, 2].map(
        (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u3),
      ) as Vec3)
    }
  }
  out.push(cps[cps.length - 1])
  return out
}

/** Trazos 3D (polilíneas en coordenadas del modelo) de una entidad, en wireframe. Sin textos ni flechas. */
export function entityStrokes(e: Entity, dim?: DimContext): Vec3[][] {
  switch (e.type) {
    case 'LINE':
      return [[e.props.start, e.props.end]]
    case 'CIRCLE':
      return [tessellateArc({ ...e.props, startAngle: 0, endAngle: 0 }, CIRCLE_STEPS)] // en su plano
    case 'ARC':
      return [tessellateArc(e.props)]
    case 'ELLIPSE':
      return [ellipsePoints(e.props, CIRCLE_STEPS, !isEllipseArc(e.props))]
    case 'RECTANGLE': {
      const [x, y, z] = e.props.corner
      const { width: w, height: h } = e.props
      return [[[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z], [x, y, z]]]
    }
    case 'POLYLINE':
      return [polylinePoints(e.props)]
    case 'SPLINE':
      return [catmullRom3(e.props.controlPoints)]
    case 'SOLID3D':
      return solidWireframe(e.props)
    case 'MESH3D':
      return meshWireframe(e.props)
    case 'DIMENSION': {
      const d = dimDisplay(e.props, dim)
      return [...d.lines.map(([a, b]) => [a, b]), ...d.textStrokes]
    }
    default:
      return []
  }
}

type Box = { minX: number; minY: number; maxX: number; maxY: number }

const overlaps = (a: Box, b: Box): boolean => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY

function boxOf(pts: [number, number][]): Box {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const [x, y] of pts) {
    b.minX = Math.min(b.minX, x)
    b.minY = Math.min(b.minY, y)
    b.maxX = Math.max(b.maxX, x)
    b.maxY = Math.max(b.maxY, y)
  }
  return b
}

/**
 * Contenido de un viewport flotante: el modelo proyectado con la cámara del viewport (proyección
 * paralela) a su escala, recortado por su contorno con un *clipping path* del PDF (rectángulo o polígono
 * de VPCLIP) y descartando lo que cae fuera de su caja. Lineweights en mm absolutos (no escalan).
 */
export function viewportContent(
  vp: ViewportProps,
  model: Entity[],
  layers: Layer[],
  units: string,
  style: PlotStyleOpts,
  meshOf?: MeshOf,
  lt?: LinetypeContext,
): string {
  const ring = viewportRing(vp).map(([x, y]): [number, number] => [x, y])
  const clip = boxOf(ring)
  const { right, up, out: outDir } = viewBasis(vp.az, vp.el)
  const hidden = !!meshOf && plotsHidden(vp)
  const k = paperPerModel(vp.scale, units)
  // Cotas anotativas a tamaño de papel: a la escala de este viewport.
  const dim: DimContext = { annoScale: 1 / k }
  const [tx, ty, tz] = vp.target
  const proj = (p: Vec3): [number, number] => {
    const d: Vec3 = [p[0] - tx, p[1] - ty, p[2] - tz]
    return [vp.center[0] + dot(d, right) * k, vp.center[1] + dot(d, up) * k]
  }
  const layerMap = new Map(layers.map((l) => [l.id, l]))
  const frozen = new Set(vp.frozenLayers)
  const solids: Entity[] = []
  // PSLTSCALE = 1: los trazos miden en el papel lo mismo que en el espacio papel (factor en unidades de modelo).
  const ltVp = lt && (lt.psltscale ? { ...lt, factor: lt.factor / (k || 1) } : lt)
  const toPt = (p: Vec3): [number, number] => {
    const [x, y] = proj(p)
    return [x * MM_TO_PT, y * MM_TO_PT]
  }

  let out = 'q\n' + polyStroke(ring, PAPER, true).replace(/h\nS\n$/, 'h\nW n\n')
  for (const e of byLayerOrder(model, layers)) {
    const layer = layerMap.get(e.layer)
    if (!layerShown(layer) || (layer && !layer.printable) || frozen.has(e.layer)) continue
    if (hidden && is3d(e)) {
      solids.push(e)
      continue
    }
    let body = ''
    const special = specialOps(e, (id) => layerMap.get(id), ltVp, toPt)
    if (special) body += special.ops
    if (!special?.done) {
      for (const poly of entityStrokes(e, dim)) {
        const pts = poly.map(proj)
        if (pts.length >= 2 && overlaps(boxOf(pts), clip)) body += polyStroke(pts, PAPER)
      }
    }
    if (e.type === 'DIMENSION') {
      // Flechas rellenas; el texto (vectorial) ya viene como trazos en `entityStrokes`.
      for (const poly of dimDisplay(e.props, dim).fills) {
        const pts = poly.map(proj)
        if (!overlaps(boxOf(pts), clip)) continue
        body += pts.map(([x, y], i) => `${f(x * MM_TO_PT)} ${f(y * MM_TO_PT)} ${i === 0 ? 'm' : 'l'}\n`).join('') + 'h\nf\n'
      }
    }
    if (e.type === 'TEXT') {
      // Texto afín: sus ejes (línea de base y altura, con su rotación y plano) proyectados al papel.
      const t = e.props
      const { u, v } = textAxes(t)
      const toPt = (d: Vec3): [number, number] => [dot(d, right) * k * t.height * MM_TO_PT, dot(d, up) * k * t.height * MM_TO_PT]
      const w = textSize(t).width
      const offX = t.justify === 'center' ? -w / 2 : t.justify === 'right' ? -w : 0
      const top = textTop(t)
      t.text.split('\n').forEach((ln, i) => {
        const dy = -(i + 1) * t.height * LINE_SPACING + t.height * 0.25
        const o = proj([0, 1, 2].map((j) => top[j] + u[j] * offX + v[j] * dy) as Vec3)
        if (o[0] < clip.minX || o[0] > clip.maxX || o[1] < clip.minY || o[1] > clip.maxY) return
        body += textTm(ln, [o[0] * MM_TO_PT, o[1] * MM_TO_PT], toPt(u), toPt(v))
      })
    }
    if (body) out += strokeStyleOps(layer, style, e) + body
  }
  if (solids.length) {
    const t0 = dot(vp.target, right)
    const t1 = dot(vp.target, up)
    const toPaper = (a: number, b: number): [number, number] => [vp.center[0] + (a - t0) * k, vp.center[1] + (b - t1) * k]
    out += hiddenLineOps(solids, { right, up, out: outDir }, toPaper, layerMap, style, meshOf!, clip)
  }
  return out + 'Q\n'
}

/** Página PDF de un layout: hoja 1:1 en mm del papel (Page Setup), viewports y entidades del papel. */
export function layoutPage(input: LayoutPlotInput): PdfPage {
  const { layout, layers } = input
  const ps = layout.pageSetup
  const { width, height } = paperSizeMm(ps)
  const style: PlotStyleOpts = { plotStyle: ps.plotStyle, lineWeights: ps.plotLineweights }
  let views = ''
  for (const e of input.paper) {
    if (e.type === 'VIEWPORT' && e.props.on) views += viewportContent(e.props, input.model, layers, input.units, style, input.meshOf, input.linetypes)
  }
  // "Hide paperspace objects": los sólidos del papel también con líneas ocultas (vista en planta).
  const hidePaper = ps.hidePaperspaceObjects && !!input.meshOf && input.paper.some(is3d)
  const paperOrdered = byLayerOrder(input.paper, layers) // apilado de capas
  let paper = plotContentStream(hidePaper ? paperOrdered.filter((e) => !is3d(e)) : paperOrdered, layers, PAPER, style, { annoScale: 1 }, input.linetypes)
  if (hidePaper) {
    const layerMap = new Map(layers.map((l) => [l.id, l]))
    const top = { right: [1, 0, 0] as Vec3, up: [0, 1, 0] as Vec3, out: [0, 0, 1] as Vec3 }
    paper += hiddenLineOps(input.paper.filter(is3d), top, (a, b) => [a, b], layerMap, style, input.meshOf!, null)
  }
  // Extremos/uniones redondeados también para los viewports si van antes que el papel.
  const content = ps.paperspaceLast ? `1 J\n1 j\n${views}${paper}` : paper + views
  return { w: width * MM_TO_PT, h: height * MM_TO_PT, content }
}

/** PDF con una página por layout (PLOT del layout activo; PUBLISH con varios). */
export function plotLayouts(inputs: LayoutPlotInput[]): Uint8Array {
  return pdfDocument(inputs.map(layoutPage))
}
