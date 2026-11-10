import type { Command } from '../types'
import { aboutLine } from '../../about'

/**
 * HELP se autogenera del registry: abre el panel de ayuda y lista los comandos
 * en la línea de comandos. Recibe el proveedor de comandos del engine para
 * mantenerse siempre sincronizado con lo realmente registrado.
 */
export function makeHelpCommand(getCommands: () => Command[]): Command {
  return {
    name: 'HELP',
    aliases: ['?'],
    description: 'List available commands',
    async run(ctx) {
      ctx.openHelp()
      ctx.print('Available commands:')
      for (const c of getCommands()) {
        const aliases = c.aliases.length ? ` (${c.aliases.join(', ')})` : ''
        ctx.print(`  ${c.name}${aliases} — ${c.description}`)
      }
    },
  }
}

/** DOCS: abre la documentación (guías y referencia) en otra pestaña. */
export const docsCommand: Command = {
  name: 'DOCS',
  aliases: ['DOCUMENTATION'],
  description: 'Open the documentation (guides and command reference) in a new tab',
  async run(ctx) {
    ctx.openDocs()
    ctx.print('Documentation opened in a new tab.')
  },
}

/** ABOUT: versión, autor y licencia. */
export const aboutCommand: Command = {
  name: 'ABOUT',
  aliases: [],
  description: 'Show the Cota version, author and license',
  async run(ctx) {
    ctx.openHelp()
    ctx.print(aboutLine())
  },
}
