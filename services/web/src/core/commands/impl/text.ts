import { viewZ } from './primitives'
import { toVec3, type Vec3 } from '../../math'
import type { Command, CommandContext, PointResult } from '../types'
import { askAngle, askDistance, textSizeStore } from '../ask'
import { decodeTextCodes } from '../../text/codes'
import { LINE_SPACING, textAxes } from '../../geom/text'
import type { TextProps } from '../../document/types'

type Justify = TextProps['justify']
/** Última justificación de TEXT (como el CAD clásico, se recuerda en la sesión). */
let lastJustify: Justify = 'left'

/** Punto de inserción de TEXT, con la opción Justify (Left/Center/Right sobre la línea base). */
async function textStartPoint(ctx: CommandContext): Promise<{ p: PointResult; justify: Justify }> {
  for (;;) {
    const what = lastJustify === 'left' ? 'start point' : lastJustify === 'center' ? 'center point' : 'right endpoint'
    const p = await ctx.getPoint(`Specify ${what} of text or [Justify]: `, { keywords: ['Justify'] })
    if (p.kind !== 'keyword') return { p, justify: lastJustify }
    const j = await ctx.getPoint('Enter an option [Left/Center/Right]: ', { keywords: ['Left', 'Center', 'Right'] })
    if (j.kind === 'cancel') return { p: j, justify: lastJustify }
    if (j.kind === 'keyword') lastJustify = j.keyword.toLowerCase() as Justify
  }
}

/** Pide punto de inserción, alto y rotación (grados) — común a TEXT/MTEXT. */
async function insertionHeightRotation(
  ctx: CommandContext,
  first?: PointResult,
): Promise<{ position: [number, number, number]; height: number; rotation: number } | null> {
  const p = first ?? (await ctx.getPoint('Specify start point of text: '))
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
  description: 'Create single-line text on its baseline (Justify: Left/Center/Right); each Enter starts a new line, an empty line finishes. %%c = Ø, %%d = °, %%p = ±',
  async run(ctx) {
    const start = await textStartPoint(ctx)
    const base = await insertionHeightRotation(ctx, start.p)
    if (!base) return
    // Como el CAD clásico: cada renglón es un texto aparte, uno debajo del otro; un renglón vacío termina.
    const normal = viewZ(ctx)
    let at: Vec3 = base.position
    let n = 0
    for (;;) {
      const txt = await ctx.getString('Enter text: ', { default: '' })
      if (txt === null || txt.trim() === '') break
      const props: TextProps = { ...base, position: at, text: decodeTextCodes(txt), justify: start.justify, normal, kind: 'text' }
      ctx.doc.addEntity({ type: 'TEXT', layer: ctx.currentLayerId(), props })
      n++
      const { v } = textAxes(props)
      at = [0, 1, 2].map((i) => at[i] - v[i] * base.height * LINE_SPACING) as Vec3
    }
    if (n === 0) ctx.print('No text entered.')
  },
}

export const mtextCommand: Command = {
  name: 'MTEXT',
  planar: true,
  aliases: ['MT', 'T'],
  description: 'Create multiline text from its top-left corner (enter lines; empty line finishes). %%c = Ø, %%d = °, %%p = ±',
  async run(ctx) {
    const base = await insertionHeightRotation(ctx)
    if (!base) return
    const lines: string[] = []
    for (;;) {
      const ln = await ctx.getString(`Line ${lines.length + 1} (empty line to finish): `, { default: '' })
      if (ln === null) return
      if (ln === '') break
      lines.push(decodeTextCodes(ln))
    }
    if (lines.length === 0) {
      ctx.print('No text entered.')
      return
    }
    ctx.doc.addEntity({
      type: 'TEXT',
      layer: ctx.currentLayerId(),
      props: { ...base, text: lines.join('\n'), justify: 'left', normal: viewZ(ctx), kind: 'mtext' },
    })
    ctx.print(`MText created (${lines.length} line(s)).`)
  },
}
