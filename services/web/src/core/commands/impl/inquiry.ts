import type { Command, CommandContext } from '../types'
import type { Entity, MeshProps } from '../../document/types'
import type { Pt, Vec3 } from '../../math'
import { curveOf, primPoint, type Curve } from '../../geom/curve'
import { hatchArea } from '../../hatch/geometry'
import { formatDim, measureDim } from '../../dimension/dimGeometry'
import { worldToUcs, WORLD_UCS } from '../../ucs'
import type { PreviewShape } from '../../preview'
import { sysvars } from '../sysvars'

const DEG = 180 / Math.PI
const n4 = (v: number) => (Math.abs(v) < 5e-5 ? 0 : v).toFixed(4)
const ang = (rad: number) => String(Number((((rad * DEG) % 360) + 360) % 360).toFixed(2)).replace(/\.00$/, '')

/** Punto en la UCS actual (como muestran ID y LIST en el CAD clásico). */
function local(ctx: CommandContext, p: Pt | Vec3): Pt {
  const w = Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p
  return worldToUcs(w, ctx.app.getUcs?.() ?? WORLD_UCS)
}
const xyz = (ctx: CommandContext, p: Pt | Vec3) => {
  const q = local(ctx, p)
  return `X = ${n4(q.x)}  Y = ${n4(q.y)}  Z = ${n4(q.z)}`
}

/** Área exacta con signo de una curva plana (líneas y arcos exactos; elipses y splines por muestreo fino). */
export function curveArea(c: Curve): number {
  let a = 0
  for (const p of c.prims) {
    if (p.k === 'L') a += (p.a[0] * p.b[1] - p.b[0] * p.a[1]) / 2
    else if (p.k === 'A') {
      const t0 = p.a0
      const t1 = p.a0 + p.sw
      a += (p.r * p.r * p.sw + p.r * (p.c[0] * (Math.sin(t1) - Math.sin(t0)) - p.c[1] * (Math.cos(t1) - Math.cos(t0)))) / 2
    } else {
      // Elipse o tramo de spline: por muestreo fino de la primitiva.
      const k = 'sw' in p ? Math.max(64, Math.ceil((1024 * Math.abs(p.sw)) / (2 * Math.PI))) : 256
      let q = primPoint(p, 0)
      for (let j = 1; j <= k; j++) {
        const r = primPoint(p, j / k)
        a += (q[0] * r[1] - r[0] * q[1]) / 2
        q = r
      }
    }
  }
  // Una curva abierta se mide como si se cerrara con una recta (como AREA ▸ Object del CAD clásico).
  if (!c.closed) {
    const s = c.pointAt(0)
    const e = c.pointAt(c.n)
    a += (e[0] * s[1] - s[0] * e[1]) / 2
  }
  return a
}

/** Volumen, centroide y área de la superficie de una malla cerrada (triángulos en abanico por cara). */
export function meshProperties(m: MeshProps): { volume: number; centroid: Vec3; surface: number; min: Vec3; max: Vec3 } {
  let vol = 0
  const c: Vec3 = [0, 0, 0]
  let surface = 0
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const v of m.vertices) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], v[k])
    max[k] = Math.max(max[k], v[k])
  }
  for (const f of m.faces) {
    for (let i = 1; i + 1 < f.length; i++) {
      const [a, b, d] = [m.vertices[f[0]], m.vertices[f[i]], m.vertices[f[i + 1]]]
      const v6 = a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0])
      vol += v6 / 6
      for (let k = 0; k < 3; k++) c[k] += (v6 / 6) * ((a[k] + b[k] + d[k]) / 4)
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const w = [d[0] - a[0], d[1] - a[1], d[2] - a[2]]
      surface += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2
    }
  }
  const centroid: Vec3 = Math.abs(vol) > 1e-12 ? [c[0] / vol, c[1] / vol, c[2] / vol] : [0, 0, 0]
  return { volume: Math.abs(vol), centroid, surface, min, max }
}

/** ID: coordenadas de un punto en la UCS actual. */
export const idCommand: Command = {
  name: 'ID',
  aliases: [],
  description: 'Display the coordinates of a point in the current UCS',
  async run(ctx) {
    const r = await ctx.getPoint('Specify point: ', { base: null })
    if (r.kind !== 'point') return
    ctx.print(xyz(ctx, r.point))
  },
}

/** Área y perímetro de un objeto (o largo, si está abierto) para AREA y LIST. */
function objectArea(ctx: CommandContext, e: Entity): { area: number; perimeter: number; label: string } | null {
  if (e.type === 'HATCH') return { area: hatchArea(e.props), perimeter: NaN, label: 'Perimeter' }
  // Elipse completa: π·a·b exacto.
  if (e.type === 'ELLIPSE' && e.props.startParam === undefined) {
    const a = Math.hypot(...e.props.major)
    const b = a * e.props.ratio
    return { area: Math.PI * a * b, perimeter: curveOf(e)?.length() ?? NaN, label: 'Circumference' }
  }
  if (e.type === 'SOLID3D' || e.type === 'MESH3D') {
    const m = ctx.app.solidMesh?.(e)
    return m ? { area: meshProperties(m).surface, perimeter: NaN, label: 'Perimeter' } : null
  }
  const c = curveOf(e)
  if (!c) return null
  return { area: Math.abs(curveArea(c)), perimeter: c.length(), label: e.type === 'CIRCLE' ? 'Circumference' : c.closed ? 'Perimeter' : 'Length' }
}

/**
 * AREA: área y perímetro de un polígono indicado por puntos, o de un objeto (círculo, polilínea, rectángulo, elipse,
 * spline, sombreado; de un sólido, su superficie). `Add area`/`Subtract area` acumulan un total, como el CAD clásico.
 */
export const areaCommand: Command = {
  name: 'AREA',
  aliases: ['AA'],
  description: 'Area and perimeter of points or of an object [Object/Add area/Subtract area]; Add/Subtract keep a running total',
  async run(ctx) {
    let mode: 'single' | 'add' | 'sub' = 'single'
    let total = 0
    const report = (area: number, perim: number, label = 'Perimeter') => {
      ctx.print(`Area = ${n4(area)}${Number.isFinite(perim) ? `, ${label} = ${n4(perim)}` : ''}`)
      if (mode === 'single') return
      total += mode === 'add' ? area : -area
      ctx.print(`Total area = ${n4(total)}`)
    }
    for (;;) {
      const head = mode === 'single' ? '' : `(${mode === 'add' ? 'ADD' : 'SUBTRACT'} mode) `
      const kws = mode === 'single' ? ['Object', 'Add area', 'Subtract area'] : ['Object', mode === 'add' ? 'Subtract area' : 'Add area', 'eXit']
      const r = await ctx.getPoint(`${head}Specify first corner point or [${kws.join('/')}] <${mode === 'single' ? 'Object' : 'eXit'}>: `, {
        keywords: kws,
        enterKeyword: mode === 'single' ? 'Object' : 'eXit',
        base: null,
      })
      if (r.kind === 'cancel') return
      if (r.kind === 'keyword') {
        if (r.keyword === 'eXit') return
        if (r.keyword === 'Add area' || r.keyword === 'Subtract area') {
          mode = r.keyword === 'Add area' ? 'add' : 'sub'
          continue
        }
        // Object: uno (o, en Add/Subtract, varios hasta Enter).
        for (;;) {
          const o = await ctx.getPoint(`${head}Select objects: `, { base: null })
          if (o.kind !== 'point') break
          const e = o.pick?.id ? ctx.doc.getEntity(o.pick.id) : undefined
          const res = e ? objectArea(ctx, e) : null
          if (!res) {
            ctx.print(e ? 'The area of that object cannot be measured.' : 'No object found.')
            continue
          }
          report(res.area, res.perimeter, res.label)
          if (mode === 'single') return
        }
        if (mode === 'single') return
        continue
      }
      // Polígono por puntos, en el plano de la UCS.
      const pts: Pt[] = [r.point]
      for (;;) {
        const last = pts[pts.length - 1]
        const q = await ctx.getPoint(pts.length < 3 ? 'Specify next point: ' : 'Specify next point or press ENTER for total: ', {
          base: last,
          preview: (c): PreviewShape[] => [{ kind: 'polyline', points: [...pts, c, pts[0]] }],
        })
        if (q.kind !== 'point') break
        pts.push(q.point)
      }
      if (pts.length < 3) {
        if (mode === 'single') return
        continue
      }
      const ls = pts.map((p) => local(ctx, p))
      let a = 0
      let per = 0
      for (let i = 0; i < ls.length; i++) {
        const p = ls[i]
        const q = ls[(i + 1) % ls.length]
        a += (p.x * q.y - q.x * p.y) / 2
        per += Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)
      }
      report(Math.abs(a), per)
      if (mode === 'single') return
    }
  },
}

/** Líneas de LIST de un objeto: tipo, capa, espacio y su geometría. */
export function describeEntity(ctx: CommandContext, e: Entity): string[] {
  const layer = ctx.doc.layers.find((l) => l.id === e.layer)?.name ?? e.layer
  const space = ctx.doc.activeLayout && ctx.doc.layoutEntities(ctx.doc.activeLayout.id).some((x) => x.id === e.id) ? 'Paper space' : 'Model space'
  const out = [`${e.type}  Layer: "${layer}"  Space: ${space}  Handle = ${e.id}`]
  if (e.lineType) out.push(`  Linetype: ${e.lineType}`)
  const P = (label: string, p: Vec3) => out.push(`  ${label} ${xyz(ctx, p)}`)
  switch (e.type) {
    case 'LINE': {
      const [a, b] = [e.props.start, e.props.end]
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      P('from point,', a)
      P('to point,', b)
      out.push(`  Length = ${n4(Math.hypot(d[0], d[1], d[2]))},  Angle in XY Plane = ${ang(Math.atan2(d[1], d[0]))}`)
      out.push(`  Delta X = ${n4(d[0])}, Delta Y = ${n4(d[1])}, Delta Z = ${n4(d[2])}`)
      break
    }
    case 'CIRCLE':
      P('center point,', e.props.center)
      out.push(`  Radius = ${n4(e.props.radius)}`, `  Circumference = ${n4(2 * Math.PI * e.props.radius)}`, `  Area = ${n4(Math.PI * e.props.radius ** 2)}`)
      break
    case 'ARC': {
      const c = curveOf(e)
      P('center point,', e.props.center)
      out.push(`  Radius = ${n4(e.props.radius)}`, `  Start angle = ${ang(e.props.startAngle)}`, `  End angle = ${ang(e.props.endAngle)}`)
      if (c) out.push(`  Length = ${n4(c.length())}`)
      break
    }
    case 'POINT':
      P('at point,', e.props.position)
      break
    case 'TEXT':
      out.push(`  Text: "${e.props.text.split('\n').join('\\P')}"`)
      P(e.props.kind === 'text' ? 'start point,' : 'insertion point,', e.props.position)
      out.push(`  Height = ${n4(e.props.height)},  Rotation = ${ang(e.props.rotation)},  Justify = ${e.props.justify}`)
      break
    case 'INSERT':
      out.push(`  Block name: "${e.props.name}"`)
      P('at point,', e.props.position)
      out.push(`  X scale factor = ${n4(e.props.scale[0])},  Y scale factor = ${n4(e.props.scale[1])},  Z scale factor = ${n4(e.props.scale[2])}`)
      out.push(`  Rotation angle = ${ang(e.props.rotation)}`)
      for (const a of e.props.attributes ?? []) out.push(`  Attribute ${a.tag} = "${a.value}"`)
      break
    case 'DIMENSION':
      out.push(`  Type: ${e.props.dimType}`, `  Measurement = ${n4(measureDim(e.props))}  Text = "${formatDim(e.props)}"`)
      break
    case 'SOLID3D':
    case 'MESH3D': {
      if (e.type === 'SOLID3D') out.push(`  Kind: ${e.props.op}`)
      const m = ctx.app.solidMesh?.(e)
      if (m) {
        const q = meshProperties(m)
        out.push(`  Volume = ${n4(q.volume)},  Surface area = ${n4(q.surface)}`)
        out.push(`  Bounding box: ${xyz(ctx, q.min)}  to  ${xyz(ctx, q.max)}`)
      }
      break
    }
    default:
      break
  }
  // Curvas: área y perímetro (o largo, si está abierta), como el CAD clásico.
  if (['POLYLINE', 'RECTANGLE', 'ELLIPSE', 'SPLINE', 'HATCH'].includes(e.type)) {
    const c = curveOf(e)
    if (e.type === 'POLYLINE') out.push(`  ${e.props.closed ? 'Closed' : 'Open'}, ${e.props.vertices.length} vertices`)
    if (e.type === 'SPLINE') out.push(`  Degree ${e.props.degree}, ${e.props.controlPoints.length} control points`)
    if (c && (e.type === 'POLYLINE' || e.type === 'SPLINE')) P('starting at', c.pointAt(0))
    const a = objectArea(ctx, e)
    if (a) out.push(`  Area = ${n4(a.area)}${Number.isFinite(a.perimeter) ? `,  ${a.label} = ${n4(a.perimeter)}` : ''}`)
  }
  return out
}

/** LIST: describe los objetos elegidos. */
export const listCommand: Command = {
  name: 'LIST',
  aliases: ['LI', 'LS'],
  description: 'List the properties of the selected objects: type, layer, points, lengths, areas, volumes',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (!ids?.length) return
    for (const id of ids) {
      const e = ctx.doc.getEntity(id)
      if (e) for (const l of describeEntity(ctx, e)) ctx.print(l)
    }
  },
}

/** MASSPROP: volumen, superficie, caja y centroide de sólidos (densidad 1, como el CAD clásico). */
export const masspropCommand: Command = {
  name: 'MASSPROP',
  aliases: [],
  description: 'Mass properties of solids: volume (mass with density 1), surface area, bounding box and centroid',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (!ids?.length) return
    const solids = ids.map((id) => ctx.doc.getEntity(id)).filter((e): e is Entity => !!e && (e.type === 'SOLID3D' || e.type === 'MESH3D'))
    if (!solids.length) {
      ctx.print('No solids selected.')
      return
    }
    let vol = 0
    let surf = 0
    const c: Vec3 = [0, 0, 0]
    const min: Vec3 = [Infinity, Infinity, Infinity]
    const max: Vec3 = [-Infinity, -Infinity, -Infinity]
    for (const e of solids) {
      const m = ctx.app.solidMesh?.(e)
      if (!m) continue
      const q = meshProperties(m)
      vol += q.volume
      surf += q.surface
      for (let k = 0; k < 3; k++) {
        c[k] += q.centroid[k] * q.volume
        min[k] = Math.min(min[k], q.min[k])
        max[k] = Math.max(max[k], q.max[k])
      }
    }
    if (vol <= 0) {
      ctx.print('The volume of the selection could not be computed.')
      return
    }
    const g: Vec3 = [c[0] / vol, c[1] / vol, c[2] / vol]
    const [lo, hi] = [local(ctx, min), local(ctx, max)]
    ctx.print('----------------   SOLIDS   ----------------')
    ctx.print(`Mass:            ${n4(vol)}`)
    ctx.print(`Volume:          ${n4(vol)}`)
    ctx.print(`Surface area:    ${n4(surf)}`)
    ctx.print(`Bounding box:    X: ${n4(Math.min(lo.x, hi.x))} -- ${n4(Math.max(lo.x, hi.x))}`)
    ctx.print(`                 Y: ${n4(Math.min(lo.y, hi.y))} -- ${n4(Math.max(lo.y, hi.y))}`)
    ctx.print(`                 Z: ${n4(Math.min(lo.z, hi.z))} -- ${n4(Math.max(lo.z, hi.z))}`)
    ctx.print(`Centroid:        ${xyz(ctx, g)}`)
  },
}

/** POLARANG: incremento de ángulo del rastreo polar (POLAR / F10). */
export const polarAngCommand: Command = {
  name: 'POLARANG',
  aliases: [],
  description: 'Polar tracking angle increment in degrees (POLAR / F10 tracks multiples of it from the base point)',
  async run(ctx) {
    const r = await ctx.getString(`Enter new value for POLARANG <${sysvars.POLARANG}>: `, { default: String(sysvars.POLARANG) })
    if (r === null) return
    const v = Number(r)
    if (!Number.isFinite(v) || v <= 0 || v > 180) {
      ctx.print('Requires an angle greater than 0 and up to 180.')
      return
    }
    sysvars.POLARANG = v
    ctx.doc.touch()
  },
}
