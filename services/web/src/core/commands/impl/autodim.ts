import type { Command, CommandContext } from '../types'
import type { DimensionProps, Entity } from '../../document/types'
import type { Vec3 } from '../../math'
import { autodim, dimensionedPositions, type DimRequest, type Geo2D, type P2 } from '../../dimension/autodim'
import { expandEntities } from '../../editing/block'
import { isDrawingView } from '../../drawing/views'
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
 * AUTODIM: acota la pieza entera de una vez. En un layout, sus vistas de dibujo (VIEWBASE): cada
 * vista con lo que no comparte con su madre (las isométricas no se acotan), en unidades del modelo
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
      parent?: string
      shared?: 'x' | 'y'
    }
    const targets: Target[] = []
    const views = ctx.doc.inPaperSpace ? ctx.doc.entities.filter(isDrawingView) : []
    if (views.length) {
      const sel = await ctx.getSelectionOrKeyword('Select drawing views to dimension or [All] <All>: ', ['All'])
      if (sel === null) return
      const ids = sel.kind === 'selection' && sel.ids.length ? new Set(sel.ids) : null
      const visible = ctx.doc.layers.find((l) => l.name.toLowerCase() === 'md_visible')?.id
      for (const v of views) {
        if (ids && !ids.has(v.id)) continue
        const view = v.props.view
        if (view.align === 'free' || (view.orientation === 'projected' && !view.parent)) continue // isométricas: no se acotan
        const kids = expandEntities([v], ctx.doc.blocks).filter((e) => !visible || e.layer === visible)
        const shared = view.align === 'h' ? 'y' : view.align === 'v' ? 'x' : undefined
        targets.push({ geo: geometry(kids), axes: { x: true, y: true }, lfac: 1 / (v.props.scale[0] || 1), z: 0, id: v.id, parent: view.parent, shared })
      }
    } else {
      const ids = await ctx.getSelection('Select objects to dimension: ')
      if (!ids || ids.length === 0) return
      const es = ids.map((id) => ctx.doc.getEntity(id)).filter((e): e is Entity => !!e)
      targets.push({ geo: geometry(es), axes: { x: true, y: true }, lfac: 1, z: 0 })
    }
    if (!targets.some((t) => t.geo.length)) {
      ctx.print('Nothing to dimension (lines, circles and arcs in plan view).')
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
    // Las madres antes que sus proyectadas: lo que acota la madre en el eje compartido no se repite.
    targets.sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0))
    const done = new Map<string, { x: number[]; y: number[] }>()
    for (const t of targets) {
      const xs = t.geo.flatMap((g) => (g.kind === 'line' ? [g.a[0], g.b[0]] : [g.c[0]]))
      const size = xs.length ? Math.max(...xs) - Math.min(...xs) : 1
      const tol = Math.max(size * 1e-4, 1e-6)
      const parentDone = t.parent ? done.get(t.parent) : undefined
      const skip = parentDone && t.shared ? { [t.shared]: parentDone[t.shared] } : undefined
      const reqs = autodim(t.geo, { type: type === 'Chain' ? 'chain' : 'baseline', features: features === 'Overall' ? 'overall' : 'all', axes: t.axes, offset, step, tol, skip })
      if (t.id) done.set(t.id, dimensionedPositions(reqs))
      for (const r of reqs) {
        ctx.doc.addEntity({ type: 'DIMENSION', layer: ctx.currentLayerId(), props: dimensionOf(ctx, r, t.lfac, t.z) })
        n++
      }
    }
    ctx.print(`${n} dimension(s) created${views.length ? ` in ${targets.length} view(s)` : ''}.`)
  },
}
