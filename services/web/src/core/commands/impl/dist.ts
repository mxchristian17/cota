import type { PreviewShape } from '../../preview'
import type { Command } from '../types'

const DEG = 180 / Math.PI

/** DIST: mide distancia, ángulos y deltas entre dos puntos (estilo CAD clásico). */
export const distCommand: Command = {
  name: 'DIST',
  aliases: ['DI'],
  description: 'Measure distance and angle between two points',
  async run(ctx) {
    const p1 = await ctx.getPoint('Specify first point: ')
    if (p1.kind !== 'point') return
    const p2 = await ctx.getPoint('Specify second point: ', {
      base: p1.point,
      preview: (c): PreviewShape[] => [{ kind: 'line', a: p1.point, b: c }],
    })
    if (p2.kind !== 'point') return

    const dx = p2.point.x - p1.point.x
    const dy = p2.point.y - p1.point.y
    const dz = p2.point.z - p1.point.z
    const dist = Math.hypot(dx, dy, dz)
    const angXY = ((Math.atan2(dy, dx) * DEG) % 360 + 360) % 360
    const angFromXY = Math.atan2(dz, Math.hypot(dx, dy)) * DEG

    ctx.print(
      `Distance = ${dist.toFixed(4)}, Angle in XY Plane = ${angXY.toFixed(2)}, Angle from XY Plane = ${angFromXY.toFixed(2)}`,
    )
    ctx.print(`Delta X = ${dx.toFixed(4)}, Delta Y = ${dy.toFixed(4)}, Delta Z = ${dz.toFixed(4)}`)
    ctx.app.reportMeasure?.({ a: p1.point, b: p2.point, dist, dx, dy, dz, angXY, angFromXY })
  },
}
