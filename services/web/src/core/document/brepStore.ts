import { deflateSync, inflateSync } from 'fflate'
import { LruCache } from '../lru'
import type { BrepBytes, BrepModel, BrepProps, BrepSource, DocumentData, Entity, SolidProps } from './types'
import type { BrepDisplay, ImportedBrep } from '../io/importedBrep'

/**
 * Modelos exactos de los sólidos importados (hojas `BREP`). En el dibujo van comprimidos y en base64
 * (`DocumentData.breps`), por un `ref` que es el hash de su contenido: el mismo modelo en dos dibujos tiene el mismo
 * `ref`, así que la sesión los registra todos juntos (lo hace `DocumentModel` al abrir y al agregar) y quien dibuja o
 * pide el núcleo exacto los busca acá sin conocer el dibujo.
 */

const models = new Map<string, BrepModel>()
/** Bytes ya descomprimidos (para la malla de respaldo). */
const decoded = new LruCache<string, Uint8Array>(512)
/**
 * Lo recién importado que todavía no llegó comprimido: sus bytes. El hilo de lectura los comprime después de mandar el
 * dibujo (comprimir 40 MB tarda más de un segundo); si antes hace falta el modelo comprimido (guardar, copiar), se
 * comprime en el momento.
 */
const raw = new Map<string, BrepBytes>()
/** Lo que se dibuja de cada sólido importado mientras no lo calcula el núcleo (la malla de la importación). */
const displays = new Map<string, BrepDisplay>()

/** Base64 de unos bytes (por tramos: `String.fromCharCode` con millones de argumentos desborda la pila). */
export function toBase64(b: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(bin)
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Hash de 53 bits (cyrb53) de unos bytes con una semilla. */
function cyrb53(b: Uint8Array, seed: number): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < b.length; i++) {
    const c = b[i]
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** `ref` de un modelo: formato, largo y dos hashes de 53 bits de sus bytes (sin comprimir). */
export function brepRef(bytes: Uint8Array, fmt: BrepModel['fmt']): string {
  return `${fmt}-${bytes.length.toString(36)}-${cyrb53(bytes, 1).toString(36)}${cyrb53(bytes, 2).toString(36)}`
}

/** El modelo comprimido de unos bytes, con su `ref`. */
export function encodeBrep(bytes: Uint8Array, fmt: BrepModel['fmt']): { ref: string; model: BrepModel } {
  return { ref: brepRef(bytes, fmt), model: { fmt, data: toBase64(deflateSync(bytes, { level: 6 })) } }
}

export const decodeBrep = (model: BrepModel): Uint8Array => inflateSync(fromBase64(model.data))

/** Registra modelos (los de un dibujo que se abre, se pega o se agrega, y los que llegan comprimidos). */
export function registerBreps(rec: Record<string, BrepModel> | undefined): void {
  if (!rec) return
  for (const [ref, m] of Object.entries(rec)) {
    if (models.has(ref)) continue
    models.set(ref, m)
    const r = raw.get(ref)
    if (r) {
      raw.delete(ref)
      decoded.set(ref, r.bytes)
    }
  }
}

/** Registra lo importado de un DWG/DXF: los bytes de cada modelo (sin comprimir) y lo que se dibuja. */
export function registerImportedBreps(rec: Record<string, ImportedBrep> | undefined): void {
  if (!rec) return
  for (const [ref, b] of Object.entries(rec)) {
    if (!models.has(ref) && !raw.has(ref)) raw.set(ref, { fmt: b.fmt, bytes: b.bytes })
    if (!displays.has(ref)) displays.set(ref, b.display)
  }
}

/** Lo que se dibuja de un sólido importado, si ya está (ver `registerImportedBreps`). */
export const brepDisplay = (ref: string): BrepDisplay | undefined => displays.get(ref)

/** Guarda lo que se dibuja de un modelo (calculado aparte, al abrir un dibujo guardado). */
export function registerBrepDisplay(ref: string, d: BrepDisplay): void {
  displays.set(ref, d)
}

/** ¿Hay modelo para este `ref` (comprimido o no)? */
export const hasBrep = (ref: string): boolean => models.has(ref) || raw.has(ref)

/** Modelos que todavía no se comprimieron. */
export const uncompressedBreps = (): string[] => [...raw.keys()]

/** El modelo comprimido; lo importado que todavía no lo está se comprime ahora. */
export function brepModel(ref: string): BrepModel | undefined {
  const m = models.get(ref)
  if (m) return m
  const r = raw.get(ref)
  if (!r) return undefined
  const { model } = encodeBrep(r.bytes, r.fmt)
  registerBreps({ [ref]: model })
  return model
}

/** El modelo tal como lo lee el núcleo (comprimido o, si todavía no lo está, sus bytes), sin comprimirlo. */
export const brepSource = (ref: string): BrepSource | undefined => models.get(ref) ?? raw.get(ref)

/** El formato del modelo, sin comprimirlo. */
export const brepFormat = (ref: string): BrepModel['fmt'] | undefined => models.get(ref)?.fmt ?? raw.get(ref)?.fmt

/** Bytes del modelo (descomprimidos, con caché); null si no está registrado o no se puede leer. */
export function brepBytes(ref: string): Uint8Array | null {
  const hit = decoded.get(ref) ?? raw.get(ref)?.bytes
  if (hit) return hit
  const m = models.get(ref)
  if (!m) return null
  try {
    const b = decodeBrep(m)
    decoded.set(ref, b)
    return b
  } catch {
    return null
  }
}

/** Hojas `BREP` de un árbol de sólido. */
export function brepLeaves(p: SolidProps, out: BrepProps[] = []): BrepProps[] {
  switch (p.op) {
    case 'BREP':
      out.push(p)
      break
    case 'SHELL':
    case 'FILLETEDGE':
    case 'CHAMFEREDGE':
      brepLeaves(p.solid, out)
      break
    case 'UNION':
    case 'SUBTRACT':
    case 'INTERSECT':
      for (const o of p.operands) brepLeaves(o, out)
      break
  }
  return out
}

/** Los modelos que usa un árbol, comprimidos, para mandarlos con él (al portapapeles, a otro dibujo). */
export function brepsOf(trees: SolidProps[]): Record<string, BrepModel> | undefined {
  const out: Record<string, BrepModel> = {}
  for (const t of trees)
    for (const l of brepLeaves(t)) {
      const m = out[l.ref] ? undefined : brepModel(l.ref)
      if (m) out[l.ref] = m
    }
  return Object.keys(out).length ? out : undefined
}

/** Los modelos que usa un árbol tal como los lee el núcleo: lo que todavía no se comprimió va sin comprimir. */
export function brepSourcesOf(trees: SolidProps[]): Record<string, BrepSource> | undefined {
  const out: Record<string, BrepSource> = {}
  for (const t of trees)
    for (const l of brepLeaves(t)) {
      const m = out[l.ref] ? undefined : brepSource(l.ref)
      if (m) out[l.ref] = m
    }
  return Object.keys(out).length ? out : undefined
}

/** Árboles de sólido de unas entidades. */
export const solidTrees = (entities: Array<Pick<Entity, 'type' | 'props'>>): SolidProps[] => entities.filter((e) => e.type === 'SOLID3D').map((e) => e.props as SolidProps)

/** `ref` que usa el dibujo: el modelo, los layouts y los bloques. */
export function usedBrepRefs(d: DocumentData): Set<string> {
  const used = new Set<string>()
  const lists = [d.entities ?? [], ...(d.layouts ?? []).map((l) => l.entities ?? []), ...(d.blocks ?? []).map((b) => b.entities ?? [])]
  for (const list of lists) for (const t of solidTrees(list)) for (const l of brepLeaves(t)) used.add(l.ref)
  return used
}

/**
 * El dibujo con los modelos que usa y sin los demás (lo que se guarda); no toca `d`. Los modelos salen del dibujo o,
 * los importados en esta sesión, del registro.
 */
export function withUsedBreps(d: DocumentData): DocumentData {
  const used = usedBrepRefs(d)
  if (!d.breps && !used.size) return d
  const kept: Record<string, BrepModel> = {}
  for (const ref of used) {
    const m = d.breps?.[ref] ?? brepModel(ref)
    if (m) kept[ref] = m
  }
  const { breps: _all, ...rest } = d
  void _all
  return Object.keys(kept).length ? { ...rest, breps: kept } : rest
}

/** El dibujo sin modelos (lo que va a la IA, que no los lee); no toca `d`. */
export function withoutBreps(d: DocumentData): DocumentData {
  if (!d.breps) return d
  const { breps: _all, ...rest } = d
  void _all
  return rest
}
