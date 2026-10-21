import { cloneEntityInput, scaleEntity, translateEntity } from '../../editing/edit'
import { entityPreviewShapes } from '../../editing/entityPreview'
import type { PreviewShape } from '../../preview'
import type { Pt, Vec3 } from '../../math'
import type { CommandContext, Command } from '../types'
import { askDistance } from '../ask'

/** Preview de MOVE/COPY: línea base→cursor + fantasma de la selección desplazada. */
function movePreview(ctx: CommandContext, ids: string[], base: Pt, cursor: Pt): PreviewShape[] {
  const dx = cursor.x - base.x
  const dy = cursor.y - base.y
  const dz = cursor.z - base.z
  const shapes: PreviewShape[] = [{ kind: 'line', a: base, b: cursor }]
  for (const id of ids) {
    const e = ctx.doc.getEntity(id)
    if (e) shapes.push(...entityPreviewShapes(e, dx, dy, dz))
  }
  return shapes
}

export const selectCommand: Command = {
  name: 'SELECT',
  aliases: ['SE'],
  description: 'Select objects',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (ids === null) return
    ctx.print(`${ids.length} object(s) selected.`)
  },
}

/** SELECTALL (Edición ▸ Seleccionar todo, Ctrl+A): deja seleccionado todo lo seleccionable. */
export const selectAllCommand: Command = {
  name: 'SELECTALL',
  aliases: [],
  description: 'Select all objects (Ctrl+A)',
  async run(ctx) {
    const n = ctx.app.selectAll?.() ?? 0
    ctx.print(`${n} object(s) selected.`)
  },
}

export const eraseCommand: Command = {
  name: 'ERASE',
  aliases: ['E'],
  description: 'Erase selected objects',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (ids === null || ids.length === 0) return
    for (const id of ids) ctx.doc.removeEntity(id)
    ctx.app.clearSelection()
    ctx.print(`Erased ${ids.length} object(s).`)
  },
}

export const moveCommand: Command = {
  name: 'MOVE',
  aliases: ['M'],
  description: 'Move selected objects',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (ids === null || ids.length === 0) return
    const base = await ctx.getPoint('Specify base point: ')
    if (base.kind !== 'point') return
    const dest = await ctx.getPoint('Specify destination: ', {
      base: base.point,
      preview: (c) => movePreview(ctx, ids, base.point, c),
    })
    if (dest.kind !== 'point') return
    const dx = dest.point.x - base.point.x
    const dy = dest.point.y - base.point.y
    const dz = dest.point.z - base.point.z
    for (const id of ids) {
      const e = ctx.doc.getEntity(id)
      if (e) translateEntity(e, dx, dy, dz)
    }
    ctx.doc.touch()
    ctx.print(`Moved ${ids.length} object(s).`)
  },
}

export const copyCommand: Command = {
  name: 'COPY',
  aliases: ['CO', 'CP'],
  description: 'Copy selected objects (repeats until Esc)',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (ids === null || ids.length === 0) return
    const base = await ctx.getPoint('Specify base point: ')
    if (base.kind !== 'point') return
    // Modo múltiple (CAD clásico): cada punto crea una copia respecto del mismo base; sigue hasta Esc.
    let copies = 0
    for (;;) {
      const dest = await ctx.getPoint('Specify second point (Esc to end): ', {
        base: base.point,
        preview: (c) => movePreview(ctx, ids, base.point, c),
      })
      if (dest.kind !== 'point') break
      const dx = dest.point.x - base.point.x
      const dy = dest.point.y - base.point.y
      const dz = dest.point.z - base.point.z
      for (const id of ids) {
        const e = ctx.doc.getEntity(id)
        if (e) {
          const created = ctx.doc.addEntity(cloneEntityInput(e))
          translateEntity(created, dx, dy, dz)
        }
      }
      ctx.doc.touch()
      copies++
    }
    ctx.print(copies ? `Copied ${ids.length} object(s) ${copies} time(s).` : 'Nothing copied.')
  },
}

export const scaleCommand: Command = {
  name: 'SCALE',
  aliases: ['SC'],
  description: 'Scale selected objects about a base point (factor or Reference)',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (ids === null || ids.length === 0) return
    const base = await ctx.getPoint('Specify base point: ')
    if (base.kind !== 'point') return
    const c: Vec3 = [base.point.x, base.point.y, base.point.z]
    // Enter repite el último factor; la primera vez, 1.
    const sf = await askDistance(ctx, 'SCALE.factor', 'Specify scale factor or [Reference]', {
      base: base.point,
      keywords: ['Reference'],
      initial: 1,
      valid: (v) => v > 0,
    })
    let factor: number
    if (sf.kind === 'keyword') {
      const ref = await askDistance(ctx, 'SCALE.reference', 'Specify reference length', { base: base.point, initial: 1, valid: (v) => v > 0 })
      if (ref.kind !== 'distance' || ref.value <= 0) {
        ctx.print('Invalid reference length.')
        return
      }
      const neu = await askDistance(ctx, 'SCALE.newLength', 'Specify new length', { base: base.point, initial: 1, valid: (v) => v > 0 })
      if (neu.kind !== 'distance' || neu.value <= 0) {
        ctx.print('Invalid new length.')
        return
      }
      factor = neu.value / ref.value
    } else if (sf.kind === 'distance') {
      factor = sf.value
    } else {
      return
    }
    if (!(factor > 0)) {
      ctx.print('Invalid scale factor.')
      return
    }
    for (const id of ids) {
      const e = ctx.doc.getEntity(id)
      if (e) scaleEntity(e, c, factor)
    }
    ctx.doc.touch()
    ctx.print(`Scaled ${ids.length} object(s) by ${factor.toFixed(4)}.`)
  },
}

export const undoCommand: Command = {
  name: 'UNDO',
  aliases: ['U'],
  description: 'Undo the last command',
  async run(ctx) {
    ctx.app.undo()
  },
}

export const redoCommand: Command = {
  name: 'REDO',
  aliases: [],
  description: 'Redo the last undone command',
  async run(ctx) {
    ctx.app.redo()
  },
}
