import { beforeAll, describe, expect, it } from 'vitest'
import { OcctKernel } from 'occt-wasm'
import type { SolidProps } from '../document/types'
import type { Vec3 } from '../math'
import { evalSolid, HULL_ALLOWANCE, hullExcess, OcctEvalError, type OcctResult } from './occtEval'

let k: OcctKernel
beforeAll(async () => {
  k = await OcctKernel.init()
}, 30_000)

/** Volumen con signo de la malla teselada (positivo si las caras miran hacia afuera). */
function meshVolume(r: OcctResult): number {
  const P = r.mesh.positions
  const I = r.mesh.indices
  let v = 0
  for (let t = 0; t + 2 < I.length; t += 3) {
    const [a, b, c] = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3]
    v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])
  }
  return v / 6
}

const run = (p: SolidProps): OcctResult => {
  const r = evalSolid(k, p)
  expect(meshVolume(r) / r.stats.volume).toBeCloseTo(1, 1)
  return r
}

const cut = (org: Vec3): SolidProps => ({
  op: 'SUBTRACT',
  operands: [
    { op: 'SPHERE', center: [0, 0, 0], radius: 10, segments: 48 },
    { op: 'BOX', origin: org, width: 20, depth: 20, height: 20 },
  ],
})
const q = Math.sqrt(91 / 2)
const corrida = [[3, 3, 6], [3, 6, 3], [6, 3, 3], [3, q, q], [q, 3, q], [q, q, 3]] as Vec3[]
const s = Math.SQRT1_2 * 10
const centrada = [[0, 0, 5], [0, 5, 0], [5, 0, 0], [0, s, s], [s, 0, s], [s, s, 0]] as Vec3[]

describe('núcleo exacto (OCCT): esfera menos caja', () => {
  it('empalma las 6 aristas (corrida y centrada) sin salirse de la esfera', () => {
    for (const [org, pts] of [[[3, 3, 3], corrida], [[0, 0, 0], centrada]] as const) {
      const r = run({ op: 'FILLETEDGE', solid: cut(org as Vec3), edges: pts.map((at) => ({ at })), radius: 2 })
      const P = r.mesh.positions
      let maxR = 0
      for (let i = 0; i < P.length; i += 3) maxR = Math.max(maxR, Math.hypot(P[i], P[i + 1], P[i + 2]))
      expect(maxR).toBeLessThan(10.001)
      expect(r.stats.faces).toBeGreaterThan(10)
    }
  })

  it('los rellenos de las cóncavas terminan al ras de la esfera (dentro de la cápsula convexa del sólido original)', () => {
    const base = run(cut([3, 3, 3])).mesh.positions
    for (const m of [1, 5, 7, 11, 14, 15, 19, 37, 59]) {
      const r = run({ op: 'FILLETEDGE', solid: cut([3, 3, 3]), edges: corrida.filter((_, i) => m & (1 << i)).map((at) => ({ at })), radius: 2 })
      expect(hullExcess(base, r.mesh.positions)).toBeLessThan(0.05)
      expect(r.stats.hullExcess).toBeLessThan(HULL_ALLOWANCE / 2)
      expect(r.stats.volume).toBeGreaterThan(4000)
    }
  })

  it('un chaflán cóncavo que termina sobre la esfera la sigue: sale un poco de la cápsula y es correcto', () => {
    // Caja centrada, chaflán 3 en la cóncava del eje Z: su borde sobre la esfera sale ≈ d²/(4R) de la cápsula.
    const r = run({ op: 'CHAMFEREDGE', solid: cut([0, 0, 0]), edges: [{ at: centrada[0] }], d1: 3, d2: 3 })
    expect(r.stats.hullExcess).toBeGreaterThan(0.01)
    expect(r.stats.hullExcess).toBeLessThan(HULL_ALLOWANCE)
  })

  it('la cápsula convexa detecta lo que sobresale', () => {
    const cube = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1]
    expect(hullExcess(cube, [0.5, 0.5, 0.5])).toBe(0)
    // Con planos de apoyo en 256 direcciones la medida es aproximada (por defecto), nunca falsa.
    expect(hullExcess(cube, [0.5, 0.5, 1.3])).toBeGreaterThan(0.2)
    expect(hullExcess(cube, [0.5, 0.5, 1.3])).toBeLessThanOrEqual(0.3)
  })

  it('chaflán con aristas cóncavas y convexas en el mismo vértice: por grupos', () => {
    const r = run({ op: 'CHAMFEREDGE', solid: cut([3, 3, 3]), edges: [{ at: corrida[0] }, { at: corrida[3] }], d1: 1, d2: 1 })
    expect(r.stats.strategy).toBe('grouped')
  })

  it('un radio imposible es un error de FILLETEDGE con su radio', () => {
    // Dos aristas paralelas de una cara de 4 de ancho con radio 2,5: los empalmes se pisan.
    const bad: SolidProps = { op: 'FILLETEDGE', solid: { op: 'BOX', origin: [0, 0, 0], width: 4, depth: 4, height: 4 }, edges: [{ at: [2, 0, 0] }, { at: [2, 4, 0] }], radius: 3 }
    let err: unknown = null
    try {
      evalSolid(k, bad, { maxAttempts: 1 })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(OcctEvalError)
    expect((err as OcctEvalError).op).toBe('FILLETEDGE')
    expect((err as OcctEvalError).size).toBe(3)
  })
})

describe('núcleo exacto (OCCT): rótula GE 10 E', () => {
  const ring: SolidProps = {
    op: 'SUBTRACT',
    operands: [
      { op: 'INTERSECT', operands: [{ op: 'SPHERE', center: [0, 0, 0], radius: 8, segments: 48 }, { op: 'BOX', origin: [-10, -10, -4.5], width: 20, depth: 20, height: 9 }] },
      { op: 'CYLINDER', base: [0, 0, -6], radius: 5, height: 12, segments: 48 },
    ],
  }
  it('un clic por círculo empalma el círculo entero (una sola arista exacta)', () => {
    const rc = Math.sqrt(64 - 4.5 ** 2)
    const one = run({ op: 'FILLETEDGE', solid: ring, edges: [{ at: [rc, 0, 4.5] }, { at: [rc, 0, -4.5] }], radius: 0.3 })
    const lasso = run({ op: 'FILLETEDGE', solid: ring, edges: Array.from({ length: 24 }, (_, i) => ({ at: [rc * Math.cos(i / 4), rc * Math.sin(i / 4), 4.5] as Vec3 })).concat([{ at: [rc, 0, -4.5] }]), radius: 0.3 })
    expect(one.stats.volume).toBeCloseTo(lasso.stats.volume, 6)
    expect(one.stats.faces).toBe(6) // esfera, 2 empalmes, 2 caras planas, agujero
  })
})

describe('núcleo exacto (OCCT): hojas', () => {
  it('BOX con medidas negativas, CONE, TORUS y PRISM', () => {
    expect(run({ op: 'BOX', origin: [0, 0, 0], width: -2, depth: 3, height: 4 }).stats.volume).toBeCloseTo(24, 6)
    expect(run({ op: 'CONE', base: [0, 0, 0], radius: 3, radiusTop: 1, height: 6, segments: 32 }).stats.volume).toBeCloseTo((Math.PI * 6 * (9 + 3 + 1)) / 3, 4)
    expect(run({ op: 'TORUS', center: [1, 2, 3], radius: 5, tube: 1, segments: 32, axis: [1, 0, 0] }).stats.volume).toBeCloseTo(2 * Math.PI ** 2 * 5, 4)
    expect(run({ op: 'PRISM', center: [0, 0, 0], radius: 2, sides: 6, height: 5 }).stats.volume).toBeCloseTo(((3 * Math.sqrt(3)) / 2) * 4 * 5, 4)
  })

  it('EXTRUDE: los arcos del perfil son exactos (círculo completo y ranura)', () => {
    const n = 48
    const circle = Array.from({ length: n }, (_, i) => [4 * Math.cos((i * 2 * Math.PI) / n), 4 * Math.sin((i * 2 * Math.PI) / n), 0] as Vec3)
    expect(run({ op: 'EXTRUDE', profile: circle, height: 2, arcs: [[0, n]] }).stats.volume).toBeCloseTo(Math.PI * 16 * 2, 4)
    // Ranura: rectángulo 10 × 4 con medio círculo de radio 2 a la derecha (de (10,0) a (10,4) pasando por (12,2)).
    const arc = Array.from({ length: 9 }, (_, i) => [10 + 2 * Math.sin((i * Math.PI) / 8), 2 - 2 * Math.cos((i * Math.PI) / 8), 0] as Vec3)
    const slot: Vec3[] = [[0, 0, 0], ...arc, [0, 4, 0]]
    const r = run({ op: 'EXTRUDE', profile: slot, height: 3, arcs: [[1, 9]] })
    expect(r.stats.volume).toBeCloseTo((40 + 2 * Math.PI) * 3, 4)
  })

  it('REVOLVE con eje (tubo, media vuelta) y sin eje', () => {
    const tube: SolidProps = { op: 'REVOLVE', base: [0, 0, 0], profile: [[2, 0], [3, 0], [3, 4], [2, 4]], segments: 48, axis: [0, 0, 1], ref: [1, 0, 0], angle: -Math.PI }
    expect(run(tube).stats.volume).toBeCloseTo((Math.PI * (9 - 4) * 4) / 2, 4)
    const legacy: SolidProps = { op: 'REVOLVE', base: [0, 0, 0], profile: [[0, 0], [3, 0], [3, 4], [0, 4]], segments: 48 }
    expect(run(legacy).stats.volume).toBeCloseTo(Math.PI * 9 * 4, 4)
  })

  it('SWEEP en L con inglete y LOFT reglado', () => {
    const sweep: SolidProps = { op: 'SWEEP', profile: [[-1, -1], [1, -1], [1, 1], [-1, 1]], path: [[0, 0, 0], [10, 0, 0], [10, 10, 0]] }
    expect(run(sweep).stats.volume).toBeCloseTo(4 * 20, 3)
    const loft: SolidProps = {
      op: 'LOFT',
      sections: [
        [[0, 0, 0], [4, 0, 0], [4, 4, 0], [0, 4, 0]],
        [[1, 1, 3], [3, 1, 3], [3, 3, 3], [1, 3, 3]],
      ],
    }
    expect(run(loft).stats.volume).toBeCloseTo((3 / 3) * (16 + 4 + Math.sqrt(64)), 4)
  })

  it('SHELL: pared exacta', () => {
    const r = run({ op: 'SHELL', solid: { op: 'BOX', origin: [0, 0, 0], width: 10, depth: 10, height: 10 }, thickness: 1 })
    expect(r.stats.volume).toBeCloseTo(1000 - 512, 4)
  })

  it('caras de una misma superficie comparten grupo (sin arista falsa entre mitades de un plano)', () => {
    const r = run({ op: 'UNION', operands: [{ op: 'BOX', origin: [0, 0, 0], width: 2, depth: 2, height: 2 }, { op: 'BOX', origin: [2, 0, 0], width: 2, depth: 2, height: 2 }] })
    expect(new Set(r.mesh.triGroup).size).toBe(6)
  })
})
