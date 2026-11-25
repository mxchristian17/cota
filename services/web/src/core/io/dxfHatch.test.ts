import { describe, expect, it } from 'vitest'
import type { HatchProps, PatternLine } from '../document/types'
import { DocumentModel } from '../document/DocumentModel'
import { hatchStrokes } from '../hatch/geometry'
import { hatchDxf, parseHatch } from './dxfHatch'

/**
 * HATCH de DXF con un patrón de la biblioteca: el CAD clásico dibuja con las líneas que guarda el sombreado;
 * el ángulo (52) y la escala (41) sólo informan. Cuando no coinciden con las líneas, mandan las líneas.
 */
type Codes = Array<[number, string]>

/** Grupos de un HATCH tal como los escribe `hatchDxf` (sin el `0 HATCH` inicial, como los recibe `parseHatch`). */
function codesOf(h: HatchProps): Codes {
  const t = hatchDxf(h, '').split('\n')
  const out: Codes = []
  for (let i = 0; i + 1 < t.length; i += 2) out.push([Number(t[i]), t[i + 1]])
  return out.slice(1)
}

/** Cambia el valor del primer grupo `code`. */
const withCode = (c: Codes, code: number, value: string): Codes => {
  const i = c.findIndex(([k]) => k === code)
  return c.map((x, j): [number, string] => (j === i ? [code, value] : x))
}

/** Líneas del patrón tal como quedan escritas (53 ángulo, 43/44 base, 45/46 corrimiento, 49 trazos). */
function patternLines(c: Codes): number[][] {
  const out: number[][] = []
  for (const [k, v] of c) {
    if (k === 53) out.push([Number(v)])
    else if (out.length && [43, 44, 45, 46, 49].includes(k)) out[out.length - 1].push(Number(v))
    if (k === 98) break
  }
  return out
}

const expectSameLines = (a: number[][], b: number[][]) => {
  expect(a.length).toBe(b.length)
  a.forEach((l, i) => {
    expect(l.length).toBe(b[i].length)
    // Ángulos módulo 360.
    expect(Math.abs(((((l[0] - b[i][0]) % 360) + 540) % 360) - 180)).toBeLessThan(1e-6)
    l.slice(1).forEach((x, j) => expect(x).toBeCloseTo(b[i][j + 1], 6))
  })
}

const rect = { vertices: [[0, 0, 0], [40, 0, 0], [40, 20, 0], [0, 20, 0]] as [number, number, number][] }
const base = (over: Partial<HatchProps>): HatchProps => ({ loops: [rect], pattern: 'ANSI38', scale: 0.5, angle: 0, origin: [1, 2, 0], island: 'outer', ...over })
const deg = (a: number) => ((((a * 180) / Math.PI) % 360) + 360) % 360

describe('HATCH de un patrón de la biblioteca: mandan las líneas del archivo', () => {
  it('ángulo (52) que no es el de las líneas (un DWG con grados donde van radianes): se gira como las líneas', () => {
    const ok = base({ angle: (315 * Math.PI) / 180 })
    const good = codesOf(ok)
    // El ángulo en grados pasado otra vez a grados: 315 × 180/π.
    const bad = withCode(good, 52, String((315 * 180) / Math.PI))
    const p = parseHatch(bad)!
    expect(p.pattern).toBe('ANSI38')
    expect(p.custom).toBeUndefined()
    expect(deg(p.angle)).toBeCloseTo(315, 6)
    expect(p.scale).toBeCloseTo(0.5, 9)
    expect(p.origin[0]).toBeCloseTo(1, 6)
    expect(p.origin[1]).toBeCloseTo(2, 6)
    // Las mismas líneas que el archivo y los mismos trazos que el sombreado bien escrito.
    expectSameLines(patternLines(codesOf(p)), patternLines(good))
    const a = hatchStrokes(p).segs
    const b = hatchStrokes(parseHatch(good)!).segs
    expect(a.length).toBe(b.length)
    a.forEach((s, i) => s.forEach((q, j) => q.forEach((x, k) => expect(x).toBeCloseTo(b[i][j][k], 6))))
    // ANSI38 a 315°: hiladas horizontales y juntas verticales (antes quedaban a ~48°).
    for (const [u, v] of a) expect(Math.min(Math.abs(u[0] - v[0]), Math.abs(u[1] - v[1]))).toBeLessThan(1e-6)
  })

  it('patrón de acad.pat (pulgadas) en un dibujo en mm: se reconoce como imperial con su escala', () => {
    const good = codesOf(base({ pattern: 'ANSI31', scale: 1, imperial: true }))
    const p = parseHatch(good)!
    expect(p.imperial).toBe(true)
    expect(p.scale).toBe(1)
    expect(p.custom).toBeUndefined()
    // ANSI31 de acad.pat: una línea cada 0,125 (antes, la de acadiso.pat: cada 3,175).
    expectSameLines(patternLines(codesOf(p)), patternLines(good))
  })

  it('escala (41) que no es la de las líneas: se toma la de las líneas', () => {
    const good = codesOf(base({ pattern: 'ANSI37', scale: 3, angle: Math.PI / 6 }))
    const p = parseHatch(withCode(good, 41, '2'))!
    expect(p.scale).toBeCloseTo(3, 9)
    expect(deg(p.angle)).toBeCloseTo(30, 6)
    expectSameLines(patternLines(codesOf(p)), patternLines(good))
  })

  it('con el nombre de un patrón de la biblioteca pero otra definición: sus líneas tal cual', () => {
    // Las dos líneas de ANSI37 con el nombre de ANSI31 (que tiene una).
    const other = codesOf(base({ pattern: 'ANSI37', scale: 2 }))
    const named = other.map(([k, v]): [number, string] => (k === 2 ? [2, 'ANSI31'] : [k, v]))
    const p = parseHatch(named)!
    expect(p.pattern).toBe('ANSI31')
    expect(p.custom?.length).toBe(2)
    expectSameLines(patternLines(codesOf(p)), patternLines(other))
  })

  it('el caso habitual no cambia: ángulo, escala y origen del archivo', () => {
    const h = base({ pattern: 'ANSI37', scale: 2, angle: Math.PI / 6, origin: [3, 4, 0] })
    const p = parseHatch(codesOf(h))!
    expect(p).toMatchObject({ pattern: 'ANSI37', scale: 2 })
    expect(p.angle).toBeCloseTo(Math.PI / 6, 12)
    expect(p.imperial).toBeUndefined()
    expect(p.custom).toBeUndefined()
  })
})

describe('Sombreado de un DXF en coordenadas de terreno (millones de unidades)', () => {
  it('la limpieza del ruido numérico no redondea sus líneas de patrón: los trazos no se corren', () => {
    // Un corrimiento real que queda a menos de 1e-9 relativo de 24,468054 (lo tomaba como ruido y lo redondeaba).
    const custom: PatternLine[] = [
      { angle: 228.0127875, origin: [1.46304, 2.032], delta: [24.468054023822404, 0.15103737059599887], dashes: [0.273377152, -27.064386911652] },
      { angle: 184.969741, origin: [1.28016, 1.8288], delta: [-24.468361883015998, 0.08801569017921107], dashes: [0.46912377599999994, -46.44323911481919] },
    ]
    const X = 5_000_000
    const Y = 6_000_000
    const props: HatchProps = {
      loops: [{ vertices: [[X, Y, 0], [X + 8, Y, 0], [X + 8, Y + 3, 0], [X, Y + 3, 0]] }],
      pattern: 'GRAVEL',
      scale: 1,
      angle: 0,
      origin: [0, 0, 0],
      island: 'outer',
      custom: structuredClone(custom),
    }
    const before = hatchStrokes(props).segs
    const doc = DocumentModel.createDefault('t')
    const e = doc.addEntity({ type: 'HATCH', layer: '0', props: structuredClone(props) })
    doc.cleanNumbers()
    expect((e.props as HatchProps).custom).toEqual(custom)
    const after = hatchStrokes(e.props as HatchProps).segs
    expect(after.length).toBe(before.length)
    after.forEach((s, i) => s.forEach((q, j) => expect(Math.hypot(q[0] - before[i][j][0], q[1] - before[i][j][1])).toBeLessThan(1e-6)))
  })
})
