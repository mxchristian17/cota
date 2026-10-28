import type { ToolbarSide } from '../../ui/toolbar'
import { findToolbar, TOOLBARS } from '../../ui/toolbars'
import { askKeyword } from '../ask'
import type { Command } from '../types'

/**
 * Paleta de Propiedades. Reemplaza al panel lateral: se puede mover, acoplar a un borde,
 * minimizar y cerrar. `SIDEBAR`/`HIDESIDEBAR` se conservan como alias del comando anterior.
 */
export const propertiesCommand: Command = {
  name: 'PROPERTIES',
  aliases: ['PR', 'CH', 'MO', 'DDMODIFY', 'PROPS', 'SIDEBAR', 'HIDESIDEBAR'],
  description: 'Show/hide the Properties palette (movable, dockable)',
  async run(ctx) {
    ctx.app.toggleProperties()
    ctx.print('Properties palette toggled.')
  },
}

/** Administrador de capas en un modal, estilo Layer Properties Manager. */
export const layerCommand: Command = {
  name: 'LAYER',
  aliases: ['LA', 'DDLMODES'],
  description: 'Open the Layer Properties Manager (create, rename, color, lineweight, plot…)',
  async run(ctx) {
    ctx.app.openLayers()
  },
}

/**
 * -TOOLBAR, como el CAD clásico: muestra, oculta, acopla a un borde o hace flotar una barra de
 * herramientas, o muestra/oculta todas (`ALL`).
 */
export const dashToolbarCommand: Command = {
  name: '-TOOLBAR',
  aliases: ['-TO'],
  description: 'Show, hide, dock or float a toolbar from the command line (or ALL toolbars)',
  async run(ctx) {
    const name = (await ctx.getString('Enter toolbar name or [ALL]: '))?.trim()
    if (!name) return
    const all = name.toUpperCase() === 'ALL'
    const def = all ? null : findToolbar(name)
    if (!all && !def) {
      ctx.print(`Toolbar "${name}" not found. Available: ${TOOLBARS.map((t) => t.name).join(', ')}.`)
      return
    }
    const opts = all ? ['Show', 'Hide'] : ['Show', 'Hide', 'Left', 'Right', 'Top', 'Bottom', 'Float']
    const k = await askKeyword(ctx, `Enter an option [${opts.join('/')}] <Show>: `, opts, 'Show')
    if (!k) return
    const patch =
      k === 'Show' ? { visible: true } : k === 'Hide' ? { visible: false } : k === 'Float' ? { visible: true, docked: false } : { visible: true, docked: true, side: k.toLowerCase() as ToolbarSide }
    for (const t of all ? TOOLBARS : [def!]) ctx.app.toolbar?.(t.id, patch)
  },
}

/** TOOLBAR: diálogo con todas las barras para mostrarlas u ocultarlas. */
export const toolbarCommand: Command = {
  name: 'TOOLBAR',
  aliases: ['TO', 'TBCONFIG'],
  description: 'Show or hide toolbars (dialog with the list of toolbars)',
  async run(ctx) {
    if (ctx.app.openToolbars) ctx.app.openToolbars()
    else ctx.print('Toolbars: ' + TOOLBARS.map((t) => t.name).join(', '))
  },
}

/** GRID, como el CAD clásico: muestra u oculta la grilla del modelo (F7). */
export const gridCommand: Command = {
  name: 'GRID',
  aliases: [],
  description: 'Show or hide the grid [ON/OFF] (F7)',
  async run(ctx) {
    const cur = ctx.app.gridOn?.() ?? true
    const k = await askKeyword(ctx, `Enter an option [ON/OFF] <${cur ? 'OFF' : 'ON'}>: `, ['ON', 'OFF'], cur ? 'OFF' : 'ON')
    if (!k) return
    ctx.app.grid?.(k === 'ON')
  },
}

/**
 * FULLSCREEN: pantalla completa total, sin barras del navegador ni del sistema. Se recuerda: al volver a
 * abrir la app se reactiva con el primer clic o tecla (los navegadores exigen ese gesto).
 */
export const fullscreenCommand: Command = {
  name: 'FULLSCREEN',
  aliases: ['FS'],
  description: 'Toggle full screen (no browser or system bars); remembered for next time',
  async run(ctx) {
    const on = ctx.app.fullscreen?.()
    if (on !== undefined) ctx.print(`<Full screen ${on ? 'on' : 'off'}>`)
  },
}

/** Comando que fija un ajuste de pantalla (máximo espacio de dibujo). */
const screenCommand = (name: string, description: string, patch: { cleanScreen?: boolean; commandLineCompact?: boolean }, aliases: string[] = []): Command => ({
  name,
  aliases,
  description,
  async run(ctx) {
    ctx.app.screen?.(patch)
  },
})

/** CLEANSCREENON/OFF (Ctrl+0) y COMMANDLINE/COMMANDLINEHIDE (Ctrl+9), como el CAD clásico. */
export const screenCommands: Command[] = [
  screenCommand('CLEANSCREENON', 'Clean screen: hide toolbars and palettes (Ctrl+0)', { cleanScreen: true }),
  screenCommand('CLEANSCREENOFF', 'Restore toolbars and palettes (Ctrl+0)', { cleanScreen: false }),
  screenCommand('COMMANDLINE', 'Show the full command line window (Ctrl+9)', { commandLineCompact: false }),
  screenCommand('COMMANDLINEHIDE', 'Compact command line: input row only (Ctrl+9)', { commandLineCompact: true }),
]

/** NAVVCUBE: muestra u oculta el cubo de vistas, como el CAD clásico (`[ON/OFF]`). */
export const navvcubeCommand: Command = {
  name: 'NAVVCUBE',
  aliases: [],
  description: 'Show or hide the view cube [ON/OFF]',
  async run(ctx) {
    const k = await askKeyword(ctx, 'Enter an option [ON/OFF] <ON>: ', ['ON', 'OFF'], 'ON')
    if (!k) return
    ctx.app.screen?.({ viewCubeOn: k === 'ON' })
  },
}

/** MOBILEVIEW: la vista para el celular en obra (abrir, orbitar, medir, estilos visuales, capas) o el editor completo. */
export const mobileviewCommand: Command = {
  name: 'MOBILEVIEW',
  aliases: [],
  description: 'Switch to the phone view for the job site (open, orbit, measure, visual styles) [ON/OFF]',
  async run(ctx) {
    const k = await askKeyword(ctx, 'Enter an option [ON/OFF] <ON>: ', ['ON', 'OFF'], 'ON')
    if (!k) return
    ctx.app.screen?.({ mobileView: k === 'ON' })
  },
}
