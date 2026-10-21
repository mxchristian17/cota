import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { ArcProps, DimensionProps, Entity, PolylineProps, SolidProps } from '../document/types'
import { arcPointAtAngle } from '../geom/arc'
import { polylinePoints } from '../geom/polyline'
import { linearDir } from '../dimension/dimGeometry'
import { orthoUcs, ucsFrom3Points, WORLD_UCS } from '../ucs'
import { pt, type Vec3 } from '../math'
import { composeRigid, invertRigid, rigidFromUcs, rigidPoint, rigidToUcs, rotationAbout, transformEntity, transformSolid } from './rigid'
import { solidGeometry } from '../../render/csg'

const closeV = (a: Vec3, b: Vec3, d = 9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], d))
const ent = <T extends Entity['type']>(type: T, props: object): Entity => ({ id: 'e', type, layer: '0', props }) as unknown as Entity

describe('transformaciones rígidas', () => {
  it('rotación alrededor de un eje cualquiera y su inversa', () => {
    const r = rotationAbout([1, 1, 0], [0, 0, 1], Math.PI / 2)
    closeV(rigidPoint(r, [2, 1, 0]), [1, 2, 0])
    const id = composeRigid(invertRigid(r), r)
    closeV(rigidPoint(id, [3, -4, 5]), [3, -4, 5])
  })

  it('un arco en el plano FRONT girado 90° alrededor de Z sigue pasando por sus puntos transformados', () => {
    const arc: ArcProps = { center: [5, 0, 5], radius: 3, startAngle: 0.3, endAngle: 2.1, normal: [0, -1, 0] }
    const r = rotationAbout([0, 0, 0], [0, 0, 1], Math.PI / 2)
    const out = transformEntity(ent('ARC', arc), r)!.props as ArcProps
    closeV(out.normal, [1, 0, 0])
    const sweep = (((out.endAngle - out.startAngle) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    expect(sweep).toBeCloseTo(arc.endAngle - arc.startAngle, 9)
    for (const a of [arc.startAngle, 1.2, arc.endAngle]) {
      const t = (a - arc.startAngle) / (arc.endAngle - arc.startAngle)
      closeV(arcPointAtAngle(out, out.startAngle + t * sweep), rigidPoint(r, arcPointAtAngle(arc, a)), 6)
    }
  })

  it('una polilínea con bulge en el plano FRONT dibuja el arco en ese plano', () => {
    const p: PolylineProps = { vertices: [[0, 2, 0], [10, 2, 0]], bulges: [1], closed: false, normal: [0, -1, 0] }
    const pts = polylinePoints(p)
    expect(pts.length).toBeGreaterThan(4)
    for (const q of pts) expect(q[1]).toBeCloseTo(2, 9) // todo en y = 2
    expect(Math.max(...pts.map((q) => Math.abs(q[2])))).toBeCloseTo(5, 6) // semicírculo de radio 5
  })

  it('una caja girada conserva su forma (BOX con base de ejes)', () => {
    const box: SolidProps = { op: 'BOX', origin: [0, 0, 0], width: 10, depth: 4, height: 2 }
    const r = rotationAbout([0, 0, 0], [0, 0, 1], Math.PI / 2)
    const out = transformSolid(box, r)!
    expect(out).toMatchObject({ op: 'BOX', basis: { x: [expect.closeTo(0), expect.closeTo(1), 0] } })
    const g = solidGeometry(out)
    g.computeBoundingBox()
    const b = g.boundingBox as THREE.Box3
    closeV([b.min.x, b.min.y, b.min.z], [-4, 0, 0], 6)
    closeV([b.max.x, b.max.y, b.max.z], [0, 10, 2], 6)
  })

  it('una cota lineal vertical sigue midiendo lo mismo en otra base', () => {
    const d = { dimType: 'LINEAR', points: [[0, 0, 0], [0, 10, 0]], textPos: [-5, 5, 0], style: {} } as unknown as DimensionProps
    const u = ucsFrom3Points(WORLD_UCS, pt(0, 0, 0), pt(1, 1, 0), pt(-1, 1, 1))!
    const r = rigidToUcs(u)
    const out = transformEntity(ent('DIMENSION', d), r)!.props as DimensionProps
    // La dirección medida (Y del mundo) transformada es la que mide la cota transformada.
    const want = rigidPoint({ ...r, t: [0, 0, 0] }, linearDir(d))
    closeV(linearDir(out), want, 9)
  })

  it('ida y vuelta al marco de la UCS Front deja las entidades iguales', () => {
    const f = orthoUcs('FRONT')
    const arc: ArcProps = { center: [5, 3, 5], radius: 3, startAngle: 0.3, endAngle: 2.1, normal: [0, -1, 0] }
    const local = transformEntity(ent('ARC', arc), rigidToUcs(f))!
    expect((local.props as ArcProps).normal[2]).toBeCloseTo(1, 9) // en el marco local, en planta
    const back = transformEntity({ ...local, id: 'x' } as Entity, rigidFromUcs(f))!.props as ArcProps
    closeV(back.center, arc.center)
    closeV(back.normal, arc.normal)
    expect(back.startAngle).toBeCloseTo(arc.startAngle, 9)
    expect(back.endAngle).toBeCloseTo(arc.endAngle, 9)
  })
})
