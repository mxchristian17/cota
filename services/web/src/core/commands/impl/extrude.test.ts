import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import type { LoftProps, SweepProps } from '../../document/types'

const rect = (h: ReturnType<typeof makeEngine>) => {
  const r = h.add('RECTANGLE', { corner: [0, 0, 0], width: 10, height: 10 })
  h.setSelection([r.id])
  return r
}

describe('EXTRUDE: opciones del CAD clásico', () => {
  it('Taper angle: los lados se desplazan hacia adentro la misma distancia', async () => {
    const h = makeEngine()
    rect(h)
    await h.run('EXTRUDE', 'T', '10', '10')
    const s = h.ofType('SOLID3D')[0].props as LoftProps
    expect(s.op).toBe('LOFT')
    const off = 10 * Math.tan(Math.PI / 18)
    const top = s.sections[1]
    expect(Math.min(...top.map((p) => p[0]))).toBeCloseTo(off, 9)
    expect(Math.max(...top.map((p) => p[1]))).toBeCloseTo(10 - off, 9)
    expect(top.every((p) => Math.abs(Math.abs(p[2]) - 10) < 1e-9)).toBe(true)
  })

  it('Taper angle demasiado grande: avisa y no crea nada', async () => {
    const h = makeEngine()
    rect(h)
    await h.run('EXTRUDE', 'T', '60', '10')
    expect(h.prints.join('\n')).toContain('the profile would vanish')
    expect(h.ofType('SOLID3D')).toHaveLength(0)
  })

  it('Direction: prisma oblicuo con el perfil en su plano', async () => {
    const h = makeEngine()
    rect(h)
    await h.run('EXTRUDE', 'D', '0,0,0', '5,0,10')
    const s = h.ofType('SOLID3D')[0].props as LoftProps
    expect(s.sections[1][0]).toEqual([5, 0, 10])
  })

  it('Path: barrido por una línea, desde el centroide del perfil', async () => {
    const h = makeEngine()
    const r = h.add('RECTANGLE', { corner: [0, 0, 0], width: 10, height: 10 })
    h.add('LINE', { start: [0, 0, 0], end: [0, 0, 30] })
    h.setSelection([r.id])
    await h.run('EXTRUDE', 'P', 'L', '')
    const s = h.ofType('SOLID3D')[0].props as SweepProps
    expect(s.op).toBe('SWEEP')
    expect(s.path).toEqual([[5, 5, 0], [5, 5, 30]])
  })
})
