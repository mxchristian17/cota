import { describe, expect, it } from 'vitest'
import '../../../render/csg'
import { makeEngine } from '../../../test/engineHarness'
import { THREADS, closestIndex, nearestThreads } from '../../thread/tables'
import { cylinderOfFace, solidThreads, threadViewItems } from '../../thread/geometry'
import { solidTopology } from '../../editing/topology'
import { transformEntity } from '../../editing/rigid'
import type { ArcEntity, DimensionEntity, SolidEntity, SolidProps } from '../../document/types'

const find = (list: typeof THREADS.M, des: string) => list.find((t) => t.designation === des)!

describe('Tablas de roscas', () => {
  it('diámetros de fondo según norma (métrica, trapezoidal, BSP y Whitworth)', () => {
    const m10 = find(THREADS.M, 'M10')
    expect([m10.pitch, m10.d3, m10.D1]).toEqual([1.5, 8.16, 8.376])
    expect(find(THREADS.MF, 'M10x1,25').D1).toBeCloseTo(8.647, 3)
    const tr = find(THREADS.TR, 'Tr 20x4')
    expect([tr.d3, tr.D1]).toEqual([15.5, 16])
    expect(find(THREADS.BSP, 'G 1/2').D1).toBeCloseTo(18.631, 2)
    expect(find(THREADS.BSW, 'W 3/8"').tpi).toBe(16)
    expect(find(THREADS.M, 'M2,5').pitch).toBe(0.45)
  })

  it('la más próxima de cada serie: el nominal en un eje, el diámetro menor en un agujero', () => {
    expect(nearestThreads(10, false).map((t) => t.designation)).toEqual(['M10', 'M10x1,25', 'W 3/8"', 'G 1/8', 'Tr 10x2'])
    const hole = nearestThreads(8.5, true)
    expect(hole[0].designation).toBe('M10')
    expect(hole[1].designation).toBe('M10x1,25')
    expect(closestIndex(hole, 8.5, true)).toBe(0)
  })
})

describe('THREAD 2D', () => {
  it('eje: arco fino de 3/4 en el fondo, cota con el designativo; volver a ejecutarlo no hace nada', async () => {
    const h = makeEngine()
    await h.run('CIRCLE', '0,0', '5')
    const c = h.doc.entities.at(-1)!
    await h.run('THREAD')
    await h.click(5, 0, c.id)
    await h.run('1,1', '', 'Yes', '20,20')
    const arc = h.doc.entities.find((e) => e.type === 'ARC') as ArcEntity
    expect(arc.props.thread).toMatchObject({ designation: 'M10', internal: false, series: 'M' })
    expect(arc.props.radius).toBeCloseTo(4.08, 6)
    expect([arc.props.startAngle, arc.props.endAngle]).toEqual([Math.PI / 2, 0])
    expect(arc.lineWeight).toBe(0.18)
    const lead = h.doc.entities.find((e) => e.type === 'DIMENSION') as DimensionEntity
    expect(lead.props.dimType).toBe('MLEADER')
    expect(lead.props.textOverride).toBe('M10')
    expect(lead.props.points[0][0]).toBeCloseTo(5 * Math.SQRT1_2, 6)
    const n = h.doc.entities.length
    await h.run('THREAD')
    await h.click(-4.08, 0, arc.id)
    expect(h.doc.entities.length).toBe(n)
    expect(h.prints.join('\n')).toContain('Thread M10 is already dimensioned.')
  })

  it('agujero (lado de afuera): arco en el nominal; sin cota, THREAD sobre la rosca la agrega una sola vez', async () => {
    const h = makeEngine()
    await h.run('CIRCLE', '0,0', '4.25')
    const c = h.doc.entities.at(-1)!
    await h.run('THREAD')
    await h.click(4.25, 0, c.id)
    await h.run('10,0', '2', 'No')
    const arc = h.doc.entities.find((e) => e.type === 'ARC') as ArcEntity
    expect(arc.props.thread).toMatchObject({ designation: 'M10x1,25', internal: true })
    expect(arc.props.radius).toBeGreaterThan(4.25)
    expect(h.doc.entities.some((e) => e.type === 'DIMENSION')).toBe(false)
    // Sobre el círculo de nuevo: reconoce la rosca y ofrece la cota.
    await h.run('THREAD')
    await h.click(4.25, 0, c.id)
    await h.run('Yes', '15,15')
    expect(h.doc.entities.filter((e) => e.type === 'DIMENSION')).toHaveLength(1)
    await h.run('THREAD')
    await h.click(arc.props.radius, 0, arc.id)
    expect(h.doc.entities.filter((e) => e.type === 'DIMENSION')).toHaveLength(1)
  })
})

const shaft: SolidProps = { op: 'CYLINDER', base: [0, 0, 0], radius: 5, height: 20, segments: 48, axis: [1, 0, 0] }

describe('THREAD 3D', () => {
  it('cara cilíndrica de un eje: rosca exterior que sigue al sólido al moverlo', async () => {
    const h = makeEngine()
    const s = h.add('SOLID3D', shaft) as SolidEntity
    await h.run('THREAD')
    await h.click3(10, 0, 5)
    await h.run('', 'No')
    const th = solidThreads((h.doc.getEntity(s.id) as SolidEntity).props)
    expect(th).toHaveLength(1)
    expect(th[0].info).toMatchObject({ designation: 'M10', internal: false })
    const moved = transformEntity(h.doc.getEntity(s.id)!, { m: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 10, 0] })
    const t2 = solidThreads((moved as { props: SolidProps }).props)[0]
    expect(t2.a[1] - th[0].a[1]).toBeCloseTo(10, 6)
    // Ya roscada y sin cota: ofrece agregarla; con cota, no hace nada.
    await h.run('THREAD')
    await h.click3(10, 0, 5)
    await h.run('Yes', '10,0,20')
    expect(h.doc.entities.filter((e) => e.type === 'DIMENSION')).toHaveLength(1)
    await h.run('THREAD')
    await h.click3(10, 0, 5)
    expect(h.doc.entities.filter((e) => e.type === 'DIMENSION')).toHaveLength(1)
  })

  it('el agujero de una pieza es una cara cilíndrica interior; vistas: líneas finas de costado y 3/4 de frente', () => {
    const hole: SolidProps = { op: 'SUBTRACT', operands: [{ op: 'BOX', origin: [-10, -10, 0], width: 20, depth: 20, height: 10 }, { op: 'CYLINDER', base: [0, 0, -1], radius: 4.25, height: 12, segments: 48 }] }
    const topo = solidTopology(hole)!
    const cyl = [...Array(topo.faceCount).keys()].map((f) => cylinderOfFace(topo, f)).find(Boolean)!
    expect(cyl.shaft).toBe(false)
    // El eje sale de los vértices (sobre el cilindro): exacto aunque la CSG parta las facetas en triángulos desparejos.
    expect(cyl.radius).toBeCloseTo(4.25, 6)
    expect(Math.hypot(cyl.a[0], cyl.a[1])).toBeLessThan(1e-6)
    const withThread: SolidProps = { ...shaft, threads: [{ a: [0, 0, 0], b: [20, 0, 0], rim: [0, 5, 0], info: { series: 'M', designation: 'M10', d: 10, pitch: 1.5, internal: false } }] }
    const side = threadViewItems(withThread, { right: [1, 0, 0], up: [0, 0, 1], out: [0, -1, 0] }, solidTopology(withThread), 0)
    expect(side.map((i) => i.kind)).toEqual(['line', 'line'])
    expect(side.every((i) => !i.hidden)).toBe(true)
    expect(side[0].kind === 'line' && Math.abs(side[0].a[1])).toBeCloseTo(4.08, 2)
    const end = threadViewItems(withThread, { right: [0, 1, 0], up: [0, 0, 1], out: [1, 0, 0] }, solidTopology(withThread), 0)
    expect(end).toHaveLength(1)
    expect(end[0]).toMatchObject({ kind: 'arc', a0: Math.PI / 2, a1: 0, hidden: false })
    expect(end[0].kind === 'arc' && end[0].r).toBeCloseTo(4.08, 2)
  })
})
