import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../math'
import { buildTopology } from '../editing/topology'
import { brepFaceIds, openBoundaryEdges } from './importedMesh'

const SMOOTH = Math.cos((25 * Math.PI) / 180)
const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3[] => [a, b, c, a, c, d]

describe('caras del B-rep de una malla importada', () => {
  it('cada cara con sus propios vértices (como OpenCascade): una cara por componente', () => {
    // Dos caras de una esquina: comparten la arista en posición, no en índice.
    const vertices: Vec3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]]
    const ids = brepFaceIds({ vertices, faces: [[0, 1, 2, 3], [4, 5, 6, 7]] })
    expect(ids).toHaveLength(4) // dos triángulos por cuadrilátero
    expect(ids![0]).toBe(ids![1])
    expect(ids![2]).toBe(ids![3])
    expect(ids![0]).not.toBe(ids![2])
  })

  it('no es un B-rep: malla soldada (una sola componente) o sopa de triángulos sueltos (STL sin soldar)', () => {
    const welded = { vertices: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] as Vec3[], faces: [[0, 1, 2], [0, 2, 3]] }
    expect(brepFaceIds(welded)).toBeNull()
    const soup = { vertices: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]] as Vec3[], faces: [[0, 1, 2], [3, 4, 5]] }
    expect(brepFaceIds(soup)).toBeNull()
  })
})

describe('bordes sueltos de una malla importada', () => {
  // Esquina en L (piso z = 0 y pared x = 0) con la arista común partida en otros puntos de cada lado y separada 0,003.
  const floor = [...quad([0, 0, 0], [10, 0, 0], [10, 4, 0], [0, 4, 0]), ...quad([0, 4, 0], [10, 4, 0], [10, 10, 0], [0, 10, 0])]
  const wall = [...quad([0.003, 0, 0], [0.003, 0, 10], [0.003, 6, 10], [0.003, 6, 0]), ...quad([0.003, 6, 0], [0.003, 6, 10], [0.003, 10, 10], [0.003, 10, 0])]
  const topoOf = (tris: Vec3[]) => buildTopology(tris.flat(), null, undefined, false, { orient: true, open: true })

  it('una arista viva sin coser se dibuja una sola vez, de punta a punta', () => {
    const topo = topoOf([...floor, ...wall])
    const out: Vec3 = [-1, -1, 1].map((v) => v / Math.sqrt(3)) as Vec3
    const edges = openBoundaryEdges(topo, out, false, SMOOTH)
    // Sobre la arista común (x ≈ 0, z = 0) sólo de un lado, cubriendo y = 0..10 una vez.
    const onEdge = edges.filter(([a, b]) => a[0] < 0.01 && b[0] < 0.01 && Math.abs(a[2]) < 1e-9 && Math.abs(b[2]) < 1e-9)
    expect(onEdge.reduce((s, [a, b]) => s + Math.abs(b[1] - a[1]), 0)).toBeCloseTo(10, 6)
  })

  it('la unión suave de dos caras coplanares no se dibuja; los bordes libres sí', () => {
    // El piso partido en dos caras sin coser (z = 0 y z = 0,002): sólo su contorno exterior.
    const a = quad([0, 0, 0], [10, 0, 0], [10, 4, 0], [0, 4, 0])
    const b = quad([0, 4, 0.002], [10, 4, 0.002], [10, 10, 0.002], [0, 10, 0.002])
    const topo = topoOf([...a, ...b])
    const edges = openBoundaryEdges(topo, [0, 0, 1], true, SMOOTH)
    expect(edges.some(([p, q]) => Math.abs(p[1] - 4) < 1e-9 && Math.abs(q[1] - 4) < 1e-9)).toBe(false)
    const length = edges.reduce((s, [p, q]) => s + Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]), 0)
    expect(length).toBeCloseTo(40, 2) // perímetro 10 × 10
  })
})
