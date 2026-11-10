import { describe, expect, it } from 'vitest'
import { computeSnap, type SnapResult } from './SnapService'
import { DEFAULT_OSNAP, singleOsnap, type OsnapConfig } from './osnap'
import { WORLD_UCS } from '../ucs'
import { pt, type Pt, type Vec3 } from '../math'
import type { Entity, PolylineProps, SolidProps } from '../document/types'
import { profileArcs, profileOf } from '../editing/extrude'
import { solidVertices } from '../editing/solid'
import '../../render/csg'

/** Cámaras ortográficas: ejes derecha/arriba de la pantalla (1 unidad = 10 px). */
const s2 = Math.SQRT1_2
const VIEWS: Record<string, [Vec3, Vec3]> = {
  top: [[1, 0, 0], [0, 1, 0]],
  front: [[1, 0, 0], [0, 0, 1]],
  right: [[0, 1, 0], [0, 0, 1]],
  iso: [[s2, s2, 0], [-0.40824829, 0.40824829, 0.81649658]],
  // Una órbita cualquiera (ni ortogonal ni isométrica).
  orbit: [[0.8, 0.6, 0], [-0.33, 0.44, 0.83516465]],
}
const dot = (p: Pt, v: Vec3) => p.x * v[0] + p.y * v[1] + p.z * v[2]

function snap(ents: Entity[], at: Vec3, view: string, osnap: OsnapConfig = DEFAULT_OSNAP, base: Pt | null = null): SnapResult {
  const [r, u] = VIEWS[view]
  const project = (p: Pt): [number, number] => [dot(p, r) * 10, -dot(p, u) * 10]
  const c = pt(...at)
  const fwd: Vec3 = [r[1] * u[2] - r[2] * u[1], r[2] * u[0] - r[0] * u[2], r[0] * u[1] - r[1] * u[0]]
  return computeSnap(c, ents, {
    gridSnap: false,
    gridStep: 10,
    esnap: true,
    ucs: WORLD_UCS,
    osnap,
    base,
    cursorPx: project(c),
    pixelThreshold: 10,
    project,
    depth: (p) => -dot(p, fwd),
  })
}

const solid = (props: SolidProps, id = 's'): Entity => ({ id, type: 'SOLID3D', layer: '0', props } as Entity)
const near = (r: SnapResult, type: string, p: Vec3, digits = 6) => {
  expect(r.type).toBe(type)
  expect(r.point.x).toBeCloseTo(p[0], digits)
  expect(r.point.y).toBeCloseTo(p[1], digits)
  expect(r.point.z).toBeCloseTo(p[2], digits)
}

const box = solid({ op: 'BOX', origin: [0, 0, 0], width: 10, depth: 6, height: 4 })

describe('MID en aristas de sólidos, desde cualquier cámara', () => {
  for (const view of ['top', 'front', 'iso', 'orbit']) {
    it(`caja (${view}): el medio de la arista superior y de una vertical`, () => {
      near(snap([box], [5.05, 0, 4], view), 'midpoint', [5, 0, 4])
      if (view !== 'top') near(snap([box], [10, 0, 2.05], view), 'midpoint', [10, 0, 2])
    })
  }

  it('unión de dos cajas: las aristas del resultado, no las de cada primitiva', () => {
    const u = solid({ op: 'UNION', operands: [{ op: 'BOX', origin: [0, 0, 0], width: 10, depth: 10, height: 10 }, { op: 'BOX', origin: [10, 0, 0], width: 10, depth: 10, height: 10 }] })
    // La arista superior frontal va de 0 a 20 (la de x = 10 desapareció): su medio es x = 10.
    near(snap([u], [10.05, 0, 10], 'orbit'), 'midpoint', [10, 0, 10])
  })

  it('sólido extruido en la vista FRONT (otro UCS)', () => {
    const e = solid({ op: 'EXTRUDE', profile: [[0, 0, 0], [8, 0, 0], [8, 0, 4], [0, 0, 4]], height: 5, axis: [0, -1, 0] })
    near(snap([e], [4.05, -5, 0], 'iso'), 'midpoint', [4, -5, 0])
  })
})

/** Polilínea cerrada con un arco de 180° (un "estadio" abierto de un lado). */
const slot: PolylineProps = { vertices: [[0, 0, 0], [10, 0, 0], [10, 6, 0], [0, 6, 0]], bulges: [0, 1, 0, 0], closed: true }
const slotEnt: Entity = { id: 'p', type: 'POLYLINE', layer: '0', props: slot }

describe('polilínea con arcos: centro y cuadrantes en 2D y tras EXTRUDE', () => {
  it('2D: CEN pasando por el arco, QUA y MID del arco', () => {
    near(snap([slotEnt], [13, 3, 0], 'top', singleOsnap('center')), 'center', [10, 3, 0])
    near(snap([slotEnt], [13.05, 3, 0], 'top', singleOsnap('quadrant')), 'quadrant', [13, 3, 0])
    near(snap([slotEnt], [13.05, 3.1, 0], 'top', singleOsnap('midpoint')), 'midpoint', [13, 3, 0])
  })

  it('la polilínea que termina donde empieza (cerrada "a ojo" con un arco) es un perfil', () => {
    const open: Entity = { id: 'q', type: 'POLYLINE', layer: '0', props: { vertices: [[0, 0, 0], [10, 0, 0], [0, 0, 0]], bulges: [1, 1], closed: false } }
    expect(profileOf(open)?.length).toBeGreaterThan(8)
    expect(profileArcs(open).length).toBe(2)
  })

  const ext = solid({ op: 'EXTRUDE', profile: profileOf(slotEnt)!, height: 5, axis: [0, 0, 1], arcs: profileArcs(slotEnt) })
  for (const view of ['top', 'iso', 'orbit']) {
    it(`extruido (${view}): CEN desde la arista curva, arriba y abajo`, () => {
      near(snap([ext], [13, 3, 5], view, singleOsnap('center')), 'center', [10, 3, 5])
      if (view !== 'top') near(snap([ext], [13, 3, 0], view, singleOsnap('center')), 'center', [10, 3, 0])
    })
  }
  it('extruido: QUA y MID reales del arco; END sólo en las esquinas', () => {
    near(snap([ext], [13.05, 3, 5], 'iso', singleOsnap('quadrant')), 'quadrant', [13, 3, 5])
    near(snap([ext], [13.05, 3.1, 5], 'iso', singleOsnap('midpoint')), 'midpoint', [13, 3, 5])
    // 4 esquinas abajo y 4 arriba: los puntos del teselado del arco no son extremos.
    expect(solidVertices(ext.props as SolidProps).length).toBe(8)
  })
})

describe('CEN/QUA en aristas circulares', () => {
  const cyl = solid({ op: 'CYLINDER', base: [0, 0, 0], radius: 5, height: 8, segments: 32 })
  it('cilindro: CEN pasando por el borde superior (sin acercarse al centro)', () => {
    near(snap([cyl], [5, 0, 8], 'iso', singleOsnap('center')), 'center', [0, 0, 8])
    near(snap([cyl], [0, -5, 0], 'orbit', singleOsnap('center')), 'center', [0, 0, 0])
  })

  it('esfera menos caja: el círculo del corte da su centro', () => {
    const cut = solid({ op: 'SUBTRACT', operands: [{ op: 'SPHERE', center: [0, 0, 0], radius: 10, segments: 48 }, { op: 'BOX', origin: [-20, -20, 6], width: 40, depth: 40, height: 20 }] })
    // El plano z = 6 corta la esfera en un círculo de radio 8.
    const r = snap([cut], [8, 0, 6], 'iso', singleOsnap('center'))
    near(r, 'center', [0, 0, 6], 2)
  })

  it('empalme de una caja: CEN y MID del arco del empalme sin tipear CEN', () => {
    const f = solid({ op: 'FILLETEDGE', solid: { op: 'BOX', origin: [0, 0, 0], width: 10, depth: 10, height: 10 }, edges: [{ at: [5, 0, 10] }], radius: 2 } as SolidProps)
    // La arista redondeada (y = 0, z = 10) deja un arco de centro (x, 2, 8) en cada cara lateral.
    const c = snap([f], [0, 2 - 2 * s2, 8 + 2 * s2], 'iso', { ...DEFAULT_OSNAP, endpoint: false, midpoint: false })
    near(c, 'center', [0, 2, 8], 3)
  })
})

describe('EXT, PAR, INS y splines', () => {
  const ln: Entity = { id: 'l', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [10, 0, 0] } }
  it('EXT: la prolongación de una recta adquirida, y su cruce con otro objeto', () => {
    const acquired = [{ kind: 'extension' as const, from: pt(0, 0, 0), to: pt(10, 0, 0) }]
    const r = computeSnap(pt(18, 0.2, 0), [ln], { ...settings(pt(18, 0.2, 0)), osnap: singleOsnap('extension'), acquired })
    near(r, 'extension', [18, 0, 0])
    expect(r.lines?.[0][0]).toEqual(pt(10, 0, 0))
    // Antes del extremo (sobre la recta misma) no hay prolongación.
    expect(computeSnap(pt(5, 0.2, 0), [ln], { ...settings(pt(5, 0.2, 0)), osnap: singleOsnap('extension'), acquired }).type).toBeNull()
    const wall: Entity = { id: 'w', type: 'LINE', layer: '0', props: { start: [25, -5, 0], end: [25, 9, 0] } }
    near(computeSnap(pt(25.3, 0.3, 0), [ln, wall], { ...settings(pt(25.3, 0.3, 0)), osnap: { ...DEFAULT_OSNAP }, acquired }), 'intersection', [25, 0, 0])
  })

  it('EXT de un arco: sigue por su circunferencia', () => {
    const arc = { center: [0, 0, 0] as Vec3, radius: 10, startAngle: 0, endAngle: Math.PI / 2, normal: [0, 0, 1] as Vec3 }
    const acquired = [{ kind: 'arcExtension' as const, arc, at: pt(0, 10, 0) }]
    const c = pt(-10 * s2, 10 * s2, 0)
    near(computeSnap(c, [], { ...settings(c), osnap: singleOsnap('extension'), acquired }), 'extension', [-10 * s2, 10 * s2, 0])
  })

  it('PAR: desde el punto base, paralela a la recta adquirida', () => {
    const acquired = [{ kind: 'parallel' as const, a: pt(0, 0, 0), b: pt(10, 10, 0) }]
    const c = pt(25.2, 24.9, 0)
    near(computeSnap(c, [], { ...settings(c), osnap: singleOsnap('parallel'), base: pt(20, 20, 0), acquired }), 'parallel', [25.05, 25.05, 0])
  })

  it('INS: punto de inserción de un bloque y de un texto; NON no captura nada', () => {
    const ins: Entity = { id: 'i', type: 'INSERT', layer: '0', props: { name: 'B', position: [5, 5, 0], scale: [1, 1, 1], rotation: 0 } }
    near(computeSnap(pt(5.2, 5, 0), [ins], { ...settings(pt(5.2, 5, 0)), osnap: singleOsnap('insertion') }), 'insertion', [5, 5, 0])
    expect(computeSnap(pt(0.1, 0, 0), [ln], { ...settings(pt(0.1, 0, 0)), osnap: singleOsnap('none') }).type).toBeNull()
  })

  it('spline: NEA sobre la curva (no sobre la poligonal de sus puntos) y END sólo en los extremos', () => {
    const sp: Entity = { id: 'sp', type: 'SPLINE', layer: '0', props: { controlPoints: [[0, 0, 0], [10, 10, 0], [20, 0, 0]], degree: 3 } }
    const r = computeSnap(pt(10, 10.5, 0), [sp], { ...settings(pt(10, 10.5, 0)), osnap: singleOsnap('endpoint') })
    expect(r.type).toBeNull()
    // Cerca del medio de la cuerda 0,0→10,10 la curva pasa por encima: el NEA no cae sobre la cuerda.
    const n = computeSnap(pt(5, 5.6, 0), [sp], { ...settings(pt(5, 5.6, 0)), osnap: singleOsnap('nearest') })
    expect(n.type).toBe('nearest')
    expect(n.point.y - n.point.x).toBeGreaterThan(0.1)
  })
})

/** Planta, 1 unidad = 10 px. */
function settings(c: Pt) {
  return { gridSnap: false, gridStep: 10, esnap: true, ucs: WORLD_UCS, osnap: DEFAULT_OSNAP, base: null, cursorPx: [c.x * 10, -c.y * 10] as [number, number], pixelThreshold: 10, project: (p: Pt): [number, number] => [p.x * 10, -p.y * 10] }
}

describe('snaps de caras (3DOSNAP)', () => {
  // Mirando desde arriba (rayo hacia −Z) sobre la cara superior de la caja (z = 4).
  const ray = (x: number, y: number) => ({ o: [x, y, 100] as Vec3, d: [0, 0, -1] as Vec3 })
  const top = (x: number, y: number, osnap: OsnapConfig, base: Pt | null = null) =>
    computeSnap(pt(x, y, 4), [box], { ...settings(pt(x, y, 4)), osnap, base, ray: ray(x, y) })
  it('centro de la cara bajo el cursor, perpendicular a ella desde el punto base y punto sobre ella', () => {
    near(top(2, 2, singleOsnap('faceCenter')), 'faceCenter', [5, 3, 4])
    near(top(2, 2, singleOsnap('facePerpendicular'), pt(7, 1, 20)), 'facePerpendicular', [7, 1, 4])
    near(top(2, 2, singleOsnap('faceNearest')), 'faceNearest', [2, 2, 4])
  })
})
