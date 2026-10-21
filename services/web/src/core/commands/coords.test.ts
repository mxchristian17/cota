import { describe, it, expect } from 'vitest'
import { parseCoordinate, parseNumber } from './coords'
import { pt } from '../math'
import { orthoUcs, ucsFromAngle } from '../ucs'

describe('parseCoordinate', () => {
  it('parsea coordenadas absolutas x,y', () => {
    expect(parseCoordinate('100,50', null)).toEqual(pt(100, 50, 0))
  })

  it('parsea absolutas x,y,z', () => {
    expect(parseCoordinate('1,2,3', null)).toEqual(pt(1, 2, 3))
  })

  it('parsea relativas @dx,dy respecto a la base', () => {
    expect(parseCoordinate('@30,0', pt(10, 10, 0))).toEqual(pt(40, 10, 0))
  })

  it('parsea polares @dist<ang', () => {
    const r = parseCoordinate('@50<90', pt(0, 0, 0))!
    expect(r.x).toBeCloseTo(0, 6)
    expect(r.y).toBeCloseTo(50, 6)
  })

  it('polar a 0 grados avanza en X', () => {
    const r = parseCoordinate('@10<0', pt(5, 5, 0))!
    expect(r.x).toBeCloseTo(15, 6)
    expect(r.y).toBeCloseTo(5, 6)
  })

  it('devuelve null para relativas sin base', () => {
    expect(parseCoordinate('@10,10', null)).toBeNull()
  })

  it('con base, las coordenadas planas son RELATIVAS (continuar desde un punto)', () => {
    expect(parseCoordinate('30,0', pt(10, 10, 0))).toEqual(pt(40, 10, 0))
  })

  it('con base, "#x,y" fuerza ABSOLUTO', () => {
    expect(parseCoordinate('#30,0', pt(10, 10, 0))).toEqual(pt(30, 0, 0))
  })

  it('con base, la forma polar plana "dist<ang" es relativa', () => {
    const r = parseCoordinate('50<90', pt(0, 0, 0))!
    expect(r.x).toBeCloseTo(0, 6)
    expect(r.y).toBeCloseTo(50, 6)
  })

  it('sin base, "x,y" sigue siendo absoluto', () => {
    expect(parseCoordinate('100,50', null)).toEqual(pt(100, 50, 0))
  })

  it('devuelve null para texto inválido', () => {
    expect(parseCoordinate('abc', null)).toBeNull()
    expect(parseCoordinate('10', null)).toBeNull()
    expect(parseCoordinate('', null)).toBeNull()
    expect(parseCoordinate('10,', null)).toBeNull()
  })
})

describe('parseCoordinate en una UCS 3D', () => {
  const front = orthoUcs('FRONT')
  const near = (a: { x: number; y: number; z: number } | null, b: [number, number, number]) => {
    expect(a).not.toBeNull()
    expect(a!.x).toBeCloseTo(b[0], 9)
    expect(a!.y).toBeCloseTo(b[1], 9)
    expect(a!.z).toBeCloseTo(b[2], 9)
  }

  it('en la UCS Front, "x,y" cae en el plano XZ del mundo y "@0,20" sube en Z', () => {
    near(parseCoordinate('10,5', null, front), [10, 0, 5])
    near(parseCoordinate('@0,20', pt(1, 2, 3), front), [1, 2, 23])
    near(parseCoordinate('10<90', pt(0, 0, 0), front), [0, 0, 10]) // polar en el XY de la UCS
  })

  it('"*" es absoluto en el mundo; "#" absoluto en la UCS', () => {
    near(parseCoordinate('*1,2,3', pt(9, 9, 9), front), [1, 2, 3])
    near(parseCoordinate('#1,2,3', pt(9, 9, 9), front), [1, -3, 2])
  })

  it('cilíndricas y esféricas', () => {
    near(parseCoordinate('@10<90,5', pt(0, 0, 0)), [0, 10, 5])
    const s = Math.SQRT1_2 * 10
    near(parseCoordinate('@10<0<45', pt(0, 0, 0)), [s, 0, s])
    near(parseCoordinate('10<0', null), [10, 0, 0]) // polar absoluta: desde el origen de la UCS
  })

  it('una UCS girada en planta mide los ángulos desde su X', () => {
    near(parseCoordinate('@10<0', pt(0, 0, 0), ucsFromAngle(pt(0, 0, 0), Math.PI / 2)), [0, 10, 0])
  })
})

describe('parseNumber', () => {
  it('parsea números válidos', () => {
    expect(parseNumber('42')).toBe(42)
    expect(parseNumber('3.5')).toBe(3.5)
  })
  it('rechaza vacío y no numérico', () => {
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('abc')).toBeNull()
  })
})
