import { describe, expect, it } from 'vitest'
import '../../../render/csg'
import { makeEngine } from '../../../test/engineHarness'
import { orthoUcs, ucsFromAngle, type Ucs } from '../../ucs'
import { pt, type Vec3 } from '../../math'
import type { ArcProps, PolylineProps, SolidProps, TextProps } from '../../document/types'
import { polylinePoints } from '../../geom/polyline'
import { arcEndpoints } from '../../geom/arc'

const closeV = (a: Vec3, b: Vec3, d = 9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], d))
const front = (): Ucs => orthoUcs('FRONT')

describe('comandos en el plano de la UCS', () => {
  it('RECTANGLE en la UCS Front es una polilínea vertical con su normal', async () => {
    const h = makeEngine()
    h.setUcs(front())
    await h.run('RECTANGLE', '0,0', '@10,5')
    const [pl] = h.ofType('POLYLINE')
    const p = pl.props as PolylineProps
    closeV(p.normal!, [0, -1, 0])
    for (const v of p.vertices) expect(v[1]).toBeCloseTo(0, 9)
    expect(Math.max(...p.vertices.map((v) => v[2]))).toBeCloseTo(5, 9)
  })

  it('RECTANGLE en una UCS girada 30° en planta queda girado', async () => {
    const h = makeEngine()
    h.setUcs(ucsFromAngle(pt(0, 0, 0), Math.PI / 6))
    await h.run('RECTANGLE', '0,0', '@10,0')
    // Un rectángulo de alto 0 es inválido: con alto 4.
    await h.run('RECTANGLE', '0,0', '@10,4')
    const [pl] = h.ofType('POLYLINE')
    closeV((pl.props as PolylineProps).vertices[1], [10 * Math.cos(Math.PI / 6), 10 * Math.sin(Math.PI / 6), 0])
  })

  it('ARC por tres puntos en la UCS Front: en el plano XZ', async () => {
    const h = makeEngine()
    h.setUcs(front())
    await h.run('ARC', '#0,0', '#5,5', '#10,0')
    const a = h.ofType('ARC')[0].props as ArcProps
    expect(Math.abs(a.normal[1])).toBeCloseTo(1, 9)
    for (const q of arcEndpoints(a)) expect(q[1]).toBeCloseTo(0, 9)
    closeV(a.center, [5, 0, 0])
  })

  it('PLINE con un tramo de arco en la UCS Front dibuja el arco vertical', async () => {
    const h = makeEngine()
    h.setUcs(front())
    await h.run('PLINE', '#0,0', '#10,0', 'A', '#10,10', '')
    const p = h.ofType('POLYLINE')[0].props as PolylineProps
    closeV(p.normal!, [0, -1, 0])
    const pts = polylinePoints(p)
    for (const q of pts) expect(q[1]).toBeCloseTo(0, 6)
    expect(Math.max(...pts.map((q) => q[0]))).toBeGreaterThan(14) // el arco sale hacia +X
  })

  it('FILLET de dos líneas verticales en la UCS Front', async () => {
    const h = makeEngine()
    h.setUcs(front())
    const a = h.add('LINE', { start: [0, 0, 0], end: [20, 0, 0] })
    const b = h.add('LINE', { start: [0, 0, 0], end: [0, 0, 20] })
    await h.run('FILLET', 'R', '5')
    await h.click3(15, 0, 0, a.id)
    await h.click3(0, 0, 15, b.id)
    const arc = h.ofType('ARC')[0].props as ArcProps
    expect(arc.radius).toBeCloseTo(5, 9)
    closeV(arc.center, [5, 0, 5])
    const lines = h.ofType('LINE').map((e) => e.props as { start: Vec3; end: Vec3 })
    expect(lines.some((l) => Math.abs(l.start[0] - 5) < 1e-9 && Math.abs(l.end[0] - 20) < 1e-9)).toBe(true)
    expect(lines.some((l) => Math.abs(l.start[2] - 5) < 1e-9 && Math.abs(l.end[2] - 20) < 1e-9)).toBe(true)
  })

  it('OFFSET y ROTATE en la UCS Front', async () => {
    const h = makeEngine()
    h.setUcs(front())
    const l = h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    await h.run('OFFSET', '5')
    await h.click3(5, 0, 0, l.id)
    await h.run('#5,8', '')
    const off = h.ofType('LINE').find((e) => e.id !== l.id)!
    closeV((off.props as { start: Vec3 }).start, [0, 0, 5])
    h.setSelection([l.id])
    await h.run('ROTATE', '#0,0', '90')
    closeV((h.doc.getEntity(l.id)!.props as { end: Vec3 }).end, [0, 0, 10])
  })

  it('BOX y CYLINDER se alinean a la UCS; TEXT corre por la X de la UCS', async () => {
    const h = makeEngine()
    h.setUcs(ucsFromAngle(pt(0, 0, 0), Math.PI / 2))
    await h.run('BOX', '0,0', '@10,4', '3')
    const box = h.ofType('SOLID3D')[0].props as SolidProps & { basis?: { x: Vec3 } }
    closeV(box.basis!.x, [0, 1, 0])
    h.setUcs(front())
    await h.run('CYLINDER', '0,0', '2', '6')
    const cyl = h.ofType('SOLID3D')[1].props as { axis: Vec3 }
    closeV(cyl.axis, [0, -1, 0])
    await h.run('TEXT', '0,0', '2.5', '0', 'Hola', '')
    const t = h.ofType('TEXT')[0].props as TextProps
    closeV(t.normal, [0, -1, 0])
  })

  it('TRIM y MIRROR en la UCS Front', async () => {
    const h = makeEngine()
    h.setUcs(front())
    h.add('LINE', { start: [5, 0, -5], end: [5, 0, 5] }) // vertical en XZ (arista cortante)
    const l = h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    await h.run('TRIM', '')
    await h.click3(8, 0, 0, l.id)
    await h.run('')
    const trimmed = h.ofType('LINE').map((e) => e.props as { start: Vec3; end: Vec3 }).find((p) => Math.abs(p.start[2]) < 1e-9 && Math.abs(p.end[2]) < 1e-9)!
    expect(Math.max(trimmed.start[0], trimmed.end[0])).toBeCloseTo(5, 9)

    const m = h.add('LINE', { start: [0, 0, 10], end: [3, 0, 12] })
    h.setSelection([m.id])
    await h.run('MIRROR', '#0,0', '#0,10', 'N')
    const mir = h.ofType('LINE').at(-1)!.props as { start: Vec3; end: Vec3 }
    closeV(mir.end, [-3, 0, 12]) // espejo respecto del eje vertical x = 0 del plano XZ
  })

  it('DIMLINEAR en una UCS girada 30° mide sobre la X de la UCS (hdir)', async () => {
    const h = makeEngine()
    h.setUcs(ucsFromAngle(pt(0, 0, 0), Math.PI / 6))
    await h.run('DIMLINEAR', '*0,0,0', `*${10 * Math.cos(Math.PI / 6)},5,0`, '#5,6')
    expect(h.prints).toContain('Dimension text = 10')
    const d = h.ofType('DIMENSION')[0].props as { hdir?: number }
    expect(d.hdir).toBeCloseTo(30, 9)
  })

  it('con la UCS universal no se toca nada (sin marco)', async () => {
    const h = makeEngine()
    await h.run('RECTANGLE', '0,0', '@10,5')
    expect(h.ofType('RECTANGLE')).toHaveLength(1)
  })
})

describe('UCS dinámica', () => {
  it('CIRCLE con el primer punto sobre la cara lateral de una caja: queda en esa cara y vuelve la UCS', async () => {
    const { faceUcsAt } = await import('../../editing/faceUcs')
    const h = makeEngine()
    h.add('SOLID3D', { op: 'BOX', origin: [0, 0, 0], width: 40, depth: 30, height: 20 })
    // Rayo hacia la cara x = 40 (como el del viewport bajo el cursor).
    const hit = faceUcsAt(h.doc.entities, [100, 15, 10], [-1, 0, 0])
    if (!hit?.planar) throw new Error('sin cara')
    await h.run('CIRCLE')
    await h.clickFace(40, 15, 10, hit.ucs)
    await h.run('5')
    await new Promise((r) => setTimeout(r, 20))
    const c = h.ofType('CIRCLE')[0].props as { center: Vec3; normal: Vec3; radius: number }
    closeV(c.center, [40, 15, 10])
    closeV(c.normal, [1, 0, 0])
    expect(c.radius).toBe(5)
    closeV(h.ucs().x, [1, 0, 0]) // la UCS vuelve a la universal
    closeV(h.ucs().y, [0, 1, 0])
    expect(h.prints.filter((l) => l === 'Command: CIRCLE')).toHaveLength(1)
  })

  it('con UCSDETECT = 0 la cara no cambia nada', async () => {
    const { sysvars, resetSysvars } = await import('../sysvars')
    sysvars.UCSDETECT = 0
    const h = makeEngine()
    await h.run('CIRCLE')
    await h.clickFace(40, 15, 10, orthoUcs('RIGHT'))
    await h.run('5')
    closeV((h.ofType('CIRCLE')[0].props as { normal: Vec3 }).normal, [0, 0, 1])
    resetSysvars()
  })
})
