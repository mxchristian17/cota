import type { Vec3 } from '../math'
import type { ImageProps } from '../document/types'

/**
 * Punto del mundo de una coordenada en píxeles de la imagen. Como en el formato del CAD clásico, los píxeles se
 * cuentan desde la esquina superior izquierda hacia abajo y el borde de la imagen está en −0.5.
 */
export function imagePoint(p: ImageProps, x: number, y: number): Vec3 {
  const a = x + 0.5
  const b = p.size[1] - y - 0.5
  return [p.origin[0] + p.u[0] * a + p.v[0] * b, p.origin[1] + p.u[1] * a + p.v[1] * b, p.origin[2] + p.u[2] * a + p.v[2] * b]
}

/** Coordenada de textura (0..1, con 1 arriba) de una coordenada en píxeles. */
export function imageUv(p: ImageProps, x: number, y: number): [number, number] {
  return [(x + 0.5) / p.size[0], 1 - (y + 0.5) / p.size[1]]
}

/** Contorno visible en píxeles: el recorte (dos puntos = rectángulo) o la imagen entera. */
export function imageClip(p: ImageProps): Array<[number, number]> {
  const c = p.clip
  if (c && c.length >= 3) return c
  const [x0, y0, x1, y1] = c && c.length === 2 ? [c[0][0], c[0][1], c[1][0], c[1][1]] : [-0.5, -0.5, p.size[0] - 0.5, p.size[1] - 0.5]
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
}

/** Marco de la imagen en el mundo, cerrado (el último punto repite el primero). */
export function imageRing(p: ImageProps): Vec3[] {
  const ring = imageClip(p).map(([x, y]) => imagePoint(p, x, y))
  return ring.length ? [...ring, ring[0]] : ring
}

/**
 * Imagen transformada (mover, girar, escalar, reflejar, insertar en un bloque): se transforman la esquina y los
 * extremos de sus lados enteros (no los vectores de un píxel, que en coordenadas grandes perderían precisión).
 */
export function mapImage(p: ImageProps, f: (v: Vec3) => Vec3): ImageProps {
  const [w, h] = p.size
  const o = f(p.origin)
  const a = f([p.origin[0] + p.u[0] * w, p.origin[1] + p.u[1] * w, p.origin[2] + p.u[2] * w])
  const b = f([p.origin[0] + p.v[0] * h, p.origin[1] + p.v[1] * h, p.origin[2] + p.v[2] * h])
  return {
    ...p,
    origin: o,
    u: [(a[0] - o[0]) / w, (a[1] - o[1]) / w, (a[2] - o[2]) / w],
    v: [(b[0] - o[0]) / h, (b[1] - o[1]) / h, (b[2] - o[2]) / h],
    ...(p.clip ? { clip: p.clip.map(([x, y]): [number, number] => [x, y]) } : {}),
  }
}

/** Nombre del archivo sin la carpeta. */
export const imageFileName = (p: ImageProps): string => p.file.split(/[\\/]/).pop() ?? p.file

/** Formatos de imagen que se pueden adjuntar (los que lee el navegador; TIFF sólo en algunos). */
export const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tif', '.tiff']
export const isImageFile = (name: string): boolean => IMAGE_EXTS.some((x) => name.toLowerCase().endsWith(x))
