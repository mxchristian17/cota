import { describe, it, expect } from 'vitest'
import type { ArcEntity, ArcProps, Entity, Layer, PolylineEntity } from '../document/types'
import { entityBounds, entityOutline } from './bounds'
import { applyGrip, entityGrips } from './grips'
import { applyField, entityFields } from './props'
import { scaleEntity, translateEntity } from './edit'
import { mirrorAxis, mirrorEntityInput } from './transform'
import { rotateEntityInput } from './array'
import { stretchBox, stretchEntity } from './stretch'
import { entityPreviewShapes } from './entityPreview'
import { arcContainsAngle, arcEndpoints, arcIsClockwise, arcMidpoint, normAngle, sweepOf } from '../geom/arc'
import { angleBulge } from '../geom/polyline'
import { exportDxf, importDxf } from '../io/dxf'

/** Arco de 90° en el primer cuadrante, radio 10, centrado en el origen. */
const quarter = (): ArcEntity => ({
  id: 'a1',
  type: 'ARC',
  layer: 'l0',
  props: { center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI / 2, normal: [0, 0, 1] },
})

const layers: Layer[] = [
  { id: 'l0', name: '0', color: '#ffffff', lineWeight: 0.25, lineType: 'CONTINUOUS', locked: false, visible: true, printable: true },
]

describe('ARC en el pipeline de edición', () => {
  it('la caja envolvente y el contorno son los del arco', () => {
    const b = entityBounds(quarter())
    expect(b.minX).toBeCloseTo(0, 9)
    expect(b.maxX).toBeCloseTo(10, 9)
    expect(b.minY).toBeCloseTo(0, 9)
    expect(b.maxY).toBeCloseTo(10, 9)
    const outline = entityOutline(quarter())
    expect(outline).toHaveLength(1)
    expect(outline[0].length).toBeGreaterThan(2)
    expect(outline[0][0].x).toBeCloseTo(10, 9)
  })

  it('tiene preview (fantasma) desplazable', () => {
    const shapes = entityPreviewShapes(quarter(), 5, 0)
    expect(shapes).toHaveLength(1)
    expect(shapes[0].kind).toBe('polyline')
    if (shapes[0].kind === 'polyline') expect(shapes[0].points[0].x).toBeCloseTo(15, 9)
  })

  it('expone grips de centro, extremos y punto medio', () => {
    const grips = entityGrips(quarter())
    expect(grips.map((g) => g.role.t)).toEqual(['move', 'arc-end', 'arc-end', 'arc-radius'])
  })

  it('el grip del punto medio cambia el radio y el del extremo, el ángulo', () => {
    const radial = quarter()
    const mid = entityGrips(radial)[3]
    applyGrip(radial, mid, [Math.SQRT1_2 * 20, Math.SQRT1_2 * 20, 0])
    expect(radial.props.radius).toBeCloseTo(20, 6)
    expect(sweepOf(radial.props)).toBeCloseTo(Math.PI / 2, 9) // el barrido no cambia

    const ended = quarter()
    applyGrip(ended, entityGrips(ended)[2], [-10, 0, 0]) // extremo final a 180°
    expect(ended.props.endAngle).toBeCloseTo(Math.PI, 9)
    expect(sweepOf(ended.props)).toBeCloseTo(Math.PI, 9)
  })

  it('el grip de mover traslada el arco entero', () => {
    const e = quarter()
    applyGrip(e, entityGrips(e)[0], [5, 5, 0])
    expect(e.props.center).toEqual([5, 5, 0])
    expect(e.props.radius).toBe(10)
  })

  it('las propiedades muestran radio, ángulos y longitud, y son editables', () => {
    const e = quarter()
    const keys = entityFields(e).map((f) => f.key)
    expect(keys).toEqual(expect.arrayContaining(['radius', 'startDeg', 'endDeg', 'includedDeg', '_len', '_dir']))
    const len = entityFields(e).find((f) => f.key === '_len')
    expect(len?.value).toBeCloseTo((10 * Math.PI) / 2, 6)

    applyField(e, 'radius', 25)
    expect(e.props.radius).toBe(25)
    applyField(e, 'endDeg', 180)
    expect(e.props.endAngle).toBeCloseTo(Math.PI, 9)
    applyField(e, 'includedDeg', 90)
    expect(sweepOf(e.props)).toBeCloseTo(Math.PI / 2, 9)
    applyField(e, 'center.x', 3)
    expect(e.props.center[0]).toBe(3)
  })

  it('los ángulos de un arco horario se muestran y se editan en coordenadas de mundo', () => {
    const cw: ArcEntity = {
      ...quarter(),
      props: { center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI / 2, normal: [0, 0, -1] },
    }
    const start = entityFields(cw).find((f) => f.key === 'startDeg')
    expect(start?.value).toBeCloseTo(0, 9)
    const end = entityFields(cw).find((f) => f.key === 'endDeg')
    expect(end?.value).toBeCloseTo(270, 9) // −90° en mundo
    expect(entityFields(cw).find((f) => f.key === '_dir')?.value).toBe('clockwise')
  })

  it('se traslada y se escala', () => {
    const e = quarter()
    translateEntity(e, 1, 2, 3)
    expect(e.props.center).toEqual([1, 2, 3])
    scaleEntity(e, [0, 0, 0], 2)
    expect(e.props.radius).toBe(20)
    expect(e.props.center).toEqual([2, 4, 6])
  })

  it('al rotarlo giran también sus ángulos', () => {
    const r = rotateEntityInput(quarter(), [0, 0, 0], Math.PI / 2)
    expect(r.type).toBe('ARC')
    const p = r.props as ArcProps
    expect(p.startAngle).toBeCloseTo(Math.PI / 2, 9)
    expect(sweepOf(p)).toBeCloseTo(Math.PI / 2, 9)
  })

  it('el espejo invierte el sentido y conserva cuál era el inicio', () => {
    const ax = mirrorAxis([0, 0, 0], [0, 10, 0]) // eje vertical: refleja X
    const m = mirrorEntityInput(quarter(), ax!)
    expect(m?.type).toBe('ARC')
    const p = m!.props as ArcProps
    expect(arcIsClockwise(p)).toBe(true)
    const [s, e] = arcEndpoints(p)
    expect(s[0]).toBeCloseTo(-10, 9)
    expect(e[1]).toBeCloseTo(10, 9)
    expect(sweepOf(p)).toBeCloseTo(Math.PI / 2, 9)
  })

  it('STRETCH mueve el extremo que cae en la ventana y conserva la curvatura', () => {
    const e = quarter()
    const mid = arcMidpoint(e.props)
    // Ventana chica alrededor del extremo (10,0).
    const box = stretchBox([9, -1, 0], [11, 1, 0])
    const out = stretchEntity(e, box, [0, -5, 0])
    expect(out.kind).toBe('replace')
    if (out.kind !== 'replace') return
    const p = out.input.props as ArcProps
    const [s2, e2] = arcEndpoints(p)
    expect(s2[1]).toBeCloseTo(-5, 6) // el extremo movido
    expect(e2[1]).toBeCloseTo(10, 6) // el otro, intacto
    // El punto medio original sigue **sobre** el arco nuevo (es lo que lo mantiene reconocible).
    expect(Math.hypot(mid[0] - p.center[0], mid[1] - p.center[1])).toBeCloseTo(p.radius, 6)
    const ang = Math.atan2(mid[1] - p.center[1], mid[0] - p.center[0])
    expect(arcContainsAngle(p, normAngle(arcIsClockwise(p) ? -ang : ang), 1e-6)).toBe(true)
  })

  it('STRETCH mueve el arco entero si toda la ventana lo contiene, y nada si no lo toca', () => {
    expect(stretchEntity(quarter(), stretchBox([-20, -20, 0], [20, 20, 0]), [1, 1, 0]).kind).toBe('move')
    expect(stretchEntity(quarter(), stretchBox([100, 100, 0], [110, 110, 0]), [1, 1, 0]).kind).toBe('none')
  })
})

describe('round-trip DXF de arcos y polilíneas curvas', () => {
  it('el ARC se exporta con sus ángulos en grados y se reimporta igual', () => {
    const dxf = exportDxf([quarter()], layers)
    expect(dxf).toContain('ARC')
    const back = importDxf(dxf).entities.find((e) => e.type === 'ARC')
    expect(back).toBeDefined()
    const p = back!.props as ArcProps
    expect(p.center[0]).toBeCloseTo(0, 9)
    expect(p.radius).toBeCloseTo(10, 9)
    expect(p.startAngle).toBeCloseTo(0, 9)
    expect(p.endAngle).toBeCloseTo(Math.PI / 2, 9)
    expect(p.normal[2]).toBeCloseTo(1, 9)
  })

  it('un arco horario conserva la normal invertida (así lo guarda el CAD clásico)', () => {
    const cw: ArcEntity = {
      ...quarter(),
      props: { ...quarter().props, normal: [0, 0, -1] },
    }
    const back = importDxf(exportDxf([cw], layers)).entities.find((e) => e.type === 'ARC')
    expect((back!.props as ArcProps).normal[2]).toBeCloseTo(-1, 9)
  })

  it('los bulges de la polilínea viajan en el código 42', () => {
    const q = angleBulge(Math.PI / 2)
    const pl: PolylineEntity = {
      id: 'p1',
      type: 'POLYLINE',
      layer: 'l0',
      props: { vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 0]], bulges: [q, 0], closed: false },
    }
    const dxf = exportDxf([pl], layers)
    expect(dxf).toContain('\n42\n')
    const back = importDxf(dxf).entities.find((e) => e.type === 'POLYLINE')
    const props = back!.props as { vertices: number[][]; bulges?: number[] }
    expect(props.vertices).toHaveLength(3)
    expect(props.bulges?.[0]).toBeCloseTo(q, 9)
    expect(props.bulges?.[1]).toBe(0)
  })

  it('una polilínea recta no escribe bulges y un rectángulo curvo no se degrada a RECTANGLE', () => {
    const straight: Entity = {
      id: 'p2',
      type: 'POLYLINE',
      layer: 'l0',
      props: { vertices: [[0, 0, 0], [1, 1, 0]], closed: false },
    }
    expect(exportDxf([straight], layers)).not.toContain('\n42\n')

    const q = angleBulge(Math.PI / 2)
    const rounded: Entity = {
      id: 'p3',
      type: 'POLYLINE',
      layer: 'l0',
      props: {
        vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]],
        bulges: [q, 0, 0, 0],
        closed: true,
      },
    }
    const back = importDxf(exportDxf([rounded], layers)).entities[0]
    expect(back.type).toBe('POLYLINE') // no se confunde con un rectángulo
  })

  it('el arco de elipse viaja por los parámetros 41/42 y la elipse completa no los fija', () => {
    const arcEl: Entity = {
      id: 'el1',
      type: 'ELLIPSE',
      layer: 'l0',
      props: { center: [0, 0, 0], major: [10, 0, 0], ratio: 0.5, normal: [0, 0, 1], startParam: 0, endParam: Math.PI },
    }
    const back = importDxf(exportDxf([arcEl], layers)).entities[0].props as { startParam?: number; endParam?: number }
    expect(back.startParam).toBeCloseTo(0, 9)
    expect(back.endParam).toBeCloseTo(Math.PI, 9)

    const full: Entity = {
      id: 'el2',
      type: 'ELLIPSE',
      layer: 'l0',
      props: { center: [0, 0, 0], major: [10, 0, 0], ratio: 0.5, normal: [0, 0, 1] },
    }
    const backFull = importDxf(exportDxf([full], layers)).entities[0].props as { startParam?: number }
    expect(backFull.startParam).toBeUndefined()
  })
})

describe('normalización de ángulos del arco', () => {
  it('normAngle deja los ángulos en [0, 2π)', () => {
    expect(normAngle(-Math.PI)).toBeCloseTo(Math.PI, 9)
  })
})
