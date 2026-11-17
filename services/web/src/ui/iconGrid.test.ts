import { describe, expect, it } from 'vitest'
import { ICONS, iconMarkup, MOBILE_ICON_SIZE, MOBILE_ICONS } from './icons'
import { ICON_PX, ICON_SIZES, isIconSize, makeGrid } from './iconGrid'
import { UI_ICON_NAMES, uiIconMarkup } from './uiIcons'

/** Fracción de un número (0 ≤ f < 1). */
const frac = (v: number) => v - Math.floor(v)
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6

/**
 * Tramos horizontales y verticales de un elemento: la coordenada que comparten debe caer en el centro de un píxel
 * (trazo de 1 px) o en un borde (trazo de 2 px o relleno). Así se garantiza la nitidez en los tres tamaños.
 */
function axisSegments(el: string): Array<{ v: number; even: boolean }> {
  const cls = /class="([^"]*)"/.exec(el)?.[1] ?? ''
  const even = /(^|\s)(f|s|bg|w)(\s|$)/.test(cls)
  const out: Array<{ v: number; even: boolean }> = []
  const line = /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/.exec(el)
  if (line) {
    const [x1, y1, x2, y2] = line.slice(1).map(Number)
    if (near(x1, x2)) out.push({ v: x1, even })
    if (near(y1, y2)) out.push({ v: y1, even })
    return out
  }
  const d = /<path d="([^"]+)"/.exec(el)?.[1]
  if (!d || /[hv]/.test(d)) return out // grips y letras: relleno en píxeles enteros por construcción
  const tok = d.match(/[MLHVCQAZ]|-?\d*\.?\d+/g) ?? []
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  let i = 0
  let cmd = ''
  const num = () => Number(tok[i++])
  const seg = (x: number, y: number) => {
    if (near(x, cx) && !near(y, cy)) out.push({ v: x, even })
    if (near(y, cy) && !near(x, cx)) out.push({ v: y, even })
    cx = x
    cy = y
  }
  while (i < tok.length) {
    if (/[MLHVCQAZ]/.test(tok[i])) cmd = tok[i++]
    if (cmd === 'M') {
      cx = sx = num()
      cy = sy = num()
      cmd = 'L'
    } else if (cmd === 'L') seg(num(), num())
    else if (cmd === 'H') seg(num(), cy)
    else if (cmd === 'V') seg(cx, num())
    else if (cmd === 'C') {
      i += 4
      cx = num()
      cy = num()
    } else if (cmd === 'Q') {
      i += 2
      cx = num()
      cy = num()
    } else if (cmd === 'A') {
      i += 5
      cx = num()
      cy = num()
    } else if (cmd === 'Z') {
      seg(sx, sy)
      cmd = ''
    } else i++
  }
  return out
}

describe('íconos en grilla de píxeles', () => {
  it('tres tamaños: 16, 20 y 24 px', () => {
    expect(ICON_SIZES.map((s) => ICON_PX[s])).toEqual([16, 20, 24])
    expect(isIconSize('md')).toBe(true)
    expect(isIconSize('xl')).toBe(false)
  })

  it('el ajuste respeta la simetría: lo simétrico respecto del centro sigue simétrico', () => {
    for (const s of ICON_SIZES) {
      const g = makeGrid(s)
      const S = ICON_PX[s]
      const xs = (m: string) => /x1="([^"]+)" y1="[^"]+" x2="([^"]+)"/.exec(m)!.slice(1).map(Number)
      // Anclada en la columna 7: 2.5 y 12.5 siguen simétricos respecto de su columna central.
      const [c0, c1] = xs(g.l(2.5, 7.5, 12.5, 7.5))
      expect(c0 + c1).toBeCloseTo(S - 1, 6)
      // Anclada en el centro real: 2.5 y 13.5 siguen simétricos respecto del centro del ícono.
      const [a, b] = xs(makeGrid(s, 8, 8).l(2.5, 7.5, 13.5, 7.5))
      expect(a + b).toBeCloseTo(S, 6)
      // Un círculo y su cruz de centro siguen concéntricos.
      const circ = /cx="([^"]+)"/.exec(g.c(7.5, 7.5, 6))![1]
      const [m] = xs(g.l(7.5, 0.5, 7.5, 15.5))
      expect(Number(circ)).toBeCloseTo(m, 6)
    }
  })

  it('cada tramo horizontal o vertical cae en la grilla de su tamaño (nítido a 1x y a 2x)', () => {
    const bad: string[] = []
    for (const name of Object.keys(ICONS)) {
      for (const s of ICON_SIZES) {
        const svg = iconMarkup(name, s)
        for (const el of svg.match(/<(line|path)[^>]*>/g) ?? []) {
          for (const { v, even } of axisSegments(el)) {
            const ok = even ? near(frac(v), 0) || near(frac(v), 1) : near(frac(v), 0.5)
            if (!ok) bad.push(`${name} ${s}: ${v} en ${el.slice(0, 80)}`)
          }
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('los íconos de interfaz también caen en la grilla de cada tamaño en que se usan', () => {
    const bad: string[] = []
    for (const name of UI_ICON_NAMES) {
      for (const size of [12, 13, 14, 16, 22, 24]) {
        for (const el of uiIconMarkup(name, size).match(/<(line|path)[^>]*>/g) ?? []) {
          for (const { v, even } of axisSegments(el)) {
            const ok = even ? near(frac(v), 0) || near(frac(v), 1) : near(frac(v), 0.5)
            if (!ok) bad.push(`${name} ${size}: ${v}`)
          }
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('vista de obra del celular: cada botón usa un ícono del set, a 24 px y en la grilla', () => {
    expect(MOBILE_ICON_SIZE).toBe('lg')
    for (const [btn, name] of Object.entries(MOBILE_ICONS)) {
      expect(ICONS[name], btn).toBeTruthy()
      const svg = iconMarkup(name, MOBILE_ICON_SIZE)
      expect(svg, btn).toMatch(/^</)
      // Trazo de 1 px: nada de 2 px (`w`) en los botones del teléfono.
      expect(svg, btn).not.toMatch(/class="[^"]*\bw\b/)
      // Dos tonos: algo de lo que el botón cambia va en acento.
      expect(svg, btn).toMatch(/class="(a|f|fa)( |")/)
    }
  })

  it('íconos nuevos de la vista de obra: dentro del cuadro y con las piezas iguales en cada tamaño', () => {
    for (const s of ICON_SIZES) {
      const S = ICON_PX[s]
      for (const name of ['fit', 'viewnet', 'visualstyle', 'orbit']) {
        const nums = (iconMarkup(name, s).match(/-?\d*\.?\d+/g) ?? []).map(Number)
        expect(Math.min(...nums), `${name} ${s}`).toBeGreaterThanOrEqual(0)
        expect(Math.max(...nums), `${name} ${s}`).toBeLessThanOrEqual(S)
      }
      // ViewNet: seis celdas cuadradas del mismo lado, en cruz (4 en la fila del medio, 1 arriba y 1 abajo).
      const cells = [...iconMarkup('viewnet', s).matchAll(/M([\d.]+) ([\d.]+)H([\d.]+)V([\d.]+)/g)].map((m) => m.slice(1).map(Number))
      expect(cells).toHaveLength(6)
      const sides = new Set(cells.flatMap(([x1, y1, x2, y2]) => [x2 - x1, y2 - y1]))
      expect(sides.size, `viewnet ${s}`).toBe(1)
      expect(new Set(cells.map(([, y]) => y)).size).toBe(3)
      // Encuadre: las cuatro esquinas, simétricas respecto de la columna central.
      const xs = [...iconMarkup('fit', s).matchAll(/class="a"/g)]
      expect(xs).toHaveLength(4)
    }
  })

  it('«más» de la barra del celular: tres puntos iguales y equidistantes en 22 y 24 px', () => {
    for (const size of [22, 24]) {
      const ys = [...uiIconMarkup('more', size).matchAll(/M([\d.]+) ([\d.]+)h3v3h-3Z/g)].map((m) => Number(m[2]))
      expect(ys).toHaveLength(3)
      expect(ys[1] - ys[0]).toBe(ys[2] - ys[1])
      ys.forEach((y) => expect(Number.isInteger(y)).toBe(true))
    }
  })

  it('las letras de píxel ocupan píxeles enteros', () => {
    const g = makeGrid('md')
    expect(g.txt(4, 2, '10', 'f')).not.toMatch(/\.\d/)
  })
})
