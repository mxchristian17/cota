import { describe, expect, it } from 'vitest'
import { autodim, type Geo2D } from './autodim'
import { makeEngine } from '../../test/engineHarness'
import type { DimensionProps } from '../document/types'

const rect = (x0: number, y0: number, x1: number, y1: number): Geo2D[] => [
  { kind: 'line', a: [x0, y0], b: [x1, y0] },
  { kind: 'line', a: [x1, y0], b: [x1, y1] },
  { kind: 'line', a: [x1, y1], b: [x0, y1] },
  { kind: 'line', a: [x0, y1], b: [x0, y0] },
]
const opts = { type: 'baseline' as const, features: 'all' as const, axes: { x: true, y: true }, offset: 7.5, step: 7, tol: 1e-6 }

describe('AUTODIM', () => {
  it('placa con dos agujeros iguales y un radio: totales, posiciones en paralelo, 2× ⌀ y R', () => {
    const geo: Geo2D[] = [
      ...rect(0, 0, 60, 30),
      { kind: 'circle', c: [15, 15], r: 4 },
      { kind: 'circle', c: [45, 15], r: 4 },
      { kind: 'arc', c: [55, 25], r: 5, a0: 0, a1: Math.PI / 2 }, // empalme de la esquina
    ]
    const reqs = autodim(geo, opts)
    const lin = reqs.filter((r) => r.kind === 'linear')
    const xs = lin.filter((r) => r.kind === 'linear' && r.axis === 'x').map((r) => (r.kind === 'linear' ? r.p2[0] : 0))
    const ys = lin.filter((r) => r.kind === 'linear' && r.axis === 'y').map((r) => (r.kind === 'linear' ? r.p2[1] : 0))
    expect(xs).toEqual([15, 45, 60]) // centros y total, desde x = 0
    expect(ys).toEqual([15, 30])
    for (const r of lin) if (r.kind === 'linear') expect(r.axis === 'x' ? r.p1[0] : r.p1[1]).toBe(0) // todas desde el datum
    // La total queda en la fila más alejada.
    const total = lin.find((r) => r.kind === 'linear' && r.axis === 'x' && r.p2[0] === 60)!
    expect(total.at[1]).toBeCloseTo(-7.5 - 2 * 7, 9)
    const dia = reqs.filter((r) => r.kind === 'diameter')
    expect(dia).toHaveLength(1)
    expect(dia[0].kind === 'diameter' && dia[0].count).toBe(2)
    expect(reqs.filter((r) => r.kind === 'radius')).toHaveLength(1)
  })

  it('en cadena y sólo totales; una proyectada no repite el eje que comparte con su madre', () => {
    const geo: Geo2D[] = [...rect(0, 0, 50, 20), { kind: 'line', a: [20, 0], b: [20, 20] }]
    const chain = autodim(geo, { ...opts, type: 'chain' }).filter((r) => r.kind === 'linear' && r.axis === 'x')
    expect(chain.map((r) => (r.kind === 'linear' ? [r.p1[0], r.p2[0]] : []))).toEqual([[0, 20], [20, 50], [0, 50]])
    const overall = autodim(geo, { ...opts, features: 'overall' })
    expect(overall).toHaveLength(2)
    expect(autodim(geo, { ...opts, axes: { x: false, y: true } }).every((r) => r.kind !== 'linear' || r.axis === 'y')).toBe(true)
  })

  it('el comando acota la geometría elegida en el modelo', async () => {
    const h = makeEngine()
    await h.run('RECTANGLE', '0,0', '#60,30')
    await h.run('CIRCLE', '15,15', '4')
    h.setSelection(h.doc.entities.map((e) => e.id))
    await h.run('AUTODIM', '', '')
    const dims = h.ofType('DIMENSION').map((e) => e.props as DimensionProps)
    expect(dims.filter((d) => d.dimType === 'LINEAR')).toHaveLength(4) // X: 15, 60 · Y: 15, 30
    expect(dims.filter((d) => d.dimType === 'DIAMETER')).toHaveLength(1)
  })
})
