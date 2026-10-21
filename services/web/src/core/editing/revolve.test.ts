import { describe, it, expect } from 'vitest'
import type { Vec3 } from '../math'
import type { RevolveProps } from '../document/types'
import { earClip, revolveMesh, revolveProfile } from './revolve'
import { solidWireframe } from './solid'
import { makeEngine } from '../../test/engineHarness'

/** Volumen con signo de una malla cerrada (teorema de la divergencia). */
function volume(m: { positions: number[]; indices: number[] }): number {
  const P = (i: number): Vec3 => [m.positions[3 * i], m.positions[3 * i + 1], m.positions[3 * i + 2]]
  let v = 0
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [P(m.indices[t]), P(m.indices[t + 1]), P(m.indices[t + 2])]
    v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])
  }
  return v / 6
}

/** ¿Cada arista (por posición) la comparten exactamente dos triángulos con sentidos opuestos? */
function watertight(m: { positions: number[]; indices: number[] }): boolean {
  const key = (i: number) => [0, 1, 2].map((k) => Math.round(m.positions[3 * i + k] * 1e6)).join(',')
  const edges = new Map<string, number>()
  for (let t = 0; t < m.indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = key(m.indices[t + k])
      const b = key(m.indices[t + ((k + 1) % 3)])
      edges.set(`${a}|${b}`, (edges.get(`${a}|${b}`) ?? 0) + 1)
    }
  }
  for (const [e, n] of edges) {
    const [a, b] = e.split('|')
    if (n !== 1 || edges.get(`${b}|${a}`) !== 1) return false
  }
  return true
}

const rect: Vec3[] = [
  [2, 0, 0],
  [5, 0, 0],
  [5, 10, 0],
  [2, 10, 0],
]
const props = (angle: number, start = 0): RevolveProps => {
  const r = revolveProfile(rect, [0, 0, 0], [0, 1, 0], angle, start, 48)
  if ('error' in r) throw new Error(r.error)
  return r.props
}
const polyArea = (n: number) => (n / 2) * Math.sin((2 * Math.PI) / n) / Math.PI // área del n-gono / área del círculo

describe('REVOLVE con eje', () => {
  it('vuelta completa: tubo de volumen π(R²−r²)h, estanco', () => {
    const m = revolveMesh(props(2 * Math.PI))
    expect(volume(m)).toBeCloseTo(Math.PI * (25 - 4) * 10 * polyArea(48), 6)
    expect(watertight(m)).toBe(true)
  })

  it('revolución parcial con tapas: un cuarto del volumen, estanca, también en sentido inverso', () => {
    for (const a of [Math.PI / 2, -Math.PI / 2]) {
      const m = revolveMesh(props(a))
      expect(volume(m)).toBeGreaterThan(0)
      expect(volume(m)).toBeCloseTo((Math.PI * 21 * 10 * polyArea(48)) / 4, 0)
      expect(watertight(m)).toBe(true)
    }
  })

  it('un círculo alrededor de un eje da un toro (2π²Rr²)', () => {
    const circle: Vec3[] = Array.from({ length: 64 }, (_, i) => [10 + 2 * Math.cos((i / 64) * 2 * Math.PI), 2 * Math.sin((i / 64) * 2 * Math.PI), 0])
    const r = revolveProfile(circle, [0, 0, 0], [0, 1, 0], 2 * Math.PI, 0, 96)
    if ('error' in r) throw new Error(r.error)
    const m = revolveMesh(r.props)
    expect(volume(m) / (2 * Math.PI * Math.PI * 10 * 4)).toBeCloseTo(1, 2)
    expect(watertight(m)).toBe(true)
  })

  it('perfil tocando el eje: vértices fusionados, sin triángulos degenerados', () => {
    const tri: Vec3[] = [
      [0, 0, 0],
      [5, 0, 0],
      [0, 8, 0],
    ]
    const r = revolveProfile(tri, [0, 0, 0], [0, 1, 0], 2 * Math.PI, 0, 32)
    if ('error' in r) throw new Error(r.error)
    const m = revolveMesh(r.props)
    expect(volume(m)).toBeCloseTo((Math.PI * 25 * 8 * polyArea(32)) / 3, 6) // cono
    expect(watertight(m)).toBe(true)
  })

  it('errores del CAD clásico: eje que cruza el perfil y perfil fuera del plano del eje', () => {
    expect(revolveProfile(rect, [3, 0, 0], [3, 1, 0], Math.PI)).toEqual({ error: 'The axis cannot cross the profile.' })
    expect(revolveProfile(rect, [0, 0, 0], [0, 0, 1], Math.PI)).toEqual({ error: 'The profile and the axis must lie in the same plane.' })
  })

  it('wireframe: perfil en los extremos y arcos de los vértices extremos', () => {
    expect(solidWireframe(props(Math.PI / 2)).length).toBeGreaterThanOrEqual(4)
  })

  it('earClip triangula un polígono cóncavo', () => {
    const tris = earClip([
      [0, 0],
      [4, 0],
      [4, 4],
      [2, 1],
      [0, 4],
    ])
    expect(tris).toHaveLength(3)
  })

  it('comando: perfil + eje por dos puntos + Enter (360) y consume el perfil', async () => {
    const h = makeEngine()
    const r = h.add('RECTANGLE', { corner: [2, 0, 0], width: 3, height: 10 })
    h.setSelection([r.id])
    await h.run('REVOLVE', '#0,0', '#0,10', '')
    const s = h.ofType('SOLID3D')
    expect(s).toHaveLength(1)
    expect(s[0].props).toMatchObject({ op: 'REVOLVE', axis: [0, 1, 0] })
    expect(h.ofType('RECTANGLE')).toHaveLength(0)
    // Segunda vez: el ángulo recordado y el eje Y.
    const r2 = h.add('RECTANGLE', { corner: [2, 20, 0], width: 3, height: 5 })
    h.setSelection([r2.id])
    await h.run('REVOLVE', 'Y', '90')
    h.setSelection([h.add('RECTANGLE', { corner: [2, 40, 0], width: 3, height: 5 }).id])
    await h.run('REVOLVE', 'Y', '')
    const angles = h.ofType('SOLID3D').map((e) => (e.props as RevolveProps).angle)
    expect(angles[1]).toBeCloseTo(Math.PI / 2, 12)
    expect(angles[2]).toBeCloseTo(Math.PI / 2, 12)
  })
})

describe('TORUS', () => {
  it('comando: radio, tubo, Diameter y valores recordados; snaps de centro y cuadrantes', async () => {
    const { solidCenters, solidQuadrants } = await import('./solid')
    const h = makeEngine()
    await h.run('TORUS', '#0,0', '20', 'D', '6')
    await h.run('TORUS', '#100,0', '', '')
    const [a, b] = h.ofType('SOLID3D').map((e) => e.props)
    expect(a).toMatchObject({ op: 'TORUS', radius: 20, tube: 3 })
    expect(b).toMatchObject({ op: 'TORUS', radius: 20, tube: 3, center: [100, 0, 0] })
    expect(solidCenters(a as never)).toEqual([[0, 0, 0]])
    const q = solidQuadrants(a as never).map((v) => Math.hypot(v[0], v[1]))
    expect(q.filter((d) => Math.abs(d - 23) < 1e-9)).toHaveLength(4)
    expect(q.filter((d) => Math.abs(d - 17) < 1e-9)).toHaveLength(4)
  })
})
