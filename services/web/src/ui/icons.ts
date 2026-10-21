/**
 * Íconos de las barras de herramientas: dibujos de línea propios en una grilla de 16 × 16, con el trazo en el
 * color del texto y lo que el comando crea o cambia en el color de acento (`--icon-accent`). Son marcado SVG
 * estático (sin datos del usuario); `ToolIcon` los pinta. Clases: `a` trazo de acento, `f` relleno de acento,
 * `fa` relleno de acento translúcido, `s` relleno del color del texto, `d` trazo punteado, `cl` línea de eje,
 * `w` trazo grueso, `bg` relleno del fondo de la barra, `t`/`ta` letras.
 */

const cls = (c?: string) => (c ? ` class="${c}"` : '')
const n = (v: number) => Number(v.toFixed(2))
const L = (x1: number, y1: number, x2: number, y2: number, c?: string) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${cls(c)}/>`
const P = (d: string, c?: string) => `<path d="${d}"${cls(c)}/>`
const C = (cx: number, cy: number, r: number, c?: string) => `<circle cx="${cx}" cy="${cy}" r="${r}"${cls(c)}/>`
const E = (cx: number, cy: number, rx: number, ry: number, c?: string) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${cls(c)}/>`
const R = (x: number, y: number, w: number, h: number, c?: string, r = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"${r ? ` rx="${r}"` : ''}${cls(c)}/>`
const T = (x: number, y: number, s: string, size = 7, c = 't') => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle"${cls(c)}>${s}</text>`
const G = (transform: string, inner: string) => `<g transform="${transform}">${inner}</g>`
/** Grip cuadrado (extremos y vértices). */
const sq = (x: number, y: number, c = 'a') => R(n(x - 1.1), n(y - 1.1), 2.2, 2.2, c)
/** Punta de flecha rellena con la punta en (x, y), apuntando en `deg` grados (0 = derecha, 90 = abajo). */
function arrow(x: number, y: number, deg: number, c = 'f', len = 2.8, half = 1.2): string {
  const a = (deg * Math.PI) / 180
  const bx = x - len * Math.cos(a)
  const by = y - len * Math.sin(a)
  const px = -Math.sin(a) * half
  const py = Math.cos(a) * half
  return P(`M${n(x)} ${n(y)}L${n(bx + px)} ${n(by + py)}L${n(bx - px)} ${n(by - py)}Z`, c)
}
/** Cota horizontal entre x1 y x2: líneas de referencia desde y0 y línea de cota en y. */
const hdim = (x1: number, x2: number, y0: number, y: number, c = 'a') =>
  L(x1, y0, x1, y + 1.5) + L(x2, y0, x2, y + 1.5) + L(x1, y, x2, y, c) + arrow(x1, y, 180) + arrow(x2, y, 0)
/** Cota vertical entre y1 e y2 con la línea de cota en x. */
const vdim = (y1: number, y2: number, x0: number, x: number, c = 'a') =>
  L(x0, y1, x - 1.5, y1) + L(x0, y2, x - 1.5, y2) + L(x, y1, x, y2, c) + arrow(x, y1, -90) + arrow(x, y2, 90)
/** Lupa (para los zoom) con algo adentro. */
const mag = (inner = '') => C(6.5, 6.5, 4.8) + L(10, 10, 14.6, 14.6, 'w') + inner
/** Lápiz chico abajo a la derecha (comandos de edición). */
const pencil = P('M9 15.2l.5-2.3 4.6-4.6 1.8 1.8-4.6 4.6z', 'fa') + L(13.2, 9.2, 15, 11)
/** Flechas en círculo (actualizar, sincronizar), centradas en (cx, cy). */
const cycle = (cx: number, cy: number, r: number) =>
  P(`M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r * 0.7} ${cy - r * 0.7}`, 'a') +
  arrow(cx + r * 0.95, cy - r * 0.45, 60, 'f', 2.2, 1) +
  P(`M${cx + r} ${cy}A${r} ${r} 0 0 1 ${cx - r * 0.7} ${cy + r * 0.7}`, 'a') +
  arrow(cx - r * 0.95, cy + r * 0.45, 240, 'f', 2.2, 1)
/** Pila de capas (achicada a la izquierda arriba si lleva insignia). */
const layers = (badge = false) => {
  const s = P('M8 1.5 15 5 8 8.5 1 5z', 'fa') + P('M1 8 8 11.5 15 8') + P('M1 11 8 14.5 15 11')
  return badge ? G('scale(.7)', s) : s
}
/** Cubo isométrico: caras superior, izquierda (frente) y derecha. */
const TOP_FACE = 'M8 2 14 5 8 8 2 5z'
const LEFT_FACE = 'M2 5 8 8 8 14 2 11z'
const RIGHT_FACE = 'M8 8 14 5 14 11 8 14z'
const cube = (c?: string) => P(TOP_FACE, c) + P(LEFT_FACE, c) + P(RIGHT_FACE, c)
/** Ejes de UCS con origen en (x, y). */
const axes = (x = 2.5, y = 13.5, len = 9) => L(x, y, x + len, y, 'a') + arrow(x + len + 1, y, 0) + L(x, y, x, y - len, 'a') + arrow(x, y - len - 1, -90)
/** Hoja (página) con esquina doblada. */
const sheet = (inner = '') => P('M3 1.5h7l3.5 3.5v9.5H3z') + P('M10 1.5V5h3.5') + inner
/** Barra de herramientas de vistas: cubo con una cara resaltada (las ocultas, punteadas). */
const viewIcon = (face: string, hidden = false) => cube() + P(face, hidden ? 'a d' : 'fa')
/** Cubo con una flecha desde una esquina (vistas isométricas). */
const isoIcon = (x0: number, y0: number, x1: number, y1: number) => cube() + L(x0, y0, x1, y1, 'a') + arrow(x1, y1, (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI)
/** Candado (cerrado o abierto) en la esquina inferior derecha. */
const lock = (open: boolean) => R(10, 11, 5.5, 4.5, 'fa', 0.6) + P(open ? 'M11.3 11V9.3a1.6 1.6 0 0 1 3.2 0' : 'M11.3 11V9.6a1.45 1.45 0 0 1 2.9 0V11')

export const ICONS: Record<string, string> = {
  // --- Draw ---
  line: L(3, 13, 13, 3, 'a') + sq(3, 13, 's') + sq(13, 3, 's'),
  pline: P('M2 13 6 4l4 7h1.5a3 3 0 0 0 0-6', 'a') + sq(2, 13, 's') + sq(6, 4, 's') + sq(10, 11, 's'),
  polygon: P('M8 1.8l5.4 3.1v6.2L8 14.2l-5.4-3.1V4.9z', 'a') + C(8, 8, 0.8, 's'),
  rectangle: R(2, 4, 12, 8, 'a') + sq(2, 12, 's') + sq(14, 4, 's'),
  arc: P('M2.5 12.5A6.5 6.5 0 0 1 13.5 12.5', 'a') + sq(2.5, 12.5, 's') + sq(8, 5.5, 's') + sq(13.5, 12.5, 's'),
  circle: C(8, 8, 5.8, 'a') + C(8, 8, 0.9, 's') + L(8, 8, 13.8, 8, 'd'),
  spline: P('M1.5 12.5C4.5 1 9.5 16 14.5 3.5', 'a') + sq(1.5, 12.5, 's') + sq(14.5, 3.5, 's'),
  ellipse: E(8, 8, 6.5, 4, 'a') + C(8, 8, 0.8, 's'),
  insert: R(7, 6.5, 7.5, 7.5) + C(10.75, 10.25, 2) + L(1.5, 3, 7, 8.5, 'a') + arrow(7.6, 9.1, 45),
  block: R(1.5, 1.5, 13, 13, 'a d') + R(3.5, 8, 5, 5) + C(10.5, 5.5, 2.5) + P('M9 13l2.5-4 2.5 4z'),
  hatch: R(2, 3, 12, 10) + P('M2 9l6-6M2 13l10-10M6 13l8-8M10 13l4-4', 'a'),
  mtext: T(5.5, 10, 'A', 9) + L(10, 4, 15, 4, 'a') + L(10, 7.5, 15, 7.5, 'a') + L(10, 11, 15, 11, 'a') + L(2, 14.5, 15, 14.5, 'a'),
  text: T(8, 13, 'A', 13) + L(2, 15, 14, 15, 'a'),

  // --- Modify ---
  erase: L(2, 4, 14, 4) + L(2, 8, 14, 8, 'd') + P('M6.5 15.2l-3.2-3.2 6-6 3.2 3.2z', 'fa') + L(9.3, 9, 12.5, 12.2),
  copy: R(1.5, 1.5, 8, 8) + R(6.5, 6.5, 8, 8, 'a'),
  mirror: P('M2 13 6.5 3v10z') + P('M14 13 9.5 3v10z', 'a') + L(8, 1, 8, 15, 'cl'),
  offset: P('M2 13C2 6 6 3 14 3') + P('M5.5 14.5C5.5 9.5 8.5 6.5 14 6.5', 'a'),
  array: [2, 6.5, 11].flatMap((x) => [2, 6.5, 11].map((y) => R(x, y, 3, 3, x === 2 && y === 2 ? '' : 'a'))).join(''),
  move: L(8, 2, 8, 14, 'a') + L(2, 8, 14, 8, 'a') + arrow(8, 1.2, -90) + arrow(8, 14.8, 90) + arrow(1.2, 8, 180) + arrow(14.8, 8, 0),
  rotate: R(5.5, 5.5, 5, 5) + P('M3 4.5A6.5 6.5 0 1 0 8 1.5', 'a') + arrow(9, 1.6, 10) + C(8, 8, 0.8, 's'),
  scale: R(1.5, 9.5, 5, 5) + R(1.5, 1.5, 13, 13, 'a') + L(6.5, 9.5, 12, 4, 'a') + arrow(12.5, 3.5, -45),
  stretch: P('M2 3h7l4 4v6H2z', 'a') + P('M2 3h5v10H2', 'd') + L(10, 10, 14.5, 14.5, 'a') + arrow(15, 15, 45) + sq(13, 13, 's'),
  lengthen: L(2, 8, 9, 8) + L(9, 8, 14, 8, 'a d') + arrow(15, 8, 0) + sq(9, 8, 's'),
  trim: L(10, 1.5, 10, 14.5) + L(1.5, 8, 10, 8) + L(10, 8, 14.5, 8, 'a d') + P('M12 5.5l2.5-2.5M12 10.5l2.5 2.5', 'a'),
  extend: L(13, 1.5, 13, 14.5) + L(2, 8, 7, 8) + L(7, 8, 12.4, 8, 'a') + arrow(12.6, 8, 0),
  breakatpoint: L(1.5, 8, 14.5, 8) + C(8, 8, 1.6, 'f') + L(8, 4, 8, 6, 'a') + L(8, 10, 8, 12, 'a'),
  break: L(1.5, 8, 6, 8) + L(10, 8, 14.5, 8) + L(6, 8, 10, 8, 'a d') + sq(6, 8) + sq(10, 8),
  join: L(1.5, 8, 6.5, 8) + L(9.5, 8, 14.5, 8) + L(6.5, 8, 9.5, 8, 'a w') + arrow(5.8, 5, 0, 'f', 2, 1) + arrow(10.2, 5, 180, 'f', 2, 1),
  chamfer: P('M2 14V8') + P('M8 2h6') + P('M2 8 8 2', 'a') + L(2, 8, 2, 2, 'd') + L(2, 2, 8, 2, 'd'),
  fillet: P('M2 14V9') + P('M9 2h5') + P('M2 9a7 7 0 0 1 7-7', 'a') + L(2, 9, 2, 2, 'd') + L(2, 2, 9, 2, 'd'),
  explode: P('M5 5h3v3H5z') + P('M9 4.5l2.5 1-1 2.5', 'a') + P('M4.5 9.5l-1 2.5 2.5 1', 'a') + P('M9.5 9.5h3v3', 'a') + P('M2 2l2 2M14 2l-2 2M2 14l2-2M14 14l-2-2', 'a'),

  // --- Modify II ---
  pedit: P('M1.5 11 4.5 3l3 6h2', 'a') + sq(4.5, 3, 's') + pencil,
  hatchedit: R(1.5, 1.5, 10, 9) + P('M1.5 7.5l6-6M3.5 10.5l8-8', 'a') + pencil,
  attedit: R(1.5, 2, 10, 7, '', 1) + T(6.5, 7.7, 'AT', 5, 'ta') + pencil,
  eattedit: R(1.5, 2, 10, 7, 'fa', 1) + T(6.5, 7.7, 'AT', 5) + pencil,
  attsync: R(1, 1.5, 7, 5, '', 1) + R(8, 9.5, 7, 5, '', 1) + P('M10.5 3.5h2.5v4', 'a') + arrow(13, 8.3, 90) + P('M5.5 12.5H3v-4', 'a') + arrow(3, 7.7, -90),

  // --- Dimension ---
  dim: hdim(2.5, 13.5, 13.5, 8) + P('M11.5 1l-1.6 3h2l-1.6 3', 'a'),
  qdim: hdim(2, 9, 14.5, 10) + L(9, 14.5, 9, 4.5) + L(14, 14.5, 14, 4.5) + L(2, 6, 14, 6, 'a') + arrow(2, 6, 180) + arrow(14, 6, 0) + P('M12.5 7.5l-1.2 2.2h1.6l-1.2 2.2', 'a'),
  autodim: R(5, 2, 9, 7) + hdim(5, 14, 9.5, 13) + vdim(2, 9, 4.5, 2),
  dimlinear: hdim(2.5, 13.5, 14, 8) + T(8, 6, '10', 5, 'ta'),
  dimaligned: L(2, 12, 9, 5) + L(7, 15, 14, 8) + L(4, 10, 11, 3, 'a') + arrow(4, 10, 135) + arrow(11, 3, -45) + L(2, 12, 7, 15),
  dimarc: P('M2.5 14A6 6 0 0 1 13.5 14') + P('M1 10A8 8 0 0 1 15 10', 'a') + arrow(1.4, 9.6, 115) + arrow(14.6, 9.6, 65) + P('M6.5 4.2a1.8 1.8 0 0 1 3 0', 'a'),
  dimordinate: L(2, 2, 2, 14) + L(2, 14, 14, 14) + L(9, 12, 9, 7, 'a') + L(9, 7, 13, 3, 'a') + T(13, 9, 'X', 5, 'ta') + sq(9, 12, 's'),
  dimradius: C(6, 10, 5) + C(6, 10, 0.7, 's') + L(6, 10, 9.6, 6.4, 'a') + arrow(9.6, 6.4, -45) + L(9.6, 6.4, 13, 3, 'a') + T(13.5, 8, 'R', 5, 'ta'),
  dimjogged: C(6, 10, 5) + P('M9.6 6.4l1.4.4-1.2-2 1.6.4L14 2', 'a') + arrow(9.6, 6.4, -135) + C(14, 2, 0.8, 's'),
  dimdiameter: C(8, 8, 6) + L(3.8, 12.2, 12.2, 3.8, 'a') + arrow(3.8, 12.2, 135) + arrow(12.2, 3.8, -45),
  dimangular: L(2, 14, 14, 14) + L(2, 14, 11, 4) + P('M11 14A9 9 0 0 0 8 7.3', 'a') + arrow(11, 13.6, 90) + arrow(8, 7.3, 220),
  dimbaseline: L(2, 15, 2, 2) + L(8, 15, 8, 7) + L(14, 15, 14, 2) + L(2, 9, 8, 9, 'a') + arrow(2, 9, 180) + arrow(8, 9, 0) + L(2, 4, 14, 4, 'a') + arrow(2, 4, 180) + arrow(14, 4, 0),
  dimcontinue: L(1.5, 14, 1.5, 4) + L(8, 14, 8, 4) + L(14.5, 14, 14.5, 4) + L(1.5, 7, 8, 7, 'a') + arrow(1.5, 7, 180) + arrow(8, 7, 0) + L(8, 7, 14.5, 7, 'a') + arrow(14.5, 7, 0),
  dimspace: L(2, 3, 14, 3, 'a') + L(2, 8, 14, 8, 'a') + L(2, 13, 14, 13, 'a') + L(5, 3.8, 5, 7.2, 'd') + L(11, 8.8, 11, 12.2, 'd'),
  dimbreak: L(2, 14, 2, 4) + L(14, 14, 14, 4) + L(2, 7, 6.5, 7, 'a') + L(9.5, 7, 14, 7, 'a') + arrow(2, 7, 180) + arrow(14, 7, 0) + L(8, 1.5, 8, 14.5),
  mleader: arrow(2, 14, 135) + L(2.8, 13.2, 7, 6, 'a') + L(7, 6, 9, 6, 'a') + L(10, 4, 15, 4) + L(10, 6.5, 15, 6.5) + L(10, 9, 13.5, 9),
  leader: arrow(2, 14, 135) + L(2.8, 13.2, 8, 5, 'a') + L(8, 5, 11, 5, 'a') + T(13, 7, 'A', 6),
  dimcenter: C(8, 8, 5.5) + L(6.5, 8, 9.5, 8, 'a') + L(8, 6.5, 8, 9.5, 'a') + L(0.8, 8, 4.5, 8, 'a') + L(11.5, 8, 15.2, 8, 'a') + L(8, 0.8, 8, 4.5, 'a') + L(8, 11.5, 8, 15.2, 'a'),
  centerline: L(2, 3, 14, 3) + L(2, 13, 14, 13) + L(1, 8, 15, 8, 'a cl'),
  diminspect: L(2, 14, 2, 8) + L(14, 14, 14, 8) + L(2, 11, 14, 11, 'a') + arrow(2, 11, 180) + arrow(14, 11, 0) + R(3, 1.5, 10, 6, 'a', 3) + T(8, 6.2, '25', 5),
  dimjogline: L(2, 14, 2, 4) + L(14, 14, 14, 4) + P('M2 7h4.5l1-1.5 1 3 1-1.5H14', 'a') + arrow(2, 7, 180) + arrow(14, 7, 0),
  dimedit: hdim(1.5, 11, 9, 5) + pencil,
  dimtedit: hdim(1.5, 14.5, 15, 11) + T(8, 7, '10', 6, 'ta') + arrow(3, 4, 180, 'f', 2, 1) + arrow(13, 4, 0, 'f', 2, 1),
  dimupdate: hdim(1.5, 9.5, 8, 4) + cycle(11.5, 11.5, 3.2),
  dimstyle: hdim(1.5, 12, 9, 5) + R(9, 9.5, 6, 5.5, 'fa', 1) + L(10.5, 11.5, 13.5, 11.5) + L(10.5, 13.3, 13.5, 13.3),

  // --- Standard ---
  new: sheet(L(5.5, 8, 11, 8, 'a') + L(8.25, 5.25, 8.25, 10.75, 'a')),
  open: P('M1.5 13.5V3h4.5l1.5 1.5H13V7') + P('M1.5 13.5 4 7h11l-2.5 6.5z', 'fa'),
  save: P('M2 2h10l2 2v10H2z') + R(4.5, 2, 6, 4, 'fa') + R(4, 9, 8, 5),
  plot: R(4, 1.5, 8, 4.5) + P('M2 6h12v6h-2') + P('M4 12H2V6') + R(4, 9.5, 8, 5, 'fa') + C(12, 8, 0.6, 's'),
  undo: P('M5 4.5h5a4 4 0 0 1 0 8H5', 'a') + arrow(2, 4.5, 180),
  redo: P('M11 4.5H6a4 4 0 0 0 0 8h5', 'a') + arrow(14, 4.5, 0),
  matchprop: P('M3 13.5c2 0 3-1.5 3-3.5l2-2 2 2-2 2c-1.5 1.5-3 1.5-5 1.5z', 'fa') + L(9, 9, 14, 4, 'w'),
  pan: P('M5 14c-2-1.5-3-3.5-3-6 0-.8 1.3-.8 1.6 0l.8 2V3.5c0-1 1.6-1 1.6 0V8 2.5c0-1 1.6-1 1.6 0V8 3.2c0-1 1.6-1 1.6 0V8 4.5c0-1 1.6-1 1.6 0V10c0 2.2-1 3.5-2.2 4z', 'fa'),
  zoom: mag(L(4.5, 6.5, 8.5, 6.5, 'a') + L(6.5, 4.5, 6.5, 8.5, 'a') + L(12, 2, 15, 2, 'a') + L(13.5, 0.5, 13.5, 3.5, 'a')),
  zoomwindow: mag(R(4.2, 4.6, 4.6, 3.8, 'a d')),
  zoomprevious: mag(P('M8.6 7.6H4.6', 'a') + arrow(4, 7.6, 180, 'f', 2, 1) + P('M8.6 7.6V5.2', 'a')),
  properties: R(2, 1.5, 12, 13) + R(2, 1.5, 12, 3, 'fa') + L(4, 7.5, 7, 7.5) + L(8.5, 7.5, 12, 7.5, 'a') + L(4, 10, 7, 10) + L(8.5, 10, 12, 10, 'a') + L(4, 12.5, 7, 12.5) + L(8.5, 12.5, 12, 12.5, 'a'),
  help: C(8, 8, 6.5) + P('M6 6.2a2 2 0 1 1 2.8 1.8c-.6.3-.8.7-.8 1.4V10', 'a') + C(8, 12, 0.7, 'f'),

  // --- Zoom ---
  zoomdynamic: mag(R(3.8, 4.4, 5.4, 4.2, 'a') + L(4.8, 5.4, 8.2, 7.6, 'a')),
  zoomscale: mag(T(6.5, 8.6, 'x', 6, 'ta')),
  zoomcenter: mag(C(6.5, 6.5, 1, 'f') + L(6.5, 3.4, 6.5, 4.6, 'a') + L(6.5, 8.4, 6.5, 9.6, 'a') + L(3.4, 6.5, 4.6, 6.5, 'a') + L(8.4, 6.5, 9.6, 6.5, 'a')),
  zoomobject: mag(R(4.8, 4.8, 3.4, 3.4, 'fa')),
  zoomin: mag(L(4.3, 6.5, 8.7, 6.5, 'a') + L(6.5, 4.3, 6.5, 8.7, 'a')),
  zoomout: mag(L(4.3, 6.5, 8.7, 6.5, 'a')),
  zoomall: mag(T(6.5, 8.6, 'A', 6, 'ta')),
  zoomextents: mag(P('M4.2 5.6V4.2h1.4M8.8 5.6V4.2H7.4M4.2 7.4v1.4h1.4M8.8 7.4v1.4H7.4', 'a')),

  // --- Layers ---
  layer: layers(),
  laymcur: layers(true) + P('M9.5 12l2 2 3.5-4', 'a w'),
  layiso: G('scale(.7)', P('M8 1.5 15 5 8 8.5 1 5z', 'd') + P('M1 8 8 11.5 15 8', 'fa') + P('M1 11 8 14.5 15 11', 'd')) + C(12.5, 12.5, 2.6, 'a') + C(12.5, 12.5, 0.8, 'f'),
  layuniso: layers(true) + cycle(12.3, 12.3, 2.6),
  layoff: layers(true) + C(12.5, 11, 2.6) + L(11.3, 14.5, 13.7, 14.5) + L(10, 8.5, 15, 13.5, 'a'),
  layon: layers(true) + C(12.5, 11, 2.6, 'fa') + L(11.3, 14.5, 13.7, 14.5),
  layfrz: layers(true) + L(12.5, 8.2, 12.5, 15.2, 'a') + L(9.5, 10, 15.5, 13.4, 'a') + L(9.5, 13.4, 15.5, 10, 'a'),
  laythw: layers(true) + C(12.5, 11.7, 1.8, 'f') + P('M12.5 8v1.2M12.5 14.2v1.2M8.8 11.7H10M15 11.7h1.2M10 9.2l.8.8M14.2 13.4l.8.8M15 9.2l-.8.8M10.8 13.4l-.8.8', 'a'),
  laylck: layers(true) + lock(false),
  layulk: layers(true) + lock(true),

  // --- Properties ---
  linetype: L(1.5, 3.5, 14.5, 3.5) + L(1.5, 7, 14.5, 7, 'a d') + L(1.5, 10.5, 14.5, 10.5, 'a cl') + L(1.5, 14, 14.5, 14, 'w'),

  // --- Object Snap ---
  snapend: L(2, 14, 10.5, 5.5) + R(9, 1.5, 5.5, 5.5, 'a w'),
  snapmid: L(1.5, 13, 14.5, 13) + P('M8 4.5l3.5 6h-7z', 'a w'),
  snapint: L(2, 14, 14, 2) + L(2, 2, 14, 14) + P('M5.5 5.5l5 5M10.5 5.5l-5 5', 'a w'),
  snapapp: L(1.5, 14, 6, 9.5) + L(1.5, 2, 6, 6.5) + R(4.5, 4.5, 7, 7, 'a') + P('M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4', 'a w'),
  snapcen: C(8, 8, 6.5) + C(8, 8, 2.4, 'a w'),
  snapgce: P('M8 1.5l6.2 4.5-2.4 7.3H4.2L1.8 6z') + P('M8 5.4l.8 1.8 2 .2-1.5 1.3.4 2L8 9.7l-1.7 1 .4-2-1.5-1.3 2-.2z', 'f'),
  snapqua: C(8, 9, 5.5) + P('M8 0.8l2.8 2.8L8 6.4 5.2 3.6z', 'a w'),
  snaptan: P('M2.5 15.5a5.5 5.5 0 0 1 11 0') + C(8, 7.2, 3.2, 'a w') + L(3, 3.4, 13, 3.4, 'a w'),
  snapper: L(1.5, 14, 14.5, 14) + P('M5 14V5', 'a w') + P('M5 9.5h4.5V14', 'a w'),
  snapnod: C(8, 8, 4.8, 'a w') + P('M4.6 4.6l6.8 6.8M11.4 4.6l-6.8 6.8', 'a w'),
  snapnea: L(1.5, 14, 14.5, 14) + P('M4.5 3h7l-7 8h7z', 'a w'),
  osnap: P('M3.5 2v6.5a4.5 4.5 0 0 0 9 0V2h-3v6.5a1.5 1.5 0 0 1-3 0V2z', 'fa') + R(3.5, 2, 3, 2.5, 's') + R(9.5, 2, 3, 2.5, 's'),

  // --- UCS ---
  ucs: axes(),
  ucsworld: axes() + C(11.5, 4.5, 3.3) + E(11.5, 4.5, 1.4, 3.3) + L(8.2, 4.5, 14.8, 4.5),
  ucsprevious: axes() + P('M14.5 6H10', 'a') + arrow(9, 6, 180) + P('M14.5 6V2.5', 'a'),
  ucsface: P('M4 6l8-3v7l-8 3z', 'fa') + axes(4, 13, 6),
  ucsobject: C(11, 5, 3.5) + axes(2.5, 13.5, 7),
  ucsview: R(1.5, 1.5, 13, 13, 'd') + axes(4, 12, 6),
  ucs3point: axes(2.5, 13.5, 8) + C(2.5, 13.5, 1.3, 'f') + C(11.5, 13.5, 1.3, 'f') + C(2.5, 4.5, 1.3, 'f'),
  ucszaxis: L(2.5, 13.5, 11, 13.5) + L(2.5, 13.5, 8, 10) + L(2.5, 13.5, 2.5, 3, 'a w') + arrow(2.5, 1.8, -90) + T(8, 7, 'Z', 6, 'ta'),
  ucsx: axes() + P('M10 3.5a2.5 4.5 0 1 1 0 5', 'a') + T(13.5, 12, 'X', 5),
  ucsy: axes() + P('M7.5 6.5a4.5 2.5 0 1 1 5 0', 'a') + T(12, 12, 'Y', 5),
  ucsz: axes() + P('M7.5 9.5A3.5 3.5 0 1 1 11 13', 'a') + arrow(11.3, 13.2, 90, 'f', 2, 1) + T(13.5, 6, 'Z', 5),
  ucsnamed: axes(2.5, 13.5, 6) + L(9, 4, 15, 4, 'a') + L(9, 7, 15, 7, 'a') + L(9, 10, 15, 10, 'a'),

  // --- View ---
  views: R(1.5, 3, 13, 10, '', 1) + G('translate(4 3.5) scale(.5)', cube('a')),
  viewtop: viewIcon(TOP_FACE),
  viewbottom: viewIcon('M2 11 8 14 14 11 8 8z', true),
  viewleft: viewIcon('M2 5 8 2 8 8 2 11z', true),
  viewright: viewIcon(RIGHT_FACE),
  viewfront: viewIcon(LEFT_FACE),
  viewback: viewIcon('M8 2 14 5 14 11 8 8z', true),
  viewswiso: isoIcon(0.5, 15.5, 3, 12.8),
  viewseiso: isoIcon(15.5, 15.5, 13, 12.8),
  viewneiso: isoIcon(15.5, 0.5, 13, 3.2),
  viewnwiso: isoIcon(0.5, 0.5, 3, 3.2),

  // --- Visual Styles ---
  vs2d: R(2, 2, 12, 12) + C(8, 8, 4, 'a') + L(2, 8, 14, 8, 'd') + L(8, 2, 8, 14, 'd'),
  vs3d: cube('a') + P('M2 11 8 8 14 11M8 2v6', 'a d'),
  vshidden: cube('a'),
  vsshaded: P(TOP_FACE, 'f') + `<path d="${LEFT_FACE}" class="f" fill-opacity=".7"/>` + `<path d="${RIGHT_FACE}" class="f" fill-opacity=".4"/>`,
  vsedges: P(TOP_FACE, 'f') + `<path d="${LEFT_FACE}" class="f" fill-opacity=".7"/>` + `<path d="${RIGHT_FACE}" class="f" fill-opacity=".4"/>` + cube(),

  // --- Viewports ---
  vports: R(1.5, 1.5, 13, 13) + L(8, 1.5, 8, 14.5, 'a') + L(1.5, 8, 14.5, 8, 'a'),
  mview: sheet(R(4.5, 6.5, 7.5, 6, 'a')),
  vpclip: R(1.5, 1.5, 13, 13) + P('M4 4h8l-2 4 2 4H4z', 'a d'),
  vpmax: R(1.5, 1.5, 13, 13) + P('M5 5l6 6', 'a') + arrow(4.2, 4.2, 225) + arrow(11.8, 11.8, 45),
  vpmin: R(1.5, 1.5, 13, 13) + R(5, 5, 6, 6, 'a') + L(1.5, 1.5, 5, 5, 'd') + L(14.5, 14.5, 11, 11, 'd'),
  vplayer: R(1.5, 1.5, 13, 13) + G('translate(4 4) scale(.5)', P('M8 1.5 15 5 8 8.5 1 5z', 'fa') + P('M1 8 8 11.5 15 8') + P('M1 11 8 14.5 15 11')),

  // --- Layouts ---
  layoutnew: sheet(L(5.5, 9, 11, 9, 'a') + L(8.25, 6.25, 8.25, 11.75, 'a')) + R(4.5, 11.5, 7.5, 1.5, 'fa'),
  pagesetup: sheet(R(5, 6.5, 6.5, 6, 'a') + L(5, 14.5, 11.5, 14.5, 'a')),
  publish: P('M5.5 0.8h6l3 3v7.5', 'd') + sheet(L(5, 10, 10, 10, 'a') + arrow(11.8, 10, 0)),

  // --- Modeling ---
  box: cube() + P(TOP_FACE, 'fa'),
  cylinder: E(8, 4, 5.5, 2.3, 'fa') + L(2.5, 4, 2.5, 12) + L(13.5, 4, 13.5, 12) + P('M2.5 12a5.5 2.3 0 0 0 11 0'),
  cone: E(8, 12, 5.5, 2.3) + L(2.5, 12, 8, 1.5, 'a') + L(13.5, 12, 8, 1.5, 'a'),
  sphere: C(8, 8, 6.3, 'fa') + E(8, 8, 6.3, 2.2) + E(8, 8, 2.2, 6.3, 'd'),
  torus: E(8, 8, 6.8, 4.3, 'fa') + E(8, 7.5, 2.8, 1.3, 'bg') + P('M5.2 7.5a2.8 1.3 0 0 0 5.6 0'),
  extrude: P('M2 14l5-2.5 7 2.5', 'a') + P('M2 14v-8l5-2.5 7 2.5v8') + L(7, 3.5, 7, 11.5, 'd') + L(10.5, 11, 10.5, 4, 'a') + arrow(10.5, 2.8, -90),
  revolve: L(3, 1, 3, 15, 'cl') + P('M3 3h4v5l2 2v3H3', 'fa') + P('M11 3.5a5 2 0 1 1 0 9', 'a') + arrow(10.5, 12.6, 180, 'f', 2, 1),
  align: R(1.5, 9, 5, 5) + G('rotate(-20 11 5)', R(8.5, 2.5, 5, 5, 'a')) + P('M6.5 9C8 8 8.5 7.5 9 7.5', 'd') + arrow(8.8, 7.6, -20, 'f', 2, 1),
  flatshot: G('translate(3 -1) scale(.62)', cube()) + P('M1.5 15l3-4h10l-3 4z', 'fa') + L(5, 9, 4.5, 11, 'd') + L(12.7, 7, 13, 11, 'd'),

  // --- Solid Editing ---
  union: P('M8 3.97A4.5 4.5 0 1 0 8 12.03A4.5 4.5 0 1 0 8 3.97Z', 'fa'),
  subtract: P('M8 3.97A4.5 4.5 0 1 0 8 12.03A4.5 4.5 0 0 1 8 3.97Z', 'fa') + C(10, 8, 4.5, 'd'),
  intersect: C(6, 8, 4.5, 'd') + C(10, 8, 4.5, 'd') + P('M8 3.97A4.5 4.5 0 0 1 8 12.03A4.5 4.5 0 0 1 8 3.97Z', 'fa'),
  filletedge: P('M2 6l6-3 6 3v6l-6 3-6-3z') + P('M8 9v6') + P('M2 6l6 3 6-3') + P('M7 8.6c.7.4 1.3.4 2 0', 'a w'),
  chamferedge: P('M2 6l6-3 6 3v6l-6 3-6-3z') + P('M8 9v6') + P('M2 6l6 3 6-3') + P('M6.6 8.3 8 10l1.4-1.7', 'a w'),

  // --- Text ---
  field: R(1.5, 3.5, 13, 9, 'fa', 1) + T(8, 10.8, '#', 8),
  updatefield: R(1, 2, 9, 7, 'fa', 1) + T(5.5, 7.8, '#', 6) + cycle(11.8, 11.8, 3),

  // --- Multileader ---
  mleaderedit: arrow(2, 14, 135) + L(2.8, 13.2, 9, 6, 'a') + arrow(2, 8, 165) + L(3, 7.8, 9, 6, 'a') + L(9, 6, 12, 6) + L(12.5, 1.5, 12.5, 4.5, 'a') + L(11, 3, 14, 3, 'a'),
  mleaderalign: arrow(1.5, 6, 160) + L(2.4, 5.7, 8, 4) + arrow(1.5, 13, 160) + L(2.4, 12.7, 8, 11) + L(9.5, 4, 15, 4) + L(9.5, 11, 15, 11) + L(9.5, 1.5, 9.5, 14.5, 'a d'),
  mleaderstyle: arrow(2, 14, 135) + L(2.8, 13.2, 6.5, 7.5, 'a') + L(6.5, 7.5, 8, 7.5, 'a') + R(9, 2, 6, 6, 'fa', 1) + L(10.3, 4, 13.7, 4) + L(10.3, 6, 13.7, 6),

  // --- Insert ---
  attdef: R(1.5, 3, 13, 10, '', 1) + T(8, 10.5, 'TAG', 5.5, 'ta'),
  import: sheet() + L(0.5, 9.5, 7, 9.5, 'a w') + arrow(9, 9.5, 0),

  // --- Inquiry ---
  dist: L(2, 12, 14, 4, 'a') + arrow(2, 12, 146) + arrow(14, 4, -34) + L(2, 15, 2, 9) + L(14, 7, 14, 1),

  // --- Drawing Views ---
  viewbase: sheet(R(5, 7, 4.5, 4, 'a') + G('translate(9.5 9) scale(.28)', cube('a'))),
  viewproj: R(1.5, 8, 5, 5, 'a') + R(9.5, 8, 5, 5) + R(1.5, 1.5, 5, 5) + L(7, 10.5, 9, 10.5, 'd') + L(4, 7.5, 4, 7, 'd'),
  viewedit: R(1.5, 2, 9, 7) + R(3.5, 4, 5, 3, 'a') + pencil,
  viewupdate: R(1.5, 2, 9, 7) + R(3.5, 4, 5, 3, 'a') + cycle(12, 12, 3),
  viewstd: P('M1.5 6.5l5-2v7l-5-2z', 'a') + L(0.8, 8, 8, 8, 'cl') + C(12, 8, 3.5) + C(12, 8, 1.6) + L(8, 8, 15.5, 8, 'cl'),
  solprof: G('translate(1 -1) scale(.7)', cube()) + P('M5.5 10.5l6.5 2.5', 'a') + R(7.5, 10, 7, 4.5, 'a d'),
}

/** Íconos de la barra; `undefined` si falta (el test de barras lo detecta). */
export const iconMarkup = (key: string): string | undefined => ICONS[key]
