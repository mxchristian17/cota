import { describe, it, expect } from 'vitest'
import { solidCenters, solidLeaves, solidProfiles, solidQuadrants, solidVertices, solidWireframe, translateSolid } from './solid'
import type { BoxProps, CylinderProps, ExtrudeProps, SolidProps, SphereProps } from '../document/types'

const leafA: ExtrudeProps = {
  op: 'EXTRUDE',
  profile: [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]],
  height: 5,
}
const leafB: ExtrudeProps = {
  op: 'EXTRUDE',
  profile: [[5, 5, 0], [15, 5, 0], [15, 15, 0], [5, 15, 0]],
  height: 8,
}

describe('solid tree helpers', () => {
  it('solidLeaves recorre el árbol', () => {
    const tree: SolidProps = { op: 'SUBTRACT', operands: [leafA, { op: 'UNION', operands: [leafB, leafA] }] }
    expect(solidLeaves(tree)).toHaveLength(3)
  })

  it('translateSolid desplaza todos los perfiles de las hojas', () => {
    const tree: SolidProps = { op: 'UNION', operands: [structuredClone(leafA), structuredClone(leafB)] }
    translateSolid(tree, 100, 0)
    const profiles = solidProfiles(tree)
    expect(profiles[0][0]).toEqual([100, 0, 0])
    expect(profiles[1][0]).toEqual([105, 5, 0])
  })

  it('solidProfiles de una hoja devuelve su perfil', () => {
    expect(solidProfiles(leafA)).toEqual([leafA.profile])
  })

  it('translateSolid desplaza también en Z (edición 3D)', () => {
    const leaf = structuredClone(leafA)
    translateSolid(leaf, 1, 2, 3)
    expect(solidProfiles(leaf)[0][0]).toEqual([1, 2, 3])
  })

  it('solidVertices incluye la cara superior (z + altura)', () => {
    const vs = solidVertices(leafA)
    expect(vs).toHaveLength(leafA.profile.length * 2) // base + tapa
    expect(vs).toContainEqual([0, 0, 0]) // esquina base
    expect(vs).toContainEqual([0, 0, 5]) // misma esquina, elevada por la altura
  })

  it('solidWireframe da loop base, loop superior y aristas verticales', () => {
    const w = solidWireframe(leafA)
    // 2 loops (base + tapa) + 4 aristas verticales
    expect(w).toHaveLength(2 + leafA.profile.length)
    expect(w[0][0]).toEqual(w[0][w[0].length - 1]) // loop base cerrado
    const vertical = w[2]
    expect(vertical).toEqual([[0, 0, 0], [0, 0, 5]]) // arista vertical base→tapa
  })
})

// --- : primitivas paramétricas ---

const box: BoxProps = { op: 'BOX', origin: [0, 0, 0], width: 10, depth: 20, height: 5 }
const cyl: CylinderProps = { op: 'CYLINDER', base: [0, 0, 0], radius: 4, height: 12, segments: 48 }
const sph: SphereProps = { op: 'SPHERE', center: [1, 2, 3], radius: 6, segments: 48 }

describe('solid tree helpers — primitivas', () => {
  it('solidLeaves cuenta primitivas dentro de booleanas', () => {
    const tree: SolidProps = { op: 'UNION', operands: [box, { op: 'SUBTRACT', operands: [cyl, sph] }] }
    expect(solidLeaves(tree)).toHaveLength(3)
  })

  it('translateSolid mueve el ancla de cada primitiva (3D)', () => {
    const b = structuredClone(box)
    translateSolid(b, 1, 2, 3)
    expect((b as BoxProps).origin).toEqual([1, 2, 3])
    const c = structuredClone(cyl)
    translateSolid(c, 5, 0, 1)
    expect((c as CylinderProps).base).toEqual([5, 0, 1])
    const s = structuredClone(sph)
    translateSolid(s, 0, 0, -3)
    expect((s as SphereProps).center).toEqual([1, 2, 0])
  })

  it('la caja aporta 8 vértices y 12 aristas de wireframe', () => {
    expect(solidVertices(box)).toHaveLength(8)
    expect(solidWireframe(box)).toHaveLength(2 + 4) // 2 loops + 4 verticales
  })

  it('las primitivas curvas NO aportan endpoints (sí center/quadrant)', () => {
    // Evita ensuciar el snap con puntos de facetado (fix ).
    expect(solidVertices(cyl)).toHaveLength(0)
    expect(solidVertices(sph)).toHaveLength(0)
    expect(solidCenters(cyl)).toHaveLength(2) // base + tapa
    expect(solidQuadrants(cyl)).toHaveLength(8) // 4 base + 4 tapa
    expect(solidCenters(sph)).toEqual([[1, 2, 3]])
    expect(solidWireframe(cyl).length).toBeGreaterThan(0)
    expect(solidWireframe(sph)).toHaveLength(3) // 3 círculos mayores
  })

  it('solidProfiles devuelve un footprint XY por primitiva', () => {
    expect(solidProfiles(box)[0]).toHaveLength(4)
    expect(solidProfiles(cyl)[0].length).toBeGreaterThan(3)
  })
})
