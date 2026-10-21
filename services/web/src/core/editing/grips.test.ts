import { describe, it, expect } from 'vitest'
import { applyGrip, entityGrips, type Grip } from './grips'
import type { DimensionProps, Entity } from '../document/types'
import { DEFAULT_DIM_STYLE, dimDisplay, measureDim } from '../dimension/dimGeometry'

const line = (): Entity => ({ id: 'l', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [10, 0, 0] } })
const circle = (): Entity => ({ id: 'c', type: 'CIRCLE', layer: '0', props: { center: [0, 0, 0], radius: 5, normal: [0, 0, 1] } })
const rect = (): Entity => ({ id: 'r', type: 'RECTANGLE', layer: '0', props: { corner: [0, 0, 0], width: 10, height: 4 } })
const ellipse = (): Entity => ({ id: 'e', type: 'ELLIPSE', layer: '0', props: { center: [0, 0, 0], major: [10, 0, 0], ratio: 0.5, normal: [0, 0, 1] } })
const poly = (): Entity => ({ id: 'p', type: 'POLYLINE', layer: '0', props: { vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 0]], closed: false } })

const roleOf = (g: Grip[], t: string): Grip => g.find((x) => x.role.t === t)!

describe('grips', () => {
  it('la línea expone 2 extremos + 1 grip de mover', () => {
    const g = entityGrips(line())
    expect(g).toHaveLength(3)
    expect(g.filter((x) => x.role.t === 'line')).toHaveLength(2)
    expect(g.filter((x) => x.role.t === 'move')).toHaveLength(1)
  })

  it('mover el extremo "end" solo cambia end', () => {
    const e = line()
    const end = entityGrips(e).find((x) => x.role.t === 'line' && x.role.which === 'end')!
    applyGrip(e, end, [10, 20, 0])
    expect((e.props as { start: number[]; end: number[] }).start).toEqual([0, 0, 0])
    expect((e.props as { end: number[] }).end).toEqual([10, 20, 0])
  })

  it('el grip medio mueve toda la línea', () => {
    const e = line()
    const mid = roleOf(entityGrips(e), 'move')
    applyGrip(e, mid, [mid.point[0] + 5, mid.point[1] + 5, 0])
    expect((e.props as { start: number[] }).start).toEqual([5, 5, 0])
    expect((e.props as { end: number[] }).end).toEqual([15, 5, 0])
  })

  it('un cuadrante del círculo redefine el radio', () => {
    const e = circle()
    const q = entityGrips(e).find((x) => x.role.t === 'circle-radius')!
    applyGrip(e, q, [8, 0, 0])
    expect((e.props as { radius: number }).radius).toBeCloseTo(8, 6)
  })

  it('la esquina del rectángulo redimensiona con la opuesta fija', () => {
    const e = rect()
    const c0 = entityGrips(e).find((x) => x.role.t === 'rect-corner' && x.role.corner === 0)!
    applyGrip(e, c0, [-2, -1, 0]) // esquina opuesta (10,4) fija
    const p = e.props as { corner: number[]; width: number; height: number }
    expect(p.corner).toEqual([-2, -1, 0])
    expect(p.width).toBeCloseTo(12, 6)
    expect(p.height).toBeCloseTo(5, 6)
  })

  it('el extremo del semieje mayor de la elipse redefine major', () => {
    const e = ellipse()
    const g = entityGrips(e).find((x) => x.role.t === 'ellipse-major')!
    // el grip major+ está en (10,0,0); lo llevamos a (0,20,0)
    const majPlus = entityGrips(e).filter((x) => x.role.t === 'ellipse-major').find((x) => x.point[0] > 0)!
    applyGrip(e, majPlus ?? g, [0, 20, 0])
    expect((e.props as { major: number[] }).major).toEqual([0, 20, 0])
  })

  it('el extremo del semieje menor ajusta el ratio', () => {
    const e = ellipse()
    const minPlus = entityGrips(e).filter((x) => x.role.t === 'ellipse-minor').find((x) => x.point[1] > 0)!
    applyGrip(e, minPlus, [0, 2.5, 0]) // menor = 2.5, mayor = 10 → ratio 0.25
    expect((e.props as { ratio: number }).ratio).toBeCloseTo(0.25, 6)
  })

  it('un vértice de la polilínea se mueve individualmente', () => {
    const e = poly()
    const g = entityGrips(e).find((x) => x.role.t === 'vertex' && x.role.index === 1)!
    applyGrip(e, g, [99, 88, 0])
    expect((e.props as { vertices: number[][] }).vertices[1]).toEqual([99, 88, 0])
    expect((e.props as { vertices: number[][] }).vertices[0]).toEqual([0, 0, 0])
  })
})

describe('grips de cota', () => {
  const dim = (extra: Partial<DimensionProps> = {}, style: Partial<DimensionProps['style']> = {}): Entity => ({
    id: 'd',
    type: 'DIMENSION',
    layer: '0',
    props: { dimType: 'LINEAR', points: [[0, 0, 0], [20, 0, 0]], textPos: [10, -8, 0], style: { ...DEFAULT_DIM_STYLE, ...style }, ...extra },
  })

  it('lineal: 2 puntos, 2 extremos de la línea de cota y el texto', () => {
    const g = entityGrips(dim())
    expect(g.map((x) => x.role.t)).toEqual(['dim-point', 'dim-point', 'dim-line', 'dim-line', 'dim-text'])
    const [a, b] = g.filter((x) => x.role.t === 'dim-line').map((x) => x.point)
    expect(a[1]).toBeCloseTo(-8, 9)
    expect(b[1]).toBeCloseTo(-8, 9)
  })

  it('la línea de cota se desplaza en paralelo y conserva la orientación', () => {
    const e = dim()
    const g = entityGrips(e).find((x) => x.role.t === 'dim-line')!
    // Arrastre con componente a lo largo: sólo cuenta la perpendicular; aunque quede cerca, no pasa a vertical.
    applyGrip(e, g, [g.point[0] + 30, -1, 0])
    const p = e.props as DimensionProps
    expect(p.textPos[1]).toBeCloseTo(-1, 9)
    expect(p.textPos[0]).toBeCloseTo(10, 9)
    expect(p.rotation).toBe(0)
    expect(measureDim(p)).toBeCloseTo(20, 9)
  })

  it('texto: DIMTMOVE 0 arrastra la línea; DIMTMOVE 2 mueve sólo el texto', () => {
    const e0 = dim({}, { DIMTMOVE: 0 })
    applyGrip(e0, roleOf(entityGrips(e0), 'dim-text'), [14, -12, 0])
    expect((e0.props as DimensionProps).textAt).toEqual([14, -12, 0])
    expect((e0.props as DimensionProps).textPos[1]).toBeLessThan(-8)
    const e2 = dim({}, { DIMTMOVE: 2 })
    applyGrip(e2, roleOf(entityGrips(e2), 'dim-text'), [30, 10, 0])
    const p2 = e2.props as DimensionProps
    expect(p2.textAt).toEqual([30, 10, 0])
    expect(p2.textPos).toEqual([10, -8, 0])
    expect(dimDisplay(p2).text.pos[0]).toBeCloseTo(30, 9)
  })

  it('en FRONT (plano XZ) los grips y el texto quedan en el plano de la cota', () => {
    const e = dim({ points: [[0, 0, 0], [0, 0, 20]], textPos: [-8, 0, 10], normal: [0, -1, 0] }, { DIMTMOVE: 2 })
    const g = entityGrips(e)
    for (const x of g) expect(x.point[1]).toBeCloseTo(0, 9)
    const line = g.find((x) => x.role.t === 'dim-line')!
    applyGrip(e, line, [-15, 0, 3])
    const p = e.props as DimensionProps
    expect(p.textPos[0]).toBeCloseTo(-15, 9)
    expect(p.textPos[2]).toBeCloseTo(10, 9)
    expect(measureDim(p)).toBeCloseTo(20, 9)
    applyGrip(e, roleOf(entityGrips(e), 'dim-text'), [-20, 0, 25])
    const t = dimDisplay(p).text.pos
    expect(t[0]).toBeCloseTo(-20, 9)
    expect(t[1]).toBeCloseTo(0, 9)
    expect(t[2]).toBeCloseTo(25, 9)
  })

  it('radial: un único grip de texto en textPos', () => {
    const e: Entity = { id: 'r', type: 'DIMENSION', layer: '0', props: { dimType: 'RADIUS', points: [[0, 0, 0], [5, 0, 0]], textPos: [8, 3, 0], style: DEFAULT_DIM_STYLE } }
    expect(entityGrips(e).map((x) => x.role.t)).toEqual(['dim-point', 'dim-point', 'dim-textpos'])
  })
})
