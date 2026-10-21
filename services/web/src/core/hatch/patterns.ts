import type { PatternLine } from '../document/types'
import { isImperial } from '../linetype/linetypes'

/**
 * Patrones de sombreado: biblioteca en pulgadas y su versión métrica (×25,4, mm). Cada línea:
 * `ángulo, x0,y0, dx,dy [, trazos…]` con `dx` a lo largo de la línea y `dy` perpendicular.
 */
export interface HatchPatternDef {
  name: string
  description: string
  lines: PatternLine[]
}

/** Relleno sólido y líneas definidas por el usuario (*User defined*). */
export const SOLID = 'SOLID'
export const USER = '_USER'

type Raw = [string, string, number[][]]

const L = (a: number, x: number, y: number, dx: number, dy: number, ...dashes: number[]): number[] => [a, x, y, dx, dy, ...dashes]

/** Biblioteca en pulgadas. */
const RAW: Raw[] = [
  ['ANGLE', 'Steel angle profile', [L(0, 0, 0, 0, 0.275, 0.2, -0.075), L(90, 0, 0, 0, 0.275, 0.2, -0.075)]],
  ['ANSI31', 'General use, cast iron (ANSI 31)', [L(45, 0, 0, 0, 0.125)]],
  ['ANSI32', 'Steel (ANSI 32)', [L(45, 0, 0, 0, 0.375), L(45, 0.176776695, 0, 0, 0.375)]],
  ['ANSI33', 'Bronze, brass, copper (ANSI 33)', [L(45, 0, 0, 0, 0.25), L(45, 0.176776695, 0, 0, 0.25, 0.125, -0.0625)]],
  ['ANSI34', 'Plastic, rubber (ANSI 34)', [L(45, 0, 0, 0, 0.75), L(45, 0.176776695, 0, 0, 0.75), L(45, 0.353553391, 0, 0, 0.75), L(45, 0.530330086, 0, 0, 0.75)]],
  ['ANSI35', 'Refractory, fire brick (ANSI 35)', [L(45, 0, 0, 0, 0.25), L(45, 0.176776695, 0, 0, 0.25, 0.3125, -0.0625, 0, -0.0625)]],
  ['ANSI36', 'Marble, slate, glass (ANSI 36)', [L(45, 0, 0, 0.21875, 0.125, 0.3125, -0.0625, 0, -0.0625)]],
  ['ANSI37', 'Lead, zinc, magnesium, insulation (ANSI 37)', [L(45, 0, 0, 0, 0.125), L(135, 0, 0, 0, 0.125)]],
  ['ANSI38', 'Aluminum (ANSI 38)', [L(45, 0, 0, 0, 0.125), L(135, 0, 0, 0.25, 0.125, 0.3125, -0.1875)]],
  ['AR-B816', 'Concrete block wall, 8 × 16 units, running bond', [L(0, 0, 0, 0, 8), L(90, 0, 0, 8, 8, 8, -8)]],
  ['BRICK', 'Brick courses', [L(0, 0, 0, 0, 0.25), L(90, 0, 0, 0, 0.5, 0.25, -0.25), L(90, 0.25, 0, 0, 0.5, -0.25, 0.25)]],
  ['CROSS', 'Small crosses', [L(0, 0, 0, 0.25, 0.25, 0.125, -0.375), L(90, 0.0625, -0.0625, 0.25, 0.25, 0.125, -0.375)]],
  ['DASH', 'Dashed parallel lines', [L(0, 0, 0, 0.125, 0.125, 0.125, -0.125)]],
  ['DOTS', 'Dot grid', [L(0, 0, 0, 0.03125, 0.0625, 0, -0.0625)]],
  [
    'EARTH',
    'Ground, soil',
    [
      L(0, 0, 0, 0.25, 0.25, 0.25, -0.25),
      L(0, 0, 0.09375, 0.25, 0.25, 0.25, -0.25),
      L(0, 0, 0.1875, 0.25, 0.25, 0.25, -0.25),
      L(90, 0.03125, 0.21875, 0.25, 0.25, 0.25, -0.25),
      L(90, 0.125, 0.21875, 0.25, 0.25, 0.25, -0.25),
      L(90, 0.21875, 0.21875, 0.25, 0.25, 0.25, -0.25),
    ],
  ],
  ['HONEY', 'Hexagonal cells', [L(0, 0, 0, 0.1875, 0.108253175, 0.125, -0.25), L(120, 0, 0, 0.1875, 0.108253175, 0.125, -0.25), L(60, 0.125, 0, 0.1875, 0.108253175, 0.125, -0.25)]],
  ['LINE', 'Horizontal lines', [L(0, 0, 0, 0, 0.125)]],
  ['NET', 'Square grid', [L(0, 0, 0, 0, 0.125), L(90, 0, 0, 0, 0.125)]],
  ['NET3', 'Triangular grid (0°, 60°, 120°)', [L(0, 0, 0, 0, 0.125), L(60, 0, 0, 0, 0.125), L(120, 0, 0, 0, 0.125)]],
  ['SQUARE', 'Small squares', [L(0, 0, 0, 0, 0.125, 0.125, -0.125), L(90, 0, 0, 0, 0.125, 0.125, -0.125)]],
  ['ZIGZAG', 'Stepped zigzag', [L(0, 0, 0, 0.125, 0.125, 0.125, -0.125), L(90, 0.125, 0, 0.125, 0.125, 0.125, -0.125)]],
]

const toLine = (r: number[], k: number): PatternLine => ({
  angle: r[0],
  origin: [r[1] * k, r[2] * k],
  delta: [r[3] * k, r[4] * k],
  dashes: r.slice(5).map((d) => d * k),
})

/** Patrones disponibles según las unidades del dibujo (sin SOLID ni _USER). */
export function hatchPatterns(units = 'mm'): HatchPatternDef[] {
  const k = isImperial(units) ? 1 : 25.4
  return RAW.map(([name, description, lines]) => ({ name, description, lines: lines.map((r) => toLine(r, k)) }))
}

/** Nombres de la galería: SOLID, los predefinidos y _USER (como el panel *Pattern* del CAD clásico). */
export const PATTERN_NAMES: string[] = [SOLID, ...RAW.map((r) => r[0]), USER]

export function hatchPattern(name: string, units = 'mm'): HatchPatternDef | undefined {
  const up = name.toUpperCase()
  return hatchPatterns(units).find((p) => p.name === up)
}

/** Líneas de un sombreado *User defined*: paralelas a 0° (y a 90° con doble rayado). */
export function userPattern(spacing: number, double: boolean): PatternLine[] {
  const s = spacing > 0 ? spacing : 1
  const out: PatternLine[] = [{ angle: 0, origin: [0, 0], delta: [0, s], dashes: [] }]
  if (double) out.push({ angle: 90, origin: [0, 0], delta: [0, s], dashes: [] })
  return out
}
