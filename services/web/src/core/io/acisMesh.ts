import { ShapeUtils, Vector2 } from 'three'
import type { Vec3 } from '../math'
import { acisRecords, isReversed, kindOf, lastNumbers, modelOf, refsOf, type Rec } from './acis'

/**
 * Caras de un modelo ACIS (3DSOLID, BODY, REGION de un DWG/DXF) como una malla triangulada. Cada cara se triangula en
 * los parámetros de su superficie —plano, cilindro o cono, esfera, toro— a partir de sus contornos (las aristas ya
 * muestreadas), y lo curvo se subdivide hasta seguir la superficie. Las superficies NURBS se triangulan sobre el plano
 * que mejor ajusta su contorno. Si una superficie no se reconoce o su contorno no la sigue, la cara sale de esa forma.
 */
type Pt = Vec3
type UV = [number, number]
const TAU = Math.PI * 2
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Pt, b: Pt): Pt => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: Pt) => Math.hypot(a[0], a[1], a[2])
const unit = (a: Pt): Pt => {
  const l = len(a)
  return l > 1e-15 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1]
}
const perp = (n: Pt): Pt => unit(cross(Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], n))

interface Surface {
  /** Coordenadas periódicas (ángulos): 0 = u, 1 = v. */
  periodic: [boolean, boolean]
  /** Coordenadas en las que la superficie se curva (se subdividen). */
  bends: [boolean, boolean]
  /** Radio de curvatura en cada coordenada (define el paso de la subdivisión). */
  radius: [number, number]
  curved: boolean
  toUv(p: Pt): UV
  at(u: number, v: number): Pt
  /** Normal hacia afuera de la superficie (antes del sentido de la cara). */
  normal(u: number, v: number): Pt
}

/**
 * Números que siguen a los límites de intervalo desde `from`. Un límite infinito es `I` en SAT y falso en SAB; uno
 * finito, `F` en SAT y verdadero en SAB, seguido de su valor (que no es de la superficie).
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

/** Superficies candidatas de un registro (un cono admite dos sentidos de apertura: se elige el que sigue al contorno). */
function surfacesOf(r: Rec): Surface[] {
  const firstText = r.items.findIndex((x, i) => typeof x === 'string' && i > 0)
  switch (r.type) {
    case 'plane-surface': {
      const n = lastNumbers(r.items, 9)
      if (!n) return []
      const o: Pt = [n[0], n[1], n[2]]
      const nn = unit([n[3], n[4], n[5]])
      const u = len([n[6], n[7], n[8]]) > 1e-12 ? unit([n[6], n[7], n[8]]) : perp(nn)
      const v = cross(nn, u)
      return [{ periodic: [false, false], bends: [false, false], radius: [Infinity, Infinity], curved: false, toUv: (p) => [dot(sub(p, o), u), dot(sub(p, o), v)], at: (a, b) => add(add(o, u, a), v, b), normal: () => nn }]
    }
    case 'cone-surface': {
      const n = lastNumbers(r.items, 10)
      if (!n) return []
      const [sine, cosine] = afterIntervals(r, firstText, 2)
      const c: Pt = [n[0], n[1], n[2]]
      const a = unit([n[3], n[4], n[5]])
      const M: Pt = [n[6], n[7], n[8]]
      const r0 = len(M)
      if (r0 < 1e-12) return []
      const mu = unit(M)
      const nu = cross(a, mu)
      const k = n[9] || 1
      const tan = cosine && Math.abs(cosine) > 1e-12 ? (sine ?? 0) / cosine : 0
      return [1, -1].map((sg): Surface => {
        const scale = (h: number) => (r0 + sg * h * tan) / r0
        return {
          periodic: [true, false],
          bends: [true, false],
          radius: [r0, Infinity],
          curved: true,
          toUv: (p) => {
            const d = sub(p, c)
            return [Math.atan2(dot(d, nu) / k, dot(d, mu)), dot(d, a)]
          },
          at: (t, h) => add(add(c, a, h), add(add([0, 0, 0], mu, Math.cos(t) * r0), nu, k * r0 * Math.sin(t)), scale(h)),
          normal: (t) => unit(add(add(add([0, 0, 0], mu, Math.cos(t)), nu, Math.sin(t)), a, -sg * tan)),
        }
      })
    }
    case 'sphere-surface': {
      const n = lastNumbers(r.items, 10)
      if (!n) return []
      const c: Pt = [n[0], n[1], n[2]]
      const R = n[3]
      const o = unit([n[4], n[5], n[6]])
      const pole = unit([n[7], n[8], n[9]])
      const nu = cross(pole, o)
      const rr = Math.abs(R)
      return [
        {
          periodic: [true, false],
          bends: [true, true],
          radius: [rr, rr],
          curved: true,
          toUv: (p) => {
            const d = sub(p, c)
            return [Math.atan2(dot(d, nu), dot(d, o)), Math.asin(Math.max(-1, Math.min(1, dot(d, pole) / (len(d) || 1))))]
          },
          at: (t, f) => add(c, add(add(add([0, 0, 0], o, Math.cos(f) * Math.cos(t)), nu, Math.cos(f) * Math.sin(t)), pole, Math.sin(f)), rr),
          normal: (t, f) => {
            const d = add(add(add([0, 0, 0], o, Math.cos(f) * Math.cos(t)), nu, Math.cos(f) * Math.sin(t)), pole, Math.sin(f))
            return R < 0 ? [-d[0], -d[1], -d[2]] : d
          },
        },
      ]
    }
    case 'torus-surface': {
      const n = lastNumbers(r.items, 11)
      if (!n) return []
      const c: Pt = [n[0], n[1], n[2]]
      const a = unit([n[3], n[4], n[5]])
      const R = n[6]
      const rm = n[7]
      const o = unit([n[8], n[9], n[10]])
      const nu = cross(a, o)
      const ar = Math.abs(rm)
      const radial = (t: number): Pt => add(add([0, 0, 0], o, Math.cos(t)), nu, Math.sin(t))
      return [
        {
          periodic: [true, true],
          bends: [true, true],
          radius: [Math.abs(R) + ar, ar],
          curved: true,
          toUv: (p) => {
            const d = sub(p, c)
            const t = Math.atan2(dot(d, nu), dot(d, o))
            const q = sub(d, add([0, 0, 0], radial(t), R))
            return [t, Math.atan2(dot(q, a), dot(q, radial(t)))]
          },
          at: (t, f) => add(add(c, radial(t), R + ar * Math.cos(f)), a, ar * Math.sin(f)),
          normal: (t, f) => {
            const d = add(add([0, 0, 0], radial(t), Math.cos(f)), a, Math.sin(f))
            return rm < 0 ? [-d[0], -d[1], -d[2]] : d
          },
        },
      ]
    }
    default:
      return []
  }
}

/** Contornos de una cara (cada lazo, en el sentido de sus aristas) en coordenadas del modelo. */
function loopsOf(recs: Rec[], face: Rec, edgePoints: (e: Rec) => Pt[] | null): Pt[][] {
  const rings: Pt[][] = []
  const seen = new Set<Rec>()
  let loop = refsOf(recs, face).find((q) => kindOf(q.to) === 'loop')?.to
  while (loop && !seen.has(loop)) {
    seen.add(loop)
    const lrefs = refsOf(recs, loop)
    const first = lrefs.find((q) => kindOf(q.to) === 'coedge')?.to
    const ring: Pt[] = []
    const visited = new Set<Rec>()
    let closed = false
    let c = first
    while (c && !visited.has(c)) {
      visited.add(c)
      const crefs = refsOf(recs, c)
      const edge = crefs.find((q) => kindOf(q.to) === 'edge')
      const pts = edge ? edgePoints(edge.to) : null
      if (pts) {
        const seg = edge && isReversed(c, edge.i + 1) ? [...pts].reverse() : pts
        ring.push(...seg.slice(0, -1))
      }
      // El siguiente del lazo es la primera referencia a otro borde de cara (las otras dos: el anterior y el compañero).
      c = crefs.find((q) => kindOf(q.to) === 'coedge')?.to
      if (c === first) {
        closed = true
        break
      }
    }
    if (closed && ring.length >= 3) rings.push(ring)
    loop = lrefs.find((q) => kindOf(q.to) === 'loop' && q.to !== loop)?.to
  }
  return rings
}

const area2 = (r: UV[]): number => r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0) / 2

/** Desenrolla una coordenada periódica a lo largo del contorno; devuelve cuántas vueltas da al cerrarse. */
function unwrap(r: UV[], k: 0 | 1): number {
  for (let i = 1; i < r.length; i++) {
    while (r[i][k] - r[i - 1][k] > Math.PI) r[i][k] -= TAU
    while (r[i][k] - r[i - 1][k] < -Math.PI) r[i][k] += TAU
  }
  let close = r[0][k] - r[r.length - 1][k]
  while (close > Math.PI) close -= TAU
  while (close < -Math.PI) close += TAU
  return Math.round((r[r.length - 1][k] - r[0][k] + close) / TAU)
}

interface FaceMesh {
  pts: Pt[]
  tris: number[][]
}

/** Triangulación de anillos 2D (el de mayor área es el contorno; los demás, agujeros). */
function triangulate(rings: UV[][]): { flat: UV[]; tris: number[][] } | null {
  if (!rings.length) return null
  const order = rings.map((r, i) => ({ i, a: Math.abs(area2(r)) })).sort((x, y) => y.a - x.a)
  const outer = rings[order[0].i]
  const holes = order.slice(1).map((o) => rings[o.i])
  const v2 = (r: UV[]) => r.map((p) => new Vector2(p[0], p[1]))
  const contour = v2(outer)
  const hs = holes.map(v2)
  const tris = ShapeUtils.triangulateShape(contour, hs)
  if (!tris.length) return null
  const flat = [...contour, ...hs.flat()].map((p): UV => [p.x, p.y])
  return { flat, tris: tris.map((t) => [t[0], t[1], t[2]]) }
}

/** Cara triangulada sobre el plano que mejor ajusta su contorno (superficies que no se reconocen). */
function planarFace(rings: Pt[][]): FaceMesh | null {
  const outer = rings.reduce((a, b) => (b.length > a.length ? b : a))
  const nn: Pt = [0, 0, 0]
  for (let i = 0; i < outer.length; i++) {
    const p = outer[i]
    const q = outer[(i + 1) % outer.length]
    nn[0] += (p[1] - q[1]) * (p[2] + q[2])
    nn[1] += (p[2] - q[2]) * (p[0] + q[0])
    nn[2] += (p[0] - q[0]) * (p[1] + q[1])
  }
  if (len(nn) < 1e-18) return null
  const n = unit(nn)
  const u = perp(n)
  const v = cross(n, u)
  const t = triangulate(rings.map((r) => r.map((p): UV => [dot(p, u), dot(p, v)])))
  if (!t) return null
  return { pts: rings.flat(), tris: t.tris.map(([a, b, c]) => (dot(cross(sub(rings.flat()[b], rings.flat()[a]), sub(rings.flat()[c], rings.flat()[a])), n) < 0 ? [a, c, b] : [a, b, c])) }
}

/** Cara sobre una superficie analítica: triangulada en (u, v), con lo curvo subdividido. */
function analyticFace(s: Surface, rings3: Pt[][], flipped: boolean, angleStep: (r: number) => number): FaceMesh | null {
  const step = [angleStep(s.radius[0]), angleStep(s.radius[1])]
  const rings = rings3.map((r) => r.map((p) => s.toUv(p)))
  const ptsOf = new Map<UV, Pt>()
  rings.forEach((r, i) => r.forEach((p, j) => ptsOf.set(p, rings3[i][j])))
  const winds: Array<[number, number]> = rings.map((r) => [s.periodic[0] ? unwrap(r, 0) : 0, s.periodic[1] ? unwrap(r, 1) : 0])
  const around = (k: 0 | 1) => rings.map((r, i) => ({ r, i, w: winds[i][k] })).filter((x) => x.w !== 0)
  const meanOf = (r: UV[], k: 0 | 1) => r.reduce((a, p) => a + p[k], 0) / r.length
  /** Corre un anillo una cantidad de vueltas para que quede cerca de `target` en la coordenada `k`. */
  const shiftNear = (r: UV[], k: 0 | 1, target: number) => {
    const turns = Math.round((target - meanOf(r, k)) / TAU)
    if (turns) for (const p of r) p[k] += turns * TAU
  }
  let polys: UV[][] | null = null
  /** Triángulos ya armados (bandas y casquetes): sobre `zipUv`/`zipPts`, sin pasar por la triangulación general. */
  let zipped: { uvs: UV[]; pts: Pt[]; tris: number[][] } | null = null
  for (const k of [0, 1] as const) {
    if (!s.periodic[k]) continue
    const ar = around(k)
    if (!ar.length) continue
    const other: 0 | 1 = k === 0 ? 1 : 0
    // Cada anillo que da la vuelta, en sentido creciente, empezando en su menor ángulo y cerrado con el primero + 2π.
    const strip = (r: UV[]): { ring: UV[]; increasing: boolean } => {
      const increasing = r[r.length - 1][k] > r[0][k]
      let q = increasing ? r : [...r].reverse()
      const wrap = (x: number) => ((x % TAU) + TAU) % TAU
      const start = q.reduce((bi, p, i) => (wrap(p[k]) < wrap(q[bi][k]) ? i : bi), 0)
      q = [...q.slice(start), ...q.slice(0, start)].map((p) => {
        const c: UV = [p[0], p[1]]
        ptsOf.set(c, ptsOf.get(p)!)
        return c
      })
      q[0][k] = wrap(q[0][k])
      for (let i = 1; i < q.length; i++) {
        while (q[i][k] < q[i - 1][k] - Math.PI) q[i][k] += TAU
        while (q[i][k] > q[i - 1][k] + Math.PI) q[i][k] -= TAU
      }
      const end: UV = [0, 0]
      end[k] = q[0][k] + TAU
      end[other] = q[0][other]
      ptsOf.set(end, ptsOf.get(q[0])!)
      return { ring: [...q, end], increasing }
    }
    const zip = (A: UV[], B: UV[], pB: (p: UV) => Pt) => zipChains(s, k, A, B, ptsOf, step, pB)
    const others = rings.filter((_, i) => !ar.some((x) => x.i === i))
    if (ar.length === 2 && !others.length) {
      const [a, b] = ar.map((x) => strip(x.r))
      zipped = zip(a.ring, b.ring, (p) => ptsOf.get(p)!)
    } else if (ar.length === 2) {
      // Banda con agujeros: un polígono que va por un borde y vuelve por el otro, cerrado por la costura.
      const [a, b] = ar.map((x) => strip(x.r))
      for (const h of others) shiftNear(h, k, a.ring[0][k] + Math.PI)
      polys = [[...a.ring, ...[...b.ring].reverse()], ...others]
    } else if (ar.length === 1 && !others.length && k === 0 && !s.periodic[1]) {
      // Casquete de esfera o cono hasta su punta: se cierra contra el polo / la punta.
      const { ring, increasing } = strip(ar[0].r)
      const left = (increasing ? 1 : -1) * (flipped ? -1 : 1)
      let pole = left > 0 ? Math.PI / 2 : -Math.PI / 2
      const h0 = ring[0][1]
      if (len(sub(s.at(0, pole), s.at(Math.PI, pole))) > 1e-6 * (1 + len(s.at(0, pole)))) {
        // No es una esfera: la altura donde el radio se anula (la punta del cono).
        const d0 = len(sub(s.at(0, h0), s.at(Math.PI, h0)))
        const d1 = len(sub(s.at(0, h0 + 1), s.at(Math.PI, h0 + 1)))
        if (Math.abs(d1 - d0) < 1e-12) return null
        pole = h0 + d0 / (d0 - d1)
      }
      const cap = ring.map((p): UV => [p[0], pole])
      zipped = zip(ring, cap, (p) => s.at(p[0], p[1]))
    } else return null
    break
  }
  if (!polys && !zipped) {
    // Sin vueltas: todos los anillos cerca del contorno mayor.
    const main = rings.reduce((a, b) => (Math.abs(area2(b)) > Math.abs(area2(a)) ? b : a))
    for (const k of [0, 1] as const) if (s.periodic[k]) for (const r of rings) if (r !== main) shiftNear(r, k, meanOf(main, k))
    polys = rings
  }
  let uvs: UV[]
  let pts: Pt[]
  let tris: number[][]
  if (zipped) ({ uvs, pts, tris } = zipped)
  else {
    const t = triangulate(polys!)
    if (!t) return null
    // Los puntos del contorno conservan su posición exacta (así no quedan rendijas con las caras vecinas).
    const lookup = new Map<string, Pt>()
    for (const r of polys!) for (const p of r) { const q = ptsOf.get(p); if (q) lookup.set(`${p[0]},${p[1]}`, q) }
    uvs = t.flat
    pts = uvs.map((p) => lookup.get(`${p[0]},${p[1]}`) ?? s.at(p[0], p[1]))
    tris = t.tris
  }
  if (s.curved && !zipped) tris = delaunayFlips(uvs, tris, [Number.isFinite(s.radius[0]) ? s.radius[0] : 1, Number.isFinite(s.radius[1]) ? s.radius[1] : 1])
  if (s.curved && !zipped) {
    // Subdivisión por arista (la misma decisión de los dos lados de cada arista: sin grietas).
    const mid = new Map<string, number>()
    const midOf = (a: number, b: number) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`
      let m = mid.get(key)
      if (m === undefined) {
        const uv: UV = [(uvs[a][0] + uvs[b][0]) / 2, (uvs[a][1] + uvs[b][1]) / 2]
        uvs.push(uv)
        pts.push(s.at(uv[0], uv[1]))
        m = uvs.length - 1
        mid.set(key, m)
      }
      return m
    }
    // Bisección por la arista más larga (en ángulo): crece de a dos triángulos y el punto medio de una arista es el
    // mismo para los dos triángulos que la comparten.
    const span = (a: number, b: number) => Math.max(s.bends[0] ? Math.abs(uvs[a][0] - uvs[b][0]) / step[0] : 0, s.bends[1] ? Math.abs(uvs[a][1] - uvs[b][1]) / step[1] : 0)
    const out: number[][] = []
    const work = [...tris]
    while (work.length && out.length + work.length < 60000) {
      const [a, b, c] = work.pop()!
      const e = [span(a, b), span(b, c), span(c, a)]
      const m = Math.max(...e)
      if (m <= 1) {
        out.push([a, b, c])
        continue
      }
      if (e[0] === m) {
        const x = midOf(a, b)
        work.push([a, x, c], [x, b, c])
      } else if (e[1] === m) {
        const x = midOf(b, c)
        work.push([a, b, x], [a, x, c])
      } else {
        const x = midOf(c, a)
        work.push([a, b, x], [x, b, c])
      }
    }
    tris = [...out, ...work]
  }
  // Hacia afuera (o hacia adentro, si la cara está invertida).
  tris = tris.map(([a, b, c]) => {
    const g = cross(sub(pts[b], pts[a]), sub(pts[c], pts[a]))
    const uv: UV = [(uvs[a][0] + uvs[b][0] + uvs[c][0]) / 3, (uvs[a][1] + uvs[b][1] + uvs[c][1]) / 3]
    const n = s.normal(uv[0], uv[1])
    return (dot(g, n) < 0) !== flipped ? [a, c, b] : [a, b, c]
  })
  // Sin triángulos degenerados (los del polo o la punta).
  tris = tris.filter(([a, b, c]) => len(cross(sub(pts[b], pts[a]), sub(pts[c], pts[a]))) > 1e-18)
  return { pts, tris }
}

/** Una superficie cerrada entera: grilla de 32 × 16 (esfera: de polo a polo; toro: las dos vueltas). */
function wholeSurface(s: Surface, flipped: boolean): FaceMesh | null {
  const nu = 32
  const nv = s.periodic[1] ? 32 : 16
  const [v0, v1] = s.periodic[1] ? [0, TAU] : [-Math.PI / 2, Math.PI / 2]
  const pts: Pt[] = []
  const uvs: UV[] = []
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const uv: UV = [(TAU * i) / nu, v0 + ((v1 - v0) * j) / nv]
      uvs.push(uv)
      pts.push(s.at(uv[0], uv[1]))
    }
  const tris: number[][] = []
  const id = (i: number, j: number) => j * (nu + 1) + i
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) tris.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i, j + 1)])
  const out = tris
    .filter(([a, b, c]) => len(cross(sub(pts[b], pts[a]), sub(pts[c], pts[a]))) > 1e-18)
    .map(([a, b, c]) => {
      const g = cross(sub(pts[b], pts[a]), sub(pts[c], pts[a]))
      const n = s.normal((uvs[a][0] + uvs[b][0] + uvs[c][0]) / 3, (uvs[a][1] + uvs[b][1] + uvs[c][1]) / 3)
      return (dot(g, n) < 0) !== flipped ? [a, c, b] : [a, b, c]
    })
  return out.length ? { pts, tris: out } : null
}

/**
 * Cierre entre dos filas crecientes en `k`, con filas intermedias si la superficie se curva en la otra coordenada
 * (los empalmes de un toro, el casquete de una esfera): triángulos chicos en las dos direcciones.
 */
function zipChains(s: Surface, k: 0 | 1, A: UV[], B: UV[], ptsOf: Map<UV, Pt>, step: number[], pB: (p: UV) => Pt = (p) => ptsOf.get(p)!) {
  const other: 0 | 1 = k === 0 ? 1 : 0
  const vOf = (row: UV[], u: number) => {
    let j = row.findIndex((p) => p[k] >= u)
    if (j <= 0) return row[Math.max(0, j)][other]
    const [p, q] = [row[j - 1], row[j]]
    const t = q[k] - p[k] > 1e-12 ? (u - p[k]) / (q[k] - p[k]) : 0
    return p[other] + (q[other] - p[other]) * t
  }
  const dv = Math.max(...A.map((p) => Math.abs(vOf(B, p[k]) - p[other])))
  const n = s.bends[other] ? Math.min(16, Math.max(1, Math.ceil(dv / step[other]))) : 1
  const lo = Math.min(A[0][k], B[0][k])
  const hi = Math.max(A[A.length - 1][k], B[B.length - 1][k])
  const cols = Math.max(4, Math.ceil((hi - lo) / step[k]))
  const rows: Array<{ uv: UV[]; pt: Pt[] }> = [{ uv: A, pt: A.map((p) => ptsOf.get(p)!) }]
  for (let r = 1; r < n; r++) {
    const t = r / n
    const uv = Array.from({ length: cols + 1 }, (_, c): UV => {
      const q: UV = [0, 0]
      q[k] = lo + ((hi - lo) * c) / cols
      q[other] = vOf(A, q[k]) + (vOf(B, q[k]) - vOf(A, q[k])) * t
      return q
    })
    rows.push({ uv, pt: uv.map((p) => s.at(p[0], p[1])) })
  }
  rows.push({ uv: B, pt: B.map(pB) })
  const uvs: UV[] = []
  const pts: Pt[] = []
  const tris: number[][] = []
  for (const row of rows) {
    uvs.push(...row.uv)
    pts.push(...row.pt)
  }
  let off = 0
  for (let r = 0; r + 1 < rows.length; r++) {
    const X = rows[r].uv
    const Y = rows[r + 1].uv
    const oy = off + X.length
    let i = 0
    let j = 0
    while (i < X.length - 1 || j < Y.length - 1) {
      if (j >= Y.length - 1 || (i < X.length - 1 && X[i + 1][k] <= Y[j + 1][k])) {
        tris.push([off + i, off + i + 1, oy + j])
        i++
      } else {
        tris.push([off + i, oy + j + 1, oy + j])
        j++
      }
    }
    off = oy
  }
  return { uvs, pts, tris }
}

/**
 * Intercambio de diagonales (Lawson) hacia una triangulación de Delaunay en la superficie desarrollada (cada parámetro
 * por su radio): los abanicos de la triangulación del contorno pasan a ser tiras. Las aristas del contorno no se tocan
 * (tienen un solo triángulo).
 */
function delaunayFlips(uvs: UV[], tris: number[][], scale: [number, number]): number[][] {
  const P = uvs.map((p): UV => [p[0] * scale[0], p[1] * scale[1]])
  const T = tris.map((t) => [...t])
  const key = (a: number, b: number) => (a < b ? a * 1e7 + b : b * 1e7 + a)
  const edges = new Map<number, number[]>()
  const link = (ti: number) => {
    const t = T[ti]
    for (let e = 0; e < 3; e++) {
      const k = key(t[e], t[(e + 1) % 3])
      const l = edges.get(k)
      if (l) l.push(ti)
      else edges.set(k, [ti])
    }
  }
  const unlink = (ti: number) => {
    const t = T[ti]
    for (let e = 0; e < 3; e++) {
      const k = key(t[e], t[(e + 1) % 3])
      const l = edges.get(k)
      if (l) {
        const i = l.indexOf(ti)
        if (i >= 0) l.splice(i, 1)
      }
    }
  }
  T.forEach((_, i) => link(i))
  const orient = (a: UV, b: UV, c: UV) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  /** ¿`d` cae dentro del círculo por a, b, c (en sentido antihorario)? */
  const inCircle = (a: UV, b: UV, c: UV, d: UV) => {
    const [ax, ay, bx, by, cx, cy] = [a[0] - d[0], a[1] - d[1], b[0] - d[0], b[1] - d[1], c[0] - d[0], c[1] - d[1]]
    return (ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay) + (cx * cx + cy * cy) * (ax * by - bx * ay) > 0
  }
  const queue = [...edges.keys()]
  let budget = T.length * 20
  while (queue.length && budget-- > 0) {
    const k = queue.pop()!
    const l = edges.get(k)
    if (!l || l.length !== 2) continue
    const [t1, t2] = l
    const a = Math.floor(k / 1e7)
    const b = k % 1e7
    const c = T[t1].find((x) => x !== a && x !== b)!
    const d = T[t2].find((x) => x !== a && x !== b)!
    // a, b, c antihorario
    const [pa, pb, pc, pd] = [P[a], P[b], P[c], P[d]]
    const ccw = orient(pa, pb, pc) > 0
    const [qa, qb] = ccw ? [pa, pb] : [pb, pa]
    if (!inCircle(qa, qb, pc, pd)) continue
    // El cuadrilátero tiene que ser convexo para poder cambiar la diagonal.
    if (orient(pc, pd, pa) * orient(pc, pd, pb) >= 0) continue
    unlink(t1)
    unlink(t2)
    T[t1] = [c, d, a]
    T[t2] = [d, c, b]
    link(t1)
    link(t2)
    for (const [x, y] of [[a, c], [c, b], [b, d], [d, a]]) queue.push(key(x, y))
  }
  return T
}

/** ¿La superficie sigue al contorno? (error máximo de ida y vuelta por los parámetros). */
function fits(s: Surface, rings: Pt[][], tol: number): boolean {
  for (const r of rings)
    for (let i = 0; i < r.length; i += Math.max(1, Math.floor(r.length / 24))) {
      const [u, v] = s.toUv(r[i])
      if (len(sub(s.at(u, v), r[i])) > tol) return false
    }
  return true
}

/**
 * Marca de la MESH que, en el DXF intermedio de un DWG, nombra la malla de un sólido: un solo vértice (posición, este
 * valor, este valor) y ninguna cara. Las mallas viajan aparte (no como texto) y se ubican igual dentro de los bloques.
 */
export const SOLID_MESH_REF = -987654321.125

export interface AcisMesh {
  vertices: Vec3[]
  faces: number[][]
  /** Caras por cómo se triangularon. */
  stats: { analytic: number; planar: number; failed: number }
}

/** Malla de todas las caras de un modelo ACIS; null si no tiene caras legibles. */
export function acisMesh(data: Uint8Array | string): AcisMesh | null {
  let recs: Rec[]
  try {
    recs = acisRecords(data)
  } catch {
    return null
  }
  const { place, edgePoints, angleStep } = modelOf(recs)
  const vertices: Vec3[] = []
  const faces: number[][] = []
  const stats = { analytic: 0, planar: 0, failed: 0 }
  for (const f of recs) {
    if (kindOf(f) !== 'face') continue
    try {
      const rings = loopsOf(recs, f, edgePoints)
      const sref = refsOf(recs, f).find((q) => kindOf(q.to) === 'surface')
      if (!rings.length) {
        // Sin contornos: la superficie cerrada entera (una esfera, un toro).
        const s = sref ? surfacesOf(sref.to)[0] : undefined
        const whole = s && s.periodic[0] ? wholeSurface(s, sref ? isReversed(f, sref.i + 1) : false) : null
        if (!whole) {
          stats.failed++
          continue
        }
        const base = vertices.length
        for (const p of whole.pts) vertices.push(place(p))
        for (const t of whole.tris) faces.push(t.map((i) => i + base))
        stats.analytic++
        continue
      }
      const flipped = sref ? isReversed(f, sref.i + 1) : false
      const size = rings.flat().reduce((m, p) => Math.max(m, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])), 1)
      const tol = 2e-4 * size
      let mesh: FaceMesh | null = null
      if (sref) for (const s of surfacesOf(sref.to)) if (!mesh && fits(s, rings, tol)) mesh = analyticFace(s, rings, flipped, angleStep)
      if (mesh) stats.analytic++
      else {
        mesh = planarFace(rings)
        if (mesh) stats.planar++
        else {
          stats.failed++
          continue
        }
      }
      const base = vertices.length
      for (const p of mesh.pts) vertices.push(place(p))
      for (const t of mesh.tris) faces.push(t.map((i) => i + base))
    } catch {
      stats.failed++
    }
  }
  return faces.length ? { vertices, faces, stats } : null
}
