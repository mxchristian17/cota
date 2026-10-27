import { commonOf } from '../../document/common'
import type { Entity, EntityInput } from '../../document/types'
import type { Command, CommandContext } from '../types'
import type { Curve } from '../../geom/curve'
import { EditLog } from '../../editing/editLog'
import { offsetCurve, offsetSide } from '../../editing/offset'
import { pickCurve, ptVec } from '../../editing/pickCurve'
import { askKeyword, askNumber, fmt } from '../ask'
import { sysvars } from '../sysvars'

const through = (): boolean => sysvars.OFFSETDIST < 0

/** Pide distancia / Through / Erase / Layer hasta obtener una distancia o Through. False = ESC. */
async function askDistance(ctx: CommandContext): Promise<boolean> {
  for (;;) {
    const def = through() ? 'Through' : fmt(sysvars.OFFSETDIST)
    const r = await askNumber(ctx, `Specify offset distance or [Through/Erase/Layer] <${def}>: `, {
      keywords: ['Through', 'Erase', 'Layer'],
      def: through() ? 'Through' : sysvars.OFFSETDIST,
      check: (v) => (v > 0 ? null : 'Value must be positive and nonzero.'),
    })
    if (!r) return false
    if (r.kind === 'number') {
      sysvars.OFFSETDIST = r.value
      return true
    }
    if (r.keyword === 'Through') {
      sysvars.OFFSETDIST = -1
      return true
    }
    if (r.keyword === 'Erase') {
      const k = await askKeyword(ctx, `Erase source object after offsetting? [Yes/No] <${sysvars.OFFSETERASE ? 'Yes' : 'No'}>: `, ['Yes', 'No'], sysvars.OFFSETERASE ? 'Yes' : 'No')
      if (!k) return false
      sysvars.OFFSETERASE = k === 'Yes' ? 1 : 0
    } else {
      const k = await askKeyword(ctx, `Enter layer option for offset objects [Current/Source] <${sysvars.OFFSETLAYER}>: `, ['Current', 'Source'], sysvars.OFFSETLAYER)
      if (!k) return false
      sysvars.OFFSETLAYER = k as typeof sysvars.OFFSETLAYER
    }
  }
}

/**
 * Crea la paralela de `src` del lado de `side` (y la distancia hasta ese punto, en modo Through).
 * Devuelve la primera entidad creada (para `Multiple`) o null si no se pudo.
 */
function offsetOnce(ctx: CommandContext, log: EditLog, src: Entity, curve: Curve, side: { x: number; y: number; z: number }): Entity | null {
  const p = ptVec(side)
  const dist = through() ? curve.distanceTo(p) : sysvars.OFFSETDIST
  const curves = offsetCurve(curve, dist * offsetSide(curve, p), sysvars.OFFSETGAPTYPE)
  const layer = sysvars.OFFSETLAYER === 'Current' ? ctx.currentLayerId() : src.layer
  const inputs = curves.map((c) => c.toEntity()).filter((x) => x !== null)
  if (!inputs.length) {
    ctx.print('Cannot offset that object.')
    return null
  }
  const size = log.size
  const ids = log.add(inputs.map((i) => ({ ...i, layer, ...commonOf(src) }) as EntityInput))
  if (sysvars.OFFSETERASE) {
    log.erase([src.id])
    log.squash(size)
  }
  return ctx.doc.getEntity(ids[0]) ?? null
}

/**
 * `Multiple`: repite el desplazamiento hasta Enter; cada copia sale de la anterior (círculos
 * concéntricos, paralelas equidistantes). False si el usuario eligió `Exit` o canceló.
 */
async function multiple(ctx: CommandContext, log: EditLog, first: Entity): Promise<boolean> {
  const stack: Entity[] = [first]
  const what = through() ? 'Specify through point' : 'Specify point on side to offset'
  for (;;) {
    const r = await ctx.getPoint(`${what} or [Exit/Undo] <next object>: `, { keywords: ['Exit', 'Undo'] })
    if (r.kind === 'cancel') return true
    if (r.kind === 'keyword') {
      if (r.keyword === 'Exit') return false
      if (stack.length > 1 && log.undo()) stack.pop()
      continue
    }
    const src = stack[stack.length - 1]
    const curve = pickCurve(ctx.doc, r.point, { id: src.id, raw: r.point, shift: false })?.curve
    if (!curve) return true
    const made = offsetOnce(ctx, log, src, curve, r.point)
    if (made) stack.push(made)
  }
}

/**
 * OFFSET: paralelas con las opciones del CAD clásico (distancia o Through, Erase, Layer,
 * Multiple, Undo) y `OFFSETGAPTYPE` para las esquinas exteriores de las polilíneas.
 */
export const offsetCommand: Command = {
  name: 'OFFSET',
  planar: true,
  aliases: ['O'],
  description: 'Create concentric circles, parallel lines and parallel curves',
  async run(ctx) {
    ctx.print(
      `Current settings: Erase source=${sysvars.OFFSETERASE ? 'Yes' : 'No'}  Layer=${sysvars.OFFSETLAYER}  OFFSETGAPTYPE=${sysvars.OFFSETGAPTYPE}`,
    )
    if (!(await askDistance(ctx))) return
    ctx.app.clearSelection()
    const log = new EditLog(ctx.doc)
    const what = through() ? 'Specify through point' : 'Specify point on side to offset'
    for (;;) {
      const r = await ctx.getPoint('Select object to offset or [Exit/Undo] <Exit>: ', { keywords: ['Exit', 'Undo'] })
      if (r.kind === 'cancel' || (r.kind === 'keyword' && r.keyword === 'Exit')) return
      if (r.kind === 'keyword') {
        if (!log.undo()) ctx.print('Nothing to undo.')
        continue
      }
      const pk = pickCurve(ctx.doc, r.point, r.pick)
      if (!pk) {
        ctx.print('Cannot offset that object.')
        continue
      }
      ctx.markPicked([pk.entity.id])
      const s = await ctx.getPoint(`${what} or [Exit/Multiple/Undo] <Exit>: `, { keywords: ['Exit', 'Multiple', 'Undo'] })
      if (s.kind === 'cancel' || (s.kind === 'keyword' && s.keyword === 'Exit')) return
      if (s.kind === 'keyword' && s.keyword === 'Undo') {
        log.undo()
        continue
      }
      if (s.kind === 'keyword') {
        if (!(await multiple(ctx, log, pk.entity))) return
        continue
      }
      offsetOnce(ctx, log, pk.entity, pk.curve, s.point)
    }
  },
}

/** OFFSETGAPTYPE: cómo se cierran las esquinas exteriores al desplazar polilíneas (0/1/2). */
export const offsetGapTypeCommand: Command = {
  name: 'OFFSETGAPTYPE',
  aliases: [],
  description: 'Gap fill when offsetting polylines: 0 extend, 1 fillet, 2 chamfer',
  async run(ctx) {
    const r = await askNumber(ctx, `Enter new value for OFFSETGAPTYPE <${sysvars.OFFSETGAPTYPE}>: `, {
      def: sysvars.OFFSETGAPTYPE,
      check: (v) => ([0, 1, 2].includes(v) ? null : 'Requires an integer between 0 and 2.'),
    })
    if (r?.kind === 'number') sysvars.OFFSETGAPTYPE = r.value as 0 | 1 | 2
  },
}
