import type { Vec3 } from '../math'
import type { Entity, PolylineProps } from '../document/types'
import { curveOf } from '../geom/curve'
import { angleBulge, bulgeAngle, bulgeArc, bulgeAt } from '../geom/polyline'
import { arcFromStartEndAngle } from '../geom/arc'

/**
 * Edición de polilíneas (PEDIT) como el CAD clásico. Todo en el XY local (PEDIT corre en el marco de la
 * UCS): cada función devuelve props nuevas y no muta las de entrada.
 */

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const cross2 = (a: Vec3, b: Vec3): number => a[0] * b[1] - a[1] * b[0]
const dot2 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1]
const unit2 = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1])
  return l > 1e-15 ? [a[0] / l, a[1] / l, 0] : [0, 0, 0]
}

/** Cantidad de tramos (con el de cierre). */
export const spanCount = (p: PolylineProps): number => (p.closed && p.vertices.length > 2 ? p.vertices.length : Math.max(0, p.vertices.length - 1))

/** Copia normalizada: bulges y anchos con un valor por vértice (o ausentes si son todos 0). */
export function clean(p: PolylineProps): PolylineProps {
  const n = p.vertices.length
  const q: PolylineProps = { ...p, vertices: p.vertices.map((v) => [...v] as Vec3) }
  const b = p.vertices.map((_, i) => bulgeAt(p, i))
  if (b.some((x) => Math.abs(x) > 1e-12)) q.bulges = b
  else delete q.bulges
  if (p.widths?.some(([a, c]) => a > 0 || c > 0)) q.widths = Array.from({ length: n }, (_, i) => [...(p.widths?.[i] ?? [0, 0])] as [number, number])
  else delete q.widths
  if (p.frame) q.frame = p.frame.map((v) => [...v] as Vec3)
  if (p.tangents) q.tangents = [...p.tangents]
  return q
}

/**
 * Una LINE, ARC, RECTANGLE o SPLINE como polilínea ("Object selected is not a polyline. Do you want to turn
 * it into one?"). Las splines se aproximan por tramos rectos (como la conversión del CAD clásico con precisión 10).
 */
export function toPolyline(e: Entity): PolylineProps | null {
  if (e.type === 'POLYLINE') return clean(e.props)
  if (e.type === 'RECTANGLE') {
    const [x, y, z] = e.props.corner
    const { width: w, height: h } = e.props
    return { vertices: [[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]], closed: true }
  }
  const c = curveOf(e)
  if (!c || (e.type !== 'LINE' && e.type !== 'ARC' && e.type !== 'SPLINE')) return null
  const vertices: Vec3[] = []
  const bulges: number[] = []
  for (const p of c.prims) {
    if (p.k === 'L') {
      vertices.push([...p.a] as Vec3)
      bulges.push(0)
    } else if (p.k === 'A') {
      vertices.push([p.c[0] + p.r * Math.cos(p.a0), p.c[1] + p.r * Math.sin(p.a0), p.c[2]])
      bulges.push(angleBulge(p.sw))
    }
  }
  vertices.push([...c.end] as Vec3)
  bulges.push(0)
  const out: PolylineProps = { vertices, closed: false }
  if (bulges.some((b) => Math.abs(b) > 1e-12)) out.bulges = bulges
  return out
}

/** Sentido inverso (Reverse): vértices al revés, bulges con signo contrario y anchos intercambiados. */
export function reversePolyline(p0: PolylineProps): PolylineProps {
  const p = clean(p0)
  const n = p.vertices.length
  const b = p.vertices.map((_, i) => bulgeAt(p, i))
  const w = p.vertices.map((_, i) => p.widths?.[i] ?? [0, 0])
  const out: PolylineProps = { ...p, vertices: [...p.vertices].reverse() }
  const rb: number[] = []
  const rw: Array<[number, number]> = []
  for (let j = 0; j < n; j++) {
    // Tramo j del recorrido inverso = tramo (n-2-j) original al revés; el de cierre es el de cierre.
    const k = j < n - 1 ? n - 2 - j : n - 1
    const valid = j < n - 1 || p.closed
    rb.push(valid ? -b[k] : 0)
    rw.push(valid ? [w[k][1], w[k][0]] : [0, 0])
  }
  if (rb.some((x) => Math.abs(x) > 1e-12)) out.bulges = rb
  else delete out.bulges
  if (p.widths) out.widths = rw
  if (p.frame) out.frame = [...p.frame].reverse()
  if (p.tangents) out.tangents = [...p.tangents].reverse().map((t) => (t === null ? null : t + Math.PI))
  return out
}

export type JoinType = 'Extend' | 'Add' | 'Both'

interface Chain {
  id: string
  p: PolylineProps
}

/** Une `b` al final de `a` (b ya orientada para seguir a `a`). `gap` = el tramo recto que los conecta. */
function append(a: PolylineProps, b: PolylineProps, gap: boolean): PolylineProps {
  const A = clean(a)
  const B = clean(b)
  const na = A.vertices.length
  const verts = [...A.vertices]
  const bul = A.vertices.map((_, i) => bulgeAt(A, i))
  const wid = A.vertices.map((_, i) => A.widths?.[i] ?? ([0, 0] as [number, number]))
  // El último vértice de `a` coincide con el primero de `b` (o se agrega el tramo recto de unión).
  bul[na - 1] = 0
  wid[na - 1] = [0, 0]
  const start = gap ? 0 : 1
  if (!gap) {
    bul[na - 1] = bulgeAt(B, 0)
    wid[na - 1] = B.widths?.[0] ?? [0, 0]
  }
  for (let i = start; i < B.vertices.length; i++) {
    verts.push(B.vertices[i])
    bul.push(i < B.vertices.length - 1 ? bulgeAt(B, i) : 0)
    wid.push(i < B.vertices.length - 1 ? (B.widths?.[i] ?? [0, 0]) : [0, 0])
  }
  return clean({ ...A, vertices: verts, bulges: bul, widths: wid, closed: false })
}

/** Intersección de las rectas de los dos últimos tramos rectos (Jointype Extend); null si no se puede. */
function extendMeet(a: PolylineProps, b: PolylineProps): { a: PolylineProps; b: PolylineProps } | null {
  const na = a.vertices.length
  if (na < 2 || b.vertices.length < 2) return null
  if (Math.abs(bulgeAt(a, na - 2)) > 1e-12 || Math.abs(bulgeAt(b, 0)) > 1e-12) return null
  const p1 = a.vertices[na - 2]
  const p2 = a.vertices[na - 1]
  const q1 = b.vertices[0]
  const q2 = b.vertices[1]
  const r = sub(p2, p1)
  const s = sub(q2, q1)
  const den = cross2(r, s)
  if (Math.abs(den) < 1e-12 * Math.hypot(r[0], r[1]) * Math.hypot(s[0], s[1])) return null
  const t = cross2(sub(q1, p1), s) / den
  const x: Vec3 = [p1[0] + r[0] * t, p1[1] + r[1] * t, p2[2]]
  const A = clean(a)
  const B = clean(b)
  A.vertices[na - 1] = x
  B.vertices[0] = x
  return { a: A, b: B }
}

/**
 * PEDIT ▸ Join: agrega a `main` las cadenas que tocan sus extremos (hasta `fuzz` de distancia), en orden,
 * mientras se pueda. Con `fuzz` > 0, el hueco se cierra según `type`: Extend (prolonga/recorta los tramos
 * rectos hasta cortarse), Add (tramo recto) o Both (Extend y si no se puede, Add). Si los extremos terminan
 * juntos, la polilínea queda cerrada (como el CAD clásico). Devuelve las props, los ids usados y los tramos agregados.
 */
export function joinPolyline(
  main: PolylineProps,
  others: Chain[],
  fuzz = 0,
  type: JoinType = 'Extend',
): { props: PolylineProps; used: string[]; added: number } {
  let p = clean(main)
  const before = spanCount(p)
  const used: string[] = []
  if (p.closed) return { props: p, used, added: 0 }
  const span = Math.max(1, ...p.vertices.map((v) => Math.max(Math.abs(v[0]), Math.abs(v[1]))))
  const tol = Math.max(1e-9 * span, fuzz)
  const pool = others.filter((o) => !o.p.closed && o.p.vertices.length >= 2)
  let grew = true
  while (grew && pool.length) {
    grew = false
    for (let i = 0; i < pool.length; i++) {
      const o = pool[i].p
      const s = p.vertices[0]
      const e = p.vertices[p.vertices.length - 1]
      const os = o.vertices[0]
      const oe = o.vertices[o.vertices.length - 1]
      // Extremo de `p` y orientación de `o` que lo siguen (al final: o; al principio: se invierte p).
      const options: Array<{ atEnd: boolean; rev: boolean; d: number }> = [
        { atEnd: true, rev: false, d: dist(e, os) },
        { atEnd: true, rev: true, d: dist(e, oe) },
        { atEnd: false, rev: true, d: dist(s, os) },
        { atEnd: false, rev: false, d: dist(s, oe) },
      ]
      const best = options.sort((x, y) => x.d - y.d)[0]
      if (best.d > tol) continue
      let head = best.atEnd ? p : reversePolyline(p)
      // Al principio se invierte `p` (su final pasa a ser `s`) y la cadena debe arrancar en `s`.
      let tail = best.atEnd ? (best.rev ? reversePolyline(o) : o) : best.rev ? o : reversePolyline(o)
      const exact = best.d <= 1e-9 * span
      let gap = false
      if (!exact) {
        const ext = type !== 'Add' ? extendMeet(head, tail) : null
        if (ext) {
          head = ext.a
          tail = ext.b
        } else if (type === 'Extend') continue
        else gap = true
      }
      let joined = append(head, tail, gap)
      if (!best.atEnd) joined = reversePolyline(joined)
      p = joined
      used.push(pool[i].id)
      pool.splice(i, 1)
      grew = true
      break
    }
  }
  // Extremos a menos de la tolerancia: se cierra con el mismo tipo de unión (Extend/Add/Both).
  if (used.length && p.vertices.length > 3 && fuzz > 0) {
    const n0 = p.vertices.length
    const gapD = dist(p.vertices[0], p.vertices[n0 - 1])
    if (gapD > 1e-9 * span && gapD <= tol) {
      const tail: PolylineProps = { vertices: [p.vertices[0], p.vertices[1]], closed: false, ...(bulgeAt(p, 0) ? { bulges: [bulgeAt(p, 0), 0] } : {}) }
      const ext = type !== 'Add' ? extendMeet(p, tail) : null
      if (ext) {
        p = clean(p)
        p.vertices[n0 - 1] = ext.a.vertices[n0 - 1]
        p.vertices[0] = ext.b.vertices[0]
      } else if (type !== 'Extend') {
        p = clean({ ...p, closed: true })
      }
    }
  }
  // Extremos juntos: cerrada (se quita el vértice repetido; su tramo pasa a ser el de cierre).
  const n = p.vertices.length
  if (n > 2 && !p.closed && dist(p.vertices[0], p.vertices[n - 1]) <= 1e-9 * span) {
    const q = clean(p)
    q.vertices.pop()
    if (q.bulges) q.bulges = q.bulges.slice(0, n - 1)
    if (q.widths) q.widths = q.widths.slice(0, n - 1)
    q.closed = true
    p = clean(q)
  }
  return { props: p, used, added: spanCount(p) - before }
}

/** Width: ancho constante para todos los tramos (0 = fina). */
export function setGlobalWidth(p: PolylineProps, w: number): PolylineProps {
  const q = clean(p)
  if (w > 0) q.widths = q.vertices.map((): [number, number] => [w, w])
  else delete q.widths
  return q
}

// --- Fit (arcos) y Spline ----------------------------------------------------------------------------

/** Vértices del marco (los de control) de una polilínea, ajustada o no. */
export const frameOf = (p: PolylineProps): Vec3[] => p.frame ?? p.vertices

/** Tangente (unitaria, XY) en el vértice `i` del marco para Fit: la fijada o la del círculo por sus vecinos. */
function fitTangent(pts: Vec3[], i: number, closed: boolean, fixed?: number | null): Vec3 {
  if (fixed !== undefined && fixed !== null) return [Math.cos(fixed), Math.sin(fixed), 0]
  const n = pts.length
  const prev = i > 0 ? pts[i - 1] : closed ? pts[n - 1] : null
  const next = i < n - 1 ? pts[i + 1] : closed ? pts[0] : null
  if (prev && next) {
    // Tangente en P del círculo por (prev, P, next): bisectriz "suavizada" de las cuerdas.
    const a = unit2(sub(pts[i], prev))
    const b = unit2(sub(next, pts[i]))
    const t = unit2([a[0] + b[0], a[1] + b[1], 0])
    return t[0] || t[1] ? t : a
  }
  // Extremo de una abierta: reflejo de la cuerda respecto de la tangente del vecino (arco por 3 puntos).
  if (n < 3) return unit2(sub(pts[n - 1], pts[0]))
  if (i === 0) {
    const c = unit2(sub(pts[1], pts[0]))
    const t1 = fitTangent(pts, 1, closed)
    return unit2([2 * dot2(c, t1) * c[0] - t1[0], 2 * dot2(c, t1) * c[1] - t1[1], 0])
  }
  const c = unit2(sub(pts[n - 1], pts[n - 2]))
  const t1 = fitTangent(pts, n - 2, closed)
  return unit2([2 * dot2(c, t1) * c[0] - t1[0], 2 * dot2(c, t1) * c[1] - t1[1], 0])
}

/** Bulge del arco que sale de S con tangente t y llega a E. */
function bulgeFromTangent(S: Vec3, t: Vec3, E: Vec3): number {
  const ch = sub(E, S)
  const th = 2 * Math.atan2(cross2(t, ch), dot2(t, ch))
  return angleBulge(th)
}

/**
 * Fit: curva de arcos (un par por tramo, *biarc*) que pasa por todos los vértices del marco con tangente
 * continua; respeta las tangentes fijadas con Edit vertex ▸ Tangent.
 */
export function fitPolyline(p0: PolylineProps): PolylineProps {
  const p = clean(p0)
  const pts = frameOf(p)
  const n = pts.length
  if (n < 2) return p
  const closed = p.closed && n > 2
  const T = pts.map((_, i) => fitTangent(pts, i, closed, p.tangents?.[i]))
  const verts: Vec3[] = []
  const bul: number[] = []
  const wid: Array<[number, number]> = []
  const frameW = p.frame ? undefined : p.widths
  const spans = closed ? n : n - 1
  for (let i = 0; i < spans; i++) {
    const P0 = pts[i]
    const P1 = pts[(i + 1) % n]
    const t0 = T[i]
    const t1 = T[(i + 1) % n]
    const v = sub(P1, P0)
    const t: Vec3 = [t0[0] + t1[0], t0[1] + t1[1], 0]
    // Biarc de tramos iguales: |P0 + d·t0 − (P1 − d·t1)| = 2d.
    const a = dot2(t, t) - 4
    const b = -2 * dot2(v, t)
    const c = dot2(v, v)
    let d: number
    if (Math.abs(a) < 1e-12) d = Math.abs(b) > 1e-12 ? -c / b : Math.sqrt(c) / 2
    else {
      const disc = Math.max(0, b * b - 4 * a * c)
      const r1 = (-b + Math.sqrt(disc)) / (2 * a)
      const r2 = (-b - Math.sqrt(disc)) / (2 * a)
      d = [r1, r2].filter((x) => x > 0).sort((x, y) => x - y)[0] ?? Math.sqrt(c) / 2
    }
    const A: Vec3 = [P0[0] + d * t0[0], P0[1] + d * t0[1], P0[2]]
    const B: Vec3 = [P1[0] - d * t1[0], P1[1] - d * t1[1], P1[2]]
    const J: Vec3 = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (P0[2] + P1[2]) / 2]
    const [w0, w1] = frameW?.[i] ?? [0, 0]
    const wm = (w0 + w1) / 2
    verts.push(P0, J)
    bul.push(bulgeFromTangent(P0, t0, J), -bulgeFromTangent(P1, [-t1[0], -t1[1], 0], J))
    wid.push([w0, wm], [wm, w1])
  }
  if (!closed) {
    verts.push(pts[n - 1])
    bul.push(0)
    wid.push([0, 0])
  }
  const out: PolylineProps = { ...p, vertices: verts, bulges: bul, widths: wid, fit: 'fit', frame: pts.map((q) => [...q] as Vec3) }
  return clean(out)
}

/** Punto de una B-spline uniforme (De Boor) de grado `k` con nodos `knots`. */
function deBoor(k: number, knots: number[], ctrl: Vec3[], u: number): Vec3 {
  let s = k
  while (s < knots.length - k - 2 && u >= knots[s + 1]) s++
  const d = Array.from({ length: k + 1 }, (_, j) => [...ctrl[j + s - k]] as Vec3)
  for (let r = 1; r <= k; r++) {
    for (let j = k; j >= r; j--) {
      const i = j + s - k
      const den = knots[i + k + 1 - r] - knots[i]
      const a = den > 0 ? (u - knots[i]) / den : 0
      d[j] = [0, 1, 2].map((m) => (1 - a) * d[j - 1][m] + a * d[j][m]) as Vec3
    }
  }
  return d[k]
}

/**
 * Spline: B-spline cuadrática (5) o cúbica (6) cuyo marco son los vértices, aproximada con `segs` tramos
 * por vano (SPLINETYPE/SPLINESEGS). Abierta: pasa por el primer y el último vértice; cerrada: periódica.
 */
export function splinePolyline(p0: PolylineProps, splinetype: 5 | 6 = 6, segs = 8): PolylineProps {
  const p = clean(p0)
  const ctrl0 = frameOf(p)
  const n = ctrl0.length
  const k = splinetype === 5 ? 2 : 3
  if (n < 3) return p
  const closed = p.closed && n > 2
  const deg = Math.min(k, n - 1)
  let ctrl = ctrl0
  let knots: number[]
  if (closed) {
    // Periódica: se repiten `deg` puntos al final y los nodos son uniformes.
    ctrl = [...ctrl0, ...ctrl0.slice(0, deg)]
    knots = Array.from({ length: ctrl.length + deg + 1 }, (_, i) => i)
  } else {
    const inner = n - deg - 1
    knots = [...Array(deg + 1).fill(0), ...Array.from({ length: inner }, (_, i) => i + 1), ...Array(deg + 1).fill(inner + 1)]
  }
  const u0 = closed ? deg : 0
  const u1 = closed ? ctrl.length : n - deg
  const total = Math.max(2, Math.round((u1 - u0) * Math.max(1, segs)))
  const verts: Vec3[] = []
  for (let i = 0; i <= total; i++) {
    if (closed && i === total) break
    const u = u0 + ((u1 - u0) * i) / total
    verts.push(deBoor(deg, knots, ctrl, Math.min(u, u1 - 1e-12)))
  }
  if (!closed) verts[verts.length - 1] = [...ctrl0[n - 1]] as Vec3
  const out: PolylineProps = { ...p, vertices: verts, fit: splinetype === 5 ? 'quadratic' : 'cubic', frame: ctrl0.map((q) => [...q] as Vec3) }
  delete out.bulges
  delete out.widths
  return clean(out)
}

/** Decurve: vuelve al marco (si estaba ajustada) y endereza todos los tramos. */
export function decurvePolyline(p0: PolylineProps): PolylineProps {
  const p = clean(p0)
  const out: PolylineProps = { ...p, vertices: frameOf(p).map((v) => [...v] as Vec3) }
  delete out.bulges
  delete out.fit
  delete out.frame
  if (p.frame) {
    // Los anchos del ajuste se pierden: queda el del primer tramo si era constante.
    const g = p.widths?.[0]?.[0] ?? 0
    if (p.widths?.every(([a, b]) => a === g && b === g) && g > 0) out.widths = out.vertices.map((): [number, number] => [g, g])
    else delete out.widths
  }
  return clean(out)
}

/** Vuelve a ajustar una polilínea ajustada después de editar su marco. */
export function refit(p: PolylineProps, splinetype: 5 | 6 = 6, segs = 8): PolylineProps {
  if (p.fit === 'fit') return fitPolyline(p)
  if (p.fit === 'quadratic' || p.fit === 'cubic') return splinePolyline(p, p.fit === 'quadratic' ? 5 : 6, segs)
  void splinetype
  return p
}

/** Close/Open. Al cerrar, el tramo de cierre es recto. */
export function setClosed(p0: PolylineProps, closed: boolean): PolylineProps {
  const p = clean(p0)
  if (closed === p.closed) return p
  const n = p.vertices.length
  if (closed && n < 2) return p
  const out: PolylineProps = { ...p, closed }
  if (out.bulges) out.bulges[n - 1] = 0
  return clean(out)
}

// --- Edit vertex ---------------------------------------------------------------------------------------

/** Mueve el vértice `i` (en una ajustada, el del marco, y se vuelve a ajustar). */
export function moveVertex(p0: PolylineProps, i: number, to: Vec3): PolylineProps {
  const p = clean(p0)
  if (p.frame) {
    p.frame[i] = [...to] as Vec3
    return refit(p)
  }
  p.vertices[i] = [...to] as Vec3
  return p
}

/** Inserta un vértice después de `i` (los dos tramos nuevos quedan rectos). */
export function insertVertex(p0: PolylineProps, i: number, at: Vec3): PolylineProps {
  const p = clean(p0)
  if (p.frame) {
    p.frame.splice(i + 1, 0, [...at] as Vec3)
    if (p.tangents) p.tangents.splice(i + 1, 0, null)
    return refit(p)
  }
  const b = p.vertices.map((_, k) => bulgeAt(p, k))
  const w = p.vertices.map((_, k) => p.widths?.[k] ?? ([0, 0] as [number, number]))
  p.vertices.splice(i + 1, 0, [...at] as Vec3)
  b.splice(i, 1, 0, 0)
  w.splice(i + 1, 0, [w[i][1], w[i][1]])
  return clean({ ...p, bulges: b, widths: w })
}

/**
 * Straighten: quita los vértices entre `i` y `j` (i < j en el sentido de la polilínea) y deja recto el
 * tramo que los une; con `i === j`, endereza el tramo que sale de `i`.
 */
export function straightenBetween(p0: PolylineProps, i: number, j: number): PolylineProps {
  const p = clean(p0)
  const [a, b] = i <= j ? [i, j] : [j, i]
  const bul = p.vertices.map((_, k) => bulgeAt(p, k))
  const wid = p.vertices.map((_, k) => p.widths?.[k] ?? ([0, 0] as [number, number]))
  if (a === b) {
    bul[a] = 0
    return clean({ ...p, bulges: bul, widths: wid })
  }
  const verts = [...p.vertices.slice(0, a + 1), ...p.vertices.slice(b)]
  const nb = [...bul.slice(0, a), 0, ...bul.slice(b)]
  const nw = [...wid.slice(0, a), [wid[a][0], wid[b - 1][1]] as [number, number], ...wid.slice(b)]
  return clean({ ...p, vertices: verts, bulges: nb, widths: nw })
}

/**
 * Break: quita los tramos entre los vértices `i` y `j`. Una abierta queda en dos polilíneas (o una si el
 * corte es en un extremo); una cerrada se abre. Con `i === j` se parte en ese vértice.
 */
export function breakBetween(p0: PolylineProps, i: number, j: number): PolylineProps[] {
  const p = clean(p0)
  const n = p.vertices.length
  const [a, b] = i <= j ? [i, j] : [j, i]
  const bul = p.vertices.map((_, k) => bulgeAt(p, k))
  const wid = p.vertices.map((_, k) => p.widths?.[k] ?? ([0, 0] as [number, number]))
  const piece = (from: number, to: number): PolylineProps | null => {
    if (to <= from) return null
    const idx = Array.from({ length: to - from + 1 }, (_, k) => from + k)
    return clean({
      ...p,
      closed: false,
      vertices: idx.map((k) => p.vertices[k % n]),
      bulges: idx.map((k, m) => (m < idx.length - 1 ? bul[k % n] : 0)),
      widths: idx.map((k, m) => (m < idx.length - 1 ? wid[k % n] : [0, 0])),
    })
  }
  if (p.closed) {
    // Se abre: arranca en `b` y da la vuelta hasta `a`.
    const r = piece(b, a + n)
    return r ? [r] : []
  }
  return [piece(0, a), piece(b, n - 1)].filter((x): x is PolylineProps => !!x)
}

/** Width del tramo que sale de `i` (Edit vertex ▸ Width). */
export function setSegmentWidth(p0: PolylineProps, i: number, start: number, end: number): PolylineProps {
  const p = clean(p0)
  const w = p.vertices.map((_, k) => p.widths?.[k] ?? ([0, 0] as [number, number]))
  w[i] = [start, end]
  return clean({ ...p, widths: w })
}

/** Ancho actual del tramo que sale de `i`. */
export const segmentWidth = (p: PolylineProps, i: number): [number, number] => p.widths?.[i] ?? [0, 0]

/** Arco del tramo `i` (para la vista previa del marcador), o null si es recto. */
export const spanArc = (p: PolylineProps, i: number) => {
  const n = p.vertices.length
  return bulgeArc(p.vertices[i], p.vertices[(i + 1) % n], bulgeAt(p, i), p.normal)
}

/** Ángulo incluido del tramo (para reportes). */
export const spanAngle = (p: PolylineProps, i: number): number => bulgeAngle(bulgeAt(p, i))

export { arcFromStartEndAngle }
