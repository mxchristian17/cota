import { BASELINE_DROP, LINE_SPACING, attdefText, textAxes, textSize } from '../geom/text'
import { decodeTextCodes, encodeTextCodes } from '../text/codes'
import type { Vec3 } from '../math'
import type { DrawingVars, Entity, EntityProps, EntityType, InsertProps, Layer, LineType, LinetypeDefData, RectangleProps, TextProps } from '../document/types'
import { transformEntity as transformInsertEntity } from '../editing/block'
import { BYBLOCK, BYLAYER, CONTINUOUS, linetypeLabel, patternLength } from '../linetype/linetypes'
import { hatchDxf, parseHatch } from './dxfHatch'
import { dimDisplay } from '../dimension/dimGeometry'
import { aciToHex, hexToAci, hexToTruecolor, truecolorToHex } from './dxfColor'
import { DxfDimWriter, dimGeometryDxf, parseDimension, parseDimStyle } from './dxfDim'
import { resolveDimVars, type DimStyleDef } from '../dimension/style'
import { angleFromOcs, angleToOcs, fromOcs, isWorldExtrusion, toOcs } from './dxfOcs'
import { normAngle } from '../geom/arc'

/**
 * DXF ASCII (subconjunto R2000/AC1015) **sin dependencias**. Exporta/importa las
 * entidades 2D (LINE, CIRCLE, ELLIPSE, TEXT/MTEXT, RECTANGLE, LWPOLYLINE, SPLINE) y la
 * tabla de layers (nombre, color truecolor+ACI, line weight, line type). Las cotas
 * (DIMENSION) se exportan "explotadas" a líneas + flechas + texto (visibles en cualquier
 * visor). No cubre 3D (SOLID3D/MESH3D) ni DXF binario.
 */

// --- Line type ↔ DXF ---

/** Nombre de tipo de línea de una capa (cualquiera; el documento lo carga de la biblioteca o del LTYPE). */
function toLineType(name: string | undefined): LineType {
  const up = (name ?? '').trim().toUpperCase()
  return up && up !== BYLAYER && up !== BYBLOCK ? up : CONTINUOUS
}

/** Grupos 6/48/62/420/370 del objeto (tipo de línea, escala, color y grosor), sólo si no son ByLayer/1. */
function commonCodes(e: Entity): string {
  let out = ''
  const lt = e.lineType?.toUpperCase()
  if (lt && lt !== BYLAYER && !lt.startsWith(BYLAYER + ':')) out += p(6, linetypeLabel(lt) === 'ByBlock' ? 'ByBlock' : lt)
  if (e.ltScale !== undefined && e.ltScale !== 1) out += p(48, e.ltScale)
  if (e.color?.startsWith('#')) {
    const aci = hexToAci(e.color)
    out += p(62, aci)
    if (aciToHex(aci).toLowerCase() !== e.color.toLowerCase()) out += p(420, hexToTruecolor(e.color))
  }
  if (e.lineWeight !== undefined && e.lineWeight >= 0) out += p(370, e.lineWeight === 0 ? -3 : Math.round(e.lineWeight * 100))
  return out
}

/** Color y grosor propios de un record (62/420, 370); ByLayer/ByBlock/Default de color quedan sin color propio. */
function ownColorWeight(codes: Rec['codes']): Pick<DxfEntitySpec, 'color' | 'lineWeight'> {
  const out: Pick<DxfEntitySpec, 'color' | 'lineWeight'> = {}
  const tc = codes.find(([c]) => c === 420)
  const aci = num(codes, 62, 256)
  if (tc) out.color = truecolorToHex(Number(tc[1]))
  else if (aci >= 1 && aci <= 255) out.color = aciToHex(aci)
  const lw = num(codes, 370, -1)
  if (lw === -3) out.lineWeight = 0
  else if (lw >= 0) out.lineWeight = lw / 100
  return out
}

// --- Export ---

const p = (code: number, val: string | number): string => `${code}\n${val}\n`

function entityDxf(e: Entity, layerName: string): string | null {
  const h = p(8, layerName) + commonCodes(e)
  switch (e.type) {
    case 'POINT': {
      const [x, y, z] = e.props.position
      return p(0, 'POINT') + h + p(10, x) + p(20, y) + p(30, z)
    }
    case 'LINE': {
      const { start, end } = e.props
      return (
        p(0, 'LINE') +
        h +
        p(10, start[0]) + p(20, start[1]) + p(30, start[2]) +
        p(11, end[0]) + p(21, end[1]) + p(31, end[2])
      )
    }
    case 'CIRCLE': {
      // Centro en el OCS de su extrusión: un círculo en un plano vertical abre en su lugar.
      const { center, radius, normal } = e.props
      const c = toOcs(center, normal)
      return p(0, 'CIRCLE') + h + p(10, c[0]) + p(20, c[1]) + p(30, c[2]) + p(40, radius) + extrusion(normal)
    }
    case 'ARC': {
      const { center, radius, startAngle, endAngle, normal } = e.props
      // DXF ARC: 10/20/30 centro y 50/51 ángulos (GRADOS) en el OCS de la extrusión 210/220/230 (la normal
      // invertida es cómo el CAD clásico guarda un arco horario).
      const c = toOcs(center, normal)
      const deg = (a: number) => ((((angleToOcs(a, normal) * 180) / Math.PI) % 360) + 360) % 360
      return (
        p(0, 'ARC') + h +
        p(10, c[0]) + p(20, c[1]) + p(30, c[2]) +
        p(40, radius) +
        p(50, deg(startAngle)) + p(51, deg(endAngle)) +
        p(210, normal[0]) + p(220, normal[1]) + p(230, normal[2])
      )
    }
    case 'ELLIPSE': {
      const { center, major, ratio, normal, startParam, endParam } = e.props
      // DXF ELLIPSE: 10/20/30 centro, 11/21/31 endpoint del semieje mayor (relativo), 40 ratio,
      // 41/42 parámetros inicio/fin (0..2π = elipse completa), 210/220/230 normal.
      return (
        p(0, 'ELLIPSE') + h +
        p(10, center[0]) + p(20, center[1]) + p(30, center[2]) +
        p(11, major[0]) + p(21, major[1]) + p(31, major[2]) +
        p(210, normal[0]) + p(220, normal[1]) + p(230, normal[2]) +
        p(40, ratio) + p(41, startParam ?? 0) + p(42, endParam ?? Math.PI * 2)
      )
    }
    case 'TEXT': {
      const { position, text, height: th, rotation, justify, normal } = e.props
      if (text.includes('\n') || e.props.kind === 'mtext') {
        // MTEXT: punto de inserción (arriba, a la izquierda/centro/derecha) en el mundo; \P = salto de renglón.
        const deg = (rotation * 180) / Math.PI
        const mt = encodeTextCodes(text.replace(/[\\{}]/g, (c) => '\\' + c)).split('\n').join('\\P')
        const ins = p(10, position[0]) + p(20, position[1]) + p(30, position[2]) + p(40, th) + p(50, deg)
        return p(0, 'MTEXT') + h + ins + p(71, justify === 'right' ? 3 : justify === 'center' ? 2 : 1) + p(1, mt) + extrusion(normal)
      }
      // TEXT: punto de la línea base (el de los rótulos y dibujos anteriores va arriba: se baja una línea base),
      // inserción y rotación en el OCS de la extrusión. Centrado o a la derecha: el punto va en 11/21/31.
      const { u, v } = textAxes(e.props)
      const drop = e.props.kind === 'text' ? 0 : th * BASELINE_DROP
      const at: Vec3 = [0, 1, 2].map((i) => position[i] - v[i] * drop) as Vec3
      const back = justify === 'center' ? textSize(e.props).width / 2 : justify === 'right' ? textSize(e.props).width : 0
      const q = toOcs([0, 1, 2].map((i) => at[i] - u[i] * back) as Vec3, normal)
      const deg = (((angleToOcs(rotation, normal) * 180) / Math.PI) % 360 + 360) % 360
      const ins = p(10, q[0]) + p(20, q[1]) + p(30, q[2]) + p(40, th) + p(50, deg)
      const a = toOcs(at, normal)
      const jc = justify === 'left' ? '' : p(72, justify === 'center' ? 1 : 2) + p(11, a[0]) + p(21, a[1]) + p(31, a[2])
      return p(0, 'TEXT') + h + ins + p(1, encodeTextCodes(text)) + jc + extrusion(normal)
    }
    case 'RECTANGLE': {
      const [x, y, z] = e.props.corner
      const w = e.props.width
      const hgt = e.props.height
      const verts: Array<[number, number]> = [
        [x, y],
        [x + w, y],
        [x + w, y + hgt],
        [x, y + hgt],
      ]
      return lwpolyline(verts, true, h, undefined, z)
    }
    case 'POLYLINE': {
      // Vértices en el OCS de su normal, con la elevación (38) y la extrusión.
      const n = e.props.normal ?? [0, 0, 1]
      const q = e.props.vertices.map((v) => toOcs(v, n))
      return lwpolyline(
        q.map((v) => [v[0], v[1]] as [number, number]),
        e.props.closed,
        h,
        e.props.bulges,
        q[0]?.[2] ?? 0,
        n,
        e.props.widths,
      )
    }
    case 'SPLINE': {
      const cps = e.props.controlPoints
      let out = p(0, 'SPLINE') + h + p(70, 8) + p(71, e.props.degree) + p(72, 0) + p(73, cps.length) + p(74, 0)
      for (const v of cps) out += p(10, v[0]) + p(20, v[1]) + p(30, v[2])
      return out
    }
    case 'DIMENSION':
      // Sin equivalente nativo (ver `DxfDimWriter`): explotada a líneas, flechas rellenas (SOLID) y texto.
      return dimGeometryDxf(dimDisplay(e.props), layerName, false)
    // 3D no se exporta a DXF (formato 2D en este alcance).
    case 'SOLID3D':
    case 'MESH3D':
    case 'INSERT': // las inserciones se expanden a geometría de mundo antes de exportar
    case 'VIEWPORT': // los layouts no se exportan a DXF (D2)
      return null
    case 'ATTDEF': // ATTDEF nativo fuera de alcance (D2): se exporta como TEXT con el tag
      return entityDxf({ id: e.id, type: 'TEXT', layer: e.layer, props: attdefText(e.props), lineType: e.lineType, ltScale: e.ltScale }, layerName)
    case 'HATCH':
      return hatchDxf(e.props, h)
    case 'SHADE': {
      // Sombreado de una vista: un SOLID 2D por triángulo, con su color verdadero (420).
      const t = e.props.tris
      let out = ''
      for (let i = 0, k = 0; i + 8 < t.length; i += 9, k += 3) {
        const [r, g, b] = [0, 1, 2].map((j) => Math.round(Math.max(0, Math.min(1, e.props.colors[k + j] ?? 0.7)) * 255))
        const corner = (c: number, o: number) => p(10 + c, t[i + o]) + p(20 + c, t[i + o + 1]) + p(30 + c, t[i + o + 2])
        out += p(0, 'SOLID') + h + p(420, r * 65536 + g * 256 + b) + corner(0, 0) + corner(1, 3) + corner(2, 6) + corner(3, 6)
      }
      return out || null
    }
  }
}

/** Grupos 210/220/230 de la extrusión, sólo si no es la del mundo (+Z). */
function extrusion(n: Vec3): string {
  return isWorldExtrusion(n) ? '' : p(210, n[0]) + p(220, n[1]) + p(230, n[2])
}

function lwpolyline(
  verts: Array<[number, number]>,
  closed: boolean,
  head: string,
  bulges?: number[],
  elevation = 0,
  normal?: Vec3,
  widths?: Array<[number, number]>,
): string {
  let out = p(0, 'LWPOLYLINE') + head + p(90, verts.length) + p(70, closed ? 1 : 0)
  if (Math.abs(elevation) > 1e-12) out += p(38, elevation)
  // Ancho constante (43) o por vértice (40/41), .
  const constant = widths?.length && widths.every(([a, b]) => a === widths[0][0] && b === widths[0][0]) ? widths[0][0] : null
  if (constant) out += p(43, constant)
  if (normal) out += extrusion(normal)
  verts.forEach(([x, y], i) => {
    out += p(10, x) + p(20, y)
    if (widths && constant === null) {
      const w = widths[i] ?? [0, 0]
      if (w[0] || w[1]) out += p(40, w[0]) + p(41, w[1])
    }
    // Código 42: bulge del tramo que SALE de este vértice (se omite cuando el tramo es recto).
    const b = bulges?.[i]
    if (b !== undefined && isFinite(b) && Math.abs(b) > 1e-12) out += p(42, b)
  })
  return out
}

/**
 * Serializa entidades + layers a DXF ASCII. `currentLayer` (id) se escribe como `$CLAYER` en el
 * HEADER, para que el CAD clásico abra el dibujo en la misma capa de trabajo.
 */
export interface DxfLinetypeOptions {
  /** Tipos de línea cargados (tabla LTYPE). */
  linetypes?: LinetypeDefData[]
  /** Variables del dibujo ($LTSCALE, $CELTYPE, $CELTSCALE, $PSLTSCALE). */
  vars?: DrawingVars
}

export function exportDxf(entities: Entity[], layers: Layer[], currentLayer?: string, dimStyles?: DimStyleDef[], lt: DxfLinetypeOptions = {}): string {
  const nameById = new Map(layers.map((l) => [l.id, l.name]))
  const clayer = currentLayer ? nameById.get(currentLayer) : undefined
  const v = lt.vars ?? {}
  let hv = clayer ? p(9, '$CLAYER') + p(8, clayer) : ''
  if (v.LTSCALE !== undefined) hv += p(9, '$LTSCALE') + p(40, v.LTSCALE)
  if (v.CELTYPE !== undefined) hv += p(9, '$CELTYPE') + p(6, linetypeLabel(v.CELTYPE))
  if (v.CELTSCALE !== undefined) hv += p(9, '$CELTSCALE') + p(40, v.CELTSCALE)
  if (v.PSLTSCALE !== undefined) hv += p(9, '$PSLTSCALE') + p(70, v.PSLTSCALE)
  const header = hv ? p(0, 'SECTION') + p(2, 'HEADER') + hv + p(0, 'ENDSEC') : ''

  // Tabla LTYPE: ByBlock, ByLayer, Continuous y los cargados, con su patrón.
  const loaded = (lt.linetypes ?? []).filter((d) => d.name !== CONTINUOUS)
  const ltype = (name: string, desc: string, pattern: number[]): string => {
    let s = p(0, 'LTYPE') + p(2, name) + p(70, 0) + p(3, desc) + p(72, 65) + p(73, pattern.length) + p(40, patternLength(pattern))
    for (const x of pattern) s += p(49, x) + p(74, 0)
    return s
  }
  let tables = p(0, 'SECTION') + p(2, 'TABLES') + p(0, 'TABLE') + p(2, 'LTYPE') + p(70, loaded.length + 3)
  tables += ltype('ByBlock', '', []) + ltype('ByLayer', '', []) + ltype('Continuous', 'Solid line', [])
  for (const d of loaded) tables += ltype(d.name, d.description, d.pattern)
  tables += p(0, 'ENDTAB')
  tables += p(0, 'TABLE') + p(2, 'LAYER') + p(70, layers.length)
  for (const l of layers) {
    tables +=
      p(0, 'LAYER') +
      p(2, l.name) +
      p(70, (l.locked ? 4 : 0) | (l.frozen ? 1 : 0)) +
      p(62, l.visible ? hexToAci(l.color) : -hexToAci(l.color)) +
      p(420, hexToTruecolor(l.color)) +
      p(6, l.lineType.toUpperCase() === CONTINUOUS ? 'Continuous' : l.lineType) +
      p(370, Math.round(l.lineWeight * 100)) +
      p(290, l.printable ? 1 : 0) // plot flag: capa no imprimible
  }
  tables += p(0, 'ENDTAB')

  // Cotas nativas: DIMENSION + bloque *Dn + tabla DIMSTYLE.
  const dims = new DxfDimWriter(dimStyles)
  let ents = p(0, 'SECTION') + p(2, 'ENTITIES')
  for (const e of entities) {
    const layerName = nameById.get(e.layer) ?? '0'
    const dxf = (e.type === 'DIMENSION' ? dims.dimension(e, layerName) : null) ?? entityDxf(e, layerName)
    if (dxf) ents += dxf
  }
  ents += p(0, 'ENDSEC')
  tables += dims.table() + p(0, 'ENDSEC')

  return header + tables + dims.blocksSection() + ents + p(0, 'EOF')
}

// --- Import ---

export interface DxfLayerSpec {
  name: string
  color: string
  lineWeight: number
  lineType: LineType
  visible: boolean
  locked: boolean
  printable: boolean
  frozen: boolean
}

export interface DxfEntitySpec {
  type: EntityType
  layerName: string
  props: EntityProps
  /** Tipo de línea del objeto (código 6; ausente = ByLayer) y su escala (48). */
  lineType?: string
  ltScale?: number
  /** Color propio (62/420; ausente = ByLayer) y grosor en mm (370; ausente = ByLayer). */
  color?: string
  lineWeight?: number
}

export interface DxfImportResult {
  /** Capa actual del dibujo (`$CLAYER` del HEADER), si viene. */
  currentLayer?: string
  layers: DxfLayerSpec[]
  entities: DxfEntitySpec[]
  /** Estilos de cota de la tabla DIMSTYLE (las cotas importadas los referencian por nombre). */
  dimStyles: DimStyleDef[]
  /** Tipos de línea de la tabla LTYPE. */
  linetypes: LinetypeDefData[]
  /** Variables del HEADER: $LTSCALE, $CELTYPE, $CELTSCALE, $PSLTSCALE. */
  vars: DrawingVars
  /**
   * Vista con que se guardó el dibujo (VPORT `*Active`): centro y alto visibles en planta. El CAD clásico abre el
   * dibujo ahí; sin ella (o mirando en 3D, o girada) se encuadra todo.
   */
  view?: { center: [number, number]; height: number; aspect: number }
  unsupported: string[]
}

interface Rec {
  type: string
  codes: Array<[number, string]>
}

/**
 * Texto plano de un MTEXT: sin los códigos de formato (fuente, alto, color, ancho, apilado…), con sus saltos de
 * renglón y los caracteres escapados o Unicode (`\U+2205`).
 */
export function plainMtext(raw: string): string {
  return raw
    .replace(/\\U\+([0-9a-f]{4})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\[Pp]/g, '\n')
    .replace(/\\S([^;]*);/g, (_, s: string) => s.replace(/[#^]/, '/'))
    .replace(/\\[ACcFfHhQTWp][^;]*;/g, '')
    .replace(/\\[LlOoKkNX]/g, '')
    .replace(/\\~/g, ' ')
    .replace(/\\([\\{}])|[{}]/g, (_, e?: string) => e ?? '')
}

function num(codes: Array<[number, string]>, code: number, def = 0): number {
  const f = codes.find((c) => c[0] === code)
  return f ? Number(f[1]) : def
}
function str(codes: Array<[number, string]>, code: number): string | undefined {
  const f = codes.find((c) => c[0] === code)
  return f ? f[1].trim() : undefined
}

/** Parsea DXF ASCII a specs de layers/entidades. Robusto ante DXF malformado. */
export function importDxf(text: string): DxfImportResult {
  // Records por cada par (0, TYPE), recorriendo el texto de a dos líneas (código, valor) sin partirlo entero: con un
  // DXF de 20 MB, el arreglo de líneas y el de pares costaban más de 100 MB (en un teléfono, más de lo que hay).
  const records: Rec[] = []
  let cur: Rec | null = null
  let pos = 0
  const line = (): string | null => {
    if (pos >= text.length) return null
    let end = text.indexOf('\n', pos)
    if (end < 0) end = text.length
    const v = text.slice(pos, end > pos && text.charCodeAt(end - 1) === 13 ? end - 1 : end)
    pos = end + 1
    return v
  }
  for (;;) {
    const c = line()
    const val = line()
    if (c === null || val === null) break
    const code = parseInt(c.trim(), 10)
    if (Number.isNaN(code)) continue
    if (code === 0) {
      cur = { type: val.trim(), codes: [] }
      records.push(cur)
    } else if (cur) {
      cur.codes.push([code, val])
    }
  }

  const layers: DxfLayerSpec[] = []
  const entities: DxfEntitySpec[] = []
  const unsupported = new Set<string>()

  let section = ''
  let table = ''
  let currentLayer: string | undefined
  let view: DxfImportResult['view']
  const dimStyles: DimStyleDef[] = []
  const linetypes: LinetypeDefData[] = []
  const vars: DrawingVars = {}
  const dimStyleRecs: Rec[] = []
  /** Handle → nombre de BLOCK_RECORD (flechas de DIMSTYLE en R2000+). */
  const blockNames = new Map<string, string>()
  /** Definiciones de la sección BLOCKS (punto base + contenido) e inserciones a expandir. */
  const blocks = new Map<string, { base: Vec3; items: Array<{ spec?: DxfEntitySpec; insert?: Rec }> }>()
  let block: { base: Vec3; items: Array<{ spec?: DxfEntitySpec; insert?: Rec }> } | null = null
  const inserts: Rec[] = []
  /** Entidad común (tipo de línea por objeto incluido) de un record; null si no se soporta. */
  const specOf = (rec: Rec): DxfEntitySpec | null => {
    const spec = rec.type === 'HATCH' ? hatchSpec(rec) : rec.type === 'ATTRIB' ? parseEntity({ type: 'TEXT', codes: rec.codes }) : parseEntity(rec)
    if (!spec) return null
    const lt = str(rec.codes, 6)
    const lts = num(rec.codes, 48, 1)
    return {
      ...spec,
      layerName: str(rec.codes, 8) ?? '0',
      ...(lt && lt.toUpperCase() !== BYLAYER ? { lineType: lt.toUpperCase() } : {}),
      ...(lts !== 1 && lts > 0 ? { ltScale: lts } : {}),
      ...ownColorWeight(rec.codes),
    }
  }

  for (let r = 0; r < records.length; r++) {
    const rec = records[r]
    if (rec.type === 'SECTION') {
      section = str(rec.codes, 2) ?? ''
      if (section === 'HEADER') {
        // Las variables del HEADER viajan como pares 9/<valor> dentro del mismo record.
        const hv = (name: string): [number, string] | undefined => {
          const i = rec.codes.findIndex((c) => c[0] === 9 && c[1].trim() === name)
          return i >= 0 ? rec.codes[i + 1] : undefined
        }
        const v = hv('$CLAYER')
        if (v && v[0] === 8) currentLayer = v[1].trim()
        const lts = hv('$LTSCALE')
        if (lts && Number(lts[1]) > 0) vars.LTSCALE = Number(lts[1])
        const cel = hv('$CELTYPE')
        if (cel && cel[1].trim()) vars.CELTYPE = cel[1].trim().toUpperCase()
        const cels = hv('$CELTSCALE')
        if (cels && Number(cels[1]) > 0) vars.CELTSCALE = Number(cels[1])
        const ps = hv('$PSLTSCALE')
        if (ps) vars.PSLTSCALE = Number(ps[1]) ? 1 : 0
      }
      continue
    }
    if (rec.type === 'ENDSEC') {
      section = ''
      continue
    }
    if (rec.type === 'TABLE') {
      table = str(rec.codes, 2) ?? ''
      continue
    }
    if (rec.type === 'ENDTAB') {
      table = ''
      continue
    }
    if (table === 'BLOCK_RECORD' && rec.type === 'BLOCK_RECORD') {
      const h = str(rec.codes, 5)
      const name = str(rec.codes, 2)
      if (h && name !== undefined) blockNames.set(h.toUpperCase(), name)
      continue
    }
    if (table === 'DIMSTYLE' && rec.type === 'DIMSTYLE') {
      dimStyleRecs.push(rec) // se interpretan al final (las flechas R2000 referencian BLOCK_RECORD)
      continue
    }

    if (table === 'VPORT' && rec.type === 'VPORT') {
      // La vista activa del modelo: sólo en planta (dirección 0,0,1) y sin giro, que es lo que se puede reproducir.
      const dir = [num(rec.codes, 16, 0), num(rec.codes, 26, 0), num(rec.codes, 36, 1)]
      const height = num(rec.codes, 40, 0)
      const plan = Math.abs(dir[0]) < 1e-9 && Math.abs(dir[1]) < 1e-9 && dir[2] > 0 && Math.abs(num(rec.codes, 51, 0)) < 1e-9
      if ((str(rec.codes, 2) ?? '').toUpperCase() === '*ACTIVE' && !view && plan && height > 0 && isFinite(height)) {
        const center: [number, number] = [num(rec.codes, 12, 0), num(rec.codes, 22, 0)]
        const aspect = num(rec.codes, 41, 1)
        if (center.every((v) => isFinite(v))) view = { center, height, aspect: aspect > 0 && isFinite(aspect) ? aspect : 1 }
      }
      continue
    }

    if (table === 'LTYPE' && rec.type === 'LTYPE') {
      const name = (str(rec.codes, 2) ?? '').toUpperCase()
      if (name && name !== BYLAYER && name !== BYBLOCK && name !== CONTINUOUS) {
        // Sólo tipos simples (los complejos traen formas/texto: 74 ≠ 0): esos elementos se toman como huecos.
        const pattern = rec.codes.filter((c) => c[0] === 49).map((c) => Number(c[1]))
        linetypes.push({ name, description: str(rec.codes, 3) ?? '', pattern: pattern.filter((x) => isFinite(x)) })
      }
      continue
    }

    if (table === 'LAYER' && rec.type === 'LAYER') {
      const name = str(rec.codes, 2) ?? '0'
      const tc = rec.codes.find((c) => c[0] === 420)
      const aci = num(rec.codes, 62, 7)
      const color = tc ? truecolorToHex(Number(tc[1])) : aciToHex(Math.abs(aci) || 7)
      layers.push({
        name,
        color,
        lineWeight: Math.max(0, num(rec.codes, 370, 25)) / 100,
        lineType: toLineType(str(rec.codes, 6)),
        visible: aci >= 0,
        locked: (num(rec.codes, 70, 0) & 4) !== 0,
        frozen: (num(rec.codes, 70, 0) & 1) !== 0,
        printable: num(rec.codes, 290, 1) !== 0,
      })
      continue
    }

    if (section === 'BLOCKS') {
      if (rec.type === 'BLOCK') {
        const name = str(rec.codes, 2) ?? ''
        block = { base: [num(rec.codes, 10), num(rec.codes, 20), num(rec.codes, 30)], items: [] }
        // Los anónimos de cotas (*D), sombreados (*X) y espacios (*Model_Space, *Paper_Space) no se insertan a mano.
        if (!name.startsWith('*') || /^\*[UT]/i.test(name)) blocks.set(name.toUpperCase(), block)
      } else if (rec.type === 'ENDBLK') block = null
      else if (block && rec.type === 'INSERT') block.items.push({ insert: rec })
      else if (block && rec.type !== 'ATTDEF') {
        const spec = specOf(rec)
        if (spec) block.items.push({ spec })
      }
      continue
    }
    if (section !== 'ENTITIES') continue

    if (rec.type === 'INSERT') {
      inserts.push(rec)
      continue
    }
    if (rec.type === 'ATTRIB') {
      // Valores de los atributos de la inserción anterior: ya vienen en coordenadas del dibujo, como textos.
      const spec = specOf(rec)
      if (spec) entities.push(spec)
      continue
    }
    const layerName = str(rec.codes, 8) ?? '0'
    if (rec.type === 'DIMENSION') {
      const dim = parseDimension(rec.codes)
      if (dim) entities.push({ type: 'DIMENSION', layerName, props: { ...dim.props, styleName: dim.styleName } as unknown as EntityProps })
      else unsupported.add('DIMENSION (type)')
      continue
    }
    const spec = rec.type === 'HATCH' ? hatchSpec(rec) : parseEntity(rec)
    const lt = str(rec.codes, 6)
    const lts = num(rec.codes, 48, 1)
    if (spec)
      entities.push({
        ...spec,
        layerName,
        ...(lt && lt.toUpperCase() !== BYLAYER ? { lineType: lt.toUpperCase() } : {}),
        ...(lts !== 1 && lts > 0 ? { ltScale: lts } : {}),
        ...ownColorWeight(rec.codes),
      })
    else if (!['SEQEND', 'VERTEX'].includes(rec.type)) unsupported.add(rec.type)
  }

  // Bloques: cada inserción se expande a su geometría en el dibujo (anidadas incluidas). Lo que está en la capa 0
  // dentro del bloque toma la capa de la inserción, como en el CAD clásico.
  const insertOf = (rec: Rec): InsertProps => {
    const n: Vec3 = [num(rec.codes, 210, 0), num(rec.codes, 220, 0), num(rec.codes, 230, 1)]
    return {
      name: str(rec.codes, 2) ?? '',
      position: [num(rec.codes, 10), num(rec.codes, 20), num(rec.codes, 30)],
      scale: [num(rec.codes, 41, 1), num(rec.codes, 42, 1), num(rec.codes, 43, 1)],
      rotation: (num(rec.codes, 50, 0) * Math.PI) / 180,
      ...(Math.abs(n[2] - 1) > 1e-9 ? { normal: n } : {}),
    }
  }
  const shift = (b: Vec3): InsertProps => ({ name: '', position: [-b[0], -b[1], -b[2]], scale: [1, 1, 1], rotation: 0 })
  const expand = (rec: Rec, after: InsertProps[], layer: string, depth: number): void => {
    const def = blocks.get((str(rec.codes, 2) ?? '').toUpperCase())
    if (!def || depth > 8) {
      if (!def) unsupported.add('INSERT')
      return
    }
    const here = (str(rec.codes, 8) ?? '0') === '0' ? layer : (str(rec.codes, 8) ?? '0')
    const chain = [shift(def.base), insertOf(rec), ...after]
    for (const it of def.items) {
      if (it.insert) {
        expand(it.insert, chain, here, depth + 1)
        continue
      }
      let e = { id: '', type: it.spec!.type, layer: '', props: it.spec!.props } as unknown as Entity
      for (const t of chain) e = transformInsertEntity(e, t)
      // El tipo puede cambiar al transformar (un RECTANGLE girado o fuera de planta pasa a POLYLINE).
      entities.push({ ...it.spec!, type: e.type, props: e.props as EntityProps, layerName: it.spec!.layerName === '0' ? here : it.spec!.layerName })
    }
  }
  for (const rec of inserts) expand(rec, [], str(rec.codes, 8) ?? '0', 0)

  for (const r of dimStyleRecs) dimStyles.push(parseDimStyle(r.codes, blockNames))
  // Cada cota con las variables de su estilo (el documento las vuelve a resolver al agregar los estilos).
  for (const e of entities) {
    if (e.type !== 'DIMENSION') continue
    const dp = e.props as { styleName?: string; style?: unknown }
    dp.style = resolveDimVars(dimStyles.find((s) => s.name === dp.styleName)?.vars)
  }

  return { currentLayer, layers, entities, dimStyles, linetypes, vars, ...(view ? { view } : {}), unsupported: [...unsupported] }
}

function hatchSpec(rec: Rec): { type: EntityType; props: EntityProps } | null {
  const h = parseHatch(rec.codes)
  return h ? { type: 'HATCH', props: h } : null
}

/** Devuelve {corner,width,height} si los vértices forman un rectángulo alineado a los ejes; si no, null. */
function asRectangle(verts: Vec3[]): RectangleProps | null {
  if (verts.length !== 4) return null
  const xs = verts.map((v) => v[0])
  const ys = verts.map((v) => v[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const w = maxX - minX
  const h = maxY - minY
  if (w <= 1e-9 || h <= 1e-9) return null
  const corners = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ]
  // Cada vértice debe coincidir con una esquina distinta (en cualquier orden de recorrido).
  const eps = 1e-6 * Math.max(w, h)
  const used = new Set<number>()
  for (const [vx, vy] of verts) {
    const i = corners.findIndex(([cx, cy], k) => !used.has(k) && Math.abs(cx - vx) <= eps && Math.abs(cy - vy) <= eps)
    if (i < 0) return null
    used.add(i)
  }
  return { corner: [minX, minY, verts[0][2]], width: w, height: h }
}

/** Extrusión (210/220/230) de un registro; +Z si no está. */
function extrusionOf(c: Rec['codes']): Vec3 {
  return [num(c, 210, 0), num(c, 220, 0), num(c, 230, 1)]
}

function parseEntity(rec: Rec): { type: EntityType; props: EntityProps } | null {
  const c = rec.codes
  switch (rec.type) {
    case 'POINT':
      return { type: 'POINT', props: { position: [num(c, 10), num(c, 20), num(c, 30)] } }
    case 'LINE':
      return {
        type: 'LINE',
        props: {
          start: [num(c, 10), num(c, 20), num(c, 30)],
          end: [num(c, 11), num(c, 21), num(c, 31)],
        },
      }
    case 'CIRCLE': {
      // Centro en el OCS de la extrusión.
      const normal = extrusionOf(c)
      return {
        type: 'CIRCLE',
        props: { center: fromOcs([num(c, 10), num(c, 20), num(c, 30)], normal), radius: num(c, 40), normal },
      }
    }
    case 'ARC': {
      const normal = extrusionOf(c)
      const rad = (code: number) => normAngle(angleFromOcs((num(c, code) * Math.PI) / 180, normal))
      return {
        type: 'ARC',
        props: { center: fromOcs([num(c, 10), num(c, 20), num(c, 30)], normal), radius: num(c, 40), startAngle: rad(50), endAngle: rad(51), normal },
      }
    }
    case 'ELLIPSE': {
      const startParam = num(c, 41, 0)
      const endParam = num(c, 42, Math.PI * 2)
      const full = Math.abs(endParam - startParam - Math.PI * 2) < 1e-9
      return {
        type: 'ELLIPSE',
        props: {
          center: [num(c, 10), num(c, 20), num(c, 30)],
          major: [num(c, 11), num(c, 21), num(c, 31)],
          ratio: num(c, 40, 1),
          normal: [num(c, 210, 0), num(c, 220, 0), num(c, 230, 1)],
          // Sólo se guardan los parámetros si recortan la elipse (así los dibujos previos no cambian).
          ...(full ? {} : { startParam, endParam }),
        },
      }
    }
    case 'TEXT': {
      // Punto de la línea base: 10/20/30, o el de alineación 11/21/31 si el texto está justificado (72/73).
      const normal = extrusionOf(c)
      const h72 = num(c, 72)
      const v73 = num(c, 73)
      const aligned = (h72 === 1 || h72 === 2 || h72 === 4 || v73 > 0) && c.some(([code]) => code === 11)
      const height = num(c, 40, 2.5)
      const props: TextProps = {
        position: fromOcs(aligned ? [num(c, 11), num(c, 21), num(c, 31)] : [num(c, 10), num(c, 20), num(c, 30)], normal),
        text: decodeTextCodes(str(c, 1) ?? ''),
        height,
        rotation: angleFromOcs((num(c, 50) * Math.PI) / 180, normal),
        justify: aligned && (h72 === 1 || h72 === 4) ? 'center' : aligned && h72 === 2 ? 'right' : 'left',
        normal,
        kind: 'text',
      }
      // Arriba (73 = 3) o al medio (73 = 2, o 72 = 4 "Middle") del alto: se baja a la línea base.
      const down = !aligned ? 0 : v73 === 3 ? height : v73 === 2 || h72 === 4 ? height / 2 : 0
      if (down) {
        const { v } = textAxes(props)
        props.position = [0, 1, 2].map((i) => props.position[i] - v[i] * down) as Vec3
      }
      return { type: 'TEXT', props }
    }
    case 'MTEXT': {
      // El texto de MTEXT puede venir partido en códigos 3 (continuación) + 1 (final); \P = salto.
      const raw = c.filter(([code]) => code === 3 || code === 1).map(([, v]) => v).join('')
      const j71 = num(c, 71) || 1
      const text = decodeTextCodes(plainMtext(raw))
      const height = num(c, 40, 2.5)
      const rotation = c.some(([code]) => code === 50) || !c.some(([code]) => code === 11) ? (num(c, 50) * Math.PI) / 180 : Math.atan2(num(c, 21), num(c, 11, 1))
      const props: TextProps = {
        position: [num(c, 10), num(c, 20), num(c, 30)],
        text,
        height,
        rotation,
        justify: (['left', 'center', 'right'] as const)[(j71 - 1) % 3],
        normal: extrusionOf(c),
        kind: 'mtext',
      }
      // Anclado al medio o abajo (71 = 4…9): el punto de Cota es el de arriba.
      const row = Math.floor((j71 - 1) / 3)
      if (row > 0) {
        const up = (text.split('\n').length * height * LINE_SPACING * row) / 2
        const { v } = textAxes(props)
        props.position = [0, 1, 2].map((i) => props.position[i] + v[i] * up) as Vec3
      }
      return { type: 'TEXT', props }
    }
    case 'LWPOLYLINE': {
      const verts: Vec3[] = []
      const bulges: number[] = []
      const widths: Array<[number, number]> = []
      let x: number | null = null
      const z = num(c, 38) // elevación opcional
      const cw = num(c, 43, 0) // ancho constante
      for (const [code, val] of c) {
        if (code === 10) x = Number(val)
        else if (code === 20 && x !== null) {
          verts.push([x, Number(val), z])
          bulges.push(0)
          widths.push([cw, cw])
          x = null
        } else if (code === 42 && verts.length > 0) {
          // El bulge aparece después del vértice del que sale el tramo.
          bulges[verts.length - 1] = Number(val)
        } else if ((code === 40 || code === 41) && verts.length > 0) {
          widths[verts.length - 1][code - 40] = Number(val)
        }
      }
      const wide = widths.some(([a, b]) => a > 0 || b > 0)
      const closed = (num(c, 70) & 1) !== 0
      const curved = bulges.some((b) => isFinite(b) && Math.abs(b) > 1e-12)
      const normal = extrusionOf(c)
      const plan = isWorldExtrusion(normal)
      // Un polígono cerrado de 4 vértices rectos alineado a los ejes (en planta) vuelve a ser RECTANGLE.
      if (closed && !curved && plan && !wide) {
        const rect = asRectangle(verts)
        if (rect) return { type: 'RECTANGLE', props: rect }
      }
      // Vértices del OCS al mundo.
      const world = plan ? verts : verts.map((v) => fromOcs(v, normal))
      return { type: 'POLYLINE', props: { vertices: world, closed, ...(curved ? { bulges } : {}), ...(plan ? {} : { normal }), ...(wide ? { widths } : {}) } }
    }
    case 'SPLINE': {
      const cps: Vec3[] = []
      let x: number | null = null
      let y: number | null = null
      for (const [code, val] of c) {
        if (code === 10) x = Number(val)
        else if (code === 20) y = Number(val)
        else if (code === 30 && x !== null && y !== null) {
          cps.push([x, y, Number(val)])
          x = null
          y = null
        }
      }
      return { type: 'SPLINE', props: { controlPoints: cps, degree: num(c, 71, 3) } }
    }
    default:
      return null
  }
}
