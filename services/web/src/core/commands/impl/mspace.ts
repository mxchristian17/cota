import { defaultMsViewport, layoutViewports, viewportAt } from '../../layout/layouts'
import type { Command, CommandContext } from '../types'

/** Los cambios de espacio sólo existen dentro de un layout (en Model, como el CAD clásico, no aplican). */
function inLayout(ctx: CommandContext): boolean {
  if (ctx.doc.activeLayout) return true
  ctx.print('** Command not allowed in Model Tab **')
  return false
}

/** Entra al modelo por un viewport (o vuelve al papel con null), soltando la selección del espacio anterior. */
function switchTo(ctx: CommandContext, id: string | null): void {
  ctx.app.clearSelection()
  ctx.doc.setMsViewport(id)
}

/** MSPACE (MS): pasa al modelo por el último viewport usado del layout. */
export const mspaceCommand: Command = {
  name: 'MSPACE',
  aliases: ['MS'],
  description: 'Switch to model space through a layout viewport',
  async run(ctx) {
    if (!inLayout(ctx)) return
    if (ctx.doc.msViewportId) return ctx.print('Already in model space.')
    const id = defaultMsViewport(ctx.doc)
    if (!id) return ctx.print('There are no active model space viewports.')
    switchTo(ctx, id)
  },
}

/** PSPACE (PS): vuelve al papel del layout. */
export const pspaceCommand: Command = {
  name: 'PSPACE',
  aliases: ['PS'],
  description: 'Switch from a layout viewport back to paper space',
  async run(ctx) {
    if (!inLayout(ctx)) return
    if (!ctx.doc.msViewportId) return ctx.print('Already in paper space.')
    switchTo(ctx, null)
  },
}

/** VPMAX: maximiza un viewport del layout para editar el modelo a pantalla completa. */
export const vpmaxCommand: Command = {
  name: 'VPMAX',
  aliases: [],
  description: 'Maximize a layout viewport temporarily (VPMIN restores it)',
  async run(ctx) {
    if (!inLayout(ctx)) return
    if (ctx.doc.maximizedViewportId) return ctx.print('The viewport is already maximized.')
    const on = layoutViewports(ctx.doc).filter((v) => v.props.on)
    let id = ctx.doc.msViewportId ?? (on.length === 1 ? on[0].id : null)
    if (!id && on.length) {
      const r = await ctx.getPoint('Select a viewport to maximize: ')
      if (r.kind !== 'point') return
      id = viewportAt(ctx.doc, r.point.x, r.point.y)
    }
    if (!id) return ctx.print('No viewport to maximize.')
    ctx.app.clearSelection()
    ctx.doc.setMaximizedViewport(id)
  },
}

/** VPMIN: restaura el viewport maximizado y vuelve al papel. */
export const vpminCommand: Command = {
  name: 'VPMIN',
  aliases: [],
  description: 'Restore the maximized layout viewport',
  async run(ctx) {
    if (!inLayout(ctx)) return
    if (!ctx.doc.maximizedViewportId) return ctx.print('No viewport is maximized.')
    ctx.doc.setMaximizedViewport(null)
    switchTo(ctx, null)
  },
}
