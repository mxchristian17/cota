import type { Command, CommandContext } from '../types'
import type { Vec3 } from '../../math'
import { askNumber, fmt } from '../ask'
import { sysvars } from '../sysvars'
import { pickCurve } from '../../editing/pickCurve'
import type { Curve } from '../../geom/curve'

const modes = () => `Current point modes:  PDMODE=${sysvars.PDMODE}  PDSIZE=${fmt(sysvars.PDSIZE)}`

/** POINT: un punto en el dibujo, con la marca de PDMODE/PDSIZE; da snap NODE. */
export const pointCommand: Command = {
  name: 'POINT',
  aliases: ['PO'],
  description: 'Place a point object (its look is set by PDMODE and PDSIZE; it snaps as NODE)',
  async run(ctx) {
    ctx.print(modes())
    const r = await ctx.getPoint('Specify a point: ')
    if (r.kind !== 'point') return
    ctx.doc.addEntity({ type: 'POINT', layer: ctx.currentLayerId(), props: { position: [r.point.x, r.point.y, r.point.z] } })
  },
}

/** Parámetro de la curva a la longitud `s` desde su inicio (la longitud crece con el parámetro). */
function paramAtLength(c: Curve, s: number): number {
  let lo = 0
  let hi = c.n
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (c.length(0, mid) < s) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Elige con un clic el objeto a dividir o medir (líneas, arcos, círculos, polilíneas, splines, elipses). */
async function pickObject(ctx: CommandContext, prompt: string): Promise<{ curve: Curve; t: number } | null> {
  for (;;) {
    const r = await ctx.getPoint(prompt)
    if (r.kind !== 'point') return null
    const pk = pickCurve(ctx.doc, r.point, r.pick)
    if (pk) return { curve: pk.curve, t: pk.t }
    ctx.print('Cannot divide or measure that object.')
  }
}

const addPoints = (ctx: CommandContext, pts: Vec3[]) => {
  for (const p of pts) ctx.doc.addEntity({ type: 'POINT', layer: ctx.currentLayerId(), props: { position: p } })
}

/** DIVIDE: puntos que parten el objeto en N tramos de igual longitud (no lo corta). */
export const divideCommand: Command = {
  name: 'DIVIDE',
  planar: true,
  aliases: ['DIV'],
  description: 'Place points that divide an object into equal-length segments',
  async run(ctx) {
    const o = await pickObject(ctx, 'Select object to divide: ')
    if (!o) return
    const r = await askNumber(ctx, 'Enter the number of segments: ', {
      check: (v) => (Number.isInteger(v) && v >= 2 && v <= 32767 ? null : 'Requires an integer between 2 and 32767.'),
    })
    if (r?.kind !== 'number') return
    const n = r.value
    const L = o.curve.length()
    // Un objeto cerrado lleva N puntos (el primero en su inicio); uno abierto, N − 1 entre sus extremos.
    const ks = o.curve.closed ? Array.from({ length: n }, (_, i) => i) : Array.from({ length: n - 1 }, (_, i) => i + 1)
    addPoints(ctx, ks.map((k) => o.curve.pointAt(paramAtLength(o.curve, (L * k) / n))))
    if (sysvars.PDMODE === 0) ctx.print('Tip: set PDMODE to 3 to see the points as crosses.')
  },
}

/** MEASURE: puntos cada cierta longitud, desde el extremo más cercano al clic. */
export const measureCommand: Command = {
  name: 'MEASURE',
  planar: true,
  aliases: ['ME'],
  description: 'Place points at measured intervals along an object, from the end nearest the pick',
  async run(ctx) {
    const o = await pickObject(ctx, 'Select object to measure: ')
    if (!o) return
    const r = await askNumber(ctx, 'Specify length of segment: ', { check: (v) => (v > 0 ? null : 'Requires a positive length.') })
    if (r?.kind !== 'number') return
    const step = r.value
    const L = o.curve.length()
    // En uno abierto se empieza por el extremo más cercano al clic (como el CAD clásico).
    const fromEnd = !o.curve.closed && o.curve.length(0, o.t) > L / 2
    const pts: Vec3[] = []
    for (let s = step; s < L - 1e-9 * Math.max(1, L); s += step) pts.push(o.curve.pointAt(paramAtLength(o.curve, fromEnd ? L - s : s)))
    if (pts.length === 0) {
      ctx.print('The segment is longer than the object.')
      return
    }
    addPoints(ctx, pts)
  },
}

/** PDMODE y PDSIZE: estilo y tamaño de los POINT (redibujan los que ya hay). */
export const pointVarCommands: Command[] = [
  {
    name: 'PDMODE',
    aliases: [],
    description: 'Point style: 0 dot, 1 none, 2 plus, 3 cross, 4 tick; add 32 for a circle and 64 for a square',
    async run(ctx) {
      const r = await askNumber(ctx, `Enter new value for PDMODE <${sysvars.PDMODE}>: `, {
        def: sysvars.PDMODE,
        check: (v) => (Number.isInteger(v) && [0, 1, 2, 3, 4].includes(v & 31) && (v & ~(31 | 32 | 64)) === 0 && (v & 31) <= 4 ? null : 'Valid values: 0–4, plus 32 and/or 64.'),
      })
      if (r?.kind !== 'number') return
      sysvars.PDMODE = r.value
      ctx.doc.touch()
    },
  },
  {
    name: 'PDSIZE',
    aliases: [],
    description: 'Point size: 0 = 5% of the view, negative = % of the view, positive = drawing units',
    async run(ctx) {
      const r = await askNumber(ctx, `Enter new value for PDSIZE <${fmt(sysvars.PDSIZE)}>: `, { def: sysvars.PDSIZE })
      if (r?.kind !== 'number') return
      sysvars.PDSIZE = r.value
      ctx.doc.touch()
    },
  },
]
