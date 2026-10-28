import type { Command } from '../types'

export const importCommand: Command = {
  name: 'IMPORT',
  aliases: ['IMP'],
  description: 'Import geometry from an OBJ or DXF file',
  async run(ctx) {
    ctx.app.importFile()
  },
}

export const exportCommand: Command = {
  name: 'EXPORT',
  aliases: ['EXP'],
  description: 'Export the drawing to OBJ (3D mesh), DXF (2D) or DWG (2D)',
  async run(ctx) {
    const r = await ctx.getPoint('Format [OBJ/DXF/DWG] <OBJ>: ', { keywords: ['OBJ', 'DXF', 'DWG'], enterKeyword: 'OBJ' })
    if (r.kind === 'cancel') return // Esc cancela; Enter elige el formato por defecto
    if (r.kind === 'point') {
      ctx.print('Type OBJ, DXF or DWG.')
      return
    }
    const kw = r.kind === 'keyword' ? r.keyword.toUpperCase() : 'OBJ'
    const fmt = kw === 'DXF' ? 'DXF' : kw === 'DWG' ? 'DWG' : 'OBJ'
    ctx.app.exportModel(fmt)
  },
}
