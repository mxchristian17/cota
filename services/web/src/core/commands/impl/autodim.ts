import type { Command, CommandContext } from '../types'
import type { DimensionProps, Entity } from '../../document/types'
import type { Vec3 } from '../../math'
import { autodim, dimensionedPositions, type DimRequest, type Geo2D, type P2 } from '../../dimension/autodim'
import { expandEntities } from '../../editing/block'
import { entityBounds, type Box } from '../../editing/bounds'
import { printableArea } from '../../layout/paper'
import { isDrawingView } from '../../drawing/views'
import type { ProjBasis } from '../../projection/orthographic'
import { bulgeArc, bulgeAt, polylineSpans } from '../../geom/polyline'
import { askKeyword } from '../ask'

/** Geometría 2D (plano XY) de entidades: líneas, polilíneas, rectángulos, círculos y arcos en planta. */
function geometry(entities: Entity[]): Geo2D[] {
  const out: Geo2D[] = []
  const flat = (n?: Vec3) => !n || (Math.abs(n[0]) < 1e-9 && Math.abs(n[1]) < 1e-9)
  for (const e of entities) {
    switch (e.type) {
      case 'LINE':
        out.push({ kind: 'line', a: [e.props.start[0], e.props.start[1]], b: [e.props.end[0], e.props.end[1]] })
        break
      case 'CIRCLE':
        if (flat(e.props.normal)) out.push({ kind: 'circle', c: [e.props.center[0], e.props.center[1]], r: e.props.radius })
        break
      case 'ARC':
        if (flat(e.props.normal)) {
          const cw = (e.props.normal?.[2] ?? 1) < 0
          out.push({ kind: 'arc', c: [e.props.center[0], e.props.center[1]], r: e.props.radius, a0: cw ? -e.props.endAngle : e.props.startAngle, a1: cw ? -e.props.startAngle : e.props.endAngle })
        }
        break
      case 'RECTANGLE': {
        const [x, y] = e.props.corner
        const { width: w, height: h } = e.props
        const c: P2[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
        c.forEach((p, i) => out.push({ kind: 'line', a: p, b: c[(i + 1) % 4] }))
        break
      }
      case 'POLYLINE':
        if (!flat(e.props.normal)) break
        for (const [i, j] of polylineSpans(e.props)) {
          const a = e.props.vertices[i]
          const b = e.props.vertices[j]
          const arc = bulgeArc(a, b, bulgeAt(e.props, i), e.props.normal)
          if (arc) out.push({ kind: 'arc', c: [arc.center[0], arc.center[1]], r: arc.radius, a0: arc.startAngle, a1: arc.endAngle })
          else out.push({ kind: 'line', a: [a[0], a[1]], b: [b[0], b[1]] })
        }
        break
    }
  }
  return out
}

/** Caja (en planta) de un grupo de entidades. */
function boxOf(es: Entity[]): Box {
  const b: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const e of es) {
    const eb = entityBounds(e)
    b.minX = Math.min(b.minX, eb.minX)
    b.minY = Math.min(b.minY, eb.minY)
    b.maxX = Math.max(b.maxX, eb.maxX)
    b.maxY = Math.max(b.maxY, eb.maxY)
  }
  return b
}
const sameBox = (a: Box, b: Box) => Math.abs(a.minX - b.minX) + Math.abs(a.minY - b.minY) + Math.abs(a.maxX - b.maxX) + Math.abs(a.maxY - b.maxY) < 1e-9

/**
 * Lugar libre a cada lado de la caja `b` de una vista: hasta la caja más cercana de `others` que se le enfrenta (en la
 * franja de la vista) o hasta el borde del área imprimible.
 */
function roomAround(b: Box, others: Box[], sheet: Box): { below: number; above: number; left: number; right: number } {
  const overlapX = (o: Box) => o.maxX > b.minX && o.minX < b.maxX
  const overlapY = (o: Box) => o.maxY > b.minY && o.minY < b.maxY
  let below = b.minY - sheet.minY
  let above = sheet.maxY - b.maxY
  let left = b.minX - sheet.minX
  let right = sheet.maxX - b.maxX
  for (const o of others) {
    if (overlapX(o) && o.maxY <= b.minY + 1e-9) below = Math.min(below, b.minY - o.maxY)
    if (overlapX(o) && o.minY >= b.maxY - 1e-9) above = Math.min(above, o.minY - b.maxY)
    if (overlapY(o) && o.maxX <= b.minX + 1e-9) left = Math.min(left, b.minX - o.maxX)
    if (overlapY(o) && o.minX >= b.maxX - 1e-9) right = Math.min(right, o.minX - b.maxX)
  }
  return { below: Math.max(0, below), above: Math.max(0, above), left: Math.max(0, left), right: Math.max(0, right) }
}

/** Cota de un pedido, en el estilo actual; `lfac` lleva la medida del papel a unidades del modelo. */
function dimensionOf(ctx: CommandContext, r: DimRequest, lfac: number, z: number): DimensionProps {
  const base = ctx.doc.newDimStyleProps()
  const scaled = lfac !== 1
  const style = scaled ? { ...base.style, DIMLFAC: lfac } : base.style
  const overrides = scaled ? { ...(base.overrides ?? {}), DIMLFAC: lfac } : base.overrides
  const v = (p: P2): Vec3 => [p[0], p[1], z]
  const common = { ...base, style, ...(overrides ? { overrides } : {}), normal: [0, 0, 1] as Vec3 }
  if (r.kind === 'linear') return { ...common, dimType: 'LINEAR', points: [v(r.p1), v(r.p2)], textPos: v(r.at), rotation: r.axis === 'x' ? 0 : 90 }
  return {
    ...common,
    dimType: r.kind === 'diameter' ? 'DIAMETER' : 'RADIUS',
    points: [v(r.c), v(r.on)],
    textPos: v(r.at),
    ...(r.count > 1 ? { textOverride: `${r.count}× <>` } : {}),
  }
}

/**
 * ¿La vista mira a lo largo de un eje del modelo (frente, planta, laterales…)? Sólo ahí las longitudes están en
 * verdadera magnitud: las isométricas y axonométricas (base, proyectadas en diagonal o desde una isométrica) no
 * se acotan. Se decide por la dirección de la vista, no por cómo se creó.
 */
function isOrthographicView(b: ProjBasis): boolean {
  return Math.max(Math.abs(b.out[0]), Math.abs(b.out[1]), Math.abs(b.out[2])) > 1 - 1e-6
}

/**
 * AUTODIM: acota la pieza entera de una vez. En un layout, sus vistas de dibujo (VIEWBASE): cada
 * vista ortogonal con lo que no comparte con su madre (las isométricas se saltean y se informan), en unidades del modelo
 * (DIMLFAC = 1/escala). En el modelo, la geometría 2D elegida. Ver `core/dimension/autodim.ts`.
 */
export const autodimCommand: Command = {
  name: 'AUTODIM',
  aliases: ['ADIM'],
  description: 'Dimension a part automatically: overall sizes, steps, hole positions, diameters and radii',
  async run(ctx) {
    interface Target {
      geo: Geo2D[]
      axes: { x: boolean; y: boolean }
      lfac: number
      z: number
      /** Vista y vista madre (las proyectadas no repiten lo acotado en su madre en el eje que comparten). */
      id?: string
      /** Caja de la vista en la hoja (para el lugar libre alrededor). */
      box?: Box
      parent?: string
      shared?: 'x' | 'y'
    }
    const targets: Target[] = []
    let skipped = 0
    const views = ctx.doc.inPaperSpace ? ctx.doc.entities.filter(isDrawingView) : []
    if (views.length) {
      // Un intento de selección que no encontró nada no acota todas las vistas: se vuelve a pedir (B12).
      let ids: Set<string> | null = null
      for (;;) {
        const sel = await ctx.getSelectionOrKeyword('Select drawing views to dimension or [All] <All>: ', ['All'])
        if (sel === null) return
        if (sel.kind === 'selection' && sel.ids.length) ids = new Set(sel.ids)
        else if (sel.kind === 'selection' && sel.tried) {
          ctx.print('Nothing selected. Select the views to dimension, or press Enter for all of them.')
          continue
        }
        break
      }
      if (ids && ![...ids].some((id) => isDrawingView(ctx.doc.getEntity(id)))) {
        ctx.print('No drawing views in the selection.')
        return
      }
      const visible = ctx.doc.layers.find((l) => l.name.toLowerCase() === 'md_visible')?.id
      for (const v of views) {
        if (ids && !ids.has(v.id)) continue
        const view = v.props.view
        if (!isOrthographicView(view.basis)) {
          skipped++ // isométricas/axonométricas: no se acotan (sus medidas no son las de la pieza)
          continue
        }
        const kids = expandEntities([v], ctx.doc.blocks).filter((e) => !visible || e.layer === visible)
        const shared = view.align === 'h' ? 'y' : view.align === 'v' ? 'x' : undefined
        targets.push({ geo: geometry(kids), axes: { x: true, y: true }, lfac: 1 / (v.props.scale[0] || 1), z: 0, id: v.id, parent: view.parent, shared, box: boxOf(expandEntities([v], ctx.doc.blocks)) })
      }
    } else {
      const ids = await ctx.getSelection('Select objects to dimension: ')
      if (!ids || ids.length === 0) return
      const es = ids.map((id) => ctx.doc.getEntity(id)).filter((e): e is Entity => !!e)
      targets.push({ geo: geometry(es), axes: { x: true, y: true }, lfac: 1, z: 0 })
    }
    const skippedNote = skipped ? `${skipped} isometric view(s) skipped (only orthographic views are dimensioned)` : ''
    if (!targets.some((t) => t.geo.length)) {
      ctx.print(skippedNote ? `Nothing to dimension: ${skippedNote}.` : 'Nothing to dimension (lines, circles and arcs in plan view).')
      return
    }
    const type = await askKeyword(ctx, 'Type [Baseline/Chain] <Baseline>: ', ['Baseline', 'Chain'], 'Baseline')
    if (!type) return
    const features = await askKeyword(ctx, 'Features [All/Overall] <All>: ', ['All', 'Overall'], 'All')
    if (!features) return

    const st = ctx.doc.newDimStyleProps().style
    const k = st.DIMSCALE || 1
    const offset = 3 * st.DIMTXT * k
    const step = Math.max(st.DIMDLI, 2 * st.DIMTXT) * 1.4 * k
    let n = 0
    let dropped = 0
    // Lugar libre de cada vista: hasta las otras vistas, el rótulo, las cotas ya puestas y el área imprimible (B06).
    const layout = ctx.doc.inPaperSpace ? ctx.doc.activeLayout : undefined
    const sheet = layout ? printableArea(layout.pageSetup) : null
    const obstacles: Box[] = layout
      ? ctx.doc.entities.flatMap((e) => (e.type === 'INSERT' || e.type === 'DIMENSION' ? [boxOf(expandEntities([e], ctx.doc.blocks))] : [])).filter((b) => Number.isFinite(b.minX))
      : []
    // Ancho de un texto de cota (en la hoja): cifras de la medida en unidades del modelo.
    const textWidth = (lfac: number) => (span: number) => (String(Number((span * lfac).toFixed(st.DIMDEC ?? 2))).length + 1) * st.DIMTXT * k * 0.8
    // Las madres antes que sus proyectadas: lo que acota la madre en el eje compartido no se repite.
    targets.sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0))
    const done = new Map<string, { x: number[]; y: number[] }>()
    for (const t of targets) {
      const xs = t.geo.flatMap((g) => (g.kind === 'line' ? [g.a[0], g.b[0]] : [g.c[0]]))
      const size = xs.length ? Math.max(...xs) - Math.min(...xs) : 1
      const tol = Math.max(size * 1e-4, 1e-6)
      const parentDone = t.parent ? done.get(t.parent) : undefined
      const skip = parentDone && t.shared ? { [t.shared]: parentDone[t.shared] } : undefined
      const room = t.box && sheet ? roomAround(t.box, obstacles.filter((b) => b !== t.box && !sameBox(b, t.box!)), sheet) : undefined
      const reqs = autodim(t.geo, {
        type: type === 'Chain' ? 'chain' : 'baseline',
        features: features === 'Overall' ? 'overall' : 'all',
        axes: t.axes,
        offset,
        step,
        tol,
        skip,
        room,
        textWidth: textWidth(t.lfac),
        onPlan: (_axis, plan) => (dropped += plan.dropped),
      })
      if (t.id) done.set(t.id, dimensionedPositions(reqs))
      for (const r of reqs) {
        const e = ctx.doc.addEntity({ type: 'DIMENSION', layer: ctx.currentLayerId(), props: dimensionOf(ctx, r, t.lfac, t.z) })
        if (layout) obstacles.push(boxOf([e]))
        n++
      }
    }
    ctx.print(`${n} dimension(s) created${views.length ? ` in ${targets.length} view(s)` : ''}${skippedNote ? `; ${skippedNote}` : ''}.`)
    if (dropped) ctx.print(`${dropped} position(s) left out: no room around the view (move the views apart or use Chain).`)
  },
}
