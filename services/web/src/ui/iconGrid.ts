/**
 * Motor de íconos en grilla de píxeles. Cada ícono se dibuja una vez en una grilla de diseño de 16 × 16 y se
 * rasteriza a mano para cada tamaño (16, 20 o 24 px): el SVG de cada tamaño tiene su propio `viewBox` igual a su
 * tamaño en píxeles (nunca se escala) y cada coordenada cae en la grilla de ese tamaño. Así un trazo de 1 px queda
 * en una sola columna de píxeles (nítido a 1x, y a 2x ocupa dos píxeles físicos enteros).
 *
 * Convención de coordenadas de diseño:
 * - `n.5` es el centro de un píxel: los trazos de 1 px van ahí (rectas horizontales y verticales nítidas).
 * - un entero es el borde entre píxeles: los rellenos (`box`) y los trazos de 2 px (`w`) van ahí.
 * - cualquier otro valor (2.3, 7.8) no se ajusta: sirve para puntos de control y diagonales.
 * El ajuste redondea hacia el centro del ícono cuando hay empate, así lo simétrico sigue simétrico.
 *
 * Clases (los colores salen de la hoja de estilos): sin clase, trazo del color del texto; `a` trazo de acento; `f`
 * relleno de acento; `fa` relleno de acento translúcido con trazo de acento; `ft` relleno translúcido del color del
 * texto con su trazo; `s` relleno del color del texto; `bg` relleno del fondo de la barra; `d` trazo de guiones
 * (lo que se quita o lo que fue); `cl` línea de eje; `w` trazo de 2 px.
 */

export type IconSize = 'sm' | 'md' | 'lg'
export const ICON_SIZES: readonly IconSize[] = ['sm', 'md', 'lg']
/** Tamaño del ícono en píxeles CSS. */
export const ICON_PX: Record<IconSize, number> = { sm: 16, md: 20, lg: 24 }

export interface Grid {
  /** Tamaño real en píxeles (16, 20 o 24). */
  S: number
  /** ¿Tamaño mediano o más (20 px)? Lleva el detalle que no entra en 16. */
  md: boolean
  /** ¿Tamaño grande (24 px)? */
  lg: boolean
  /** Elige un valor por tamaño. */
  v<T>(sm: T, md: T, lg?: T): T
  /** Recta. */
  l(x1: number, y1: number, x2: number, y2: number, c?: string): string
  /** Polilínea abierta (`[x1, y1, x2, y2, …]`). */
  p(pts: number[], c?: string): string
  /** Polígono cerrado. */
  pg(pts: number[], c?: string): string
  /** Rectángulo por las esquinas (centros de trazo). */
  r(x1: number, y1: number, x2: number, y2: number, c?: string): string
  /** Rectángulo relleno por los bordes de píxel (`f`, `s`, `bg`). */
  box(x1: number, y1: number, x2: number, y2: number, c?: string): string
  /** Círculo: los extremos (izquierda, derecha, arriba, abajo) caen en la grilla. */
  c(cx: number, cy: number, r: number, c?: string): string
  /** Elipse alineada a los ejes. */
  e(cx: number, cy: number, rx: number, ry: number, c?: string): string
  /** Trazado con comandos absolutos (M L H V C Q A Z). */
  d(path: string, c?: string): string
  /** Grip cuadrado (punto designado), centrado en un píxel. */
  grip(x: number, y: number, c?: string): string
  /** Punta de flecha rellena con la punta en (x, y), hacia `deg` grados (0 = derecha, 90 = abajo); `small` para ciclos. */
  arrow(x: number, y: number, deg: number, c?: string, small?: boolean): string
  /** Texto en letras de píxel (3 × 5) con la esquina superior izquierda en el píxel (x, y). */
  txt(x: number, y: number, s: string, c?: string): string
  /** Contorno de 1 px que cubre los píxeles reales [x, x + w) × [y, y + h) (para series de piezas iguales). */
  rpx(x: number, y: number, w: number, h: number, c?: string): string
}

export type IconDraw = (g: Grid) => string

const EPS = 1e-6
const isHalf = (u: number) => Math.abs(u - Math.floor(u) - 0.5) < EPS
const isInt = (u: number) => Math.abs(u - Math.round(u)) < EPS
const fmt = (v: number) => String(Number(v.toFixed(3)))

/** Redondeo que, en el empate, va hacia `center` (así una figura simétrica sigue simétrica). */
function roundSym(x: number, center: number): number {
  const f = x - Math.floor(x)
  if (Math.abs(f - 0.5) < EPS) return x < center ? Math.ceil(x) : Math.floor(x)
  return Math.round(x)
}

/** Clases de sólo relleno: se ajustan a bordes de píxel. */
const FILL_ONLY = /(^|\s)(f|s|bg)(\s|$)/
const att = (c?: string) => (c ? ` class="${c}"` : '')

/** Letras de píxel de 3 × 5 (`#` = encendido), lo justo para rótulos de los íconos. */
const GLYPHS: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '#': ['.#.#.', '#####', '.#.#.', '#####', '.#.#.'],
  x: ['...', '#.#', '.#.', '#.#', '...'],
}

/**
 * Grilla de un tamaño. `ax`/`ay`: centro de simetría del dibujo en cada eje (7.5 = la columna 7, lo habitual en una
 * grilla par con trazos de 1 px; 8 = el centro real, para marcos de lado a lado). A 20 y 24 px una columna de diseño
 * mide 1.25 o 1.5 píxeles y no se puede conservar a la vez lo simétrico respecto de 7.5 y de 8: cada ícono declara el
 * suyo y el ajuste lo conserva.
 */
export function makeGrid(size: IconSize | number, ax = 7.5, ay = 7.5): Grid {
  const S = typeof size === 'number' ? size : ICON_PX[size]
  const k = S / 16
  const md = S >= 20
  const lg = S >= 24
  /** Coordenada de diseño → píxeles, anclada en el centro del eje. `even`: trazo par o relleno (bordes de píxel). */
  const snapAxis = (A: number) => {
    const Apx = S / 2 + (A - 8)
    return (u: number, even: boolean): number => {
      const v = Apx + (u - A) * k
      if (isHalf(u) && !even) return roundSym(v - 0.5, Apx - 0.5) + 0.5
      if (isHalf(u) || isInt(u)) return roundSym(v, Apx)
      return v
    }
  }
  const SX = snapAxis(ax)
  const SY = snapAxis(ay)
  /** Sin ajuste (puntos de control, ubicación de las letras). */
  const FX = (u: number) => S / 2 + (ax - 8) + (u - ax) * k
  const FY = (u: number) => S / 2 + (ay - 8) + (u - ay) * k
  /** Radio para un centro ya ajustado: entero si el centro cae en el medio de un píxel, n.5 si cae en un borde. */
  const radius = (center: number, r: number, even: boolean): number => {
    const onCenter = isHalf(center)
    if (onCenter !== even) return Math.max(1, Math.round(r * k))
    return Math.max(0.5, Math.round(r * k - 0.5) + 0.5)
  }
  const evenOf = (c?: string) => !!c && (FILL_ONLY.test(c) || /(^|\s)w(\s|$)/.test(c))
  const dashed = (c?: string) => !!c && /(^|\s)(d|cl)(\s|$)/.test(c)
  const dashAttr = (c?: string): string => {
    if (!c) return ''
    if (/(^|\s)cl(\s|$)/.test(c)) return ` stroke-dasharray="${md ? (lg ? '6 2 1 2' : '5 1 1 1') : '4 1 1 1'}"`
    if (/(^|\s)d(\s|$)/.test(c)) return ` stroke-dasharray="${lg ? '3 2' : md ? '2 2' : '2 1'}"`
    return ''
  }

  const l: Grid['l'] = (x1, y1, x2, y2, c) => {
    const e = evenOf(c)
    let a = SX(x1, e)
    let b = SY(y1, e)
    let cc = SX(x2, e)
    let dd = SY(y2, e)
    // Las de guiones van con extremos rectos (butt): se alargan medio píxel para cubrir lo mismo que una llena.
    if (dashed(c)) {
      const len = Math.hypot(cc - a, dd - b) || 1
      const ux = ((cc - a) / len) * 0.5
      const uy = ((dd - b) / len) * 0.5
      if (Math.abs(ux) < EPS || Math.abs(uy) < EPS) {
        a -= ux
        b -= uy
        cc += ux
        dd += uy
      }
    }
    return `<line x1="${fmt(a)}" y1="${fmt(b)}" x2="${fmt(cc)}" y2="${fmt(dd)}"${att(c)}${dashAttr(c)}/>`
  }
  const pts = (p: number[], e: boolean) => {
    const out: string[] = []
    for (let i = 0; i < p.length; i += 2) out.push(`${i ? 'L' : 'M'}${fmt(SX(p[i], e))} ${fmt(SY(p[i + 1], e))}`)
    return out.join('')
  }
  const p: Grid['p'] = (q, c) => `<path d="${pts(q, evenOf(c))}"${att(c)}${dashAttr(c)}/>`
  const pg: Grid['pg'] = (q, c) => `<path d="${pts(q, evenOf(c))}Z"${att(c)}${dashAttr(c)}/>`
  const r: Grid['r'] = (x1, y1, x2, y2, c) => {
    const e = evenOf(c)
    const [a, b, cc, dd] = [SX(x1, e), SY(y1, e), SX(x2, e), SY(y2, e)]
    return `<path d="M${fmt(a)} ${fmt(b)}H${fmt(cc)}V${fmt(dd)}H${fmt(a)}Z"${att(c)}${dashAttr(c)}/>`
  }
  const box: Grid['box'] = (x1, y1, x2, y2, c = 's') => {
    const [a, b, cc, dd] = [SX(x1, true), SY(y1, true), SX(x2, true), SY(y2, true)]
    return `<path d="M${fmt(a)} ${fmt(b)}H${fmt(cc)}V${fmt(dd)}H${fmt(a)}Z"${att(c)}/>`
  }
  const e: Grid['e'] = (cx, cy, rx, ry, c) => {
    // Primero el centro (así queda concéntrico con su cruz o con otro círculo) y después el radio, de modo que los
    // cuatro extremos caigan en la grilla.
    // El centro se ajusta según el ancho del trazo; el radio, para que el borde (del trazo o del relleno) quede nítido.
    const wide = !!c && /(^|\s)w(\s|$)/.test(c)
    const fillOnly = !!c && FILL_ONLY.test(c)
    const X = SX(cx, wide)
    const Y = SY(cy, wide)
    const RX = radius(X, rx, wide || fillOnly)
    const RY = radius(Y, ry, wide || fillOnly)
    if (Math.abs(RX - RY) < EPS) return `<circle cx="${fmt(X)}" cy="${fmt(Y)}" r="${fmt(RX)}"${att(c)}${dashAttr(c)}/>`
    return `<ellipse cx="${fmt(X)}" cy="${fmt(Y)}" rx="${fmt(RX)}" ry="${fmt(RY)}"${att(c)}${dashAttr(c)}/>`
  }
  const circle: Grid['c'] = (cx, cy, rr, c) => e(cx, cy, rr, rr, c)

  const d: Grid['d'] = (path, c) => {
    const ev = evenOf(c)
    const tok = path.match(/[MLHVCQAZ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? []
    const out: string[] = []
    let i = 0
    let cmd = ''
    const num = () => Number(tok[i++])
    const P = () => `${fmt(SX(num(), ev))} ${fmt(SY(num(), ev))}`
    const F = () => `${fmt(FX(num()))} ${fmt(FY(num()))}`
    while (i < tok.length) {
      if (/[MLHVCQAZ]/.test(tok[i])) cmd = tok[i++]
      else if (cmd === 'M') cmd = 'L'
      switch (cmd) {
        case 'M':
        case 'L':
          out.push(cmd + P())
          break
        case 'H':
          out.push(cmd + fmt(SX(num(), ev)))
          break
        case 'V':
          out.push(cmd + fmt(SY(num(), ev)))
          break
        case 'C':
          out.push(`C${F()} ${F()} ${P()}`)
          break
        case 'Q':
          out.push(`Q${F()} ${P()}`)
          break
        case 'A': {
          const rx = num() * k
          const ry = num() * k
          const rot = num()
          const large = num()
          const sweep = num()
          out.push(`A${fmt(rx)} ${fmt(ry)} ${fmt(rot)} ${large} ${sweep} ${P()}`)
          break
        }
        case 'Z':
          out.push('Z')
          break
        default:
          i++
      }
    }
    return `<path d="${out.join('')}"${att(c)}${dashAttr(c)}/>`
  }

  const grip: Grid['grip'] = (x, y, c = 's') => {
    const X = SX(x, false)
    const Y = SY(y, false)
    // 3 px en todos los tamaños (más grande tapa el dibujo), centrado en el píxel del punto.
    const h = 1.5
    return `<path d="M${fmt(X - h)} ${fmt(Y - h)}h${fmt(2 * h)}v${fmt(2 * h)}h${fmt(-2 * h)}Z"${att(c)}/>`
  }

  const arrow: Grid['arrow'] = (x, y, deg, c = 'f', small = false) => {
    const [L, H] = small ? (lg ? [4, 2] : [3, 1.5]) : lg ? [5, 2.5] : md ? [4, 2] : [3, 1.5]
    const X = SX(x, false)
    const Y = SY(y, false)
    const a = (deg * Math.PI) / 180
    const ux = Math.cos(a)
    const uy = Math.sin(a)
    // La punta llega al borde del píxel de (x, y): así la base de una flecha horizontal o vertical cae en un borde.
    const axis = Math.abs(ux) < EPS || Math.abs(uy) < EPS
    const tx = X + (axis ? ux * 0.5 : ux * 0.35)
    const ty = Y + (axis ? uy * 0.5 : uy * 0.35)
    const bx = tx - ux * L
    const by = ty - uy * L
    const px = -uy * H
    const py = ux * H
    return `<path d="M${fmt(tx)} ${fmt(ty)}L${fmt(bx + px)} ${fmt(by + py)}L${fmt(bx - px)} ${fmt(by - py)}Z"${att(c)}/>`
  }

  const txt: Grid['txt'] = (x, y, s, c = 's') => {
    const rows = [...s].map((ch) => GLYPHS[ch] ?? GLYPHS.X)
    const width = rows.reduce((w, g, i) => w + g[0].length + (i ? 1 : 0), 0)
    const X0 = Math.round(FX(x + width / 2) - width / 2)
    const Y0 = Math.round(FY(y + 2.5) - 2.5)
    let cx = X0
    const parts: string[] = []
    for (const g of rows) {
      g.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) if (row[rx] === '#') parts.push(`M${cx + rx} ${Y0 + ry}h1v1h-1Z`)
      })
      cx += g[0].length + 1
    }
    return `<path d="${parts.join('')}"${att(c)}/>`
  }

  const rpx: Grid['rpx'] = (x, y, w, h, c) => `<path d="M${x + 0.5} ${y + 0.5}H${x + w - 0.5}V${y + h - 0.5}H${x + 0.5}Z"${att(c)}/>`

  return {
    S,
    md,
    lg,
    v: (a, b, cc) => (lg && cc !== undefined ? cc : md ? b : a),
    l,
    p,
    pg,
    r,
    box,
    c: circle,
    e,
    d,
    grip,
    arrow,
    txt,
    rpx,
  }
}

const GRIDS = new Map<string, Grid>()
/** Grilla (memorizada) de un tamaño con su centro de simetría. */
export function gridFor(size: IconSize | number, ax = 7.5, ay = 7.5): Grid {
  const key = `${size}:${ax}:${ay}`
  let g = GRIDS.get(key)
  if (!g) GRIDS.set(key, (g = makeGrid(size, ax, ay)))
  return g
}

/** ¿Es un tamaño de ícono válido? (preferencias guardadas). */
export const isIconSize = (v: unknown): v is IconSize => v === 'sm' || v === 'md' || v === 'lg'
