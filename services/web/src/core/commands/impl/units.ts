import type { Command } from '../types'
import { askKeyword } from '../ask'

const UNITS: Array<[string, string]> = [
  ['Millimeters', 'mm'],
  ['Centimeters', 'cm'],
  ['Meters', 'm'],
  ['Inches', 'in'],
  ['Feet', 'ft'],
]
const NAME: Record<string, string> = Object.fromEntries(UNITS.map(([k, u]) => [u, k]))

/** UNITS: unidades del dibujo (milímetros, centímetros, metros, pulgadas, pies). No escala lo ya dibujado. */
export const unitsCommand: Command = {
  name: 'UNITS',
  aliases: ['UN'],
  description: 'Set the drawing units: millimeters, centimeters, meters, inches or feet',
  async run(ctx) {
    const cur = NAME[ctx.doc.units] ?? 'Millimeters'
    const k = await askKeyword(ctx, `Drawing units [${UNITS.map(([n]) => n).join('/')}] <${cur}>: `, UNITS.map(([n]) => n), cur)
    if (k === null) return
    const u = UNITS.find(([n]) => n === k)![1]
    ctx.doc.setUnits(u)
    ctx.print(`Drawing units: ${k.toLowerCase()} (objects keep their size in units; scales and linetypes follow the new unit).`)
  },
}

/**
 * TEMPLATE: plantilla de partida. *Save* la descarga (.cotatpl); *Open* empieza un dibujo nuevo desde un archivo;
 * *Default* hace que cada dibujo nuevo parta de la configuración actual; *Clear* vuelve a la de fábrica.
 */
export const templateCommand: Command = {
  name: 'TEMPLATE',
  aliases: [],
  description: 'Drawing template: save it, open one, make the current settings the default for new drawings, or clear it',
  async run(ctx) {
    ctx.print(await (ctx.app.template?.('status') ?? Promise.resolve('')))
    const k = await askKeyword(ctx, 'Enter an option [Save/Open/Default/Clear] <Save>: ', ['Save', 'Open', 'Default', 'Clear'], 'Save')
    if (k === null || !ctx.app.template) return
    ctx.print(await ctx.app.template(k.toLowerCase() as 'save' | 'open' | 'default' | 'clear'))
  },
}
