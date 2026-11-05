import type { PdfRaster } from './pdf'

/** Lado máximo de una imagen en el PDF (una más grande se achica: 4096 px son 35 cm a 300 ppp). */
const MAX_SIDE = 4096

/**
 * Píxeles de una imagen (sus datos: `data:` o `blob:`) para el PDF, en el navegador. Un JPEG que no hace falta achicar
 * va además tal cual (el PDF no lo recomprime).
 */
export async function decodeRaster(data: string): Promise<PdfRaster | null> {
  try {
    const blob = await (await fetch(data)).blob()
    const bmp = await createImageBitmap(blob)
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * k))
    const h = Math.max(1, Math.round(bmp.height * k))
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
    const g = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (!g) return null
    g.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    const px = g.getImageData(0, 0, w, h).data
    const rgb = new Uint8Array(w * h * 3)
    const alpha = new Uint8Array(w * h)
    let opaque = true
    for (let i = 0, j = 0; i < w * h; i++, j += 4) {
      rgb[i * 3] = px[j]
      rgb[i * 3 + 1] = px[j + 1]
      rgb[i * 3 + 2] = px[j + 2]
      alpha[i] = px[j + 3]
      if (px[j + 3] < 255) opaque = false
    }
    const jpeg = blob.type === 'image/jpeg' && k === 1 ? new Uint8Array(await blob.arrayBuffer()) : undefined
    return { w, h, rgb, ...(opaque ? {} : { alpha }), ...(jpeg ? { jpeg } : {}) }
  } catch {
    return null
  }
}
