import { describe, it, expect } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import { dimDisplay, measureDim } from '../../dimension/dimGeometry'
import type { DimensionProps, LineEntity, TextProps } from '../../document/types'

type H = ReturnType<typeof makeEngine>
const dims = (h: H) => h.ofType('DIMENSION').map((e) => e.props as DimensionProps)
const ids = (h: H) => h.ofType('DIMENSION').map((e) => e.id)

/** Cota horizontal de 0,0 a 40,0 con la línea de cota en y. */
async function hdim(h: H, y: number) {
  await h.run('DIMLINEAR', '#0,0', '#40,0', `#20,${y}`)
  return h.ofType('DIMENSION').at(-1)!
}

/** ¿Hay algún tramo dibujado de la línea de cota (en y) que pase por x? */
const drawnAt = (p: DimensionProps, x: number, y: number) =>
  dimDisplay(p).lines.some(([a, b]) => Math.abs(a[1] - y) < 1e-9 && Math.abs(b[1] - y) < 1e-9 && Math.min(a[0], b[0]) <= x && Math.max(a[0], b[0]) >= x)

describe('DIMEDIT / DIMTEDIT', () => {
  it('DIMEDIT: New, Rotate, Oblique y Home', async () => {
    const h = makeEngine()
    const d = await hdim(h, -10)
    const p = d.props as DimensionProps
    h.setSelection([d.id])
    await h.run('DIMEDIT', 'N', '<> TYP')
    expect(p.textOverride).toBe('<> TYP')
    h.setSelection([d.id])
    await h.run('DIMEDIT', 'R', '30')
    expect(p.textAngle).toBe(30)
    h.setSelection([d.id])
    await h.run('DIMEDIT', 'O', '60')
    expect(p.oblique).toBe(60)
    expect(measureDim(p)).toBeCloseTo(40, 9)
    p.textAt = [5, 5, 0]
    h.setSelection([d.id])
    await h.run('DIMEDIT', '')
    expect(p.textAt).toBeUndefined()
    expect(p.textAngle).toBeUndefined()
    h.setSelection([d.id])
    await h.run('DIMEDIT', 'O', '')
    expect(p.oblique).toBeUndefined()
  })

  it('DIMTEDIT: nueva ubicación, Left, Angle y Home', async () => {
    const h = makeEngine()
    const d = await hdim(h, -10)
    const p = d.props as DimensionProps
    h.doc.setDimensionVar(p, 'DIMTMOVE', 2)
    await h.run('DIMTEDIT')
    await h.click(20, -10, d.id)
    await h.run('#35,-20')
    expect(p.textAt).toEqual([35, -20, 0])
    expect(dimDisplay(p).text.pos[0]).toBeCloseTo(35, 9)
    await h.run('DIMTEDIT')
    await h.click(20, -10, d.id)
    await h.run('L')
    expect(p.textAt).toBeUndefined()
    expect(p.overrides?.DIMJUST).toBe(1)
    await h.run('DIMTEDIT')
    await h.click(20, -10, d.id)
    await h.run('A', '45')
    expect(p.textAngle).toBe(45)
    await h.run('DIMTEDIT')
    await h.click(20, -10, d.id)
    await h.run('H')
    expect(p.textAngle).toBeUndefined()
  })
})

describe('DIMSPACE', () => {
  it('espacia parejo desde la base, alinea con 0 y saltea las no paralelas', async () => {
    const h = makeEngine()
    const base = await hdim(h, -10)
    await hdim(h, -13)
    await hdim(h, -30)
    await hdim(h, -50)
    await h.run('DIMLINEAR', '#0,0', '#0,30', '#-10,15') // vertical: no paralela
    const [, ...others] = ids(h)
    h.setSelection(others)
    await h.run('DIMSPACE')
    await h.click(20, -10, base.id)
    await h.run('7')
    const ys = dims(h).slice(0, 4).map((p) => dimDisplay(p).handles![0][1])
    expect(ys.map((y) => +y.toFixed(9))).toEqual([-10, -17, -24, -31])
    expect(dims(h).slice(0, 4).every((p) => Math.abs(measureDim(p) - 40) < 1e-9)).toBe(true)
    expect(h.prints.some((l) => /1 not parallel/.test(l))).toBe(true)
    // 0 = alinear todas con la base.
    h.setSelection(others)
    await h.run('DIMSPACE')
    await h.click(20, -10, base.id)
    await h.run('0')
    expect(dims(h).slice(0, 4).map((p) => +dimDisplay(p).handles![0][1].toFixed(9))).toEqual([-10, -10, -10, -10])
  })

  it('Auto = 2 × alto de texto', async () => {
    const h = makeEngine()
    const base = await hdim(h, -10)
    const o = await hdim(h, -11)
    h.setSelection([o.id])
    await h.run('DIMSPACE')
    await h.click(20, -10, base.id)
    await h.run('')
    const t = (base.props as DimensionProps).style.DIMTXT
    expect(dimDisplay(o.props as DimensionProps).handles![0][1]).toBeCloseTo(-10 - 2 * t, 9)
  })
})

describe('DIMBREAK', () => {
  it('Auto corta donde cruza un objeto y el corte sigue al objeto; Remove lo quita', async () => {
    const h = makeEngine()
    const l = h.add('LINE', { start: [20, -20, 0], end: [20, 5, 0] }) as LineEntity
    const d = await hdim(h, -10)
    const p = d.props as DimensionProps
    expect(drawnAt(p, 20, -10)).toBe(true)
    await h.run('DIMBREAK')
    await h.click(10, -10, d.id)
    await h.run('')
    expect(p.breakWith).toEqual([l.id])
    expect(p.autoBreaks).toEqual([[20, -10, 0]])
    expect(drawnAt(p, 20, -10)).toBe(false)
    expect(drawnAt(p, 20 + p.style.BREAKSIZE, -10)).toBe(true)
    // La geometría se mueve: el corte se recalcula.
    l.props.start = [30, -20, 0]
    l.props.end = [30, 5, 0]
    h.doc.updateAssociativeDims()
    expect(p.autoBreaks).toEqual([[30, -10, 0]])
    expect(drawnAt(p, 20, -10)).toBe(true)
    expect(drawnAt(p, 30, -10)).toBe(false)
    // Borrada la geometría: sin cortes.
    h.doc.removeEntity(l.id)
    h.doc.updateAssociativeDims()
    expect(p.autoBreaks).toBeUndefined()
    await h.run('DIMBREAK')
    await h.click(10, -10, d.id)
    await h.run('R')
    expect(p.breakWith).toBeUndefined()
  })

  it('objetos indicados, Manual y Multiple', async () => {
    const h = makeEngine()
    const a = h.add('LINE', { start: [10, -20, 0], end: [10, 5, 0] })
    h.add('LINE', { start: [30, -20, 0], end: [30, 5, 0] })
    const d = await hdim(h, -10)
    const p = d.props as DimensionProps
    await h.run('DIMBREAK')
    await h.click(20, -10, d.id)
    await h.click(10, 0, a.id)
    await h.run('')
    expect(p.autoBreaks).toEqual([[10, -10, 0]])
    await h.run('DIMBREAK')
    await h.click(20, -10, d.id)
    await h.run('M', '#24,-10', '#26,-10')
    expect(p.breaks).toEqual([[24, 26]])
    expect(drawnAt(p, 25, -10)).toBe(false)
    const d2 = await hdim(h, -30)
    h.setSelection([d2.id])
    await h.run('DIMBREAK', 'M', '')
    expect((d2.props as DimensionProps).autoBreaks?.length).toBe(2)
  })
})

describe('DIMJOGLINE / DIMINSPECT / DIMOVERRIDE', () => {
  it('DIMJOGLINE: por defecto entre la referencia 1 y el texto; en un punto; Remove', async () => {
    const h = makeEngine()
    const d = await hdim(h, -10)
    const p = d.props as DimensionProps
    const before = dimDisplay(p).lines.length
    await h.run('DIMJOGLINE')
    await h.click(20, -10, d.id)
    await h.run('')
    expect(p.jog).toBeCloseTo(10, 9)
    expect(dimDisplay(p).lines.length).toBeGreaterThan(before)
    expect(drawnAt(p, 10, -10)).toBe(false)
    await h.run('DIMJOGLINE')
    await h.click(20, -10, d.id)
    await h.run('#32,-10')
    expect(p.jog).toBeCloseTo(32, 9)
    await h.run('DIMJOGLINE', 'R')
    await h.click(20, -10, d.id)
    expect(p.jog).toBeUndefined()
  })

  it('DIMINSPECT: etiqueta, frecuencia y marco; Remove', async () => {
    const h = makeEngine()
    const d = await hdim(h, -10)
    const p = d.props as DimensionProps
    const base = dimDisplay(p)
    h.setSelection([d.id])
    await h.run('DIMINSPECT', '', 'A', 'A1', '50%')
    expect(p.inspect).toEqual({ label: 'A1', rate: '50%', shape: 'angular' })
    const ins = dimDisplay(p)
    expect(ins.textStrokes.length).toBeGreaterThan(base.textStrokes.length)
    expect(ins.lines.length).toBeGreaterThan(base.lines.length + 4)
    h.setSelection([d.id])
    await h.run('DIMINSPECT', 'R')
    expect(p.inspect).toBeUndefined()
  })

  it('DIMOVERRIDE: varias variables a la selección; Clear las quita', async () => {
    const h = makeEngine()
    const d = await hdim(h, -10)
    const p = d.props as DimensionProps
    h.setSelection([d.id])
    await h.run('DIMOVERRIDE', 'DIMTXT', '5', 'DIMDEC', '3', '')
    expect(p.overrides).toEqual({ DIMTXT: 5, DIMDEC: 3 })
    expect(p.style.DIMTXT).toBe(5)
    h.setSelection([d.id])
    await h.run('DIMOVERRIDE', 'C')
    expect(p.overrides).toBeUndefined()
    expect(p.style.DIMTXT).not.toBe(5)
  })
})

describe('MATCHPROP', () => {
  it('copia capa, estilo de cota con overrides y alto de texto; Settings desactiva propiedades', async () => {
    const h = makeEngine()
    const src = await hdim(h, -10)
    const dst = await hdim(h, -30)
    const sp = src.props as DimensionProps
    h.doc.restyleDimension(sp, 'ISO-25', { DIMTXT: 4 })
    src.layer = 'X'
    await h.run('MATCHPROP')
    await h.click(20, -10, src.id)
    await h.click(20, -30, dst.id)
    await h.run('')
    const dp = dst.props as DimensionProps
    expect(dp.styleName).toBe('ISO-25')
    expect(dp.overrides).toEqual({ DIMTXT: 4 })
    expect(dp.style.DIMTXT).toBe(4)
    expect(dst.layer).toBe('X')

    const t1 = h.add('TEXT', { position: [0, 0, 0], text: 'A', height: 7, rotation: 0, justify: 'left', normal: [0, 0, 1] })
    const t2 = h.add('TEXT', { position: [0, 20, 0], text: 'B', height: 2, rotation: 0, justify: 'left', normal: [0, 0, 1] }, 'Y')
    await h.run('MA')
    await h.click(0, 0, t1.id)
    await h.run('S', 'L', '')
    await h.click(0, 20, t2.id)
    await h.run('')
    expect((t2.props as TextProps).height).toBe(7)
    expect(t2.layer).toBe('Y')
  })
})
