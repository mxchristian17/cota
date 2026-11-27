import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../math'
import { acisSamples } from '../../test/acisSamples'
import { DocumentModel } from '../document/DocumentModel'
import type { BlockDef, BrepProps, Entity, SolidProps } from '../document/types'
import { affinePoint } from '../geom/affine'
import { rotateEntityInput } from './array'
import { expandEntities } from './block'
import { acisBox, brepCorners, brepLeafFromAcis, brepWire, mayHitSolid, transformBrep } from './brepLeaf'
import { scaleEntity, translateEntity } from './edit'
import { rotationAbout, transformSolid } from './rigid'
import { solidProfiles } from './solid'
import { stretchEntity } from './stretch'
import { mirrorAxis, mirrorPoint, mirrorSolid } from './transform'

const [solid] = acisSamples('sample_AC1032.dwg').map((s) => s.data)

const fresh = (): { doc: DocumentModel; e: Entity & { props: BrepProps } } => {
  const doc = DocumentModel.createDefault('t')
  const leaf = brepLeafFromAcis(doc, solid)!
  return { doc, e: { id: 's1', type: 'SOLID3D', layer: '0', props: leaf } as Entity & { props: BrepProps } }
}

const near = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 7))
/** La transformación de la hoja es la de sus puntos: cada esquina de la caja va adonde la lleva `f`. */
const followsCorners = (before: BrepProps, after: SolidProps, f: (v: Vec3) => Vec3) => {
  expect(after.op).toBe('BREP')
  const a = brepCorners(after as BrepProps)
  brepCorners(before).forEach((c, i) => near(a[i], f(c)))
}

describe('hoja BREP (sólido importado)', () => {
  it('su caja contiene las aristas del modelo y su alambre son las aristas del ACIS', () => {
    const { e } = fresh()
    const box = acisBox(solid)!
    expect(e.props.box).toEqual(box)
    const wire = brepWire(e.props)
    expect(wire.length).toBeGreaterThan(6) // más que las 12 aristas de una caja en 6 polilíneas
    for (const pl of wire) for (const v of pl) v.forEach((x, i) => expect(x).toBeGreaterThanOrEqual(box[0][i] - 1e-9))
    expect(solidProfiles(e.props).flat()).toHaveLength(8)
  })

  it('MOVE y SCALE componen la matriz', () => {
    const { e } = fresh()
    const before = structuredClone(e.props)
    translateEntity(e, 5, -3, 2)
    followsCorners(before, e.props, (v) => [v[0] + 5, v[1] - 3, v[2] + 2])
    const moved = structuredClone(e.props)
    scaleEntity(e, [1, 1, 1], 2)
    followsCorners(moved, e.props, (v) => [1 + (v[0] - 1) * 2, 1 + (v[1] - 1) * 2, 1 + (v[2] - 1) * 2])
  })

  it('ROTATE en planta, MIRROR y una rotación 3D (ALIGN, ROTATE3D)', () => {
    const { e } = fresh()
    const rotated = rotateEntityInput(e, [10, 0, 0], Math.PI / 3)
    followsCorners(e.props, rotated.props as SolidProps, (v) => {
      const [x, y] = [v[0] - 10, v[1]]
      return [10 + x * Math.cos(Math.PI / 3) - y * Math.sin(Math.PI / 3), x * Math.sin(Math.PI / 3) + y * Math.cos(Math.PI / 3), v[2]]
    })
    const ax = mirrorAxis([0, 0, 0], [1, 1, 0])!
    const m = structuredClone(e.props)
    expect(mirrorSolid(m, ax)).toBe(true)
    followsCorners(e.props, m, (v) => mirrorPoint(v, ax))
    const r = rotationAbout([1, 2, 3], [1, 0, 0], 0.4)
    const t = transformSolid(e.props, r)!
    followsCorners(e.props, t, (v) => affinePoint([r.m[0][0], r.m[1][0], r.m[2][0], r.t[0], r.m[0][1], r.m[1][1], r.m[2][1], r.t[1], r.m[0][2], r.m[1][2], r.m[2][2], r.t[2]], v))
  })

  it('en una inserción de bloque va adonde la lleva la inserción, con su escala', () => {
    const { e } = fresh()
    const blocks: BlockDef[] = [{ name: 'P', entities: [e] }]
    const ins: Entity = { id: 'i1', type: 'INSERT', layer: '0', props: { name: 'P', position: [100, 50, 0], scale: [2, 2, 2], rotation: Math.PI / 2 } }
    const [out] = expandEntities([ins], blocks)
    followsCorners(e.props, out.props as SolidProps, (v) => [100 - 2 * v[1], 50 + 2 * v[0], 2 * v[2]])
  })

  it('STRETCH la mueve entera si su caja queda adentro; si no, no la toca', () => {
    const { e } = fresh()
    const [lo, hi] = e.props.box
    const all = { minX: lo[0] - 1, minY: lo[1] - 1, maxX: hi[0] + 1, maxY: hi[1] + 1 }
    expect(stretchEntity(e, all, [1, 0, 0]).kind).toBe('move')
    const half = { ...all, maxX: (lo[0] + hi[0]) / 2 }
    expect(stretchEntity(e, half, [1, 0, 0]).kind).toBe('none')
  })

  it('la matriz sale sin ruido de punto flotante (la limpieza del dibujo no cambia la clave de la pieza)', () => {
    const { e } = fresh()
    const moved = transformBrep(e.props, (v) => [v[0] + 0.1 + 0.2, v[1], v[2]])
    expect(moved.m![3]).toBe(0.3)
  })

  it('elegir entre miles de piezas: por su caja, el rayo o el punto que no la tocan la descartan', () => {
    const { e } = fresh()
    const [lo, hi] = [e.props.box[0], e.props.box[1]]
    const c: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
    expect(mayHitSolid(e.props, [c[0], c[1], 100], [0, 0, -1])).toBe(true)
    expect(mayHitSolid(e.props, [hi[0] + 50, c[1], 100], [0, 0, -1])).toBe(false)
    expect(mayHitSolid(e.props, [hi[0] + 50, c[1], 100], [0, 0, -1], 60)).toBe(true) // con la tolerancia del cursor
    expect(mayHitSolid(e.props, c, null)).toBe(true)
    expect(mayHitSolid(e.props, [hi[0] + 50, c[1], c[2]], null)).toBe(false)
    // Los sólidos propios no se descartan por caja.
    expect(mayHitSolid({ op: 'BOX' }, [1e9, 0, 0], null)).toBe(true)
  })
})
