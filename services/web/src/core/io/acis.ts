import type { Vec3 } from '../math'

/**
 * Lector de ACIS (el modelo de los 3DSOLID, REGION, BODY y superficies de un DWG/DXF), en texto (SAT) o binario (SAB):
 * saca las aristas de la pieza como polilíneas 3D. Lee los registros `edge` con sus vértices y su curva: recta, elipse o
 * curva NURBS; lo que no entiende queda como la cuerda entre sus extremos. Las caras no se leen todavía.
 */
type Item = number | string | { ref: number }
interface Rec {
  type: string
  items: Item[]
}

const isRef = (x: Item): x is { ref: number } => typeof x === 'object'

/** Registros de un SAT: `tipo datos… #`, con la primera parte de encabezado (3 renglones). */
function parseSat(text: string): Rec[] {
  const nl1 = text.indexOf('\n')
  const nl2 = text.indexOf('\n', nl1 + 1)
  const nl3 = text.indexOf('\n', nl2 + 1)
  const recs: Rec[] = []
  for (const raw of text.slice(nl3 + 1).split('#')) {
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
        if (!cur) cur = { type: s, items: [] }
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
function splineOf(items: Item[]): ((t: number) => Pt) | null {
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
  return (t) => nurbsPoint(deg, full, ctrl, Math.min(full[full.length - 1], Math.max(full[0], t)))
}

/** Los últimos `n` números antes del primer texto (los límites `I`, `F`): la definición de la curva. */
function lastNumbers(items: Item[], n: number): number[] | null {
  const stop = items.findIndex((x, i) => typeof x === 'string' && i > 0)
  const list = (stop >= 0 ? items.slice(0, stop) : items).filter((x): x is number => typeof x === 'number')
  return list.length >= n ? list.slice(list.length - n) : null
}

/** Aristas de los registros ya leídos. */
function edgesOf(recs: Rec[]): Pt[][] {
  const pointOf = (r: Rec | undefined): Pt | null => {
    if (!r) return null
    if (r.type === 'vertex') {
      const p = r.items.filter(isRef).map((x) => recs[x.ref]).find((q) => q?.type === 'point')
      return pointOf(p)
    }
    const nums = r.items.filter((x): x is number => typeof x === 'number')
    return nums.length >= 3 ? (nums.slice(-3) as Pt) : null
  }
  // Transformación del cuerpo (filas de una matriz 3×3, traslación y escala).
  const body = recs.find((r) => r.type === 'body')
  const tr = body?.items.filter(isRef).map((x) => recs[x.ref]).find((r) => r?.type === 'transform')
  const m = tr?.items.filter((x): x is number => typeof x === 'number').slice(-13)
  const place = (p: Pt): Pt => {
    if (!m || m.length < 13) return p
    const s = m[12] || 1
    return [
      (p[0] * m[0] + p[1] * m[3] + p[2] * m[6]) * s + m[9],
      (p[0] * m[1] + p[1] * m[4] + p[2] * m[7]) * s + m[10],
      (p[0] * m[2] + p[1] * m[5] + p[2] * m[8]) * s + m[11],
    ]
  }

  const out: Pt[][] = []
  for (const e of recs) {
    if (e.type !== 'edge') continue
    const refs = e.items.map((x, i) => ({ x, i })).filter((q) => isRef(q.x) && recs[(q.x as { ref: number }).ref])
    const verts = refs.filter((q) => recs[(q.x as { ref: number }).ref].type === 'vertex')
    const curveRef = refs.find((q) => /curve$/.test(recs[(q.x as { ref: number }).ref].type))
    const v0 = pointOf(verts[0] && recs[(verts[0].x as { ref: number }).ref])
    const v1 = pointOf(verts[1] && recs[(verts[1].x as { ref: number }).ref])
    if (!v0 || !v1) continue
    const curve = curveRef && recs[(curveRef.x as { ref: number }).ref]
    const reversed = e.items.some((x) => x === 'reversed' || x === 'T' || x === '#1')
    let pts: Pt[] | null = null
    if (curve?.type === 'ellipse-curve') {
      const n = lastNumbers(curve.items, 10)
      if (n) {
        const c: Pt = [n[0], n[1], n[2]]
        const axis: Pt = [n[3], n[4], n[5]]
        const major: Pt = [n[6], n[7], n[8]]
        const minor = ((): Pt => {
          const b = cross(axis, major)
          const k = n[9] * (Math.hypot(...major) / (Math.hypot(...b) || 1))
          return [b[0] * k, b[1] * k, b[2] * k]
        })()
        const ang = (p: Pt) => {
          const d = sub(p, c)
          return Math.atan2(dot(d, minor) / dot(minor, minor), dot(d, major) / dot(major, major))
        }
        const closed = same(v0, v1)
        const a0 = ang(v0)
        let sweep = closed ? 2 * Math.PI : ang(v1) - a0
        if (!closed) {
          if (!reversed && sweep <= 0) sweep += 2 * Math.PI
          if (reversed && sweep >= 0) sweep -= 2 * Math.PI
        }
        const steps = Math.max(2, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * 64))
        pts = Array.from({ length: steps + 1 }, (_, i) => {
          const a = a0 + (sweep * i) / steps
          return addK(addK(c, major, Math.cos(a)), minor, Math.sin(a))
        })
      }
    } else if (curve && /intcurve/.test(curve.type)) {
      const f = splineOf(curve.items)
      // Parámetros de la arista: los números que siguen a cada vértice (ACIS 7 en adelante), o el rango de la curva.
      const t0 = verts[0] ? e.items[verts[0].i + 1] : undefined
      const t1 = verts[1] ? e.items[verts[1].i + 1] : undefined
      if (f && typeof t0 === 'number' && typeof t1 === 'number' && t1 !== t0) {
        const [a, b] = reversed ? [-t0, -t1] : [t0, t1]
        pts = Array.from({ length: 33 }, (_, i) => f(a + ((b - a) * i) / 32))
      }
    }
    if (!pts) {
      if (same(v0, v1)) continue // sin curva conocida, un punto no es una arista
      pts = [v0, v1]
    }
    out.push(pts.map(place))
  }
  return out
}

const signed = (b: Uint8Array): boolean => {
  const head = new TextDecoder('latin1').decode(b.subarray(0, 15))
  return SAB_SIGNATURES.some((s) => head.startsWith(s))
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
