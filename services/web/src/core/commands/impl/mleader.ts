import { toVec3, type Pt, type Vec3 } from '../../math'
import type { DimensionEntity, DimensionProps, Entity } from '../../document/types'
import { dimDisplay } from '../../dimension/dimGeometry'
import type { PreviewShape } from '../../preview'
import { askKeyword } from '../ask'
import type { Command, CommandContext } from '../types'
import { dimNormal } from './dim'

/**
 * Multileaders: `MLEADER` (flecha o apoyo primero, contenido texto —con campos—, bloque o
 * nada, líderes de varios tramos), `MLEADEREDIT` (agregar/quitar líderes), `MLEADERALIGN`, `QLEADER` y
 * `CENTERLINE`. Se guardan como DIMENSION `MLEADER`: cada líder son sus puntos en `points` (cantidad en
 * `leaderSizes`) y `textPos` es el apoyo. Flecha, alto de texto y separación salen del estilo de cota.
 */

const toPt = (v: Vec3): Pt => ({ x: v[0], y: v[1], z: v[2] })
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

function preview(p: DimensionProps): PreviewShape[] {
  const d = dimDisplay(p)
  const segs: Array<[Vec3, Vec3]> = [...d.lines]
  for (const st of d.textStrokes) for (let i = 0; i + 1 < st.length; i++) segs.push([st[i], st[i + 1]])
  return segs.map(([a, b]) => ({ kind: 'polyline', points: [toPt(a), toPt(b)] }))
}

/** Renglones de texto (vacío termina); `\P` también corta renglón, como en MTEXT. */
async function askLines(ctx: CommandContext): Promise<string | null> {
  const lines: string[] = []
  for (;;) {
    const t = await ctx.getString(lines.length === 0 ? 'Enter text (empty line to finish): ' : `Line ${lines.length + 1}: `, { default: '' })
    if (t === null) return null
    if (t === '') break
    lines.push(...t.split('\\P'))
  }
  return lines.join('\n')
}

/** Opciones de MLEADER que persisten en la sesión (como en el CAD clásico). */
const opts = { content: 'Mtext' as 'Mtext' | 'Block' | 'None', maxPoints: 2, block: '' }

export const mleaderCommand: Command = {
  name: 'MLEADER',
  aliases: ['MLD'],
  description: 'Multileader with text (fields allowed), block or no content [leader Landing first/Content first/Options]',
  async run(ctx) {
    const base = { normal: dimNormal(ctx), ...ctx.doc.newDimStyleProps(), dimType: 'MLEADER' as const }
    let order: 'arrow' | 'landing' | 'content' = 'arrow'
    let first: Vec3 | null
    for (;;) {
      const r = await ctx.getPoint('Specify leader arrowhead location or [leader Landing first/Content first/Options] <Options>: ', {
        keywords: ['Landing', 'Content', 'Options'],
        enterKeyword: 'Options',
      })
      if (r.kind === 'cancel') return
      if (r.kind === 'point') {
        first = toVec3(r.point)
        break
      }
      if (r.keyword === 'Landing') order = 'landing'
      else if (r.keyword === 'Content') order = 'content'
      else {
        const o = await askKeyword(ctx, `Enter an option [Content type/Maxpoints/eXit options] <eXit options>: `, ['Content', 'Maxpoints', 'eXit'], 'eXit')
        if (o === 'Content') {
          const c = await askKeyword(ctx, `Select a content type [Block/Mtext/None] <${opts.content}>: `, ['Block', 'Mtext', 'None'], opts.content)
          if (c) opts.content = c as typeof opts.content
          if (opts.content === 'Block') {
            const names = ctx.doc.blocks.map((b) => b.name)
            const n = await ctx.getString(`Enter block name [${names.join(', ')}] <${opts.block || names[0] || ''}>: `, { default: opts.block || names[0] || '' })
            if (n && ctx.doc.blocks.some((b) => b.name === n.trim())) opts.block = n.trim()
            else {
              ctx.print('Block not found: content stays Mtext.')
              opts.content = 'Mtext'
            }
          }
        } else if (o === 'Maxpoints') {
          const n = await ctx.getString(`Enter the maximum points for leader line <${opts.maxPoints}>: `, { default: String(opts.maxPoints) })
          const v = Number(n)
          if (Number.isInteger(v) && v >= 2) opts.maxPoints = v
        }
      }
    }
    let text = ''
    if (order === 'content' && opts.content === 'Mtext') {
      const t = await askLines(ctx)
      if (t === null) return
      text = t
    }
    // Puntos del líder (flecha → intermedios) y apoyo.
    const leader: Vec3[] = []
    let landing: Vec3
    if (order === 'landing') {
      landing = first
      const a = await ctx.getPoint('Specify leader arrowhead location: ', {
        base: toPt(landing),
        preview: (c) => preview({ ...base, points: [toVec3(c)], textPos: landing, textOverride: text || null }),
      })
      if (a.kind !== 'point') return
      leader.push(toVec3(a.point))
    } else {
      leader.push(first)
      for (let i = 2; i < opts.maxPoints; i++) {
        const nxt = await ctx.getPoint('Specify next leader point or <landing>: ', { base: toPt(leader[leader.length - 1]) })
        if (nxt.kind !== 'point') break
        leader.push(toVec3(nxt.point))
      }
      const l = await ctx.getPoint('Specify leader landing location: ', {
        base: toPt(leader[leader.length - 1]),
        preview: (c) => preview({ ...base, points: leader, leaderSizes: [leader.length], textPos: toVec3(c), textOverride: text || null }),
      })
      if (l.kind !== 'point') return
      landing = toVec3(l.point)
    }
    if (order !== 'content' && opts.content === 'Mtext') {
      const t = await askLines(ctx)
      if (t === null) return
      text = t
    }
    const props: DimensionProps = { ...base, points: leader, leaderSizes: [leader.length], textPos: landing, textOverride: text || null }
    if (opts.content === 'Block' && opts.block) props.blockName = opts.block
    ctx.doc.addEntity({ type: 'DIMENSION', layer: ctx.currentLayerId(), props })
    if (opts.content === 'Block' && opts.block) {
      // Contenido de bloque: una inserción junto al apoyo (lado del texto).
      const side = landing[0] >= leader[leader.length - 1][0] ? 1 : -1
      const asz = base.style.DIMASZ
      ctx.doc.addEntity({ type: 'INSERT', layer: ctx.currentLayerId(), props: { name: opts.block, position: [landing[0] + side * asz * 2, landing[1], landing[2]], scale: [1, 1, 1], rotation: 0 } })
    }
  },
}

/** Elige un multileader (o líder) con un clic. */
async function pickLeader(ctx: CommandContext, prompt: string): Promise<DimensionEntity | null> {
  for (;;) {
    const r = await ctx.getPoint(prompt, { base: null })
    if (r.kind !== 'point') return null
    const e = r.pick?.id ? ctx.doc.getEntity(r.pick.id) : undefined
    if (e?.type === 'DIMENSION' && (e.props.dimType === 'MLEADER' || e.props.dimType === 'LEADER')) return e
    ctx.print('Select a multileader.')
  }
}

export const mleaderEditCommand: Command = {
  name: 'MLEADEREDIT',
  aliases: ['MLE'],
  description: 'Add or remove leaders of a multileader [Add leader/Remove leaders]',
  async run(ctx) {
    const e = await pickLeader(ctx, 'Select a multileader: ')
    if (!e) return
    const p = e.props
    if (p.dimType === 'LEADER') p.dimType = 'MLEADER'
    const sizes = p.leaderSizes ?? [p.points.length]
    const op = await askKeyword(ctx, 'Specify leader arrowhead location or [Remove leaders] <Add leader>: ', ['Add', 'Remove'], 'Add')
    if (!op) return
    if (op === 'Add') {
      for (;;) {
        const r = await ctx.getPoint('Specify leader arrowhead location: ', {
          base: toPt(p.textPos),
          preview: (c) => preview({ ...p, points: [...p.points, toVec3(c)], leaderSizes: [...sizes, 1] }),
        })
        if (r.kind !== 'point') break
        p.points = [...p.points, toVec3(r.point)]
        sizes.push(1)
        p.leaderSizes = [...sizes]
        ctx.doc.touch()
      }
      return
    }
    for (;;) {
      const r = await ctx.getPoint('Specify leaders to remove: ', { base: null })
      if (r.kind !== 'point') break
      if (sizes.length <= 1) {
        ctx.print('A multileader needs at least one leader.')
        break
      }
      // Líder cuya flecha está más cerca del clic.
      let off = 0
      let best = -1
      let bd = Infinity
      sizes.forEach((n, i) => {
        const d = dist(p.points[off], toVec3(r.point))
        if (d < bd) {
          bd = d
          best = i
        }
        off += n
      })
      const start = sizes.slice(0, best).reduce((a, b) => a + b, 0)
      p.points = p.points.filter((_, i) => i < start || i >= start + sizes[best])
      sizes.splice(best, 1)
      p.leaderSizes = [...sizes]
      ctx.doc.touch()
    }
  },
}

export const mleaderAlignCommand: Command = {
  name: 'MLEADERALIGN',
  aliases: ['MLA'],
  description: 'Align multileaders along a direction from a base multileader (current spacing)',
  async run(ctx) {
    const ids = await ctx.getSelection('Select multileaders: ')
    if (!ids?.length) return
    const base = await pickLeader(ctx, 'Select multileader to align to: ')
    if (!base) return
    const o = base.props.textPos
    const d = await ctx.getPoint('Specify direction: ', { base: toPt(o) })
    if (d.kind !== 'point') return
    const dir = toVec3(d.point)
    const v: Vec3 = [dir[0] - o[0], dir[1] - o[1], dir[2] - o[2]]
    const L = Math.hypot(v[0], v[1], v[2])
    if (L < 1e-9) return
    const u: Vec3 = [v[0] / L, v[1] / L, v[2] / L]
    let n = 0
    for (const id of ids) {
      const e = ctx.doc.getEntity(id)
      if (e?.type !== 'DIMENSION' || e.id === base.id || (e.props.dimType !== 'MLEADER' && e.props.dimType !== 'LEADER')) continue
      const t = e.props.textPos
      const s = (t[0] - o[0]) * u[0] + (t[1] - o[1]) * u[1] + (t[2] - o[2]) * u[2]
      e.props.textPos = [o[0] + u[0] * s, o[1] + u[1] * s, o[2] + u[2] * s]
      n++
    }
    ctx.doc.touch()
    ctx.print(`${n} multileader(s) aligned.`)
  },
}

export const qleaderCommand: Command = {
  name: 'QLEADER',
  aliases: ['LE'],
  description: 'Quick leader: points and text (creates a multileader)',
  async run(ctx) {
    const base = { normal: dimNormal(ctx), ...ctx.doc.newDimStyleProps(), dimType: 'MLEADER' as const }
    const a = await ctx.getPoint('Specify first leader point: ')
    if (a.kind !== 'point') return
    const pts: Vec3[] = [toVec3(a.point)]
    for (;;) {
      const prev = pts[pts.length - 1]
      const r = await ctx.getPoint('Specify next point: ', {
        base: toPt(prev),
        preview: (c) => preview({ ...base, points: pts, leaderSizes: [pts.length], textPos: toVec3(c) }),
      })
      if (r.kind !== 'point') break
      pts.push(toVec3(r.point))
    }
    if (pts.length < 2) return
    const text = await askLines(ctx)
    if (text === null) return
    const landing = pts.pop() as Vec3
    ctx.doc.addEntity({ type: 'DIMENSION', layer: ctx.currentLayerId(), props: { ...base, points: pts, leaderSizes: [pts.length], textPos: landing, textOverride: text || null } })
  },
}

export const mleaderStyleCommand: Command = {
  name: 'MLEADERSTYLE',
  aliases: ['MLS'],
  description: 'Multileader style: multileaders use the leader arrow (DIMLDRBLK), arrow size and text of the dimension style',
  async run(ctx) {
    ctx.print('Multileaders use the leader arrowhead (DIMLDRBLK), arrow size and text settings of the current dimension style.')
    ctx.app.openDimStyle()
  },
}

/** Línea (o tramo recto) elegida, para CENTERLINE. */
function lineOf(e: Entity, at: Vec3): [Vec3, Vec3] | null {
  if (e.type === 'LINE') return [e.props.start, e.props.end]
  if (e.type === 'POLYLINE' || e.type === 'RECTANGLE') {
    const verts: Vec3[] =
      e.type === 'POLYLINE'
        ? e.props.vertices
        : (() => {
            const [x, y, z] = e.props.corner
            return [[x, y, z], [x + e.props.width, y, z], [x + e.props.width, y + e.props.height, z], [x, y + e.props.height, z]] as Vec3[]
          })()
    const closed = e.type === 'RECTANGLE' || e.props.closed
    let best: [Vec3, Vec3] | null = null
    let bd = Infinity
    for (let i = 0; i + (closed ? 0 : 1) < verts.length; i++) {
      const a = verts[i]
      const b = verts[(i + 1) % verts.length]
      const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1
      const t = Math.max(0, Math.min(1, ((at[0] - a[0]) * ab[0] + (at[1] - a[1]) * ab[1] + (at[2] - a[2]) * ab[2]) / L2))
      const d = dist(at, [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]])
      if (d < bd) {
        bd = d
        best = [a, b]
      }
    }
    return best
  }
  return null
}

export const centerlineCommand: Command = {
  name: 'CENTERLINE',
  aliases: [],
  description: 'Associative center line between two lines',
  async run(ctx) {
    const pick = async (prompt: string): Promise<{ e: Entity; seg: [Vec3, Vec3] } | null> => {
      for (;;) {
        const r = await ctx.getPoint(prompt, { base: null })
        if (r.kind !== 'point') return null
        const e = r.pick?.id ? ctx.doc.getEntity(r.pick.id) : undefined
        const seg = e ? lineOf(e, toVec3(r.point)) : null
        if (e && seg) return { e, seg }
        ctx.print('Select a line.')
      }
    }
    const a = await pick('Select first line: ')
    if (!a) return
    const b = await pick('Select second line: ')
    if (!b) return
    const assoc =
      a.e.type === 'LINE' && b.e.type === 'LINE'
        ? [{ id: a.e.id, kind: 'start' as const }, { id: a.e.id, kind: 'end' as const }, { id: b.e.id, kind: 'start' as const }, { id: b.e.id, kind: 'end' as const }]
        : undefined
    ctx.doc.addEntity({
      type: 'DIMENSION',
      layer: ctx.currentLayerId(),
      props: { normal: dimNormal(ctx), ...ctx.doc.newDimStyleProps(), dimType: 'CENTERLINE', points: [...a.seg, ...b.seg], textPos: a.seg[0], ...(assoc ? { assoc } : {}) },
    })
  },
}
