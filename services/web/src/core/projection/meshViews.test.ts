import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../math'
import { flatshotItems } from './flatshot'
import { projectHidden, type Mesh, type ProjBasis, type ProjItem } from './orthographic'

/**
 * Vistas de dibujo de mallas importadas (MESH3D de un STEP/IGES), con mallas sintéticas armadas como las entrega
 * OpenCascade: cada cara del B-rep teselada por separado, con sus propios vértices (no los comparte con las vecinas).
 */

const FRONT: ProjBasis = { right: [1, 0, 0], up: [0, 0, 1], out: [0, -1, 0] } // papel X/Z, observador en −Y

/** Malla importada con una lista de triángulos por cara del B-rep; los vértices se repiten de una cara a otra. */
function brepMesh(faces: Vec3[][][]): Mesh {
  const vertices: Vec3[] = []
  const out: number[][] = []
  for (const face of faces) {
    const index = new Map<string, number>()
    const id = (p: Vec3) => {
      const k = p.join(',')
      let i = index.get(k)
      if (i === undefined) {
        i = vertices.length
        vertices.push(p)
        index.set(k, i)
      }
      return i
    }
    for (const t of face) out.push(t.map(id))
  }
  return { vertices, faces: out, imported: true }
}

const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3[][] => [
  [a, b, c],
  [a, c, d],
]
const flip = (face: Vec3[][]): Vec3[][] => face.map((t) => [t[0], t[2], t[1]])

/** Caja 10×10×10 con cada cara aparte (antihorarias vistas desde afuera); `flipTop` invierte la de arriba (IGES). */
function boxFaces(flipTop = false): Vec3[][][] {
  const p = (x: number, y: number, z: number): Vec3 => [x * 10, y * 10, z * 10]
  const top = quad(p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1))
  return [
    quad(p(0, 0, 0), p(0, 1, 0), p(1, 1, 0), p(1, 0, 0)), // abajo
    flipTop ? flip(top) : top,
    quad(p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)), // frente (y = 0)
    quad(p(0, 1, 0), p(0, 1, 1), p(1, 1, 1), p(1, 1, 0)), // atrás
    quad(p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0)), // izquierda
    quad(p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)), // derecha
  ]
}

/** Cilindro de eje Z (radio 10, alto 20): lateral con los ángulos `side`, tapas con `cap` (pueden no coincidir). */
function cylinderFaces(side: number[], cap: number[]): Vec3[][][] {
  const [r, h] = [10, 20]
  const p = (a: number, z: number): Vec3 => [r * Math.cos(a), r * Math.sin(a), z]
  const ring = (as: number[]) => as.map((a, i) => [a, as[(i + 1) % as.length]] as const)
  return [
    ring(side).flatMap(([a, b]) => quad(p(a, 0), p(b, 0), p(b, h), p(a, h))),
    ring(cap).map(([a, b]): Vec3[] => [[0, 0, h], p(a, h), p(b, h)]),
    ring(cap).map(([a, b]): Vec3[] => [[0, 0, 0], p(b, 0), p(a, 0)]),
  ]
}
const steps = (n: number) => Array.from({ length: n }, (_, i) => (2 * Math.PI * i) / n)

const visibleLines = (items: ProjItem[]) => items.filter((it): it is Extract<ProjItem, { kind: 'line' }> => it.kind === 'line' && !it.hidden)
/** Largo visible sobre la horizontal v = `v` (las líneas dibujadas que corren sobre ella). */
const coveredAt = (items: ProjItem[], v: number) =>
  visibleLines(items)
    .filter((l) => Math.abs(l.a[1] - v) < 0.05 && Math.abs(l.b[1] - v) < 0.05)
    .reduce((s, l) => s + Math.abs(l.b[0] - l.a[0]), 0)

describe('vistas de mallas importadas (B28)', () => {
  it('una cara invertida (IGES) no pierde sus aristas: el contorno de la caja sale completo', () => {
    const items = flatshotItems([brepMesh(boxFaces(true))], [], FRONT, { showObscured: false, tangential: true })
    // Antes la cara de arriba, recorrida al revés, no se emparejaba con las laterales: faltaba el borde superior.
    expect(coveredAt(items, 10)).toBeCloseTo(10, 3)
    expect(coveredAt(items, 0)).toBeCloseTo(10, 3)
    const verticals = visibleLines(items).filter((l) => Math.abs(l.a[0] - l.b[0]) < 1e-6)
    expect(verticals.reduce((s, l) => s + Math.abs(l.b[1] - l.a[1]), 0)).toBeCloseTo(20, 3)
  })

  it('caras sin coser (el borde de la tapa teselado distinto que el del lateral): el borde se dibuja entero y una sola vez', () => {
    const items = flatshotItems([brepMesh(cylinderFaces(steps(96), steps(64)))], [], FRONT, { showObscured: false, tangential: true })
    // Arriba y abajo, vista de canto, la tapa es una línea de lado a lado (antes no salía: sus medias aristas quedaban
    // sueltas). Sin líneas repetidas: cubre el diámetro una sola vez.
    for (const v of [0, 20]) {
      expect(coveredAt(items, v)).toBeGreaterThan(19.9)
      expect(coveredAt(items, v)).toBeLessThan(20.1)
    }
  })

  it('una cara de la propia malla a menos de la flecha de teselación no tapa la arista; la de otra pieza sí', () => {
    // Esquina de chapa (techo z = 10 y pared y = 0, arista común cosida) y, delante de la pared, otra cara de la misma
    // malla a 0,005 que sobrepasa la arista en altura: la separación de dos caras vecinas de un IGES sin coser. Antes
    // esa cara tapaba la arista (diferencia de profundidad mayor que el sesgo): salía cortada en trazos.
    const corner = [quad([0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10]), quad([0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10])]
    const front = [quad([0, -0.005, 0], [10, -0.005, 0], [10, -0.005, 10.02], [0, -0.005, 10.02])]
    const edgeOf = (segs: ReturnType<typeof projectHidden>) =>
      segs.filter((s) => s.a3 && s.b3 && Math.abs(s.a3[1]) < 1e-9 && Math.abs(s.b3[1]) < 1e-9 && Math.abs(s.a3[2] - 10) < 1e-9 && Math.abs(s.b3[2] - 10) < 1e-9)
    const own = edgeOf(projectHidden([brepMesh([...corner, ...front])], FRONT))
    expect(own.length).toBeGreaterThan(0)
    expect(own.every((s) => !s.hidden)).toBe(true)
    // La misma cara delante, pero de otra pieza: tapa la arista como siempre.
    const other = edgeOf(projectHidden([brepMesh(corner), brepMesh(front)], FRONT))
    expect(other.length).toBeGreaterThan(0)
    expect(other.every((s) => s.hidden)).toBe(true)
  })

  it('un cilindro con teselación despareja no muestra tangentes inventadas: sólo contorno y bordes', () => {
    // Bandas alternadas de 3° y 27° (como deja OpenCascade junto a un rebaje): la estimación de tangentes por la forma
    // de las facetas tomaba las anchas por planas y dibujaba generatrices sueltas sobre el lateral.
    const side: number[] = []
    for (let a = 0, k = 0; side.length < 24; k++) {
      side.push((a * Math.PI) / 180)
      a += k % 2 ? 27 : 3
    }
    const items = flatshotItems([brepMesh(cylinderFaces(side, side))], [], FRONT, { showObscured: false, tangential: true })
    const inner = visibleLines(items).filter((l) => Math.abs(l.a[1] - l.b[1]) > 1 && Math.max(Math.abs(l.a[0]), Math.abs(l.b[0])) < 9)
    expect(inner).toEqual([])
    expect(coveredAt(items, 20)).toBeGreaterThan(19)
  })
})
