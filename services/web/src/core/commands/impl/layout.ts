import { MODEL_TAB } from '../../document/DocumentModel'
import { activateTab } from '../../layout/layouts'
import { matchKeyword } from '../keywords'
import type { Command, CommandContext } from '../types'

const OPTIONS = ['Copy', 'Delete', 'New', 'Template', 'Rename', 'SAveas', 'Set', '?']

/** Nombre de pestaña → id ('Model' incluido si `allowModel`); imprime el error si no existe. */
function resolveTab(ctx: CommandContext, name: string, allowModel = false): string | null {
  const n = name.trim()
  if (allowModel && n.toLowerCase() === 'model') return MODEL_TAB
  const l = ctx.doc.findLayoutByName(n)
  if (!l) ctx.print(`Layout "${n}" not found.`)
  return l?.id ?? null
}

/** Pregunta un layout existente; Enter = el activo (o el primero si se está en Model). */
async function askLayout(ctx: CommandContext, verb: string): Promise<string | null> {
  const def = ctx.doc.activeLayout?.name ?? ctx.doc.layouts[0]?.name ?? ''
  const name = await ctx.getString(`Enter name of layout to ${verb} <${def}>: `, { default: def })
  if (name === null) return null
  return resolveTab(ctx, name || def)
}

/** Aplica una operación del modelo de layouts mostrando su error (nombre duplicado, etc.). */
function attempt(ctx: CommandContext, fn: () => void): void {
  try {
    fn()
  } catch (err) {
    ctx.print(err instanceof Error ? err.message : String(err))
  }
}

/** LAYOUT (LO): crea, copia, borra, renombra, lista y activa layouts. */
export const layoutCommand: Command = {
  name: 'LAYOUT',
  aliases: ['LO'],
  description: 'Manage layouts [Copy/Delete/New/Template/Rename/SAveas/Set/?]',
  async run(ctx) {
    const text = await ctx.getString(`Enter layout option [${OPTIONS.join('/')}] <set>: `, { default: 'Set' })
    if (text === null) return
    const opt = matchKeyword(text || 'Set', OPTIONS)
    const doc = ctx.doc
    switch (opt) {
      case '?':
        ctx.print(`Model, ${doc.layouts.map((l) => (l.id === doc.activeTab ? `[${l.name}]` : l.name)).join(', ')}`)
        return
      case 'New': {
        const def = doc.nextLayoutName()
        const name = await ctx.getString(`Enter name of new layout <${def}>: `, { default: def })
        if (name === null) return
        attempt(ctx, () => ctx.print(`Layout "${doc.addLayout(name || def).name}" created.`))
        return
      }
      case 'Copy': {
        const id = await askLayout(ctx, 'copy')
        if (!id) return
        const name = await ctx.getString('Enter layout name for copy <default>: ', { default: '' })
        if (name === null) return
        attempt(ctx, () => ctx.print(`Layout "${doc.copyLayout(id, name.trim() || undefined).name}" created.`))
        return
      }
      case 'Delete': {
        const id = await askLayout(ctx, 'delete')
        if (!id) return
        const name = doc.getLayout(id)?.name
        attempt(ctx, () => {
          doc.removeLayout(id)
          ctx.app.clearSelection()
          ctx.print(`Layout "${name}" deleted.`)
        })
        return
      }
      case 'Rename': {
        const id = await askLayout(ctx, 'rename')
        if (!id) return
        const name = await ctx.getString('Enter new layout name: ')
        if (!name?.trim()) return
        attempt(ctx, () => doc.renameLayout(id, name))
        return
      }
      case 'Template':
        // Lista de plantillas (incluidas, de la carpeta de trabajo o de la biblioteca) y "Abrir archivo…".
        ctx.app.openTemplateDialog('from')
        return
      case 'SAveas': {
        const id = await askLayout(ctx, 'save to template')
        if (!id) return
        const def = doc.getLayout(id)?.name ?? ''
        const name = await ctx.getString(`Enter template file name <${def}>: `, { default: def })
        if (name === null) return
        ctx.app.saveLayoutTemplate(id, name || def)
        return
      }
      case 'Set': {
        const name = await ctx.getString('Enter layout to make current: ')
        if (!name?.trim()) return
        const id = resolveTab(ctx, name, true)
        if (!id) return
        ctx.app.clearSelection()
        activateTab(doc, id, ctx.currentLayerId(), ctx.app.sheetInit())
        return
      }
      default:
        ctx.print('Invalid option.')
    }
  },
}

/** PAGESETUP: papel, orientación, márgenes y estilo de ploteo del layout activo. */
export const pagesetupCommand: Command = {
  name: 'PAGESETUP',
  aliases: [],
  description: 'Page setup of the current layout (paper, orientation, margins, plot style)',
  async run(ctx) {
    if (!ctx.doc.activeLayout) return ctx.print('PAGESETUP applies to layouts: switch to a layout tab first.')
    ctx.app.openPageSetup()
  },
}
