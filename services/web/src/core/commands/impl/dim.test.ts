import { describe, it, expect } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import { formatDim, measureDim } from '../../dimension/dimGeometry'
import type { DimensionProps } from '../../document/types'

type H = ReturnType<typeof makeEngine>
const dims = (h: H) => h.ofType('DIMENSION').map((e) => e.props as DimensionProps)
const last = (h: H) => dims(h)[dims(h).length - 1]

describe('comandos de cota por tipo', () => {
  it('DIMLINEAR por puntos: H/V según la ubicación, Rotated y Text con <>', async () => {
    const h = makeEngine()
    await h.run('DIMLINEAR', '#0,0', '#30,40', '#15,60')
    expect(measureDim(last(h))).toBeCloseTo(30, 9)
    await h.run('DIMLINEAR', '#0,0', '#30,40', '#50,20')
    expect(measureDim(last(h))).toBeCloseTo(40, 9)
    await h.run('DIMLINEAR', '#0,0', '#30,40', 'R', '45', 'T', '<> TYP', '#0,60')
    expect(last(h).rotation).toBe(45)
    expect(formatDim(last(h))).toMatch(/^49,5\d* TYP$|^49,5 TYP$/)
  })

  it('DIMLINEAR con <select object>: una línea da sus extremos y queda asociada', async () => {
    const h = makeEngine()
    const l = h.add('LINE', { start: [0, 0, 0], end: [25, 0, 0] })
    await h.run('DIMLINEAR', '')
    await h.click(10, 0, l.id)
    await h.run('#12,8')
    expect(last(h).points).toEqual([[0, 0, 0], [25, 0, 0]])
    expect(last(h).assoc).toEqual([{ id: l.id, kind: 'start' }, { id: l.id, kind: 'end' }])
  })

  it('DIMLINEAR sobre un círculo: el diámetro horizontal o vertical según el cursor', async () => {
    const h = makeEngine()
    const c = h.add('CIRCLE', { center: [0, 0, 0], radius: 10, normal: [0, 0, 1] })
    await h.run('DIMLINEAR', '')
    await h.click(10, 0, c.id)
    await h.run('#0,20')
    expect(last(h).points).toEqual([[-10, 0, 0], [10, 0, 0]])
  })

  it('DIMRADIUS / DIMDIAMETER eligiendo el círculo; DIMJOGGED con centro desplazado', async () => {
    const h = makeEngine()
    const c = h.add('CIRCLE', { center: [0, 0, 0], radius: 10, normal: [0, 0, 1] })
    await h.run('DIMRADIUS')
    await h.click(10, 0, c.id)
    await h.run('#20,5')
    expect(formatDim(last(h))).toBe('R10')
    await h.run('DIMDIAMETER')
    await h.click(0, 10, c.id)
    await h.run('#5,25')
    expect(formatDim(last(h))).toBe('⌀20')
    await h.run('DIMJOGGED')
    await h.click(0, -10, c.id)
    await h.run('#-30,-30', '#-15,-15')
    expect(last(h).points[2]).toEqual([-30, -30, 0])
    expect(h.prints).toContain('Dimension text = R10')
  })

  it('DIMANGULAR: dos líneas (cuadrante del texto), un arco > 180° y vértice + puntos', async () => {
    const h = makeEngine()
    const a = h.add('LINE', { start: [0, 0, 0], end: [20, 0, 0] })
    const b = h.add('LINE', { start: [0, 0, 0], end: [0, 20, 0] })
    await h.run('DIMANGULAR')
    await h.click(10, 0, a.id)
    await h.click(0, 10, b.id)
    await h.run('#8,8')
    expect(measureDim(last(h))).toBeCloseTo(90, 9)
    const arc = h.add('ARC', { center: [50, 0, 0], radius: 10, startAngle: 0, endAngle: (270 * Math.PI) / 180, normal: [0, 0, 1] })
    await h.run('DIMANGULAR')
    await h.click(40, 0, arc.id)
    await h.run('#35,10')
    expect(measureDim(last(h))).toBeCloseTo(270, 6)
    await h.run('DIMANGULAR', '', '#0,0', '#10,0', '#0,10', '#-5,-5')
    expect(measureDim(last(h))).toBeCloseTo(270, 6) // el texto del otro lado: 360 − 90
  })

  it('DIMARC: longitud del arco con el símbolo', async () => {
    const h = makeEngine()
    const arc = h.add('ARC', { center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI / 2, normal: [0, 0, 1] })
    await h.run('DIMARC')
    await h.click(7.07, 7.07, arc.id)
    await h.run('#10,10')
    expect(measureDim(last(h))).toBeCloseTo(5 * Math.PI, 9)
    expect(formatDim(last(h)).startsWith('⌒')).toBe(true)
  })

  it('DIMORDINATE con Xdatum forzado y DIMCENTER sobre un círculo', async () => {
    const h = makeEngine()
    await h.run('DIMORDINATE', '#30,20', 'X', '#45,40')
    expect(last(h).axis).toBe('X')
    expect(formatDim(last(h))).toBe('30')
    const c = h.add('CIRCLE', { center: [5, 5, 0], radius: 4, normal: [0, 0, 1] })
    await h.run('DIMCENTER')
    await h.click(9, 5, c.id)
    expect(last(h).dimType).toBe('CENTER')
  })
})

describe('DIMBASELINE / DIMCONTINUE / DIM / QDIM', () => {
  it('criterio 5: DIMCONTINUE encadena desde la última cota creada (no desde la última alineada)', async () => {
    const h = makeEngine()
    await h.run('DIMALIGNED', '#0,50', '#30,80', '#5,75')
    await h.run('DIMLINEAR', '#0,0', '#10,0', '#5,-10')
    await h.run('DIMCONTINUE', '#25,0', '#40,0', '')
    const [, , c1, c2] = dims(h)
    expect(c1.points).toEqual([[10, 0, 0], [25, 0, 0]])
    expect(c2.points).toEqual([[25, 0, 0], [40, 0, 0]])
    expect(c1.textPos[1]).toBeCloseTo(-10, 9) // misma línea de cota
  })

  it('DIMBASELINE: desde el primer origen, cada una a DIMDLI de la anterior; Undo quita la última', async () => {
    const h = makeEngine()
    await h.run('DIMLINEAR', '#0,0', '#10,0', '#5,-10')
    await h.run('DIMBASELINE', '#20,0', '#30,0', 'U', '')
    const ds = dims(h)
    expect(ds).toHaveLength(2)
    expect(ds[1].points).toEqual([[0, 0, 0], [20, 0, 0]])
    expect(ds[1].textPos[1]).toBeCloseTo(-10 - ds[1].style.DIMDLI, 9)
  })

  it('DIMCONTINUE ▸ Select: base elegida, desde la referencia más cercana al clic', async () => {
    const h = makeEngine()
    await h.run('DIMLINEAR', '#0,0', '#10,0', '#5,-10')
    const base = h.ofType('DIMENSION')[0]
    await h.run('DIMLINEAR', '#100,0', '#110,0', '#105,-10')
    await h.run('DIMCONTINUE', 'S')
    await h.click(0.2, -5, base.id)
    await h.run('#-15,0', '')
    expect(last(h).points).toEqual([[0, 0, 0], [-15, 0, 0]])
  })

  it('criterio 5: DIM sobre un círculo da diámetro, sobre un arco radio, sobre una línea alineada', async () => {
    const h = makeEngine()
    const c = h.add('CIRCLE', { center: [0, 0, 0], radius: 10, normal: [0, 0, 1] })
    const a = h.add('ARC', { center: [50, 0, 0], radius: 5, startAngle: 0, endAngle: Math.PI, normal: [0, 0, 1] })
    const l = h.add('LINE', { start: [0, 30, 0], end: [30, 60, 0] })
    await h.run('DIM')
    await h.click(10, 0, c.id)
    await h.run('#20,10')
    await h.click(50, 5, a.id)
    await h.run('#60,10')
    await h.click(15, 45, l.id)
    await h.run('#10,50', '')
    expect(dims(h).map((d) => d.dimType)).toEqual(['DIAMETER', 'RADIUS', 'ALIGNED'])
  })

  it('QDIM: cadena continua sobre los vértices de una polilínea y Baseline', async () => {
    const h = makeEngine()
    const p = h.add('POLYLINE', { vertices: [[0, 0, 0], [10, 0, 0], [25, 5, 0], [40, 0, 0]], closed: false })
    h.setSelection([p.id])
    await h.run('QDIM', '#20,-15')
    expect(dims(h).map((d) => Math.round(measureDim(d)))).toEqual([10, 15, 15])
    h.setSelection([p.id])
    await h.run('QDIM', 'B', '#20,-30')
    expect(dims(h).slice(3).map((d) => Math.round(measureDim(d)))).toEqual([10, 25, 40])
  })
})
