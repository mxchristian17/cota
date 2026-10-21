import { viewZ } from './primitives'
import { toVec3 } from '../../math'
import type { Command, CommandContext } from '../types'
import { askAngle, askDistance, textSizeStore } from '../ask'

/** Pide punto de inserción, alto y rotación (grados) — común a TEXT/MTEXT. */
async function insertionHeightRotation(
  ctx: CommandContext,
): Promise<{ position: [number, number, number]; height: number; rotation: number } | null> {
  const p = await ctx.getPoint('Specify start point of text: ')
  if (p.kind !== 'point') return null
  // TEXTSIZE (en el dibujo) y la última rotación: Enter los repite.
  const h = await askDistance(ctx, 'TEXTSIZE', 'Specify height', { base: p.point, store: textSizeStore(ctx), valid: (v) => v > 0 })
  if (h.kind !== 'distance' || h.value <= 0) {
    ctx.print('Invalid text height.')
    return null
  }
  const r = await askAngle(ctx, 'TEXT.rotation', 'Specify rotation angle of text', { base: p.point, initial: 0 })
  if (r.kind !== 'angle') return null
  const rotation = (r.deg * Math.PI) / 180
  return { position: toVec3(p.point), height: h.value, rotation }
}

export const textCommand: Command = {
  name: 'TEXT',
  planar: true,
  aliases: ['DT', 'DTEXT'],
  description: 'Create single-line text',
  async run(ctx) {
    const base = await insertionHeightRotation(ctx)
    if (!base) return
    const txt = await ctx.getString('Enter text: ')
    if (txt === null || txt.trim() === '') {
      ctx.print('No text entered.')
      return
    }
    ctx.doc.addEntity({
      type: 'TEXT',
      layer: ctx.currentLayerId(),
      props: { ...base, text: txt, justify: 'left', normal: viewZ(ctx) },
    })
    ctx.print('Text created.')
  },
}

export const mtextCommand: Command = {
  name: 'MTEXT',
  planar: true,
  aliases: ['MT', 'T'],
  description: 'Create multiline text (enter lines; empty line finishes)',
  async run(ctx) {
    const base = await insertionHeightRotation(ctx)
    if (!base) return
    const lines: string[] = []
    for (;;) {
      const ln = await ctx.getString(`Line ${lines.length + 1} (empty line to finish): `, { default: '' })
      if (ln === null || ln === '') break
      lines.push(ln)
    }
    if (lines.length === 0) {
      ctx.print('No text entered.')
      return
    }
    ctx.doc.addEntity({
      type: 'TEXT',
      layer: ctx.currentLayerId(),
      props: { ...base, text: lines.join('\n'), justify: 'left', normal: viewZ(ctx) },
    })
    ctx.print(`MText created (${lines.length} line(s)).`)
  },
}
