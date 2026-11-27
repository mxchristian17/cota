import type { Vec3 } from '../math'
import { close, common, dbl, enumTok, int, ival, name, open, pos, ptr, sense, senseV, str, vec, type AcisRecord, type Tok } from '../io/acisWrite'

/**
 * Forma de OpenCascade (su texto BRep, `toBREP`) escrita como modelo ACIS: el sólido que el núcleo exacto calculó (una
 * pieza importada que se editó, un sólido de Cota) sale a un DWG/DXF como 3DSOLID y no como caras sueltas. La topología
 * pasa una a una: sólido → lump, cáscara → shell, cara, lazo (wire), borde de cara (coedge), arista y vértice.
 * Superficies: plano, cilindro y cono (`cone-surface`), esfera, toro y B-spline (también las de extrusión y revolución,
 * pasadas a B-spline sin aproximar); curvas: recta, círculo y elipse (`ellipse-curve`) y B-spline (`intcurve-curve`).
 * Sin aristas degeneradas (los polos) ni costuras de superficies periódicas, que ACIS no usa. Lo que no se puede escribir
 * así (superficies desplazadas, parábolas) hace fallar la traducción: queda la malla.
 */

type Mat = number[] // 3×4 por filas (como `Affine`)
const IDENT: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]

export class BrepToAcisError extends Error {}
const fail = (why: string): never => {
  throw new BrepToAcisError(why)
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scl = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
const unit = (a: Vec3): Vec3 => {
  const l = len(a)
  return l > 1e-300 ? scl(a, 1 / l) : fail('dirección nula')
}

const mulMat = (a: Mat, b: Mat): Mat => {
  const o = new Array<number>(12)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c]
    o[r * 4 + 3] = a[r * 4] * b[3] + a[r * 4 + 1] * b[7] + a[r * 4 + 2] * b[11] + a[r * 4 + 3]
  }
  return o
}
function invMat(m: Mat): Mat {
  const [a, b, c, , d, e, f, , g, h, i] = m
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (Math.abs(det) < 1e-300) fail('ubicación singular')
  const inv = [
    (e * i - f * h) / det,
    (c * h - b * i) / det,
    (b * f - c * e) / det,
    (f * g - d * i) / det,
    (a * i - c * g) / det,
    (c * d - a * f) / det,
    (d * h - e * g) / det,
    (b * g - a * h) / det,
    (a * e - b * d) / det,
  ]
  const t = [m[3], m[7], m[11]]
  return [0, 1, 2].flatMap((r) => [inv[r * 3], inv[r * 3 + 1], inv[r * 3 + 2], -(inv[r * 3] * t[0] + inv[r * 3 + 1] * t[1] + inv[r * 3 + 2] * t[2])])
}
const detMat = (m: Mat): number => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8])
const isIdent = (m: Mat): boolean => m.every((v, i) => Math.abs(v - IDENT[i]) < 1e-15)
const atPt = (m: Mat, p: Vec3): Vec3 => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
  m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
  m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
]
const atDir = (m: Mat, d: Vec3): Vec3 => [m[0] * d[0] + m[1] * d[1] + m[2] * d[2], m[4] * d[0] + m[5] * d[1] + m[6] * d[2], m[8] * d[0] + m[9] * d[1] + m[10] * d[2]]

// --- Lectura del texto BRep ---

class Reader {
  private i = 0
  constructor(private t: string[]) {}
  get done(): boolean {
    return this.i >= this.t.length
  }
  peek(): string {
    return this.t[this.i] ?? fail('fin inesperado')
  }
  next(): string {
    return this.t[this.i++] ?? fail('fin inesperado')
  }
  num(): number {
    const s = this.next()
    const v = Number(s)
    return Number.isFinite(v) ? v : fail(`número esperado: ${s}`)
  }
  nums(n: number): number[] {
    const out = new Array<number>(n)
    for (let k = 0; k < n; k++) out[k] = this.num()
    return out
  }
  v3(): Vec3 {
    return this.nums(3) as Vec3
  }
  expect(word: string): number {
    const w = this.next()
    if (w !== word) fail(`«${word}» esperado: ${w}`)
    return this.num()
  }
}

/** Ejes de una curva o superficie elemental: origen, Z (dirección principal), X e Y. */
interface Ax {
  p: Vec3
  n: Vec3
  x: Vec3
  y: Vec3
}
const readAx = (r: Reader): Ax => ({ p: r.v3(), n: r.v3(), x: r.v3(), y: r.v3() })

export interface Bspl {
  deg: number
  periodic: boolean
  /** Nudos distintos y sus multiplicidades (como OpenCascade). */
  knots: number[]
  mults: number[]
  poles: Vec3[]
  weights?: number[]
}

type Curve =
  | { k: 'line'; p: Vec3; d: Vec3 }
  | { k: 'circle'; ax: Ax; r: number }
  | { k: 'ellipse'; ax: Ax; a: number; b: number }
  | { k: 'bspline'; s: Bspl }
  | { k: 'other'; what: string }

interface BsplSurf {
  du: number
  dv: number
  uperiodic: boolean
  vperiodic: boolean
  ku: number[]
  mu: number[]
  kv: number[]
  mv: number[]
  /** `poles[i][j]`: i a lo largo de u. */
  poles: Vec3[][]
  weights?: number[][]
}

type Surface =
  | { k: 'plane'; ax: Ax }
  | { k: 'cylinder'; ax: Ax; r: number }
  | { k: 'cone'; ax: Ax; r: number; ang: number }
  | { k: 'sphere'; ax: Ax; r: number }
  | { k: 'torus'; ax: Ax; R: number; r: number }
  | { k: 'extrusion'; d: Vec3; c: Curve }
  | { k: 'revolution'; p: Vec3; d: Vec3; c: Curve }
  | { k: 'bspline'; s: BsplSurf }
  | { k: 'other'; what: string }

/** B-spline de OpenCascade: polos (con su peso si es racional) y nudos (valor y multiplicidad). */
function readBsplCurve(r: Reader, dim: 2 | 3): Bspl {
  const rational = r.num() === 1
  const periodic = r.num() === 1
  const deg = r.num()
  const nPoles = r.num()
  const nKnots = r.num()
  const poles: Vec3[] = []
  const weights: number[] = []
  for (let i = 0; i < nPoles; i++) {
    const p = r.nums(dim)
    poles.push(dim === 3 ? (p as Vec3) : [p[0], p[1], 0])
    if (rational) weights.push(r.num())
  }
  const knots: number[] = []
  const mults: number[] = []
  for (let i = 0; i < nKnots; i++) {
    knots.push(r.num())
    mults.push(r.num())
  }
  return { deg, periodic, knots, mults, poles, ...(rational ? { weights } : {}) }
}

function readBezierCurve(r: Reader, dim: 2 | 3): Bspl {
  const rational = r.num() === 1
  const deg = r.num()
  const poles: Vec3[] = []
  const weights: number[] = []
  for (let i = 0; i <= deg; i++) {
    const p = r.nums(dim)
    poles.push(dim === 3 ? (p as Vec3) : [p[0], p[1], 0])
    if (rational) weights.push(r.num())
  }
  return { deg, periodic: false, knots: [0, 1], mults: [deg + 1, deg + 1], poles, ...(rational ? { weights } : {}) }
}

/** Curva 3D (o 2D: sólo se lee para saltearla). */
function readCurve(r: Reader, dim: 2 | 3): Curve {
  const t = r.num()
  const v = (): Vec3 => (dim === 3 ? r.v3() : ([...r.nums(2), 0] as Vec3))
  switch (t) {
    case 1:
      return { k: 'line', p: v(), d: v() }
    case 2: {
      const ax = dim === 3 ? readAx(r) : { p: v(), n: [0, 0, 1] as Vec3, x: v(), y: v() }
      return { k: 'circle', ax, r: r.num() }
    }
    case 3: {
      const ax = dim === 3 ? readAx(r) : { p: v(), n: [0, 0, 1] as Vec3, x: v(), y: v() }
      return { k: 'ellipse', ax, a: r.num(), b: r.num() }
    }
    case 4:
      if (dim === 3) readAx(r)
      else r.nums(6)
      r.num()
      return { k: 'other', what: 'parábola' }
    case 5:
      if (dim === 3) readAx(r)
      else r.nums(6)
      r.nums(2)
      return { k: 'other', what: 'hipérbola' }
    case 6:
      return { k: 'bspline', s: readBezierCurve(r, dim) }
    case 7:
      return { k: 'bspline', s: readBsplCurve(r, dim) }
    case 8: {
      r.nums(2)
      return readCurve(r, dim)
    }
    case 9: {
      r.num()
      if (dim === 3) r.v3()
      readCurve(r, dim)
      return { k: 'other', what: 'curva desplazada' }
    }
    default:
      return fail(`curva ${t}`)
  }
}

function readSurface(r: Reader): Surface {
  const t = r.num()
  switch (t) {
    case 1:
      return { k: 'plane', ax: readAx(r) }
    case 2:
      return { k: 'cylinder', ax: readAx(r), r: r.num() }
    case 3: {
      const ax = readAx(r)
      return { k: 'cone', ax, r: r.num(), ang: r.num() }
    }
    case 4:
      return { k: 'sphere', ax: readAx(r), r: r.num() }
    case 5: {
      const ax = readAx(r)
      return { k: 'torus', ax, R: r.num(), r: r.num() }
    }
    case 6: {
      const d = r.v3()
      return { k: 'extrusion', d, c: readCurve(r, 3) }
    }
    case 7: {
      const p = r.v3()
      const d = r.v3()
      return { k: 'revolution', p, d, c: readCurve(r, 3) }
    }
    case 8: {
      const ur = r.num() === 1
      const vr = r.num() === 1
      const du = r.num()
      const dv = r.num()
      const rational = ur || vr
      const poles: Vec3[][] = []
      const weights: number[][] = []
      for (let i = 0; i <= du; i++) {
        poles.push([])
        weights.push([])
        for (let j = 0; j <= dv; j++) {
          poles[i].push(r.v3())
          if (rational) weights[i].push(r.num())
        }
      }
      return {
        k: 'bspline',
        s: { du, dv, uperiodic: false, vperiodic: false, ku: [0, 1], mu: [du + 1, du + 1], kv: [0, 1], mv: [dv + 1, dv + 1], poles, ...(rational ? { weights } : {}) },
      }
    }
    case 9: {
      const ur = r.num() === 1
      const vr = r.num() === 1
      const uperiodic = r.num() === 1
      const vperiodic = r.num() === 1
      const du = r.num()
      const dv = r.num()
      const nu = r.num()
      const nv = r.num()
      const nku = r.num()
      const nkv = r.num()
      const rational = ur || vr
      const poles: Vec3[][] = []
      const weights: number[][] = []
      for (let i = 0; i < nu; i++) {
        poles.push([])
        weights.push([])
        for (let j = 0; j < nv; j++) {
          poles[i].push(r.v3())
          if (rational) weights[i].push(r.num())
        }
      }
      const ku: number[] = []
      const mu: number[] = []
      for (let i = 0; i < nku; i++) {
        ku.push(r.num())
        mu.push(r.num())
      }
      const kv: number[] = []
      const mv: number[] = []
      for (let i = 0; i < nkv; i++) {
        kv.push(r.num())
        mv.push(r.num())
      }
      return { k: 'bspline', s: { du, dv, uperiodic, vperiodic, ku, mu, kv, mv, poles, ...(rational ? { weights } : {}) } }
    }
    case 10: {
      r.nums(4)
      return readSurface(r)
    }
    case 11: {
      r.num()
      readSurface(r)
      return { k: 'other', what: 'superficie desplazada' }
    }
    default:
      return fail(`superficie ${t}`)
  }
}

type Ori = '+' | '-' | 'i' | 'e'
interface Ref {
  ori: Ori
  idx: number
  loc: number
}
interface TShape {
  type: string
  geo: string[]
  refs: Ref[]
}

interface BrepText {
  locs: Mat[]
  curves: Curve[]
  surfaces: Surface[]
  shapes: Map<number, TShape>
  root: Ref
}

const FLAGS = /^[01]{7}$/

/** Texto BRep de OpenCascade: ubicaciones, geometría y topología (los índices de las formas cuentan desde el final). */
export function parseBrep(text: string): BrepText {
  const tokens = text.split(/\s+/).filter(Boolean)
  const start = tokens.indexOf('Locations')
  if (start < 0) fail('no es un BRep')
  const r = new Reader(tokens.slice(start))
  // Ubicaciones: elementales (matriz 3×4) o compuestas (potencias de otras, hasta un 0).
  const nl = r.expect('Locations')
  const locs: Mat[] = [IDENT]
  for (let i = 0; i < nl; i++) {
    const t = r.num()
    if (t === 1) locs.push(r.nums(12))
    else if (t === 2) {
      let m = IDENT
      for (;;) {
        const idx = r.num()
        if (idx === 0) break
        const pw = r.num()
        const base = locs[idx] ?? fail('ubicación inexistente')
        let pmat = IDENT
        const b = pw < 0 ? invMat(base) : base
        for (let k = 0; k < Math.abs(pw); k++) pmat = mulMat(pmat, b)
        m = mulMat(m, pmat)
      }
      locs.push(m)
    } else fail(`ubicación ${t}`)
  }
  const n2 = r.expect('Curve2ds')
  for (let i = 0; i < n2; i++) readCurve(r, 2)
  const n3 = r.expect('Curves')
  const curves: Curve[] = [{ k: 'other', what: 'índice 0' }]
  for (let i = 0; i < n3; i++) curves.push(readCurve(r, 3))
  if (r.expect('Polygon3D') !== 0) fail('polígonos 3D')
  if (r.expect('PolygonOnTriangulations') !== 0) fail('polígonos sobre triangulaciones')
  const ns = r.expect('Surfaces')
  const surfaces: Surface[] = [{ k: 'other', what: 'índice 0' }]
  for (let i = 0; i < ns; i++) surfaces.push(readSurface(r))
  if (r.expect('Triangulations') !== 0) fail('triangulaciones')
  const nt = r.expect('TShapes')
  const shapes = new Map<number, TShape>()
  const readRef = (w: string): Ref => {
    const ori = w[0] as Ori
    if (!'+-ie'.includes(ori)) fail(`orientación ${w}`)
    return { ori, idx: Number(w.slice(1)), loc: r.num() }
  }
  for (let i = 0; i < nt; i++) {
    const type = r.next()
    const geo: string[] = []
    while (!FLAGS.test(r.peek())) geo.push(r.next())
    r.next()
    const refs: Ref[] = []
    for (let w = r.next(); w !== '*'; w = r.next()) refs.push(readRef(w))
    shapes.set(nt - i, { type, geo, refs })
  }
  const root = readRef(r.next())
  return { locs, curves, surfaces, shapes, root }
}

// --- Geometría a ACIS ---

const flip = (o: Ori, parent: Ori): Ori => (parent === '-' ? (o === '+' ? '-' : o === '-' ? '+' : o) : o)

/** Escala uniforme de una ubicación (las de OpenCascade son semejanzas). */
const scaleOf = (m: Mat): number => Math.cbrt(Math.abs(detMat(m)))

/** Ejes ubicados; `direct`: si la terna X, Y, Z es directa (en una indirecta la normal de la superficie es −Z). */
function placeAx(ax: Ax, m: Mat): Ax & { direct: boolean } {
  const p = atPt(m, ax.p)
  const n = unit(atDir(m, ax.n))
  const x = unit(atDir(m, ax.x))
  const y = unit(atDir(m, ax.y))
  return { p, n, x, y, direct: dot(cross(x, y), n) > 0 }
}

/** Polos de la B-spline de una curva, para revolverla o extruirla. */
function bsplOf(c: Curve, range?: [number, number]): Bspl | null {
  if (c.k === 'bspline') return c.s
  if (c.k === 'line' && range) {
    const a = add(c.p, scl(c.d, range[0]))
    const b = add(c.p, scl(c.d, range[1]))
    return { deg: 1, periodic: false, knots: [range[0], range[1]], mults: [2, 2], poles: [a, b] }
  }
  return null
}

/**
 * B-spline periódica de OpenCascade como una sujeta (no periódica) sobre [a, b]: se extiende periódicamente (polos y
 * nudos) y se sujeta en los extremos insertando nudos.
 */
export function unperiodize(s: Bspl, a?: number, b?: number): Bspl {
  if (!s.periodic) return s
  const p = s.deg
  const k0 = s.knots[0]
  const T = s.knots[s.knots.length - 1] - k0
  // Nudos planos de un período (sin repetir el último) y su extensión: cada polo i vale en [u_i, u_{i+p+1}].
  const flat: number[] = []
  for (let i = 0; i < s.knots.length - 1; i++) for (let m = 0; m < s.mults[i]; m++) flat.push(s.knots[i])
  const N = flat.length // = cantidad de polos
  if (N !== s.poles.length) fail('B-spline periódica mal formada')
  const from = a ?? k0
  const to = b ?? k0 + T
  // Índices de período que cubren [from, to] con p tramos de margen a cada lado.
  const lo = Math.floor((from - k0) / T) - 1
  const hi = Math.ceil((to - k0) / T) + 1
  const U: number[] = []
  const P: number[][] = []
  const w = s.weights
  // En OpenCascade el polo j de una periódica empieza en el nudo plano j − (p − m₀ + 1) (m₀: multiplicidad del primero):
  // al nudo plano i le toca el polo (i + p − m₀ + 1) mod N. Medido contra el núcleo con grados 2 y 3 y nudos dobles.
  const shift = p - s.mults[0] + 1
  for (let per = lo; per <= hi; per++)
    for (let i = 0; i < N; i++) {
      U.push(flat[i] + per * T)
      const j = (((i + shift) % N) + N) % N
      const q = s.poles[j]
      const wi = w ? w[j] : 1
      P.push([q[0] * wi, q[1] * wi, q[2] * wi, wi])
    }
  // Con polos P_j y nudos U_j (j = 0…), el polo j tiene soporte [U_j, U_{j+p+1}]: la lista de nudos completa es U con
  // p+1 más al final (los del período siguiente).
  for (let i = 0; i <= p; i++) U.push(flat[i % N] + (hi + 1 + Math.floor(i / N)) * T)
  const piece = clampPiece(U, P, p, from, to)
  return collapseBspl(piece.U, piece.P, p, !!w)
}

/** Inserta un nudo `t` (Boehm) en una B-spline homogénea. */
function insertKnot(U: number[], P: number[][], p: number, t: number): void {
  let k = p
  while (k + 1 < U.length - p - 1 && U[k + 1] <= t) k++
  const Q: number[][] = []
  for (let i = k - p + 1; i <= k; i++) {
    const den = U[i + p] - U[i]
    const a = den > 0 ? (t - U[i]) / den : 0
    Q.push(P[i - 1].map((v, d) => (1 - a) * v + a * P[i][d]))
  }
  P.splice(k - p + 1, p - 1, ...Q)
  U.splice(k + 1, 0, t)
}

/** El tramo [a, b] de una B-spline homogénea (nudos planos), sujeto: nudos con multiplicidad p+1 en a y en b. */
function clampPiece(U0: number[], P0: number[][], p: number, a: number, b: number): { U: number[]; P: number[][] } {
  const U = [...U0]
  const P = P0.map((q) => [...q])
  for (const t of [a, b]) {
    const have = U.filter((u) => Math.abs(u - t) < 1e-14 * (1 + Math.abs(t))).length
    for (let k = have; k < p + 1; k++) insertKnot(U, P, p, t)
  }
  const i0 = U.findIndex((u) => Math.abs(u - a) < 1e-14 * (1 + Math.abs(a)))
  let i1 = -1
  for (let i = U.length - 1; i >= 0; i--)
    if (Math.abs(U[i] - b) < 1e-14 * (1 + Math.abs(b))) {
      i1 = i
      break
    }
  if (i0 < 0 || i1 < 0) fail('tramo de B-spline')
  return { U: U.slice(i0, i1 + 1), P: P.slice(i0, i1 - p) }
}

function collapseBspl(U: number[], P: number[][], p: number, rational: boolean): Bspl {
  const knots: number[] = []
  const mults: number[] = []
  for (const u of U) {
    if (knots.length && Math.abs(u - knots[knots.length - 1]) < 1e-14 * (1 + Math.abs(u))) mults[mults.length - 1]++
    else {
      knots.push(u)
      mults.push(1)
    }
  }
  const poles = P.map((q) => [q[0] / q[3], q[1] / q[3], q[2] / q[3]] as Vec3)
  return { deg: p, periodic: false, knots, mults, poles, ...(rational ? { weights: P.map((q) => q[3]) } : {}) }
}

/** Listas de discontinuidades de ACIS (de primera, segunda y tercera derivada) desde los nudos interiores. */
function discontinuities(knots: number[], mults: number[], deg: number): Tok[] {
  const lists: number[][] = [[], [], []]
  for (let i = 1; i < knots.length - 1; i++) {
    const order = deg - mults[i] + 1
    if (order >= 1 && order <= 3) lists[order - 1].push(knots[i])
  }
  return lists.flatMap((l) => [int(l.length), ...l.map(dbl)])
}

/** Nudos al modo ACIS: los extremos con multiplicidad = grado (OpenCascade, sujetos, con grado + 1). */
function acisKnots(knots: number[], mults: number[], deg: number): Tok[] {
  const out: Tok[] = [int(knots.length)]
  knots.forEach((k, i) => out.push(dbl(k), int(i === 0 || i === knots.length - 1 ? Math.min(mults[i], deg) : mults[i])))
  return out
}

const near = (a: Vec3, b: Vec3, tol: number): boolean => len(sub(a, b)) <= tol

const CLOSURE = ['open', 'closed', 'periodic']

/** Curva B-spline como `intcurve-curve` con su aproximación exacta (`exactcur`). */
function intcurve(s0: Bspl, m: Mat, range: [number, number]): AcisRecord {
  const s = s0.periodic ? unperiodize(s0, range[0], range[1]) : s0
  const poles = s.poles.map((q) => atPt(m, q))
  const tol = 1e-9 * (1 + Math.max(...poles.map(len)))
  const closed = near(poles[0], poles[poles.length - 1], tol)
  const toks: Tok[] = [
    ...common(),
    sense(false),
    open,
    name('exactcur'),
    enumTok(0, 'full'),
    name(s.weights ? 'nurbs' : 'nubs'),
    int(s.deg),
    enumTok(closed ? 1 : 0, CLOSURE[closed ? 1 : 0]),
    ...acisKnots(s.knots, s.mults, s.deg),
  ]
  poles.forEach((q, i) => {
    toks.push(dbl(q[0]), dbl(q[1]), dbl(q[2]))
    if (s.weights) toks.push(dbl(s.weights[i]))
  })
  toks.push(
    dbl(0),
    name('null_surface'),
    name('null_surface'),
    name('nullbs'),
    name('nullbs'),
    ival(),
    ival(),
    ...discontinuities(s.knots, s.mults, s.deg),
    ival(1),
    ival(0),
    close,
    ival(),
    ival(),
  )
  return { type: 'intcurve-curve', toks }
}

/** Curva de una arista ya ubicada; `k` = escala de la ubicación (los parámetros de una recta son longitudes). */
function curveRecord(c: Curve, m: Mat, range: [number, number]): { rec: AcisRecord; range: [number, number] } {
  const k = scaleOf(m)
  switch (c.k) {
    case 'line':
      return { rec: { type: 'straight-curve', toks: [...common(), pos(atPt(m, c.p)), vec(unit(atDir(m, c.d))), ival(), ival()] }, range: [range[0] * k, range[1] * k] }
    case 'circle':
    case 'ellipse': {
      const ax = placeAx(c.ax, m)
      // La normal de ACIS es la del giro del parámetro (de X hacia Y), aunque la terna sea indirecta.
      const normal = unit(cross(ax.x, ax.y))
      const a = (c.k === 'circle' ? c.r : c.a) * k
      const ratio = c.k === 'circle' ? 1 : c.b / c.a
      return { rec: { type: 'ellipse-curve', toks: [...common(), pos(ax.p), vec(normal), vec(scl(ax.x, a)), dbl(ratio), ival(), ival()] }, range }
    }
    case 'bspline':
      return { rec: intcurve(c.s, m, range), range }
    default:
      return fail(c.what)
  }
}

interface SurfaceOut {
  rec: AcisRecord
  /** La normal de ACIS va al revés que la de OpenCascade (derivada en u × derivada en v): la cara cambia de sentido. */
  flipped: boolean
  planar: boolean
  /** Superficie periódica de ACIS: sus costuras no hacen falta. */
  periodic: boolean
}

const intervals4 = (): Tok[] => [ival(), ival(), ival(), ival()]

/** B-spline de superficie como `spline-surface` con su aproximación exacta (`exactsur`). */
function splineSurface(s0: BsplSurf, m: Mat): AcisRecord {
  let s = s0
  if (s.uperiodic || s.vperiodic) s = unperiodizeSurface(s)
  const nu = s.poles.length
  const nv = s.poles[0].length
  const P = s.poles.map((row) => row.map((q) => atPt(m, q)))
  const tol = 1e-9 * (1 + Math.max(...P.flat().map(len)))
  const closedU = P.every((_, j) => j >= nv || near(P[0][j], P[nu - 1][j], tol)) && P[0].every((q, j) => near(q, P[nu - 1][j], tol))
  const closedV = P.every((row) => near(row[0], row[nv - 1], tol))
  const toks: Tok[] = [
    ...common(),
    sense(false),
    open,
    name('exactsur'),
    enumTok(0, 'full'),
    name(s.weights ? 'nurbs' : 'nubs'),
    int(s.du),
    int(s.dv),
    enumTok(closedU ? 1 : 0, CLOSURE[closedU ? 1 : 0]),
    enumTok(closedV ? 1 : 0, CLOSURE[closedV ? 1 : 0]),
    enumTok(0, 'none'),
    enumTok(0, 'none'),
    int(s.ku.length),
    int(s.kv.length),
    ...acisKnots(s.ku, s.mu, s.du).slice(1),
    ...acisKnots(s.kv, s.mv, s.dv).slice(1),
  ]
  // u varía más rápido: los polos de una misma v van juntos.
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const q = P[i][j]
      toks.push(dbl(q[0]), dbl(q[1]), dbl(q[2]))
      if (s.weights) toks.push(dbl(s.weights[i][j]))
    }
  toks.push(dbl(0), ...discontinuities(s.ku, s.mu, s.du), ...discontinuities(s.kv, s.mv, s.dv), ival(1), ival(0), ival(1), ival(0), close, ...intervals4())
  return { type: 'spline-surface', toks }
}

/** Superficie B-spline periódica (en u o en v) como sujeta: cada fila o columna, como una curva. */
function unperiodizeSurface(s: BsplSurf): BsplSurf {
  let out = s
  if (out.uperiodic) {
    const nv = out.poles[0].length
    const cols = Array.from({ length: nv }, (_, j) =>
      unperiodize({
        deg: out.du,
        periodic: true,
        knots: out.ku,
        mults: out.mu,
        poles: out.poles.map((row) => row[j]),
        ...(out.weights ? { weights: out.weights.map((row) => row[j]) } : {}),
      }),
    )
    out = {
      ...out,
      uperiodic: false,
      ku: cols[0].knots,
      mu: cols[0].mults,
      poles: cols[0].poles.map((_, i) => cols.map((c) => c.poles[i])),
      ...(out.weights ? { weights: cols[0].poles.map((_, i) => cols.map((c) => c.weights![i])) } : {}),
    }
  }
  if (out.vperiodic) {
    const rows = out.poles.map((row, i) =>
      unperiodize({ deg: out.dv, periodic: true, knots: out.kv, mults: out.mv, poles: row, ...(out.weights ? { weights: out.weights[i] } : {}) }),
    )
    out = { ...out, vperiodic: false, kv: rows[0].knots, mv: rows[0].mults, poles: rows.map((r) => r.poles), ...(out.weights ? { weights: rows.map((r) => r.weights!) } : {}) }
  }
  return out
}

/** Revolución de una B-spline (polos ya ubicados): racional, con el círculo exacto de 9 polos por cada uno. */
function revolveBspl(c: Bspl, axP: Vec3, axD: Vec3): BsplSurf {
  const d = unit(axD)
  const W = Math.SQRT1_2
  const angles = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (i * Math.PI) / 4)
  const poles: Vec3[][] = []
  const weights: number[][] = []
  for (let i = 0; i < 9; i++) {
    poles.push([])
    weights.push([])
  }
  c.poles.forEach((q, j) => {
    const w = c.weights ? c.weights[j] : 1
    const h = dot(sub(q, axP), d)
    const center = add(axP, scl(d, h))
    const rv = sub(q, center)
    const rx = rv
    const ry = cross(d, rv)
    for (let i = 0; i < 9; i++) {
      const a = angles[i]
      // En los polos de esquina (impares) el radio se agranda 1/cos 45° y el peso se multiplica por cos 45°.
      const corner = i % 2 === 1
      const f = corner ? 1 / W : 1
      poles[i].push(add(center, add(scl(rx, Math.cos(a) * f), scl(ry, Math.sin(a) * f))))
      weights[i].push(w * (corner ? W : 1))
    }
  })
  return {
    du: 2,
    dv: c.deg,
    uperiodic: false,
    vperiodic: false,
    ku: [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 2 * Math.PI],
    mu: [3, 2, 2, 2, 3],
    kv: c.knots,
    mv: c.mults,
    poles,
    weights,
  }
}

function surfaceRecord(s: Surface, m: Mat, vRange: () => [number, number] | null): SurfaceOut {
  const k = scaleOf(m)
  switch (s.k) {
    case 'plane': {
      const ax = placeAx(s.ax, m)
      return {
        rec: { type: 'plane-surface', toks: [...common(), pos(ax.p), vec(unit(cross(ax.x, ax.y))), vec(ax.x), senseV(false), ...intervals4()] },
        flipped: false,
        planar: true,
        periodic: false,
      }
    }
    case 'cylinder':
    case 'cone': {
      const ax = placeAx(s.ax, m)
      const r = s.r * k
      const sine = s.k === 'cone' ? Math.sin(s.ang) : 0
      const cosine = s.k === 'cone' ? Math.cos(s.ang) : 1
      // El cono de ACIS: radio r + h·seno/coseno a la altura h sobre su normal, normal hacia afuera (coseno > 0).
      return {
        rec: {
          type: 'cone-surface',
          toks: [...common(), pos(ax.p), vec(ax.n), vec(scl(ax.x, r)), dbl(1), ival(), ival(), dbl(sine), dbl(cosine), dbl(r), sense(false), ...intervals4()],
        },
        flipped: !ax.direct,
        planar: false,
        periodic: true,
      }
    }
    case 'sphere': {
      const ax = placeAx(s.ax, m)
      return {
        rec: { type: 'sphere-surface', toks: [...common(), pos(ax.p), dbl(s.r * k), vec(ax.x), vec(ax.n), senseV(false), ...intervals4()] },
        flipped: !ax.direct,
        planar: false,
        periodic: true,
      }
    }
    case 'torus': {
      const ax = placeAx(s.ax, m)
      return {
        rec: { type: 'torus-surface', toks: [...common(), pos(ax.p), vec(ax.n), dbl(s.R * k), dbl(s.r * k), vec(ax.x), senseV(false), ...intervals4()] },
        flipped: !ax.direct,
        planar: false,
        periodic: true,
      }
    }
    case 'bspline':
      return { rec: splineSurface(s.s, m), flipped: false, planar: false, periodic: false }
    case 'extrusion': {
      // S(u, v) = C(u) + v·D: con la recta, un plano; si no, una B-spline de grado 1 en v sobre el tramo de la cara.
      const D = unit(s.d)
      if (s.c.k === 'line') {
        const n = cross(s.c.d, D)
        if (len(n) < 1e-12) fail('extrusión degenerada')
        // Normal de OpenCascade: C'(u) × D.
        return surfaceRecord({ k: 'plane', ax: { p: s.c.p, n: unit(n), x: unit(s.c.d), y: unit(cross(unit(n), unit(s.c.d))) } }, m, vRange)
      }
      const c = s.c.k === 'circle' || s.c.k === 'ellipse' ? conicBspl(s.c) : bsplOf(s.c)
      if (!c) fail('extrusión de una curva sin B-spline')
      const vr = vRange()
      if (!vr) fail('extrusión sin tramo')
      const [v0, v1] = vr!
      const cs = c!.periodic ? unperiodize(c!) : c!
      return surfaceRecord(
        {
          k: 'bspline',
          s: {
            du: cs.deg,
            dv: 1,
            uperiodic: false,
            vperiodic: false,
            ku: cs.knots,
            mu: cs.mults,
            kv: [v0, v1],
            mv: [2, 2],
            poles: cs.poles.map((q) => [add(q, scl(D, v0)), add(q, scl(D, v1))]),
            ...(cs.weights ? { weights: cs.weights.map((w) => [w, w]) } : {}),
          },
        },
        m,
        vRange,
      )
    }
    case 'revolution': {
      const c = s.c.k === 'circle' || s.c.k === 'ellipse' ? conicBspl(s.c) : bsplOf(s.c, vRange() ?? undefined)
      if (!c) fail('revolución de una curva sin B-spline')
      const cs = c!.periodic ? unperiodize(c!) : c!
      return surfaceRecord({ k: 'bspline', s: revolveBspl(cs, s.p, s.d) }, m, vRange)
    }
    default:
      return fail(s.what)
  }
}

/** Círculo o elipse como B-spline racional (9 polos, parámetro distinto: sólo para armar superficies). */
function conicBspl(c: Curve & { k: 'circle' | 'ellipse' }): Bspl {
  const a = c.k === 'circle' ? c.r : c.a
  const b = c.k === 'circle' ? c.r : c.b
  const W = Math.SQRT1_2
  const poles: Vec3[] = []
  const weights: number[] = []
  for (let i = 0; i < 9; i++) {
    const ang = (i * Math.PI) / 4
    const f = i % 2 === 1 ? 1 / W : 1
    poles.push(add(c.ax.p, add(scl(c.ax.x, a * Math.cos(ang) * f), scl(c.ax.y, b * Math.sin(ang) * f))))
    weights.push(i % 2 === 1 ? W : 1)
  }
  return { deg: 2, periodic: false, knots: [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 2 * Math.PI], mults: [3, 2, 2, 2, 3], poles, weights }
}

// --- Topología ---

export interface AcisModel {
  recs: AcisRecord[]
  /** Sólido cerrado, lámina plana (REGION) u otra lámina (BODY). */
  kind: 'solid' | 'region' | 'body'
  faces: number
}

interface EdgeOut {
  rec: number
  v0: number
  v1: number
  coedges: number[]
}

/**
 * Modelo ACIS de una forma de OpenCascade (su texto BRep). `sheet`: la forma es una lámina (sin volumen): sus caras
 * van de dos lados. Falla (`BrepToAcisError`) con lo que ACIS no tiene cómo representar así.
 */
export function brepToAcis(text: string, sheet = false): AcisModel {
  const b = parseBrep(text)
  const recs: AcisRecord[] = []
  const addRec = (r: AcisRecord): number => recs.push(r) - 1
  const set = (i: number, at: number, t: Tok) => {
    recs[i].toks[at] = t
  }
  const shape = (idx: number): TShape => b.shapes.get(idx) ?? fail(`forma ${idx}`)
  const locOf = (i: number): Mat => b.locs[i] ?? fail(`ubicación ${i}`)

  const vertices = new Map<string, number>()
  const edges = new Map<string, EdgeOut>()
  const keyOf = (idx: number, m: Mat) => (isIdent(m) ? `${idx}` : `${idx}|${m.join(',')}`)

  const vertexOf = (ref: Ref, m0: Mat): number => {
    const m = mulMat(m0, locOf(ref.loc))
    const key = keyOf(ref.idx, m)
    const known = vertices.get(key)
    if (known !== undefined) return known
    const s = shape(ref.idx)
    if (s.type !== 'Ve') fail('vértice esperado')
    const p = atPt(m, [Number(s.geo[1]), Number(s.geo[2]), Number(s.geo[3])])
    if (p.some((v) => !Number.isFinite(v))) fail('vértice sin punto')
    const point = addRec({ type: 'point', toks: [...common(), pos(p)] })
    const v = addRec({ type: 'vertex', toks: [...common(), ptr(-1), ptr(point)] })
    vertices.set(key, v)
    return v
  }

  /** Datos de una arista: su curva 3D (índice, ubicación, tramo), si es degenerada y sus vértices. */
  const edgeData = (s: TShape) => {
    const g = s.geo
    const degenerated = g[3] === '1'
    let curve: { idx: number; loc: number; range: [number, number] } | null = null
    for (let i = 4; i < g.length; ) {
      const t = g[i]
      if (t === '0') break
      if (t === '1') {
        curve = { idx: Number(g[i + 1]), loc: Number(g[i + 2]), range: [Number(g[i + 3]), Number(g[i + 4])] }
        i += 5
      } else if (t === '2') i += 6
      else if (t === '3') {
        // `3 c2d1 c2d2 CONT …`: la continuidad puede venir pegada al segundo índice («3CN»).
        const glued = /^\d+(C0|C1|C2|C3|CN|G1|G2)$/.test(g[i + 2])
        i += glued ? 7 : 8
      } else if (t === '4') {
        const glued = /^(C0|C1|C2|C3|CN|G1|G2)$/.test(g[i + 1])
        i += glued ? 6 : 7
      } else if (t === '5') i += 3
      else if (t === '6') i += 4
      else if (t === '7') i += 5
      else fail(`representación de arista ${t}`)
    }
    return { degenerated, curve }
  }

  const edgeOf = (ref: Ref, m0: Mat): EdgeOut => {
    const m = mulMat(m0, locOf(ref.loc))
    const key = keyOf(ref.idx, m)
    const known = edges.get(key)
    if (known) return known
    const s = shape(ref.idx)
    const { curve } = edgeData(s)
    if (!curve) fail('arista sin curva')
    const cm = mulMat(m, locOf(curve!.loc))
    const c = b.curves[curve!.idx] ?? fail('curva inexistente')
    const { rec: crec, range } = curveRecord(c, cm, curve!.range)
    const ci = addRec(crec)
    const vf = s.refs.find((r) => r.ori === '+')
    const vr = s.refs.find((r) => r.ori === '-')
    if (!vf || !vr) fail('arista sin sus dos vértices')
    const v0 = vertexOf(vf!, m)
    const v1 = vertexOf(vr!, m)
    const e = addRec({ type: 'edge', toks: [...common(), ptr(v0), dbl(range[0]), ptr(v1), dbl(range[1]), ptr(-1), ptr(ci), sense(false), str('unknown')] })
    // El vértice apunta a una de sus aristas.
    for (const v of [v0, v1]) if ((recs[v].toks[3] as { v: number }).v < 0) set(v, 3, ptr(e))
    const out = { rec: e, v0, v1, coedges: [] }
    edges.set(key, out)
    return out
  }

  // Recorrido: sólidos → lumps; cáscaras → shells; caras.
  const solids: Array<{ shells: Array<{ faces: Array<{ ref: Ref; m: Mat; ori: Ori }> }> }> = []
  let current: (typeof solids)[number] | null = null
  const walk = (ref: Ref, m0: Mat, ori: Ori, depth = 0): void => {
    if (depth > 64) fail('anidamiento')
    const s = shape(ref.idx)
    const m = mulMat(m0, locOf(ref.loc))
    const o = flip(ref.ori, ori)
    switch (s.type) {
      case 'Co':
      case 'CS':
        for (const r of s.refs) walk(r, m, o, depth + 1)
        return
      case 'So': {
        current = { shells: [] }
        solids.push(current)
        for (const r of s.refs) walk(r, m, o, depth + 1)
        current = null
        return
      }
      case 'Sh': {
        const own = !current
        const solid = current ?? { shells: [] }
        if (own) solids.push(solid)
        const shell = { faces: [] as Array<{ ref: Ref; m: Mat; ori: Ori }> }
        solid.shells.push(shell)
        for (const r of s.refs) {
          if (shape(r.idx).type === 'Fa') shell.faces.push({ ref: r, m, ori: flip(r.ori, o) })
        }
        return
      }
      case 'Fa':
        solids.push({ shells: [{ faces: [{ ref, m: m0, ori: o }] }] })
        return
      default:
        // Aristas o vértices sueltos: ACIS los tendría como alambres; no se escriben.
        return
    }
  }
  walk(b.root, IDENT, '+')
  if (!solids.length) fail('forma sin caras')

  if (solids.some((s) => s.shells.some((sh) => sh.faces.some((f) => detMat(mulMat(f.m, locOf(f.ref.loc))) < 0)))) fail('ubicación reflejada')

  const body = addRec({ type: 'body', toks: [...common(), ptr(-1), ptr(-1), ptr(-1)] })
  let prevLump = -1
  let faceCount = 0
  let allPlanar = true
  let plane: { n: Vec3; d: number } | null = null
  let coplanar = true
  for (const solid of solids) {
    const lump = addRec({ type: 'lump', toks: [...common(), ptr(-1), ptr(-1), ptr(body)] })
    if (prevLump < 0) set(body, 3, ptr(lump))
    else set(prevLump, 3, ptr(lump))
    prevLump = lump
    let prevShell = -1
    for (const sh of solid.shells) {
      if (!sh.faces.length) continue
      const shell = addRec({ type: 'shell', toks: [...common(), ptr(-1), ptr(-1), ptr(-1), ptr(-1), ptr(lump)] })
      if (prevShell < 0) set(lump, 4, ptr(shell))
      else set(prevShell, 3, ptr(shell))
      prevShell = shell
      let prevFace = -1
      for (const f of sh.faces) {
        const fs = shape(f.ref.idx)
        const m = mulMat(f.m, locOf(f.ref.loc))
        // `nat tol surf loc`
        const si = Number(fs.geo[2])
        const sm = mulMat(m, locOf(Number(fs.geo[3])))
        const surf = b.surfaces[si] ?? fail('superficie inexistente')

        // Bordes de la cara: por cada wire, sus aristas con la orientación compuesta.
        type Co = { edgeRef: Ref; m: Mat; rev: boolean; key: string }
        const wires: Co[][] = []
        for (const wr of fs.refs) {
          const ws = shape(wr.idx)
          if (ws.type !== 'Wi') continue
          const wo = flip(wr.ori, f.ori)
          const wm = mulMat(m, locOf(wr.loc))
          const list: Co[] = []
          for (const er of ws.refs) {
            const eo = flip(er.ori, wo)
            if (eo !== '+' && eo !== '-') continue
            const em = mulMat(wm, locOf(er.loc))
            list.push({ edgeRef: er, m: wm, rev: eo === '-', key: keyOf(er.idx, mulMat(wm, locOf(er.loc))) })
            void em
          }
          wires.push(wo === '-' ? list.reverse() : list)
        }

        // Tramo de v de una extrusión o revolución: desde los vértices de la cara.
        const vRange = (): [number, number] | null => {
          if (surf.k !== 'extrusion' && surf.k !== 'revolution') return null
          const pts: Vec3[] = []
          for (const w of wires)
            for (const c of w) {
              const es = shape(c.edgeRef.idx)
              for (const vr of es.refs) {
                const vs = shape(vr.idx)
                if (vs.type === 'Ve') pts.push(atPt(locOf(vr.loc), [Number(vs.geo[1]), Number(vs.geo[2]), Number(vs.geo[3])]))
              }
              const { curve } = edgeData(es)
              const cv = curve && b.curves[curve.idx]
              if (cv && cv.k === 'bspline') pts.push(...cv.s.poles)
            }
          if (!pts.length) return null
          if (surf.k === 'extrusion') {
            const c = surf.c
            const nC = curvePlaneNormal(c)
            const D = unit(surf.d)
            if (c.k === 'other') return null
            const o = c.k === 'bspline' ? c.s.poles[0] : c.k === 'line' ? c.p : c.ax.p
            if (!nC || Math.abs(dot(D, nC)) < 1e-9) return null
            const vs = pts.map((q) => dot(sub(q, o), nC) / dot(D, nC))
            const lo = Math.min(...vs)
            const hi = Math.max(...vs)
            const pad = (hi - lo) * 0.01 + 1e-9
            return [lo - pad, hi + pad]
          }
          // Revolución de una recta: el tramo de la recta que cubre la cara (por la altura sobre el eje).
          const c = surf.c
          if (c.k !== 'line') return null
          const d = unit(surf.d)
          const along = dot(unit(c.d), d)
          if (Math.abs(along) < 1e-12) return null
          const ts = pts.map((q) => dot(sub(q, c.p), d) / along)
          const lo = Math.min(...ts)
          const hi = Math.max(...ts)
          const pad = (hi - lo) * 0.01 + 1e-9
          return [lo - pad, hi + pad]
        }

        const so = surfaceRecord(surf, sm, vRange)
        const surfIdx = addRec(so.rec)
        if (!so.planar) allPlanar = false
        else {
          const n = (so.rec.toks[4] as { v: Vec3 }).v
          const p0 = (so.rec.toks[3] as { v: Vec3 }).v
          const d = dot(n, p0)
          if (!plane) plane = { n, d }
          else if (Math.abs(Math.abs(dot(plane.n, n)) - 1) > 1e-9 || Math.abs(Math.abs(d) - Math.abs(plane.d)) > 1e-9 * (1 + Math.abs(d))) coplanar = false
        }

        // Fuera las aristas degeneradas y, en las superficies periódicas de ACIS, las costuras (la misma arista dos veces).
        const counts = new Map<string, number>()
        for (const w of wires) for (const c of w) counts.set(c.key, (counts.get(c.key) ?? 0) + 1)
        const kept = wires.map((w) => w.filter((c) => !edgeData(shape(c.edgeRef.idx)).degenerated && !(so.periodic && (counts.get(c.key) ?? 0) > 1)))

        const reversed = (f.ori === '-') !== so.flipped
        const double = sheet
        const face = addRec({
          type: 'face',
          toks: [
            ...common(),
            ptr(-1),
            ptr(-1),
            ptr(shell),
            ptr(-1),
            ptr(surfIdx),
            sense(reversed),
            { k: 'b', v: double, t: 'double', f: 'single' },
            ...(double ? [{ k: 'b', v: false, t: 'in', f: 'out' } as Tok] : []),
          ],
        })
        faceCount++
        if (prevFace < 0) set(shell, 5, ptr(face))
        else set(prevFace, 3, ptr(face))
        prevFace = face

        // Lazos: las aristas que quedaron, encadenadas por sus vértices (al sacar costuras un wire puede dar dos lazos).
        const all = kept.flat().map((c) => {
          const e = edgeOf(c.edgeRef, c.m)
          return { ...c, e, from: c.rev ? e.v1 : e.v0, to: c.rev ? e.v0 : e.v1 }
        })
        const used = new Array<boolean>(all.length).fill(false)
        let prevLoop = -1
        for (let s0 = 0; s0 < all.length; s0++) {
          if (used[s0]) continue
          const chain = [s0]
          used[s0] = true
          while (all[chain[chain.length - 1]].to !== all[s0].from) {
            const at = all[chain[chain.length - 1]].to
            // La siguiente en el orden del wire, si sigue; si no, cualquiera que empiece donde termina esta.
            const last = chain[chain.length - 1]
            let nx = last + 1 < all.length && !used[last + 1] && all[last + 1].from === at ? last + 1 : -1
            if (nx < 0) nx = all.findIndex((c, i) => !used[i] && c.from === at)
            if (nx < 0) fail('lazo abierto')
            used[nx] = true
            chain.push(nx)
          }
          const loop = addRec({ type: 'loop', toks: [...common(), ptr(-1), ptr(-1), ptr(face)] })
          if (prevLoop < 0) set(face, 4, ptr(loop))
          else set(prevLoop, 3, ptr(loop))
          prevLoop = loop
          const ids = chain.map((i) => {
            const c = all[i]
            const co = addRec({ type: 'coedge', toks: [...common(), ptr(-1), ptr(-1), ptr(-1), ptr(c.e.rec), sense(c.rev), ptr(loop), ptr(-1)] })
            c.e.coedges.push(co)
            return co
          })
          set(loop, 4, ptr(ids[0]))
          ids.forEach((co, i) => {
            set(co, 3, ptr(ids[(i + 1) % ids.length]))
            set(co, 4, ptr(ids[(i - 1 + ids.length) % ids.length]))
          })
        }
      }
    }
  }

  // Compañeras: los bordes de una misma arista en anillo; la arista apunta al primero.
  for (const e of edges.values()) {
    if (!e.coedges.length) fail('arista sin borde de cara')
    set(e.rec, 7, ptr(e.coedges[0]))
    if (e.coedges.length > 1) e.coedges.forEach((co, i) => set(co, 5, ptr(e.coedges[(i + 1) % e.coedges.length])))
  }
  for (const v of vertices.values()) if ((recs[v].toks[3] as { v: number }).v < 0) fail('vértice suelto')

  return { recs, kind: !sheet ? 'solid' : allPlanar && coplanar ? 'region' : 'body', faces: faceCount }
}

/** Normal del plano de una curva plana (para el tramo de una extrusión); null si no es plana o es una recta. */
function curvePlaneNormal(c: Curve): Vec3 | null {
  if (c.k === 'circle' || c.k === 'ellipse') return unit(c.ax.n)
  if (c.k !== 'bspline' || c.s.poles.length < 3) return null
  const P = c.s.poles
  let n: Vec3 = [0, 0, 0]
  for (let i = 1; i + 1 < P.length; i++) n = add(n, cross(sub(P[i], P[0]), sub(P[i + 1], P[0])))
  if (len(n) < 1e-12) return null
  const u = unit(n)
  const scale = Math.max(...P.map((q) => len(sub(q, P[0]))))
  return P.every((q) => Math.abs(dot(sub(q, P[0]), u)) <= 1e-9 * (1 + scale)) ? u : null
}
