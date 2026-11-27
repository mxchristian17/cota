import type { Vec3 } from '../math'
import { acisRecords, kindOf, lastNumbers, modelOf, type Item, type Rec } from './acis'

/**
 * Modelo ACIS (3DSOLID, BODY, REGION y superficies de un DWG/DXF) escrito como STEP (AP214) en memoria, para que el
 * núcleo exacto (OpenCascade) lo lea como sólido y no como malla. La topología pasa una a una: cuerpo → sólido (o
 * superficie, si su cáscara está abierta), cáscara, cara, lazo, borde de cara, arista y vértice. Superficies: plano,
 * cilindro, cono, esfera, toro y B-spline; curvas: recta, círculo, elipse y B-spline (la aproximación que guarda el
 * ACIS de sus curvas de intersección). Una curva que no se puede escribir así sale como la polilínea de sus puntos. La
 * transformación del cuerpo se aplica a la geometría.
 */
type Pt = Vec3

export interface AcisStepStats {
  faces: number
  edges: number
  /** Aristas escritas como polilínea (curva sin aproximación B-spline legible). */
  polylines: number
  /** Motivo → cantidad, de lo que impidió escribir el modelo o una de sus partes. */
  issues: Record<string, number>
}

export interface AcisStep {
  step: string
  /** Sólidos cerrados y superficies (cáscaras abiertas) escritos. */
  solids: number
  sheets: number
  stats: AcisStepStats
}

const isRef = (x: Item | undefined): x is { ref: number } => typeof x === 'object' && x !== null
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Pt, b: Pt): Pt => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: Pt): number => Math.hypot(a[0], a[1], a[2])
const scale = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k, a[2] * k]
const unit = (a: Pt): Pt => {
  const l = len(a)
  return l > 1e-300 ? scale(a, 1 / l) : [0, 0, 1]
}
const perp = (n: Pt): Pt => unit(cross(Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], n))

/** ¿Sentido invertido? `reversed` en SAT, verdadero en SAB. */
const rev = (x: Item | undefined): boolean => x === 'reversed' || x === 'T'

/** Primer dato propio de un registro: desde ACIS 7 lo preceden el atributo, el número de historia y otra referencia. */
const first = (r: Rec): number => (typeof r.items[1] === 'number' ? 3 : 1)

/** Real en sintaxis STEP: siempre con punto decimal (`1.`, `2.5E-07`). */
function real(x: number): string {
  if (!Number.isFinite(x) || Math.abs(x) < 1e-300) return '0.'
  const s = String(x)
  const e = s.indexOf('e')
  if (e < 0) return s.includes('.') ? s : `${s}.`
  const m = s.slice(0, e)
  return `${m.includes('.') ? m : `${m}.`}E${s.slice(e + 1)}`
}

export interface Bs3Curve {
  deg: number
  knots: number[]
  mults: number[]
  ctrl: Pt[]
  weights?: number[]
}

interface Bs3Surface {
  du: number
  dv: number
  ku: number[]
  mu: number[]
  kv: number[]
  mv: number[]
  /** `ctrl[i][j]`: i a lo largo de u (el primer vector de nudos), j a lo largo de v. */
  ctrl: Pt[][]
  weights?: number[][]
}

/**
 * Nudos de una B-spline de ACIS desde `i`: cantidad y después pares valor–multiplicidad. ACIS guarda los extremos con
 * multiplicidad = grado; STEP (como OpenCascade) los quiere sujetos, con grado + 1.
 */
function knotsAt(items: Item[], i: number, deg: number): { knots: number[]; mults: number[]; next: number } | null {
  const n = items[i++]
  if (typeof n !== 'number' || n < 2) return null
  const knots: number[] = []
  const mults: number[] = []
  for (let k = 0; k < n; k++) {
    const v = items[i++]
    const m = items[i++]
    if (typeof v !== 'number' || typeof m !== 'number') return null
    knots.push(v)
    mults.push(m)
  }
  if (mults[0] <= deg) mults[0] = deg + 1
  if (mults[n - 1] <= deg) mults[n - 1] = deg + 1
  return { knots, mults, next: i }
}

const ctrlCount = (mults: number[], deg: number) => mults.reduce((s, m) => s + m, 0) - deg - 1

/** Curva `nubs`/`nurbs` que empieza en `at`: grado, forma, nudos y puntos de control. */
function bs3CurveAt(items: Item[], at: number): Bs3Curve | null {
  const rational = items[at] === 'nurbs'
  const deg = items[at + 1]
  if (typeof deg !== 'number' || deg < 1) return null
  const k = knotsAt(items, at + 3, deg)
  if (!k) return null
  const n = ctrlCount(k.mults, deg)
  if (n <= deg) return null
  let i = k.next
  const ctrl: Pt[] = []
  const weights: number[] = []
  for (let c = 0; c < n; c++) {
    const p = [items[i++], items[i++], items[i++]]
    const w = rational ? items[i++] : 1
    if (p.some((v) => typeof v !== 'number') || typeof w !== 'number') return null
    ctrl.push(p as Pt)
    weights.push(w)
  }
  return {
    deg,
    knots: k.knots,
    mults: k.mults,
    ctrl,
    ...(rational ? { weights } : {}),
  }
}

/** Vector de nudos completo y puntos de control homogéneos (x·w, y·w, z·w, w) de una curva. */
function expanded(bs: Bs3Curve): { U: number[]; P: number[][] } {
  const U = bs.knots.flatMap((k, i) => Array<number>(bs.mults[i]).fill(k))
  const P = bs.ctrl.map((p, i) => {
    const wt = bs.weights?.[i] ?? 1
    return [p[0] * wt, p[1] * wt, p[2] * wt, wt]
  })
  return { U, P }
}

/** Inserta el nudo `t` una vez (Boehm): la curva no cambia. */
function insertKnot(U: number[], P: number[][], d: number, t: number): void {
  let k = d
  while (k < P.length - 1 && U[k + 1] <= t) k++
  const Q: number[][] = []
  for (let i = k - d + 1; i <= k; i++) {
    const den = U[i + d] - U[i]
    const a = den > 0 ? (t - U[i]) / den : 0
    Q.push(P[i - 1].map((v, c) => (1 - a) * v + a * P[i][c]))
  }
  P.splice(k - d + 1, d - 1, ...Q)
  U.splice(k + 1, 0, t)
}

/**
 * El tramo [a, b] de una curva sujeta, como otra curva sujeta: se insertan `a` y `b` hasta multiplicidad = grado (la
 * curva pasa ahí por un punto de control) y se toman los puntos y nudos de en medio.
 */
function piece(U0: number[], P0: number[][], d: number, a: number, b: number): { U: number[]; P: number[][] } {
  const U = [...U0]
  const P = P0.map((p) => [...p])
  const lo = U[0]
  const hi = U[U.length - 1]
  const mult = (t: number) => U.filter((u) => Math.abs(u - t) <= 1e-12 * (1 + Math.abs(t))).length
  for (const t of [a, b]) if (t > lo && t < hi) for (let m = mult(t); m < d; m++) insertKnot(U, P, d, t)
  const near = (u: number, t: number) => Math.abs(u - t) <= 1e-12 * (1 + Math.abs(t))
  const ia = a <= lo ? 0 : U.findIndex((u) => near(u, a)) - 1
  const inner = U.filter((u) => u > a && u < b && !near(u, a) && !near(u, b))
  const n = d + 1 + inner.length
  return {
    U: [...Array<number>(d + 1).fill(a), ...inner, ...Array<number>(d + 1).fill(b)],
    P: P.slice(ia, ia + n),
  }
}

/** Curva B-spline desde nudos completos y puntos homogéneos. */
function collapse(U: number[], P: number[][], d: number, rational: boolean): Bs3Curve {
  const knots: number[] = []
  const mults: number[] = []
  for (const u of U) {
    if (knots.length && Math.abs(u - knots[knots.length - 1]) <= 1e-12 * (1 + Math.abs(u))) mults[mults.length - 1]++
    else {
      knots.push(u)
      mults.push(1)
    }
  }
  const ctrl = P.map((p): Pt => [p[0] / p[3], p[1] / p[3], p[2] / p[3]])
  return {
    deg: d,
    knots,
    mults,
    ctrl,
    ...(rational ? { weights: P.map((p) => p[3]) } : {}),
  }
}

/** ¿Curva bien formada? (tantos puntos como piden sus nudos, y al menos grado + 1). */
const wellFormed = (c: Bs3Curve | null): c is Bs3Curve =>
  !!c && c.ctrl.length > c.deg && c.ctrl.length === ctrlCount(c.mults, c.deg) && c.ctrl.every((p) => p.every(Number.isFinite))

/**
 * El tramo de la curva que recorre una arista, de `s0` a `s1` en el parámetro de la curva (crecientes). En una curva
 * cerrada el tramo puede pasar por el inicio de la curva (los parámetros de ACIS siguen de largo, en otra vuelta): se
 * arma con el final de una vuelta y el principio de la siguiente, unidos en un punto de control.
 */
export function curvePiece(bs: Bs3Curve, s0: number, s1: number): Bs3Curve | null {
  const { U, P } = expanded(bs)
  const d = bs.deg
  const lo = U[0]
  const hi = U[U.length - 1]
  const period = hi - lo
  if (!(period > 0) || !(s1 > s0) || s1 - s0 > period * (1 + 1e-9)) return null
  const rational = !!bs.weights
  const eps = 1e-9 * (1 + Math.abs(period))
  // A la vuelta que empieza en el rango de la curva.
  const turns = Math.floor((s0 - lo + eps) / period)
  const a = Math.max(lo, s0 - turns * period)
  const b = s1 - turns * period
  if (b <= hi + eps) {
    const one = piece(U, P, d, a, Math.min(b, hi))
    return collapse(one.U, one.P, d, rational)
  }
  const first = piece(U, P, d, a, hi)
  const second = piece(U, P, d, lo, Math.min(hi, b - period))
  // Sólo en una curva cerrada: el final de una vuelta es el principio de la siguiente.
  const end = first.P[first.P.length - 1]
  const start = second.P[0]
  const gap = Math.hypot(end[0] / end[3] - start[0] / start[3], end[1] / end[3] - start[1] / start[3], end[2] / end[3] - start[2] / start[3])
  const span = Math.hypot(...[0, 1, 2].map((c) => Math.max(...P.map((p) => p[c] / p[3])) - Math.min(...P.map((p) => p[c] / p[3]))))
  if (gap > 1e-6 * (1 + span)) return null
  const join = [...first.U.slice(0, -1), ...second.U.slice(d + 1).map((u) => u + period)]
  return collapse(join, [...first.P, ...second.P.slice(1)], d, rational)
}

/** Superficie `nubs`/`nurbs` que empieza en `at`: grados, formas y singularidades, nudos en u y v, puntos de control. */
function bs3SurfaceAt(items: Item[], at: number): Bs3Surface | null {
  const rational = items[at] === 'nurbs'
  const du = items[at + 1]
  const dv = items[at + 2]
  if (typeof du !== 'number' || typeof dv !== 'number') return null
  // Tras los grados, las formas y singularidades (textos o enumerados) hasta la cantidad de nudos en u y en v.
  let i = at + 3
  while (i < items.length && typeof items[i] !== 'number') i++
  const nku = items[i]
  const nkv = items[i + 1]
  if (typeof nku !== 'number' || typeof nkv !== 'number') return null
  // Los dos conjuntos de nudos van seguidos: se leen con la cantidad de cada uno delante.
  const ku = knotsAt([nku, ...items.slice(i + 2, i + 2 + 2 * nku)], 0, du)
  const kv = knotsAt([nkv, ...items.slice(i + 2 + 2 * nku, i + 2 + 2 * nku + 2 * nkv)], 0, dv)
  if (!ku || !kv) return null
  const nu = ctrlCount(ku.mults, du)
  const nv = ctrlCount(kv.mults, dv)
  if (nu <= du || nv <= dv) return null
  i += 2 + 2 * nku + 2 * nkv
  const ctrl: Pt[][] = Array.from({ length: nu }, () => [])
  const weights: number[][] = Array.from({ length: nu }, () => [])
  // u varía más rápido: los puntos de una misma v van juntos.
  for (let j = 0; j < nv; j++)
    for (let c = 0; c < nu; c++) {
      const p = [items[i++], items[i++], items[i++]]
      const w = rational ? items[i++] : 1
      if (p.some((v) => typeof v !== 'number') || typeof w !== 'number') return null
      ctrl[c][j] = p as Pt
      weights[c][j] = w
    }
  return {
    du,
    dv,
    ku: ku.knots,
    mu: ku.mults,
    kv: kv.knots,
    mv: kv.mults,
    ctrl,
    ...(rational ? { weights } : {}),
  }
}

/**
 * Subtipos (`{ nombre … }`) del modelo en el orden en que se escribieron, anidados incluidos: una referencia
 * `{ ref n }` nombra el n-ésimo. Cada uno es su registro y la posición de su nombre.
 */
function subtypesOf(recs: Rec[]): Array<{ r: Rec; at: number }> {
  const out: Array<{ r: Rec; at: number }> = []
  for (const r of recs) for (let i = 0; i + 1 < r.items.length; i++) if (r.items[i] === '{' && r.items[i + 1] !== 'ref') out.push({ r, at: i + 1 })
  return out
}

/** Datos del subtipo de un registro (siguiendo una referencia): los ítems y desde dónde, hasta su `}`. */
function subtypeItems(r: Rec, table: Array<{ r: Rec; at: number }>): Item[] | null {
  const open = r.items.indexOf('{')
  if (open < 0) return r.items // SAT viejos: sin llaves
  let src = r
  let at = open + 1
  for (let hops = 0; src.items[at] === 'ref' && hops < 8; hops++) {
    const n = src.items[at + 1]
    const t = typeof n === 'number' ? table[n] : undefined
    if (!t) return null
    src = t.r
    at = t.at
  }
  let depth = 1
  let end = at
  while (end < src.items.length && depth > 0) {
    if (src.items[end] === '{') depth++
    else if (src.items[end] === '}') depth--
    end++
  }
  return src.items.slice(at, end - 1)
}

/** La aproximación B-spline propia de un subtipo (la primera `nubs`/`nurbs` de su nivel, no la de uno anidado). */
function ownSplineAt(items: Item[]): number {
  let depth = 0
  for (let i = 0; i < items.length; i++) {
    const x = items[i]
    if (x === '{') depth++
    else if (x === '}') depth--
    else if (depth === 0 && (x === 'nubs' || x === 'nurbs')) return i
  }
  return -1
}

/** Escritor de entidades STEP; las 15 primeras son el encabezado de la pieza (ver `stepFile`). */
class StepWriter {
  lines: string[] = []
  n = 15
  add(s: string): number {
    this.lines.push(`#${++this.n}=${s};`)
    return this.n
  }
  point(p: Pt): number {
    return this.add(`CARTESIAN_POINT('',(${real(p[0])},${real(p[1])},${real(p[2])}))`)
  }
  dir(d: Pt): number {
    const u = unit(d)
    return this.add(`DIRECTION('',(${real(u[0])},${real(u[1])},${real(u[2])}))`)
  }
  /** Terna con Z = `z` y X lo más cerca posible de `x` (ortogonalizada). */
  axes(o: Pt, z: Pt, x: Pt): number {
    const zu = unit(z)
    let xu = sub(x, scale(zu, dot(x, zu)))
    xu = len(xu) > 1e-12 ? unit(xu) : perp(zu)
    return this.add(`AXIS2_PLACEMENT_3D('',#${this.point(o)},#${this.dir(zu)},#${this.dir(xu)})`)
  }
}

const list = (ids: number[]) => `(${ids.map((i) => `#${i}`).join(',')})`
const ints = (v: number[]) => `(${v.map((x) => String(Math.round(x))).join(',')})`
const reals = (v: number[]) => `(${v.map(real).join(',')})`
const bool = (b: boolean) => (b ? '.T.' : '.F.')

/** Encabezado y contexto de un STEP AP214 de una pieza; `items` son los sólidos o superficies, `rep` su representación. */
function stepFile(w: StepWriter, items: number[], rep: string, tol: number): string {
  const head = [
    "#1=APPLICATION_CONTEXT('automotive design');",
    "#2=APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#1);",
    "#3=PRODUCT_CONTEXT('',#1,'mechanical');",
    "#4=PRODUCT('ACIS','ACIS','',(#3));",
    "#5=PRODUCT_DEFINITION_FORMATION('','',#4);",
    "#6=PRODUCT_DEFINITION_CONTEXT('part definition',#1,'design');",
    "#7=PRODUCT_DEFINITION('design','',#5,#6);",
    "#8=PRODUCT_DEFINITION_SHAPE('','',#7);",
    '#9=SHAPE_DEFINITION_REPRESENTATION(#8,#15);',
    '#10=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));',
    '#11=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));',
    '#12=(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT());',
    `#13=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(${real(tol)}),#10,'distance_accuracy_value','');`,
    "#14=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#13))GLOBAL_UNIT_ASSIGNED_CONTEXT((#10,#11,#12))REPRESENTATION_CONTEXT('',''));",
    `#15=${rep}('',${list(items)},#14);`,
  ]
  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION((''),'2;1');",
    "FILE_NAME('','',(''),(''),'','','');",
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    'ENDSEC;',
    'DATA;',
    ...head,
    ...w.lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')
}

/** El modelo ACIS como STEP; null si no tiene caras (un cuerpo de alambre o vacío) o no se pudo leer. */
export function acisToStep(data: Uint8Array | string): AcisStep | null {
  let recs: Rec[]
  try {
    recs = acisRecords(data)
  } catch {
    return null
  }
  if (!recs.some((r) => kindOf(r) === 'face')) return null
  const stats: AcisStepStats = { faces: 0, edges: 0, polylines: 0, issues: {} }
  const issue = (why: string) => {
    stats.issues[why] = (stats.issues[why] ?? 0) + 1
  }
  const at = (x: Item | undefined): Rec | undefined => (isRef(x) && x.ref >= 0 ? recs[x.ref] : undefined)
  const field = (r: Rec, k: number): Item | undefined => r.items[first(r) + k]
  const table = subtypesOf(recs)
  const { pointOf, edgePoints } = modelOf(recs)

  // Transformación del cuerpo: filas de la matriz 3×3, traslación y escala (la de `modelOf`).
  const body = recs.find((r) => r.type === 'body')
  const tr = at(body && field(body, 2))
  const m = tr?.type === 'transform' ? tr.items.filter((x): x is number => typeof x === 'number').slice(-13) : null
  const k = m && m.length === 13 ? m[12] || 1 : 1
  const turn = (d: Pt): Pt =>
    m && m.length === 13 ? [d[0] * m[0] + d[1] * m[3] + d[2] * m[6], d[0] * m[1] + d[1] * m[4] + d[2] * m[7], d[0] * m[2] + d[1] * m[5] + d[2] * m[8]] : d
  const place = (p: Pt): Pt => {
    if (!m || m.length !== 13) return p
    const q = turn(p)
    return [q[0] * k + m[9], q[1] * k + m[10], q[2] * k + m[11]]
  }
  const det = m && m.length === 13 ? m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]) : 1
  /** La transformación refleja: los lazos quedan en el otro sentido respecto de la normal (se escriben invertidos). */
  const mirrored = det * k < 0
  const ks = Math.abs(k)

  const w = new StepWriter()
  const vertexIds = new Map<Rec, number>()
  const vertexId = (v: Rec): number | null => {
    const known = vertexIds.get(v)
    if (known) return known
    const p = pointOf(v)
    if (!p) return null
    const id = w.add(`VERTEX_POINT('',#${w.point(place(p))})`)
    vertexIds.set(v, id)
    return id
  }

  /** Curva de una arista y si la arista va en su sentido; null = arista degenerada (sin curva: un polo, un vértice). */
  type EdgeGeom = { curve: number; same: boolean } | null
  const curveOf = (e: Rec, v0: Rec, v1: Rec): EdgeGeom | 'fail' => {
    const s = first(e)
    const withParams = typeof e.items[s + 1] === 'number'
    const cField = withParams ? s + 5 : s + 3
    const c = at(e.items[cField])
    const edgeRev = rev(e.items[cField + 1])
    const p0 = pointOf(v0)
    const p1 = pointOf(v1)
    if (!p0 || !p1) return 'fail'
    const closed = len(sub(p0, p1)) <= 1e-9 * (1 + len(p0))
    if (!c) return closed ? null : 'fail'
    const polyline = (): EdgeGeom | 'fail' => {
      const pts = edgePoints(e)
      if (!pts || pts.length < 2) return closed ? null : 'fail'
      stats.polylines++
      return {
        curve: w.add(`POLYLINE('',${list(pts.map((p) => w.point(place(p))))})`),
        same: true,
      }
    }
    switch (c.type) {
      case 'straight-curve': {
        if (closed) return null
        const n = lastNumbers(c.items, 6)
        if (!n) return 'fail'
        const d = turn([n[3], n[4], n[5]])
        // El vector va como entidad propia: STEP no admite una entidad escrita adentro de otra.
        const vector = w.add(`VECTOR('',#${w.dir(d)},1.)`)
        const line = w.add(`LINE('',#${w.point(place([n[0], n[1], n[2]]))},#${vector})`)
        return { curve: line, same: !edgeRev }
      }
      case 'ellipse-curve': {
        const n = lastNumbers(c.items, 10)
        if (!n) return 'fail'
        const center = place([n[0], n[1], n[2]])
        // Reflejada, la elipse gira al revés alrededor de su normal: se toma la normal opuesta para conservar el sentido.
        const normal = scale(turn([n[3], n[4], n[5]]), mirrored ? -1 : 1)
        const major = turn([n[6], n[7], n[8]])
        const a = len([n[6], n[7], n[8]]) * ks
        const b = a * Math.abs(n[9])
        if (!(a > 0)) return 'fail'
        if (Math.abs(n[9] - 1) < 1e-12)
          return {
            curve: w.add(`CIRCLE('',#${w.axes(center, normal, major)},${real(a)})`),
            same: !edgeRev,
          }
        if (b <= a)
          return {
            curve: w.add(`ELLIPSE('',#${w.axes(center, normal, major)},${real(a)},${real(b)})`),
            same: !edgeRev,
          }
        // Eje menor más largo que el mayor: el mayor pasa a ser el otro (el parámetro se corre un cuarto de vuelta).
        return {
          curve: w.add(`ELLIPSE('',#${w.axes(center, normal, cross(normal, major))},${real(b)},${real(a)})`),
          same: !edgeRev,
        }
      }
      case 'intcurve-curve': {
        const items = subtypeItems(c, table)
        const i = items ? ownSplineAt(items) : -1
        const bs = items && i >= 0 ? bs3CurveAt(items, i) : null
        if (!bs) {
          issue('intcurve sin B-spline')
          return polyline()
        }
        const curveRev = rev(c.items[first(c)])
        let curveBs = bs
        let same = edgeRev === curveRev
        // Con los parámetros de la arista, sólo su tramo: en una curva cerrada la arista puede pasar por el inicio de
        // la curva, y una curva escrita entera iría por el otro lado. El parámetro de la B-spline es el de la arista,
        // con el signo cambiado por cada sentido invertido (de la arista respecto de la curva y de la curva respecto de
        // su B-spline). Se confirma con los vértices.
        const t0 = e.items[s + 1]
        const t1 = e.items[s + 3]
        if (withParams && typeof t0 === 'number' && typeof t1 === 'number') {
          const size = Math.max(1, ...bs.ctrl.map((p) => len(p)))
          const ok = (q: Pt, p: Pt) => len(sub(q, p)) <= 1e-5 * size
          for (const sg of [same ? 1 : -1, -1 * (same ? 1 : -1)]) {
            const u0 = sg * t0
            const u1 = sg * t1
            const fwd = u1 > u0
            const pc = curvePiece(bs, Math.min(u0, u1), Math.max(u0, u1))
            if (!wellFormed(pc)) continue
            const [from, to] = fwd ? [p0, p1] : [p1, p0]
            if (ok(pc.ctrl[0], from) && ok(pc.ctrl[pc.ctrl.length - 1], to)) {
              curveBs = pc
              same = fwd
              break
            }
          }
          if (curveBs === bs) issue('tramo de intcurve sin ubicar')
        }
        const pts = list(curveBs.ctrl.map((p) => w.point(place(p))))
        const knots = `${ints(curveBs.mults)},${reals(curveBs.knots)},.UNSPECIFIED.`
        const curve = curveBs.weights
          ? w.add(
              `(BOUNDED_CURVE()B_SPLINE_CURVE(${curveBs.deg},${pts},.UNSPECIFIED.,.F.,.F.)B_SPLINE_CURVE_WITH_KNOTS(${knots})CURVE()GEOMETRIC_REPRESENTATION_ITEM()RATIONAL_B_SPLINE_CURVE(${reals(curveBs.weights)})REPRESENTATION_ITEM(''))`,
            )
          : w.add(`B_SPLINE_CURVE_WITH_KNOTS('',${curveBs.deg},${pts},.UNSPECIFIED.,.F.,.F.,${knots})`)
        return { curve, same }
      }
      default:
        issue(`curva ${c.type}`)
        return polyline()
    }
  }

  const edgeIds = new Map<Rec, number | null>()
  /** Arista como EDGE_CURVE; null = degenerada (se omite del lazo); undefined = no se pudo escribir. */
  const edgeId = (e: Rec): number | null | undefined => {
    if (edgeIds.has(e)) return edgeIds.get(e)!
    const s = first(e)
    const withParams = typeof e.items[s + 1] === 'number'
    const v0 = at(e.items[s])
    const v1 = at(e.items[withParams ? s + 2 : s + 1])
    if (!v0 || !v1) return undefined
    const g = curveOf(e, v0, v1)
    if (g === 'fail') return undefined
    let id: number | null = null
    if (g) {
      const a = vertexId(v0)
      const b = vertexId(v1)
      if (!a || !b) return undefined
      id = w.add(`EDGE_CURVE('',#${a},#${b},#${g.curve},${bool(g.same)})`)
      stats.edges++
    }
    edgeIds.set(e, id)
    return id
  }

  /** Puntos de una cara (vértices y aristas muestreadas, en coordenadas del modelo): para elegir entre dos conos. */
  const facePoints = (f: Rec): Pt[] => {
    const out: Pt[] = []
    for (const l of loopsOf(f))
      for (const c of coedgesOf(l)) {
        const e = at(field(c, 3))
        if (!e) continue
        const pts = edgePoints(e)
        if (pts) out.push(...pts)
        const s = first(e)
        const v = pointOf(at(e.items[s]))
        if (v) out.push(v)
      }
    return out
  }

  /**
   * Dirección de la costura de una superficie de revolución (eje `a` por `c`, ángulo 0 en `M`): OpenCascade parte la
   * cara donde el ángulo vuelve a 0, y si ahí cruza el contorno de un agujero la cara queda mal partida. Se elige el
   * medio del mayor hueco angular que dejan los lazos que no dan la vuelta al eje (los que sí la dan la cruzan siempre).
   */
  const seamDir = (f: Rec, c: Pt, a: Pt, M: Pt): Pt => {
    const mu = unit(sub(M, scale(a, dot(M, a))))
    const nu = cross(a, mu)
    const angles: number[] = []
    for (const l of loopsOf(f)) {
      const ring: Pt[] = []
      for (const ce of coedgesOf(l)) {
        const e = at(field(ce, 3))
        const pts = e ? edgePoints(e) : null
        if (pts) ring.push(...pts)
      }
      const ang = ring.map((p) => {
        const d = sub(p, c)
        return Math.atan2(dot(d, nu), dot(d, mu))
      })
      let winding = 0
      for (let i = 1; i < ang.length; i++) {
        let da = ang[i] - ang[i - 1]
        if (da > Math.PI) da -= 2 * Math.PI
        if (da < -Math.PI) da += 2 * Math.PI
        winding += da
      }
      if (Math.abs(winding) < Math.PI) angles.push(...ang)
    }
    if (!angles.length) return M
    angles.sort((x, y) => x - y)
    let best = 2 * Math.PI - (angles[angles.length - 1] - angles[0])
    let mid = angles[angles.length - 1] + best / 2
    for (let i = 1; i < angles.length; i++) {
      const gap = angles[i] - angles[i - 1]
      if (gap > best) {
        best = gap
        mid = angles[i - 1] + gap / 2
      }
    }
    return [mu[0] * Math.cos(mid) + nu[0] * Math.sin(mid), mu[1] * Math.cos(mid) + nu[1] * Math.sin(mid), mu[2] * Math.cos(mid) + nu[2] * Math.sin(mid)]
  }

  /** Superficie de una cara y si su normal STEP apunta al revés que la de ACIS. */
  const surfaceOf = (f: Rec, sr: Rec): { id: number; inward: boolean } | null => {
    switch (sr.type) {
      case 'plane-surface': {
        const n = lastNumbers(sr.items, 9)
        if (!n) return null
        const nn = turn([n[3], n[4], n[5]])
        const u = len([n[6], n[7], n[8]]) > 1e-12 ? turn([n[6], n[7], n[8]]) : perp(nn)
        return {
          id: w.add(`PLANE('',#${w.axes(place([n[0], n[1], n[2]]), nn, u)})`),
          inward: false,
        }
      }
      case 'cone-surface': {
        const n = lastNumbers(sr.items, 10)
        if (!n) return null
        const [sine, cosine] = afterIntervals(
          sr,
          sr.items.findIndex((x, i) => typeof x === 'string' && i > 0),
          2,
        )
        if (cosine === undefined || sine === undefined) return null
        if (Math.abs(n[9] - 1) > 1e-9) {
          issue('cono elíptico')
          return null
        }
        const c: Pt = [n[0], n[1], n[2]]
        const a = unit([n[3], n[4], n[5]])
        const M: Pt = [n[6], n[7], n[8]]
        const r0 = len(M)
        if (!(r0 > 0)) return null
        const inward = cosine < 0
        const ref = seamDir(f, c, a, M)
        if (Math.abs(sine) < 1e-12)
          return {
            id: w.add(`CYLINDRICAL_SURFACE('',#${w.axes(place(c), turn(a), turn(ref))},${real(r0 * ks)})`),
            inward,
          }
        // Hacia qué lado del eje se abre: el que siguen los puntos de la cara.
        const tan = Math.abs(sine / cosine)
        const err = (sg: number) =>
          facePoints(f).reduce((mx, p) => {
            const d = sub(p, c)
            const h = dot(d, a)
            return Math.max(mx, Math.abs(len(sub(d, scale(a, h))) - (r0 + sg * h * tan)))
          }, 0)
        const sg = err(1) <= err(-1) ? 1 : -1
        const axis = turn(scale(a, sg))
        return {
          id: w.add(`CONICAL_SURFACE('',#${w.axes(place(c), axis, turn(ref))},${real(r0 * ks)},${real(Math.atan(tan))})`),
          inward,
        }
      }
      case 'sphere-surface': {
        const n = lastNumbers(sr.items, 10)
        if (!n) return null
        const R = n[3]
        return {
          id: w.add(`SPHERICAL_SURFACE('',#${w.axes(place([n[0], n[1], n[2]]), turn([n[7], n[8], n[9]]), turn([n[4], n[5], n[6]]))},${real(Math.abs(R) * ks)})`),
          inward: R < 0,
        }
      }
      case 'torus-surface': {
        const n = lastNumbers(sr.items, 11)
        if (!n) return null
        const R = Math.abs(n[6]) * ks
        const r = Math.abs(n[7]) * ks
        if (R < r) issue('toro limón/manzana')
        return {
          id: w.add(`TOROIDAL_SURFACE('',#${w.axes(place([n[0], n[1], n[2]]), turn([n[3], n[4], n[5]]), turn([n[8], n[9], n[10]]))},${real(R)},${real(r)})`),
          inward: n[7] < 0,
        }
      }
      case 'spline-surface': {
        const items = subtypeItems(sr, table)
        const i = items ? ownSplineAt(items) : -1
        const bs = items && i >= 0 ? bs3SurfaceAt(items, i) : null
        if (!bs) {
          issue('spline sin B-spline')
          return null
        }
        const rows = `(${bs.ctrl.map((row) => list(row.map((p) => w.point(place(p))))).join(',')})`
        const knots = `${ints(bs.mu)},${ints(bs.mv)},${reals(bs.ku)},${reals(bs.kv)},.UNSPECIFIED.`
        const id = bs.weights
          ? w.add(
              `(BOUNDED_SURFACE()B_SPLINE_SURFACE(${bs.du},${bs.dv},${rows},.UNSPECIFIED.,.F.,.F.,.F.)B_SPLINE_SURFACE_WITH_KNOTS(${knots})GEOMETRIC_REPRESENTATION_ITEM()RATIONAL_B_SPLINE_SURFACE((${bs.weights.map(reals).join(',')}))REPRESENTATION_ITEM('')SURFACE())`,
            )
          : w.add(`B_SPLINE_SURFACE_WITH_KNOTS('',${bs.du},${bs.dv},${rows},.UNSPECIFIED.,.F.,.F.,.F.,${knots})`)
        // Reflejada, la normal de una B-spline (derivada en u × derivada en v) se da vuelta con sus puntos.
        return { id, inward: rev(sr.items[first(sr)]) !== mirrored }
      }
      default:
        issue(`superficie ${sr.type}`)
        return null
    }
  }

  const chain = (r: Rec | undefined, next: (r: Rec) => Rec | undefined): Rec[] => {
    const out: Rec[] = []
    const seen = new Set<Rec>()
    while (r && !seen.has(r)) {
      seen.add(r)
      out.push(r)
      r = next(r)
    }
    return out
  }
  const loopsOf = (f: Rec) => chain(at(field(f, 1)), (l) => at(field(l, 0)))
  const coedgesOf = (l: Rec) => chain(at(field(l, 1)), (c) => at(field(c, 0)))

  /** Cara como ADVANCED_FACE; null si no se pudo. `open`: tiene aristas sin compañera (borde de una lámina). */
  const faceOf = (f: Rec): { id: number; open: boolean } | null => {
    const sr = at(field(f, 4))
    if (!sr) return null
    const surf = surfaceOf(f, sr)
    if (!surf) return null
    const faceRev = rev(field(f, 5))
    const double = rev(field(f, 6)) || field(f, 6) === 'double'
    let open = double
    const bounds: number[] = []
    for (const l of loopsOf(f)) {
      const oriented: number[] = []
      let lone: Rec | undefined
      for (const c of coedgesOf(l)) {
        const e = at(field(c, 3))
        if (!e) return null
        const partner = at(field(c, 2))
        if (!partner || partner === c) open = true
        const id = edgeId(e)
        if (id === undefined) return null
        if (id === null) {
          lone ??= at(e.items[first(e)])
          continue
        }
        oriented.push(w.add(`ORIENTED_EDGE('',*,*,#${id},${bool(!rev(field(c, 4)))})`))
      }
      if (oriented.length) bounds.push(w.add(`FACE_BOUND('',#${w.add(`EDGE_LOOP('',${list(oriented)})`)},${bool(!mirrored)})`))
      else if (lone) {
        const v = vertexId(lone)
        if (v) bounds.push(w.add(`FACE_BOUND('',#${w.add(`VERTEX_LOOP('',#${v})`)},.T.)`))
      }
    }
    stats.faces++
    return {
      id: w.add(`ADVANCED_FACE('',${list(bounds)},#${surf.id},${bool(faceRev === surf.inward)})`),
      open,
    }
  }

  // Caras por cáscara (las de sus subcáscaras incluidas: todas apuntan a su cáscara).
  const facesByShell = new Map<Rec, Rec[]>()
  for (const r of recs) {
    if (kindOf(r) !== 'face') continue
    const sh = at(field(r, 2))
    if (sh) facesByShell.set(sh, [...(facesByShell.get(sh) ?? []), r])
  }

  const solids: number[] = []
  const sheets: number[] = []
  let failed = false
  for (const bodyRec of recs.filter((r) => r.type === 'body')) {
    for (const lump of chain(at(field(bodyRec, 0)), (l) => at(field(l, 0)))) {
      const closed: Array<{ id: number; size: number }> = []
      for (const shell of chain(at(field(lump, 1)), (s) => at(field(s, 0)))) {
        const faces = facesByShell.get(shell) ?? []
        if (!faces.length) continue
        const ids: number[] = []
        let open = false
        for (const f of faces) {
          const fr = faceOf(f)
          if (!fr) {
            failed = true
            continue
          }
          ids.push(fr.id)
          open ||= fr.open
        }
        if (!ids.length) continue
        if (open) sheets.push(w.add(`OPEN_SHELL('',${list(ids)})`))
        else {
          // Tamaño: para elegir la cáscara exterior si hay huecos.
          const pts = faces.flatMap((f) => facePoints(f))
          const lo = pts.reduce((a, p) => a.map((v, i) => Math.min(v, p[i])) as Pt, [Infinity, Infinity, Infinity] as Pt)
          const hi = pts.reduce((a, p) => a.map((v, i) => Math.max(v, p[i])) as Pt, [-Infinity, -Infinity, -Infinity] as Pt)
          closed.push({
            id: w.add(`CLOSED_SHELL('',${list(ids)})`),
            size: len(sub(hi, lo)) || 0,
          })
        }
      }
      if (!closed.length) continue
      closed.sort((a, b) => b.size - a.size)
      if (closed.length === 1) solids.push(w.add(`MANIFOLD_SOLID_BREP('',#${closed[0].id})`))
      else {
        issue('sólido con huecos')
        const voids = closed.slice(1).map((s) => w.add(`ORIENTED_CLOSED_SHELL('',*,#${s.id},.T.)`))
        solids.push(w.add(`BREP_WITH_VOIDS('',#${closed[0].id},${list(voids)})`))
      }
    }
  }
  if (failed) issue('caras sin escribir')
  if (!solids.length && !sheets.length) return null
  const items = [...solids]
  if (sheets.length) items.push(w.add(`SHELL_BASED_SURFACE_MODEL('',${list(sheets)})`))
  const rep = !sheets.length ? 'ADVANCED_BREP_SHAPE_REPRESENTATION' : !solids.length ? 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION' : 'SHAPE_REPRESENTATION'
  return {
    step: stepFile(w, items, rep, 1e-6 * Math.max(ks, 1e-9)),
    solids: solids.length,
    sheets: sheets.length,
    stats,
  }
}

/**
 * Números que siguen a los límites de intervalo desde `from`. Un límite infinito es `I` en SAT y falso en SAB; uno
 * finito, `F` en SAT y verdadero en SAB, seguido de su valor.
 */
function afterIntervals(r: Rec, from: number, n: number): number[] {
  const finite = r.sab ? 'T' : 'F'
  const out: number[] = []
  for (let i = from; i < r.items.length && out.length < n; i++) {
    const x = r.items[i]
    if (x === finite) i++
    else if (typeof x === 'number') out.push(x)
  }
  return out
}
