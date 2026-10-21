import type { Vec3 } from '../math'
import type { DimensionEntity, DimensionProps } from '../document/types'
import { angularSector, dimDisplay, dimScaleFactor, linearDir } from '../dimension/dimGeometry'
import { ARROW_TYPES, BUILTIN_DIM_VARS, DIM_VAR_INFO, resolveDimVars, type ArrowType, type DimStyleDef, type DimVars } from '../dimension/style'
import { aciToHex, hexToAci } from './dxfColor'

/**
 * Cotas nativas en DXF: `DIMENSION` con su bloque anónimo `*Dn` (la geometría exacta que
 * se ve) y la tabla `DIMSTYLE`, en la sintaxis R12 del resto del exportador (sin handles). Así el CAD clásico
 * abre cotas editables con su estilo. Las que no tienen equivalente R12 (longitud de arco, radio
 * quebrado, multileaders, cotas fuera del plano XY) se exportan explotadas.
 */

const p = (code: number, val: string | number): string => `${code}\n${val}\n`
const pt = (base: number, v: Vec3): string => p(base, v[0]) + p(base + 10, v[1]) + p(base + 20, v[2])

/** Texto para DXF: símbolos con sus códigos `%%` y lo no ASCII como `\U+XXXX`. */
export function dxfText(s: string): string {
  return s
    .replace(/⌀/g, '%%c')
    .replace(/°/g, '%%d')
    .replace(/±/g, '%%p')
    .replace(/[^\x20-\x7e]/g, (c) => `\\U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
}

/** Inversa de `dxfText`. */
export function fromDxfText(s: string): string {
  return s
    .replace(/%%[cC]/g, '⌀')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±')
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
}

/** Nombre de tabla válido en DXF (sin espacios ni símbolos). */
const symbolName = (s: string): string => s.replace(/[^A-Za-z0-9_$-]/g, '_')

/** Variables con código DXF que se escriben en la tabla (hasta R2000; las flechas aparte). */
const EXPORTED = DIM_VAR_INFO.filter((v) => v.dxf !== undefined && v.kind !== 'arrow' && ![49, 69, 90, 290].includes(v.dxf))

const TICKS = new Set<ArrowType>(['_OBLIQUE', '_ARCHTICK'])
/** Nombre DXF de una flecha: '' es la cerrada rellena por defecto (también la IRAM 4:1). */
const arrowName = (a: ArrowType): string => (a === '_IRAM' ? '' : a)

/** Registro DIMSTYLE de un estilo resuelto. */
function dimStyleRecord(name: string, v: DimVars, scale: number): string {
  let out = p(0, 'DIMSTYLE') + p(2, name) + p(70, 0)
  for (const info of EXPORTED) {
    const val = v[info.name] as unknown
    const code = info.dxf!
    if (info.name === 'DIMSCALE') out += p(code, scale)
    else if (info.kind === 'bool') out += p(code, val ? 1 : 0)
    else if (info.kind === 'color') out += p(code, typeof val === 'string' ? hexToAci(val) : 0)
    else if (info.kind === 'lineweight') out += p(code, typeof val === 'number' ? Math.round(val * 100) : -2)
    else if (info.name === 'DIMDSEP') out += p(code, (String(val) || '.').charCodeAt(0))
    else if (info.kind === 'string') out += p(code, dxfText(String(val ?? '')))
    else out += p(code, Number(val))
  }
  // Flechas: trazos oblicuos con DIMTSZ (R12); el resto por nombre de bloque (DIMSAH si difieren).
  if (TICKS.has(v.DIMBLK1) && TICKS.has(v.DIMBLK2)) out += p(142, v.DIMASZ)
  else {
    out += p(142, 0)
    const [a1, a2] = [arrowName(v.DIMBLK1), arrowName(v.DIMBLK2)]
    if (a1 === a2) {
      if (a1) out += p(5, a1)
      out += p(173, 0)
    } else out += p(6, a1) + p(7, a2) + p(173, 1)
  }
  return out
}

/** Triángulos (abanico) de un polígono relleno, como entidades SOLID (`head`: capa y color). */
function solids(poly: Vec3[], head: string): string {
  let out = ''
  for (let i = 1; i + 1 < poly.length; i++) out += p(0, 'SOLID') + head + pt(10, poly[0]) + pt(11, poly[i]) + pt(12, poly[i + 1]) + pt(13, poly[i + 1])
  return out
}

/** Geometría de visualización como entidades DXF (capa y color de la entidad, o del bloque). */
export function dimGeometryDxf(d: ReturnType<typeof dimDisplay>, layer: string, byBlock: boolean): string {
  const head = p(8, layer) + (byBlock ? p(62, 0) : '')
  let out = ''
  for (const [a, b] of d.lines) out += p(0, 'LINE') + head + pt(10, a) + pt(11, b)
  for (const poly of d.fills) out += solids(poly, head)
  if (d.text.value) {
    const rot = (Math.atan2(d.text.dir[1], d.text.dir[0]) * 180) / Math.PI
    out += p(0, 'TEXT') + head + pt(10, d.text.pos) + p(40, d.text.height) + p(1, dxfText(d.text.value)) + p(50, rot) + p(72, 1) + pt(11, d.text.pos) + p(73, 2)
  }
  return out
}

const NATIVE = new Set(['LINEAR', 'ALIGNED', 'ANGULAR', 'RADIUS', 'DIAMETER', 'ORDINATE'])
const inXY = (pr: DimensionProps) => !pr.normal || (Math.abs(pr.normal[0]) < 1e-9 && Math.abs(pr.normal[1]) < 1e-9 && pr.normal[2] > 0)

/** Acumula los estilos y los bloques `*Dn` de las cotas exportadas. */
export class DxfDimWriter {
  private styles = new Map<string, { name: string; vars: DimVars }>()
  private blocks = ''
  private n = 0

  constructor(defs: DimStyleDef[] = []) {
    for (const d of defs) this.styles.set(`${d.name}|`, { name: symbolName(d.name), vars: resolveDimVars(d.vars) })
  }

  /** Estilo DXF de una cota: el suyo o, si tiene overrides, uno derivado con ellos. */
  private styleOf(pr: DimensionProps): string {
    const base = pr.styleName ?? 'Standard'
    const key = `${base}|${pr.overrides ? JSON.stringify(pr.overrides) : ''}`
    let st = this.styles.get(key)
    if (!st) {
      const used = new Set([...this.styles.values()].map((x) => x.name))
      let name = symbolName(pr.overrides ? `${base}_ov` : base)
      for (let i = 1; used.has(name); i++) name = symbolName(`${base}_ov${i}`)
      st = { name, vars: pr.style }
      this.styles.set(key, st)
    }
    return st.name
  }

  /** La cota como `DIMENSION` nativa (y su bloque), o null si no tiene equivalente. */
  dimension(e: DimensionEntity, layer: string): string | null {
    const pr = e.props
    if (!NATIVE.has(pr.dimType) || !inXY(pr) || pr.transScale) return null
    const d = dimDisplay(pr)
    const block = `*D${++this.n}`
    this.blocks += p(0, 'BLOCK') + p(8, '0') + p(2, block) + p(70, 1) + pt(10, [0, 0, 0]) + p(3, block) + dimGeometryDxf(d, '0', true) + p(0, 'ENDBLK') + p(8, '0')
    let type = 0
    let pts = ''
    const [a, b] = pr.points
    switch (pr.dimType) {
      case 'LINEAR': {
        const dir = linearDir(pr)
        pts = pt(10, d.handles![1]) + pt(13, a) + pt(14, b) + p(50, (Math.atan2(dir[1], dir[0]) * 180) / Math.PI)
        break
      }
      case 'ALIGNED':
        type = 1
        pts = pt(10, d.handles![1]) + pt(13, a) + pt(14, b)
        break
      case 'ANGULAR': {
        // Angular de 3 puntos: vértice, dos puntos y un punto del arco en la mitad del ángulo.
        type = 5
        const s = angularSector(pr)
        const e2 = [s.n[1] * s.s0[2] - s.n[2] * s.s0[1], s.n[2] * s.s0[0] - s.n[0] * s.s0[2], s.n[0] * s.s0[1] - s.n[1] * s.s0[0]]
        const r = Math.hypot(pr.textPos[0] - s.c[0], pr.textPos[1] - s.c[1], pr.textPos[2] - s.c[2]) || 1
        const at = (ang: number, rr: number): Vec3 => [0, 1, 2].map((i) => s.c[i] + (s.s0[i] * Math.cos(ang) + e2[i] * Math.sin(ang)) * rr) as Vec3
        pts = pt(10, at(s.sweep / 2, r)) + pt(13, at(0, r)) + pt(14, at(s.sweep, r)) + pt(15, s.c)
        break
      }
      case 'RADIUS':
        type = 4
        pts = pt(10, a) + pt(15, b)
        break
      case 'DIAMETER':
        type = 3
        pts = pt(10, [2 * a[0] - b[0], 2 * a[1] - b[1], 2 * a[2] - b[2]]) + pt(15, b)
        break
      case 'ORDINATE':
        type = 6 | (pr.axis === 'Y' ? 0 : 64)
        pts = pt(10, [0, 0, 0]) + pt(13, a) + pt(14, pr.textPos)
        break
    }
    const flags = type | 32 | (pr.textAt ? 128 : 0)
    return (
      p(0, 'DIMENSION') +
      p(8, layer) +
      p(2, block) +
      p(3, this.styleOf(pr)) +
      pts +
      pt(11, d.text.pos) +
      p(70, flags) +
      (pr.textOverride != null ? p(1, dxfText(pr.textOverride)) : '') +
      (pr.oblique !== undefined ? p(52, pr.oblique) : '') +
      (pr.textAngle !== undefined ? p(53, pr.textAngle) : '')
    )
  }

  /** Tabla DIMSTYLE (vacía si no hay estilos). */
  table(): string {
    if (!this.styles.size) return ''
    let out = p(0, 'TABLE') + p(2, 'DIMSTYLE') + p(70, this.styles.size)
    for (const st of this.styles.values()) out += dimStyleRecord(st.name, st.vars, dimScaleFactor(st.vars))
    return out + p(0, 'ENDTAB')
  }

  /** Sección BLOCKS con los bloques de las cotas (vacía si no hay). */
  blocksSection(): string {
    return this.blocks ? p(0, 'SECTION') + p(2, 'BLOCKS') + this.blocks + p(0, 'ENDSEC') : ''
  }
}

// --- Import ---

type Codes = Array<[number, string]>
const num = (c: Codes, code: number): number | undefined => {
  const f = c.find((x) => x[0] === code)
  return f ? Number(f[1]) : undefined
}
const str = (c: Codes, code: number): string | undefined => c.find((x) => x[0] === code)?.[1].trim()
const vec = (c: Codes, base: number): Vec3 => [num(c, base) ?? 0, num(c, base + 10) ?? 0, num(c, base + 20) ?? 0]

const toArrow = (name: string | undefined): ArrowType => {
  const up = (name ?? '').toUpperCase()
  return (ARROW_TYPES as readonly string[]).includes(up) && up !== '_IRAM' ? (up as ArrowType) : ''
}

/**
 * Estilo de un registro DIMSTYLE (R12 o R2000). Las flechas de R2000 vienen como handles de bloques:
 * `blockNames` los traduce. Lo que falta toma los valores de ISO-25.
 */
export function parseDimStyle(c: Codes, blockNames: Map<string, string>): DimStyleDef {
  const v: Record<string, unknown> = { ...BUILTIN_DIM_VARS['ISO-25'] }
  for (const info of DIM_VAR_INFO) {
    if (info.dxf === undefined || info.kind === 'arrow') continue
    const raw = c.find((x) => x[0] === info.dxf)?.[1]
    if (raw === undefined) continue
    const n = Number(raw)
    if (info.name === 'DIMDSEP') v.DIMDSEP = Number.isFinite(n) && n > 0 ? String.fromCharCode(n) : raw.trim()
    else if (info.kind === 'string') v[info.name] = fromDxfText(raw.trim())
    else if (info.kind === 'bool') v[info.name] = n !== 0
    else if (info.kind === 'color') v[info.name] = n === 0 || n === 256 || !Number.isFinite(n) ? null : aciToHex(Math.abs(n))
    else if (info.kind === 'lineweight') v[info.name] = n < 0 || !Number.isFinite(n) ? null : n / 100
    else if (Number.isFinite(n)) v[info.name] = n
  }
  const handle = (code: number) => {
    const h = str(c, code)
    return h ? blockNames.get(h.toUpperCase()) : undefined
  }
  const blk = str(c, 5) ?? handle(342)
  const sah = num(c, 173) === 1
  let b1 = toArrow(sah ? (str(c, 6) ?? handle(343)) : blk)
  let b2 = toArrow(sah ? (str(c, 7) ?? handle(344)) : blk)
  if ((num(c, 142) ?? 0) > 0) b1 = b2 = '_OBLIQUE' // DIMTSZ: trazos en lugar de flechas
  v.DIMBLK1 = b1
  v.DIMBLK2 = b2
  const ldr = handle(341)
  if (ldr !== undefined) v.DIMLDRBLK = toArrow(ldr)
  return { name: str(c, 2) ?? 'Standard', vars: resolveDimVars(v as unknown as DimVars) }
}

/** Una entidad DIMENSION de DXF como cota (sin el estilo resuelto), o null si el tipo no se soporta. */
export function parseDimension(c: Codes): { props: Omit<DimensionProps, 'style'>; styleName: string } | null {
  const flags = num(c, 70) ?? 0
  const type = flags & 7
  const p10 = vec(c, 10)
  const p11 = vec(c, 11)
  const p13 = vec(c, 13)
  const p14 = vec(c, 14)
  const p15 = vec(c, 15)
  const n: Vec3 = [num(c, 210) ?? 0, num(c, 220) ?? 0, num(c, 230) ?? 1]
  const extra: Partial<DimensionProps> = {}
  if (Math.abs(n[0]) > 1e-9 || Math.abs(n[1]) > 1e-9 || n[2] < 0) extra.normal = n
  const t = str(c, 1)
  if (t !== undefined && t !== '' && t !== '<>') extra.textOverride = fromDxfText(t)
  if (flags & 128) extra.textAt = p11
  const obl = num(c, 52)
  if (obl) extra.oblique = obl
  const tr = num(c, 53)
  if (tr) extra.textAngle = tr
  const styleName = str(c, 3) ?? 'Standard'
  const base = (dimType: DimensionProps['dimType'], points: Vec3[], textPos: Vec3) => ({ props: { dimType, points, textPos, ...extra }, styleName })
  switch (type) {
    case 0: {
      const r = base('LINEAR', [p13, p14], p10)
      return { ...r, props: { ...r.props, rotation: num(c, 50) ?? 0 } }
    }
    case 1:
      return base('ALIGNED', [p13, p14], p10)
    case 2: {
      // Angular de dos líneas (13→14 y 15→10): vértice en su intersección, arco por 16.
      const [a, b, q, r] = [p13, p14, p15, p10]
      const d1 = [b[0] - a[0], b[1] - a[1]]
      const d2 = [r[0] - q[0], r[1] - q[1]]
      const den = d1[0] * d2[1] - d1[1] * d2[0]
      if (Math.abs(den) < 1e-12) return null
      const s = ((q[0] - a[0]) * d2[1] - (q[1] - a[1]) * d2[0]) / den
      const v: Vec3 = [a[0] + d1[0] * s, a[1] + d1[1] * s, a[2]]
      const far = (x: Vec3, y: Vec3) => (Math.hypot(x[0] - v[0], x[1] - v[1]) >= Math.hypot(y[0] - v[0], y[1] - v[1]) ? x : y)
      return { props: { dimType: 'ANGULAR', points: [v, far(a, b), far(q, r)], textPos: vec(c, 16), angMode: 'lines', ...extra }, styleName }
    }
    case 5:
      return { props: { dimType: 'ANGULAR', points: [p15, p13, p14], textPos: p10, angMode: 'points', ...extra }, styleName }
    case 3: {
      const center: Vec3 = [(p10[0] + p15[0]) / 2, (p10[1] + p15[1]) / 2, (p10[2] + p15[2]) / 2]
      return base('DIAMETER', [center, p15], p11)
    }
    case 4:
      return base('RADIUS', [p10, p15], p11)
    case 6:
      return { props: { dimType: 'ORDINATE', points: [p13], textPos: p14, axis: flags & 64 ? 'X' : 'Y', ...extra }, styleName }
    default:
      return null
  }
}
