import { angleDeg, type Pt, type Vec3 } from '../../math'
import type { Entity } from '../../document/types'
import { entityPreviewShapes } from '../../editing/entityPreview'
import { addTransformed, applyTransform, rotateTransform } from '../../editing/transform'
import type { PreviewShape } from '../../preview'
import type { Command, CommandContext } from '../types'
import { askAngle } from '../ask'

const DEG = Math.PI / 180

/** Fantasma de la selección rotada `deg` grados alrededor de `center`, más la línea base→cursor. */
function rotatePreview(ctx: CommandContext, ids: string[], center: Vec3, deg: number, cursor: Pt): PreviewShape[] {
  const base: Pt = { x: center[0], y: center[1], z: center[2] }
  const shapes: PreviewShape[] = [{ kind: 'line', a: base, b: cursor }]
  const rot = rotateTransform(center, deg * DEG)
  for (const id of ids) {
    const e = ctx.doc.getEntity(id)
    if (!e) continue
    const input = rot(e)
    if (input) shapes.push(...entityPreviewShapes({ ...input, id: e.id } as Entity, 0, 0, 0))
  }
  return shapes
}

export const rotateCommand: Command = {
  name: 'ROTATE',
  planar: true,
  aliases: ['RO'],
  description: 'Rotate selected objects about a base point (Copy/Reference)',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (ids === null || ids.length === 0) return
    const basePt = await ctx.getPoint('Specify base point: ')
    if (basePt.kind !== 'point') return
    const base = basePt.point
    const center: Vec3 = [base.x, base.y, base.z]

    let copy = false
    let deg: number | null = null
    while (deg === null) {
      // Enter repite el último ángulo, como el `<0>` del CAD clásico.
      const r = await askAngle(ctx, 'ROTATE.angle', 'Specify rotation angle or [Copy/Reference]', {
        base,
        initial: 0,
        keywords: ['Copy', 'Reference'],
        preview: (c) => rotatePreview(ctx, ids, center, angleDeg(base, c), c),
      })
      if (r.kind === 'cancel') return
      if (r.kind === 'keyword') {
        if (r.keyword === 'Copy') {
          copy = true
          ctx.print('Rotating a copy of the selected objects.')
          continue
        }
        // Reference: se rota la diferencia entre el ángulo de referencia y el nuevo.
        const ref = await askAngle(ctx, 'ROTATE.reference', 'Specify the reference angle', { base, initial: 0 })
        if (ref.kind !== 'angle') return
        const next = await askAngle(ctx, 'ROTATE.newAngle', 'Specify the new angle', { base, initial: 0 })
        if (next.kind !== 'angle') return
        deg = next.deg - ref.deg
        break
      }
      deg = r.deg
    }

    if (Math.abs(deg % 360) < 1e-9) {
      ctx.print('Rotation angle is 0: nothing changed.')
      return
    }
    const fn = rotateTransform(center, deg * DEG)
    const res = copy ? addTransformed(ctx.doc, ids, fn) : applyTransform(ctx.doc, ids, fn)
    ctx.print(`Rotated ${res.ids.length} object(s) ${Number(deg.toFixed(4))}°${copy ? ' (copy)' : ''}.`)
  },
}
