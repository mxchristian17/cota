import { beforeEach, describe, expect, it } from 'vitest'
import { solidGeometry, triangleSoup } from '../../render/csg'
import type { ChamferEdgeProps, Entity, FilletEdgeProps, SolidProps } from '../document/types'
import { resetSysvars } from '../commands/sysvars'
import { makeEngine } from '../../test/engineHarness'
import { applyField, entityFields } from './props'
import { blendProfile } from './edgeBlend'
import { edgeMidpoint, solidTopology } from './topology'

/** Volumen de la malla evaluada del sólido (teorema de la divergencia). */
function volume(p: SolidProps): number {
  const s = triangleSoup(solidGeometry(p))
  let v = 0
  for (let i = 0; i + 8 < s.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = Array.from(s.subarray(i, i + 9))
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
  }
  return v / 6
}

const box: SolidProps = { op: 'BOX', origin: [0, 0, 0], width: 10, depth: 10, height: 10 }
/** Área del segmento entre la esquina y el arco poligonal de 12 tramos (90°, 7,5° c/u). */
const filletArea = (r: number): number => r * r - (r * r / 2) * 12 * Math.sin((7.5 * Math.PI) / 180)

describe('perfil de empalme/chaflán', () => {
  it('fillet convexo a 90°: tangente a ambas caras a distancia r', () => {
    const p = blendProfile([0, 0, 1], [0, 1, 0], true, { kind: 'fillet', r: 2 })
    expect(p?.[1]).toEqual([0, -2, 0])
    expect(p?.[p.length - 3][1]).toBeCloseTo(0)
    expect(p?.[p.length - 3][2]).toBeCloseTo(-2)
  })

  it('chaflán cóncavo y arista de filo', () => {
    const p = blendProfile([0, 0, 1], [1, 0, 0], false, { kind: 'chamfer', d1: 1, d2: 3 })
    expect(p?.slice(1, 3)).toEqual([
      [1, 0, 0],
      [0, 0, 3],
    ])
    expect(blendProfile([0, 0, 1], [0, 0, -1], true, { kind: 'fillet', r: 1 })).toBeNull()
  })
})

describe('FILLETEDGE / CHAMFEREDGE evaluados con CSG', () => {
  it('fillet de una arista de la caja quita el área del empalme a lo largo de la arista', () => {
    const v = volume({ op: 'FILLETEDGE', solid: box, edges: [{ at: [5, 0, 10] }], radius: 2 })
    expect(v).toBeCloseTo(1000 - filletArea(2) * 10, 1)
  })

  it('chaflán con d1 ≠ d2: d1 sobre la cara de referencia', () => {
    const solid: SolidProps = { op: 'CHAMFEREDGE', solid: box, edges: [{ at: [5, 0, 10], base: [5, 1, 10] }], d1: 2, d2: 1 }
    expect(volume(solid)).toBeCloseTo(1000 - 10, 3)
    const t = solidTopology(solid)
    // La cara superior queda recortada 2 en Y (d1) y la frontal 1 en Z (d2).
    expect(t?.edges.some((e) => e.pts.every((p) => Math.abs(p[1] - 2) < 1e-6 && Math.abs(p[2] - 10) < 1e-6))).toBe(true)
    expect(t?.edges.some((e) => e.pts.every((p) => Math.abs(p[1]) < 1e-6 && Math.abs(p[2] - 9) < 1e-6))).toBe(true)
  })

  it('arista cóncava: el empalme suma material', () => {
    const step: SolidProps = {
      op: 'SUBTRACT',
      operands: [box, { op: 'BOX', origin: [5, -1, 5], width: 6, depth: 12, height: 6 }],
    }
    const v0 = volume(step)
    expect(v0).toBeCloseTo(750, 3)
    expect(volume({ op: 'FILLETEDGE', solid: step, edges: [{ at: [5, 5, 5] }], radius: 2 })).toBeCloseTo(v0 + filletArea(2) * 10, 1)
  })

  it('borde circular del cilindro y aristas inexistentes', () => {
    const cyl: SolidProps = { op: 'CYLINDER', base: [0, 0, 0], radius: 5, height: 10, segments: 48 }
    const v0 = volume(cyl)
    const v = volume({ op: 'CHAMFEREDGE', solid: cyl, edges: [{ at: [5, 0, 10] }], d1: 1, d2: 1 })
    // Pappus: área 0,5 a radio medio ≈ 5 − 1/3.
    expect(v0 - v).toBeGreaterThan(0.5 * 2 * Math.PI * (5 - 1 / 3) * 0.95)
    expect(v0 - v).toBeLessThan(0.5 * 2 * Math.PI * (5 - 1 / 3) * 1.05)
    expect(volume({ op: 'FILLETEDGE', solid: cyl, edges: [{ at: [50, 0, 10] }], radius: 1 })).toBeCloseTo(v0, 6)
  })

  it('las 12 aristas de la caja: esquinas esféricas y un sólido sin aristas vivas', () => {
    const t = solidTopology(box)
    const edges = (t?.edges ?? []).map((e) => ({ at: edgeMidpoint(e) }))
    const round: SolidProps = { op: 'FILLETEDGE', solid: box, edges, radius: 2 }
    // Aristas: 12 × área × 6; esquinas: 8 × (cubo r³ − octante de esfera), con facetado.
    const exact = 1000 - 12 * (4 - Math.PI) * 6 - 8 * (8 - (4 / 3) * Math.PI)
    expect(Math.abs(volume(round) - exact)).toBeLessThan(2)
    // Sin aristas vivas: sólo quedan las tangentes (cara plana ↔ empalme, empalme ↔ esquina), como el CAD clásico.
    const after = solidTopology(round)
    expect(after?.edges.length).toBeGreaterThan(0)
    for (const e of after?.edges ?? []) e.n1.forEach((n, i) => expect(n[0] * e.n2[i][0] + n[1] * e.n2[i][1] + n[2] * e.n2[i][2]).toBeGreaterThan(0.9))
  })
})

describe('comandos FILLETEDGE y CHAMFEREDGE', () => {
  let h: ReturnType<typeof makeEngine>
  let solid: Entity
  beforeEach(() => {
    resetSysvars()
    h = makeEngine()
    solid = h.add('SOLID3D', structuredClone(box))
  })
  const props = (): SolidProps => solid.props as SolidProps

  it('FILLETEDGE ▸ Radius + arista tecleada: nodo paramétrico que conserva la caja', async () => {
    await h.run('FILLETEDGE', 'R', '2', '5,0,10', '')
    expect(h.prints).toContain('Radius = 10.0000')
    expect(h.prints).toContain('1 edge(s) selected for fillet.')
    expect(props().op).toBe('FILLETEDGE') // aplicado en vivo mientras se espera la aceptación
    await h.run('')
    const p = props() as FilletEdgeProps
    expect(p.radius).toBe(2)
    expect(p.solid).toEqual(box)
    expect(p.edges).toEqual([{ at: [5, 0, 10] }])
    expect(volume(p)).toBeCloseTo(1000 - filletArea(2) * 10, 3)
    expect(h.engine.busy).toBe(false)
  })

  it('Loop ▸ Next elige el lazo de la otra cara; ESC al aceptar deja el sólido como estaba', async () => {
    await h.run('FILLETEDGE', 'R', '1', 'L', '5,0,10', 'N', '', '')
    expect(h.prints).toContain('4 edge(s) selected for fillet.')
    const ats = (props() as FilletEdgeProps).edges.map((e) => e.at[1])
    expect(ats).toEqual([0, 0, 0, 0]) // lazo de la cara frontal (y = 0), no el de la superior
    h.engine.cancel()
    await h.run()
    expect(props()).toEqual(box)
  })

  it('Chain sobre el borde superior de una arista redondeada recorre la curva y frena en las esquinas', async () => {
    await h.run('FILLETEDGE', 'R', '2', '0,0,5', '', '')
    h.prints.length = 0
    await h.run('FILLETEDGE', 'C', '5,0,10', '', '')
    // El borde superior ya no es una sola curva: recta, arco tangente y recta, y la cadena toma las tres.
    expect(h.prints).toContain('3 edge(s) selected for fillet.')
  })

  it('CHAMFEREDGE ▸ Distance 2/1: Distance1 sobre la cara que mira al observador', async () => {
    await h.run('CHAMFEREDGE', 'D', '2', '1', '5,0,10', '', '')
    expect(h.prints).toContain('Distance1 = 10.0000, Distance2 = 10.0000')
    const p = props() as ChamferEdgeProps
    expect([p.d1, p.d2]).toEqual([2, 1])
    expect(p.edges[0].base?.[1]).toBeGreaterThan(0) // punto sobre la cara superior
    expect(p.edges[0].base?.[2]).toBeCloseTo(10, 9)
    expect(volume(p)).toBeCloseTo(990, 3)
  })

  it('FILLET sobre un sólido redirige a FILLETEDGE; Propiedades edita el radio', async () => {
    await h.run('FILLET')
    await h.click(5, 0, solid.id)
    await h.run('R', '3', '', '')
    const p = props() as FilletEdgeProps
    expect(p.edges).toEqual([{ at: [5, 0, 0] }])
    expect(entityFields(solid).find((f) => f.key === 'radius')?.value).toBe(3)
    applyField(solid, 'radius', 1.5)
    expect(p.radius).toBe(1.5)
  })
})
