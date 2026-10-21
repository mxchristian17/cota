import { describe, expect, it } from 'vitest'
import '../../../render/csg'
import { solidMesh } from '../../../render/csg'
import { makeEngine } from '../../../test/engineHarness'
import { orthoUcs, ucsZ, type Ucs } from '../../ucs'
import type { Entity, SolidProps } from '../../document/types'
import type { Vec3 } from '../../math'
import { tessellateArc } from '../../geom/arc'
import { ellipsePoints } from '../../geom/ellipse'
import { polylinePoints } from '../../geom/polyline'
import { rigidPoint, rotationAbout, transformEntity } from '../../editing/rigid'
import { expandEntities } from '../../editing/block'

/**
 * editar en una vista que no es la de planta. ROTATE gira alrededor de la Z de la UCS y MIRROR
 * refleja respecto del plano perpendicular al XY de la UCS que contiene la línea de espejo: siempre
 * transformaciones rígidas en 3D, como el CAD clásico. Nada se aplana ni se deforma.
 */

type Pts = Vec3[]

/** Puntos característicos de una entidad, en un orden que no depende de cómo se parametrice. */
function samples(e: Entity): Pts {
  switch (e.type) {
    case 'LINE':
      return [e.props.start, e.props.end]
    case 'CIRCLE': {
      // Centro y puntos a lo largo del plano: el círculo queda determinado por su plano y su radio.
      return [e.props.center, ...tessellateArc({ ...e.props, startAngle: 0, endAngle: 0 }, 24)]
    }
    case 'ARC':
      return tessellateArc(e.props, 2) // inicio, medio y fin
    case 'ELLIPSE':
      return ellipsePoints(e.props, 24)
    case 'POLYLINE':
      return polylinePoints(e.props, 8)
    case 'SOLID3D':
      return solidMesh(e.props as SolidProps).vertices
    case 'TEXT': {
      const [p, n] = [e.props.position, e.props.normal]
      return [p, [p[0] + n[0], p[1] + n[1], p[2] + n[2]]]
    }
    default:
      return []
  }
}

/** Volumen de la malla (divergencia, caras en abanico). */
function volume(p: SolidProps): number {
  const m = solidMesh(p)
  let v = 0
  for (const f of m.faces) {
    const a = m.vertices[f[0]]
    for (let i = 1; i + 1 < f.length; i++) {
      const b = m.vertices[f[i]]
      const c = m.vertices[f[i + 1]]
      v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
    }
  }
  return Math.abs(v)
}

/** Mismo volumen, con tolerancia relativa (la teselación de las caras curvas redondea distinto). */
const expectSameVolume = (a: SolidProps, b: SolidProps) => expect(Math.abs(volume(a) - volume(b)) / volume(b)).toBeLessThan(1e-6)

const near = (a: Vec3, b: Vec3, tol: number) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < tol

/** Cada punto de `got` está en `want` y viceversa (como conjuntos, con tolerancia). */
function expectSameSet(got: Pts, want: Pts, what: string, tol = 1e-6): void {
  for (const p of got) expect(want.some((q) => near(p, q, tol)), `${what}: sobra ${p.map((v) => v.toFixed(3))}`).toBe(true)
  for (const q of want) expect(got.some((p) => near(p, q, tol)), `${what}: falta ${q.map((v) => v.toFixed(3))}`).toBe(true)
}

/** Modelo de la prueba de Christian: perfiles en planta, algunos extruidos, y curvas de varios tipos. */
function model(h: ReturnType<typeof makeEngine>): Entity[] {
  return [
    h.add('SOLID3D', { op: 'EXTRUDE', profile: [[0, 0, 0], [20, 0, 0], [20, 10, 0], [0, 10, 0]], height: 8 }),
    h.add('SOLID3D', { op: 'BOX', origin: [30, 0, 0], width: 6, depth: 4, height: 3 }),
    h.add('SOLID3D', { op: 'CYLINDER', base: [50, 5, 0], radius: 3, height: 7 }),
    h.add('SOLID3D', { op: 'PRISM', center: [65, 5, 0], radius: 4, sides: 6, height: 5 }),
    h.add('LINE', { start: [0, 20, 0], end: [10, 25, 0] }),
    h.add('CIRCLE', { center: [30, 20, 0], radius: 4, normal: [0, 0, 1] }),
    h.add('ARC', { center: [45, 20, 0], radius: 5, startAngle: 0, endAngle: Math.PI / 2, normal: [0, 0, 1] }),
    h.add('ELLIPSE', { center: [60, 20, 0], major: [6, 0, 0], ratio: 0.5, normal: [0, 0, 1] }),
    h.add('ELLIPSE', { center: [75, 20, 0], major: [4, 2, 0], ratio: 0.6, normal: [0, 0, 1], startParam: 0.3, endParam: 2.2 }),
    h.add('TEXT', { position: [0, 60, 0], height: 2.5, rotation: 0, text: 'Cota', normal: [0, 0, 1] }),
    h.add('POLYLINE', { vertices: [[0, 40, 0], [10, 40, 0], [10, 50, 0]], bulges: [0.5, 0], closed: false }),
    // Ya fuera de planta: un círculo vertical y una extrusión de lado.
    h.add('CIRCLE', { center: [30, 40, 5], radius: 3, normal: [1, 0, 0] }),
    h.add('SOLID3D', { op: 'EXTRUDE', profile: [[40, 40, 0], [40, 46, 0], [40, 46, 4], [40, 40, 4]], height: 5, axis: [1, 0, 0] }),
  ]
}

const before = (es: Entity[]) => es.map((e) => structuredClone(e))

describe('ROTATE en vistas que no son la de planta', () => {
  const cases: Array<[string, Ucs | null]> = [
    ['Right', orthoUcs('RIGHT')],
    ['Front', orthoUcs('FRONT')],
    ['planta (UCS universal)', null],
  ]
  for (const [name, ucs] of cases) {
    it(`ROTATE 90° en la UCS ${name}: giro rígido alrededor de su Z, los sólidos conservan el volumen`, async () => {
      const h = makeEngine()
      const es = model(h)
      const orig = before(es)
      if (ucs) h.setUcs(ucs)
      h.setSelection(es.map((e) => e.id))
      await h.run('ROTATE', '#0,0', '90')
      const r = rotationAbout([0, 0, 0], ucs ? ucsZ(ucs) : [0, 0, 1], Math.PI / 2)
      for (const o of orig) {
        const got = h.doc.getEntity(o.id)!
        const want = { ...transformEntity(o, r)!, id: o.id } as Entity
        expectSameSet(samples(got), samples(want), `${o.type} ${o.id}`)
        if (o.type === 'SOLID3D') expectSameVolume(got.props as SolidProps, o.props as SolidProps)
      }
    })
  }
})

describe('MIRROR en vistas que no son la de planta', () => {
  /** Reflexión respecto del plano que pasa por el origen con normal `n`. */
  const reflect = (n: Vec3) => (p: Vec3): Vec3 => {
    const d = 2 * (p[0] * n[0] + p[1] * n[1] + p[2] * n[2])
    return [p[0] - d * n[0], p[1] - d * n[1], p[2] - d * n[2]]
  }
  it('MIRROR en la UCS Right con línea vertical de la vista: refleja respecto del plano Y = 0', async () => {
    const h = makeEngine()
    const es = model(h)
    const orig = before(es)
    h.setUcs(orthoUcs('RIGHT'))
    h.setSelection(es.map((e) => e.id))
    // En la UCS Right la Y local es la Z del mundo: la línea (0,0)→(0,10) es el eje Z y el plano de espejo,
    // perpendicular al XY de la UCS (que es el plano YZ del mundo), es Y = 0.
    await h.run('MIRROR', '#0,0', '#0,10', 'Y')
    const f = reflect([0, 1, 0])
    for (const o of orig) {
      const got = h.doc.getEntity(o.id)
      expect(got, `${o.type} ${o.id} sigue`).toBeTruthy()
      expectSameSet(samples(got!), samples(o).map(f), `${o.type} ${o.id}`)
      if (o.type === 'SOLID3D') expectSameVolume(got!.props as SolidProps, o.props as SolidProps)
    }
  })

  it('MIRROR de una polilínea con arco en planta: el arco se refleja hacia el otro lado', async () => {
    const h = makeEngine()
    const pl = h.add('POLYLINE', { vertices: [[0, 0, 0], [10, 0, 0]], bulges: [0.5], closed: false })
    const orig = structuredClone(pl)
    h.setSelection([pl.id])
    await h.run('MIRROR', '#0,0', '#0,10', 'Y')
    const f = reflect([1, 0, 0])
    expectSameSet(samples(h.doc.getEntity(pl.id)!), samples(orig).map(f), 'POLYLINE')
  })
})

describe('SWEEP al rotar y reflejar', () => {
  const reflectX = (p: Vec3): Vec3 => [-p[0], p[1], p[2]]
  const sweep = { op: 'SWEEP', profile: [[0, 0], [3, 0], [3, 1], [1, 1], [1, 2], [0, 2]], path: [[0, 0, 0], [0, 10, 0], [5, 15, 4]] }

  it('MIRROR espeja también el perfil (un perfil en L queda como su imagen)', async () => {
    const h = makeEngine()
    const e = h.add('SOLID3D', structuredClone(sweep))
    const orig = structuredClone(e)
    h.setSelection([e.id])
    await h.run('MIRROR', '#0,0', '#0,10', 'Y')
    expectSameSet(samples(h.doc.getEntity(e.id)!), samples(orig).map(reflectX), 'SWEEP', 1e-3)
  })

  it('ROTATE en la UCS Right gira el barrido rígido', async () => {
    const h = makeEngine()
    const e = h.add('SOLID3D', structuredClone(sweep))
    const orig = structuredClone(e)
    h.setUcs(orthoUcs('RIGHT'))
    h.setSelection([e.id])
    await h.run('ROTATE', '#0,0', '90')
    const r = rotationAbout([0, 0, 0], [1, 0, 0], Math.PI / 2)
    const want = solidMesh(orig.props as SolidProps).vertices.map((v) => {
      const m = r.m
      return [m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2] + r.t[0], m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2] + r.t[1], m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2] + r.t[2]] as Vec3
    })
    expectSameSet(samples(h.doc.getEntity(e.id)!), want, 'SWEEP', 1e-3)
  })
})

describe('Bloques en 3D', () => {
  /** Puntos de la geometría de mundo de una inserción (bloque expandido). */
  const blockPts = (h: ReturnType<typeof makeEngine>, id: string): Pts =>
    expandEntities([h.doc.getEntity(id)!], h.doc.blocks).flatMap((e) => samples(e))
  const defineBlock = (h: ReturnType<typeof makeEngine>) =>
    h.doc.setBlock({
      name: 'B',
      entities: [
        { id: 'b1', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [10, 0, 0] } },
        { id: 'b2', type: 'CIRCLE', layer: '0', props: { center: [5, 3, 0], radius: 2, normal: [0, 0, 1] } },
        { id: 'b3', type: 'POLYLINE', layer: '0', props: { vertices: [[0, 6, 0], [8, 6, 0]], bulges: [0.5], closed: false } },
        { id: 'b4', type: 'SOLID3D', layer: '0', props: { op: 'EXTRUDE', profile: [[0, 0, 0], [4, 0, 0], [4, 2, 0], [0, 2, 0]], height: 3 } },
      ],
    } as never)

  it('ROTATE en la UCS Right gira el bloque rígido (antes quedaba sin girar)', async () => {
    const h = makeEngine()
    defineBlock(h)
    const ins = h.add('INSERT', { name: 'B', position: [5, 2, 0], scale: [1, 1, 1], rotation: 0.3 })
    const before = blockPts(h, ins.id)
    h.setUcs(orthoUcs('RIGHT'))
    h.setSelection([ins.id])
    await h.run('ROTATE', '#0,0', '90')
    const r = rotationAbout([0, 0, 0], [1, 0, 0], Math.PI / 2)
    expectSameSet(blockPts(h, ins.id), before.map((p) => rigidPoint(r, p)), 'INSERT', 1e-6)
  })

  it('MIRROR de un bloque fuera de planta', async () => {
    const h = makeEngine()
    defineBlock(h)
    const ins = h.add('INSERT', { name: 'B', position: [5, 2, 1], scale: [1, 1, 1], rotation: 0.4, normal: [1, 0, 0] })
    const before = blockPts(h, ins.id)
    h.setSelection([ins.id])
    await h.run('MIRROR', '#0,0', '#0,10', 'Y')
    expectSameSet(blockPts(h, ins.id), before.map((p) => [-p[0], p[1], p[2]] as Vec3), 'INSERT', 1e-6)
  })

  it('INSERT en la UCS Front apoya el bloque en el plano XZ', async () => {
    const h = makeEngine()
    defineBlock(h)
    h.setUcs(orthoUcs('FRONT'))
    await h.run('INSERT', 'B', '#0,0', '', '')
    const ins = h.ofType('INSERT')[0]
    for (const p of blockPts(h, ins.id).filter((_, i) => i < 30)) expect(Math.abs(p[1])).toBeLessThan(3.0001) // la extrusión sale hacia −Y/+Y hasta 3
    const line = expandEntities([ins], h.doc.blocks).find((e) => e.type === 'LINE')!
    const [a, b] = [(line.props as { start: Vec3 }).start, (line.props as { end: Vec3 }).end]
    expect(b[0] - a[0]).toBeCloseTo(10, 9) // X del bloque = X de la UCS Front
    expect(Math.abs(b[1] - a[1]) + Math.abs(b[2] - a[2])).toBeLessThan(1e-9)
  })
})
