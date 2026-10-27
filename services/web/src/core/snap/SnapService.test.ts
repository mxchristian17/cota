import { describe, it, expect } from 'vitest'
import { computeSnap, type SnapSettings, type SnapType } from './SnapService'
import type { OsnapConfig } from './osnap'
import { WORLD_UCS } from '../ucs'
import { pt, type Pt } from '../math'
import type { Entity, LineEntity } from '../document/types'
import { solidSnapWireframe } from '../editing/solid'
import '../../render/csg'

const ALL_ON: OsnapConfig = {
  endpoint: true,
  midpoint: true,
  center: true,
  geometricCenter: false,
  quadrant: true,
  intersection: true,
  apparentIntersection: false,
  perpendicular: true,
  tangent: true,
  nearest: true,
  node: true,
}
const ALL_OFF: OsnapConfig = {
  endpoint: false,
  midpoint: false,
  center: false,
  geometricCenter: false,
  quadrant: false,
  intersection: false,
  apparentIntersection: false,
  perpendicular: false,
  tangent: false,
  nearest: false,
  node: false,
}

const line: LineEntity = {
  id: 'e1',
  type: 'LINE',
  layer: '0',
  props: { start: [0, 0, 0], end: [100, 0, 0] },
}

// Proyección identidad: 1 unidad de mundo = 1 píxel (facilita razonar el umbral en tests).
const base = (cursor: Pt, over: Partial<SnapSettings> = {}): SnapSettings => ({
  gridSnap: false,
  gridStep: 10,
  esnap: true,
  ucs: WORLD_UCS,
  osnap: { ...ALL_ON },
  base: null,
  cursorPx: [cursor.x, cursor.y],
  pixelThreshold: 5,
  project: (p) => [p.x, p.y],
  ...over,
})

describe('computeSnap (screen-space)', () => {
  it('captura el endpoint cercano', () => {
    const c = pt(2, 1)
    const r = computeSnap(c, [line], base(c))
    expect(r.type).toBe('endpoint')
    expect(r.point).toEqual(pt(0, 0, 0))
  })

  it('captura el midpoint', () => {
    const c = pt(50, 2)
    const r = computeSnap(c, [line], base(c))
    expect(r.type).toBe('midpoint')
    expect(r.point.x).toBeCloseTo(50, 6)
  })

  it('nearest sobre el segmento cuando no hay vértices cerca', () => {
    const c = pt(30, 2)
    // Sin punto anterior, PER activo daría una perpendicular diferida (como el CAD clásico).
    const r = computeSnap(c, [line], base(c, { osnap: { ...ALL_ON, perpendicular: false } }))
    expect(r.type).toBe('nearest')
    expect(r.point.y).toBeCloseTo(0, 6)
  })

  it('sin captura si está lejos y no hay grid', () => {
    const c = pt(30, 50)
    const r = computeSnap(c, [line], base(c))
    expect(r.type).toBeNull()
  })

  it('grid snap redondea al paso cuando no hay esnap', () => {
    const c = pt(23, 27)
    const r = computeSnap(c, [], base(c, { esnap: false, gridSnap: true }))
    expect(r.type).toBe('grid')
    expect(r.point.x).toBeCloseTo(20, 6)
    expect(r.point.y).toBeCloseTo(30, 6)
  })

  it('esnap tiene prioridad sobre grid', () => {
    const c = pt(1, 1)
    const r = computeSnap(c, [line], base(c, { gridSnap: true }))
    expect(r.type).toBe('endpoint')
  })

  it('captura una arista aunque esté en otra profundidad Z (esnap 3D)', () => {
    const elevated: LineEntity = { id: 'e2', type: 'LINE', layer: '0', props: { start: [10, 10, 50], end: [40, 10, 50] } }
    const c = pt(10, 11)
    const r = computeSnap(c, [elevated], base(c))
    expect(r.type).toBe('endpoint')
    expect(r.point).toEqual(pt(10, 10, 50))
  })
})

// --- : set completo y configurable ---

function only(cursor: Pt, on: Partial<OsnapConfig>, b: Pt | null = null): SnapSettings {
  return base(cursor, { osnap: { ...ALL_OFF, ...on }, base: b })
}
const circle = (cx: number, cy: number, r: number): Entity => ({
  id: 'c1',
  type: 'CIRCLE',
  layer: '0',
  props: { center: [cx, cy, 0], radius: r, normal: [0, 0, 1] },
})
const seg = (ax: number, ay: number, bx: number, by: number, id = 'l'): Entity => ({
  id,
  type: 'LINE',
  layer: '0',
  props: { start: [ax, ay, 0], end: [bx, by, 0] },
})
const near = (p: Pt, x: number, y: number, tol = 1e-6) => expect(Math.hypot(p.x - x, p.y - y)).toBeLessThan(tol)

describe('computeSnap — object snaps configurables', () => {
  it('captura el CENTER al pasar por el borde del círculo', () => {
    const r = computeSnap(pt(10, 0, 0), [circle(0, 0, 10)], only(pt(10, 0, 0), { center: true }))
    expect(r.type).toBe<SnapType>('center')
    near(r.point, 0, 0)
  })

  it('sobre el cuadrante gana quadrant (punto bajo el cursor); en el resto del borde, center', () => {
    const r = computeSnap(pt(10, 0, 0), [circle(0, 0, 10)], only(pt(10, 0, 0), { center: true, quadrant: true }))
    expect(r.type).toBe('quadrant')
    const c = pt(7.071, 7.071, 0)
    expect(computeSnap(c, [circle(0, 0, 10)], only(c, { center: true, quadrant: true })).type).toBe('center')
  })

  it('QUADRANT con center desactivado', () => {
    const r = computeSnap(pt(0, 10, 0), [circle(0, 0, 10)], only(pt(0, 10, 0), { quadrant: true }))
    expect(r.type).toBe('quadrant')
    near(r.point, 0, 10)
  })

  it('INTERSECTION de dos líneas que se cruzan', () => {
    const r = computeSnap(pt(1, 1, 0), [seg(-10, 0, 10, 0, 'h'), seg(0, -10, 0, 10, 'v')], only(pt(1, 1, 0), { intersection: true }))
    expect(r.type).toBe('intersection')
    near(r.point, 0, 0)
  })

  it('PERPENDICULAR usa el punto base', () => {
    const r = computeSnap(pt(5, 0, 0), [seg(0, 0, 20, 0)], only(pt(5, 0, 0), { perpendicular: true }, pt(5, 5, 0)))
    expect(r.type).toBe('perpendicular')
    near(r.point, 5, 0)
  })

  it('TANGENT desde un punto base externo', () => {
    const r = computeSnap(pt(8.66, 5, 0), [circle(0, 0, 10)], only(pt(8.66, 5, 0), { tangent: true }, pt(0, 20, 0)))
    expect(r.type).toBe('tangent')
    near(r.point, 8.66, 5, 0.05)
  })

  it('NODE captura puntos de control de splines', () => {
    const spline: Entity = { id: 's1', type: 'SPLINE', layer: '0', props: { controlPoints: [[0, 0, 0], [30, 10, 0]], degree: 3 } }
    const r = computeSnap(pt(30, 10, 0), [spline], only(pt(30, 10, 0), { node: true }))
    expect(r.type).toBe('node')
    near(r.point, 30, 10)
  })

  it('sin osnaps activos no captura nada', () => {
    const r = computeSnap(pt(0, 0, 0), [circle(0, 0, 10)], only(pt(0, 0, 0), {}))
    expect(r.type).toBeNull()
  })

  it('un cilindro aporta center/quadrant y NO endpoints de facetado', () => {
    const cyl3d: Entity = {
      id: 'cy',
      type: 'SOLID3D',
      layer: '0',
      props: { op: 'CYLINDER', base: [50, 50, 0], radius: 20, height: 40, segments: 48 },
    }
    const c = computeSnap(pt(50, 50, 0), [cyl3d], only(pt(50, 50, 0), { center: true }))
    expect(c.type).toBe('center')
    near(c.point, 50, 50)
    const q = computeSnap(pt(70, 50, 0), [cyl3d], only(pt(70, 50, 0), { quadrant: true }))
    expect(q.type).toBe('quadrant')
    near(q.point, 70, 50)
    // El borde curvo no debe ofrecer endpoints (facetado).
    const none = computeSnap(pt(70, 50, 0), [cyl3d], only(pt(70, 50, 0), { endpoint: true }))
    expect(none.type).toBeNull()
  })
})

describe('apparent intersection', () => {
  // Dos líneas que se cruzan en pantalla (proyección identidad XY) pero viven en z distinta.
  const a: Entity = { id: 'a', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [100, 0, 0] } }
  const b: Entity = { id: 'b', type: 'LINE', layer: '0', props: { start: [50, -50, 40], end: [50, 50, 40] } }

  const only = (kind: keyof OsnapConfig): OsnapConfig => ({ ...ALL_OFF, [kind]: true })

  it('captura el cruce visual y devuelve el punto del objeto más cercano a la cámara', () => {
    const c = pt(50, 1)
    const r = computeSnap(c, [a, b], base(c, { osnap: only('apparentIntersection'), depth: (p) => 100 - p.z }))
    expect(r.type).toBe('apparentIntersection')
    expect(r.point.x).toBeCloseTo(50)
    expect(r.point.z).toBe(40) // el de z=40 está más cerca de la cámara según `depth`
  })

  it('con el snap desactivado no captura nada', () => {
    const c = pt(50, 1)
    const r = computeSnap(c, [a, b], base(c, { osnap: { ...ALL_OFF } }))
    expect(r.type).toBeNull()
  })

  it('no compite con una intersección real (misma z)', () => {
    const b2: Entity = { id: 'b2', type: 'LINE', layer: '0', props: { start: [50, -50, 0], end: [50, 50, 0] } }
    const c = pt(50, 1)
    const r = computeSnap(c, [a, b2], base(c, { osnap: only('apparentIntersection') }))
    expect(r.type).toBeNull() // se tocan de verdad → lo resuelve `intersection`, no el aparente
  })
})

// --- : CEN sólo en curvas, GCEN, niveles de resolución, PER/TAN por objeto, INT exacto ---

describe('object snaps confiables', () => {
  const rect: Entity = { id: 'r', type: 'RECTANGLE', layer: '0', props: { corner: [0, 0, 0], width: 40, height: 20 } }
  const closedPl: Entity = {
    id: 'p',
    type: 'POLYLINE',
    layer: '0',
    props: { vertices: [[0, 0, 0], [40, 0, 0], [40, 20, 0], [0, 20, 0]], closed: true },
  }

  it('rectángulos y polilíneas cerradas ya no ofrecen CEN', () => {
    for (const e of [rect, closedPl]) {
      const c = pt(13, 0.5, 0) // sobre el borde inferior, lejos de vértices y del punto medio
      expect(computeSnap(c, [e], only(c, { center: true })).type).toBeNull()
    }
  })

  it('GCEN apagado no captura; encendido da el centroide desde el borde o sobre él', () => {
    const c = pt(13, 0.5, 0)
    expect(computeSnap(c, [rect], only(c, { center: true })).type).toBeNull()
    const r = computeSnap(c, [rect], only(c, { geometricCenter: true }))
    expect(r.type).toBe<SnapType>('geometricCenter')
    near(r.point, 20, 10)
    const over = computeSnap(pt(20, 11, 0), [closedPl], only(pt(20, 11, 0), { geometricCenter: true }))
    expect(over.type).toBe('geometricCenter')
    near(over.point, 20, 10)
  })

  it('GCEN de una polilínea con bulges es el centroide de área (dos semicírculos = círculo)', () => {
    const disc: Entity = {
      id: 'd',
      type: 'POLYLINE',
      layer: '0',
      props: { vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]], bulges: [0, 1, 0, 1], closed: true },
    }
    // Estadio: rectángulo 10×10 con dos semicírculos de radio 5 a los lados → centroide (5, 5).
    const c = pt(5, 0.5, 0)
    const r = computeSnap(c, [disc], only(c, { geometricCenter: true }))
    expect(r.type).toBe('geometricCenter')
    near(r.point, 5, 5)
  })

  it('CEN en elipses y en tramos curvos de polilínea', () => {
    const el: Entity = { id: 'e', type: 'ELLIPSE', layer: '0', props: { center: [0, 0, 0], major: [20, 0, 0], ratio: 0.5, normal: [0, 0, 1] } }
    const r = computeSnap(pt(0, 10.5, 0), [el], only(pt(0, 10.5, 0), { center: true }))
    expect(r.type).toBe('center')
    near(r.point, 0, 0)
    const pl: Entity = {
      id: 'q',
      type: 'POLYLINE',
      layer: '0',
      props: { vertices: [[0, 0, 0], [20, 0, 0]], bulges: [1], closed: false },
    }
    // Semicírculo de centro (10, 0) y radio 10 (bulge 1 = antihorario: pasa por (10, −10)).
    const q = computeSnap(pt(10, -9.5, 0), [pl], only(pt(10, -9.5, 0), { center: true }))
    expect(q.type).toBe('center')
    near(q.point, 10, 0)
  })

  it('PER gana al CEN pasando por el borde de un círculo (running, sin tipear)', () => {
    const c = pt(0, 10.4, 0) // sobre el borde superior
    const r = computeSnap(c, [circle(0, 0, 10)], only(c, { center: true, perpendicular: true }, pt(30, 30, 0)))
    expect(r.type).toBe('perpendicular')
    near(r.point, 10 / Math.SQRT2, 10 / Math.SQRT2)
  })

  it('TAN gana al CEN pasando por el borde, aunque el cursor esté lejos del punto de tangencia', () => {
    const c = pt(10, -0.3, 0)
    const r = computeSnap(c, [circle(0, 0, 10)], only(c, { center: true, tangent: true }, pt(0, 20, 0)))
    expect(r.type).toBe('tangent')
    expect(Math.hypot(r.point.x, r.point.y)).toBeCloseTo(10, 9)
    expect(r.point.x).toBeGreaterThan(0) // el de la derecha (más cercano al cursor)
  })

  it('PER sobre el borde de un rectángulo con CEN activo (el bug reportado)', () => {
    const c = pt(30, 0.4, 0)
    const r = computeSnap(c, [rect], only(c, { center: true, perpendicular: true, endpoint: true }, pt(25, -30, 0)))
    expect(r.type).toBe('perpendicular')
    near(r.point, 25, 0)
  })

  it('PER sobre una línea se dispara pasando por ella y cae en el pie (aunque esté lejos del cursor)', () => {
    const c = pt(70, 0.5, 0)
    const r = computeSnap(c, [seg(0, 0, 100, 0)], only(c, { perpendicular: true, nearest: true }, pt(20, 40, 0)))
    expect(r.type).toBe('perpendicular')
    near(r.point, 20, 0)
  })

  it('PER y TAN sobre una elipse', () => {
    const el: Entity = { id: 'e', type: 'ELLIPSE', layer: '0', props: { center: [0, 0, 0], major: [20, 0, 0], ratio: 0.5, normal: [0, 0, 1] } }
    const per = computeSnap(pt(0.5, 10, 0), [el], only(pt(0.5, 10, 0), { perpendicular: true }, pt(0, 30, 0)))
    expect(per.type).toBe('perpendicular')
    near(per.point, 0, 10, 1e-6)
    const tan = computeSnap(pt(19.9, 1, 0), [el], only(pt(19.9, 1, 0), { tangent: true }, pt(20, 30, 0)))
    expect(tan.type).toBe('tangent')
    near(tan.point, 20, 0, 1e-6) // la recta x = 20 es tangente en el vértice mayor
  })

  it('nivel 1 gana al nivel 2: endpoint bajo el cursor antes que PER', () => {
    const c = pt(99, 0.5, 0)
    const r = computeSnap(c, [seg(0, 0, 100, 0)], only(c, { perpendicular: true, endpoint: true }, pt(20, 40, 0)))
    expect(r.type).toBe('endpoint')
  })

  it('INT exacto línea–círculo y círculo–círculo (sin error de cuerda)', () => {
    const ix = 10 * Math.cos(Math.PI / 7)
    const iy = 10 * Math.sin(Math.PI / 7)
    const c = pt(ix + 0.3, iy, 0)
    const r = computeSnap(c, [circle(0, 0, 10), seg(0, iy, 30, iy)], only(c, { intersection: true }))
    expect(r.type).toBe('intersection')
    near(r.point, ix, iy, 1e-9)
    const c2: Entity = { id: 'c2', type: 'CIRCLE', layer: '0', props: { center: [12, 0, 0], radius: 10, normal: [0, 0, 1] } }
    const h = Math.sqrt(100 - 36)
    const r2 = computeSnap(pt(6.2, h, 0), [circle(0, 0, 10), c2], only(pt(6.2, h, 0), { intersection: true }))
    expect(r2.type).toBe('intersection')
    near(r2.point, 6, h, 1e-9)
  })

  it('INT entre líneas a distinta altura no es intersección real', () => {
    const a: Entity = { id: 'a', type: 'LINE', layer: '0', props: { start: [-10, 0, 0], end: [10, 0, 0] } }
    const b: Entity = { id: 'b', type: 'LINE', layer: '0', props: { start: [0, -10, 5], end: [0, 10, 5] } }
    expect(computeSnap(pt(0.5, 0.5, 0), [a, b], only(pt(0.5, 0.5, 0), { intersection: true })).type).toBeNull()
  })

  it('nearest exacto sobre un círculo (proyección radial)', () => {
    const c = pt(7, 7.3, 0)
    const r = computeSnap(c, [circle(0, 0, 10)], only(c, { nearest: true }))
    expect(r.type).toBe('nearest')
    expect(Math.hypot(r.point.x, r.point.y)).toBeCloseTo(10, 9)
  })
})

describe('PER/TAN diferidos', () => {
  it('sin punto anterior PER sobre una línea es una perpendicular diferida', () => {
    const c = pt(30, 2)
    const r = computeSnap(c, [line], base(c))
    expect(r.type).toBe('perpendicular')
    expect(r.deferred?.obj.kind).toBe('line')
  })
  it('con punto anterior no hay diferidos', () => {
    const c = pt(30, 2)
    expect(computeSnap(c, [line], base(c, { base: pt(30, 20) })).deferred).toBeUndefined()
  })
})


describe('sin intersecciones en el facetado de un sólido', () => {
  it('los vértices del facetado de un empalme no dan INT; las esquinas reales sí', () => {
    const round: Entity = { id: 'r', type: 'SOLID3D', layer: '0', props: { op: 'FILLETEDGE', solid: { op: 'BOX', origin: [0, 0, 0], width: 10, depth: 10, height: 10 }, edges: [{ at: [5, 0, 10] }], radius: 2 } as never }
    // Vista lateral (y, z): el arco del empalme en x = 0 queda en pantalla tal cual.
    const side = { project: (p: Pt) => [p.y, p.z] as [number, number], osnap: { ...ALL_OFF, intersection: true }, pixelThreshold: 0.3 }
    const pts = solidSnapWireframe(round.props as never).flat().filter((v) => v[0] === 0 && v[1] > 0.4 && v[1] < 1.6 && v[2] > 8.05)
    expect(pts.length).toBeGreaterThan(0)
    for (const v of pts) {
      const r = computeSnap({ x: 0, y: v[1], z: v[2] }, [round], { ...base({ x: v[1], y: v[2], z: 0 }), ...side })
      expect(r.type).not.toBe('intersection')
    }
    const corner = computeSnap({ x: 0, y: 10, z: 10 }, [round], { ...base({ x: 10, y: 10, z: 0 }), ...side })
    expect(corner.type).toBe('intersection')
  })
})
