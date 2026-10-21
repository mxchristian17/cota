import type { DimVars } from './style'

/**
 * Formato de las medidas de cota con las variables del CAD clásico: unidades (`DIMLUNIT`),
 * precisión (`DIMDEC`), separador (`DIMDSEP`), redondeo (`DIMRND`), ceros (`DIMZIN`), factor
 * (`DIMLFAC`), prefijo/sufijo (`DIMPOST`), ángulos (`DIMAUNIT`/`DIMADEC`/`DIMAZIN`), unidades
 * alternativas (`DIMALT…`) y tolerancias (`DIMTOL`/`DIMLIM`).
 */

const roundTo = (v: number, step: number): number => (step > 0 ? Math.round(v / step) * step : v)

/** Suprime ceros según `zin` (bit 4: inicial, bit 8: finales) en un número ya formateado con punto. */
function zeros(s: string, zin: number): string {
  let out = s
  if (zin & 8 && out.includes('.')) out = out.replace(/0+$/, '').replace(/\.$/, '')
  if (zin & 4) out = out.replace(/^(-?)0\./, '$1.')
  return out
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a
}

/** Fracción de pulgada con denominador 2^dec (fraccional y arquitectura). */
function fraction(v: number, dec: number): string {
  const den = 2 ** Math.max(0, Math.min(8, dec))
  const sign = v < 0 ? '-' : ''
  const a = Math.abs(v)
  let whole = Math.floor(a)
  let num = Math.round((a - whole) * den)
  if (num === den) {
    whole++
    num = 0
  }
  if (num === 0) return `${sign}${whole}`
  const g = gcd(num, den)
  return whole ? `${sign}${whole} ${num / g}/${den / g}` : `${sign}${num / g}/${den / g}`
}

/** Número lineal en el formato pedido (sin prefijos), con punto como separador. */
function linearNumber(v: number, unit: number, dec: number, zin: number): string {
  switch (unit) {
    case 1: {
      const s = v.toExponential(dec)
      const [m, e] = s.split('e')
      return `${zeros(m, zin)}E${e[0] === '-' ? '-' : '+'}${e.replace(/^[+-]/, '').padStart(2, '0')}`
    }
    case 3: {
      // Ingeniería: pies y pulgadas decimales (la unidad de dibujo es la pulgada).
      const sign = v < 0 ? '-' : ''
      const a = Math.abs(v)
      const ft = Math.floor(a / 12)
      const inch = zeros((a - ft * 12).toFixed(dec), zin & 8)
      return `${sign}${ft}'-${inch}"`
    }
    case 4: {
      const sign = v < 0 ? '-' : ''
      const a = Math.abs(v)
      const ft = Math.floor(a / 12)
      return `${sign}${ft}'-${fraction(a - ft * 12, dec)}"`
    }
    case 5:
      return fraction(v, dec)
    default:
      return zeros(v.toFixed(dec), zin)
  }
}

/** Aplica `DIMPOST`: `<>` es la medida; sin `<>` el texto es un sufijo. */
export function applyPost(value: string, post: string): string {
  if (!post) return value
  return post.includes('<>') ? post.replace('<>', value) : value + post
}

/** Medida lineal primaria formateada (con factor, redondeo, ceros y separador). */
export function formatLinear(raw: number, s: DimVars): string {
  const v = roundTo(raw * s.DIMLFAC, s.DIMRND)
  const txt = linearNumber(v, s.DIMLUNIT, s.DIMDEC, s.DIMZIN)
  return s.DIMLUNIT === 2 || s.DIMLUNIT === 6 ? txt.replace('.', s.DIMDSEP || '.') : txt
}

/** Medida alternativa entre corchetes (`DIMALT`). */
export function formatAlternate(raw: number, s: DimVars): string {
  const v = roundTo(raw * s.DIMLFAC * s.DIMALTF, s.DIMALTRND)
  const txt = linearNumber(v, s.DIMALTU, s.DIMALTD, s.DIMALTZ)
  const sep = s.DIMALTU === 2 || s.DIMALTU === 6 ? txt.replace('.', s.DIMDSEP || '.') : txt
  return `[${applyPost(sep, s.DIMAPOST)}]`
}

/** Ángulo (grados) en el formato de `DIMAUNIT`. */
export function formatAngle(deg: number, s: DimVars): string {
  const dec = s.DIMADEC
  switch (s.DIMAUNIT) {
    case 1: {
      // Grados/minutos/segundos: DIMADEC 0 → g, 1–2 → g m, ≥3 → g m s.
      const total = Math.round(Math.abs(deg) * 3600 * (dec >= 5 ? 10 ** (dec - 4) : 1)) / (dec >= 5 ? 10 ** (dec - 4) : 1)
      let d = Math.floor(total / 3600)
      let m = Math.floor((total - d * 3600) / 60)
      const sec = total - d * 3600 - m * 60
      const sign = deg < 0 ? '-' : ''
      if (dec === 0) return `${sign}${Math.round(Math.abs(deg))}°`
      if (dec <= 2) {
        m = Math.round((Math.abs(deg) - d) * 60)
        if (m === 60) {
          d++
          m = 0
        }
        return `${sign}${d}°${m}'`
      }
      const secTxt = dec >= 5 ? sec.toFixed(dec - 4) : String(Math.round(sec))
      return `${sign}${d}°${m}'${secTxt}"`
    }
    case 2:
      return `${zeros(((deg * 400) / 360).toFixed(dec), s.DIMAZIN & 3 ? 8 : 0).replace('.', s.DIMDSEP || '.')}g`
    case 3:
      return `${zeros(((deg * Math.PI) / 180).toFixed(dec), s.DIMAZIN & 3 ? 8 : 0).replace('.', s.DIMDSEP || '.')}r`
    default: {
      // DIMAZIN 1: ceros iniciales, 2: finales (como DIMZIN 4/8 en lineales).
      const zin = (s.DIMAZIN & 1 ? 4 : 0) | (s.DIMAZIN & 2 ? 8 : 0)
      return `${zeros(deg.toFixed(dec), zin).replace('.', s.DIMDSEP || '.')}°`
    }
  }
}

/** Tolerancia con signo (`+0,1` / `-0,05` / `0`), con su precisión y supresión de ceros. */
function tol(v: number, s: DimVars, sign: '+' | '-'): string {
  const t = zeros((Math.abs(v) * s.DIMLFAC).toFixed(s.DIMTDEC), s.DIMTZIN).replace('.', s.DIMDSEP || '.')
  if (Math.abs(v) < 1e-12) return '0'
  return `${sign}${t}`
}

/** Contenido de texto de una cota: valor principal y, si corresponde, tolerancia apilada. */
export interface DimTextContent {
  /** Texto principal (con prefijos, `DIMPOST`, alternas y tolerancia simétrica en línea). */
  main: string
  /** Tolerancia o límites apilados a la derecha (arriba, abajo). */
  stack?: [string, string]
  /** ¿Va en un recuadro? (cota básica: `DIMGAP` < 0). */
  boxed: boolean
}

/**
 * Arma el texto de una cota: `prefix` (R, ⌀) + medida formateada + alternas + tolerancias. `measured`
 * ya viene formateado (lineal o angular); `rawLinear` es la medida lineal para alternas/límites.
 */
export function dimTextContent(measured: string, rawLinear: number | null, s: DimVars, override: string | null | undefined, prefix = ''): DimTextContent {
  const boxed = s.DIMGAP < 0
  let value = prefix + applyPost(measured, s.DIMPOST)
  if (s.DIMALT && rawLinear !== null) value += ' ' + formatAlternate(rawLinear, s)
  let stack: [string, string] | undefined
  if (rawLinear !== null && s.DIMLIM) {
    // Límites: medida + tolerancia arriba y medida − tolerancia abajo, en lugar del valor.
    const up = formatLinear(rawLinear + s.DIMTP / (s.DIMLFAC || 1), s)
    const lo = formatLinear(rawLinear - s.DIMTM / (s.DIMLFAC || 1), s)
    value = prefix
    stack = [up, lo]
  } else if (s.DIMTOL) {
    if (Math.abs(s.DIMTP - s.DIMTM) < 1e-12 && s.DIMTP > 0) value += ` ±${tol(s.DIMTP, s, '+').replace('+', '')}`
    else stack = [tol(s.DIMTP, s, '+'), tol(s.DIMTM, s, '-')]
  }
  if (override !== undefined && override !== null && override !== '') {
    // Texto manual: `<>` es la medida; un espacio solo suprime el texto (CAD clásico).
    const main = override.trim() === '' ? '' : override.replace('<>', value)
    return { main, stack: override.includes('<>') ? stack : undefined, boxed }
  }
  return { main: value, stack, boxed }
}
