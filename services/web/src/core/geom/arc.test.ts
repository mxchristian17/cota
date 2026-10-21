import { describe, it, expect } from 'vitest'
import type { Vec3 } from '../math'
import {
  TAU,
  arcBounds,
  arcContainsAngle,
  arcEndpoints,
  arcFrom3Points,
  arcFromStartCenterAngle,
  arcFromStartCenterEnd,
  arcFromStartCenterLength,
  arcFromStartEndAngle,
  arcFromStartEndDirection,
  arcFromStartEndRadius,
  arcIsClockwise,
  arcIsFullTurn,
  arcLength,
  arcMidpoint,
  arcQuadrants,
  arcSegmentCount,
  arcSweep,
  arcTangentAt,
  normAngle,
  sweepOf,
  tessellateArc,
} from './arc'

const near = (v: Vec3, x: number, y: number, p = 6): void => {
  expect(v[0]).toBeCloseTo(x, p)
  expect(v[1]).toBeCloseTo(y, p)
}

describe('ángulos y barrido', () => {
  it('normaliza ángulos a [0, 2π)', () => {
    expect(normAngle(0)).toBe(0)
    expect(normAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2, 9)
    expect(normAngle(TAU + 1)).toBeCloseTo(1, 9)
  })

  it('el barrido es antihorario y un barrido nulo es la vuelta completa', () => {
    expect(arcSweep(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 9)
    expect(arcSweep(Math.PI / 2, 0)).toBeCloseTo((3 * Math.PI) / 2, 9)
    expect(arcSweep(1, 1)).toBeCloseTo(TAU, 9)
  })
})

describe('arco de 90° en el primer cuadrante', () => {
  const a = { center: [0, 0, 0] as Vec3, radius: 10, startAngle: 0, endAngle: Math.PI / 2, normal: [0, 0, 1] as Vec3 }

  it('extremos, punto medio y longitud', () => {
    const [s, e] = arcEndpoints(a)
    near(s, 10, 0)
    near(e, 0, 10)
    near(arcMidpoint(a), 10 * Math.cos(Math.PI / 4), 10 * Math.sin(Math.PI / 4))
    expect(arcLength(a)).toBeCloseTo((10 * Math.PI) / 2, 9)
  })

  it('la caja envolvente es la del arco, no la del círculo', () => {
    const b = arcBounds(a)
    expect(b.minX).toBeCloseTo(0, 9)
    expect(b.minY).toBeCloseTo(0, 9)
    expect(b.maxX).toBeCloseTo(10, 9)
    expect(b.maxY).toBeCloseTo(10, 9)
  })

  it('sólo ofrece los cuadrantes dentro del barrido', () => {
    const q = arcQuadrants(a)
    expect(q).toHaveLength(2) // 0° y 90°; no 180° ni 270°
    near(q[0], 10, 0)
    near(q[1], 0, 10)
    expect(arcContainsAngle(a, Math.PI)).toBe(false)
  })

  it('la tangente avanza en el sentido del arco', () => {
    near(arcTangentAt(a, 0), 0, 1) // en (10,0) sube
    near(arcTangentAt(a, 1), -1, 0) // en (0,10) va hacia −X
  })

  it('la tesselación es proporcional al barrido e incluye los dos extremos', () => {
    expect(arcSegmentCount(TAU)).toBe(96)
    expect(arcSegmentCount(Math.PI / 2)).toBe(24)
    const pts = tessellateArc(a)
    expect(pts).toHaveLength(25)
    near(pts[0], 10, 0)
    near(pts[pts.length - 1], 0, 10)
  })
})

describe('constructores de arco', () => {
  it('3 puntos: conserva el sentido de recorrido (horario = normal invertida)', () => {
    const cw = arcFrom3Points([0, 0, 0], [5, 5, 0], [10, 0, 0])!
    expect(arcIsClockwise(cw)).toBe(true)
    near(cw.center, 5, 0)
    expect(cw.radius).toBeCloseTo(5, 9)
    expect(sweepOf(cw)).toBeCloseTo(Math.PI, 9)
    near(arcMidpoint(cw), 5, 5) // pasa por el punto intermedio
    const [s, e] = arcEndpoints(cw)
    near(s, 0, 0)
    near(e, 10, 0)

    const ccw = arcFrom3Points([0, 0, 0], [5, -5, 0], [10, 0, 0])!
    expect(arcIsClockwise(ccw)).toBe(false)
    near(arcMidpoint(ccw), 5, -5)
  })

  it('3 puntos colineales no definen un arco', () => {
    expect(arcFrom3Points([0, 0, 0], [5, 0, 0], [10, 0, 0])).toBeNull()
  })

  it('Start, Center, End va antihorario desde el inicio', () => {
    const a = arcFromStartCenterEnd([10, 0, 0], [0, 0, 0], [0, 10, 0])!
    expect(sweepOf(a)).toBeCloseTo(Math.PI / 2, 9)
    expect(arcIsClockwise(a)).toBe(false)
  })

  it('Start, Center, Angle con ángulo negativo dibuja horario', () => {
    const a = arcFromStartCenterAngle([10, 0, 0], [0, 0, 0], -Math.PI / 2)!
    expect(arcIsClockwise(a)).toBe(true)
    expect(sweepOf(a)).toBeCloseTo(Math.PI / 2, 9)
    near(arcEndpoints(a)[1], 0, -10)
  })

  it('Start, Center, Length: la cuerda fija el barrido y una cuerda negativa pide el arco mayor', () => {
    const minor = arcFromStartCenterLength([10, 0, 0], [0, 0, 0], 10)!
    expect(sweepOf(minor)).toBeCloseTo(Math.PI / 3, 9) // cuerda = radio ⇒ 60°
    const major = arcFromStartCenterLength([10, 0, 0], [0, 0, 0], -10)!
    expect(sweepOf(major)).toBeCloseTo(TAU - Math.PI / 3, 9)
    // Una cuerda más larga que el diámetro no define arco.
    expect(arcFromStartCenterLength([10, 0, 0], [0, 0, 0], 30)).toBeNull()
  })

  it('Start, End, Angle ubica el centro del lado correcto', () => {
    const a = arcFromStartEndAngle([0, 0, 0], [10, 0, 0], Math.PI / 2)!
    near(a.center, 5, 5)
    expect(a.radius).toBeCloseTo(10 / 2 / Math.sin(Math.PI / 4), 9)
    expect(arcIsClockwise(a)).toBe(false)
    // Con el ángulo negativo el arco es horario y el centro se refleja.
    const cw = arcFromStartEndAngle([0, 0, 0], [10, 0, 0], -Math.PI / 2)!
    near(cw.center, 5, -5)
    expect(arcIsClockwise(cw)).toBe(true)
  })

  it('Start, End, Radius: menor por defecto, mayor con radio negativo', () => {
    const minor = arcFromStartEndRadius([0, 0, 0], [10, 0, 0], 5)!
    expect(minor.radius).toBeCloseTo(5, 9)
    expect(sweepOf(minor)).toBeCloseTo(Math.PI, 9)
    const major = arcFromStartEndRadius([0, 0, 0], [10, 0, 0], -8)!
    expect(sweepOf(major)).toBeGreaterThan(Math.PI)
    // Un radio menor que la media cuerda es imposible.
    expect(arcFromStartEndRadius([0, 0, 0], [10, 0, 0], 2)).toBeNull()
  })

  it('Start, End, Direction sale tangente a la dirección pedida', () => {
    const a = arcFromStartEndDirection([0, 0, 0], [10, 0, 0], [0, 1, 0])!
    near(arcTangentAt(a, 0), 0, 1)
    near(a.center, 5, 0)
    near(arcMidpoint(a), 5, 5)
    expect(arcIsClockwise(a)).toBe(true)
    // Tangente alineada con la cuerda: no hay arco.
    expect(arcFromStartEndDirection([0, 0, 0], [10, 0, 0], [1, 0, 0])).toBeNull()
  })

  it('detecta el barrido completo (que debe guardarse como círculo)', () => {
    expect(arcIsFullTurn({ center: [0, 0, 0], radius: 5, startAngle: 1, endAngle: 1, normal: [0, 0, 1] })).toBe(true)
    expect(arcIsFullTurn({ center: [0, 0, 0], radius: 5, startAngle: 0, endAngle: 1, normal: [0, 0, 1] })).toBe(false)
  })
})
