import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import type { ConeProps, CylinderProps } from '../../document/types'

describe('CYLINDER / CONE ▸ Axis endpoint', () => {
  it('el eje va de la base al punto indicado: un cilindro horizontal sin cambiar la UCS', async () => {
    const h = makeEngine()
    await h.run('CYLINDER', '0,-45,60', '6', 'A', '#0,45,60')
    const c = h.ofType('SOLID3D')[0].props as CylinderProps
    expect(c.base).toEqual([0, -45, 60])
    expect(c.height).toBeCloseTo(90, 9)
    expect(c.axis![0]).toBeCloseTo(0, 9)
    expect(c.axis![1]).toBeCloseTo(1, 9)
    expect(c.axis![2]).toBeCloseTo(0, 9)
  })

  it('CONE también lo acepta; una altura tecleada sigue creciendo en +Z', async () => {
    const h = makeEngine()
    await h.run('CONE', '0,0,0', '10', '0', 'A', '30,0,0')
    await h.run('CONE', '50,0,0', '10', '0', '20')
    const [a, b] = h.ofType('SOLID3D').map((e) => e.props as ConeProps)
    expect(a.axis![0]).toBeCloseTo(1, 9)
    expect(a.height).toBeCloseTo(30, 9)
    expect(b.height).toBe(20)
    expect(b.axis).toEqual([0, 0, 1])
  })

  it('una altura indicada con un punto 3D es su proyección sobre el eje', async () => {
    const h = makeEngine()
    await h.run('BOX', '0,0,0', '10,10,0', '3,4,12')
    expect((h.ofType('SOLID3D')[0].props as { height: number }).height).toBeCloseTo(12, 9)
  })
})

describe('booleanas: capa del resultado y objetos repetidos', () => {
  it('SUBTRACT conserva la capa de la base e ignora la base elegida también como herramienta', async () => {
    const h = makeEngine()
    await h.run('-LAYER', 'M', 'Base', '')
    await h.run('BOX', '0,0,0', '10,10,0', '10')
    await h.run('-LAYER', 'M', 'Otra', '')
    await h.run('CYLINDER', '5,5,0', '2', '10')
    const [base, tool] = h.ofType('SOLID3D')
    await h.run('SUBTRACT')
    await h.click(5, 0, base.id)
    await h.run('')
    await h.click(5, 0, base.id)
    await h.click(5, 5, tool.id)
    await h.run('')
    const out = h.ofType('SOLID3D')
    expect(out).toHaveLength(1)
    expect(out[0].layer).toBe(base.layer)
    expect(h.prints.join('\n')).toContain('already chosen to subtract from were ignored')
  })
})
