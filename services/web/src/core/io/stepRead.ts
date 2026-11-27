import type { LabelTag, OcctKernel, ShapeHandle, XCAFDocument } from 'occt-wasm'
import type { BrepProps, EntityProps, InsertProps } from '../document/types'
import type { Vec3 } from '../math'
import { brepRef } from '../document/brepStore'
import { arcBasis } from '../geom/arc'
import { affineDet, type Affine } from '../geom/affine'
import type { DxfBlockSpec, DxfEntitySpec, DxfImportResult } from './dxf'
import type { BrepDisplay, ImportedBrep } from './importedBrep'

/**
 * STEP exacto: el árbol de ensamble del archivo (documento XCAF de OpenCascade) con cada pieza como su modelo exacto
 * (BREP binario de OpenCascade), en la misma forma que deja la lectura de un DWG: bloques con nombre para las piezas y
 * los subensambles, inserciones para sus instancias y sólidos importados (hojas `BREP`) con lo que se dibuja mientras
 * el núcleo no los calcula. Así abrir e importar un STEP usa el mismo camino que un DWG.
 */

const IDENTITY: Affine = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]
/** Teselado de lo que se dibuja: como el del núcleo (relativo a la pieza); en un teléfono, más grueso. */
const REL_DEFLECTION = 0.001
const ANGULAR_DEFLECTION = 0.2
/** Caracteres que un nombre de bloque de DWG no admite. */
const BAD_NAME = /[<>/\\":;?*|=,`]/g
/** Cota de los hashes de aristas (como en el núcleo). */
const HASH_BOUND = 2 ** 31 - 1

export interface StepReadOptions {
  /** Malla más gruesa (teléfonos). */
  light?: boolean
  /** Capa de lo que se trae (por nombre); por defecto la «0». */
  layer?: string
  /** Unidades del dibujo por milímetro (el núcleo lee el STEP en mm): todo se escala así al ubicarlo. */
  scale?: number
}

export interface StepReadResult extends DxfImportResult {
  /** Modelos distintos (una pieza repetida es uno), sólidos en el dibujo (contando cada instancia) e inserciones. */
  stats: { models: number; solids: number; inserts: number }
}

/** Composición de dos matrices afines (a · b). */
function compose(a: Affine, b: Affine): Affine {
  const out = new Array<number>(12)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) out[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c]
    out[r * 4 + 3] = a[r * 4] * b[3] + a[r * 4 + 1] * b[7] + a[r * 4 + 2] * b[11] + a[r * 4 + 3]
  }
  return out as Affine
}

const isIdentity = (m: Affine): boolean => m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-12)

/**
 * Una matriz rígida (o una semejanza, con simetría o sin ella) como una inserción: punto, normal, giro en su plano y
 * escala (Z negativa en una simetría). null si no es una semejanza (no la puede tener una inserción de sólidos).
 */
export function insertOfMatrix(m: Affine): Pick<InsertProps, 'position' | 'scale' | 'rotation' | 'normal'> | null {
  const col = (c: number): Vec3 => [m[c], m[4 + c], m[8 + c]]
  const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
  const det = affineDet(m)
  const k = Math.cbrt(Math.abs(det))
  if (!(k > 1e-12)) return null
  const cols = [col(0), col(1), col(2)]
  if (cols.some((v) => Math.abs(len(v) - k) > 1e-9 * k)) return null
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  if (Math.abs(dot(cols[0], cols[1])) > 1e-9 * k * k || Math.abs(dot(cols[0], cols[2])) > 1e-9 * k * k || Math.abs(dot(cols[1], cols[2])) > 1e-9 * k * k) return null
  const sz = det < 0 ? -k : k
  // La parte propia: R = M · diag(1, 1, ±1) / k; su Z es la normal y su X la dirección del giro.
  const x: Vec3 = cols[0].map((v) => v / k) as Vec3
  const n: Vec3 = cols[2].map((v) => v / sz) as Vec3
  const b = arcBasis(n)
  const rotation = Math.atan2(dot(x, b.v), dot(x, b.u))
  const plan = Math.abs(n[0]) < 1e-12 && Math.abs(n[1]) < 1e-12 && n[2] > 0
  return { position: [m[3], m[7], m[11]], scale: [k, k, sz], rotation, ...(plan ? {} : { normal: n }) }
}

const hex = (c: [number, number, number]): string =>
  '#' +
  c
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')

/** Lo que se dibuja de una forma: su malla (una cara del modelo por grupo de triángulos) y sus aristas. */
function displayOf(k: OcctKernel, shape: ShapeHandle, diag: number, light: boolean, solid: boolean): BrepDisplay {
  const m = k.meshShape(shape, { linearDeflection: diag * REL_DEFLECTION * (light ? 4 : 1), angularDeflection: ANGULAR_DEFLECTION * (light ? 2 : 1) })
  const pos = Float64Array.from(m.positions)
  const tri = Uint32Array.from(m.indices)
  const faceOf = new Uint32Array(m.triangleCount)
  const g = m.faceGroups ?? new Int32Array()
  for (let i = 0; i + 2 < g.length; i += 3) faceOf.fill(i / 3, g[i] / 3, (g[i] + g[i + 1]) / 3)
  const wf = k.wireframe(shape, { source: 'triangulation' })
  // En un sólido, una arista de una sola cara es una costura (la de un cilindro): no se dibuja.
  const faces = new Map<number, number>()
  const map = solid ? k.edgeToFaceMap(shape, HASH_BOUND) : []
  for (let i = 0; i + 1 < map.length; i += 2 + map[i + 1]) faces.set(map[i], new Set(map.slice(i + 2, i + 2 + map[i + 1])).size)
  const counts: number[] = []
  const pts: number[] = []
  for (let i = 0; i + 2 < wf.edgeGroups.length; i += 3) {
    const [start, count, hash] = [wf.edgeGroups[i], wf.edgeGroups[i + 1], wf.edgeGroups[i + 2]]
    if (count < 6 || (solid && (faces.get(hash) ?? 0) < 2)) continue
    counts.push(count / 3)
    for (let j = start; j < start + count; j++) pts.push(wf.points[j])
  }
  return { pos, tri, faceOf, wireCounts: Uint32Array.from(counts), wirePts: Float64Array.from(pts) }
}

/**
 * Lee un STEP con el núcleo: bloques por pieza y por subensamble, inserciones por instancia, sólidos `BREP` por cada
 * sólido de una pieza (o una lámina, si la pieza no tiene sólidos). Un archivo de una sola pieza la trae suelta.
 */
export function readStepExact(k: OcctKernel, text: string, opts: StepReadOptions = {}): StepReadResult {
  const layer = opts.layer ?? '0'
  const doc: XCAFDocument = k.importXCAFFromSTEP(text)
  try {
    const breps: Record<string, ImportedBrep> = {}
    const blocks: DxfBlockSpec[] = []
    /** Nombre de bloque por definición (ya armada). */
    const blockOf = new Map<number, string>()
    const used = new Set<string>()
    let unnamed = 0
    const uniqueName = (raw: string, fallback: string): string => {
      const base = raw.replace(BAD_NAME, '_').trim() || `${fallback} ${++unnamed}`
      let name = base
      for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i})`
      used.add(name.toLowerCase())
      return name
    }
    /** Sólidos de una pieza (sin su ubicación), como hojas `BREP`. */
    const pieceSpecs = (shape: ShapeHandle, color: string | undefined): DxfEntitySpec[] => {
      const found = k.getSubShapes(shape, 'solid')
      // Sin sólidos, sus caras como una lámina (REGION o superficie).
      const list = found.length ? found : k.subShapeCount(shape, 'face') ? [shape] : []
      const out: DxfEntitySpec[] = []
      for (const s of list) {
        const bytes = k.toBREPBinary(s)
        const ref = brepRef(bytes, 'brep')
        let brep = breps[ref]
        if (!brep) {
          const bb = k.getBoundingBox(s)
          const box: [Vec3, Vec3] = [
            [bb.xmin, bb.ymin, bb.zmin],
            [bb.xmax, bb.ymax, bb.zmax],
          ]
          const diag = Math.hypot(bb.xmax - bb.xmin, bb.ymax - bb.ymin, bb.zmax - bb.zmin) || 1
          brep = breps[ref] = { fmt: 'brep', bytes, box, display: displayOf(k, s, diag, !!opts.light, found.length > 0) }
        }
        out.push({ type: 'SOLID3D', layerName: layer, props: { op: 'BREP', ref, box: brep.box } as EntityProps, ...(color ? { color } : {}) })
      }
      return out
    }
    const info = (t: LabelTag) => doc.getLabelInfo(t)
    const colorOf = (t: LabelTag): string | undefined => {
      const i = info(t)
      return i.hasColor ? hex(i.color) : undefined
    }
    /** Contenido de una definición (pieza o ensamble) en sus coordenadas. */
    const contents = (def: LabelTag): DxfEntitySpec[] => {
      const i = info(def)
      if (i.isAssembly) return doc.getChildren(def).flatMap((c) => instance(c, IDENTITY))
      return i.shapeHandle ? pieceSpecs(i.shapeHandle, colorOf(def)) : []
    }
    /** El bloque de una definición (se arma una vez; las instancias lo comparten). */
    const blockFor = (def: LabelTag, instanceName: string): string => {
      const have = blockOf.get(def)
      if (have) return have
      const i = info(def)
      // El nombre del producto; uno genérico (el que pone OpenCascade a una forma sin nombre), el de la instancia.
      const own = /^(SOLID|SHELL|COMPOUND|FACE|SHAPE|ASSEMBLY)?$/i.test(i.name.trim()) ? instanceName.replace(/:\d+$/, '') : i.name
      const name = uniqueName(own, i.isAssembly ? 'Assembly' : 'Part')
      blockOf.set(def, name)
      blocks.push({ name, entities: contents(def) })
      return name
    }
    /** Una instancia (componente) dentro de su padre, con la ubicación acumulada de los niveles que no son bloques. */
    const instance = (comp: LabelTag, outer: Affine): DxfEntitySpec[] => {
      const def = doc.getReferredLabel(comp)
      if (def == null) return []
      const m = compose(outer, doc.getLocation(comp) as Affine)
      const place = insertOfMatrix(m)
      if (!place) return [] // una ubicación que no es una semejanza: no la trae STEP
      const name = blockFor(def, info(comp).name)
      const color = colorOf(comp)
      return [{ type: 'INSERT', layerName: layer, props: { name, ...place } as EntityProps, ...(color ? { color } : {}) }]
    }
    const entities: DxfEntitySpec[] = []
    const roots = doc.getRoots()
    const f = opts.scale ?? 1
    const S: Affine = [f, 0, 0, 0, 0, f, 0, 0, 0, 0, f, 0]
    for (const r of roots) {
      const i = info(r)
      const m = compose(S, doc.getLocation(r) as Affine)
      if (i.isAssembly) {
        // La raíz es el dibujo: sus componentes van al espacio modelo.
        for (const c of doc.getChildren(r)) entities.push(...instance(c, m))
      } else if (roots.length === 1 && isIdentity(doc.getLocation(r) as Affine)) {
        // Un archivo de una sola pieza: la pieza suelta (con la escala de las unidades, si hace falta).
        if (i.shapeHandle) for (const e of pieceSpecs(i.shapeHandle, colorOf(r))) entities.push(f === 1 ? e : { ...e, props: { ...(e.props as BrepProps), m: S } as EntityProps })
      } else {
        const place = insertOfMatrix(m)
        if (!place) continue
        entities.push({ type: 'INSERT', layerName: layer, props: { name: blockFor(r, i.name), ...place } as EntityProps })
      }
    }
    // Sólidos en el dibujo: los de cada bloque, tantas veces como se inserta.
    const inBlock = new Map<string, number>()
    const byName = new Map(blocks.map((b) => [b.name, b]))
    const count = (list: DxfEntitySpec[]): number =>
      list.reduce((n, e) => {
        if (e.type === 'SOLID3D') return n + 1
        if (e.type !== 'INSERT') return n
        const name = (e.props as InsertProps).name
        let c = inBlock.get(name)
        if (c === undefined) inBlock.set(name, (c = count(byName.get(name)?.entities ?? [])))
        return n + c
      }, 0)
    const inserts = entities.filter((e) => e.type === 'INSERT').length + blocks.reduce((n, b) => n + b.entities.filter((e) => e.type === 'INSERT').length, 0)
    return {
      layers: [],
      entities,
      dimStyles: [],
      linetypes: [],
      vars: {},
      unsupported: [],
      ...(blocks.length ? { blocks } : {}),
      ...(Object.keys(breps).length ? { breps } : {}),
      stats: { models: Object.keys(breps).length, solids: count(entities), inserts },
    }
  } finally {
    doc.close()
  }
}
