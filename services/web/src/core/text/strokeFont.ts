import { SIMPLEX } from './hersheySimplex'

/**
 * Texto técnico vectorial de un trazo (D1), equivalente a las SHX `simplex`/`romans` del CAD clásico:
 * el mismo trazado en pantalla, PDF y DXF, con métricas reales (ancho de cada glifo) para cortar la línea
 * de cota y decidir el *Fit*.
 *
 * Coordenadas en **unidades de alto**: la línea base es y = 0, las mayúsculas llegan a y = 1 y x crece
 * hacia la derecha desde el inicio del texto. `layoutText(texto, alto)` ya las multiplica por el alto.
 */

export type Pt2 = [number, number]
export type Stroke = Pt2[]

interface Glyph {
  /** Avance horizontal (en unidades de alto). */
  adv: number
  strokes: Stroke[]
}

const CAP = 21 // alto de mayúsculas en la grilla Hershey
const BASE = 22 // línea base en la grilla Hershey

function parse(d: string): Stroke[] {
  const out: Stroke[] = []
  for (const part of d.split('M').map((p) => p.trim()).filter(Boolean)) {
    const nums = part.replace('L', ' ').trim().split(/\s+/)
    const stroke: Stroke = nums.map((xy) => {
      const [x, y] = xy.split(',').map(Number)
      return [x / CAP, (BASE - y) / CAP]
    })
    if (stroke.length > 0) out.push(stroke)
  }
  return out
}

const base = new Map<string, Glyph>()
SIMPLEX.forEach(([o, d], i) => base.set(String.fromCharCode(33 + i), { adv: (2 * o) / CAP, strokes: parse(d) }))
base.set(' ', { adv: 10 / CAP, strokes: [] })

const tf = (g: Glyph, sx: number, sy: number, dx: number, dy: number): Stroke[] =>
  g.strokes.map((s) => s.map(([x, y]) => [x * sx + dx, y * sy + dy] as Pt2))

function circle(cx: number, cy: number, r: number, n = 16): Stroke {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt2
  })
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 12): Stroke {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt2
  })
}

const g = (c: string): Glyph => base.get(c) as Glyph

/** Glifo con un signo encima (acentos, diéresis, tilde), centrado sobre el ancho de tinta. */
function accented(c: string, mark: 'acute' | 'grave' | 'diaeresis' | 'tilde', upper: boolean): Glyph {
  const b = g(c)
  const xs = b.strokes.flat().map(([x]) => x)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const y = upper ? 1.12 : 0.8
  const marks: Stroke[] =
    mark === 'acute'
      ? [[[cx - 0.04, y], [cx + 0.1, y + 0.16]]]
      : mark === 'grave'
        ? [[[cx + 0.04, y], [cx - 0.1, y + 0.16]]]
        : mark === 'diaeresis'
          ? [circle(cx - 0.12, y + 0.06, 0.03, 6), circle(cx + 0.12, y + 0.06, 0.03, 6)]
          : [[[cx - 0.18, y + 0.04], [cx - 0.1, y + 0.11], [cx - 0.02, y + 0.09], [cx + 0.06, y + 0.04], [cx + 0.14, y + 0.03], [cx + 0.2, y + 0.1]]]
  return { adv: b.adv, strokes: [...b.strokes, ...marks] }
}

/** Glifo girado 180° (¿ ¡), bajado para que su punto quede a la altura de las minúsculas. */
function inverted(c: string): Glyph {
  const b = g(c)
  return { adv: b.adv, strokes: b.strokes.map((s) => s.map(([x, y]) => [b.adv - x, 0.72 - y] as Pt2)) }
}

const extra = new Map<string, Glyph>()
const ACC: Array<[string, string, 'acute' | 'grave' | 'diaeresis' | 'tilde']> = [
  ['á', 'a', 'acute'], ['é', 'e', 'acute'], ['í', 'i', 'acute'], ['ó', 'o', 'acute'], ['ú', 'u', 'acute'],
  ['à', 'a', 'grave'], ['è', 'e', 'grave'], ['ì', 'i', 'grave'], ['ò', 'o', 'grave'], ['ù', 'u', 'grave'],
  ['ä', 'a', 'diaeresis'], ['ë', 'e', 'diaeresis'], ['ï', 'i', 'diaeresis'], ['ö', 'o', 'diaeresis'], ['ü', 'u', 'diaeresis'],
  ['ñ', 'n', 'tilde'], ['ã', 'a', 'tilde'], ['õ', 'o', 'tilde'],
  ['Á', 'A', 'acute'], ['É', 'E', 'acute'], ['Í', 'I', 'acute'], ['Ó', 'O', 'acute'], ['Ú', 'U', 'acute'],
  ['Ü', 'U', 'diaeresis'], ['Ñ', 'N', 'tilde'],
]
for (const [ch, b, m] of ACC) extra.set(ch, accented(b, m, b === b.toUpperCase()))
extra.set('¿', inverted('?'))
extra.set('¡', inverted('!'))
// Grado: círculo chico arriba.
extra.set('°', { adv: 0.5, strokes: [circle(0.22, 0.86, 0.12)] })
// Más-menos: "+" reducido y una raya abajo.
{
  const p = g('+')
  extra.set('±', { adv: p.adv, strokes: [...tf(p, 0.8, 0.8, 0.1, 0.22), [[0.24, 0.12], [1.04, 0.12]]] })
}
// Diámetro (⌀, Ø, ø, ∅): círculo + diagonal que lo atraviesa.
{
  const dia: Glyph = { adv: 1, strokes: [circle(0.5, 0.5, 0.36, 24), [[0.12, 0.05], [0.88, 0.95]]] }
  for (const c of ['⌀', 'Ø', '∅']) extra.set(c, dia)
  extra.set('ø', { adv: 0.86, strokes: [circle(0.43, 0.33, 0.26, 20), [[0.12, 0], [0.74, 0.66]]] })
}
// Superíndices, multiplicación, punto medio, arco, micro, rayas.
extra.set('²', { adv: 0.55, strokes: tf(g('2'), 0.55, 0.55, -0.02, 0.48) })
extra.set('³', { adv: 0.55, strokes: tf(g('3'), 0.55, 0.55, -0.02, 0.48) })
extra.set('×', { adv: 0.8, strokes: [[[0.15, 0.1], [0.65, 0.6]], [[0.65, 0.1], [0.15, 0.6]]] })
extra.set('·', { adv: 0.4, strokes: [circle(0.2, 0.42, 0.04, 6)] })
extra.set('⌒', { adv: 0.9, strokes: [arc(0.45, 0.62, 0.36, Math.PI * 0.1, Math.PI * 0.9)] })
{
  const u = g('u')
  const xs = u.strokes.flat().map(([x]) => x)
  extra.set('µ', { adv: u.adv, strokes: [...u.strokes, [[Math.min(...xs), 0.67], [Math.min(...xs), -0.33]]] })
}
extra.set('–', g('-'))
extra.set('—', { adv: 1.1, strokes: [[[0.1, 0.43], [1, 0.43]]] })
extra.set('’', g("'"))
extra.set('‘', g('`'))
extra.set('“', g('"'))
extra.set('”', g('"'))

/** Glifo de un carácter (los desconocidos se dibujan como `?`). */
export function glyph(c: string): Glyph {
  return base.get(c) ?? extra.get(c) ?? (base.get('?') as Glyph)
}

export interface TextLayout {
  /** Trazos ya escalados al alto: origen en el inicio de la línea base. */
  strokes: Stroke[]
  /** Ancho total (avance). */
  width: number
}

/** Ancho de un texto de un renglón al alto dado. */
export function textWidth(text: string, height: number): number {
  let w = 0
  for (const c of text) w += glyph(c).adv
  return w * height
}

/** Trazos de un texto de un renglón al alto dado (origen: inicio de la línea base). */
export function layoutText(text: string, height: number): TextLayout {
  const strokes: Stroke[] = []
  let x = 0
  for (const c of text) {
    const gl = glyph(c)
    for (const s of gl.strokes) strokes.push(s.map(([px, py]) => [(x + px) * height, py * height] as Pt2))
    x += gl.adv
  }
  return { strokes, width: x * height }
}
