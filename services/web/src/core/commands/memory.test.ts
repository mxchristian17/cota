import { describe, it, expect } from 'vitest'
import { makeEngine } from '../../test/engineHarness'
import { DocumentModel } from '../document/DocumentModel'

/** los prompts numéricos recuerdan el último valor; Enter lo repite y ESC cancela. */
describe('valores recordados en los prompts', () => {
  it('EXTRUDE: la segunda vez Enter repite la altura anterior', async () => {
    const h = makeEngine()
    const r1 = h.add('RECTANGLE', { corner: [0, 0, 0], width: 10, height: 10 })
    h.setSelection([r1.id])
    await h.run('EXTRUDE', '25')
    const r2 = h.add('RECTANGLE', { corner: [20, 0, 0], width: 10, height: 10 })
    h.setSelection([r2.id])
    await h.run('EXTRUDE', '')
    const heights = h.ofType('SOLID3D').map((e) => (e.props as { height: number }).height)
    expect(heights).toEqual([25, 25])
  })

  it('ESC cancela aunque haya valor recordado', async () => {
    const h = makeEngine()
    await h.run('CIRCLE', '#0,0', '7')
    await h.run('CIRCLE', '#20,0')
    h.engine.cancel()
    await new Promise((r) => setTimeout(r, 0))
    await h.run('CIRCLE', '#40,0', '')
    expect(h.ofType('CIRCLE').map((e) => (e.props as { radius: number }).radius)).toEqual([7, 7])
  })

  it('sin valor previo Enter cancela (CIRCLE no tiene radio por defecto la primera vez)', async () => {
    const h = makeEngine()
    await h.run('CIRCLE', '#0,0', '')
    expect(h.ofType('CIRCLE')).toHaveLength(0)
  })

  it('las primitivas 3D comparten radio y altura (BOX → CYLINDER)', async () => {
    const h = makeEngine()
    await h.run('BOX', '#0,0', '#10,10', '12')
    await h.run('CYLINDER', '#30,0', '4', '')
    const cyl = h.ofType('SOLID3D').find((e) => (e.props as { op: string }).op === 'CYLINDER')!
    expect(cyl.props).toMatchObject({ radius: 4, height: 12 })
  })

  it('ROTATE y SCALE: la primera vez 0° y factor 1; después, el último valor', async () => {
    const h = makeEngine()
    const l = h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    h.setSelection([l.id])
    await h.run('SCALE', '#0,0', '')
    expect(h.prints.some((p) => p.includes('by 1.0000'))).toBe(true)
    h.setSelection([l.id])
    await h.run('ROTATE', '#0,0', '90')
    h.setSelection([l.id])
    await h.run('ROTATE', '#0,0', '')
    const end = (h.doc.getEntity(l.id)!.props as { end: number[] }).end
    expect(end[0]).toBeCloseTo(-10, 9) // 90° + 90°
    expect(end[1]).toBeCloseTo(0, 9)
  })

  it('TEXT: TEXTSIZE vive en el dibujo y se guarda; la rotación se recuerda', async () => {
    const h = makeEngine()
    await h.run('TEXT', '#0,0', '3.5', '15', 'uno')
    await h.run('TEXT', '#0,10', '', '', 'dos')
    const [a, b] = h.ofType('TEXT').map((e) => e.props as { height: number; rotation: number })
    expect(b.height).toBe(3.5)
    expect(b.rotation).toBeCloseTo(a.rotation, 12)
    expect(DocumentModel.fromJSON(h.doc.toJSON()).textSize).toBe(3.5)
  })

  it('ARRAY recuerda el tipo y las cantidades', async () => {
    const h = makeEngine()
    const l = h.add('LINE', { start: [0, 0, 0], end: [1, 0, 0] })
    h.setSelection([l.id])
    await h.run('ARRAY', 'R', '2', '3', '5', '5')
    h.setSelection([l.id])
    await h.run('ARRAY', '', '', '', '', '')
    expect(h.ofType('LINE')).toHaveLength(1 + 5 + 5) // 2×3 sin contar el original, dos veces
  })
})

describe('SHADEMODE', () => {
  it('mapea las opciones del CAD clásico a los estilos visuales; Enter deja el actual', async () => {
    const h = makeEngine()
    await h.run('SHADEMODE', 'L')
    expect(h.style()).toBe('shadedEdges')
    await h.run('SHA', 'H')
    expect(h.style()).toBe('hidden')
    await h.run('SHADEMODE', '')
    expect(h.style()).toBe('hidden')
    await h.run('-SHADEMODE', 'G')
    expect(h.style()).toBe('shaded')
    await h.run('SHADEMODE', '2')
    expect(h.style()).toBe('2dwireframe')
  })
})
