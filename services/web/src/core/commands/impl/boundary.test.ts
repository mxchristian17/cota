import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import type { PolylineProps } from '../../document/types'

describe('BOUNDARY', () => {
  it('crea la polilínea cerrada del área (con su isla) y, con HPGAPTOL, cierra un hueco chico', async () => {
    const h = makeEngine()
    // Cuadrado 100×100 con un círculo adentro.
    await h.run('LINE', '#0,0', '#100,0', '#100,100', '#0,100', 'C')
    await h.run('CIRCLE', '#50,50', '10')
    const before = h.ofType('POLYLINE').length
    await h.run('BOUNDARY', '#5,5', '')
    const ps = h.ofType('POLYLINE').slice(before).map((e) => e.props as PolylineProps)
    expect(ps.length).toBe(2) // contorno + isla
    expect(ps.every((p) => p.closed)).toBe(true)
    // Un rectángulo abierto: 0,5 de hueco en una esquina.
    await h.run('LINE', '#200,0', '#300,0', '#300,100', '#200,100', '#200,0.5', '')
    await h.run('BOUNDARY', '#250,50', '')
    expect(h.prints.some((l) => l.includes('Valid boundary not found'))).toBe(true)
    const n0 = h.ofType('POLYLINE').length
    await h.run('BOUNDARY', 'A', 'G', '1', '#250,50', '')
    const all = h.ofType('POLYLINE')
    expect(all.length).toBe(n0 + 1)
    const last = all[all.length - 1].props as PolylineProps
    expect(last.closed).toBe(true)
    const xs = last.vertices.map((v) => v[0])
    expect(Math.min(...xs)).toBeCloseTo(200, 6)
    expect(Math.max(...xs)).toBeCloseTo(300, 6)
  })

  it('sin detección de islas: sólo el contorno exterior', async () => {
    const h = makeEngine()
    await h.run('RECTANG', '#0,0', '#100,100')
    await h.run('CIRCLE', '#50,50', '10')
    const n0 = h.ofType('POLYLINE').length
    await h.run('BOUNDARY', 'A', 'I', 'N', '#5,5', '')
    expect(h.ofType('POLYLINE').length).toBe(n0 + 1)
  })
})
