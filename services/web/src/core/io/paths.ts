/**
 * Rutas de dibujo: un dibujo se identifica por `carpeta/sub/nombre`, donde la carpeta es
 * relativa a la carpeta de trabajo elegida por el usuario. Puro y testeable.
 */
export const DRAWING_EXT = '.cota'
/** Extensión de los dibujos hechos antes del nombre Cota: se siguen abriendo. */
export const LEGACY_DRAWING_EXT = '.ccad'
export const DRAWING_EXTS = [DRAWING_EXT, LEGACY_DRAWING_EXT]

/** ¿Es un dibujo nativo (`.cota` o `.ccad`)? */
export const isDrawingFile = (fileName: string): boolean => DRAWING_EXTS.includes(extensionOf(fileName))

export interface DrawingPath {
  /** Subcarpeta relativa ("" = raíz de la carpeta de trabajo). */
  folder: string
  /** Nombre sin extensión. */
  name: string
}

/** Caracteres no admitidos en nombres de archivo/carpeta en los sistemas habituales. Los espacios y
 *  guiones son válidos y se conservan. */
// eslint-disable-next-line no-control-regex
const INVALID = /[<>:"/\\|?*\u0000-\u001f]/g

/** Limpia un segmento (nombre de archivo o carpeta) dejándolo utilizable en disco. */
export function sanitizeSegment(segment: string): string {
  const cleaned = segment.replace(INVALID, '').trim().replace(/\.+$/, '')
  return cleaned
}

/** Parte `carpeta/sub/nombre` en sus componentes, descartando segmentos vacíos o inválidos. */
export function splitDrawingPath(path: string): DrawingPath {
  const parts = path
    .split('/')
    .map(sanitizeSegment)
    .filter((p) => p.length > 0)
  if (parts.length === 0) return { folder: '', name: '' }
  // Se vuelve a limpiar tras quitar la extensión: "plano .cota" → "plano".
  const name = sanitizeSegment(stripExtension(parts.pop() as string))
  return { folder: parts.join('/'), name }
}

/** Quita la extensión conocida (`.cota`/`.ccad`/`.dxf`), respetando nombres con puntos. */
export function stripExtension(name: string): string {
  const lower = name.toLowerCase()
  for (const ext of DRAWING_EXTS) if (lower.endsWith(ext)) return name.slice(0, -ext.length)
  if (lower.endsWith('.dxf')) return name.slice(0, -4)
  return name
}

/** Extensión en minúsculas (con punto) o cadena vacía. */
export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf('.')
  return i > 0 ? fileName.slice(i).toLowerCase() : ''
}

/** `carpeta/sub/nombre.cota` (o la extensión indicada), listo para mostrar o resolver en disco. */
export function drawingFileName(name: string, ext: string = DRAWING_EXT): string {
  const base = sanitizeSegment(stripExtension(name)) || 'drawing1'
  return base + ext
}

/** Ruta completa con carpeta ("" = raíz). */
export function joinPath(folder: string, fileName: string): string {
  return folder ? `${folder}/${fileName}` : fileName
}

/** Segmentos de carpeta válidos para crear subdirectorios. */
export function folderSegments(folder: string): string[] {
  return folder
    .split('/')
    .map(sanitizeSegment)
    .filter((p) => p.length > 0)
}
