import type { Vec3 } from '../math'
import type { HatchIsland, HatchLoop, HatchProps, PatternLine } from '../document/types'
import { hatchPattern, SOLID, USER } from '../hatch/patterns'
import { patternLinesOf } from '../hatch/geometry'
import { angleFromOcs, angleToOcs, fromOcs, isWorldExtrusion, toOcs } from './dxfOcs'
import { angleBulge } from '../geom/polyline'
import { isImperial } from '../linetype/linetypes'

/**
 * Entidad `HATCH` de DXF. Los lazos van como bordes de polilínea (con bulges) en el OCS de la
 * extrusión. Las líneas de patrón se escriben ya escaladas y giradas, como el CAD clásico; al importar, un
 * patrón de la biblioteca se reconoce por el nombre y uno desconocido guarda sus líneas tal cual.
 */

const p = (code: number, val: string | number): string => `${code}\n${val}\n`
const DEG = 180 / Math.PI

const ISLAND_CODE: Record<HatchIsland, number> = { normal: 0, outer: 1, ignore: 2 }

export function hatchDxf(h: HatchProps, head: string): string {
  const n: Vec3 = h.normal ?? [0, 0, 1]
  const elev = toOcs(h.loops[0]?.vertices[0] ?? [0, 0, 0], n)[2]
  const solid = h.pattern.toUpperCase() === SOLID
  const user = h.pattern.toUpperCase() === USER
  let out = p(0, 'HATCH') + p(100, 'AcDbEntity') + head + p(100, 'AcDbHatch')
  out += p(10, 0) + p(20, 0) + p(30, elev) + p(210, n[0]) + p(220, n[1]) + p(230, n[2])
  out += p(2, h.pattern.toUpperCase()) + p(70, solid ? 1 : 0) + p(71, h.assoc ? 1 : 0) + p(91, h.loops.length)
  h.loops.forEach((l, i) => {
    const bulged = (l.bulges ?? []).some((b) => Math.abs(b) > 1e-12)
    out += p(92, i === 0 ? 3 : 2) + p(72, bulged ? 1 : 0) + p(73, 1) + p(93, l.vertices.length)
    l.vertices.forEach((v, k) => {
      const q = toOcs(v, n)
      out += p(10, q[0]) + p(20, q[1])
      if (bulged) out += p(42, l.bulges?.[k] ?? 0)
    })
    out += p(97, 0)
  })
  out += p(75, ISLAND_CODE[h.island] ?? 1) + p(76, user ? 0 : h.custom ? 2 : 1)
  if (!solid) {
    const ang = angleToOcs(h.angle, n)
    const s = user ? 1 : h.scale
    out += p(52, ((ang * DEG) % 360 + 360) % 360) + p(41, s) + p(77, h.double ? 1 : 0)
    const lines = patternLinesOf(h)
    const o = toOcs(h.origin, n)
    out += p(78, lines.length)
    for (const pl of lines) {
      const a = (pl.angle * Math.PI) / 180 + ang
      const rot = (x: number, y: number): [number, number] => [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang)]
      const [bx, by] = rot(pl.origin[0] * s, pl.origin[1] * s)
      const D: [number, number] = [Math.cos(a), Math.sin(a)]
      const N: [number, number] = [-D[1], D[0]]
      const off: [number, number] = [(D[0] * pl.delta[0] + N[0] * pl.delta[1]) * s, (D[1] * pl.delta[0] + N[1] * pl.delta[1]) * s]
      out += p(53, ((a * DEG) % 360 + 360) % 360) + p(43, o[0] + bx) + p(44, o[1] + by) + p(45, off[0]) + p(46, off[1])
      out += p(79, pl.dashes.length)
      for (const d of pl.dashes) out += p(49, d * s)
    }
  }
  const seeds = h.assoc?.seeds ?? []
  out += p(98, seeds.length)
  for (const sd of seeds) {
    const q = toOcs(sd, n)
    out += p(10, q[0]) + p(20, q[1])
  }
  return out
}

/** Lector secuencial de los grupos de una entidad (los códigos se repiten: el orden manda). */
class Reader {
  i = 0
  constructor(readonly c: Array<[number, string]>) {}
  peek(): number | undefined {
    return this.c[this.i]?.[0]
  }
  /** Avanza hasta el próximo grupo `code` (sin pasar de `stop`, si se indica) y lo consume. */
  take(code: number, stop?: number[]): string | undefined {
    while (this.i < this.c.length) {
      const [k, v] = this.c[this.i]
      if (k === code) {
        this.i++
        return v
      }
      if (stop?.includes(k)) return undefined
      this.i++
    }
    return undefined
  }
  num(code: number, def = 0, stop?: number[]): number {
    const v = this.take(code, stop)
    return v === undefined ? def : Number(v)
  }
  /** Consume el grupo actual si es `code`. */
  opt(code: number, def = 0): number {
    if (this.peek() === code) return Number(this.c[this.i++][1])
    return def
  }
}

const ISLANDS: HatchIsland[] = ['normal', 'outer', 'ignore']

/** Parsea una entidad HATCH (null si no tiene lazos). */
export function parseHatch(codes: Array<[number, string]>, units = 'mm'): HatchProps | null {
  const r = new Reader(codes)
  const elev = r.num(30, 0, [91])
  const ex = codes.find((x) => x[0] === 210)
  const n: Vec3 = ex ? [Number(ex[1]), Number(codes.find((x) => x[0] === 220)?.[1] ?? 0), Number(codes.find((x) => x[0] === 230)?.[1] ?? 1)] : [0, 0, 1]
  r.i = 0
  const name = (r.take(2) ?? 'SOLID').trim().toUpperCase()
  const solid = r.num(70) === 1
  const assoc = r.num(71) === 1
  const nLoops = r.num(91)
  const W = (x: number, y: number): Vec3 => fromOcs([x, y, elev], n)
  const loops: HatchLoop[] = []
  for (let li = 0; li < nLoops; li++) {
    const flags = r.num(92)
    const loop = flags & 2 ? polyLoop(r, W) : edgeLoop(r, W)
    // Objetos de origen (handles): se ignoran.
    const ns = r.num(97, 0, [92, 75])
    for (let k = 0; k < ns; k++) r.take(330)
    if (loop && loop.vertices.length >= 2) loops.push(loop)
  }
  if (!loops.length) return null
  const island = ISLANDS[r.num(75, 1)] ?? 'outer'
  const type = r.num(76, 1)
  const out: HatchProps = { loops, pattern: solid ? SOLID : name, scale: 1, angle: 0, origin: W(0, 0), island }
  if (!isWorldExtrusion(n)) out.normal = n
  if (!solid) {
    const ang = r.num(52, 0, [98]) / DEG
    const scale = r.num(41, 1, [98])
    const dbl = r.opt(77, 0)
    const nl = r.num(78, 0, [98])
    const lines: PatternLine[] = []
    for (let k = 0; k < nl; k++) {
      const a = r.num(53)
      const bx = r.num(43)
      const by = r.num(44)
      const ox = r.num(45)
      const oy = r.num(46)
      const nd = r.num(79)
      const dashes: number[] = []
      for (let d = 0; d < nd; d++) dashes.push(r.num(49))
      const t = (a * Math.PI) / 180
      const D: [number, number] = [Math.cos(t), Math.sin(t)]
      lines.push({ angle: a, origin: [bx, by], delta: [ox * D[0] + oy * D[1], -ox * D[1] + oy * D[0]], dashes })
    }
    out.angle = angleFromOcs(ang, n)
    if (type === 0) {
      // Definido por el usuario: separación = desplazamiento perpendicular de la primera línea.
      out.pattern = USER
      out.spacing = Math.abs(lines[0]?.delta[1] ?? 1) || 1
      if (dbl) out.double = true
    } else {
      out.scale = scale > 0 ? scale : 1
      const fit = lines.length ? fitLibraryPattern(name, lines, ang, out.scale, units) : null
      if (fit) {
        out.scale = fit.scale
        out.angle = angleFromOcs(fit.angle, n)
        if (fit.imperial) out.imperial = true
        // Origen del patrón: el punto base de la primera línea menos su origen de definición (girado y escalado).
        const o = fit.lines[0].origin
        const ox = (o[0] * Math.cos(fit.angle) - o[1] * Math.sin(fit.angle)) * out.scale
        const oy = (o[0] * Math.sin(fit.angle) + o[1] * Math.cos(fit.angle)) * out.scale
        out.origin = W(lines[0].origin[0] - ox, lines[0].origin[1] - oy)
      } else if (lines.length) {
        // Patrón desconocido (o con el nombre de uno de la biblioteca pero otra definición): sus líneas tal cual
        // (ya giradas y escaladas), como las dibuja el CAD clásico.
        out.custom = lines
        out.scale = 1
        out.angle = 0
        out.origin = W(0, 0)
      }
    }
  }
  // Los objetos del contorno vienen por handle (que no se conservan): queda como sombreado no asociativo.
  void assoc
  return out
}

/** Patrón de la biblioteca que dibuja las mismas líneas que trae el archivo, con su ángulo (rad, OCS) y escala. */
export interface LibraryFit {
  lines: PatternLine[]
  angle: number
  scale: number
  imperial: boolean
}

const wrapDeg = (a: number): number => ((((a + 180) % 360) + 360) % 360) - 180

/**
 * ¿Las líneas del archivo (ya giradas y escaladas, con el corrimiento en los ejes de cada línea) son las del patrón
 * `lib` girado `ang` (rad) y escalado `s`? Ángulos, corrimientos, trazos y puntos base (relativos a la primera línea).
 */
function sameLines(lib: PatternLine[], file: PatternLine[], ang: number, s: number): boolean {
  if (lib.length !== file.length || !(s > 0)) return false
  const c = Math.cos(ang)
  const sn = Math.sin(ang)
  const angDeg = ang * DEG
  return lib.every((l, k) => {
    const f = file[k]
    if (Math.abs(wrapDeg(f.angle - l.angle - angDeg)) > 1e-3 || f.dashes.length !== l.dashes.length) return false
    // Tolerancia relativa al tamaño de la línea del patrón (los archivos escriben los números redondeados).
    const size = s * Math.max(Math.hypot(l.delta[0], l.delta[1]), ...l.dashes.map(Math.abs), 1e-9)
    const tol = 1e-4 * size
    const near = (a: number, b: number) => Math.abs(a - b) <= tol
    if (!near(f.delta[0], l.delta[0] * s) || !near(f.delta[1], l.delta[1] * s)) return false
    if (!l.dashes.every((d, j) => near(f.dashes[j], d * s))) return false
    const bx = (l.origin[0] - lib[0].origin[0]) * s
    const by = (l.origin[1] - lib[0].origin[1]) * s
    return near(f.origin[0] - file[0].origin[0], bx * c - by * sn) && near(f.origin[1] - file[0].origin[1], bx * sn + by * c)
  })
}

/** Escala con la que `lib` da las líneas del archivo (cociente de la primera medida no nula), o NaN. */
function scaleFromLines(lib: PatternLine[], file: PatternLine[]): number {
  for (let k = 0; k < Math.min(lib.length, file.length); k++) {
    const pairs: Array<[number, number]> = [[Math.hypot(...lib[k].delta), Math.hypot(...file[k].delta)], ...lib[k].dashes.map((d, j): [number, number] => [Math.abs(d), Math.abs(file[k].dashes[j] ?? 0)])]
    for (const [a, b] of pairs) if (a > 1e-12 && b > 0) return b / a
  }
  return NaN
}

/**
 * Patrón de la biblioteca para un HATCH de DXF. El CAD clásico dibuja con las líneas que guarda el sombreado,
 * no con el ángulo (52) ni la escala (41), que sólo informan. Algunos archivos los traen mal: un DWG con el ángulo en
 * grados donde van radianes (al pasarlo a grados, 315° quedaba en 18.048°) o un patrón de `acad.pat` (pulgadas) en un
 * dibujo en mm. En orden: el ángulo y la escala del archivo (lo habitual), el patrón en pulgadas, el ángulo sacado de
 * las líneas y, por último, también la escala. null si las líneas no son las de ese patrón (entonces van tal cual).
 */
export function fitLibraryPattern(name: string, file: PatternLine[], ang: number, scale: number, units = 'mm'): LibraryFit | null {
  const imp = isImperial(units)
  const own = hatchPattern(name, imp ? 'in' : 'mm')
  if (!own || !file.length) return null
  const other = hatchPattern(name, imp ? 'mm' : 'in')!
  const variants = [{ lines: own.lines, imperial: imp }, { lines: other.lines, imperial: !imp }]
  // Ángulo que lleva la primera línea de la biblioteca a la del archivo (rad, en [0, 2π)).
  const fromLines = (lib: PatternLine[]) => ((((file[0].angle - lib[0].angle) % 360) + 360) % 360) / DEG
  for (const v of variants) if (sameLines(v.lines, file, ang, scale)) return { ...v, angle: ang, scale }
  for (const v of variants) {
    const a = fromLines(v.lines)
    if (sameLines(v.lines, file, a, scale)) return { ...v, angle: a, scale }
  }
  const a = fromLines(own.lines)
  const s = scaleFromLines(own.lines, file)
  return sameLines(own.lines, file, a, s) ? { lines: own.lines, imperial: imp, angle: a, scale: s } : null
}

function polyLoop(r: Reader, W: (x: number, y: number) => Vec3): HatchLoop | null {
  const bulged = r.num(72) === 1
  r.opt(73)
  const nv = r.num(93)
  const vertices: Vec3[] = []
  const bulges: number[] = []
  for (let k = 0; k < nv; k++) {
    const x = r.num(10)
    const y = r.num(20)
    vertices.push(W(x, y))
    bulges.push(bulged ? r.opt(42, 0) : 0)
  }
  return bulges.some((b) => Math.abs(b) > 1e-12) ? { vertices, bulges } : { vertices }
}

/** Lazo de bordes (líneas, arcos, arcos de elipse y splines) → vértices con bulges. */
function edgeLoop(r: Reader, W: (x: number, y: number) => Vec3): HatchLoop | null {
  const ne = r.num(93)
  const vertices: Vec3[] = []
  const bulges: number[] = []
  for (let k = 0; k < ne; k++) {
    const type = r.num(72)
    if (type === 1) {
      vertices.push(W(r.num(10), r.num(20)))
      bulges.push(0)
      r.num(11)
      r.num(21)
    } else if (type === 2) {
      const cx = r.num(10)
      const cy = r.num(20)
      const rad = r.num(40)
      let a0 = r.num(50) / DEG
      let a1 = r.num(51) / DEG
      const ccw = r.opt(73, 1) === 1
      if (!ccw) [a0, a1] = [-a0, -a1]
      let sweep = a1 - a0
      while (sweep <= 0) sweep += 2 * Math.PI
      const parts = Math.max(1, Math.ceil(sweep / (Math.PI / 2) - 1e-9)) // de a cuartos: un lazo de 2 vértices no cierra
      for (let j = 0; j < parts; j++) {
        const a = a0 + (sweep * j) / parts
        vertices.push(W(cx + rad * Math.cos(a), cy + rad * (ccw ? Math.sin(a) : -Math.sin(a))))
        bulges.push(angleBulge(((ccw ? 1 : -1) * sweep) / parts))
      }
    } else if (type === 3) {
      const cx = r.num(10)
      const cy = r.num(20)
      const mx = r.num(11)
      const my = r.num(21)
      const ratio = r.num(40)
      let t0 = r.num(50) / DEG
      let t1 = r.num(51) / DEG
      const ccw = r.opt(73, 1) === 1
      if (!ccw) [t0, t1] = [-t0, -t1]
      let sweep = t1 - t0
      while (sweep <= 0) sweep += 2 * Math.PI
      const steps = Math.max(8, Math.ceil((sweep / (2 * Math.PI)) * 64))
      for (let j = 0; j < steps; j++) {
        const t = t0 + (sweep * j) / steps
        const c = Math.cos(t)
        const s = (ccw ? 1 : -1) * Math.sin(t)
        vertices.push(W(cx + mx * c - my * ratio * s, cy + my * c + mx * ratio * s))
        bulges.push(0)
      }
    } else if (type === 4) {
      // Spline: se aproxima por sus puntos de control.
      r.num(94)
      r.opt(73)
      r.opt(74)
      const nk = r.num(95)
      const nc = r.num(96)
      for (let j = 0; j < nk; j++) r.num(40)
      for (let j = 0; j < nc; j++) {
        vertices.push(W(r.num(10), r.num(20)))
        bulges.push(0)
        if (r.peek() === 42) r.opt(42)
      }
      if (r.peek() === 97) {
        const nf = r.num(97)
        for (let j = 0; j < nf; j++) {
          r.num(11)
          r.num(21)
        }
      }
    }
  }
  if (vertices.length < 2) return null
  return bulges.some((b) => Math.abs(b) > 1e-12) ? { vertices, bulges } : { vertices }
}
