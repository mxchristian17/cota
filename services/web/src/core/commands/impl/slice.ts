import type { Entity, SolidProps } from '../../document/types'
import { toVec3, type Pt, type Vec3 } from '../../math'
import { solidTopology } from '../../editing/topology'
import { WORLD_UCS } from '../../ucs'
import type { Command, CommandContext } from '../types'
import { askKeyword } from '../ask'

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
const unit = (a: Vec3): Vec3 => mul(a, 1 / (len(a) || 1))

interface Plane {
  p: Vec3
  n: Vec3
}

/** Caja grande que ocupa el semiespacio del lado `+n` del plano (lo bastante para cubrir el sólido). */
export function halfSpaceBox(plane: Plane, size: number): SolidProps {
  const n = unit(plane.n)
  const u = unit(cross(Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], n))
  const v = cross(n, u) // u × v = n
  const origin = sub(sub(plane.p, mul(u, size / 2)), mul(v, size / 2))
  return { op: 'BOX', origin, width: size, depth: size, height: size, basis: { x: u, y: v } }
}

/** Parte de `solid` del lado `side` (+1 o −1) del plano. */
export function slicedSide(solid: SolidProps, plane: Plane, side: 1 | -1, size: number): SolidProps {
  return { op: 'SUBTRACT', operands: [solid, halfSpaceBox({ p: plane.p, n: mul(plane.n, -side) }, size)] }
}

function extent(solids: Entity[]): { c: Vec3; diag: number } {
  const lo: Vec3 = [Infinity, Infinity, Infinity]
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const e of solids) {
    if (e.type !== 'SOLID3D') continue
    for (const v of solidTopology(e.props)?.verts ?? []) for (let k = 0; k < 3; k++) [lo[k], hi[k]] = [Math.min(lo[k], v[k]), Math.max(hi[k], v[k])]
  }
  if (!isFinite(lo[0])) return { c: [0, 0, 0], diag: 1 }
  return { c: mul(add(lo, hi), 0.5), diag: len(sub(hi, lo)) }
}

async function point(ctx: CommandContext, prompt: string, base?: Pt): Promise<Vec3 | null> {
  const r = await ctx.getPoint(prompt, base ? { base } : undefined)
  return r.kind === 'point' ? toVec3(r.point) : null
}

/** Plano de corte según las opciones del CAD clásico. */
async function askPlane(ctx: CommandContext): Promise<Plane | null> {
  const ucs = ctx.app.getUcs?.() ?? WORLD_UCS
  const z = cross(ucs.x, ucs.y)
  const r = await ctx.getPoint('Specify start point of slicing plane or [Zaxis/View/XY/YZ/ZX/3points] <3points>: ', {
    base: null,
    keywords: ['Zaxis', 'View', 'XY', 'YZ', 'ZX', '3points'],
    enterKeyword: '3points',
  })
  if (r.kind === 'cancel') return null
  if (r.kind === 'point') {
    // Dos puntos: el plano los contiene y es perpendicular al plano XY de la UCS.
    const a = toVec3(r.point)
    const b = await point(ctx, 'Specify second point on plane: ', r.point)
    if (!b) return null
    const n = cross(sub(b, a), z)
    return len(n) > 1e-9 ? { p: a, n: unit(n) } : null
  }
  const k = r.kind === 'keyword' ? r.keyword : '3points'
  if (k === '3points') {
    const a = await point(ctx, 'Specify first point on plane: ')
    if (!a) return null
    const b = await point(ctx, 'Specify second point on plane: ', { x: a[0], y: a[1], z: a[2] })
    if (!b) return null
    const c = await point(ctx, 'Specify third point on plane: ', { x: b[0], y: b[1], z: b[2] })
    if (!c) return null
    const n = cross(sub(b, a), sub(c, a))
    return len(n) > 1e-9 ? { p: a, n: unit(n) } : null
  }
  if (k === 'Zaxis') {
    const a = await point(ctx, 'Specify a point on the section plane: ')
    if (!a) return null
    const b = await point(ctx, 'Specify a point on the Z-axis (normal) of the plane: ', { x: a[0], y: a[1], z: a[2] })
    if (!b || len(sub(b, a)) < 1e-9) return null
    return { p: a, n: unit(sub(b, a)) }
  }
  const p = await point(ctx, `Specify a point on the ${k === 'View' ? 'current view' : k} plane <0,0,0>: `)
  if (!p) return null
  const n = k === 'View' ? (ctx.app.facingNormal?.() ?? z) : k === 'XY' ? z : k === 'YZ' ? ucs.x : ucs.y
  return { p, n: unit(n) }
}

export const sliceCommand: Command = {
  name: 'SLICE',
  aliases: ['SL'],
  description: 'Slice solids with a plane, keeping one side or both',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects to slice: ')
    if (!ids?.length) return
    const solids = ids.map((id) => ctx.doc.getEntity(id)).filter((e): e is Extract<Entity, { type: 'SOLID3D' }> => e?.type === 'SOLID3D')
    if (!solids.length) {
      ctx.print('No 3D solids selected.')
      return
    }
    const plane = await askPlane(ctx)
    if (!plane) {
      ctx.print('The slicing plane is not defined.')
      return
    }
    const { c, diag } = extent(solids)
    const size = 4 * diag + 2 * Math.abs(dot(sub(c, plane.p), plane.n)) + 1
    const r = await ctx.getPoint('Specify a point on desired side or [keep Both sides] <Both>: ', { base: null, keywords: ['Both'], enterKeyword: 'Both' })
    if (r.kind === 'cancel') return
    let sides: Array<1 | -1> = [1, -1]
    if (r.kind === 'point') {
      const d = dot(sub(toVec3(r.point), plane.p), plane.n)
      if (Math.abs(d) < 1e-9) {
        const k = await askKeyword(ctx, 'That point is on the plane. Keep [Both sides] <Both>: ', ['Both'], 'Both')
        if (k === null) return
      } else sides = [d > 0 ? 1 : -1]
    }
    for (const s of solids) {
      const original = s.props
      s.props = slicedSide(original, plane, sides[0], size)
      if (sides.length > 1) ctx.doc.addEntity({ type: 'SOLID3D', layer: s.layer, props: slicedSide(original, plane, -1, size) })
    }
    ctx.doc.touch()
    ctx.print(`${solids.length} solid(s) sliced${sides.length > 1 ? ' (both sides kept)' : ''}.`)
  },
}
