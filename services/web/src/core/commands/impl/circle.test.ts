import { describe, it, expect } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import type { Vec3 } from '../../math'

type C = { center: Vec3; radius: number }
const circles = (h: ReturnType<typeof makeEngine>) => h.ofType('CIRCLE').map((e) => e.props as C)
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('CIRCLE con todos los modos', () => {
  it('centro + Diameter; después Enter repite el radio (CIRCLERAD)', async () => {
    const h = makeEngine()
    await h.run('CIRCLE', '#0,0', 'D', '20')
    await h.run('CIRCLE', '#30,0', '')
    expect(circles(h).map((c) => c.radius)).toEqual([10, 10])
  })

  it('2P: extremos del diámetro', async () => {
    const h = makeEngine()
    await h.run('CIRCLE', '2P', '#0,0', '#10,0')
    const [c] = circles(h)
    expect(c.center[0]).toBeCloseTo(5, 9)
    expect(c.radius).toBeCloseTo(5, 9)
  })

  it('3P: por tres puntos', async () => {
    const h = makeEngine()
    await h.run('CIRCLE', '3P', '#0,0', '#10,0', '#0,10')
    const [c] = circles(h)
    expect(c.center[0]).toBeCloseTo(5, 9)
    expect(c.center[1]).toBeCloseTo(5, 9)
  })

  it('Ttr: tangente a dos líneas con radio, del lado de los clics', async () => {
    const h = makeEngine()
    const a = h.add('LINE', { start: [0, 0, 0], end: [20, 0, 0] })
    const b = h.add('LINE', { start: [0, 0, 0], end: [0, 20, 0] })
    await h.run('CIRCLE', 'T')
    await h.click(5, 0, a.id)
    await h.click(0, 5, b.id)
    await h.run('3')
    const [c] = circles(h)
    expect(c.radius).toBe(3)
    expect(c.center[0]).toBeCloseTo(3, 9)
    expect(c.center[1]).toBeCloseTo(3, 9)
  })

  it('3P con tres tangentes diferidas (Tan, Tan, Tan): incírculo del triángulo 3-4-5', async () => {
    const h = makeEngine()
    await h.run('CIRCLE', '3P')
    const tan = (x: number, y: number, a: Vec3, b: Vec3) => {
      h.engine.submitClick({ x, y, z: 0 }, null, true, false, undefined, { kind: 'tangent', obj: { kind: 'line', a, b }, hint: [x, y, 0] })
      return flush()
    }
    await tan(1, 0, [0, 0, 0], [4, 0, 0])
    await tan(2, 1.5, [4, 0, 0], [0, 3, 0])
    await tan(0, 1, [0, 3, 0], [0, 0, 0])
    const [c] = circles(h)
    expect(c.radius).toBeCloseTo(1, 7)
    expect(c.center[0]).toBeCloseTo(1, 7)
    expect(c.center[1]).toBeCloseTo(1, 7)
  })
})
