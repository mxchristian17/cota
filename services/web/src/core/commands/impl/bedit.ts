import type { DocumentModel } from '../../document/DocumentModel'
import type { BlockDef } from '../../document/types'
import { askKeyword } from '../ask'
import type { ViewState } from '../../view'
import type { Command, CommandContext } from '../types'

/**
 * Editor de bloques (BEDIT/BSAVE/BCLOSE), como el CAD clásico: la definición del bloque pasa a ser el espacio de edición
 * (ver `DocumentModel.setBlockEditor`), en sus coordenadas y con el punto base en el origen. Todos los comandos trabajan
 * sobre ella y las inserciones se actualizan al guardar; BCLOSE puede descartar lo hecho.
 */
let session: { name: string; saved: string; view: ViewState | null } | null = null

const defJson = (b: BlockDef | undefined): string => JSON.stringify(b?.entities ?? [])

/** ¿La definición `outer` contiene (directa o indirectamente) una inserción de `inner`? */
export function blockContains(doc: DocumentModel, outer: string, inner: string, seen = new Set<string>()): boolean {
  if (outer === inner) return true
  if (seen.has(outer)) return false
  seen.add(outer)
  for (const e of doc.getBlock(outer)?.entities ?? []) {
    if (e.type === 'INSERT' && blockContains(doc, e.props.name, inner, seen)) return true
  }
  return false
}

/** Cierra el editor (guardando o descartando) y vuelve a la vista de antes. */
function close(ctx: CommandContext, save: boolean): void {
  const name = ctx.doc.editingBlock
  if (!name) return
  if (!save && session?.name === name) ctx.doc.setBlock({ name, entities: JSON.parse(session.saved) })
  const view = session?.name === name ? session.view : null
  session = null
  ctx.app.clearSelection()
  ctx.doc.setBlockEditor(null)
  if (view) ctx.app.restoreViewState?.(view)
  ctx.print(save ? `Block "${name}" saved; all its references are updated.` : `Changes to block "${name}" discarded.`)
}

export const beditCommand: Command = {
  name: 'BEDIT',
  aliases: ['BE'],
  description: 'Edit a block definition in the Block Editor (BSAVE saves, BCLOSE closes)',
  async run(ctx) {
    if (ctx.doc.editingBlock) {
      ctx.print(`Already editing block "${ctx.doc.editingBlock}". Use BCLOSE first.`)
      return
    }
    const blocks = ctx.doc.blocks.filter((b) => !b.name.startsWith('*'))
    if (blocks.length === 0) {
      ctx.print('No blocks defined. Use BLOCK first.')
      return
    }
    // Un bloque preseleccionado (o el del doble clic) es el que se edita, sin preguntar.
    const pre = (ctx.app.preselection?.() ?? []).map((id) => ctx.doc.getEntity(id)).find((e) => e?.type === 'INSERT')
    const preName = pre?.type === 'INSERT' && !pre.props.name.startsWith('*') ? pre.props.name : null
    const def = preName ?? blocks[0].name
    const name = preName ?? (await ctx.getString(`Block to edit [${blocks.map((b) => b.name).join(', ')}] <${def}>: `, { default: def }))?.trim()
    if (!name) return
    const block = ctx.doc.getBlock(name)
    if (!block || name.startsWith('*')) {
      ctx.print(`Block "${name}" not found.`)
      return
    }
    session = { name, saved: defJson(block), view: ctx.app.getViewState?.() ?? null }
    ctx.app.clearSelection()
    ctx.doc.setBlockEditor(name)
    if (block.entities.length) ctx.app.zoomExtents()
    ctx.print(`Block Editor: "${name}" (base point at 0,0,0). BSAVE saves it, BCLOSE closes the editor.`)
  },
}

export const bsaveCommand: Command = {
  name: 'BSAVE',
  aliases: [],
  description: 'Save the block open in the Block Editor',
  async run(ctx) {
    const name = ctx.doc.editingBlock
    if (!name) {
      ctx.print('The Block Editor is not open (BEDIT).')
      return
    }
    session = { name, saved: defJson(ctx.doc.getBlock(name)), view: session?.view ?? null }
    ctx.print(`Block "${name}" saved; all its references are updated.`)
  },
}

export const bcloseCommand: Command = {
  name: 'BCLOSE',
  aliases: [],
  description: 'Close the Block Editor, saving or discarding the changes',
  async run(ctx) {
    const name = ctx.doc.editingBlock
    if (!name) {
      ctx.print('The Block Editor is not open (BEDIT).')
      return
    }
    const changed = session?.name !== name || session.saved !== defJson(ctx.doc.getBlock(name))
    if (!changed) {
      close(ctx, true)
      return
    }
    const k = await askKeyword(ctx, `Save changes to block "${name}"? [Save/Discard] <Save>: `, ['Save', 'Discard'], 'Save')
    if (k) close(ctx, k === 'Save')
  },
}

export const blockEditorCommands: Command[] = [beditCommand, bsaveCommand, bcloseCommand]
