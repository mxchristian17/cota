import type { Command } from '../types'
import type { PlotArea } from '../../io/pdf'

export const plotCommand: Command = {
  name: 'PLOT',
  aliases: ['PRINT'],
  description: 'Plot to a vector PDF from a dialog with preview: paper, orientation, area (Extents/Display/Window), scale, plot style; a layout plots 1:1 with its page setup',
  async run(ctx) {
    if (!ctx.app.plotDialog) return ctx.app.exportPdf()
    let window: PlotArea | null = null
    for (;;) {
      const r = await ctx.app.plotDialog(window)
      if (r !== 'window') return
      // Window <: el diálogo se esconde mientras se marcan las dos esquinas.
      const a = await ctx.getPoint('Specify first corner: ', { base: null })
      if (a.kind !== 'point') return
      const b = await ctx.getPoint('Specify opposite corner: ', { base: a.point, corner: true })
      if (b.kind !== 'point') return
      const [p, q] = [a.point, b.point]
      window = { minX: Math.min(p.x, q.x), minY: Math.min(p.y, q.y), maxX: Math.max(p.x, q.x), maxY: Math.max(p.y, q.y) }
    }
  },
}

/** -PLOT: plotea directamente con las últimas opciones (para scripts y macros). */
export const plotNowCommand: Command = {
  name: '-PLOT',
  aliases: ['-PRINT'],
  description: 'Plot to PDF right away with the last PLOT settings (no dialog)',
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
