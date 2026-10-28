import { commonOf } from '../../document/common'
import type { Vec3 } from '../../math'
import { cloneEntityInput, translateEntity } from '../../editing/edit'
import { polarAngles, polarTranslation, rectangularOffsets, rotateEntityInput } from '../../editing/array'
import type { Command, CommandContext } from '../types'
import { askDistance, fmtShort } from '../ask'
import { recall, remember } from '../memory'

const ORIGIN = { x: 0, y: 0, z: 0 }

/** Cantidad entera con el último valor recordado: Enter lo repite. */
async function askInt(ctx: CommandContext, key: string, label: string, min = 1, initial?: number): Promise<number | null> {
  const r = await askDistance(ctx, key, label, { base: ORIGIN, initial, format: fmtShort, valid: (v) => Math.round(v) >= min })
  if (r.kind !== 'distance') return null
  return Math.max(min, Math.round(r.value))
}

async function askNum(ctx: CommandContext, key: string, label: string, initial?: number): Promise<number | null> {
  const r = await askDistance(ctx, key, label, { base: ORIGIN, initial })
  return r.kind === 'distance' ? r.value : null
}

async function rectangularArray(ctx: CommandContext, ids: string[]): Promise<void> {
  const rows = await askInt(ctx, 'ARRAY.rows', 'Enter number of rows', 1, 1)
  if (rows === null) return
  const cols = await askInt(ctx, 'ARRAY.columns', 'Enter number of columns', 1, 1)
  if (cols === null) return
  const dRow = await askNum(ctx, 'ARRAY.rowSpacing', 'Enter row spacing (Y)')
  if (dRow === null) return
  const dCol = await askNum(ctx, 'ARRAY.columnSpacing', 'Enter column spacing (X)')
  if (dCol === null) return

  const offsets = rectangularOffsets(rows, cols, dRow, dCol)
  let n = 0
  for (const id of ids) {
    const e = ctx.doc.getEntity(id)
    if (!e) continue
    for (const o of offsets) {
      const created = ctx.doc.addEntity(cloneEntityInput(e))
      translateEntity(created, o.dx, o.dy)
      n++
    }
  }
  ctx.print(`ARRAY: ${n} copies (${rows}×${cols}).`)
}

async function polarArray(ctx: CommandContext, ids: string[]): Promise<void> {
  const center = await ctx.getPoint('Specify center of array: ')
  if (center.kind !== 'point') return
  const count = await askInt(ctx, 'ARRAY.items', 'Enter number of items (incl. original)', 2)
  if (count === null) return
  const fill = await askNum(ctx, 'ARRAY.fill', 'Enter angle to fill (deg)', 360)
  if (fill === null) return
  const rot = await ctx.getPoint('Rotate items as copied? [Yes/No] <Yes>: ', { keywords: ['Yes', 'No'], enterKeyword: 'Yes' })
  if (rot.kind === 'cancel') return
  const rotate = !(rot.kind === 'keyword' && rot.keyword.toLowerCase() === 'no')

  const c: Vec3 = [center.point.x, center.point.y, center.point.z]
  const angles = polarAngles(count, fill === 0 ? 360 : fill)
  let n = 0
  for (const id of ids) {
    const e = ctx.doc.getEntity(id)
    if (!e) continue
    for (const ang of angles) {
      if (rotate) {
        ctx.doc.addEntity({ ...rotateEntityInput(e, c, ang), ...commonOf(e) })
      } else {
        const created = ctx.doc.addEntity(cloneEntityInput(e))
        const t = polarTranslation(e, c, ang)
        translateEntity(created, t.dx, t.dy)
      }
      n++
    }
  }
  ctx.print(`ARRAY: ${n} copies (polar, ${count} items).`)
}

export const arrayCommand: Command = {
  name: 'ARRAY',
  planar: true,
  aliases: ['AR'],
  description: 'Array selected objects [Rectangular/Polar]',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (ids === null || ids.length === 0) return
    // El tipo también se recuerda: Enter repite el último.
    const last = recall('ARRAY.polar') === 1 ? 'Polar' : 'Rectangular'
    const mode = await ctx.getPoint(`Array type [Rectangular/Polar] <${last}>: `, {
      keywords: ['Rectangular', 'Polar'],
      enterKeyword: last,
    })
    if (mode.kind !== 'keyword') return
    const polar = mode.keyword.toLowerCase() === 'polar'
    remember('ARRAY.polar', polar ? 1 : 0)
    if (polar) {
      await polarArray(ctx, ids)
    } else {
      await rectangularArray(ctx, ids)
    }
    ctx.app.clearSelection()
  },
}
