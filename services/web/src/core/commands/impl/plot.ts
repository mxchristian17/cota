import type { Command } from '../types'

export const plotCommand: Command = {
  name: 'PLOT',
  aliases: ['PRINT'],
  description: 'Export the drawing (or the active layout sheet at 1:1) to a vector PDF',
  async run(ctx) {
    ctx.app.exportPdf()
  },
}

/** PUBLISH: exporta varios layouts en un solo PDF, una página por layout. */
export const publishCommand: Command = {
  name: 'PUBLISH',
  aliases: [],
  description: 'Publish layouts to a multi-page PDF [All/Current or layout names]',
  async run(ctx) {
    const doc = ctx.doc
    const text = await ctx.getString('Enter layouts to publish [All/Current] or names separated by commas <All>: ', { default: '' })
    if (text === null) return
    const t = text.trim()
    if (!t || /^a(ll?)?$/i.test(t)) return ctx.app.publish(doc.layouts.map((l) => l.id))
    if (/^c(urrent)?$/i.test(t)) {
      if (!doc.activeLayout) return ctx.print('The current tab is Model: name the layouts to publish.')
      return ctx.app.publish([doc.activeLayout.id])
    }
    const ids: string[] = []
    for (const name of t.split(',').map((n) => n.trim()).filter(Boolean)) {
      const l = doc.findLayoutByName(name)
      if (l) ids.push(l.id)
      else ctx.print(`Layout "${name}" not found.`)
    }
    if (ids.length) ctx.app.publish(doc.layouts.filter((l) => ids.includes(l.id)).map((l) => l.id))
  },
}
