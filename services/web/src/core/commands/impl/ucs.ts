import type { Entity } from '../../document/types'
import type { Pt, Vec3 } from '../../math'
import { pt } from '../../math'
import { arcBasis, arcPointAtAngle } from '../../geom/arc'
import { vcross, vdist, vdot, vnorm, vscale, vsub } from '../../geom/vec3'
import { faceUcsAt } from '../../editing/faceUcs'
import { visibleEntities } from '../selectionSets'
import { linearDir } from '../../dimension/dimGeometry'
import {
  isWorldUcs,
  orthonormal,
  rotateUcs,
  ucsFrom3Points,
  ucsFromView,
  ucsFromZAxis,
  ucsToDef,
  ucsToWorld,
  ucsZ,
  normalizeUcs,
  WORLD_UCS,
  type Ucs,
} from '../../ucs'
import { askKeyword, askNumber } from '../ask'
import { matchKeyword } from '../keywords'
import { sysvars } from '../sysvars'
import type { Command, CommandContext } from '../types'

const ORTHO_NAMES = ['Top', 'Bottom', 'Front', 'Back', 'Left', 'Right']
const OPTIONS = ['Face', 'NAmed', 'OBject', 'Previous', 'View', 'World', 'X', 'Y', 'Z', 'ZAxis']
const v3 = (p: Pt): Vec3 => [p.x, p.y, p.z]
const P = (v: Vec3): Pt => pt(v[0], v[1], v[2])

const current = (ctx: CommandContext): Ucs => ctx.app.getUcs?.() ?? WORLD_UCS

/** Aplica la UCS nueva (con nombre si es una guardada o World). */
function apply(ctx: CommandContext, u: Ucs, name?: string): void {
  ctx.app.setUcs(u, name ?? (isWorldUcs(u) ? 'World' : undefined))
}

/** `Current ucs name: *WORLD*` / `*NO NAME*` / nombre, como el CAD clásico. */
function currentName(ctx: CommandContext): string {
  const n = ctx.app.ucsName?.()
  if (isWorldUcs(current(ctx))) return '*WORLD*'
  if (n && ORTHO_NAMES.includes(n)) return `*${n.toUpperCase()}*`
  return n ? n : '*NO NAME*'
}

/** UCS Face: alinea a la cara plana de un sólido bajo el punto; X a lo largo de su arista más cercana. */
function faceUcs(ctx: CommandContext, p: Pt, skip = 0): Ucs | null {
  const ray = ctx.app.viewRay?.(p)
  const o: Vec3 = ray ? ray.origin : [p.x, p.y, p.z + 1e6]
  const d: Vec3 = ray ? ray.dir : [0, 0, -1]
  const hit = faceUcsAt(visibleEntities(ctx.doc), o, d, skip, current(ctx).x)
  if (hit && !hit.planar) ctx.print('The face must be planar.')
  return hit?.planar ? hit.ucs : null
}

/** UCS OBject: alinea al objeto según las reglas del CAD clásico (origen y X propios de cada tipo). */
function objectUcs(ctx: CommandContext, e: Entity, pick: Pt): Ucs | null {
  const cur = current(ctx)
  const fromNormal = (origin: Vec3, n: Vec3, xDir: Vec3): Ucs | null => {
    const x = vsub(xDir, vscale(vnorm(n), vdot(xDir, vnorm(n))))
    return orthonormal(P(origin), x, vcross(vnorm(n), vnorm(x)))
  }
  switch (e.type) {
    case 'LINE': {
      const [s, t] = vdist(e.props.start, v3(pick)) <= vdist(e.props.end, v3(pick)) ? [e.props.start, e.props.end] : [e.props.end, e.props.start]
      const x = vsub(t, s)
      // La línea queda sobre la X; la Z, lo más parecida a la actual.
      const z = ucsZ(cur)
      const y = vcross(z, vnorm(x))
      return orthonormal(P(s), x, Math.hypot(...y) > 1e-9 ? y : cur.y)
    }
    case 'CIRCLE':
    case 'ARC': {
      const c = e.props.center
      const d = vsub(v3(pick), c)
      const dir = Math.hypot(...d) > 1e-9 ? d : e.type === 'ARC' ? vsub(arcPointAtAngle(e.props, e.props.startAngle), c) : arcBasis(e.props.normal).u
      return fromNormal(c, e.props.normal, dir)
    }
    case 'ELLIPSE':
      return fromNormal(e.props.center, e.props.normal, e.props.major)
    case 'TEXT':
    case 'ATTDEF': {
      const b = arcBasis(e.props.normal)
      const r = e.props.rotation
      return fromNormal(e.props.position, e.props.normal, [0, 1, 2].map((i) => b.u[i] * Math.cos(r) + b.v[i] * Math.sin(r)) as Vec3)
    }
    case 'POLYLINE': {
      const v = e.props.vertices
      if (v.length < 2) return null
      return fromNormal(v[0], e.props.normal ?? [0, 0, 1], vsub(v[1], v[0]))
    }
    case 'RECTANGLE':
      return fromNormal(e.props.corner, [0, 0, 1], [1, 0, 0])
    case 'DIMENSION': {
      const n = e.props.normal ?? [0, 0, 1]
      return fromNormal(e.props.textPos, n, e.props.dimType === 'LINEAR' || e.props.dimType === 'ALIGNED' ? linearDir(e.props) : arcBasis(n).u)
    }
    case 'INSERT':
      return fromNormal(e.props.position, [0, 0, 1], [Math.cos(e.props.rotation), Math.sin(e.props.rotation), 0])
    default:
      ctx.print('Cannot align UCS to that object.')
      return null
  }
}

async function named(ctx: CommandContext): Promise<void> {
  const opt = await askKeyword(ctx, 'Enter an option [Restore/Save/Delete/?]: ', ['Restore', 'Save', 'Delete', '?'])
  if (!opt) return
  const list = () => {
    const all = ctx.doc.namedUcs()
    ctx.print(all.length ? `Saved UCSs: ${all.map((u) => u.name).join(', ')}` : 'No saved UCSs.')
  }
  if (opt === '?') return list()
  if (opt === 'Save') {
    const name = await ctx.getString('Enter name to save current UCS or [?]: ')
    if (!name?.trim()) return
    if (name.trim() === '?') return list()
    if (!/^[\w\- $]+$/.test(name.trim())) return ctx.print('Invalid UCS name.')
    ctx.doc.saveNamedUcs(name, ucsToDef(current(ctx)))
    ctx.app.setUcs(current(ctx), name.trim())
    return
  }
  if (opt === 'Restore') {
    const name = await ctx.getString('Enter name of UCS to restore or [?]: ')
    if (!name?.trim()) return
    if (name.trim() === '?') return list()
    const def = ctx.doc.getNamedUcs(name)
    if (!def) return ctx.print(`Cannot find UCS "${name.trim()}".`)
    return apply(ctx, normalizeUcs(def), def.name)
  }
  const names = await ctx.getString('Enter UCS name(s) to delete <none>: ', { default: '' })
  if (!names?.trim()) return
  let n = 0
  for (const nm of names.split(',')) if (ctx.doc.deleteNamedUcs(nm)) n++
  ctx.print(`Deleted ${n} UCS(s).`)
}

/** UCS (CAD clásico): origen/3 puntos, `Face/NAmed/OBject/Previous/View/World/X/Y/Z/ZAxis`. */
export const ucsCommand: Command = {
  name: 'UCS',
  aliases: [],
  description: 'User coordinate system [Face/NAmed/OBject/Previous/View/World/X/Y/Z/ZAxis]',
  async run(ctx) {
    ctx.print(`Current ucs name:  ${currentName(ctx)}`)
    const r = await ctx.getPoint(`Specify origin of UCS or [${OPTIONS.join('/')}] <World>: `, { keywords: OPTIONS, enterKeyword: 'World' })
    if (r.kind === 'cancel') return
    const cur = current(ctx)
    if (r.kind === 'point') {
      const o = r.point
      // Enter acepta lo indicado hasta ahí; ESC cancela.
      const px = await ctx.getPoint('Specify point on X-axis or <Accept>: ', { base: o, enterKeyword: 'Accept', preview: (c) => [{ kind: 'line', a: o, b: c }] })
      if (px.kind === 'cancel') return
      const xPt = px.kind === 'point' ? px.point : null
      let xyPt: Pt | null = null
      if (xPt) {
        const py = await ctx.getPoint('Specify point on the XY plane or <Accept>: ', { base: o, enterKeyword: 'Accept', preview: (c) => [{ kind: 'line', a: o, b: c }] })
        if (py.kind === 'cancel') return
        xyPt = py.kind === 'point' ? py.point : null
      }
      const u = ucsFrom3Points(cur, o, xPt, xyPt)
      if (!u) return ctx.print('Invalid UCS: the points are collinear.')
      return apply(ctx, u)
    }
    switch (r.keyword) {
      case 'World':
        return apply(ctx, { ...WORLD_UCS }, 'World')
      case 'Previous': {
        const prev = ctx.app.previousUcs?.()
        if (!prev) return ctx.print('No previous UCS.')
        return
      }
      case 'View': {
        const ax = ctx.app.viewAxes?.()
        const u = ax && ucsFromView(cur.origin, ax.right, ax.up)
        if (!u) return ctx.print('Cannot set the UCS from this view.')
        return apply(ctx, u)
      }
      case 'X':
      case 'Y':
      case 'Z': {
        const a = await askNumber(ctx, `Specify rotation angle about ${r.keyword} axis <90>: `, { def: 90 })
        if (!a || a.kind !== 'number') return
        return apply(ctx, rotateUcs(cur, r.keyword, a.value))
      }
      case 'ZAxis': {
        const o = await ctx.getPoint('Specify new origin point or [Object] <0,0,0>: ', { keywords: ['Object'], enterKeyword: 'Origin' })
        if (o.kind === 'cancel') return
        if (o.kind === 'keyword' && o.keyword === 'Object') {
          const s = await ctx.getPoint('Select object: ')
          const e = s.kind === 'point' && s.pick?.id ? ctx.doc.getEntity(s.pick.id) : undefined
          if (!e || s.kind !== 'point') return ctx.print('No object selected.')
          const u = objectUcs(ctx, e, s.point)
          // ZAxis ▸ Object: la Z apunta como la del objeto, con la X del Arbitrary Axis Algorithm.
          const zu = u && ucsFromZAxis(u.origin, ucsToWorld(pt(0, 0, 1), u))
          return zu ? apply(ctx, zu) : undefined
        }
        const origin = o.kind === 'point' ? o.point : cur.origin
        const defZ = ucsToWorld(pt(0, 0, 1), { ...cur, origin })
        const z = await ctx.getPoint(`Specify point on positive portion of Z-axis <${[defZ.x, defZ.y, defZ.z].map((v) => Number(v.toFixed(4))).join(',')}>: `, {
          base: origin,
          enterKeyword: 'Default',
        })
        if (z.kind === 'cancel') return
        const u = ucsFromZAxis(origin, z.kind === 'point' ? z.point : defZ)
        if (!u) return ctx.print('Invalid Z axis.')
        return apply(ctx, u)
      }
      case 'NAmed':
        return named(ctx)
      case 'OBject': {
        const s = await ctx.getPoint('Select object to align UCS: ')
        const e = s.kind === 'point' && s.pick?.id ? ctx.doc.getEntity(s.pick.id) : undefined
        if (!e || s.kind !== 'point') return ctx.print('No object selected.')
        const u = objectUcs(ctx, e, s.point)
        return u ? apply(ctx, u) : undefined
      }
      case 'Face': {
        const s = await ctx.getPoint('Select face of solid, surface, or mesh: ')
        if (s.kind !== 'point') return
        let skip = 0
        let u = faceUcs(ctx, s.point, skip)
        if (!u) return ctx.print('No face found.')
        apply(ctx, u)
        for (;;) {
          const k = await ctx.getString('Enter an option [Next/Xflip/Yflip] <accept>: ', { default: '' })
          if (k === null || !k.trim()) return
          const opt = matchKeyword(k, ['Next', 'Xflip', 'Yflip'])
          if (!opt) {
            ctx.print('Invalid option keyword.')
            continue
          }
          if (opt === 'Next') {
            const nu = faceUcs(ctx, s.point, ++skip) ?? faceUcs(ctx, s.point, (skip = 0))
            if (nu) u = nu
          } else u = rotateUcs(u, opt === 'Xflip' ? 'X' : 'Y', 180)
          apply(ctx, u)
        }
      }
    }
  },
}

/** PLAN: vista en planta de la UCS actual, de una con nombre o de la universal. */
export const planCommand: Command = {
  name: 'PLAN',
  aliases: [],
  description: 'Plan view of a UCS [Current ucs/Ucs/World]',
  async run(ctx) {
    const opt = await askKeyword(ctx, 'Enter an option [Current ucs/Ucs/World] <Current>: ', ['Current', 'Ucs', 'World'], 'Current')
    if (!opt) return
    if (opt === 'World') return ctx.app.planView?.({ ...WORLD_UCS })
    if (opt === 'Current') return ctx.app.planView?.(current(ctx))
    const name = await ctx.getString('Enter name of UCS or [?]: ')
    if (!name?.trim()) return
    const def = ctx.doc.getNamedUcs(name)
    if (!def) return ctx.print(`Cannot find UCS "${name.trim()}".`)
    ctx.app.planView?.(normalizeUcs(def))
  },
}

/** UCSICON: muestra/oculta el icono y lo ubica en el origen o en la esquina. */
export const ucsiconCommand: Command = {
  name: 'UCSICON',
  aliases: [],
  description: 'UCS icon [ON/OFF/All/Noorigin/ORigin]',
  async run(ctx) {
    const on = sysvars.UCSICON & 1 ? 'ON' : 'OFF'
    const opt = await askKeyword(ctx, `Enter an option [ON/OFF/All/Noorigin/ORigin] <${on}>: `, ['ON', 'OFF', 'All', 'Noorigin', 'ORigin'], on)
    if (!opt || opt === 'All') return
    const v = sysvars.UCSICON
    sysvars.UCSICON = (opt === 'ON' ? v | 1 : opt === 'OFF' ? v & 2 : opt === 'ORigin' ? v | 2 : v & 1) as 0 | 1 | 2 | 3
    ctx.app.redraw()
  },
}

/** Variables 0/1 de la UCS como comandos (`UCSORTHO`, `UCSFOLLOW`, `UCSDETECT`). */
function switchVar(name: 'UCSORTHO' | 'UCSFOLLOW' | 'UCSDETECT', description: string): Command {
  return {
    name,
    aliases: [],
    description,
    async run(ctx) {
      const r = await askNumber(ctx, `Enter new value for ${name} <${sysvars[name]}>: `, { def: sysvars[name], check: (v) => (v === 0 || v === 1 ? null : 'Requires 0 or 1.') })
      if (r?.kind === 'number') sysvars[name] = r.value as 0 | 1
      if (name === 'UCSDETECT') ctx.app.redraw()
    },
  }
}

export const ucsVarCommands: Command[] = [
  switchVar('UCSORTHO', 'Orthographic views set their orthographic UCS (0/1)'),
  switchVar('UCSFOLLOW', 'Plan view whenever the UCS changes (0/1)'),
  switchVar('UCSDETECT', 'Dynamic UCS on planar faces of solids (0/1)'),
]
