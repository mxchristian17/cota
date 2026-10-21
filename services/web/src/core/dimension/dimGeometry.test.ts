import { describe, it, expect } from 'vitest'
import { dimDisplay, dimScaleFactor, formatDim, measureDim, DEFAULT_DIM_STYLE } from './dimGeometry'
import { arrowGeometry } from './arrows'
import { BUILTIN_DIM_VARS, type DimVars } from './style'
import type { DimensionProps, DimType } from '../document/types'
import type { Vec3 } from '../math'

const S = DEFAULT_DIM_STYLE
const mk = (dimType: DimType, points: number[][], textPos: number[], extra: Partial<DimensionProps> = {}, style: Partial<DimVars> = {}): DimensionProps => ({
  dimType,
  points: points as DimensionProps['points'],
  textPos: textPos as DimensionProps['textPos'],
  style: { ...S, ...style },
  ...extra,
})
const near = (a: Vec3, b: number[], tol = 1e-6) => expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - (b[2] ?? 0))).toBeLessThan(tol)

describe('measureDim', () => {
  it('LINEAR horizontal mide dx y vertical dy', () => {
    expect(measureDim(mk('LINEAR', [[0, 0, 0], [10, 3, 0]], [5, 8, 0]))).toBeCloseTo(10, 6)
    expect(measureDim(mk('LINEAR', [[0, 0, 0], [3, 10, 0]], [8, 5, 0]))).toBeCloseTo(10, 6)
  })
  it('LINEAR rotada mide sobre su dirección', () => {
    expect(measureDim(mk('LINEAR', [[0, 0, 0], [10, 10, 0]], [0, 5, 0], { rotation: 45 }))).toBeCloseTo(Math.hypot(10, 10), 6)
  })
  it('ALIGNED mide la distancia real 3-4-5', () => {
    expect(measureDim(mk('ALIGNED', [[0, 0, 0], [3, 4, 0]], [3, 4, 5]))).toBeCloseTo(5, 6)
  })
  it('ANGULAR mide el cuadrante donde está el texto (90° o su suplemento)', () => {
    expect(measureDim(mk('ANGULAR', [[0, 0, 0], [1, 0, 0], [1, 1, 0]], [2, 0.5, 0]))).toBeCloseTo(45, 6)
    expect(measureDim(mk('ANGULAR', [[0, 0, 0], [1, 0, 0], [1, 1, 0]], [-1, 2, 0]))).toBeCloseTo(135, 6)
  })
  it('RADIUS, DIAMETER y ARCLEN', () => {
    expect(measureDim(mk('RADIUS', [[0, 0, 0], [5, 0, 0]], [5, 0, 0]))).toBeCloseTo(5, 6)
    expect(measureDim(mk('DIAMETER', [[0, 0, 0], [5, 0, 0]], [5, 0, 0]))).toBeCloseTo(10, 6)
    expect(measureDim(mk('ARCLEN', [[0, 0, 0], [10, 0, 0], [0, 10, 0]], [10, 10, 0]))).toBeCloseTo(10 * (Math.PI / 2), 4)
  })
})

describe('formato con los estilos IRAM/ISO (criterio 3)', () => {
  it('100 (no 100.00), 12,5, R20, ⌀40 y 45°', () => {
    expect(formatDim(mk('LINEAR', [[0, 0, 0], [100, 0, 0]], [50, 10, 0]))).toBe('100')
    expect(formatDim(mk('LINEAR', [[0, 0, 0], [12.5, 0, 0]], [5, 10, 0]))).toBe('12,5')
    expect(formatDim(mk('RADIUS', [[0, 0, 0], [20, 0, 0]], [30, 0, 0]))).toBe('R20')
    expect(formatDim(mk('DIAMETER', [[0, 0, 0], [20, 0, 0]], [30, 0, 0]))).toBe('⌀40')
    expect(formatDim(mk('ANGULAR', [[0, 0, 0], [1, 0, 0], [1, 1, 0]], [2, 0.5, 0]))).toBe('45°')
  })
  it('tolerancia simétrica en línea y desviación apilada', () => {
    expect(formatDim(mk('LINEAR', [[0, 0, 0], [50, 0, 0]], [25, 10, 0], {}, { DIMTOL: true, DIMTP: 0.1, DIMTM: 0.1 }))).toBe('50 ±0,1')
    expect(formatDim(mk('LINEAR', [[0, 0, 0], [50, 0, 0]], [25, 10, 0], {}, { DIMTOL: true, DIMTP: 0.1, DIMTM: 0.05 }))).toBe('50 +0,1/-0,05')
  })
  it('textOverride reemplaza la medida y <> la inserta', () => {
    expect(formatDim(mk('LINEAR', [[0, 0, 0], [10, 0, 0]], [5, 5, 0], { textOverride: 'TYP' }))).toBe('TYP')
    expect(formatDim(mk('LINEAR', [[0, 0, 0], [10, 0, 0]], [5, 5, 0], { textOverride: '2x <>' }))).toBe('2x 10')
  })
  it('Standard conserva el formato previo (punto y ceros)', () => {
    expect(formatDim(mk('LINEAR', [[0, 0, 0], [10, 0, 0]], [5, 5, 0], {}, BUILTIN_DIM_VARS.Standard))).toBe('10.00')
  })
})

describe('dimDisplay', () => {
  it('LINEAR: referencias con DIMEXO/DIMEXE, línea de cota, 2 flechas rellenas y texto vectorial', () => {
    const d = dimDisplay(mk('LINEAR', [[0, 0, 0], [40, 0, 0]], [20, 10, 0]))
    const [ext1] = d.lines
    near(ext1[0], [0, S.DIMEXO, 0]) // separada del objeto
    near(ext1[1], [0, 10 + S.DIMEXE, 0]) // prolongada más allá de la línea de cota
    expect(d.fills).toHaveLength(2)
    expect(d.textStrokes.length).toBeGreaterThanOrEqual(3) // "4" (2 trazos) + "0" (1)
    expect(d.text.value).toBe('40')
  })

  it('criterio 2: cota vertical con texto paralelo a su línea, encima y legible de abajo hacia arriba', () => {
    const d = dimDisplay(mk('LINEAR', [[0, 0, 0], [0, 40, 0]], [-10, 20, 0]))
    near(d.text.dir, [0, 1, 0])
    // Encima = del lado de "arriba" del texto (−X al leer de abajo hacia arriba), a DIMGAP + h/2.
    expect(d.text.pos[0]).toBeCloseTo(-10 - S.DIMGAP - S.DIMTXT / 2, 6)
    // Alineada a 135°: el texto se invierte para seguir siendo legible.
    const a = dimDisplay(mk('ALIGNED', [[10, 0, 0], [0, 10, 0]], [10, 10, 0]))
    expect(a.text.dir[0]).toBeGreaterThan(0)
  })

  it('criterio 2: con DIMTAD = 0 la línea de cota se corta alrededor del texto', () => {
    const d = dimDisplay(mk('LINEAR', [[0, 0, 0], [40, 0, 0]], [20, 10, 0], {}, { DIMTAD: 0 }))
    const dimLine = d.lines.filter(([a, b]) => Math.abs(a[1] - 10) < 1e-9 && Math.abs(b[1] - 10) < 1e-9)
    expect(dimLine).toHaveLength(2)
    const gapStart = Math.min(dimLine[0][1][0], dimLine[1][1][0])
    const gapEnd = Math.max(dimLine[0][0][0], dimLine[1][0][0])
    expect(gapEnd - gapStart).toBeGreaterThan(d.text.height) // hueco ≥ ancho del texto
  })

  it('Standard: texto horizontal también en cotas verticales', () => {
    const d = dimDisplay(mk('LINEAR', [[0, 0, 0], [0, 40, 0]], [-10, 20, 0], {}, BUILTIN_DIM_VARS.Standard))
    near(d.text.dir, [1, 0, 0])
  })

  it('criterio 4: una cota de 3 con texto de 2,5 saca el texto y las flechas (DIMATFIT 3)', () => {
    const d = dimDisplay(mk('LINEAR', [[0, 0, 0], [3, 0, 0]], [1.5, 10, 0]))
    expect(d.text.pos[0]).toBeGreaterThan(3) // texto después de la 2ª referencia
    // Flechas afuera: sus puntas en las referencias apuntando hacia adentro (la base queda afuera).
    const xs = d.fills.flat().map((p) => p[0])
    expect(Math.min(...xs)).toBeLessThan(0)
    expect(Math.max(...xs)).toBeGreaterThan(3)
    // Con DIMTIX el texto queda adentro.
    const tix = dimDisplay(mk('LINEAR', [[0, 0, 0], [3, 0, 0]], [1.5, 10, 0], {}, { DIMTIX: true }))
    expect(tix.text.pos[0]).toBeCloseTo(1.5, 6)
  })

  it('IRAM 4511: trazos oblicuos y línea de cota prolongada DIMDLE', () => {
    const v = BUILTIN_DIM_VARS['IRAM 4511']
    const d = dimDisplay(mk('LINEAR', [[0, 0, 0], [40, 0, 0]], [20, 10, 0], {}, v))
    expect(d.fills).toHaveLength(0)
    const dimLine = d.lines.find(([a, b]) => Math.abs(a[1] - 10) < 1e-9 && Math.abs(b[1] - 10) < 1e-9)!
    expect(dimLine[0][0]).toBeCloseTo(-v.DIMDLE, 6)
    expect(dimLine[1][0]).toBeCloseTo(40 + v.DIMDLE, 6)
  })

  it('LINEAR a una altura: toda la cota queda en z de los extremos', () => {
    const d = dimDisplay(mk('LINEAR', [[0, 0, 50], [100, 0, 50]], [50, 10, 0]))
    for (const [a, b] of d.lines) {
      expect(a[2]).toBeCloseTo(50, 6)
      expect(b[2]).toBeCloseTo(50, 6)
    }
    expect(d.text.pos[2]).toBeCloseTo(50, 6)
  })

  it('ALIGNED 3D real: extremos a distinta altura conservan su z', () => {
    const d = dimDisplay(mk('ALIGNED', [[0, 0, 0], [30, 0, 40]], [0, -10, 20]))
    const zs = d.lines.flatMap(([a, b]) => [a[2], b[2]])
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(1)
  })

  it('RADIUS afuera: flecha sobre el borde apuntando al centro, líder hasta el texto y marca de centro', () => {
    const d = dimDisplay(mk('RADIUS', [[0, 0, 0], [10, 0, 0]], [20, 0, 0]))
    expect(d.fills).toHaveLength(1)
    const tip = d.fills[0][0]
    near(tip, [10, 0, 0])
    expect(d.lines.some(([a, b]) => Math.abs(a[0] + S.DIMCEN) < 1e-9 && Math.abs(b[0] - S.DIMCEN) < 1e-9)).toBe(true)
  })

  it('DIAMETER adentro: línea completa con dos flechas', () => {
    const d = dimDisplay(mk('DIAMETER', [[0, 0, 0], [10, 0, 0]], [3, 0, 0]))
    expect(d.fills).toHaveLength(2)
  })

  it('CENTER: cruz de 2 líneas', () => {
    const d = dimDisplay(mk('CENTER', [[0, 0, 0]], [0, 0, 0]))
    expect(d.lines).toHaveLength(2)
    expect(d.text.value).toBe('')
  })

  it('anotativa: el tamaño sigue la escala de anotación; DIMSCALE si no lo es', () => {
    expect(dimScaleFactor({ ...S, ANNOTATIVE: true }, { annoScale: 50 })).toBe(50)
    expect(dimScaleFactor({ ...S, DIMSCALE: 2 }, { annoScale: 50 })).toBe(2)
    const a = dimDisplay(mk('LINEAR', [[0, 0, 0], [4000, 0, 0]], [2000, 500, 0], {}, { ANNOTATIVE: true }), { annoScale: 50 })
    expect(a.text.height).toBeCloseTo(S.DIMTXT * 50, 6)
  })
})

describe('flechas', () => {
  const len = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1])
  it('IRAM 4:1 y cerrada rellena 3:1', () => {
    const [tip, b1, b2] = arrowGeometry('_IRAM', [0, 0, 0], [1, 0, 0], [0, 0, 1], 4).fills[0]
    expect(len(tip, [(b1[0] + b2[0]) / 2, (b1[1] + b2[1]) / 2, 0])).toBeCloseTo(4, 6)
    expect(len(b1, b2)).toBeCloseTo(1, 6)
    const [, c1, c2] = arrowGeometry('', [0, 0, 0], [1, 0, 0], [0, 0, 1], 3).fills[0]
    expect(len(c1, c2)).toBeCloseTo(1, 6)
  })
  it('oblicua: un trazo a 45° de largo √2·tamaño/√2', () => {
    const g = arrowGeometry('_OBLIQUE', [0, 0, 0], [1, 0, 0], [0, 0, 1], 2)
    expect(g.lines).toHaveLength(1)
    const [a, b] = g.lines[0]
    expect(Math.abs(b[0] - a[0])).toBeCloseTo(Math.abs(b[1] - a[1]), 9)
  })
})

describe('cotas en 3D y planos verticales (pedido de Christian: no repetir el error de las verticales)', () => {
  const FRONT: Vec3 = [0, -1, 0]
  const LEFT: Vec3 = [-1, 0, 0]
  it('FRONT: una lineal vertical mide la altura (Z), queda en el plano XZ y el texto se lee de abajo hacia arriba', () => {
    const p = mk('LINEAR', [[0, -10, 0], [0, -10, 30]], [-8, 0, 15], { normal: FRONT })
    expect(measureDim(p)).toBeCloseTo(30, 9)
    const d = dimDisplay(p)
    for (const [a, b] of d.lines) {
      expect(a[1]).toBeCloseTo(-10, 6)
      expect(b[1]).toBeCloseTo(-10, 6)
    }
    near(d.text.dir, [0, 0, 1])
    near(d.text.up, [-1, 0, 0])
  })
  it('FRONT: una lineal horizontal mide X con el texto legible de izquierda a derecha (no espejado)', () => {
    const d = dimDisplay(mk('LINEAR', [[0, 0, 0], [40, 0, 0]], [20, 0, 10], { normal: FRONT }))
    expect(d.text.value).toBe('40')
    near(d.text.dir, [1, 0, 0])
    near(d.text.up, [0, 0, 1])
  })
  it('LEFT: horizontal de la vista = −Y, vertical = Z', () => {
    const p = mk('LINEAR', [[0, 0, 0], [0, -25, 0]], [0, -12, 8], { normal: LEFT })
    expect(measureDim(p)).toBeCloseTo(25, 9)
    near(dimDisplay(p).text.dir, [0, -1, 0])
  })
  it('ALIGNED 3D desde ISO: el plano mira al observador y el texto no queda espejado', () => {
    const view: Vec3 = [Math.SQRT1_2, -Math.SQRT1_2, 0]
    const d = dimDisplay(mk('ALIGNED', [[0, 0, 0], [0, 0, 30]], [5, -5, 15], { normal: view }))
    expect(dot3(d.normal, view)).toBeGreaterThan(0)
    near(d.text.dir, [0, 0, 1])
  })
  it('radio de un círculo vertical (plano XZ)', () => {
    const d = dimDisplay(mk('RADIUS', [[0, 0, 0], [10, 0, 0]], [20, 0, 5], { normal: FRONT }))
    for (const poly of d.fills) for (const q of poly) expect(q[1]).toBeCloseTo(0, 6)
    expect(d.text.value).toBe('R10')
  })
})
const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
