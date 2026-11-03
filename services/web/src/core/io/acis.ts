import type { Vec3 } from '../math'

/**
 * Lector de ACIS (el modelo de los 3DSOLID, REGION, BODY y superficies de un DWG/DXF), en texto (SAT) o binario (SAB):
 * saca las aristas de la pieza como polilíneas 3D. Lee los registros `edge` con sus vértices y su curva: recta, elipse o
 * curva NURBS; lo que no entiende queda como la cuerda entre sus extremos. Las caras no se leen todavía.
 */
export type Item = number | string | { ref: number }
export interface Rec {
  type: string
  items: Item[]
  /** Leído de un SAB: sus valores lógicos vienen como `T`/`F` (en SAT, como palabras). */
  sab?: boolean
}

const isRef = (x: Item): x is { ref: number } => typeof x === 'object'

/** Registros de un SAT: `tipo datos… #`, con la primera parte de encabezado (3 renglones). */
function parseSat(text: string): Rec[] {
  // Encabezado: versión, cantidad de registros, de cuerpos y marcas; desde ACIS 4 (versión 400) le siguen el renglón del
  // programa y el de las unidades. Los SAT viejos (106 en los DXF R13/R14) van directo a los registros.
  const version = parseInt(text, 10)
  let start = text.indexOf('\n') + 1
  if (!(version < 400)) for (let k = 0; k < 2; k++) start = text.indexOf('\n', start) + 1
  const recs: Rec[] = []
  for (const raw of text.slice(start).split('#')) {
    const tokens = raw.trim().split(/\s+/)
    if (!tokens[0] || /^(End-of|Begin-of)/.test(tokens[0])) continue
    recs.push({
      type: tokens[0],
      items: tokens.slice(1).map((t): Item => {
        if (t[0] === '$') return { ref: Number(t.slice(1)) }
        const n = Number(t)
        return isFinite(n) ? n : t
      }),
    })
  }
  return recs
}

const SAB_SIGNATURES = ['ACIS BinaryFile', 'ASM BinaryFile']

/** Registros de un SAB: la misma estructura que el SAT, con cada dato precedido por su etiqueta. */
function parseSab(b: Uint8Array): Rec[] {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const latin = new TextDecoder('latin1')
  // Firma, versión (8 bytes) y dos enteros: después, producto, programa y fecha (textos) y 3 reales del encabezado.
  let pos = 15
  if (b[pos] === 0x34) pos++ // "ASM BinaryFile4"
  pos += 16
  const recs: Rec[] = []
  let cur: Rec | null = null
  let header = 6
  while (pos < b.length) {
    const tag = b[pos++]
    const push = (x: Item) => cur?.items.push(x)
    switch (tag) {
      case 0x04:
        push(view.getInt32(pos, true))
        pos += 4
        break
      case 0x06: {
        const v = view.getFloat64(pos, true)
        pos += 8
        if (header > 0) header--
        else push(v)
        break
      }
      case 0x07: {
        const n = b[pos++]
        const s = latin.decode(b.subarray(pos, pos + n))
        pos += n
        if (header > 0) header--
        else push(s)
        break
      }
      case 0x0a:
        push('T')
        break
      case 0x0b:
        push('F')
        break
      case 0x0c:
        push({ ref: view.getInt32(pos, true) })
        pos += 4
        break
      case 0x0d:
      case 0x0e: {
        const n = b[pos++]
        const s = latin.decode(b.subarray(pos, pos + n))
        pos += n
        // Los tipos compuestos vienen en partes: `exactcur` (0x0E) + `intcurve-curve` (0x0D).
        if (!cur) cur = { type: s, items: [], sab: true }
        else if (!cur.items.length && tag === 0x0d && cur.type.endsWith('-')) cur.type += s
        else if (!cur.items.length && cur.type.length && tag === 0x0d) cur.type = `${cur.type}-${s}`
        else push(s)
        break
      }
      case 0x0f:
        push('{')
        break
      case 0x10:
        push('}')
        break
      case 0x11:
        if (cur) recs.push(cur)
        cur = null
        break
      case 0x12: {
        const n = view.getUint32(pos, true)
        // Texto largo. Algunos escritores de DWG guardan así la matriz entera de un `transform` ("0 0 1 0 1 0 -1 0 0 0 0 0
        // 1 no_rotate …"): se lee como sus números y banderas; sin esto, esos cuerpos quedaban sin girar ni ubicar.
        if (cur?.type === 'transform') {
          for (const t of latin.decode(b.subarray(pos + 4, pos + 4 + n)).trim().split(/\s+/)) {
            const v = Number(t)
            push(t !== '' && Number.isFinite(v) ? v : t)
          }
        }
        pos += 4 + n
        break
      }
      case 0x13:
      case 0x14:
        for (let i = 0; i < 3; i++) push(view.getFloat64(pos + i * 8, true))
        pos += 24
        break
      case 0x15:
        push(`#${view.getInt32(pos, true)}`)
        pos += 4
        break
      default:
        // Etiqueta desconocida: no hay cómo seguir leyendo sin perder el paso.
        return recs
    }
  }
  return recs
}

type Pt = Vec3
const addK = (a: Pt, b: Pt, k: number): Pt => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Pt, b: Pt): Pt => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const same = (a: Pt, b: Pt, tol = 1e-9): boolean => Math.hypot(...sub(a, b)) <= tol * (1 + Math.hypot(...a))

/** Evaluación de una NURBS por de Boor (homogénea). */
function nurbsPoint(deg: number, knots: number[], ctrl: number[][], t: number): Pt {
  const n = ctrl.length
  let k = deg
  while (k < n - 1 && t >= knots[k + 1]) k++
  const d = Array.from({ length: deg + 1 }, (_, j) => ctrl[k - deg + j].slice())
  for (let r = 1; r <= deg; r++) {
    for (let j = deg; j >= r; j--) {
      const i = k - deg + j
      const den = knots[i + deg - r + 1] - knots[i]
      const a = den > 1e-14 ? (t - knots[i]) / den : 0
      for (let c = 0; c < 4; c++) d[j][c] = (1 - a) * d[j - 1][c] + a * d[j][c]
    }
  }
  const w = d[deg][3] || 1
  return [d[deg][0] / w, d[deg][1] / w, d[deg][2] / w]
}

/** Curva `nubs`/`nurbs` de un registro `intcurve`: grado, nudos con multiplicidad y puntos de control. */
function splineOf(items: Item[]): (((t: number) => Pt) & { lo: number; hi: number }) | null {
  const at = items.findIndex((x) => x === 'nubs' || x === 'nurbs')
  if (at < 0) return null
  const rational = items[at] === 'nurbs'
  const deg = items[at + 1] as number
  // Tras el grado, la forma (open/closed/periodic: texto o enumerado).
  let i = at + 3
  const nKnots = items[i++] as number
  if (typeof deg !== 'number' || typeof nKnots !== 'number') return null
  const knots: number[] = []
  for (let k = 0; k < nKnots; k++) {
    const v = items[i++] as number
    const m = items[i++] as number
    if (typeof v !== 'number' || typeof m !== 'number') return null
    for (let j = 0; j < m; j++) knots.push(v)
  }
  // ACIS guarda los extremos con multiplicidad = grado (no grado + 1): se completan.
  const nCtrl = knots.length - deg + 1
  const full = [knots[0], ...knots, knots[knots.length - 1]]
  const ctrl: number[][] = []
  for (let c = 0; c < nCtrl; c++) {
    const [x, y, z] = [items[i++], items[i++], items[i++]]
    const w = rational ? items[i++] : 1
    if ([x, y, z, w].some((v) => typeof v !== 'number')) return null
    const W = w as number
    ctrl.push([(x as number) * W, (y as number) * W, (z as number) * W, W])
  }
  if (nCtrl <= deg) return null
  const lo = full[0]
  const hi = full[full.length - 1]
  return Object.assign((t: number) => nurbsPoint(deg, full, ctrl, Math.min(hi, Math.max(lo, t))), { lo, hi })
}

/** Los últimos `n` números antes del primer texto (los límites `I`, `F`): la definición de la curva. */
export function lastNumbers(items: Item[], n: number): number[] | null {
  const stop = items.findIndex((x, i) => typeof x === 'string' && i > 0)
  const list = (stop >= 0 ? items.slice(0, stop) : items).filter((x): x is number => typeof x === 'number')
  return list.length >= n ? list.slice(list.length - n) : null
}

const ref = (recs: Rec[], x: Item | undefined): Rec | undefined => (x !== undefined && isRef(x) ? recs[x.ref] : undefined)
/** Referencias de un registro con el tipo de su destino. */
/**
 * Tipo base de un registro: los tolerantes (`tcoedge-coedge`, `tedge-edge`, `tvertex-vertex`) y los compuestos
 * (`intcurve-curve`, `plane-surface`) cuentan como lo que terminan siendo.
 */
export const kindOf = (r: Rec | undefined): string => (r ? r.type.slice(r.type.lastIndexOf('-') + 1) : '')
export const refsOf = (recs: Rec[], r: Rec) =>
  r.items.flatMap((x, i) => {
    const to = ref(recs, x)
    return to ? [{ i, to }] : []
  })
/** Sentido de un registro (`reversed` en SAT, verdadero en SAB) en el primer dato de sentido a partir de `from`. */
export const isReversed = (r: Rec, from: number): boolean => {
  for (let i = from; i < r.items.length; i++) {
    const x = r.items[i]
    if (x === 'reversed' || x === 'T') return true
    if (x === 'forward' || x === 'F') return false
  }
  return false
}

/** El modelo leído: puntos, transformación del cuerpo y arista → puntos (de su primer vértice al segundo). */
export function modelOf(recs: Rec[], light = false) {
  const pointOf = (r: Rec | undefined): Pt | null => {
    if (!r) return null
    if (kindOf(r) === 'vertex') return pointOf(r.items.map((x) => ref(recs, x)).find((q) => kindOf(q) === 'point'))
    const nums = r.items.filter((x): x is number => typeof x === 'number')
    return nums.length >= 3 ? (nums.slice(-3) as Pt) : null
  }
  // Transformación del cuerpo (filas de una matriz 3×3, traslación y escala).
  const body = recs.find((r) => r.type === 'body')
  const tr = body?.items.map((x) => ref(recs, x)).find((r) => r?.type === 'transform')
  const m = tr?.items.filter((x): x is number => typeof x === 'number').slice(-13)
  const place = (p: Pt): Pt => {
    if (!m || m.length < 13) return p
    const k = m[12] || 1
    return [
      (p[0] * m[0] + p[1] * m[3] + p[2] * m[6]) * k + m[9],
      (p[0] * m[1] + p[1] * m[4] + p[2] * m[7]) * k + m[10],
      (p[0] * m[2] + p[1] * m[5] + p[2] * m[8]) * k + m[11],
    ]
  }
  /** ¿La transformación refleja (determinante negativo)? Entonces las caras quedan del revés si no se dan vuelta. */
  const mirrored = !!m && m.length >= 13 && (m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])) * (m[12] || 1) < 0
  // Tolerancia de cuerda: 0,1 % del tamaño de la pieza (los puntos del modelo, antes de su transformación). Liviana (en
  // un teléfono): el triple, y una vuelta en 18 tramos en vez de 36; un ensamble grande queda con la mitad de triángulos.
  const lo: Pt = [Infinity, Infinity, Infinity]
  const hi: Pt = [-Infinity, -Infinity, -Infinity]
  for (const r of recs) {
    if (kindOf(r) !== 'point') continue
    const p = pointOf(r)
    if (p)
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i], p[i])
        hi[i] = Math.max(hi[i], p[i])
      }
  }
  const size = isFinite(lo[0]) ? Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) : 1
  const tol = Math.max(size * (light ? 3e-3 : 1e-3), 1e-9)
  const [minStep, maxStep] = light ? [(2 * Math.PI) / 18, Math.PI / 3] : [(2 * Math.PI) / 36, Math.PI / 4]
  /** Paso angular para que la cuerda de un arco de radio `r` no se aparte más que la tolerancia. */
  const angleStep = (r: number) => (r > tol ? Math.min(maxStep, Math.max(minStep, 2 * Math.acos(1 - tol / r))) : maxStep)
  /** Puntos de una curva muestreada, sin los que no se apartan de la recta entre sus vecinos (Douglas–Peucker). */
  const simplify = (p: Pt[]): Pt[] => {
    if (p.length <= 2) return p
    const keep = new Uint8Array(p.length)
    keep[0] = keep[p.length - 1] = 1
    // Siempre unos puntos repartidos: en una curva de radio menor que la tolerancia, quedarse con sus extremos haría
    // saltar el ángulo más de media vuelta entre dos puntos seguidos (y no se sabría hacia dónde gira).
    for (let i = 0; i < p.length; i += 10) keep[i] = 1
    const stack: Array<[number, number]> = [[0, p.length - 1]]
    while (stack.length) {
      const [a, b] = stack.pop()!
      const ab = sub(p[b], p[a])
      const l2 = dot(ab, ab)
      let best = -1
      let bd = tol
      for (let i = a + 1; i < b; i++) {
        const ap = sub(p[i], p[a])
        const t = l2 > 0 ? Math.max(0, Math.min(1, dot(ap, ab) / l2)) : 0
        const d = Math.hypot(...sub(ap, [ab[0] * t, ab[1] * t, ab[2] * t]))
        if (d > bd) {
          bd = d
          best = i
        }
      }
      if (best >= 0) {
        keep[best] = 1
        stack.push([a, best], [best, b])
      }
    }
    return p.filter((_, i) => keep[i])
  }
  const cache = new Map<Rec, Pt[] | null>()
  /** Puntos de una arista en el sistema del modelo (sin la transformación del cuerpo). */
  const edgePoints = (e: Rec): Pt[] | null => {
    if (cache.has(e)) return cache.get(e)!
    const refs = refsOf(recs, e)
    const verts = refs.filter((q) => kindOf(q.to) === 'vertex')
    const cref = refs.find((q) => /curve$/.test(q.to.type))
    const v0 = pointOf(verts[0]?.to)
    const v1 = pointOf(verts[1]?.to ?? verts[0]?.to)
    let pts: Pt[] | null = null
    if (v0 && v1) {
      const curve = cref?.to
      const reversed = cref ? isReversed(e, cref.i + 1) : false
      if (curve?.type === 'ellipse-curve') {
        const n = lastNumbers(curve.items, 10)
        if (n) {
          const c: Pt = [n[0], n[1], n[2]]
          const axis: Pt = [n[3], n[4], n[5]]
          const major: Pt = [n[6], n[7], n[8]]
          const b = cross(axis, major)
          const kb = n[9] * (Math.hypot(...major) / (Math.hypot(...b) || 1))
          const minor: Pt = [b[0] * kb, b[1] * kb, b[2] * kb]
          const ang = (p: Pt) => {
            const d = sub(p, c)
            return Math.atan2(dot(d, minor) / dot(minor, minor), dot(d, major) / dot(major, major))
          }
          const closed = same(v0, v1)
          const a0 = ang(v0)
          let sweep = closed ? (reversed ? -2 : 2) * Math.PI : ang(v1) - a0
          if (!closed) {
            if (!reversed && sweep <= 0) sweep += 2 * Math.PI
            if (reversed && sweep >= 0) sweep -= 2 * Math.PI
          }
          const steps = Math.max(2, Math.ceil(Math.abs(sweep) / angleStep(Math.hypot(...major))))
          pts = Array.from({ length: steps + 1 }, (_, i) => {
            const a = a0 + (sweep * i) / steps
            return addK(addK(c, major, Math.cos(a)), minor, Math.sin(a))
          })
        }
      } else if (curve && /intcurve/.test(curve.type)) {
        const f = splineOf(curve.items)
        // Con los parámetros de la arista (ACIS 7 en adelante: el número que sigue a cada vértice), el tramo exacto; en
        // una curva cerrada, dando la vuelta por su período si hace falta.
        const t0 = verts[0] ? e.items[verts[0].i + 1] : undefined
        const t1 = verts[1] ? e.items[verts[1].i + 1] : undefined
        if (f && typeof t0 === 'number' && typeof t1 === 'number' && Math.abs(t1 - t0) > 1e-12) {
          const [a, b] = reversed ? [-t0, -t1] : [t0, t1]
          const period = f.hi - f.lo
          const at = (t: number) => f(period > 0 && (t < f.lo || t > f.hi) ? f.lo + ((((t - f.lo) % period) + period) % period) : t)
          const N = Math.max(8, Math.min(160, Math.ceil((Math.abs(b - a) / (period || 1)) * 160)))
          const seg = Array.from({ length: N + 1 }, (_, i) => at(a + ((b - a) * i) / N))
          const ok = (p: Pt, q: Pt) => Math.hypot(...sub(p, q)) <= tol * 10 + 1e-9 * (1 + Math.hypot(...q))
          if (ok(seg[0], v0) && ok(seg[N], v1)) {
            seg[0] = v0
            seg[N] = v1
            pts = simplify(seg)
          }
        }
        if (f && !pts) {
          // Del rango de la curva, el tramo entre los puntos más cercanos a cada vértice.
          const N = 160
          const samples = Array.from({ length: N + 1 }, (_, i) => f(f.lo + ((f.hi - f.lo) * i) / N))
          const nearest = (p: Pt) => samples.reduce((bi, q, i) => (Math.hypot(...sub(q, p)) < Math.hypot(...sub(samples[bi], p)) ? i : bi), 0)
          let i0 = nearest(v0)
          let i1 = nearest(v1)
          if (same(v0, v1)) [i0, i1] = reversed ? [N, 0] : [0, N]
          const seg = i0 <= i1 ? samples.slice(i0, i1 + 1) : samples.slice(i1, i0 + 1).reverse()
          if (seg.length >= 2) {
            seg[0] = v0
            seg[seg.length - 1] = v1
            pts = simplify(seg)
          }
        }
      }
      if (!pts && !same(v0, v1)) pts = [v0, v1]
    }
    cache.set(e, pts)
    return pts
  }
  return { pointOf, place, mirrored, edgePoints, tol, angleStep }
}

/** Aristas de los registros ya leídos. */
function edgesOf(recs: Rec[]): Pt[][] {
  const { place, edgePoints } = modelOf(recs)
  const out: Pt[][] = []
  for (const e of recs) {
    if (kindOf(e) !== 'edge') continue
    const pts = edgePoints(e)
    if (pts) out.push(pts.map(place))
  }
  return out
}

const signed = (b: Uint8Array): boolean => {
  const head = new TextDecoder('latin1').decode(b.subarray(0, 15))
  return SAB_SIGNATURES.some((s) => head.startsWith(s))
}

/** Registros de un modelo ACIS en SAT o SAB. */
export function acisRecords(data: Uint8Array | string): Rec[] {
  if (typeof data === 'string') return parseSat(data)
  return signed(data) ? parseSab(data) : parseSat(new TextDecoder().decode(data))
}

/** Aristas de un modelo ACIS en SAT o SAB; [] si no se puede leer. */
export function acisEdges(data: Uint8Array | string): Vec3[][] {
  try {
    if (typeof data === 'string') return edgesOf(parseSat(data))
    return edgesOf(signed(data) ? parseSab(data) : parseSat(new TextDecoder().decode(data)))
  } catch {
    return []
  }
}

/** SAT guardado en un DXF: grupos 1 (renglones) y 3 (continuación), con cada carácter invertido. */
export function satFromDxf(codes: Array<[number, string]>): string {
  let out = ''
  for (const [k, v] of codes) {
    if (k !== 1 && k !== 3) continue
    let line = ''
    const raw = v.replace(/\^ /g, '^')
    for (let i = 0; i < raw.length; i++) {
      const c = raw.charCodeAt(i)
      line += c === 32 ? ' ' : String.fromCharCode(159 - c)
    }
    out += line + (k === 1 ? '\n' : '')
  }
  return out
}

/** SAB de la sección ACDSDATA de un DXF 2013+ (grupos 310 en hexadecimal). */
export function sabFromHex(chunks: string[]): Uint8Array {
  const hex = chunks.join('')
  const out = new Uint8Array(hex.length >> 1)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}
