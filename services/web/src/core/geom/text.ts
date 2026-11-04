import { arcBasis } from './arc'
import type { Vec3 } from '../math'
import type { AttdefProps, TextProps } from '../document/types'

/** Aspecto aproximado (ancho/alto) de una glifa monoespaciada, para estimar la caja. */
const GLYPH_ASPECT = 0.6
/** Lo mismo para una fuente proporcional (Arial y similares: el promedio de un texto en mayúsculas y minúsculas). */
const PROPORTIONAL_ASPECT = 0.55
/** Interlineado (alto de línea / alto de texto). */
export const LINE_SPACING = 1.35
/** Distancia de la parte de arriba de la caja a la línea base del primer renglón, en altos de texto. */
export const BASELINE_DROP = LINE_SPACING - 0.25

/** Sólo los campos con valor (los ausentes no se escriben en el dibujo). */
const defined = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>

/**
 * Familia CSS de una fuente de dibujo, con las que tienen sus mismas medidas como alternativa (Liberation en Linux): así
 * un texto ocupa en pantalla lo que ocupaba en el plano.
 */
export function cssFontStack(font: string): string {
  const f = font.toLowerCase()
  if (/^(arial|helvetica)/.test(f)) return 'Arial, "Liberation Sans", Helvetica, sans-serif'
  if (/^times/.test(f)) return '"Times New Roman", "Liberation Serif", Times, serif'
  if (/^cour/.test(f)) return '"Courier New", "Liberation Mono", monospace'
  return `"${font.replace(/"/g, '')}", Arial, "Liberation Sans", sans-serif`
}

const addv = (p: Vec3, q: Vec3, s = 1): Vec3 => [p[0] + q[0] * s, p[1] + q[1] * s, p[2] + q[2] * s]

/** Líneas del texto (separadas por `\n`). */
/** Un ATTDEF suelto se dibuja (y se mide) como un texto con su tag, como el CAD clásico. */
export function attdefText(p: AttdefProps): TextProps {
  const { font, bold, italic, widthFactor } = p
  return { position: p.position, text: p.tag, height: p.height, rotation: p.rotation, justify: p.justify, normal: p.normal, ...defined({ font, bold, italic, widthFactor }) }
}

export function textLines(t: TextProps): string[] {
  return (t.text || '').split('\n')
}

/** Base ortonormal (u0,v0) del plano ⟂ normal; para normal=+Z da (X, Y). */
/**
 * Base del plano del texto: la misma de arcos y cotas (`arcBasis`), así la rotación 0 corre por la
 * X de las UCS ortogonales (Front, Left…) y coincide con el OCS de DXF tras la conversión.
 */
function planeBasis(n: Vec3): [Vec3, Vec3] {
  const b = arcBasis(n && (n[0] || n[1] || n[2]) ? n : [0, 0, 1])
  return [b.u, b.v]
}

/** Ejes del texto en mundo: `u` (dirección de la línea, según `rotation`) y `v` (hacia arriba). */
export function textAxes(t: TextProps): { u: Vec3; v: Vec3 } {
  const [u0, v0] = planeBasis(t.normal ?? [0, 0, 1])
  const c = Math.cos(t.rotation)
  const s = Math.sin(t.rotation)
  return {
    u: [u0[0] * c + v0[0] * s, u0[1] * c + v0[1] * s, u0[2] * c + v0[2] * s],
    v: [-u0[0] * s + v0[0] * c, -u0[1] * s + v0[1] * c, -u0[2] * s + v0[2] * c],
  }
}

/** Ancho/alto de la caja del texto (en unidades de mundo). */
export function textSize(t: TextProps): { width: number; height: number } {
  const lines = textLines(t)
  const cols = lines.reduce((m, l) => Math.max(m, l.length), 1)
  return { width: cols * t.height * (t.font ? PROPORTIONAL_ASPECT : GLYPH_ASPECT) * (t.widthFactor ?? 1), height: lines.length * t.height * LINE_SPACING }
}

/** Punto de arriba de la caja del texto (sobre la línea de `position`): para TEXT, una línea base más arriba. */
export function textTop(t: TextProps): Vec3 {
  return t.kind === 'text' ? addv(t.position, textAxes(t).v, t.height * BASELINE_DROP) : t.position
}

/** 4 esquinas de la caja del texto en mundo (para bounds/selección/pick), desde arriba-izquierda. */
export function textCorners(t: TextProps): Vec3[] {
  const { u, v } = textAxes(t)
  const { width, height } = textSize(t)
  const off = t.justify === 'center' ? -width / 2 : t.justify === 'right' ? -width : 0
  const tl = addv(textTop(t), u, off)
  const tr = addv(tl, u, width)
  const br = addv(tr, v, -height)
  const bl = addv(tl, v, -height)
  return [tl, tr, br, bl]
}

/** Puntos de snap del texto: inserción + esquinas de la caja. */
export function textSnapPoints(t: TextProps): Vec3[] {
  return [t.position, ...textCorners(t)]
}
