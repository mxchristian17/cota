import { describe, expect, it } from 'vitest'
import type { Entity, HatchProps, HatchEntity } from '../document/types'
import { DocumentModel } from '../document/DocumentModel'
import { boundaryAt, boundaryFromObjects, boundaryIndex } from './boundary'
import { hatchArea, hatchRegions, hatchRings, hatchStrokes } from './geometry'
import { translateEntity } from '../editing/edit'

let n = 0
const line = (a: [number, number], b: [number, number]): Entity => ({ id: `l${n++}`, type: 'LINE', layer: '0', props: { start: [a[0], a[1], 0], end: [b[0], b[1], 0] } })
const circle = (c: [number, number], r: number): Entity => ({ id: `c${n++}`, type: 'CIRCLE', layer: '0', props: { center: [c[0], c[1], 0], radius: r, normal: [0, 0, 1] } })
const rect4 = (x0: number, y0: number, x1: number, y1: number): Entity[] => [line([x0, y0], [x1, y0]), line([x1, y0], [x1, y1]), line([x1, y1], [x0, y1]), line([x0, y1], [x0, y0])]
const hatch = (loops: HatchProps['loops'], over: Partial<HatchProps> = {}): HatchProps => ({ loops, pattern: 'ANSI31', scale: 1, angle: 0, origin: [0, 0, 0], island: 'outer', ...over })

describe('contorno por punto interno', () => {
  it('cuatro líneas forman el lazo; un punto afuera no tiene contorno', () => {
    const idx = boundaryIndex(rect4(0, 0, 100, 50))
    const r = boundaryAt(idx, [10, 10], 'outer')
    expect(r?.loops.length).toBe(1)
    expect(r?.loops[0].vertices.length).toBe(4) // los tramos alineados no dejan vértices de más
    expect(r?.ids.length).toBe(4)
    expect(boundaryAt(idx, [200, 10], 'outer')).toBeNull()
  })

  it('líneas que se cruzan y ramas sueltas: la cara más chica que contiene el punto', () => {
    const ents = [...rect4(0, 0, 100, 100), line([50, -20], [50, 120]), line([20, 20], [30, 30])]
    const r = boundaryAt(boundaryIndex(ents), [10, 50], 'outer')
    expect(r).not.toBeNull()
    const xs = r!.loops[0].vertices.map((v) => v[0])
    expect(Math.max(...xs)).toBeCloseTo(50, 9) // cortado por la línea del medio
  })

  it('islas: Normal alterna, Outer sólo la exterior, Ignore ninguna; el círculo vuelve a ser bulges', () => {
    const ents = [...rect4(0, 0, 100, 100), circle([50, 50], 30), circle([50, 50], 10)]
    const idx = boundaryIndex(ents)
    const normal = boundaryAt(idx, [5, 5], 'normal')!
    const outer = boundaryAt(idx, [5, 5], 'outer')!
    const ignore = boundaryAt(idx, [5, 5], 'ignore')!
    expect(normal.loops.length).toBe(3)
    expect(outer.loops.length).toBe(2)
    expect(ignore.loops.length).toBe(1)
    const c = outer.loops[1]
    expect(c.vertices.length).toBe(4) // cuatro cuartos de vuelta
    for (const b of c.bulges!) expect(Math.abs(b)).toBeCloseTo(Math.tan(Math.PI / 8), 6)
    // Área: cuadrado menos el círculo grande.
    expect(hatchArea(hatch(outer.loops))).toBeCloseTo(10000 - Math.PI * 900, 3)
    // Dentro de la isla: el anillo entre los círculos.
    const ring = boundaryAt(idx, [50, 75], 'outer')!
    expect(ring.loops.length).toBe(2)
    expect(hatchArea(hatch(ring.loops))).toBeCloseTo(Math.PI * 800, 3)
  })

  it('el texto es una isla', () => {
    const t: Entity = { id: 't', type: 'TEXT', layer: '0', props: { position: [40, 60, 0], text: 'HOLA', height: 5, rotation: 0, justify: 'left', normal: [0, 0, 1] } }
    const r = boundaryAt(boundaryIndex([...rect4(0, 0, 100, 100), t]), [5, 5], 'outer')!
    expect(r.loops.length).toBe(2)
    expect(r.ids).toContain('t')
  })

  it('Select objects: lazos de los objetos cerrados con su anidamiento', () => {
    const sq: Entity = { id: 's', type: 'RECTANGLE', layer: '0', props: { corner: [0, 0, 0], width: 100, height: 100 } }
    const r = boundaryFromObjects([sq, circle([50, 50], 20), line([0, 0], [5, 5])], 'normal')!
    expect(r.loops.length).toBe(2)
  })
})

describe('líneas del patrón', () => {
  const sq = [{ vertices: [[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]] as [number, number, number][] }]
  it('ANSI31 a 45° cada 3,175 mm, todas dentro del lazo', () => {
    const s = hatchStrokes(hatch(sq))
    // Líneas a 45° separadas 3,175 ⇒ la diagonal (141,4) entra ~44 veces.
    expect(s.segs.length).toBeGreaterThan(40)
    expect(s.segs.length).toBeLessThan(50)
    for (const [a, b] of s.segs) {
      for (const p of [a, b]) {
        expect(p[0]).toBeGreaterThanOrEqual(-1e-9)
        expect(p[0]).toBeLessThanOrEqual(100 + 1e-9)
      }
      expect(Math.abs((b[1] - a[1]) / (b[0] - a[0]))).toBeCloseTo(1, 9)
    }
  })

  it('una isla corta las líneas (par-impar) y el ángulo del sombreado las gira', () => {
    const withHole = [...sq, { vertices: [[40, 40, 0], [60, 40, 0], [60, 60, 0], [40, 60, 0]] as [number, number, number][] }]
    const s = hatchStrokes(hatch(withHole, { pattern: 'LINE', scale: 5 }))
    const mid = s.segs.filter(([a]) => Math.abs(a[1] - 50) < 1e-6 || false)
    for (const [a, b] of s.segs) {
      const y = a[1]
      if (y > 40 && y < 60) expect(a[0] < 40 + 1e-9 || a[0] > 60 - 1e-9).toBe(true)
      expect(b[1]).toBeCloseTo(y, 9)
    }
    void mid
    const rot = hatchStrokes(hatch(sq, { pattern: 'LINE', scale: 5, angle: Math.PI / 2 }))
    for (const [a, b] of rot.segs) expect(a[0]).toBeCloseTo(b[0], 9)
  })

  it('patrones con trazos y puntos, _USER doble, SOLID sin líneas y "demasiado denso"', () => {
    expect(hatchStrokes(hatch(sq, { pattern: 'DOTS' })).dots.length).toBeGreaterThan(100)
    const u = hatchStrokes(hatch(sq, { pattern: '_USER', spacing: 10, double: true, origin: [5, 5, 0] }))
    expect(u.segs.length).toBe(20) // 10 horizontales + 10 verticales
    expect(hatchStrokes(hatch(sq, { pattern: 'SOLID' })).segs.length).toBe(0)
    expect(hatchStrokes(hatch(sq, { scale: 0.0001 })).tooDense).toBe(true)
    const reg = hatchRegions(hatchRings(hatch(sq)))
    expect(reg.length).toBe(1)
  })
})

describe('asociatividad', () => {
  const setup = () => {
    const doc = DocumentModel.createDefault()
    const ids = rect4(0, 0, 100, 50).map((e) => doc.addEntity({ type: e.type, layer: '0', props: e.props }).id)
    const ents = ids.map((id) => doc.getEntity(id)!)
    const r = boundaryAt(boundaryIndex(ents), [10, 10], 'outer')!
    const h = doc.addEntity({ type: 'HATCH', layer: '0', props: hatch(r.loops, { assoc: { ids: r.ids, seeds: [[10, 10, 0]] } }) }) as HatchEntity
    doc.updateAssociativeHatches() // registra el estado inicial
    return { doc, ids, h }
  }
  const maxX = (h: HatchEntity) => Math.max(...h.props.loops[0].vertices.map((v) => v[0]))

  it('mover un lado del contorno rehace el sombreado', () => {
    const { doc, ids, h } = setup()
    translateEntity(doc.getEntity(ids[1])!, 20, 0) // el lado derecho (x = 100 → 120)
    // Los lados de arriba y abajo no llegan: se alargan también para cerrar.
    const top = doc.getEntity(ids[2])!
    const bot = doc.getEntity(ids[0])!
    if (top.type === 'LINE') top.props.start = [120, 50, 0]
    if (bot.type === 'LINE') bot.props.end = [120, 0, 0]
    expect(doc.updateAssociativeHatches()).toBe(true)
    expect(maxX(h)).toBeCloseTo(120, 9)
    expect(h.props.assoc).toBeTruthy()
  })

  it('mover el contorno entero (sin el sombreado) lo arrastra; borrar un lado lo deja no asociativo', () => {
    const { doc, ids, h } = setup()
    for (const id of ids) translateEntity(doc.getEntity(id)!, 500, 0)
    doc.updateAssociativeHatches()
    expect(maxX(h)).toBeCloseTo(600, 9)
    doc.removeEntity(ids[0])
    doc.updateAssociativeHatches()
    expect(h.props.assoc).toBeUndefined()
  })

  it('mover el sombreado solo le quita la asociatividad', () => {
    const { doc, h } = setup()
    translateEntity(h, 0, 200)
    doc.updateAssociativeHatches()
    expect(h.props.assoc).toBeUndefined()
  })
})
