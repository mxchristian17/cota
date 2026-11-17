import { askKeyword } from '../ask'
import type { Entity } from '../../document/types'
import type { Command } from '../types'

/** Nombre de bloque a partir del nombre del archivo: sin la extensión ni los caracteres que un DWG no admite. */
export function blockNameFromFile(file: string): string {
  const stem = (file.split(/[\\/]/).pop() ?? file).replace(/\.[^.]+$/, '')
  return stem.replace(/[<>/\\":;?*|=,`]/g, '_').trim() || 'MODEL'
}

export const importCommand: Command = {
  name: 'IMPORT',
  aliases: ['IMP'],
  description: 'Import geometry from a DXF, DWG, OBJ, STL, STEP or IGES file',
  async run(ctx) {
    // DXF y DWG se agregan solos; un modelo 3D vuelve leído y se pregunta cómo traerlo.
    const model = await ctx.app.importFile()
    if (!model?.meshes.length) return
    const n = model.meshes.length
    const how = await askKeyword(ctx, `Import "${model.file}" as [Objects/Block] <Objects>: `, ['Objects', 'Block'], 'Objects')
    if (!how) return
    const layer = ctx.currentLayerId()
    if (how === 'Objects') {
      // Como el OBJ: cada cuerpo, una malla en la capa actual, en las coordenadas del archivo.
      for (const m of model.meshes) ctx.doc.addEntity({ type: 'MESH3D', layer, props: { vertices: m.vertices, faces: m.faces } })
      ctx.app.zoomExtents()
      ctx.print(`Imported ${n} mesh(es) from ${model.format}.`)
      return
    }
    // Block: una definición con el modelo (su origen es el punto base) y una inserción en el origen, para insertarlo
    // las veces que haga falta con INSERT.
    const def = blockNameFromFile(model.file)
    let name: string | null = null
    while (!name) {
      const typed = (await ctx.getString(`Block name <${def}>: `, { default: def }))?.trim()
      if (!typed) return
      if (typed === ctx.doc.editingBlock) {
        ctx.print(`A block cannot contain itself: "${typed}" is open in the Block Editor.`)
        continue
      }
      if (!ctx.doc.getBlock(typed)) {
        name = typed
        break
      }
      const redefine = await askKeyword(ctx, `Block "${typed}" already exists. Redefine it? [Yes/No] <No>: `, ['Yes', 'No'], 'No')
      if (redefine === null) return
      if (redefine === 'Yes') name = typed
    }
    const redefining = !!ctx.doc.getBlock(name)
    // En la capa 0: las mallas toman la capa (y el color) de cada inserción, como en el CAD clásico.
    const entities = model.meshes.map((m) => ({ id: ctx.doc.nextEntityId(), type: 'MESH3D', layer: '0', props: { vertices: m.vertices, faces: m.faces } }) as Entity)
    ctx.doc.setBlock({ name, entities })
    ctx.doc.addEntity({ type: 'INSERT', layer, props: { name, position: [0, 0, 0], scale: [1, 1, 1], rotation: 0 } })
    ctx.app.zoomExtents()
    ctx.print(
      `Block "${name}" ${redefining ? 'redefined' : 'defined'} with ${n} mesh(es) from ${model.format} and inserted at 0,0,0. Use INSERT ${name} to place more.`,
    )
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
