import type { Command } from '../types'
import { BYBLOCK, BYLAYER, CONTINUOUS } from '../../linetype/linetypes'
import { flatshotEntities, nextFlatshotName } from '../../projection/flatshot'

/** Escala de un prompt numérico (`<def>` con Enter; 0 o texto inválido = `def`). */
const factor = (s: string | null, def: number): number => {
  const n = Number((s ?? '').trim().replace(',', '.'))
  return s === null || s.trim() === '' || !isFinite(n) || n === 0 ? def : n
}

/**
 * FLATSHOT, como el CAD clásico: crea una representación 2D de todos los sólidos 3D según la vista actual.
 * El diálogo elige el destino (bloque nuevo, reemplazar un bloque o archivo), el tipo de línea de las
 * líneas visibles y de las ocultas (que se muestran sólo si se pide) y las aristas tangentes. El bloque
 * nuevo se inserta en el plano XY de la UCS actual: punto de inserción, escalas X/Y y rotación.
 */
export const flatshotCommand: Command = {
  name: 'FLATSHOT',
  aliases: [],
  planar: true,
  description: 'Create a 2D representation of the 3D solids in the current view',
  async run(ctx) {
    const opts = await ctx.app.flatshotDialog?.()
    if (!opts) return
    const items = ctx.app.flatshotProject?.({ showObscured: opts.showObscured, tangential: opts.tangential }) ?? []
    if (items.length === 0) {
      ctx.print('No 3D solids to flatten in the current view.')
      return
    }
    // Los tipos de línea elegidos tienen que estar cargados (HIDDEN para las ocultas, por defecto).
    for (const lt of [opts.foregroundLinetype, opts.obscuredLinetype]) {
      const up = lt.toUpperCase()
      if (up !== BYBLOCK && up !== BYLAYER && up !== CONTINUOUS && !ctx.doc.linetypes.some((l) => l.name.toUpperCase() === up)) ctx.doc.loadLinetype(lt)
    }
    const entities = flatshotEntities(items, opts)

    if (opts.destination === 'file') {
      const name = ctx.app.downloadDxf?.(entities, 'flatshot')
      ctx.print(name ? `Flatshot exported to "${name}".` : 'Export is not available.')
      return
    }

    if (opts.destination === 'replace') {
      const ids = await ctx.getSelection('Select the block reference to replace: ')
      if (!ids || ids.length === 0) return
      const ins = ids.map((id) => ctx.doc.getEntity(id)).find((e) => e?.type === 'INSERT')
      if (!ins || ins.type !== 'INSERT') {
        ctx.print('That is not a block reference.')
        return
      }
      ctx.doc.setBlock({ name: ins.props.name, entities })
      ctx.doc.touch()
      ctx.print(`Block "${ins.props.name}" replaced with the flatshot.`)
      return
    }

    const name = nextFlatshotName(ctx.doc.blocks.map((b) => b.name))
    ctx.doc.setBlock({ name, entities })
    const ip = await ctx.getPoint('Specify insertion point: ')
    if (ip.kind !== 'point') {
      ctx.print(`Block "${name}" created (not inserted).`)
      return
    }
    const sx = factor(await ctx.getString('Enter X scale factor <1>: ', { default: '1' }), 1)
    const sy = factor(await ctx.getString('Enter Y scale factor <use X scale factor>: ', { default: '' }), sx)
    const rot = Number((await ctx.getString('Specify rotation angle <0>: ', { default: '0' }))?.trim().replace(',', '.') ?? '0')
    ctx.doc.addEntity({
      type: 'INSERT',
      layer: ctx.currentLayerId(),
      props: { name, position: [ip.point.x, ip.point.y, ip.point.z], scale: [sx, sy, sx], rotation: (isFinite(rot) ? rot : 0) * (Math.PI / 180) },
    })
    ctx.print(`Flatshot block "${name}" inserted.`)
  },
}
