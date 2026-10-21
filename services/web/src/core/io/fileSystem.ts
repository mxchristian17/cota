import { DRAWING_EXT, DRAWING_EXTS, drawingFileName, extensionOf, folderSegments, joinPath, stripExtension } from './paths'

/**
 * Acceso a una **carpeta real del sistema** con la File System Access API.
 *
 * El usuario elige una carpeta una sola vez; a partir de ahí Cota abre y guarda los dibujos ahí
 * mismo (como draw.io). El navegador conserva el permiso mientras dure la pestaña y, tras recargar,
 * hace falta un gesto del usuario para recuperarlo (`ensurePermission`).
 *
 * Sólo se usan tipos estructurales propios: los `FileSystemDirectoryHandle` del DOM varían entre
 * versiones de TypeScript y así el módulo queda testeable con un sistema de archivos en memoria.
 */
export interface FsFileHandle {
  kind: 'file'
  name: string
  getFile(): Promise<{ text(): Promise<string>; lastModified: number }>
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
  queryPermission?(opts?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(opts?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
}

export interface FsDirHandle {
  kind: 'directory'
  name: string
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FsDirHandle>
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsFileHandle>
  removeEntry?(name: string, opts?: { recursive?: boolean }): Promise<void>
  values(): AsyncIterable<FsDirHandle | FsFileHandle>
  queryPermission?(opts?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(opts?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
}

/** Un dibujo encontrado en la carpeta de trabajo. */
export interface LocalDrawing {
  /** Ruta relativa completa, p. ej. `proyecto/planos/pieza.cota`. */
  path: string
  /** Subcarpeta ("" = raíz). */
  folder: string
  /** Nombre sin extensión. */
  name: string
  ext: string
  lastModified: number
}

/** Extensiones que el diálogo de apertura muestra. */
export const OPENABLE_EXT = [...DRAWING_EXTS, '.dxf']

/** Profundidad máxima al recorrer la carpeta (evita árboles enormes). */
const MAX_DEPTH = 4

type PickerWindow = Window & {
  showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<FsDirHandle>
}

/** ¿El navegador soporta elegir una carpeta del sistema? (Chrome/Edge sí; Firefox/Safari no). */
export function fsaSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function'
}

/** Abre el selector de carpeta del sistema. Devuelve `null` si el usuario cancela. */
export async function pickWorkspace(): Promise<FsDirHandle | null> {
  const picker = (window as PickerWindow).showDirectoryPicker
  if (!picker) return null
  try {
    return await picker({ mode: 'readwrite', id: 'cota-workspace' })
  } catch {
    return null // el usuario canceló el diálogo
  }
}

/**
 * Asegura el permiso sobre un handle. Tras recargar la página el permiso queda en `prompt` y hay que
 * volver a pedirlo **desde un gesto del usuario**.
 */
export async function ensurePermission(
  handle: FsDirHandle | FsFileHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<boolean> {
  if (!handle.queryPermission) return true // entorno sin API de permisos (tests)
  if ((await handle.queryPermission({ mode })) === 'granted') return true
  if (!handle.requestPermission) return false
  return (await handle.requestPermission({ mode })) === 'granted'
}

/** Permiso actual sin pedirlo (para saber si hace falta "Reconectar"). */
export async function permissionState(
  handle: FsDirHandle | FsFileHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<PermissionState> {
  if (!handle.queryPermission) return 'granted'
  return handle.queryPermission({ mode })
}

/** Recorre la carpeta (y subcarpetas) devolviendo los dibujos abribles, ordenados por ruta. */
export async function listDrawings(dir: FsDirHandle): Promise<LocalDrawing[]> {
  const out: LocalDrawing[] = []
  const walk = async (handle: FsDirHandle, folder: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) return
    for await (const entry of handle.values()) {
      if (entry.kind === 'directory') {
        if (entry.name.startsWith('.')) continue // carpetas ocultas (.git, .trash…)
        await walk(entry, joinPath(folder, entry.name), depth + 1)
        continue
      }
      const ext = extensionOf(entry.name)
      if (!OPENABLE_EXT.includes(ext)) continue
      let lastModified = 0
      try {
        lastModified = (await entry.getFile()).lastModified
      } catch {
        /* archivo ilegible: se lista igual, sin fecha */
      }
      out.push({
        path: joinPath(folder, entry.name),
        folder,
        name: stripExtension(entry.name),
        ext,
        lastModified,
      })
    }
  }
  await walk(dir, '', 0)
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

/** Resuelve (y opcionalmente crea) el handle de `folder/name.ext` dentro de la carpeta de trabajo. */
export async function fileHandleAt(
  dir: FsDirHandle,
  folder: string,
  fileName: string,
  opts: { create?: boolean } = {},
): Promise<FsFileHandle | null> {
  let current = dir
  for (const segment of folderSegments(folder)) {
    try {
      current = await current.getDirectoryHandle(segment, { create: opts.create })
    } catch {
      return null // la subcarpeta no existe y no se pidió crearla
    }
  }
  try {
    return await current.getFileHandle(fileName, { create: opts.create })
  } catch {
    return null
  }
}

/** Nombres (sin extensión) de los archivos `exts` de una subcarpeta, sin recorrer más abajo; vacío si no existe. */
export async function listFilesIn(dir: FsDirHandle, folder: string, exts: string | string[]): Promise<string[]> {
  let current = dir
  try {
    for (const segment of folderSegments(folder)) current = await current.getDirectoryHandle(segment)
  } catch {
    return []
  }
  const out: string[] = []
  for await (const entry of current.values()) {
    const ext = entry.kind === 'file' ? [exts].flat().find((e) => entry.name.toLowerCase().endsWith(e)) : undefined
    if (ext) out.push(entry.name.slice(0, -ext.length))
  }
  return out.sort((a, b) => a.localeCompare(b))
}

export async function readTextFile(handle: FsFileHandle): Promise<string> {
  const file = await handle.getFile()
  return file.text()
}

export async function writeTextFile(handle: FsFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

/** Crea (o sobrescribe) `folder/name.cota` y devuelve su handle. */
export async function writeDrawing(
  dir: FsDirHandle,
  folder: string,
  name: string,
  text: string,
  ext: string = DRAWING_EXT,
): Promise<{ handle: FsFileHandle; path: string } | null> {
  const fileName = drawingFileName(name, ext)
  const handle = await fileHandleAt(dir, folder, fileName, { create: true })
  if (!handle) return null
  await writeTextFile(handle, text)
  return { handle, path: joinPath(folder, fileName) }
}
