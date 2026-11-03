import type { Command } from '../types'
import type { DocumentModel } from '../../document/DocumentModel'
import type { ImageEntity } from '../../document/types'
import { imageFileName } from '../../geom/image'

/** Imágenes del dibujo: modelo, hojas y bloques. */
export function drawingImages(doc: DocumentModel): ImageEntity[] {
  const lists = [doc.modelEntities, ...doc.layouts.map((l) => l.entities), ...doc.blocks.map((b) => b.entities)]
  return lists.flat().filter((e): e is ImageEntity => e.type === 'IMAGE')
}

/**
 * IMAGE: las imágenes del dibujo y sus archivos. Un plano guarda sólo la ruta de cada imagen; en el navegador no se
 * puede leer el disco por esa ruta, así que *Reload* pide elegir los archivos (se asocian por el nombre).
 */
export const imageCommand: Command = {
  name: 'IMAGE',
  aliases: ['IM', '-IMAGE'],
  description: 'Images of the drawing: list them and load their files [Reload/?]',
  async run(ctx) {
    const images = drawingImages(ctx.doc)
    if (!images.length) {
      ctx.print('The drawing has no images. Open a DXF that uses them to see them here.')
      return
    }
    const byFile = new Map<string, { n: number; found: boolean }>()
    for (const e of images) {
      const k = imageFileName(e.props) || '(no file name)'
      const s = byFile.get(k) ?? { n: 0, found: true }
      s.n++
      s.found &&= !!e.props.data
      byFile.set(k, s)
    }
    const missing = [...byFile.values()].filter((s) => !s.found).length
    const r = await ctx.getPoint(`Enter an option [Reload/?] <${missing ? 'Reload' : '?'}>: `, { keywords: ['Reload', '?'], enterKeyword: missing ? 'Reload' : '?' })
    if (r.kind !== 'keyword') return
    if (r.keyword === '?') {
      for (const [name, s] of byFile) ctx.print(`  ${name}: ${s.found ? 'loaded' : 'not found'}${s.n > 1 ? ` (${s.n} images)` : ''}`)
      return
    }
    ctx.app.attachImages()
  },
}
