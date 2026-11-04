/**
 * Fuentes de los textos de DXF/DWG: lo que un texto toma de su estilo (tabla STYLE) o de su formato (MTEXT) para verse
 * del ancho que tenía. Cota dibuja las TrueType con una fuente de las mismas medidas (Arial ↔ Liberation Sans) y las de
 * trazo (SHX) con la suya.
 */

/** Ancho de una fuente angosta (Arial Narrow) respecto de la normal. */
const NARROW = 0.82

export interface FontLook {
  /** Familia (Arial, Times New Roman…); ausente = fuente de trazo o desconocida: la de Cota. */
  font?: string
  bold?: boolean
  italic?: boolean
  /** Factor de ancho propio de la fuente (1, o 0.82 si es angosta). */
  narrow: number
  /** Fuente de un trazo (SHX): se dibuja con la de trazo de Cota. */
  shx?: boolean
}

const SHX = /^(txt|simplex|romans|romand|romant|romanc|isocp|isoct|isocpeur|isocteur|monotxt|gothic[egi]?|italic[ct]?|scripts|scriptc|complex|greek[cs]|cyril|syastro|symath|symusic|ltypeshp|gdt|amgdt|bigfont|chineset)\b/i
const FAMILIES: Array<[RegExp, string]> = [
  [/^arial/, 'Arial'],
  [/^helvetica/, 'Helvetica'],
  [/^times/, 'Times New Roman'],
  [/^cour/, 'Courier New'],
  [/^calibri/, 'Calibri'],
  [/^verdana/, 'Verdana'],
  [/^tahoma/, 'Tahoma'],
  [/^segoe ?ui/, 'Segoe UI'],
]

/** De un archivo de fuente (`arialbd.ttf`, `ARIALN.TTF`, `simplex.shx`) o de una familia (`Arial Narrow`). */
export function fontLook(name: string | undefined): FontLook {
  const n = (name ?? '').trim()
  const isFile = /\.(ttf|ttc|otf)$/i.test(n)
  if (!n) return { narrow: 1 }
  if (/\.shx$/i.test(n) || (!isFile && SHX.test(n))) return { narrow: 1, shx: true }
  const base = (n.split(/[\\/]/).pop() ?? n).replace(/\.(ttf|ttc|otf)$/i, '')
  const lower = base.toLowerCase()
  // Archivos de Arial: arial, arialbd (negrita), ariali, arialbi, arialn (angosta), arialnb, arialni, arialnbi.
  const arialFile = isFile ? /^arial(n?)(b|bd)?(i)?$/.exec(lower) : null
  const narrow = /narrow|condensed/.test(lower) || !!arialFile?.[1] ? NARROW : 1
  const bold = /bold|black|heavy/.test(lower) || !!arialFile?.[2]
  const italic = /italic|oblique/.test(lower) || !!arialFile?.[3]
  const font = FAMILIES.find(([re]) => re.test(lower))?.[1] ?? base.replace(/\b(narrow|condensed|bold|italic|regular)\b/gi, '').trim()
  return { font: font || undefined, narrow, ...(bold ? { bold } : {}), ...(italic ? { italic } : {}) }
}

/** Formato del comienzo de un MTEXT (antes del primer carácter visible): fuente, alto y ancho que valen para todo. */
export interface MtextLead {
  font?: string
  bold?: boolean
  italic?: boolean
  /** `\H2;` alto absoluto o `\H0.8x;` relativo al del MTEXT. */
  height?: number
  heightScale?: number
  /** `\W0.9;` factor de ancho. */
  width?: number
}

export function mtextLead(raw: string): MtextLead {
  const out: MtextLead = {}
  let i = 0
  while (i < raw.length) {
    if (raw[i] === '{') {
      i++
      continue
    }
    const m = /^\\([fFHWpACcQT])([^;]*);/.exec(raw.slice(i, i + 200))
    if (!m) break
    const [code, arg] = [m[1], m[2]]
    if (code === 'f' || code === 'F') {
      const parts = arg.split('|')
      out.font = parts[0]
      if (parts.includes('b1')) out.bold = true
      if (parts.includes('i1')) out.italic = true
    } else if (code === 'H') {
      const v = parseFloat(arg)
      if (v > 0) {
        if (/x$/i.test(arg)) out.heightScale = (out.heightScale ?? 1) * v
        else out.height = v
      }
    } else if (code === 'W') {
      const v = parseFloat(arg)
      if (v > 0) out.width = v
    }
    i += m[0].length
  }
  return out
}

/** Un tramo de un MTEXT con su formato (lo que no difiere del texto entero, ausente). */
export interface MtextRun {
  s: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  font?: string
  /** Alto absoluto del tramo. */
  height: number
  /** Color ACI 1–255 o `#rrggbb`; ausente = el del texto (ByLayer/ByBlock). */
  color?: number | string
}

/**
 * Tramos de un MTEXT con su formato: `{…}` agrupa, `\f` fuente (|b1 negrita, |i1 itálica), `\H` alto (`x` = relativo),
 * `\C`/`\c` color, `\L…\l` subrayado. El texto de los tramos, unido, es el de `plainMtext`.
 */
export function mtextRuns(raw: string, height: number): MtextRun[] {
  type State = Omit<MtextRun, 's'>
  let st: State = { height }
  const stack: State[] = []
  const runs: MtextRun[] = []
  let buf = ''
  const flush = () => {
    if (buf) runs.push({ s: buf, ...st })
    buf = ''
  }
  const set = (p: Partial<State>) => {
    flush()
    st = { ...st, ...p }
  }
  let i = 0
  while (i < raw.length) {
    const ch = raw[i]
    if (ch === '{' || ch === '}') {
      flush()
      if (ch === '{') stack.push({ ...st })
      else st = stack.pop() ?? st
      i++
      continue
    }
    if (ch === '^' && /[IJM ]/.test(raw[i + 1] ?? '')) {
      const k = raw[i + 1]
      buf += k === 'J' ? '\n' : k === 'I' ? '    ' : k === ' ' ? '^' : ''
      i += 2
      continue
    }
    if (ch !== '\\') {
      buf += ch
      i++
      continue
    }
    const nx = raw[i + 1] ?? ''
    if ('\\{}'.includes(nx) && nx) {
      buf += nx
      i += 2
    } else if (nx === 'P') {
      buf += '\n'
      i += 2
    } else if (nx === '~') {
      buf += ' '
      i += 2
    } else if (nx === 'U' && raw[i + 2] === '+' && /^[0-9a-f]{4}$/i.test(raw.slice(i + 3, i + 7))) {
      buf += String.fromCharCode(parseInt(raw.slice(i + 3, i + 7), 16))
      i += 7
    } else if ('LlOoKkNX'.includes(nx) && nx) {
      if (nx === 'L' || nx === 'l') set({ underline: nx === 'L' || undefined })
      i += 2
    } else if ('SfFHWpACcQT'.includes(nx) && nx) {
      const end = raw.indexOf(';', i + 2)
      if (end < 0) {
        i += 2
        continue
      }
      const arg = raw.slice(i + 2, end)
      if (nx === 'S') buf += arg.replace(/[#^]/, '/')
      else if (nx === 'f' || nx === 'F') {
        const parts = arg.split('|')
        set({ font: parts[0], bold: parts.includes('b1') || undefined, italic: parts.includes('i1') || undefined })
      } else if (nx === 'H') {
        const v = parseFloat(arg)
        if (v > 0) set({ height: /x$/i.test(arg) ? st.height * v : v })
      } else if (nx === 'C') {
        const n = Math.round(Number(arg))
        set({ color: n >= 1 && n <= 255 ? n : undefined })
      } else if (nx === 'c') {
        const n = Number(arg)
        set({ color: n > 0 ? `#${(n & 0xffffff).toString(16).padStart(6, '0').replace(/^(..)(..)(..)$/, '$3$2$1')}` : undefined })
      }
      i = end + 1
    } else {
      buf += nx
      i += 2
    }
  }
  flush()
  return runs
}
