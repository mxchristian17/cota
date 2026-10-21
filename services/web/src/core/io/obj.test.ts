import { describe, expect, it } from 'vitest'
import { exportObj, importObj, type ObjMesh } from './obj'

const CUBE: ObjMesh = {
  name: 'cube',
  vertices: [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
  ],
  faces: [
    [0, 1, 2],
    [0, 2, 3],
  ],
}

describe('OBJ export/import', () => {
  it('exporta con índices 1-based y encabezado de objeto', () => {
    const obj = exportObj([CUBE])
    expect(obj).toContain('o cube')
    expect(obj).toContain('v 0 0 0')
    expect(obj).toContain('f 1 2 3')
    expect(obj).toContain('f 1 3 4')
  })

  it('round-trip preserva vértices y caras', () => {
    const meshes = importObj(exportObj([CUBE]))
    expect(meshes).toHaveLength(1)
    expect(meshes[0].vertices).toHaveLength(4)
    expect(meshes[0].faces).toEqual([
      [0, 1, 2],
      [0, 2, 3],
    ])
  })

  it('acumula offset global entre múltiples objetos', () => {
    const obj = exportObj([CUBE, { ...CUBE, name: 'cube2' }])
    const meshes = importObj(obj)
    expect(meshes).toHaveLength(2)
    // El segundo objeto referencia sus propios vértices tras remapear.
    expect(meshes[1].faces).toEqual([
      [0, 1, 2],
      [0, 2, 3],
    ])
  })

  it('triangula caras poligonales por abanico e ignora normales/UV', () => {
    const meshes = importObj('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1/1/1 2/2/2 3/3/3 4/4/4\n')
    expect(meshes[0].faces).toEqual([
      [0, 1, 2],
      [0, 2, 3],
    ])
  })

  it('soporta índices negativos (relativos al final)', () => {
    const meshes = importObj('v 0 0 0\nv 1 0 0\nv 1 1 0\nf -3 -2 -1\n')
    expect(meshes[0].faces).toEqual([[0, 1, 2]])
  })
})
