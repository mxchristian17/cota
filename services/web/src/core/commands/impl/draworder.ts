import type { Command } from '../types'
import { askKeyword } from '../ask'

/**
 * DRAWORDER (DR): orden de dibujo de los objetos, como el CAD clásico: lo último se dibuja encima. Arriba o debajo de
 * otros objetos, al frente o al fondo.
 */
export const draworderCommand: Command = {
  name: 'DRAWORDER',
  aliases: ['DR'],
  description: 'Change the draw order of objects [Above objects/Under objects/Front/Back]',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (!ids?.length) return
    const k = await askKeyword(ctx, 'Enter object ordering option [Above objects/Under objects/Front/Back] <Back>: ', ['Above objects', 'Under objects', 'Front', 'Back'], 'Back')
    if (k === null) return
    let to: Parameters<typeof ctx.doc.reorder>[1] = k === 'Front' ? 'front' : 'back'
    if (k === 'Above objects' || k === 'Under objects') {
      ctx.app.clearSelection()
      const refs = (await ctx.getSelection('Select reference objects: '))?.filter((id) => !ids.includes(id))
      if (!refs?.length) return
      to = k === 'Above objects' ? { above: refs } : { below: refs }
    }
    ctx.doc.reorder(ids, to)
    ctx.app.clearSelection()
  },
}

/** TEXTTOFRONT: los textos y/o las cotas al frente (encima de lo demás). */
export const texttofrontCommand: Command = {
  name: 'TEXTTOFRONT',
  aliases: [],
  description: 'Bring texts and/or dimensions in front of the other objects [Text/Dimensions/Both]',
  async run(ctx) {
    const k = await askKeyword(ctx, 'Bring to front [Text/Dimensions/Both] <Both>: ', ['Text', 'Dimensions', 'Both'], 'Both')
    if (k === null) return
    const kinds = new Set(k === 'Text' ? ['TEXT'] : k === 'Dimensions' ? ['DIMENSION'] : ['TEXT', 'DIMENSION'])
    const ids = ctx.doc.entities.filter((e) => kinds.has(e.type)).map((e) => e.id)
    const n = ids.length ? ctx.doc.reorder(ids, 'front') : 0
    ctx.print(`${n} object(s) brought to front.`)
  },
}
