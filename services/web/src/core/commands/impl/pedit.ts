import type { Pt, Vec3 } from '../../math'
import type { Entity, PolylineEntity, PolylineProps } from '../../document/types'
import type { Command, CommandContext } from '../types'
import type { PreviewShape } from '../../preview'
import { askKeyword, askNumber, fmt } from '../ask'
import { sysvars } from '../sysvars'
import { commonOf } from '../../document/common'
import {
  breakBetween,
  clean,
  decurvePolyline,
  fitPolyline,
  frameOf,
  insertVertex,
  joinPolyline,
  moveVertex,
  refit,
  reversePolyline,
  segmentWidth,
  setClosed,
  setGlobalWidth,
  setSegmentWidth,
  splinePolyline,
  straightenBetween,
  toPolyline,
  type JoinType,
} from '../../editing/pedit'

/**
 * PEDIT, como el CAD clásico: `Select polyline or [Multiple]`, conversión de líneas y arcos
 * (PEDITACCEPT), y `Close/Open, Join, Width, Edit vertex, Fit, Spline, Decurve, Ltype gen, Reverse, Undo`.
 * Con Multiple, Join acepta una tolerancia (*fuzz*) y el tipo de unión (Extend/Add/Both).
 */

/** Paso deshacible: estado previo de las polilíneas tocadas, entidades borradas y agregadas. */
interface Step {
  before: Array<{ id: string; props: PolylineProps }>
  removed: Entity[]
  added: string[]
}

const asPt = (v: Vec3): Pt => ({ x: v[0], y: v[1], z: v[2] })
const vec = (p: Pt): Vec3 => [p.x, p.y, p.z]

function poly(ctx: CommandContext, id: string): PolylineEntity | null {
  const e = ctx.doc.getEntity(id)
  return e?.type === 'POLYLINE' ? e : null
}

/** Convierte una LINE/ARC/RECTANGLE/SPLINE en polilínea (misma capa y tipo de línea). Devuelve el id nuevo. */
function convert(ctx: CommandContext, e: Entity, step?: Step): string | null {
  const p = toPolyline(e)
  if (!p) return null
  const added = ctx.doc.addEntity({ type: 'POLYLINE', layer: e.layer, props: p, ...commonOf(e) }).id
  step?.removed.push(structuredClone(e))
  step?.added.push(added)
  ctx.doc.removeEntity(e.id)
  ctx.doc.touch()
  return added
}

/** Marcador "X" del vértice actual (como el del CAD clásico), del tamaño relativo al dibujo de la polilínea. */
function xMarker(p: PolylineProps, i: number): PreviewShape[] {
  const pts = frameOf(p)
  const v = pts[i]
  if (!v) return []
  const xs = pts.map((q) => q[0])
  const ys = pts.map((q) => q[1])
  const r = Math.max(1e-6, 0.03 * Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)))
  return [
    { kind: 'line', a: asPt([v[0] - r, v[1] - r, v[2]]), b: asPt([v[0] + r, v[1] + r, v[2]]) },
    { kind: 'line', a: asPt([v[0] - r, v[1] + r, v[2]]), b: asPt([v[0] + r, v[1] - r, v[2]]) },
  ]
}

class PeditSession {
  readonly steps: Step[] = []
  constructor(private readonly ctx: CommandContext) {}

  begin(ids: string[]): Step {
    const step: Step = { before: [], removed: [], added: [] }
    for (const id of ids) {
      const e = poly(this.ctx, id)
      if (e) step.before.push({ id, props: structuredClone(e.props) })
    }
    this.steps.push(step)
    return step
  }

  set(id: string, props: PolylineProps): void {
    const e = poly(this.ctx, id)
    if (!e) return
    e.props = props
    this.ctx.doc.touch()
  }

  undo(): boolean {
    const s = this.steps.pop()
    if (!s) return false
    for (const id of s.added) this.ctx.doc.removeEntity(id)
    for (const e of s.removed) this.ctx.doc.restoreEntity(e)
    for (const b of s.before) {
      const e = poly(this.ctx, b.id)
      if (e) e.props = b.props
    }
    this.ctx.doc.touch()
    return true
  }
}

/** Polilínea (props) de una lista de entidades para Join, sin las cerradas. */
function chainsOf(ctx: CommandContext, ids: string[], skip: string): Array<{ id: string; p: PolylineProps; e: Entity }> {
  return ids.flatMap((id) => {
    if (id === skip) return []
    const e = ctx.doc.getEntity(id)
    if (!e || !['LINE', 'ARC', 'POLYLINE'].includes(e.type)) return []
    const p = toPolyline(e)
    return p && !p.closed ? [{ id, p, e }] : []
  })
}

/** Edit vertex: submodo con el marcador X sobre el vértice actual. */
async function editVertex(ctx: CommandContext, s: PeditSession, id: string): Promise<void> {
  let i = 0
  const KW = ['Next', 'Previous', 'Break', 'Insert', 'Move', 'Regen', 'Straighten', 'Tangent', 'Width', 'eXit']
  for (;;) {
    const e = poly(ctx, id)
    if (!e) return
    const p = e.props
    const pts = frameOf(p)
    const n = pts.length
    if (i >= n) i = n - 1
    const step = (j: number, d: number): number => (p.closed ? (j + d + n) % n : Math.min(n - 1, Math.max(0, j + d)))
    const r = await ctx.getPoint('Enter a vertex editing option [Next/Previous/Break/Insert/Move/Regen/Straighten/Tangent/Width/eXit] <N>: ', {
      base: null,
      keywords: KW,
      enterKeyword: 'Next',
      preview: () => xMarker(p, i),
    })
    if (r.kind === 'cancel') return
    if (r.kind !== 'keyword') continue
    const k = r.keyword
    if (k === 'eXit') return
    if (k === 'Next') i = step(i, 1)
    else if (k === 'Previous') i = step(i, -1)
    else if (k === 'Regen') ctx.doc.touch()
    else if (k === 'Move') {
      const q = await ctx.getPoint('Specify new location for marked vertex: ', { base: asPt(pts[i]) })
      if (q.kind !== 'point') continue
      s.begin([id])
      s.set(id, moveVertex(p, i, vec(q.point)))
    } else if (k === 'Insert') {
      const q = await ctx.getPoint('Specify location for new vertex: ', { base: asPt(pts[i]) })
      if (q.kind !== 'point') continue
      s.begin([id])
      s.set(id, insertVertex(p, i, vec(q.point)))
      i++
    } else if (k === 'Tangent') {
      const a = await ctx.getAngle('Specify direction of vertex tangent: ', { base: asPt(pts[i]) })
      if (a.kind !== 'angle') continue
      s.begin([id])
      const q = clean(p)
      q.tangents = Array.from({ length: n }, (_, j) => p.tangents?.[j] ?? null)
      q.tangents[i] = (a.deg * Math.PI) / 180
      s.set(id, q.fit ? refit(q, sysvars.SPLINETYPE, sysvars.SPLINESEGS) : q)
    } else if (k === 'Width') {
      const [w0] = segmentWidth(p, i)
      const a = await askNumber(ctx, `Specify starting width for next segment <${fmt(w0)}>: `, { def: w0, check: (v) => (v >= 0 ? null : 'Requires a non-negative number.') })
      if (a?.kind !== 'number') continue
      const b = await askNumber(ctx, `Specify ending width for next segment <${fmt(a.value)}>: `, { def: a.value, check: (v) => (v >= 0 ? null : 'Requires a non-negative number.') })
      if (b?.kind !== 'number') continue
      s.begin([id])
      s.set(id, setSegmentWidth(p, i, a.value, b.value))
    } else if (k === 'Break' || k === 'Straighten') {
      // Segundo marcador: Next/Previous hasta `Go`.
      let j = i
      let go = false
      for (;;) {
        const q = await ctx.getPoint('Enter an option [Next/Previous/Go/eXit] <N>: ', {
          base: null,
          keywords: ['Next', 'Previous', 'Go', 'eXit'],
          enterKeyword: 'Next',
          preview: () => [...xMarker(p, i), ...xMarker(p, j)],
        })
        if (q.kind !== 'keyword' || q.keyword === 'eXit') break
        if (q.keyword === 'Next') j = step(j, 1)
        else if (q.keyword === 'Previous') j = step(j, -1)
        else {
          go = true
          break
        }
      }
      if (!go) continue
      const st = s.begin([id])
      // En una ajustada se opera sobre el marco y se vuelve a ajustar.
      const base: PolylineProps = p.fit ? { vertices: pts.map((v) => [...v] as Vec3), closed: p.closed, ...(p.normal ? { normal: p.normal } : {}) } : p
      const fix = (q: PolylineProps): PolylineProps => (p.fit ? refit({ ...q, fit: p.fit, frame: q.vertices }, sysvars.SPLINETYPE, sysvars.SPLINESEGS) : q)
      if (k === 'Straighten') s.set(id, fix(straightenBetween(base, i, j)))
      else {
        const pieces = breakBetween(base, i, j)
        if (!pieces.length) continue
        s.set(id, fix(pieces[0]))
        for (const extra of pieces.slice(1)) {
          const added = ctx.doc.addEntity({ type: 'POLYLINE', layer: e.layer, props: fix(extra), ...commonOf(e) }).id
          st.added.push(added)
        }
        ctx.doc.touch()
      }
      i = 0
    }
  }
}

/** Opciones comunes (una o varias polilíneas). Devuelve false si terminó el comando. */
async function applyOption(ctx: CommandContext, s: PeditSession, k: string, ids: string[]): Promise<void> {
  const each = (fn: (p: PolylineProps) => PolylineProps): void => {
    s.begin(ids)
    for (const id of ids) {
      const e = poly(ctx, id)
      if (e) s.set(id, fn(e.props))
    }
  }
  if (k === 'Close' || k === 'Open') each((p) => {
    const q = setClosed(p, k === 'Close')
    return q.fit ? refit(q, sysvars.SPLINETYPE, sysvars.SPLINESEGS) : q
  })
  else if (k === 'Width') {
    const cur = poly(ctx, ids[0])?.props.widths?.[0]?.[0] ?? 0
    const r = await askNumber(ctx, `Specify new width for all segments <${fmt(cur)}>: `, { def: cur, check: (v) => (v >= 0 ? null : 'Requires a non-negative number.') })
    if (r?.kind === 'number') each((p) => setGlobalWidth(p, r.value))
  } else if (k === 'Fit') each(fitPolyline)
  else if (k === 'Spline') each((p) => splinePolyline(p, sysvars.SPLINETYPE, sysvars.SPLINESEGS))
  else if (k === 'Decurve') each(decurvePolyline)
  else if (k === 'Reverse') {
    each(reversePolyline)
    ctx.print(ids.length === 1 ? 'Polyline reversed.' : `${ids.length} polylines reversed.`)
  } else if (k === 'Ltype gen') {
    const cur = poly(ctx, ids[0])?.props.ltGen ? 'ON' : 'OFF'
    const r = await askKeyword(ctx, `Enter polyline linetype generation option [ON/OFF] <${cur === 'ON' ? 'On' : 'Off'}>: `, ['ON', 'OFF'], cur)
    if (r)
      each((p) => {
        const q = clean(p)
        if (r === 'ON') q.ltGen = true
        else delete q.ltGen
        return q
      })
  } else if (k === 'Undo') {
    if (!s.undo()) ctx.print('All PEDIT operations undone.')
  }
}

/** Join de una polilínea: agrega lo que toca sus extremos. */
async function joinSingle(ctx: CommandContext, s: PeditSession, id: string): Promise<void> {
  const sel = await ctx.getSelection('Select objects: ')
  ctx.app.clearSelection()
  const e = poly(ctx, id)
  if (!sel?.length || !e) return
  const chains = chainsOf(ctx, sel, id)
  const r = joinPolyline(e.props, chains)
  if (!r.used.length) {
    ctx.print('0 segments added to polyline')
    return
  }
  const st = s.begin([id])
  s.set(id, r.props)
  for (const u of r.used) {
    const x = ctx.doc.getEntity(u)
    if (x) st.removed.push(structuredClone(x))
    ctx.doc.removeEntity(u)
  }
  ctx.doc.touch()
  ctx.print(`${r.added} segment${r.added === 1 ? '' : 's'} added to polyline`)
}

/** Join de Multiple: une entre sí las polilíneas elegidas, con tolerancia y tipo de unión. */
async function joinMultiple(ctx: CommandContext, s: PeditSession, ids: string[]): Promise<string[]> {
  let jt: JoinType = 'Extend'
  let fuzz = 0
  for (;;) {
    ctx.print(`Join Type = ${jt}${jt === 'Both' ? ' (Extend or Add)' : ''}`)
    const r = await askNumber(ctx, `Enter fuzz distance or [Jointype] <${fmt(fuzz)}>: `, { def: fuzz, keywords: ['Jointype'], check: (v) => (v >= 0 ? null : 'Requires a non-negative number.') })
    if (!r) return ids
    if (r.kind === 'keyword') {
      const t = await askKeyword(ctx, `Enter join type [Extend/Add/Both] <${jt}>: `, ['Extend', 'Add', 'Both'], jt)
      if (t) jt = t as JoinType
      continue
    }
    fuzz = r.value
    break
  }
  const st = s.begin(ids)
  const pool = [...ids]
  const out: string[] = []
  let added = 0
  while (pool.length) {
    const id = pool.shift() as string
    const e = poly(ctx, id)
    if (!e) continue
    const r = joinPolyline(e.props, chainsOf(ctx, pool, id), fuzz, jt)
    if (r.used.length) {
      s.set(id, r.props)
      added += r.added
      for (const u of r.used) {
        const x = ctx.doc.getEntity(u)
        if (x) st.removed.push(structuredClone(x))
        ctx.doc.removeEntity(u)
        pool.splice(pool.indexOf(u), 1)
      }
    }
    out.push(id)
  }
  ctx.doc.touch()
  ctx.print(`${added} segment${added === 1 ? '' : 's'} added to polyline`)
  return out
}

export const peditCommand: Command = {
  name: 'PEDIT',
  planar: true,
  aliases: ['PE'],
  description: 'Edit polylines: join (with fuzz), width, vertices, fit/spline curves, decurve, linetype generation, reverse',
  async run(ctx) {
    const s = new PeditSession(ctx)
    // Preselección (doble clic o noun-verb): una polilínea va directo; varias, como Multiple.
    const pre = ctx.app.preselection?.() ?? []
    let ids: string[]
    let multiple = pre.length > 1
    if (pre.length) ids = [...pre]
    else {
      for (;;) {
        const r = await ctx.getPoint('Select polyline or [Multiple]: ', { base: null, keywords: ['Multiple'] })
        if (r.kind === 'cancel') return
        if (r.kind === 'keyword') {
          const sel = await ctx.getSelection('Select objects: ')
          if (!sel?.length) return
          ids = sel
          multiple = true
          break
        }
        if (r.pick?.id) {
          ids = [r.pick.id]
          break
        }
        ctx.print('0 found')
      }
    }
    ctx.app.clearSelection()

    if (!multiple) {
      const e = ctx.doc.getEntity(ids[0])
      if (!e) return
      let id = e.id
      if (e.type !== 'POLYLINE') {
        if (!['LINE', 'ARC', 'RECTANGLE', 'SPLINE'].includes(e.type)) {
          ctx.print('Object selected is not a polyline and cannot be converted.')
          return
        }
        if (e.type !== 'RECTANGLE' && !sysvars.PEDITACCEPT) {
          ctx.print('Object selected is not a polyline')
          const a = await askKeyword(ctx, 'Do you want to turn it into one? <Y>: ', ['Yes', 'No'], 'Yes')
          if (a !== 'Yes') return
        }
        id = convert(ctx, e) ?? id
      }
      for (;;) {
        const p = poly(ctx, id)
        if (!p) return
        const opts = [p.props.closed ? 'Open' : 'Close', 'Join', 'Width', 'Edit vertex', 'Fit', 'Spline', 'Decurve', 'Ltype gen', 'Reverse', 'Undo']
        const k = await askKeyword(ctx, `Enter an option [${opts.join('/')}]: `, opts)
        if (!k) return
        if (k === 'Join') await joinSingle(ctx, s, id)
        else if (k === 'Edit vertex') await editVertex(ctx, s, id)
        else await applyOption(ctx, s, k, [id])
      }
    }

    // Multiple: conversión de líneas, arcos y splines (PEDITACCEPT), y opciones para todas.
    const ents = ids.map((id) => ctx.doc.getEntity(id)).filter((e): e is Entity => !!e)
    const convertible: Entity[] = ents.filter((e) => e.type === 'LINE' || e.type === 'ARC' || e.type === 'SPLINE')
    let yes = true
    if (convertible.length && !sysvars.PEDITACCEPT) {
      const a = await askKeyword(ctx, 'Convert Lines, Arcs and Splines to polylines [Yes/No]? <Y>: ', ['Yes', 'No'], 'Yes')
      if (a === null) return
      yes = a === 'Yes'
    }
    let polys: string[] = []
    for (const e of ents) {
      if (e.type === 'POLYLINE') polys.push(e.id)
      else if (e.type === 'RECTANGLE' || (yes && convertible.includes(e))) {
        const n = convert(ctx, e)
        if (n) polys.push(n)
      }
    }
    if (!polys.length) {
      ctx.print('No polylines selected.')
      return
    }
    for (;;) {
      const opts = ['Close', 'Open', 'Join', 'Width', 'Fit', 'Spline', 'Decurve', 'Ltype gen', 'Reverse', 'Undo']
      const k = await askKeyword(ctx, `Enter an option [${opts.join('/')}]: `, opts)
      if (!k) return
      if (k === 'Join') polys = await joinMultiple(ctx, s, polys)
      else await applyOption(ctx, s, k, polys)
      polys = polys.filter((id) => poly(ctx, id))
    }
  },
}

/** PEDITACCEPT, SPLINETYPE y SPLINESEGS. */
export const peditVarCommands: Command[] = [
  {
    name: 'PEDITACCEPT',
    aliases: [],
    description: 'PEDIT converts lines and arcs to polylines without asking (0/1)',
    async run(ctx) {
      const r = await askNumber(ctx, `Enter new value for PEDITACCEPT <${sysvars.PEDITACCEPT}>: `, { def: sysvars.PEDITACCEPT, check: (v) => (v === 0 || v === 1 ? null : 'Requires 0 or 1.') })
      if (r?.kind === 'number') sysvars.PEDITACCEPT = r.value as 0 | 1
    },
  },
  {
    name: 'SPLINETYPE',
    aliases: [],
    description: 'PEDIT Spline curve: 5 quadratic, 6 cubic B-spline',
    async run(ctx) {
      const r = await askNumber(ctx, `Enter new value for SPLINETYPE <${sysvars.SPLINETYPE}>: `, { def: sysvars.SPLINETYPE, check: (v) => (v === 5 || v === 6 ? null : 'Requires 5 or 6.') })
      if (r?.kind === 'number') sysvars.SPLINETYPE = r.value as 5 | 6
    },
  },
  {
    name: 'SPLINESEGS',
    aliases: [],
    description: 'Segments per span of a spline-fit polyline',
    async run(ctx) {
      const r = await askNumber(ctx, `Enter new value for SPLINESEGS <${sysvars.SPLINESEGS}>: `, {
        def: sysvars.SPLINESEGS,
        check: (v) => (Number.isInteger(v) && v >= 1 && v <= 32767 ? null : 'Requires an integer between 1 and 32767.'),
      })
      if (r?.kind === 'number') sysvars.SPLINESEGS = r.value
    },
  },
]
