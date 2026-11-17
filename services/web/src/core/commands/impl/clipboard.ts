import { entityBounds } from '../../editing/bounds'
import { entityPreviewShapes } from '../../editing/entityPreview'
import { makeClip, pasteClip, type ClipData } from '../../editing/clipData'
import { loadSharedClip, onSharedClip, shareClip, sharedClipMeta, type ClipMeta } from '../../io/sharedClipboard'
import { selectableEntities } from '../selectionSets'
import { blockContains } from './bedit'
import type { Pt } from '../../math'
import type { PreviewShape } from '../../preview'
import type { Command, CommandContext } from '../types'

/**
 * Portapapeles del dibujo (COPYCLIP, CUTCLIP, COPYBASE, PASTECLIP, PASTEORIG), como el CAD clásico: guarda copias de
 * los objetos con su punto base (por defecto, la esquina inferior izquierda de lo copiado) y lo que necesitan en otro
 * dibujo (sus bloques y sus capas, ver `clipData`). Sobrevive a OPEN/NEW (se pega en otro dibujo) y lo comparten las
 * pestañas del navegador (ver `sharedClipboard`): se pega la copia más nueva de todas.
 */
let clip: ClipData | null = null
/** Una copia más nueva hecha en otra pestaña (avisada por el canal, o hallada al abrir ésta): se trae al pegar. */
let announced: ClipMeta | null = null

/**
 * Al abrir una pestaña, una copia de otra cuenta para Ctrl+V sólo si es reciente (una de hace días no le gana al texto
 * que se haya copiado después en otra aplicación); PASTECLIP la pega igual.
 */
const FRESH_MS = 60 * 60 * 1000

const newer = (m: ClipMeta): boolean => m.id !== clip?.id && (!clip || m.at > clip.at)
onSharedClip((m) => {
  if (newer(m)) announced = m
})
void sharedClipMeta().then((m) => {
  if (m && newer(m) && Date.now() - m.at < FRESH_MS) announced = m
})

/** ¿Hay objetos en el portapapeles? (si no, Ctrl+V en la línea de comandos pega texto, p. ej. un lote). */
export const hasClipboard = (): boolean => !!clip?.items.length || !!announced

/** Sólo para los tests. */
export function resetClipboard(): void {
  clip = null
  announced = null
}

/**
 * La copia a pegar: la de esta pestaña, o la de otra si es más nueva. Las pestañas abiertas avisan cada copia: sin aviso,
 * la de esta pestaña es la última y no hace falta leer nada (el prompt sale enseguida: lo que se teclea a continuación
 * no se pierde).
 */
async function currentClip(): Promise<ClipData | null> {
  if (clip && !announced) return clip
  const m = await sharedClipMeta()
  if (m && newer(m)) {
    const shared = await loadSharedClip()
    if (shared?.id === m.id && Array.isArray(shared.items)) clip = shared
  }
  announced = null
  return clip
}

async function store(ctx: CommandContext, askBase: boolean): Promise<string[] | null> {
  const ids = await ctx.getSelection('Select objects: ')
  if (!ids?.length) return null
  const ents = ids.map((id) => ctx.doc.getEntity(id)).filter((e) => !!e)
  let base: Pt
  if (askBase) {
    const r = await ctx.getPoint('Specify base point: ', { base: null })
    if (r.kind !== 'point') return null
    base = r.point
  } else {
    const b = ents.map(entityBounds).filter((x) => Number.isFinite(x.minX))
    base = { x: Math.min(...b.map((x) => x.minX)), y: Math.min(...b.map((x) => x.minY)), z: 0 }
  }
  const copy = makeClip(ctx.doc, ents, base)
  clip = copy
  announced = null
  ctx.print(`${ents.length} object(s) copied to the clipboard.`)
  // Para las otras pestañas (después del comando: una copia grande tarda en guardarse).
  setTimeout(() => {
    void shareClip(copy).then((ok) => {
      if (ok === false) ctx.print('The copy could not be shared with other tabs (browser storage full or blocked): paste it in this tab.')
    })
  }, 0)
  return ids
}

function paste(ctx: CommandContext, c: ClipData, dx: number, dy: number, dz: number): void {
  const editing = ctx.doc.editingBlock
  // En el editor de bloques, un bloque no puede quedar conteniéndose a sí mismo (como INSERT).
  const r = pasteClip(ctx.doc, c, { x: dx, y: dy, z: dz }, editing ? (name) => blockContains(ctx.doc, name, editing) : undefined)
  ctx.doc.touch()
  if (r.addedLayers.length) ctx.print(`${r.addedLayers.length} layer(s) added: ${r.addedLayers.join(', ')}.`)
  if (r.addedBlocks.length) ctx.print(`${r.addedBlocks.length} block definition(s) added: ${r.addedBlocks.join(', ')}.`)
  for (const name of r.keptBlocks) ctx.print(`Block "${name}" already exists in this drawing with another definition: the drawing's one is kept.`)
  if (r.missingRefs) ctx.print(`${r.missingRefs} block reference(s) not pasted: block ${r.missing.map((n) => `"${n}"`).join(', ')} not defined.`)
  if (r.skipped) ctx.print(`${r.skipped} block reference(s) not pasted: a block cannot contain itself.`)
  ctx.print(`${r.ids.length} object(s) pasted.`)
}

const preview = (c: ClipData, p: Pt): PreviewShape[] =>
  c.items.flatMap((it, i) => entityPreviewShapes({ id: `clip${i}`, ...it } as never, p.x - c.base.x, p.y - c.base.y, p.z - c.base.z))

export const copyclipCommand: Command = {
  name: 'COPYCLIP',
  aliases: [],
  description: 'Copy objects to the clipboard (Ctrl+C)',
  async run(ctx) {
    await store(ctx, false)
  },
}

export const cutclipCommand: Command = {
  name: 'CUTCLIP',
  aliases: [],
  description: 'Copy objects to the clipboard and erase them (Ctrl+X)',
  async run(ctx) {
    const ids = await store(ctx, false)
    for (const id of ids ?? []) ctx.doc.removeEntity(id)
    if (ids) ctx.doc.touch()
  },
}

export const copybaseCommand: Command = {
  name: 'COPYBASE',
  aliases: [],
  description: 'Copy objects to the clipboard with a base point (Ctrl+Shift+C)',
  async run(ctx) {
    await store(ctx, true)
  },
}

export const pasteclipCommand: Command = {
  name: 'PASTECLIP',
  aliases: [],
  description: 'Paste the clipboard at an insertion point (Ctrl+V)',
  async run(ctx) {
    const c = await currentClip()
    if (!c) {
      ctx.print('The clipboard is empty.')
      return
    }
    const r = await ctx.getPoint('Specify insertion point: ', { base: null, preview: (p) => preview(c, p) })
    if (r.kind !== 'point') return
    paste(ctx, c, r.point.x - c.base.x, r.point.y - c.base.y, r.point.z - c.base.z)
  },
}

export const pasteorigCommand: Command = {
  name: 'PASTEORIG',
  aliases: [],
  description: 'Paste the clipboard at its original coordinates',
  async run(ctx) {
    const c = await currentClip()
    if (!c) ctx.print('The clipboard is empty.')
    else paste(ctx, c, 0, 0, 0)
  },
}

export const selectsimilarCommand: Command = {
  name: 'SELECTSIMILAR',
  aliases: [],
  description: 'Select every object of the same type and layer as the selected ones',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (!ids?.length) return
    const keys = new Set(ids.map((id) => ctx.doc.getEntity(id)).filter((e) => !!e).map((e) => `${e.type}|${e.layer}`))
    const similar = selectableEntities(ctx.doc).filter((e) => keys.has(`${e.type}|${e.layer}`)).map((e) => e.id)
    ctx.app.selectIds?.(similar)
    ctx.print(`${similar.length} object(s) selected.`)
  },
}

export const clipboardCommands: Command[] = [copyclipCommand, cutclipCommand, copybaseCommand, pasteclipCommand, pasteorigCommand, selectsimilarCommand]
