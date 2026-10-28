import type { Command } from '../types'
import { parseColor } from './layertools'
import { LINEWEIGHTS, colorLabel, lineweightLabel } from '../../document/objectProps'

/** COLOR: color de los objetos nuevos (CECOLOR): ByLayer, índice 1–255, nombre, `#rrggbb` o `r,g,b`. */
export const colorCommand: Command = {
  name: 'COLOR',
  aliases: ['COL', 'COLOUR', '-COLOR', 'CECOLOR'],
  description: 'Color of new objects (CECOLOR): ByLayer, index 1-255, name, #rrggbb or r,g,b',
  async run(ctx) {
    const cur = colorLabel(ctx.doc.vars.CECOLOR)
    for (;;) {
      const r = await ctx.getString(`Enter default object color [ByLayer] <${cur}>: `, { default: cur })
      if (r === null) return
      const t = r.trim()
      if (/^bylayer$/i.test(t)) return ctx.doc.setVar('CECOLOR', undefined)
      if (t === cur) return
      const c = parseColor(t)
      if (!c) {
        ctx.print('Invalid color: use ByLayer, an index 1-255, a name, #rrggbb or r,g,b.')
        continue
      }
      ctx.doc.setVar('CECOLOR', c)
      return
    }
  },
}

/** LWEIGHT: grosor de los objetos nuevos (CELWEIGHT): ByLayer, Default o un grosor en mm (el estándar más cercano). */
export const lweightCommand: Command = {
  name: 'LWEIGHT',
  aliases: ['LW', 'LINEWEIGHT', '-LWEIGHT', 'CELWEIGHT'],
  description: 'Lineweight of new objects (CELWEIGHT): ByLayer, Default or a width in mm [?]',
  async run(ctx) {
    const cur = lineweightLabel(ctx.doc.vars.CELWEIGHT)
    ctx.print(`Current lineweight: ${cur}`)
    for (;;) {
      const r = await ctx.getString(`Enter default lineweight for new objects or [?] <${cur}>: `, { default: '' })
      if (r === null) return
      const t = r.trim().replace(/\s*mm$/i, '')
      if (!t) return
      if (t === '?') {
        ctx.print(`ByLayer, Default, ${LINEWEIGHTS.slice(1).map((v) => v.toFixed(2)).join(', ')} (mm)`)
        continue
      }
      if (/^bylayer$/i.test(t)) return ctx.doc.setVar('CELWEIGHT', undefined)
      if (/^default$/i.test(t)) return ctx.doc.setVar('CELWEIGHT', 0)
      const v = Number(t)
      if (!Number.isFinite(v) || v < 0 || v > 2.11) {
        ctx.print('Invalid lineweight: use ByLayer, Default or 0.05–2.11 mm.')
        continue
      }
      const near = LINEWEIGHTS.slice(1).reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a))
      ctx.doc.setVar('CELWEIGHT', near)
      if (near !== v) ctx.print(`Lineweight set to the nearest standard value: ${near.toFixed(2)} mm.`)
      return
    }
  },
}
