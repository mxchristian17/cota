import type { DocumentData, Entity, ImageProps, MeshProps } from './types'

/** Listas de entidades de un dibujo: el modelo, cada hoja y cada bloque. */
const listsOf = (d: DocumentData): Entity[][] => [d.entities ?? [], ...(d.layouts ?? []).map((l) => l.entities ?? []), ...(d.blocks ?? []).map((b) => b.entities ?? [])]

/** Las mallas de unas listas, en orden. */
const meshesOf = (lists: Entity[][]): MeshProps[] => {
  const out: MeshProps[] = []
  for (const list of lists) for (const e of list) if (e.type === 'MESH3D' && e.props?.vertices) out.push(e.props)
  return out
}

/** Las imágenes con sus píxeles adjuntos, en orden. */
const imagesOf = (lists: Entity[][]): ImageProps[] => {
  const out: ImageProps[] = []
  for (const list of lists) for (const e of list) if (e.type === 'IMAGE' && e.props?.data) out.push(e.props)
  return out
}

/**
 * Copia profunda de un dibujo que comparte los vértices y las caras de las mallas (MESH3D) con el original. Cada paso
 * de deshacer guarda una copia del dibujo: en un ensamble 3D grande las mallas son casi todo su peso (cientos de MB) y
 * copiarlas en cada comando agotaba la memoria de un teléfono. Las ediciones de una malla reemplazan esas listas (no
 * las modifican en el lugar), así que compartirlas es seguro.
 */
export function cloneDocument(d: DocumentData): DocumentData {
  const lists = listsOf(d)
  const images = imagesOf(lists)
  return withImagesShared(images, () => withMeshesShared(meshesOf(lists), () => plainClone(d), (copy) => meshesOf(listsOf(copy))), (copy) => imagesOf(listsOf(copy)))
}

/** Más hondo que esto (un sólido con cientos de operaciones anidadas o una referencia circular) copia structuredClone. */
const MAX_DEPTH = 500

class NotPlain extends Error {}

/**
 * Copia profunda de datos simples (objetos literales, listas y valores), igual a la de structuredClone y unas tres veces
 * más rápida: cada comando que cambia el dibujo guarda una copia para deshacer, y en un dibujo con decenas de miles de
 * textos eso demoraba cada comando. Con cualquier otra cosa (Map, Date, arreglos tipados, una referencia circular) copia
 * structuredClone. Un objeto referido desde dos lugares queda copiado en cada uno, como al guardar y abrir el dibujo.
 */
export function plainClone<T>(v: T): T {
  try {
    return copyPlain(v, 0) as T
  } catch (err) {
    if (err instanceof NotPlain) return structuredClone(v)
    throw err
  }
}

function copyPlain(v: unknown, depth: number): unknown {
  if (typeof v !== 'object' || v === null) {
    if (typeof v === 'function' || typeof v === 'symbol') throw new NotPlain()
    return v
  }
  if (depth > MAX_DEPTH) throw new NotPlain()
  if (Array.isArray(v)) {
    const n = v.length
    const out = new Array<unknown>(n)
    for (let i = 0; i < n; i++) out[i] = copyPlain(v[i], depth + 1)
    return out
  }
  const proto = Object.getPrototypeOf(v)
  if (proto !== Object.prototype && proto !== null) throw new NotPlain()
  const src = v as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(src)) out[k] = copyPlain(src[k], depth + 1)
  return out
}

/** Copia profunda de una entidad que comparte sus vértices y caras si es una malla (o sus píxeles si es una imagen). */
export function cloneEntity<E extends Entity>(e: E): E {
  if (e.type === 'IMAGE' && e.props?.data) return withImagesShared([e.props], () => structuredClone(e), (copy) => [copy.props as ImageProps])
  if (e.type !== 'MESH3D' || !e.props?.vertices) return structuredClone(e)
  return withMeshesShared([e.props], () => structuredClone(e), (copy) => [copy.props as MeshProps])
}

/** Igual para los píxeles de las imágenes (megas de texto que nunca se modifican en el lugar). */
function withImagesShared<T>(images: ImageProps[], clone: () => T, imagesOfCopy: (copy: T) => ImageProps[]): T {
  if (!images.length) return clone()
  const held = images.map((p) => p.data)
  for (const p of images) p.data = '-'
  let copy: T
  try {
    copy = clone()
  } finally {
    images.forEach((p, i) => (p.data = held[i]))
  }
  imagesOfCopy(copy).forEach((p, i) => (p.data = held[i]))
  return copy
}

function withMeshesShared<T>(meshes: MeshProps[], clone: () => T, meshesOfCopy: (copy: T) => MeshProps[]): T {
  const held = meshes.map((p) => [p.vertices, p.faces] as const)
  for (const p of meshes) {
    p.vertices = []
    p.faces = []
  }
  let copy: T
  try {
    copy = clone()
  } finally {
    meshes.forEach((p, i) => ([p.vertices, p.faces] = held[i]))
  }
  meshesOfCopy(copy).forEach((p, i) => ([p.vertices, p.faces] = held[i]))
  return copy
}
