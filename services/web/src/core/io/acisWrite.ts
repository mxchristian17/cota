import type { Vec3 } from '../math'
import { affineDet, isSimilarity, type Affine } from '../geom/affine'

/**
 * Escritor de modelos ACIS, en binario (SAB, el de los DWG) o en texto (SAT, el de los DXF), de la versión 20800 (ACIS
 * 208): la de los sólidos que escriben los programas de la Open Design Alliance y la que lee el CAD clásico desde 2004.
 * Los dos formatos llevan los mismos registros: el SAB marca el tipo de cada dato y el SAT lo escribe como palabra (un
 * lógico es `forward`/`reversed`, `single`/`double`…; un límite de intervalo, `I` si es infinito o `F valor`).
 *
 * También rehace el modelo original de una pieza importada con otra ubicación (`acisWithTransform`): compone la matriz
 * de la hoja con la transformación del cuerpo, sin tocar el resto (colores de caras, atributos, historia).
 */

export const ACIS_VERSION = 20800
const ACIS_VERSION_STR = 'ACIS 208.00 NT'
const ASM_HEADER = '208.0.4.7009'
const PRODUCT = 'Cota'

/** Dato de un registro. */
export type Tok =
  /** Puntero a otro registro (su posición en la lista, sin el encabezado ASM); -1 = nulo. */
  | { k: 'p'; v: number }
  | { k: 'i'; v: number }
  | { k: 'd'; v: number }
  /** Texto (`@n texto` en SAT). */
  | { k: 's'; v: string }
  /** Lógico: en SAT, la palabra `t` si es verdadero y `f` si es falso. */
  | { k: 'b'; v: boolean; t: string; f: string }
  /** Enumerado: entero en SAB, palabra en SAT. */
  | { k: 'e'; v: number; w: string }
  /** Nombre dentro de un subtipo (`exactcur`, `nubs`, `null_surface`…). */
  | { k: 'n'; v: string }
  /** Posición o dirección (tres reales). */
  | { k: 'P' | 'V'; v: Vec3 }
  | { k: '{' }
  | { k: '}' }
  /** Límite de intervalo: null = infinito. */
  | { k: 'I'; v: number | null }

export interface AcisRecord {
  /** `body`, `cone-surface`, `intcurve-curve`… */
  type: string
  toks: Tok[]
}

// Constructores de datos.
export const ptr = (v: number): Tok => ({ k: 'p', v })
export const int = (v: number): Tok => ({ k: 'i', v })
export const dbl = (v: number): Tok => ({ k: 'd', v })
export const str = (v: string): Tok => ({ k: 's', v })
export const name = (v: string): Tok => ({ k: 'n', v })
export const pos = (v: Vec3): Tok => ({ k: 'P', v })
export const vec = (v: Vec3): Tok => ({ k: 'V', v })
export const ival = (v: number | null = null): Tok => ({ k: 'I', v })
export const open: Tok = { k: '{' }
export const close: Tok = { k: '}' }
/** Sentido: `reversed` (verdadero) o `forward`. */
export const sense = (reversed: boolean): Tok => ({ k: 'b', v: reversed, t: 'reversed', f: 'forward' })
/** Sentido de la v de una superficie (`reverse_v` o `forward_v`). */
export const senseV = (reversed: boolean): Tok => ({ k: 'b', v: reversed, t: 'reverse_v', f: 'forward_v' })
export const enumTok = (v: number, w: string): Tok => ({ k: 'e', v, w })

/** Lo que encabeza a casi todos los registros desde ACIS 7: atributo, número de historia y patrón (todos vacíos). */
export const common = (): Tok[] => [ptr(-1), int(-1), ptr(-1)]

// --- Números ---

/** Real en texto: el más corto que se vuelve a leer igual (sin `-0`). */
const num = (x: number): string => (Object.is(x, -0) || x === 0 ? '0' : String(x))

const ctime = (d: Date): string => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const two = (n: number) => String(n).padStart(2, '0')
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())} ${d.getFullYear()}`
}

// --- SAT ---

/** Texto de un dato SAT; los punteros, corridos por el encabezado ASM (que ocupa la posición 0). */
function satTok(t: Tok): string {
  switch (t.k) {
    case 'p':
      return t.v < 0 ? '$-1' : `$${t.v + 1}`
    case 'i':
      return String(Math.round(t.v))
    case 'd':
      return num(t.v)
    case 's':
      return `@${t.v.length} ${t.v}`
    case 'b':
      return t.v ? t.t : t.f
    case 'e':
      return t.w
    case 'n':
      return t.v
    case 'P':
    case 'V':
      return t.v.map(num).join(' ')
    case '{':
      return '{'
    case '}':
      return '}'
    case 'I':
      return t.v === null ? 'I' : `F ${num(t.v)}`
  }
}

/** Modelo en SAT 20800: encabezado (versión, registros, cuerpos + encabezado ASM, banderas), registros y cierre. */
export function writeSat(recs: AcisRecord[], date = new Date()): string {
  const bodies = recs.filter((r) => r.type === 'body').length
  const when = ctime(date)
  const lines = [
    `${ACIS_VERSION} 0 ${bodies + 1} 0 `,
    `@${PRODUCT.length} ${PRODUCT} @${ACIS_VERSION_STR.length} ${ACIS_VERSION_STR} @${when.length} ${when} `,
    '1 9.9999999999999995e-007 1e-010 ',
    `asmheader $-1 -1 @${ASM_HEADER.length} ${ASM_HEADER} #`,
  ]
  for (const r of recs) lines.push(`${r.type} ${r.toks.map(satTok).join(' ')} #`)
  lines.push('End-of-ACIS-data ')
  return lines.join('\n') + '\n'
}

// --- SAB ---

const TAG = {
  INT: 0x04,
  DOUBLE: 0x06,
  STR: 0x07,
  TRUE: 0x0a,
  FALSE: 0x0b,
  PTR: 0x0c,
  TYPE: 0x0d,
  TYPE_EX: 0x0e,
  OPEN: 0x0f,
  CLOSE: 0x10,
  END: 0x11,
  LITERAL: 0x12,
  POS: 0x13,
  DIR: 0x14,
  ENUM: 0x15,
} as const

class Bytes {
  private buf = new Uint8Array(1 << 12)
  private view = new DataView(this.buf.buffer)
  n = 0
  private room(k: number): void {
    if (this.n + k <= this.buf.length) return
    let size = this.buf.length * 2
    while (size < this.n + k) size *= 2
    const next = new Uint8Array(size)
    next.set(this.buf.subarray(0, this.n))
    this.buf = next
    this.view = new DataView(next.buffer)
  }
  u8(v: number): void {
    this.room(1)
    this.buf[this.n++] = v
  }
  i32(v: number): void {
    this.room(4)
    this.view.setInt32(this.n, v, true)
    this.n += 4
  }
  u32(v: number): void {
    this.room(4)
    this.view.setUint32(this.n, v, true)
    this.n += 4
  }
  f64(v: number): void {
    this.room(8)
    this.view.setFloat64(this.n, v, true)
    this.n += 8
  }
  raw(b: Uint8Array): void {
    this.room(b.length)
    this.buf.set(b, this.n)
    this.n += b.length
  }
  latin(s: string): void {
    const b = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff
    this.raw(b)
  }
  /** Texto corto con su largo en un byte (más largo, con el de cuatro bytes del texto literal). */
  text(s: string, tag: number = TAG.STR): void {
    if (s.length > 255) {
      this.u8(TAG.LITERAL)
      this.u32(s.length)
    } else {
      this.u8(tag)
      this.u8(s.length)
    }
    this.latin(s)
  }
  out(): Uint8Array {
    return this.buf.slice(0, this.n)
  }
}

/** Tipo de registro en SAB: `cone-surface` = `cone` (0x0E) + `surface` (0x0D). */
function sabType(w: Bytes, type: string): void {
  const parts = type.split('-')
  parts.forEach((p, i) => w.text(p, i === parts.length - 1 ? TAG.TYPE : TAG.TYPE_EX))
}

function sabTok(w: Bytes, t: Tok): void {
  switch (t.k) {
    case 'p':
      w.u8(TAG.PTR)
      w.i32(t.v < 0 ? -1 : t.v + 1)
      return
    case 'i':
      w.u8(TAG.INT)
      w.i32(Math.round(t.v))
      return
    case 'd':
      w.u8(TAG.DOUBLE)
      w.f64(t.v)
      return
    case 's':
      w.text(t.v)
      return
    case 'b':
      w.u8(t.v ? TAG.TRUE : TAG.FALSE)
      return
    case 'e':
      w.u8(TAG.ENUM)
      w.i32(t.v)
      return
    case 'n':
      w.text(t.v, TAG.TYPE)
      return
    case 'P':
    case 'V':
      w.u8(t.k === 'P' ? TAG.POS : TAG.DIR)
      for (const x of t.v) w.f64(x)
      return
    case '{':
      w.u8(TAG.OPEN)
      return
    case '}':
      w.u8(TAG.CLOSE)
      return
    case 'I':
      // Finito: verdadero y su valor; infinito: falso.
      if (t.v === null) w.u8(TAG.FALSE)
      else {
        w.u8(TAG.TRUE)
        w.u8(TAG.DOUBLE)
        w.f64(t.v)
      }
  }
}

/** Modelo en SAB 20800 (`ACIS BinaryFile`), con el encabezado ASM como primer registro. */
export function writeSab(recs: AcisRecord[], date = new Date()): Uint8Array {
  const w = new Bytes()
  w.latin('ACIS BinaryFile')
  const bodies = recs.filter((r) => r.type === 'body').length
  for (const v of [ACIS_VERSION, 0, bodies + 1, 0]) w.i32(v)
  w.text(PRODUCT)
  w.text(ACIS_VERSION_STR)
  w.text(ctime(date))
  for (const v of [1, 1e-6, 1e-10]) {
    w.u8(TAG.DOUBLE)
    w.f64(v)
  }
  sabType(w, 'asmheader')
  sabTok(w, ptr(-1))
  sabTok(w, int(-1))
  w.text(ASM_HEADER)
  w.u8(TAG.END)
  for (const r of recs) {
    sabType(w, r.type)
    for (const t of r.toks) sabTok(w, t)
    w.u8(TAG.END)
  }
  for (const [i, p] of ['End', 'of', 'ACIS', 'data'].entries()) w.text(p, i === 3 ? TAG.TYPE : TAG.TYPE_EX)
  return w.out()
}

// --- DXF ---

/**
 * SAT como lo guarda un DXF (3DSOLID, REGION, BODY): un grupo 1 por renglón, partido en grupos 3 de 255 caracteres, con
 * cada carácter «cifrado» (159 − código; el espacio queda). Una `A` cifrada es `^`, que en un DXF se escribe `^ `.
 */
export function satDxfGroups(sat: string): string {
  let out = ''
  for (const line of sat.split('\n')) {
    if (!line) continue
    let enc = ''
    for (let i = 0; i < line.length; i++) {
      const c = line.charCodeAt(i)
      if (c === 32) enc += ' '
      else {
        const e = String.fromCharCode(159 - c)
        enc += e === '^' ? '^ ' : e
      }
    }
    // Partir sin separar `^ ` (el lector lo toma como un solo carácter).
    let first = true
    while (enc.length) {
      let cut = Math.min(255, enc.length)
      if (enc[cut - 1] === '^' && enc[cut] === ' ') cut--
      out += `${first ? 1 : 3}\n${enc.slice(0, cut)}\n`
      enc = enc.slice(cut)
      first = false
    }
  }
  return out
}

// --- Modelo original con otra ubicación ---

/**
 * Transformación del cuerpo compuesta con la matriz `m` (primero la del modelo, después `m`): la matriz 3×3 por filas
 * (sin la escala), la traslación y la escala. Convención ACIS: p' = (p · A) · escala + t. Sólo semejanzas.
 */
export function composeAcisTransform(old: number[] | null, m: Affine): { rows: number[]; t: Vec3; scale: number; rotate: boolean; reflect: boolean } | null {
  if (!isSimilarity(m)) return null
  // Lineal en columnas: L = M · k · Aᵀ; traslación: M · t₀ + t.
  const A = old && old.length >= 13 ? old.slice(0, 9) : [1, 0, 0, 0, 1, 0, 0, 0, 1]
  const k0 = old && old.length >= 13 ? old[12] || 1 : 1
  const t0: Vec3 = old && old.length >= 13 ? [old[9], old[10], old[11]] : [0, 0, 0]
  const M = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]
  const L = new Array<number>(9)
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) L[r * 3 + c] = k0 * (M[r * 3] * A[c * 3] + M[r * 3 + 1] * A[c * 3 + 1] + M[r * 3 + 2] * A[c * 3 + 2])
  const t: Vec3 = [0, 1, 2].map((r) => M[r * 3] * t0[0] + M[r * 3 + 1] * t0[1] + M[r * 3 + 2] * t0[2] + m[r * 4 + 3]) as Vec3
  const det = L[0] * (L[4] * L[8] - L[5] * L[7]) - L[1] * (L[3] * L[8] - L[5] * L[6]) + L[2] * (L[3] * L[7] - L[4] * L[6])
  const scale = Math.cbrt(Math.abs(det))
  if (!(scale > 0)) return null
  // A' = Lᵀ / escala (filas de A' = columnas de L).
  const rows = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => L[c * 3 + r] / scale))
  const rotate = rows.some((v, i) => Math.abs(Math.abs(v) - (i % 4 === 0 ? 1 : 0)) > 1e-12)
  return { rows, t, scale, rotate, reflect: det < 0 }
}

const transformText = (x: NonNullable<ReturnType<typeof composeAcisTransform>>): string =>
  [...x.rows, ...x.t, x.scale].map(num).join(' ') + ` ${x.rotate ? 'rotate' : 'no_rotate'} ${x.reflect ? 'reflect' : 'no_reflect'} no_shear`

/** Dato de un SAB sin interpretar: su etiqueta y sus bytes (los de la etiqueta incluidos). */
interface RawTok {
  tag: number
  at: number
  end: number
}

function sabRaw(b: Uint8Array): { start: number; recs: RawTok[][]; tail: number; version: number } | null {
  const head = new TextDecoder('latin1').decode(b.subarray(0, 15))
  if (head !== 'ACIS BinaryFile' && head !== 'ASM BinaryFile4') return null
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const version = v.getInt32(15, true)
  let pos = 31
  // Encabezado: tres textos y tres reales.
  for (let k = 0; k < 6; k++) {
    const t = b[pos++]
    if (t === TAG.STR) pos += 1 + b[pos]
    else if (t === TAG.DOUBLE) pos += 8
    else return null
  }
  const start = pos
  const recs: RawTok[][] = []
  let cur: RawTok[] = []
  while (pos < b.length) {
    const at = pos
    const t = b[pos++]
    switch (t) {
      case TAG.INT:
      case TAG.PTR:
      case TAG.ENUM:
        pos += 4
        break
      case TAG.DOUBLE:
        pos += 8
        break
      case TAG.STR:
      case TAG.TYPE:
      case TAG.TYPE_EX:
        pos += 1 + b[pos]
        break
      case 0x08:
        pos += 2 + v.getUint16(pos, true)
        break
      case TAG.LITERAL:
        pos += 4 + v.getUint32(pos, true)
        break
      case TAG.POS:
      case TAG.DIR:
        pos += 24
        break
      case TAG.TRUE:
      case TAG.FALSE:
      case TAG.OPEN:
      case TAG.CLOSE:
      case TAG.END:
        break
      default:
        return null
    }
    if (pos > b.length) return null
    cur.push({ tag: t, at, end: pos })
    if (t === TAG.END) {
      recs.push(cur)
      cur = []
    }
  }
  // Lo que quedó sin cerrar es la marca final («End of ACIS data»).
  const tail = cur.length ? cur[0].at : b.length
  return { start, recs, tail, version }
}

const rawText = (b: Uint8Array, t: RawTok): string => new TextDecoder('latin1').decode(b.subarray(t.at + 2, t.end))
const rawTypeOf = (b: Uint8Array, r: RawTok[]): string => {
  const parts: string[] = []
  for (const t of r) {
    if (t.tag !== TAG.TYPE && t.tag !== TAG.TYPE_EX) break
    parts.push(rawText(b, t))
    if (t.tag === TAG.TYPE) break
  }
  return parts.join('-')
}

/** Números de un registro `transform` de SAB (los 13: matriz por filas, traslación y escala), en cualquier forma. */
function sabTransformNumbers(b: Uint8Array, r: RawTok[]): number[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const out: number[] = []
  for (const t of r) {
    if (t.tag === TAG.DOUBLE) out.push(v.getFloat64(t.at + 1, true))
    else if (t.tag === TAG.POS || t.tag === TAG.DIR) for (let i = 0; i < 3; i++) out.push(v.getFloat64(t.at + 1 + i * 8, true))
    else if (t.tag === TAG.LITERAL)
      for (const w of new TextDecoder('latin1')
        .decode(b.subarray(t.at + 5, t.end))
        .trim()
        .split(/\s+/)) {
        const n = Number(w)
        if (w !== '' && Number.isFinite(n)) out.push(n)
      }
  }
  return out.slice(-13)
}

/**
 * El SAB de una pieza importada con la matriz `m` aplicada a su cuerpo (null si no se puede: un modelo sin cuerpo, otro
 * formato, una matriz que no es una semejanza). El resto del archivo queda igual, byte a byte.
 */
export function sabWithTransform(b: Uint8Array, m: Affine): Uint8Array | null {
  const raw = sabRaw(b)
  if (!raw) return null
  const bodies = raw.recs.map((r, i) => ({ r, i })).filter(({ r }) => rawTypeOf(b, r) === 'body')
  if (!bodies.length) return null
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const asm = new TextDecoder('latin1').decode(b.subarray(0, 15)) === 'ASM BinaryFile4'
  // Registros nuevos (al final, antes de la marca), registros reemplazados y punteros a corregir (en un cuerpo).
  const added: Uint8Array[] = []
  const replaced = new Map<number, Uint8Array>()
  const patches = new Map<number, { offset: number; value: number }>()
  let next = raw.recs.length
  for (const { r, i } of bodies) {
    const ptrs = r.filter((t) => t.tag === TAG.PTR)
    const last = ptrs[ptrs.length - 1]
    if (!last) return null
    const tr = view.getInt32(last.at + 1, true)
    const old = tr >= 0 && raw.recs[tr] && rawTypeOf(b, raw.recs[tr]) === 'transform' ? sabTransformNumbers(b, raw.recs[tr]) : null
    const x = composeAcisTransform(old && old.length === 13 ? old : null, m)
    if (!x) return null
    const w = new Bytes()
    sabType(w, 'transform')
    sabTok(w, ptr(-1))
    if (raw.version >= 700) sabTok(w, int(-1))
    if (asm) {
      // Como lo escribe el CAD clásico en los archivos ASM: filas, traslación, escala y banderas.
      for (let k = 0; k < 3; k++) sabTok(w, vec(x.rows.slice(k * 3, k * 3 + 3) as Vec3))
      sabTok(w, vec(x.t))
      sabTok(w, dbl(x.scale))
      for (const f of [x.rotate, x.reflect, false]) w.u8(f ? TAG.TRUE : TAG.FALSE)
    } else {
      // Como los escriben los programas de la ODA: el texto de la matriz.
      const s = `${transformText(x)} `
      w.u8(TAG.LITERAL)
      w.u32(s.length)
      w.latin(s)
    }
    w.u8(TAG.END)
    if (tr >= 0 && old) replaced.set(tr, w.out())
    else {
      added.push(w.out())
      patches.set(i, { offset: last.at + 1 - r[0].at, value: next++ })
    }
  }
  const out = new Bytes()
  out.raw(b.subarray(0, raw.start))
  for (let i = 0; i < raw.recs.length; i++) {
    const r = raw.recs[i]
    const rep = replaced.get(i)
    if (rep) {
      out.raw(rep)
      continue
    }
    const bytes = b.slice(r[0].at, r[r.length - 1].end)
    const fix = patches.get(i)
    if (fix) new DataView(bytes.buffer).setInt32(fix.offset, fix.value, true)
    out.raw(bytes)
  }
  for (const a of added) out.raw(a)
  out.raw(b.subarray(raw.tail))
  return out.out()
}

/**
 * El SAT de una pieza importada con la matriz `m` aplicada a su cuerpo. Los registros van por posición (los que
 * numeran cada registro, `-n tipo …`, no se tocan: null).
 */
export function satWithTransform(text: string, m: Affine): string | null {
  const version = parseInt(text, 10)
  if (!Number.isFinite(version)) return null
  // Encabezado: 1 renglón (SAT viejos) o 3 (desde ACIS 4).
  let start = text.indexOf('\n') + 1
  if (version >= 400) for (let k = 0; k < 2; k++) start = text.indexOf('\n', start) + 1
  if (start <= 0) return null
  const body = text.slice(start)
  const endAt = body.search(/End-of-(ACIS|ASM)-data/)
  const recText = endAt >= 0 ? body.slice(0, endAt) : body
  const parts = recText.split('#')
  const last = parts.pop() ?? ''
  if (last.trim()) return null
  if (parts.some((p) => /^\s*-\d+\s/.test(p))) return null
  const toks = parts.map((p) => p.trim().split(/\s+/))
  const added: string[] = []
  for (let i = 0; i < toks.length; i++) {
    if (toks[i][0] !== 'body') continue
    let li = -1
    for (let j = toks[i].length - 1; j > 0; j--)
      if (toks[i][j].startsWith('$')) {
        li = j
        break
      }
    if (li < 0) return null
    const tr = Number(toks[i][li].slice(1))
    const old =
      tr >= 0 && toks[tr]?.[0] === 'transform'
        ? toks[tr]
            .slice(1)
            .map(Number)
            .filter((n) => Number.isFinite(n))
        : null
    // El número de historia (desde ACIS 7) es un entero: no cuenta entre los 13 de la matriz.
    const nums = old ? old.slice(-13) : null
    const x = composeAcisTransform(nums && nums.length === 13 ? nums : null, m)
    if (!x) return null
    const rec = ['transform', '$-1', ...(version >= 700 ? ['-1'] : []), transformText(x)].join(' ')
    if (tr >= 0 && old) toks[tr] = rec.split(' ')
    else {
      added.push(rec)
      toks[i][li] = `$${toks.length + added.length - 1}`
    }
  }
  const head = text.slice(0, start)
  const tail = endAt >= 0 ? body.slice(endAt) : ''
  return head + [...toks.map((t) => t.join(' ')), ...added].map((l) => `${l} #`).join('\n') + '\n' + tail
}

/** ¿El modelo se puede mover con su transformación? (Una semejanza, de lo contrario va por el núcleo.) */
export const acisMovable = (m: Affine | undefined): boolean => !m || (isSimilarity(m) && affineDet(m) !== 0)
