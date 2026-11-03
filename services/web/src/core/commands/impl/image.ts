import type { Command } from '../types'
import type { DocumentModel } from '../../document/DocumentModel'
import type { ImageEntity } from '../../document/types'
import { imageFileName } from '../../geom/image'

/** Imágenes del dibujo: modelo, hojas y bloques. */
export function drawingImages(doc: DocumentModel): ImageEntity[] {
  const lists = [doc.modelEntities, ...doc.layouts.map((l) => l.entities), ...doc.blocks.map((b) => b.entities)]
  return lists.flat().filter((e): e is ImageEntity => e.type === 'IMAGE')
}

/** Archivos de las imágenes del dibujo: si se cargaron y cuántas imágenes usan cada uno. */
function imageFiles(doc: DocumentModel): Map<string, { n: number; found: boolean }> {
  const byFile = new Map<string, { n: number; found: boolean }>()
  for (const e of drawingImages(doc)) {
    const k = imageFileName(e.props) || '(no file name)'
    const s = byFile.get(k) ?? { n: 0, found: true }
    s.n++
    s.found &&= !!e.props.data
    byFile.set(k, s)
  }
  return byFile
}

/**
 * IMAGE: carga los archivos de las imágenes del dibujo. Un plano guarda sólo la ruta de cada imagen y en el navegador
 * no se puede leer el disco por esa ruta: se eligen los archivos (se asocian por el nombre). Si ya están todas, las
 * lista. `-IMAGE` pregunta [Reload/?].
 */
export const imageCommand: Command = {
  name: 'IMAGE',
  aliases: ['IM'],
  description: 'Load the files of the pictures the drawing uses (a DXF stores only their path)',
  async run(ctx) {
    const files = imageFiles(ctx.doc)
    if (!files.size) {
      ctx.print('The drawing has no images. Open a DXF that uses them to see them here.')
      return
    }
    const missing = [...files].filter(([, s]) => !s.found).map(([k]) => k)
    if (!missing.length) {
      for (const [name, s] of files) ctx.print(`  ${name}: loaded${s.n > 1 ? ` (${s.n} images)` : ''}`)
      return
    }
    ctx.print(`Choose ${missing.length > 1 ? 'the files' : 'the file'}: ${missing.join(', ')} (matched by name).`)
    ctx.app.attachImages()
  },
}

export const imageCmdlineCommand: Command = {
  name: '-IMAGE',
  aliases: [],
  description: 'Images of the drawing from the command line [Reload/?]',
  async run(ctx) {
    const files = imageFiles(ctx.doc)
    if (!files.size) {
      ctx.print('The drawing has no images.')
      return
    }
    const missing = [...files.values()].some((s) => !s.found)
    const r = await ctx.getPoint(`Enter an option [Reload/?] <${missing ? 'Reload' : '?'}>: `, { keywords: ['Reload', '?'], enterKeyword: missing ? 'Reload' : '?' })
    if (r.kind !== 'keyword') return
    if (r.keyword === '?') {
      for (const [name, s] of files) ctx.print(`  ${name}: ${s.found ? 'loaded' : 'not found'}${s.n > 1 ? ` (${s.n} images)` : ''}`)
      return
    }
    ctx.app.attachImages()
  },
}
