import type { Command, CommandContext } from '../types'
import type { Curve } from '../../geom/curve'
import { EditLog } from '../../editing/editLog'
import { arcOf, lengthenTo, targetLength } from '../../editing/lengthen'
import { pickCurve, ptVec } from '../../editing/pickCurve'
import { nearestEnd } from '../../editing/trim'
import { askNumber, fmt } from '../ask'
import { sysvars } from '../sysvars'

const MODES = ['DElta', 'Percent', 'Total', 'DYnamic']
const deg = (rad: number): number => (rad * 180) / Math.PI
const positive = (v: number): string | null => (v > 0 ? null : 'Value must be positive and nonzero.')

function measure(ctx: CommandContext, c: Curve): void {
  const a = arcOf(c)
  ctx.print(`Current length: ${fmt(c.length())}${a ? `, included angle: ${fmt(deg(Math.abs(a.sw)))}` : ''}`)
}

/** Pide el valor del modo elegido (con la variante `Angle` en DElta y Total). False = ESC. */
async function askValue(ctx: CommandContext, mode: string): Promise<boolean> {
  if (mode === 'DYnamic') return true
  if (mode === 'Percent') {
    const r = await askNumber(ctx, `Enter percentage length <${fmt(sysvars.LENGTHENPERCENT)}>: `, { def: sysvars.LENGTHENPERCENT, check: positive })
    if (r?.kind === 'number') sysvars.LENGTHENPERCENT = r.value
    return !!r
  }
  const delta = mode === 'DElta'
  const len = delta ? sysvars.LENGTHENDELTA : sysvars.LENGTHENTOTAL
  const r = await askNumber(ctx, `${delta ? 'Enter delta length' : 'Specify total length'} or [Angle] <${fmt(len)}>: `, {
    keywords: ['Angle'],
    def: len,
    check: delta ? undefined : positive,
  })
  if (!r) return false
  if (r.kind === 'number') {
    if (delta) [sysvars.LENGTHENDELTA, sysvars.LENGTHENDELTAANGLE] = [r.value, null]
    else [sysvars.LENGTHENTOTAL, sysvars.LENGTHENTOTALANGLE] = [r.value, null]
    return true
  }
  const ang = (delta ? sysvars.LENGTHENDELTAANGLE : sysvars.LENGTHENTOTALANGLE) ?? 0
  const a = await askNumber(ctx, `${delta ? 'Enter delta angle' : 'Specify total angle'} <${fmt(ang)}>: `, {
    def: ang,
    check: delta ? undefined : positive,
  })
  if (a?.kind !== 'number') return false
  if (delta) sysvars.LENGTHENDELTAANGLE = a.value
  else sysvars.LENGTHENTOTALANGLE = a.value
  return true
}

/** Longitud final de `c` según el modo vigente; null (con mensaje) si no aplica. */
function wanted(ctx: CommandContext, c: Curve): number | null {
  const mode = sysvars.LENGTHENMODE as 'DElta' | 'Percent' | 'Total'
  const ang = mode === 'DElta' ? sysvars.LENGTHENDELTAANGLE : mode === 'Total' ? sysvars.LENGTHENTOTALANGLE : null
  const value = mode === 'DElta' ? sysvars.LENGTHENDELTA : mode === 'Percent' ? sysvars.LENGTHENPERCENT : sysvars.LENGTHENTOTAL
  const L = targetLength(c, mode, ang ?? value, ang !== null)
  if (L === null) ctx.print('Select an arc.')
  return L
}

/** Bucle `Select an object to change or [Undo]` con el modo ya fijado. */
async function change(ctx: CommandContext): Promise<void> {
  const log = new EditLog(ctx.doc)
  for (;;) {
    const r = await ctx.getPoint('Select an object to change or [Undo]: ', { keywords: ['Undo'] })
    if (r.kind === 'cancel') return
    if (r.kind === 'keyword') {
      if (!log.undo()) ctx.print('Nothing to undo.')
      continue
    }
    const pk = pickCurve(ctx.doc, r.point, r.pick)
    if (!pk) {
      ctx.print('No object found.')
      continue
    }
    if (pk.curve.closed) {
      ctx.print('This object has no length definition.')
      continue
    }
    const end = nearestEnd(pk.curve, pk.t)
    let res: Curve | null
    if (sysvars.LENGTHENMODE === 'DYnamic') {
      const p = await ctx.getPoint('Specify new end point: ')
      if (p.kind !== 'point') return
      res = pk.curve.extendTo(ptVec(p.point), end)
    } else {
      const L = wanted(ctx, pk.curve)
      if (L === null) continue
      res = lengthenTo(pk.curve, end, L)
    }
    const input = res?.toEntity()
    if (input) log.replace(pk.entity, [input])
    else ctx.print(arcOf(pk.curve) ? 'Arc cannot be full 360 degrees.' : 'Invalid length.')
  }
}

/**
 * LENGTHEN: mide o cambia la longitud de líneas, arcos, polilíneas abiertas, arcos de
 * elipse y splines abiertas; modos DElta (longitud o ángulo), Percent, Total (longitud o ángulo)
 * y DYnamic, con Undo dentro del comando.
 */
export const lengthenCommand: Command = {
  name: 'LENGTHEN',
  planar: true,
  aliases: ['LEN'],
  description: 'Change the length of objects and the included angle of arcs',
  async run(ctx) {
    ctx.app.clearSelection()
    for (;;) {
      const r = await ctx.getPoint(`Select an object to measure or [DElta/Percent/Total/DYnamic] <${sysvars.LENGTHENMODE}>: `, {
        keywords: MODES,
        enterKeyword: sysvars.LENGTHENMODE,
      })
      if (r.kind === 'cancel') return
      if (r.kind === 'point') {
        const pk = pickCurve(ctx.doc, r.point, r.pick)
        if (pk) measure(ctx, pk.curve)
        else ctx.print('No object found.')
        continue
      }
      if (!(await askValue(ctx, r.keyword))) return
      sysvars.LENGTHENMODE = r.keyword as typeof sysvars.LENGTHENMODE
      await change(ctx)
      return
    }
  },
}
