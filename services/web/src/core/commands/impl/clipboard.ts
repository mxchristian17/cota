import { cloneEntityInput, translateEntity } from '../../editing/edit'
import { entityBounds } from '../../editing/bounds'
import { entityPreviewShapes } from '../../editing/entityPreview'
import { selectableEntities } from '../selectionSets'
import type { EntityInput } from '../../document/types'
import type { Pt } from '../../math'
import type { PreviewShape } from '../../preview'
import type { Command, CommandContext } from '../types'

/**
 * Portapapeles del dibujo (COPYCLIP, CUTCLIP, COPYBASE, PASTECLIP, PASTEORIG), como el CAD clásico: guarda copias de
 * los objetos con su punto base (por defecto, la esquina inferior izquierda de lo copiado).
 */
let clip: { items: EntityInput[]; base: Pt } | null = null

/** Sólo para los tests. */
/** ¿Hay objetos en el portapapeles del dibujo? (si no, Ctrl+V en la línea de comandos pega texto, p. ej. un lote). */
export const hasClipboard = (): boolean => !!clip?.items.length

export function resetClipboard(): void {
  clip = null
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
  clip = { items: ents.map(cloneEntityInput), base }
  ctx.print(`${ents.length} object(s) copied to the clipboard.`)
  return ids
}

function paste(ctx: CommandContext, dx: number, dy: number, dz: number): void {
  if (!clip) return
  for (const it of clip.items) {
    const e = ctx.doc.addEntity(structuredClone(it))
    translateEntity(e, dx, dy, dz)
  }
  ctx.doc.touch()
  ctx.print(`${clip.items.length} object(s) pasted.`)
}

const preview = (base: Pt, c: Pt): PreviewShape[] =>
  (clip?.items ?? []).flatMap((it, i) => entityPreviewShapes({ id: `clip${i}`, ...it } as never, c.x - base.x, c.y - base.y, c.z - base.z))

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
    if (!clip) {
      ctx.print('The clipboard is empty.')
      return
    }
    const base = clip.base
    const r = await ctx.getPoint('Specify insertion point: ', { base: null, preview: (c) => preview(base, c) })
    if (r.kind !== 'point') return
    paste(ctx, r.point.x - base.x, r.point.y - base.y, r.point.z - base.z)
  },
}

export const pasteorigCommand: Command = {
  name: 'PASTEORIG',
  aliases: [],
  description: 'Paste the clipboard at its original coordinates',
  async run(ctx) {
    if (!clip) ctx.print('The clipboard is empty.')
    else paste(ctx, 0, 0, 0)
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
