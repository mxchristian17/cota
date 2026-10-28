import type { Command } from '../types'

/**
 * SCRIPT: multicomandos en una sola operación (un paso de deshacer), como los scripts del CAD clásico. Abre un
 * diálogo para escribir o pegar el lote, cargar un `.scr` o copiar un enlace que lo comparte.
 */
export const scriptCommand: Command = {
  name: 'SCRIPT',
  aliases: ['SCR'],
  description: 'Run several commands as one operation (one undo step): type or paste them, load a .scr file or share them as a link',
  async run(ctx) {
    if (!ctx.app.script) return ctx.print('SCRIPT needs the drawing window.')
    ctx.app.script()
  },
}
