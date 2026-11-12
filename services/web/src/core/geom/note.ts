import type { Vec3 } from '../math'
import type { NoteColor, NoteProps } from '../document/types'

/** Papel de cada color de nota rápida y su texto. */
export const NOTE_COLORS: Record<NoteColor, { paper: string; fold: string; ink: string }> = {
  yellow: { paper: '#fff59d', fold: '#f0dc5a', ink: '#3b3200' },
  violet: { paper: '#d7c6f2', fold: '#b9a2e3', ink: '#2a1a47' },
  pink: { paper: '#f8c3d8', fold: '#ec9dbd', ink: '#4a1028' },
  green: { paper: '#cdeaa6', fold: '#a9d672', ink: '#1f3a06' },
  blue: { paper: '#b9e3f8', fold: '#86cbee', ink: '#08324a' },
  orange: { paper: '#ffd29a', fold: '#f7b25e', ink: '#4a2a00' },
}
export const NOTE_COLOR_NAMES = Object.keys(NOTE_COLORS) as NoteColor[]

/** Punto del papel en el mundo: `s` y `t` son fracciones del ancho y del alto (0,0 = esquina inferior izquierda). */
export function notePoint(p: NoteProps, s: number, t: number): Vec3 {
  const a = s * p.size[0]
  const b = t * p.size[1]
  return [p.origin[0] + p.u[0] * a + p.v[0] * b, p.origin[1] + p.u[1] * a + p.v[1] * b, p.origin[2] + p.u[2] * a + p.v[2] * b]
}

/** Contorno del papel, cerrado (el último punto repite el primero). */
export function noteRing(p: NoteProps): Vec3[] {
  return [notePoint(p, 0, 0), notePoint(p, 1, 0), notePoint(p, 1, 1), notePoint(p, 0, 1), notePoint(p, 0, 0)]
}

/** Puntos de los grips del borde: esquinas (end) y medios (mid), con su fracción. */
export const NOTE_ANCHORS: Array<[number, number]> = [
  [0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5],
]
/** El grip que agranda el papel (esquina inferior derecha); los demás sacan un leader. */
export const NOTE_RESIZE_ANCHOR = 2

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])

/** Nota transformada (mover, girar, escalar, reflejar, insertar en un bloque): esquinas, ejes y leaders. */
export function mapNote(p: NoteProps, f: (v: Vec3) => Vec3): NoteProps {
  const o = f(p.origin)
  const a = sub(f(notePoint(p, 1, 0)), o)
  const b = sub(f(notePoint(p, 0, 1)), o)
  const w = len(a) || p.size[0]
  const h = len(b) || p.size[1]
  return {
    ...p,
    origin: o,
    u: len(a) ? [a[0] / w, a[1] / w, a[2] / w] : p.u,
    v: len(b) ? [b[0] / h, b[1] / h, b[2] / h] : p.v,
    size: [w, h],
    ...(p.leaders ? { leaders: p.leaders.map((l) => ({ at: [l.at[0], l.at[1]] as [number, number], to: f(l.to) })) } : {}),
  }
}

/** Renglones del texto cortados para que entren en `cols` caracteres. */
function wrap(text: string, cols: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/)) {
      if (!word) continue
      if (!line) line = word
      else if ((line + ' ' + word).length <= cols) line += ' ' + word
      else {
        out.push(line)
        line = word
      }
    }
    out.push(line)
  }
  return out
}

/**
 * Texto ajustado al papel: el tamaño de letra (fracción del alto del papel) y los renglones más grandes que entran en
 * el área útil, que es el papel menos un margen y la franja de arriba con la cruz. `aspect` = ancho/alto de un carácter.
 */
export function fitNoteText(text: string, size: [number, number], aspect = 0.55): { lines: string[]; em: number } {
  const [w, h] = size
  const innerW = w * 0.86
  const innerH = h * 0.72
  if (!text.trim() || innerW <= 0 || innerH <= 0) return { lines: [], em: 0 }
  let best = { lines: [text], em: 0 }
  for (let cols = 4; cols <= 200; cols++) {
    const lines = wrap(text, cols)
    const longest = Math.max(...lines.map((l) => l.length), 1)
    const em = Math.min(innerW / (longest * aspect), innerH / (lines.length * 1.25))
    if (em > best.em) best = { lines, em }
    if (longest < cols - 8) break
  }
  return { lines: best.lines, em: best.em / h }
}

/** Nota reflejada que se sigue leyendo al derecho (MIRRTEXT 0): el papel queda en su lugar con el ancho invertido. */
export function unflipNote(p: NoteProps): NoteProps {
  return {
    ...p,
    origin: notePoint(p, 1, 0),
    u: [-p.u[0], -p.u[1], -p.u[2]],
    ...(p.leaders ? { leaders: p.leaders.map((l) => ({ at: [1 - l.at[0], l.at[1]] as [number, number], to: l.to })) } : {}),
  }
}

const isVec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x))

/** Valida una nota leída de un `.cota`: devuelve sus datos limpios, o null si no se puede usar. */
export function sanitizeNote(p: unknown): NoteProps | null {
  const o = p as Partial<NoteProps> | null
  if (!o || !isVec(o.origin) || !isVec(o.u) || !isVec(o.v)) return null
  const lu = Math.hypot(...o.u)
  const lv = Math.hypot(...o.v)
  const size = o.size
  if (!lu || !lv || !Array.isArray(size) || !(size[0] > 0) || !(size[1] > 0) || !Number.isFinite(size[0] + size[1])) return null
  const leaders = Array.isArray(o.leaders)
    ? o.leaders.filter((l) => l && isVec(l.to) && Array.isArray(l.at) && l.at.length === 2 && l.at.every((x) => typeof x === 'number' && x >= 0 && x <= 1))
    : []
  return {
    origin: o.origin,
    u: [o.u[0] / lu, o.u[1] / lu, o.u[2] / lu],
    v: [o.v[0] / lv, o.v[1] / lv, o.v[2] / lv],
    size: [size[0], size[1]],
    text: typeof o.text === 'string' ? o.text : '',
    color: o.color && o.color in NOTE_COLORS ? o.color : 'yellow',
    ...(leaders.length ? { leaders: leaders.map((l) => ({ at: [l.at[0], l.at[1]] as [number, number], to: l.to })) } : {}),
  }
}

/** ¿El punto `pt` (sobre el plano de la nota) cae en la cruz de cerrar, arriba a la derecha? */
export function noteCloseHit(p: NoteProps, pt: Vec3): boolean {
  const d: Vec3 = [pt[0] - p.origin[0], pt[1] - p.origin[1], pt[2] - p.origin[2]]
  const a = d[0] * p.u[0] + d[1] * p.u[1] + d[2] * p.u[2]
  const b = d[0] * p.v[0] + d[1] * p.v[1] + d[2] * p.v[2]
  const [w, h] = p.size
  const k = Math.min(w, h) * 0.18
  return a >= w - k && a <= w && b >= h - k && b <= h
}
