import { viewZ } from './primitives'
import { expandEntities } from '../../editing/block'
import { FIELD_NAMES, fieldCode, hasFields } from '../../fields/fields'
import { matchKeyword } from '../keywords'
import type { Command, CommandContext } from '../types'
import { askAngle, askDistance, textSizeStore } from '../ask'

const DATE_FIELDS = ['SaveDate', 'CreateDate', 'PlotDate']

/** Pide el campo (y su formato o propiedad) y devuelve su código `%<\AcVar …>%`. */
async function askField(ctx: CommandContext): Promise<string | null> {
  const names = [...FIELD_NAMES]
  const text = await ctx.getString(`Field name [${names.join('/')}] <Filename>: `, { default: '' })
  if (text === null) return null
  const name = text.trim() ? matchKeyword(text, names) : 'Filename'
  if (!name) {
    ctx.print('Invalid field name.')
    return null
  }
  if (name === 'CustomDP') {
    const prop = (await ctx.getString('Custom property name: '))?.trim()
    return prop ? fieldCode(`CustomDP.${prop}`) : null
  }
  if (DATE_FIELDS.includes(name)) {
    const fmt = await ctx.getString('Date format <dd/MM/yyyy>: ', { default: '' })
    if (fmt === null) return null
    return fieldCode(name, fmt.trim() && fmt.trim() !== 'dd/MM/yyyy' ? fmt.trim() : undefined)
  }
  if (name === 'Filename') {
    const opt = await ctx.getString('Show extension? [Yes/No] <Yes>: ', { default: '' })
    if (opt === null) return null
    return fieldCode(name, matchKeyword(opt || 'Yes', ['Yes', 'No']) === 'No' ? 'noext' : undefined)
  }
  return fieldCode(name)
}

/**
 * FIELD: inserta un campo en un texto nuevo o al final de un texto existente (`Object`). El campo se
 * guarda como código y se evalúa al dibujar, guardar y plotear.
 */
export const fieldCommand: Command = {
  name: 'FIELD',
  planar: true,
  aliases: [],
  description: 'Insert a field (file name, dates, drawing properties, layout, sheet, viewport scale) into text',
  async run(ctx) {
    const code = await askField(ctx)
    if (!code) return
    const r = await ctx.getPoint('Specify start point of text or [Object]: ', { keywords: ['Object'] })
    if (r.kind === 'cancel') return
    if (r.kind === 'keyword') {
      const p = await ctx.getPoint('Select text to add the field to: ')
      const e = p.kind === 'point' && p.pick?.id ? ctx.doc.getEntity(p.pick.id) : undefined
      if (e?.type !== 'TEXT') return ctx.print('That is not a text.')
      e.props.text += code
      ctx.doc.touch()
      return
    }
    const h = await askDistance(ctx, 'TEXTSIZE', 'Specify text height', { base: r.point, store: textSizeStore(ctx), valid: (v) => v > 0 })
    if (h.kind !== 'distance') return
    const height = h.value > 0 ? h.value : ctx.doc.textSize
    const rot = await askAngle(ctx, 'TEXT.rotation', 'Specify rotation angle of text', { base: r.point, initial: 0 })
    if (rot.kind !== 'angle') return
    ctx.doc.addEntity({
      type: 'TEXT',
      layer: ctx.currentLayerId(),
      props: {
        position: [r.point.x, r.point.y, r.point.z],
        text: code,
        height,
        rotation: (rot.deg * Math.PI) / 180,
        justify: 'left',
        normal: viewZ(ctx),
      },
    })
    ctx.print('Field created.')
  },
}

/** UPDATEFIELD: re-evalúa los campos de los objetos elegidos (texto, atributos, rótulos). */
export const updatefieldCommand: Command = {
  name: 'UPDATEFIELD',
  aliases: [],
  description: 'Update the fields of the selected objects',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (!ids?.length) return
    const ents = ids.map((id) => ctx.doc.getEntity(id)).filter((e) => e !== undefined)
    const n = expandEntities(ents, ctx.doc.blocks).filter((e) => e.type === 'TEXT' && hasFields(e.props.text)).length
    ctx.app.redraw()
    ctx.print(`${n} field(s) found. ${n} field(s) updated.`)
  },
}

/** DWGPROPS: título, asunto, autor, palabras clave y propiedades personalizadas del dibujo. */
export const dwgpropsCommand: Command = {
  name: 'DWGPROPS',
  aliases: [],
  description: 'Drawing properties: title, subject, author, keywords and custom properties (used by fields)',
  async run(ctx) {
    ctx.app.openDwgProps()
  },
}
