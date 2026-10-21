import { describe, it, expect, beforeEach } from 'vitest'
import type { Vec3 } from '../math'
import type { ArcProps, Entity, LineProps, PolylineProps } from '../document/types'
import { Curve, curveOf, type Prim } from '../geom/curve'
import { cornerEdit, cutVertices, filletCorner, filletVertex, type Corner, type CornerResult } from './fillet'
import { chamferCorner, chamferVertex } from './chamfer'
import type { CurvePick } from './pickCurve'
import { applySysvars, persistedSysvars, resetSysvars, sysvars } from '../commands/sysvars'
import { makeEngine } from '../../test/engineHarness'

let seq = 0
function pk(type: string, props: object, at: Vec3): CurvePick {
  const entity = { id: `e${++seq}`, type, layer: '0', props } as unknown as Entity
  const curve = curveOf(entity) as Curve
  return { entity, curve, t: curve.paramAt(at), at }
}
const line = (a: Vec3, b: Vec3, at: Vec3): CurvePick => pk('LINE', { start: a, end: b }, at)
const ok = (r: CornerResult): Corner => {
  if ('error' in r) throw new Error(r.error)
  return r
}
const arcOf = (k: Corner): Prim & { k: 'A' } => k.link as Prim & { k: 'A' }
const near = (p: number[], q: number[]): void => {
  expect(p[0]).toBeCloseTo(q[0], 6)
  expect(p[1]).toBeCloseTo(q[1], 6)
}
const lineOut = (k: Corner, n: number): LineProps => cornerEdit(k, true).replace[n].inputs[0].props as LineProps

describe('filletCorner: líneas', () => {
  it('L con radio 10: arco tangente y las dos líneas recortadas', () => {
    const k = ok(filletCorner(line([0, 0, 0], [100, 0, 0], [50, 0, 0]), line([0, 0, 0], [0, 100, 0], [0, 50, 0]), 10))
    near(arcOf(k).c, [10, 10])
    expect(Math.abs(arcOf(k).sw)).toBeCloseTo(Math.PI / 2)
    near(lineOut(k, 0).start, [10, 0])
    near(lineOut(k, 1).start, [0, 10])
    expect(cornerEdit(k, true).add[0].type).toBe('ARC')
  })
  it('alarga las que no llegan, acepta picks dentro del tramo a recortar y recorta las que cruzan', () => {
    const k = ok(filletCorner(line([20, 0, 0], [100, 0, 0], [50, 0, 0]), line([0, 20, 0], [0, 100, 0], [0, 50, 0]), 10))
    near(lineOut(k, 0).start, [10, 0])
    const n = ok(filletCorner(line([0, 0, 0], [100, 0, 0], [5, 0, 0]), line([0, 0, 0], [0, 100, 0], [0, 5, 0]), 30))
    near(lineOut(n, 0).start, [30, 0])
    const x = ok(filletCorner(line([-50, 0, 0], [100, 0, 0], [50, 0, 0]), line([0, -50, 0], [0, 100, 0], [0, 50, 0]), 10))
    near(lineOut(x, 0).start, [10, 0])
    near(lineOut(x, 1).start, [0, 10])
  })
  it('radio demasiado grande, radio 0 y No trim', () => {
    const a = (): CurvePick => line([20, 0, 0], [100, 0, 0], [50, 0, 0])
    const b = (): CurvePick => line([0, 20, 0], [0, 100, 0], [0, 50, 0])
    expect(filletCorner(a(), b(), 200)).toEqual({ error: 'tooLarge' })
    const z = ok(filletCorner(a(), b(), 0))
    expect(z.link).toBeNull()
    near(lineOut(z, 0).start, [0, 0])
    near(lineOut(z, 1).start, [0, 0])
    const nt = cornerEdit(ok(filletCorner(a(), b(), 10)), false)
    expect(nt.replace).toHaveLength(0)
    expect(nt.add).toHaveLength(1)
  })
  it('paralelas: semicírculo en el extremo cercano al pick, ignorando el radio', () => {
    const k = ok(filletCorner(line([0, 0, 0], [100, 0, 0], [90, 0, 0]), line([0, 20, 0], [80, 20, 0], [70, 20, 0]), 3))
    const arc = arcOf(k)
    near(arc.c, [100, 10])
    expect(arc.r).toBeCloseTo(10)
    near(lineOut(k, 1).end, [100, 20])
    const mid = arc.a0 + arc.sw / 2
    expect(arc.c[0] + arc.r * Math.cos(mid)).toBeCloseTo(110)
  })
})

describe('filletCorner: curvas', () => {
  it('línea–círculo: tangente a ambos; el círculo no se recorta', () => {
    const k = ok(filletCorner(line([0, 30, 0], [100, 30, 0], [20, 30, 0]), pk('CIRCLE', { center: [50, 0, 0], radius: 20 }, [30, 0, 0]), 10))
    const c = arcOf(k).c
    expect(Math.hypot(c[0] - 50, c[1])).toBeCloseTo(30)
    expect(c[1]).toBeCloseTo(20)
    const ed = cornerEdit(k, true)
    expect(ed.replace).toHaveLength(1)
    expect((ed.replace[0].inputs[0].props as LineProps).end[0]).toBeCloseTo(c[0])
  })
  it('círculo–círculo: arco del lado de los picks', () => {
    const k = ok(
      filletCorner(pk('CIRCLE', { center: [0, 0, 0], radius: 10 }, [0, 10, 0]), pk('CIRCLE', { center: [30, 0, 0], radius: 10 }, [30, 10, 0]), 10),
    )
    near(arcOf(k).c, [15, Math.sqrt(175)])
    expect(cornerEdit(k, true).replace).toHaveLength(0)
  })
  it('arco–línea: el arco se recorta sobre su círculo', () => {
    const arc = pk('ARC', { center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI, normal: [0, 0, 1] }, [-10, 0.5, 0])
    const k = ok(filletCorner(arc, line([-30, 15, 0], [30, 15, 0], [-20, 15, 0]), 5))
    const c = arcOf(k).c
    expect(Math.hypot(c[0], c[1])).toBeCloseTo(15)
    expect(c[1]).toBeCloseTo(10)
    expect(c[0]).toBeLessThan(0)
    const p = cornerEdit(k, true).replace[0].inputs[0].props as ArcProps
    expect(p.startAngle).toBeGreaterThan(Math.PI / 2)
  })
  it('elipse–línea: tangencia numérica', () => {
    const el = pk('ELLIPSE', { center: [0, 0, 0], major: [20, 0, 0], ratio: 0.5, normal: [0, 0, 1] }, [5, 9.68, 0])
    const k = ok(filletCorner(el, line([-50, 18, 0], [50, 18, 0], [10, 18, 0]), 5))
    const c = arcOf(k).c
    expect(c[1]).toBeCloseTo(13)
    expect(c[0]).toBeGreaterThan(0)
    const d = Math.min(...el.curve.samples(4000).map((q) => Math.hypot(q[0] - c[0], q[1] - c[1])))
    expect(d).toBeCloseTo(5, 3)
  })
  it('no coplanares y misma línea dos veces se rechazan', () => {
    expect(filletCorner(line([0, 0, 0], [10, 0, 0], [5, 0, 0]), line([0, 0, 5], [0, 10, 5], [0, 5, 5]), 1)).toEqual({ error: 'coplanar' })
    const l = line([0, 0, 0], [10, 0, 0], [5, 0, 0])
    expect(filletCorner(l, { ...l, at: [8, 0, 0], t: 0.8 }, 1)).toEqual({ error: 'same' })
  })
})

describe('polilíneas', () => {
  const pl = (vertices: Vec3[], at: Vec3, closed = false): CurvePick => pk('POLYLINE', { vertices, closed }, at)
  it('dos tramos contiguos: el vértice se redondea con un bulge', () => {
    const a = pl([[0, 0, 0], [100, 0, 0], [100, 100, 0]], [50, 0, 0])
    const k = ok(filletCorner(a, { ...a, at: [100, 50, 0], t: a.curve.paramAt([100, 50, 0]) }, 10))
    const p = cornerEdit(k, true).replace[0].inputs[0].props as PolylineProps
    expect(p.vertices).toHaveLength(4)
    near(p.vertices[1], [90, 0])
    near(p.vertices[2], [100, 10])
    expect(p.bulges?.[1]).toBeCloseTo(Math.tan(Math.PI / 8))
  })
  it('tramos no contiguos: quita los intermedios', () => {
    const a = pl([[0, 0, 0], [50, 0, 0], [60, 10, 0], [60, 100, 0]], [20, 0, 0])
    const k = ok(filletCorner(a, { ...a, at: [60, 50, 0], t: a.curve.paramAt([60, 50, 0]) }, 0))
    const p = cornerEdit(k, true).replace[0].inputs[0].props as PolylineProps
    expect(p.vertices.map((v) => [Math.round(v[0]), Math.round(v[1])])).toEqual([
      [0, 0],
      [60, 0],
      [60, 100],
    ])
  })
  it('polilínea + línea: se unen con el arco en una sola polilínea', () => {
    const k = ok(filletCorner(pl([[100, 0, 0], [0, 0, 0]], [50, 0, 0]), line([0, 10, 0], [0, 100, 0], [0, 50, 0]), 10))
    const ed = cornerEdit(k, true)
    expect(ed.replace[1].inputs).toHaveLength(0)
    const p = ed.replace[0].inputs[0].props as PolylineProps
    expect(p.vertices.map((v) => [Math.round(v[0]), Math.round(v[1])])).toEqual([
      [100, 0],
      [10, 0],
      [0, 10],
      [0, 100],
    ])
  })
  it('FILLET ▸ Polyline sobre un rectángulo: 4 vértices o los que alcancen', () => {
    const rect = curveOf({ id: 'r', type: 'RECTANGLE', layer: '0', props: { corner: [0, 0, 0], width: 100, height: 50 } } as unknown as Entity) as Curve
    const r = cutVertices(rect, filletVertex(10))
    expect([r.done, r.short]).toEqual([4, 0])
    const p = r.curve.toEntity()?.props as PolylineProps
    expect(p.closed).toBe(true)
    expect(p.vertices).toHaveLength(8)
    expect(r.curve.length()).toBeCloseTo(300 - 80 + 20 * Math.PI, 6)
    const s = cutVertices(rect, filletVertex(30))
    expect([s.done, s.short]).toEqual([2, 2])
  })
})

describe('chamferCorner', () => {
  const a = (): CurvePick => line([0, 0, 0], [100, 0, 0], [50, 0, 0])
  const b = (): CurvePick => line([0, 0, 0], [0, 100, 0], [0, 50, 0])
  it('Distance: Dist1 sobre el primer objeto', () => {
    const k = ok(chamferCorner(a(), b(), { method: 'Distance', d1: 10, d2: 5 }))
    near(lineOut(k, 0).start, [10, 0])
    near(lineOut(k, 1).start, [0, 5])
    const ch = cornerEdit(k, true).add[0].props as LineProps
    near(ch.start, [10, 0])
    near(ch.end, [0, 5])
  })
  it('Angle: longitud sobre la primera y ángulo desde ella', () => {
    const k = ok(chamferCorner(a(), b(), { method: 'Angle', length: 10, angle: Math.PI / 6 }))
    near(lineOut(k, 1).start, [0, 10 * Math.tan(Math.PI / 6)])
  })
  it('rechaza arcos y paralelas; distancia excesiva', () => {
    const arc = pk('ARC', { center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: 1, normal: [0, 0, 1] }, [10, 0, 0])
    expect(chamferCorner(arc, b(), { method: 'Distance', d1: 1, d2: 1 })).toEqual({ error: 'notLine' })
    expect(chamferCorner(a(), line([0, 5, 0], [10, 5, 0], [5, 5, 0]), { method: 'Distance', d1: 1, d2: 1 })).toEqual({ error: 'parallel' })
    expect(chamferCorner(a(), b(), { method: 'Distance', d1: 150, d2: 1 })).toEqual({ error: 'tooLarge' })
  })
  it('CHAMFER ▸ Polyline sobre un rectángulo', () => {
    const rect = curveOf({ id: 'r', type: 'RECTANGLE', layer: '0', props: { corner: [0, 0, 0], width: 100, height: 50 } } as unknown as Entity) as Curve
    const r = cutVertices(rect, chamferVertex({ method: 'Distance', d1: 10, d2: 10 }))
    expect([r.done, r.short]).toEqual([4, 0])
    expect(r.curve.length()).toBeCloseTo(300 - 80 + 40 * Math.SQRT2, 6)
  })
})

describe('comandos FILLET y CHAMFER', () => {
  let h: ReturnType<typeof makeEngine>
  const lp = (e: Entity): LineProps => e.props as LineProps
  /** Esquina en L en el origen: horizontal hacia +x y vertical hacia +y. */
  const corner = (): [Entity, Entity] => [
    h.add('LINE', { start: [0, 0, 0], end: [100, 0, 0] }),
    h.add('LINE', { start: [0, 0, 0], end: [0, 100, 0] }),
  ]
  beforeEach(() => {
    resetSysvars()
    h = makeEngine()
  })

  it('FILLET con el radio por defecto recorta y agrega el arco en un solo paso', async () => {
    const [l1, l2] = corner()
    await h.run('F')
    expect(h.prints).toContain('Current settings: Mode = TRIM, Radius = 10.0000')
    await h.click(50, 0, l1.id)
    await h.click(0, 50, l2.id)
    const lines = h.ofType('LINE').map(lp)
    expect(lines.some((l) => Math.abs(l.start[0] - 10) < 1e-9 || Math.abs(l.end[0] - 10) < 1e-9)).toBe(true)
    expect((h.ofType('ARC')[0].props as ArcProps).radius).toBeCloseTo(10)
    expect(h.engine.busy).toBe(false)
  })

  it('Radius, shift-select (radio 0) y Radius is too large', async () => {
    const [l1, l2] = corner()
    await h.run('F', 'R', '5')
    expect(sysvars.FILLETRAD).toBe(5)
    await h.click(50, 0, l1.id)
    await h.click(0, 50, l2.id)
    expect((h.ofType('ARC')[0].props as ArcProps).radius).toBeCloseTo(5)
    const a = h.add('LINE', { start: [300, 20, 0], end: [400, 20, 0] })
    const b = h.add('LINE', { start: [280, 40, 0], end: [280, 100, 0] })
    await h.run('F')
    await h.click(350, 20, a.id)
    await h.click(280, 60, b.id, true)
    expect(lp(h.ofType('LINE').find((e) => lp(e).end[0] === 400)!).start).toEqual([280, 20, 0])
    await h.run('F', 'R', '500')
    await h.click(350, 20, a.id)
    await h.click(280, 60, b.id)
    expect(h.prints.at(-1)).toBe('Radius is too large.')
  })

  it('Multiple + Undo interno, y Trim ▸ No trim conserva los objetos', async () => {
    const [l1, l2] = corner()
    const l3 = h.add('LINE', { start: [100, 0, 0], end: [100, 100, 0] })
    await h.run('F', 'M')
    await h.click(20, 0, l1.id)
    await h.click(0, 50, l2.id)
    const after1 = h.doc.entities.length
    const cur = h.ofType('LINE').find((e) => lp(e).end[0] === 100 && lp(e).end[1] === 0)!
    await h.click(80, 0, cur.id)
    await h.click(100, 50, l3.id)
    expect(h.ofType('ARC')).toHaveLength(2)
    await h.run('U')
    expect(h.ofType('ARC')).toHaveLength(1)
    expect(h.doc.entities).toHaveLength(after1)
    await h.run('')
    expect(h.engine.busy).toBe(false)
    const m = h.add('LINE', { start: [500, 0, 0], end: [600, 0, 0] })
    const n = h.add('LINE', { start: [500, 0, 0], end: [500, 100, 0] })
    await h.run('F', 'T', 'N')
    expect(sysvars.TRIMMODE).toBe(0)
    await h.click(550, 0, m.id)
    await h.click(500, 50, n.id)
    expect(lp(h.doc.entities.find((e) => e.id === m.id)!).start).toEqual([500, 0, 0])
    expect(h.ofType('ARC')).toHaveLength(2)
  })

  it('FILLET ▸ Polyline redondea todos los vértices del rectángulo', async () => {
    const r = h.add('RECTANGLE', { corner: [0, 0, 0], width: 100, height: 50 })
    await h.run('F', 'P')
    await h.click(50, 0, r.id)
    expect(h.prints).toContain('4 lines were filleted')
    const pl = h.ofType('POLYLINE')[0].props as PolylineProps
    expect(pl.vertices).toHaveLength(8)
  })

  it('CHAMFER por distancias y por ángulo; rechaza curvas', async () => {
    const [l1, l2] = corner()
    await h.run('CHA', 'D', '10', '5')
    await h.click(50, 0, l1.id)
    await h.click(0, 50, l2.id)
    const ch = h.ofType('LINE').map(lp).find((l) => l.start[0] !== l.end[0] && l.start[1] !== l.end[1])!
    expect([ch.start, ch.end].map((p) => p.map((v) => Math.round(v * 1e6) / 1e6))).toEqual(
      expect.arrayContaining([[10, 0, 0], [0, 5, 0]]),
    )
    const c = h.add('CIRCLE', { center: [300, 0, 0], radius: 10 })
    await h.run('CHA')
    expect(h.prints.at(-1)).toBe('(TRIM mode) Current chamfer Dist1 = 10.0000, Dist2 = 5.0000')
    await h.click(310, 0, c.id)
    expect(h.prints.at(-1)).toBe('Object is not a line or a 2D polyline segment.')
    await h.run('A', '20', '45')
    expect(sysvars.CHAMMODE).toBe('Angle')
    await h.run('')
    const a = h.add('LINE', { start: [500, 0, 0], end: [600, 0, 0] })
    const b = h.add('LINE', { start: [500, 0, 0], end: [500, 100, 0] })
    await h.run('CHA')
    await h.click(550, 0, a.id)
    await h.click(500, 50, b.id)
    expect(lp(h.doc.entities.find((e) => e.id === a.id) ?? h.ofType('LINE').find((e) => lp(e).end[0] === 600)!).start[0]).toBeCloseTo(520)
  })
})

describe('sysvars persistidas', () => {
  beforeEach(() => resetSysvars())
  it('exporta y valida FILLETRAD/CHAMFER*/TRIMMODE', () => {
    expect(persistedSysvars()).toMatchObject({ FILLETRAD: 10, CHAMFERD: 45, CHAMMODE: 'Distance', TRIMMODE: 1 })
    applySysvars({ FILLETRAD: 3, CHAMFERD: 200, CHAMMODE: 'Bogus', TRIMMODE: 0, CHAMFERA: -1 })
    expect(persistedSysvars()).toMatchObject({ FILLETRAD: 3, CHAMFERD: 45, CHAMMODE: 'Distance', TRIMMODE: 0, CHAMFERA: 10 })
  })
})
