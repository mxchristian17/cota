import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { MAX_SEGMENTS, solidGeometry } from './csg'
import type {
  PrismProps,
  RevolveProps,
  SweepProps,
  LoftProps,
  ShellProps,
  BoxProps,
  CylinderProps,
  SolidProps,
} from '../core/document/types'

/** Bounding box de la geometría (asume position no vacío). */
function bbox(g: THREE.BufferGeometry): THREE.Box3 {
  g.computeBoundingBox()
  return g.boundingBox as THREE.Box3
}

function positionCount(g: THREE.BufferGeometry): number {
  return g.getAttribute('position')?.count ?? 0
}

describe('geometría 3D avanzada (csg)', () => {
  it('PRISM: malla no vacía, rango Z = [center_z, center_z+height], radio esperado', () => {
    const p: PrismProps = { op: 'PRISM', center: [10, 20, 5], radius: 4, sides: 6, height: 8 }
    const g = solidGeometry(p)
    expect(positionCount(g)).toBeGreaterThan(0)
    const b = bbox(g)
    expect(b.min.z).toBeCloseTo(5, 3)
    expect(b.max.z).toBeCloseTo(13, 3)
    // Hexágono de radio 4 centrado en (10,20): extensión XY ≤ 2*radio.
    expect(b.max.x - b.min.x).toBeLessThanOrEqual(8 + 1e-3)
    expect(b.max.x - b.min.x).toBeGreaterThan(6) // apotema*2 = 4*sqrt(3) ≈ 6.93
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(10, 3)
    expect((b.min.y + b.max.y) / 2).toBeCloseTo(20, 3)
  })

  it('REVOLVE: altura en +Z (rango Z ≈ [base_z+min, base_z+max]) y radio XY ≈ max(r)', () => {
    const profile: Array<[number, number]> = [
      [0, 0],
      [3, 0],
      [3, 6],
      [0, 6],
    ]
    const p: RevolveProps = { op: 'REVOLVE', base: [0, 0, 2], profile, segments: 32 }
    const g = solidGeometry(p)
    expect(positionCount(g)).toBeGreaterThan(0)
    const b = bbox(g)
    // Rango Z: base_z + [min z, max z] = 2 + [0,6] = [2,8].
    expect(b.min.z).toBeCloseTo(2, 2)
    expect(b.max.z).toBeCloseTo(8, 2)
    // Radio XY ≈ 3 (tolerancia por facetado).
    expect(b.max.x).toBeCloseTo(3, 1)
    expect(b.min.x).toBeCloseTo(-3, 1)
    expect(b.max.y).toBeCloseTo(3, 1)
    expect(b.min.y).toBeCloseTo(-3, 1)
  })

  it('SWEEP: malla no vacía y bounding box cubre el path', () => {
    const profile: Array<[number, number]> = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]
    const path: [number, number, number][] = [
      [0, 0, 0],
      [0, 0, 10],
      [5, 0, 20],
    ]
    const p: SweepProps = { op: 'SWEEP', profile, path }
    const g = solidGeometry(p)
    expect(positionCount(g)).toBeGreaterThan(0)
    const b = bbox(g)
    // El barrido cubre desde z≈0 hasta z≈20 aproximadamente.
    expect(b.min.z).toBeLessThan(2)
    expect(b.max.z).toBeGreaterThan(18)
  })

  it('LOFT: malla no vacía con caras laterales + tapas', () => {
    // Dos cuadrados a distinta z y tamaño.
    const s0: [number, number, number][] = [
      [-2, -2, 0],
      [2, -2, 0],
      [2, 2, 0],
      [-2, 2, 0],
    ]
    const s1: [number, number, number][] = [
      [-1, -1, 10],
      [1, -1, 10],
      [1, 1, 10],
      [-1, 1, 10],
    ]
    const p: LoftProps = { op: 'LOFT', sections: [s0, s1] }
    const g = solidGeometry(p)
    expect(positionCount(g)).toBeGreaterThan(0)
    const b = bbox(g)
    expect(b.min.z).toBeCloseTo(0, 3)
    expect(b.max.z).toBeCloseTo(10, 3)
    expect(b.min.x).toBeCloseTo(-2, 3)
    expect(b.max.x).toBeCloseTo(2, 3)
  })

  it('LOFT: <2 secciones o n<3 devuelve geometría vacía', () => {
    const one: LoftProps = { op: 'LOFT', sections: [[[0, 0, 0], [1, 0, 0], [0, 1, 0]]] }
    expect(positionCount(solidGeometry(one))).toBe(0)
    const thin: LoftProps = {
      op: 'LOFT',
      sections: [
        [[0, 0, 0], [1, 0, 0]],
        [[0, 0, 5], [1, 0, 5]],
      ],
    }
    expect(positionCount(solidGeometry(thin))).toBe(0)
  })

  it('CYLINDER: eje por defecto = +Z (vertical), altura en Z', () => {
    const p: CylinderProps = { op: 'CYLINDER', base: [0, 0, 0], radius: 3, height: 10, segments: 32 }
    const b = bbox(solidGeometry(p))
    expect(b.min.z).toBeCloseTo(0, 2)
    expect(b.max.z).toBeCloseTo(10, 2)
    expect(b.max.x - b.min.x).toBeCloseTo(6, 1) // diámetro en XY
  })

  it('CONE truncado (radiusTop>0): base r=10 abajo, r=4 arriba, altura en Z', () => {
    const p = { op: 'CONE', base: [0, 0, 0], radius: 10, height: 20, segments: 48, radiusTop: 4 } as unknown as BoxProps
    const b = bbox(solidGeometry(p))
    expect(b.min.z).toBeCloseTo(0, 2)
    expect(b.max.z).toBeCloseTo(20, 2)
    // El radio máximo (base) manda en XY: diámetro ≈ 20.
    expect(b.max.x - b.min.x).toBeCloseTo(20, 1)
  })

  it('CYLINDER: con axis=[0,1,0] sale horizontal (altura en Y, no en Z)', () => {
    const p: CylinderProps = { op: 'CYLINDER', base: [0, 0, 0], radius: 3, height: 10, segments: 32, axis: [0, 1, 0] }
    const b = bbox(solidGeometry(p))
    // La altura ahora va en +Y (perpendicular a una vista FRONT), no en Z.
    expect(b.min.y).toBeCloseTo(0, 2)
    expect(b.max.y).toBeCloseTo(10, 2)
    expect(b.max.z - b.min.z).toBeCloseTo(6, 1) // diámetro en Z
    expect(b.max.x - b.min.x).toBeCloseTo(6, 1) // diámetro en X
  })

  it('CSG resiliente: SUBTRACT con un LOFT degenerado no rompe (fallback al sólido)', () => {
    // Caso real (silla): el 2º operando es un LOFT con una sección degenerada (2 puntos distintos).
    const bad = {
      op: 'SUBTRACT',
      operands: [
        { op: 'BOX', origin: [42, 42, 420], width: 336, depth: 376, height: 18 },
        {
          op: 'LOFT',
          sections: [
            [[42, 42, 436], [42, 418, 436], [378, 418, 436], [378, 42, 436]],
            [[210, 210, 438], [210, 250, 438], [210, 250, 438], [210, 210, 438]],
          ],
        },
      ],
    } as unknown as BoxProps
    expect(() => solidGeometry(bad)).not.toThrow()
    // No queda vacío: al menos conserva el primer operando (la caja del asiento).
    expect(positionCount(solidGeometry(bad))).toBeGreaterThan(0)
  })

  it('CSG resiliente: booleana sin operandos devuelve geometría vacía sin lanzar', () => {
    const empty = { op: 'UNION', operands: [] } as unknown as BoxProps
    expect(() => solidGeometry(empty)).not.toThrow()
    expect(positionCount(solidGeometry(empty))).toBe(0)
  })

  it('SHELL: vaciado produce geometría no vacía y no mayor que el sólido exterior', () => {
    const box: BoxProps = { op: 'BOX', origin: [0, 0, 0], width: 10, depth: 10, height: 10 }
    const solid: ShellProps = { op: 'SHELL', solid: box, thickness: 1 }
    const g = solidGeometry(solid)
    expect(positionCount(g)).toBeGreaterThan(0)
    const b = bbox(g)
    // El exterior sigue siendo la caja [0,10]^3 (el vaciado es interno).
    expect(b.min.x).toBeCloseTo(0, 2)
    expect(b.max.x).toBeCloseTo(10, 2)
    expect(b.min.z).toBeCloseTo(0, 2)
    expect(b.max.z).toBeCloseTo(10, 2)
    // Más triángulos que la caja sólida (aparece la pared interior).
    const solidBoxTris = positionCount(solidGeometry(box))
    expect(positionCount(g)).toBeGreaterThan(solidBoxTris)
  })
})

describe('booleanas sin astillas (revisión 2026-10-13)', () => {
  it('un cilindro pasante con medidas redondas no deja triángulos sueltos fuera del sólido', () => {
    // El soporte de rodamiento de la revisión (con 48 segmentos, como los crea CYLINDER). El punto medio de
    // las astillas del agujero Ø40 caía justo en el plano de la cara frontal de la base (y = −30).
    const cyl = (base: number[], radius: number, height: number, axis: number[]) => ({ op: 'CYLINDER', base, radius, height, segments: 48, axis })
    const props = {
      op: 'SUBTRACT',
      operands: [
        {
          op: 'UNION',
          operands: [
            { op: 'BOX', origin: [-70, -30, 0], width: 140, depth: 60, height: 16 },
            { op: 'BOX', origin: [-30, -20, 16], width: 60, depth: 40, height: 40 },
            cyl([0, 25, 56], 35, 50, [0, -1, 0]),
            { op: 'EXTRUDE', profile: [[30, 4, 16], [45, 4, 16], [30, 4, 42]], height: 8, axis: [0, -1, 0] },
            { op: 'EXTRUDE', profile: [[-30, 4, 16], [-45, 4, 16], [-30, 4, 42]], height: 8, axis: [0, -1, 0] },
          ],
        },
        cyl([0, 40, 56], 20, 80, [0, -1, 0]),
        cyl([55, 0, -5], 6.5, 30, [0, 0, 1]),
        cyl([-55, 0, -5], 6.5, 30, [0, 0, 1]),
        cyl([0, 0, 80], 3, 20, [0, 0, 1]),
      ],
    } as SolidProps
    const g = solidGeometry(props)
    const pos = g.getAttribute('position')
    const idx = g.getIndex()
    const n = (idx ? idx.count : pos.count) / 3
    let stray = 0
    for (let t = 0; t < n; t++) {
      const v = [0, 1, 2].map((k) => (idx ? idx.getX(3 * t + k) : 3 * t + k))
      // Nada de la pieza está delante de la cara frontal de la base (y = −30).
      if (v.some((i) => pos.getY(i) < -30.01)) stray++
    }
    expect(stray).toBe(0)
  })
})

describe('medidas negativas', () => {
  it('un cilindro de altura negativa resta un agujero limpio (sin geometría dada vuelta)', () => {
    const props = {
      op: 'SUBTRACT',
      operands: [
        { op: 'BOX', origin: [0, 0, 0], width: 80, depth: 50, height: 12 },
        { op: 'CYLINDER', base: [67, 12, 12], radius: 4, height: -14, segments: 48, axis: [0, 0, 1] },
      ],
    } as SolidProps
    const g = solidGeometry(props)
    const pos = g.getAttribute('position')
    const idx = g.getIndex()
    const n = (idx ? idx.count : pos.count) / 3
    let film = 0
    for (let t = 0; t < n; t++) {
      const v = [0, 1, 2].map((k) => (idx ? idx.getX(3 * t + k) : 3 * t + k))
      const [cx, cy] = [0, 1].map((a) => v.reduce((s, i) => s + (a ? pos.getY(i) : pos.getX(i)), 0) / 3)
      if (v.every((i) => Math.abs(pos.getZ(i) - 12) < 1e-4) && Math.hypot(cx - 67, cy - 12) < 3.9) film++
    }
    expect(film).toBe(0)
  })

  it('una caja con lados negativos ocupa el mismo lugar que la normalizada', () => {
    const a = solidGeometry({ op: 'BOX', origin: [10, 10, 10], width: -4, depth: 3, height: -2 } as SolidProps)
    a.computeBoundingBox()
    const b = a.boundingBox!
    expect([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((v) => +v.toFixed(6))).toEqual([6, 10, 8, 10, 13, 10])
  })
})

describe('segmentos acotados', () => {
  it('un CYLINDER con segments absurdos (archivo o IA) no cuelga la pestaña', () => {
    const cyl = (segments: number) =>
      positionCount(solidGeometry({ op: 'CYLINDER', base: [0, 0, 0], radius: 5, height: 10, segments } satisfies CylinderProps))
    expect(cyl(1e6)).toBe(cyl(MAX_SEGMENTS))
    expect(cyl(Number.POSITIVE_INFINITY)).toBe(cyl(32))
    expect(cyl(1)).toBe(cyl(3))
  })
})
