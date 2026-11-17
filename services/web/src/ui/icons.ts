/**
 * Íconos de las barras de herramientas, en grilla de píxeles (`iconGrid.ts`): cada uno se dibuja una vez en la
 * grilla de diseño de 16 y sale nítido en 16, 20 y 24 px, con el detalle que entra en cada tamaño.
 *
 * Lenguaje: trazo de 1 px, esquinas vivas y extremos rectos (como un plano). Lo que ya existe va en el color del
 * texto; lo que el comando crea o cambia, en el acento (`a`, `f`, `fa`); lo que se quita o lo que fue, en guiones.
 * Los puntos designados son grips cuadrados; los centros, una cruz; las flechas, puntas rellenas de cota.
 */
import { gridFor, type Grid, type IconDraw, type IconSize, ICON_PX } from './iconGrid'

type G = Grid

// --- Piezas comunes -------------------------------------------------------------------------------------------

/** Cruz de centro de 3 px (5 px desde 20). */
const center = (g: G, x: number, y: number, c?: string) => {
  const h = g.md ? 2 : 1
  return g.l(x - h, y, x + h, y, c) + g.l(x, y - h, x, y + h, c)
}

/** Cota horizontal: referencias desde `y0` (pasan 1 px la línea de cota) y línea de cota en `y` con flechas. */
const hdim = (g: G, x1: number, x2: number, y0: number, y: number, c = 'a') => {
  const over = y0 > y ? -1 : 1
  return g.l(x1, y0, x1, y + over) + g.l(x2, y0, x2, y + over) + g.l(x1, y, x2, y, c) + g.arrow(x1, y, 180) + g.arrow(x2, y, 0)
}

/** Cota vertical: referencias desde `x0` y línea de cota en `x`. */
const vdim = (g: G, y1: number, y2: number, x0: number, x: number, c = 'a') => {
  const over = x0 > x ? -1 : 1
  return g.l(x0, y1, x + over, y1) + g.l(x0, y2, x + over, y2) + g.l(x, y1, x, y2, c) + g.arrow(x, y1, -90) + g.arrow(x, y2, 90)
}

/** Lápiz abajo a la derecha (comandos de edición), recortado del dibujo de atrás. */
const pencil = (g: G) => {
  const body = [8.5, 15.5, 9.5, 12.5, 13.5, 8.5, 15.5, 10.5, 11.5, 14.5]
  return g.pg([7.5, 15.5, 9, 11.5, 13.5, 7, 16, 9.5, 12, 15.5], 'bg') + g.pg(body, 'fa') + g.l(9.5, 12.5, 11.5, 14.5, 'a')
}

/** Flechas en ciclo (actualizar), centradas en (x, y) con radio r (entero: los extremos caen en la grilla). */
const cycle = (g: G, x: number, y: number, r: number) =>
  g.d(`M${x - r} ${y} A${r} ${r} 0 0 1 ${x + r * 0.7} ${y - r * 0.7}`, 'a') +
  g.arrow(x + r * 0.85, y - r * 0.55, 55, 'f', true) +
  g.d(`M${x + r} ${y} A${r} ${r} 0 0 1 ${x - r * 0.7} ${y + r * 0.7}`, 'a') +
  g.arrow(x - r * 0.85, y + r * 0.55, 235, 'f', true)

/** Lupa (zoom) con algo adentro: lente de radio 4 centrada en (6.5, 6.5) y mango de 2 px. */
const lens = (g: G, inner = '') => g.c(6.5, 6.5, 4) + g.l(9.5, 9.5, 14, 14, 'w') + inner

/** Hoja con la esquina doblada. */
const sheet = (g: G, inner = '') => g.d('M2.5 1.5 H9.5 L13.5 5.5 V14.5 H2.5 Z') + g.d('M9.5 1.5 V5.5 H13.5') + inner

/** Etiqueta de atributo (rótulo con punta a la derecha). */
const tag = (g: G, x1: number, y1: number, x2: number, y2: number, c?: string) =>
  g.d(`M${x1} ${y1} H${x2 - 3} L${x2} ${(y1 + y2) / 2} L${x2 - 3} ${y2} H${x1} Z`, c)

/** Pila de capas grande (14 × 13). */
const layers = (g: G) =>
  g.pg([7.5, 1.5, 13.5, 4.5, 7.5, 7.5, 1.5, 4.5], 'fa') + g.p([1.5, 7.5, 7.5, 10.5, 13.5, 7.5]) + g.p([1.5, 10.5, 7.5, 13.5, 13.5, 10.5])

/** Pila chica arriba a la izquierda y lugar libre para una insignia abajo a la derecha. */
const layersBadge = (g: G, badge: string) =>
  g.pg([5.5, 1.5, 9.5, 3.5, 5.5, 5.5, 1.5, 3.5], 'fa') +
  g.p([1.5, 6.5, 5.5, 8.5, 9.5, 6.5]) +
  g.p([1.5, 9.5, 5.5, 11.5, 9.5, 9.5]) +
  g.box(9, 8, 16, 16, 'bg') +
  badge

/** Candado de la insignia (cerrado o abierto). */
const lock = (g: G, open: boolean) =>
  g.r(9.5, 11.5, 14.5, 14.5, 'fa') + g.d(open ? 'M10.5 11.5 V9.5 A1.5 1.5 0 0 1 13.5 9.5' : 'M10.5 11.5 V9.5 A1.5 1.5 0 0 1 13.5 9.5 V11.5', 'a')

/** Ejes del SCP con origen en (x, y) y largo `len`. */
const axes = (g: G, x = 2.5, y = 13.5, len = 10) =>
  g.l(x, y, x + len, y, 'a') + g.arrow(x + len + 1, y, 0) + g.l(x, y, x, y - len, 'a') + g.arrow(x, y - len - 1, -90)

/** Cubo isométrico (relación 2:1, aristas verticales en columnas enteras). */
const TOP = [7.5, 1.5, 13.5, 4.5, 7.5, 7.5, 1.5, 4.5]
const LEFT = [1.5, 4.5, 7.5, 7.5, 7.5, 14.5, 1.5, 11.5]
const RIGHT = [7.5, 7.5, 13.5, 4.5, 13.5, 11.5, 7.5, 14.5]
const BOTTOM = [1.5, 11.5, 7.5, 8.5, 13.5, 11.5, 7.5, 14.5]
const BACK_LEFT = [1.5, 4.5, 7.5, 1.5, 7.5, 8.5, 1.5, 11.5]
const BACK_RIGHT = [7.5, 1.5, 13.5, 4.5, 13.5, 11.5, 7.5, 8.5]
const cube = (g: G, c?: string) => g.pg([7.5, 1.5, 13.5, 4.5, 13.5, 11.5, 7.5, 14.5, 1.5, 11.5, 1.5, 4.5], c) + g.p([1.5, 4.5, 7.5, 7.5, 13.5, 4.5], c) + g.l(7.5, 7.5, 7.5, 14.5, c)
/** Aristas ocultas del cubo (las de atrás), en guiones. */
const hiddenEdges = (g: G) => g.p([1.5, 11.5, 7.5, 8.5, 13.5, 11.5], 'a d') + g.l(7.5, 1.5, 7.5, 8.5, 'a d')
/** Vista ortogonal: el cubo con la cara vista rellena (las de atrás, en guiones). */
const viewIcon = (g: G, face: number[], hidden = false) => cube(g) + (hidden ? hiddenEdges(g) + g.pg(face, 'fa d') : g.pg(face, 'fa'))
/** Vista isométrica: cubo chico y una flecha desde la esquina del observador. */
const isoIcon = (g: G, sx: number, sy: number) => {
  const x0 = sx < 0 ? 1.5 : 14.5
  const y0 = sy < 0 ? 1.5 : 14.5
  const x1 = x0 - sx * 3
  const y1 = y0 - sy * 3
  const deg = (Math.atan2(-sy, -sx) * 180) / Math.PI
  return g.pg([8.5, 3.5, 12.5, 5.5, 12.5, 10.5, 8.5, 12.5, 4.5, 10.5, 4.5, 5.5]) + g.p([4.5, 5.5, 8.5, 7.5, 12.5, 5.5]) + g.l(8.5, 7.5, 8.5, 12.5) + g.l(x0, y0, x1, y1, 'a') + g.arrow(x1, y1, deg)
}

/** Ventana de vista (marco con la barra de título). */
const frame = (g: G, inner = '') => g.r(1.5, 2.5, 14.5, 13.5) + inner

// --- Íconos ----------------------------------------------------------------------------------------------------

export const ICONS: Record<string, IconDraw> = {
  // --- Draw ---
  line: (g) => g.l(3.5, 12.5, 12.5, 3.5, 'a') + g.grip(3.5, 12.5) + g.grip(12.5, 3.5),
  pline: (g) =>
    g.p([1.5, 12.5, 4.5, 3.5, 9.5, 11.5], 'a') + g.d('M9.5 11.5 H11.5 A3 3 0 0 0 11.5 5.5', 'a') + g.grip(4.5, 3.5) + g.grip(9.5, 11.5) + (g.md ? g.grip(1.5, 12.5) : ''),
  polygon: (g) => g.pg([1.5, 7.5, 4.5, 2.5, 10.5, 2.5, 13.5, 7.5, 10.5, 12.5, 4.5, 12.5], 'a') + center(g, 7.5, 7.5),
  rectangle: (g) => g.r(2.5, 3.5, 13.5, 12.5, 'a') + g.grip(2.5, 12.5) + g.grip(13.5, 3.5),
  arc: (g) => g.d('M1.5 11.5 A6 6 0 0 1 13.5 11.5', 'a') + g.grip(1.5, 11.5) + g.grip(7.5, 5.5) + g.grip(13.5, 11.5),
  circle: (g) => g.c(7.5, 7.5, 6, 'a') + center(g, 7.5, 7.5),
  spline: (g) => g.d('M1.5 12.5 C5 -1 10 17 14.5 3.5', 'a') + g.grip(1.5, 12.5) + g.grip(14.5, 3.5) + (g.md ? g.grip(7.5, 8.5) : ''),
  ellipse: (g) => g.e(7.5, 7.5, 6, 4, 'a') + center(g, 7.5, 7.5),
  insert: (g) => g.r(5.5, 5.5, 13.5, 13.5) + g.c(9.5, 9.5, 2) + g.l(1.5, 1.5, 4.5, 4.5, 'a') + g.arrow(5.5, 5.5, 45) + (g.md ? g.grip(5.5, 5.5, 'f') : ''),
  block: (g) => g.r(1.5, 1.5, 14.5, 14.5, 'a d') + g.r(3.5, 7.5, 8.5, 12.5) + g.c(10.5, 5.5, 2) + (g.md ? g.pg([10.5, 9.5, 12.5, 12.5, 8.5, 12.5]) : ''),
  hatch: (g) =>
    g.r(2.5, 2.5, 13.5, 13.5) + g.l(2.5, 6.5, 6.5, 2.5, 'a') + g.l(2.5, 10.5, 10.5, 2.5, 'a') + g.l(3.5, 13.5, 13.5, 3.5, 'a') + g.l(7.5, 13.5, 13.5, 7.5, 'a') + g.l(11.5, 13.5, 13.5, 11.5, 'a'),
  mtext: (g) =>
    g.l(1.5, 2.5, 7.5, 2.5) + g.l(4.5, 2.5, 4.5, 8.5) + g.l(9.5, 5.5, 14.5, 5.5, 'a') + g.l(9.5, 8.5, 14.5, 8.5, 'a') + g.l(1.5, 11.5, 14.5, 11.5, 'a') + g.l(1.5, 14.5, 10.5, 14.5, 'a'),
  text: (g) =>
    g.l(2.5, 2.5, 12.5, 2.5, 'a') + g.l(2.5, 2.5, 2.5, 4.5, 'a') + g.l(12.5, 2.5, 12.5, 4.5, 'a') + g.l(7.5, 2.5, 7.5, 12.5, 'a') + g.l(5.5, 12.5, 9.5, 12.5, 'a') + g.l(1.5, 14.5, 13.5, 14.5, 'd'),

  // --- Modify ---
  erase: (g) => g.l(1.5, 13.5, 14.5, 13.5) + g.pg([2.5, 9.5, 8.5, 3.5, 12.5, 7.5, 6.5, 13.5], 'fa') + g.l(5.5, 6.5, 9.5, 10.5, 'a'),
  copy: (g) => g.r(1.5, 1.5, 8.5, 8.5) + g.box(6, 6, 15, 15, 'bg') + g.r(6.5, 6.5, 13.5, 13.5, 'a') + (g.md ? g.grip(1.5, 8.5) + g.grip(6.5, 13.5, 'f') : ''),
  mirror: (g) => g.pg([1.5, 12.5, 5.5, 3.5, 5.5, 12.5]) + g.pg([13.5, 12.5, 9.5, 3.5, 9.5, 12.5], 'fa') + g.l(7.5, 0.5, 7.5, 15.5, 'cl'),
  offset: (g) => g.d('M2.5 13.5 V8.5 A6 6 0 0 1 8.5 2.5 H13.5') + g.d('M6.5 13.5 V8.5 A2 2 0 0 1 8.5 6.5 H13.5', 'a'),
  array: (g) => {
    // Piezas iguales: se cuentan en píxeles reales (el ajuste por coordenada las haría de tamaños distintos).
    const [size, step, o] = g.v([3, 5, 1], [4, 7, 1], [5, 8, 2])
    let out = ''
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out += g.rpx(o + i * step, o + j * step, size, size, i || j ? 'a' : '')
    return out
  },
  move: (g) => g.l(7.5, 2.5, 7.5, 12.5, 'a') + g.l(2.5, 7.5, 12.5, 7.5, 'a') + g.arrow(7.5, 1.5, -90) + g.arrow(7.5, 13.5, 90) + g.arrow(1.5, 7.5, 180) + g.arrow(13.5, 7.5, 0),
  rotate: (g) => g.r(5.5, 5.5, 9.5, 9.5) + g.d('M7.5 1.5 A6 6 0 1 1 1.5 7.5', 'a') + g.arrow(1.5, 5.5, -90),
  scale: (g) => g.r(2.5, 2.5, 13.5, 13.5, 'a') + g.r(2.5, 9.5, 6.5, 13.5, 'ft') + g.l(6.5, 9.5, 10.5, 5.5, 'a') + g.arrow(11.5, 4.5, -45),
  stretch: (g) =>
    g.d('M8.5 4.5 H2.5 V12.5 H8.5') + g.d('M8.5 4.5 H13.5 V12.5 H8.5', 'a') + g.l(8.5, 4.5, 8.5, 12.5, 'd') + g.l(9.5, 8.5, 11.5, 8.5, 'a') + g.arrow(12.5, 8.5, 0) + (g.md ? g.grip(13.5, 4.5, 'f') + g.grip(13.5, 12.5, 'f') : ''),
  lengthen: (g) => g.l(1.5, 7.5, 8.5, 7.5) + g.l(9.5, 7.5, 12.5, 7.5, 'a') + g.arrow(14.5, 7.5, 0) + g.grip(8.5, 7.5) + (g.md ? g.l(1.5, 4.5, 1.5, 10.5) : ''),
  trim: (g) => g.l(9.5, 1.5, 9.5, 14.5) + g.l(1.5, 7.5, 9.5, 7.5) + g.l(10.5, 7.5, 14.5, 7.5, 'a d') + g.l(11.5, 2.5, 14.5, 5.5, 'a') + g.l(14.5, 2.5, 11.5, 5.5, 'a'),
  extend: (g) => g.l(13.5, 1.5, 13.5, 14.5) + g.l(1.5, 7.5, 6.5, 7.5) + g.l(7.5, 7.5, 11.5, 7.5, 'a') + g.arrow(12.5, 7.5, 0) + (g.md ? g.grip(6.5, 7.5) : ''),
  breakatpoint: (g) => g.l(1.5, 7.5, 14.5, 7.5) + g.grip(7.5, 7.5, 'f') + g.l(7.5, 2.5, 7.5, 4.5, 'a') + g.l(7.5, 10.5, 7.5, 12.5, 'a'),
  break: (g) => g.l(1.5, 7.5, 3.5, 7.5) + g.l(11.5, 7.5, 14.5, 7.5) + g.l(5.5, 7.5, 9.5, 7.5, 'a d') + g.grip(3.5, 7.5, 'f') + g.grip(11.5, 7.5, 'f'),
  join: (g) => g.l(1.5, 10.5, 5.5, 10.5) + g.l(9.5, 10.5, 14.5, 10.5) + g.l(5.5, 10.5, 9.5, 10.5, 'a') + g.arrow(5.5, 4.5, 0) + g.arrow(9.5, 4.5, 180) + g.grip(7.5, 10.5, 'f'),
  chamfer: (g) => g.l(2.5, 14.5, 2.5, 8.5) + g.l(8.5, 2.5, 14.5, 2.5) + g.l(2.5, 8.5, 8.5, 2.5, 'a') + (g.md ? g.p([2.5, 6.5, 2.5, 2.5, 6.5, 2.5], 'd') : ''),
  fillet: (g) => g.l(2.5, 14.5, 2.5, 8.5) + g.l(8.5, 2.5, 14.5, 2.5) + g.d('M2.5 8.5 A6 6 0 0 1 8.5 2.5', 'a') + (g.md ? g.p([2.5, 6.5, 2.5, 2.5, 6.5, 2.5], 'd') : ''),
  explode: (g) =>
    g.l(4.5, 1.5, 10.5, 1.5, 'a') + g.l(4.5, 13.5, 10.5, 13.5, 'a') + g.l(1.5, 4.5, 1.5, 10.5, 'a') + g.l(13.5, 4.5, 13.5, 10.5, 'a') + g.r(5.5, 5.5, 9.5, 9.5, 'd') + (g.md ? g.grip(1.5, 1.5) + g.grip(13.5, 13.5) : ''),

  // --- Modify II ---
  pedit: (g) => g.p([1.5, 11.5, 4.5, 3.5, 8.5, 9.5, 11.5, 2.5]) + g.grip(4.5, 3.5) + g.grip(8.5, 9.5) + pencil(g),
  hatchedit: (g) => g.r(1.5, 1.5, 11.5, 10.5) + g.l(1.5, 6.5, 6.5, 1.5, 'a') + g.l(2.5, 10.5, 11.5, 1.5, 'a') + g.l(7.5, 10.5, 11.5, 6.5, 'a') + pencil(g),
  attedit: (g) => tag(g, 1.5, 2.5, 13.5, 10.5) + g.l(3.5, 6.5, 8.5, 6.5) + pencil(g),
  eattedit: (g) => tag(g, 1.5, 2.5, 13.5, 10.5, 'fa') + g.l(3.5, 6.5, 8.5, 6.5) + pencil(g),
  attsync: (g) => tag(g, 0.5, 1.5, 8.5, 6.5) + tag(g, 6.5, 9.5, 14.5, 14.5) + g.d('M11.5 3.5 H12.5 V6.5', 'a') + g.arrow(12.5, 7.5, 90) + g.d('M3.5 12.5 H2.5 V9.5', 'a') + g.arrow(2.5, 8.5, -90),

  // --- Dimension ---
  dim: (g) => hdim(g, 2.5, 13.5, 14.5, 10.5) + g.p([9.5, 1.5, 7.5, 4.5, 10.5, 4.5, 8.5, 7.5], 'a'),
  qdim: (g) => g.l(1.5, 14.5, 1.5, 6.5) + g.l(7.5, 14.5, 7.5, 9.5) + g.l(13.5, 14.5, 13.5, 6.5) + g.l(1.5, 10.5, 13.5, 10.5, 'a') + g.arrow(1.5, 10.5, 180) + g.arrow(13.5, 10.5, 0) + g.l(7.5, 8.5, 7.5, 12.5, 'a') + g.p([11.5, 0.5, 9.5, 3.5, 12.5, 3.5, 10.5, 6.5], 'a'),
  autodim: (g) => g.r(5.5, 1.5, 14.5, 9.5) + hdim(g, 5.5, 14.5, 9.5, 13.5) + vdim(g, 1.5, 9.5, 5.5, 1.5),
  dimlinear: (g) => hdim(g, 1.5, 13.5, 14.5, 10.5) + g.txt(4, 2, '10', 'f'),
  dimaligned: (g) =>
    g.l(2.5, 9.5, 7.5, 14.5) + g.l(8.5, 3.5, 13.5, 8.5) + g.l(5.5, 12.5, 11.5, 6.5, 'a') + g.arrow(5.5, 12.5, 135) + g.arrow(11.5, 6.5, -45) + (g.md ? g.grip(2.5, 9.5) + g.grip(8.5, 3.5) : ''),
  dimarc: (g) =>
    g.d('M4.5 14.5 A3 3 0 0 1 10.5 14.5') + g.d('M2.3 11.5 A6 6 0 0 1 12.7 11.5', 'a') + g.arrow(2.3, 11.5, 120, 'f', true) + g.arrow(12.7, 11.5, 60, 'f', true) + g.d('M5.5 4.5 A2 2 0 0 1 9.5 4.5', 'a'),
  dimordinate: (g) => g.l(1.5, 14.5, 14.5, 14.5) + g.l(1.5, 1.5, 1.5, 14.5) + g.l(6.5, 12.5, 6.5, 8.5, 'a') + g.l(6.5, 8.5, 9.5, 5.5, 'a') + g.grip(6.5, 12.5) + g.txt(11, 2, 'X', 'f'),
  dimradius: (g) => g.c(5.5, 10.5, 4) + center(g, 5.5, 10.5) + g.l(5.5, 10.5, 12.5, 3.5, 'a') + g.arrow(8.5, 7.5, -45) + g.txt(12, 7, 'R', 'f'),
  dimjogged: (g) => g.c(5.5, 10.5, 4) + g.p([8.5, 7.5, 10.5, 7.5, 9.5, 5.5, 13.5, 1.5], 'a') + g.arrow(8.5, 7.5, 180) + g.grip(13.5, 1.5),
  dimdiameter: (g) => g.c(7.5, 7.5, 6) + g.l(3.5, 11.5, 11.5, 3.5, 'a') + g.arrow(3.5, 11.5, 135) + g.arrow(11.5, 3.5, -45),
  dimangular: (g) => g.l(1.5, 13.5, 14.5, 13.5) + g.l(1.5, 13.5, 11.5, 3.5) + g.d('M11.5 13.5 A10 10 0 0 0 8.57 6.43', 'a') + g.arrow(11.5, 12.5, 90, 'f', true) + g.arrow(8.6, 6.4, -135, 'f', true),
  dimbaseline: (g) =>
    g.l(1.5, 14.5, 1.5, 2.5) + g.l(7.5, 14.5, 7.5, 7.5) + g.l(13.5, 14.5, 13.5, 2.5) + g.l(1.5, 9.5, 7.5, 9.5, 'a') + g.arrow(1.5, 9.5, 180) + g.arrow(7.5, 9.5, 0) + g.l(1.5, 3.5, 13.5, 3.5, 'a') + g.arrow(1.5, 3.5, 180) + g.arrow(13.5, 3.5, 0),
  dimcontinue: (g) =>
    g.l(1.5, 14.5, 1.5, 5.5) + g.l(7.5, 14.5, 7.5, 5.5) + g.l(13.5, 14.5, 13.5, 5.5) + g.l(1.5, 7.5, 13.5, 7.5, 'a') + g.arrow(1.5, 7.5, 180) + g.arrow(7.5, 7.5, 0) + g.arrow(13.5, 7.5, 0),
  dimspace: (g) =>
    g.l(1.5, 14.5, 1.5, 1.5) + g.l(14.5, 14.5, 14.5, 1.5) + g.l(1.5, 2.5, 14.5, 2.5, 'a') + g.l(1.5, 7.5, 14.5, 7.5, 'a') + g.l(1.5, 12.5, 14.5, 12.5, 'a') + g.l(7.5, 3.5, 7.5, 6.5, 'd') + g.l(7.5, 8.5, 7.5, 11.5, 'd'),
  dimbreak: (g) =>
    g.l(1.5, 14.5, 1.5, 5.5) + g.l(13.5, 14.5, 13.5, 5.5) + g.l(1.5, 7.5, 5.5, 7.5, 'a') + g.l(9.5, 7.5, 13.5, 7.5, 'a') + g.arrow(1.5, 7.5, 180) + g.arrow(13.5, 7.5, 0) + g.l(7.5, 1.5, 7.5, 14.5),
  mleader: (g) => g.arrow(1.5, 14.5, 135) + g.l(2.5, 13.5, 7.5, 6.5, 'a') + g.l(7.5, 6.5, 9.5, 6.5, 'a') + g.l(10.5, 3.5, 14.5, 3.5) + g.l(10.5, 6.5, 14.5, 6.5) + g.l(10.5, 9.5, 13.5, 9.5),
  leader: (g) => g.arrow(1.5, 14.5, 135) + g.l(2.5, 13.5, 7.5, 6.5, 'a') + g.l(7.5, 6.5, 9.5, 6.5, 'a') + g.txt(11, 4, 'A'),
  dimcenter: (g) =>
    g.c(7.5, 7.5, 5) + g.l(5.5, 7.5, 9.5, 7.5, 'a') + g.l(7.5, 5.5, 7.5, 9.5, 'a') + g.l(0.5, 7.5, 3.5, 7.5, 'a') + g.l(11.5, 7.5, 14.5, 7.5, 'a') + g.l(7.5, 0.5, 7.5, 3.5, 'a') + g.l(7.5, 11.5, 7.5, 14.5, 'a'),
  centerline: (g) => g.l(1.5, 3.5, 14.5, 3.5) + g.l(1.5, 11.5, 14.5, 11.5) + g.l(0.5, 7.5, 15.5, 7.5, 'a cl'),
  diminspect: (g) => g.d('M4.5 1.5 H10.5 A3 3 0 0 1 10.5 7.5 H4.5 A3 3 0 0 1 4.5 1.5 Z', 'a') + g.txt(4, 2, '25') + hdim(g, 1.5, 13.5, 15.5, 12.5),
  dimjogline: (g) => g.l(1.5, 14.5, 1.5, 5.5) + g.l(13.5, 14.5, 13.5, 5.5) + g.p([1.5, 7.5, 6.5, 7.5, 7.5, 5.5, 8.5, 9.5, 9.5, 7.5, 13.5, 7.5], 'a') + g.arrow(1.5, 7.5, 180) + g.arrow(13.5, 7.5, 0),
  dimedit: (g) => hdim(g, 1.5, 11.5, 9.5, 5.5) + pencil(g),
  dimtedit: (g) => hdim(g, 1.5, 13.5, 15.5, 12.5) + g.txt(4, 3, '10', 'f') + g.arrow(1.5, 5.5, 180) + g.arrow(13.5, 5.5, 0),
  dimupdate: (g) => hdim(g, 1.5, 10.5, 8.5, 4.5) + cycle(g, 11.5, 11.5, 3),
  dimstyle: (g) => hdim(g, 1.5, 10.5, 8.5, 4.5) + g.box(8, 9, 16, 16, 'bg') + g.r(8.5, 9.5, 14.5, 14.5, 'fa') + g.l(10.5, 11.5, 12.5, 11.5) + (g.md ? g.l(10.5, 13.5, 12.5, 13.5) : ''),

  // --- Standard ---
  new: (g) => sheet(g, g.l(5.5, 9.5, 9.5, 9.5, 'a') + g.l(7.5, 7.5, 7.5, 11.5, 'a')),
  open: (g) => g.d('M1.5 13.5 V2.5 H5.5 L7.5 4.5 H12.5 V7.5') + g.pg([1.5, 13.5, 4.5, 7.5, 14.5, 7.5, 11.5, 13.5], 'fa'),
  save: (g) => g.d('M1.5 1.5 H11.5 L14.5 4.5 V14.5 H1.5 Z') + g.r(4.5, 1.5, 10.5, 5.5, 'fa') + g.r(3.5, 8.5, 12.5, 14.5) + (g.md ? g.l(5.5, 11.5, 10.5, 11.5) : ''),
  plot: (g) => g.r(4.5, 1.5, 11.5, 5.5) + g.d('M4.5 11.5 H1.5 V5.5 H14.5 V11.5 H11.5') + g.r(4.5, 8.5, 11.5, 14.5, 'fa') + g.box(12, 7, 13, 8, 's'),
  undo: (g) => g.d('M3.5 5.5 H9.5 A3 3 0 0 1 9.5 11.5 H5.5', 'a') + g.arrow(1.5, 5.5, 180),
  redo: (g) => g.d('M12.5 5.5 H6.5 A3 3 0 0 0 6.5 11.5 H10.5', 'a') + g.arrow(14.5, 5.5, 0),
  matchprop: (g) => g.l(14, 2, 9, 7, 'w') + g.pg([7.5, 6.5, 9.5, 8.5, 7.5, 12.5, 2.5, 14.5, 3.5, 10.5], 'fa') + g.l(5.5, 9.5, 7.5, 11.5, 'a'),
  pan: (g) =>
    g.d('M4.5 9.5 V4.5 A1 1 0 0 1 6.5 4.5 V3.5 A1 1 0 0 1 8.5 3.5 A1 1 0 0 1 10.5 3.5 V4.5 A1 1 0 0 1 12.5 4.5 V10.5 L10.5 14.5 H6.5 L2.5 10.5 A1 1 0 0 1 4.5 9.5 Z', 'fa') +
    g.l(6.5, 4.5, 6.5, 8.5, 'a') + g.l(8.5, 3.5, 8.5, 8.5, 'a') + g.l(10.5, 4.5, 10.5, 8.5, 'a'),
  zoom: (g) => lens(g, g.l(4.5, 6.5, 8.5, 6.5, 'a') + g.l(6.5, 4.5, 6.5, 8.5, 'a') + g.l(12.5, 1.5, 14.5, 1.5, 'a') + g.l(13.5, 0.5, 13.5, 2.5, 'a')),
  zoomwindow: (g) => lens(g, g.r(4.5, 4.5, 8.5, 8.5, 'a')),
  zoomprevious: (g) => lens(g, g.l(5.5, 6.5, 8.5, 6.5, 'a') + g.arrow(4.5, 6.5, 180)),
  properties: (g) => g.r(2.5, 1.5, 13.5, 14.5) + g.r(2.5, 1.5, 13.5, 4.5, 'fa') + g.l(4.5, 7.5, 6.5, 7.5) + g.l(8.5, 7.5, 11.5, 7.5, 'a') + g.l(4.5, 10.5, 6.5, 10.5) + g.l(8.5, 10.5, 11.5, 10.5, 'a') + (g.md ? g.l(4.5, 12.5, 6.5, 12.5) + g.l(8.5, 12.5, 11.5, 12.5, 'a') : ''),
  help: (g) => g.c(7.5, 7.5, 6) + g.d('M5.5 5.5 A2 2 0 1 1 7.5 7.5 V8.5', 'a') + g.box(7, 10, 8, 11, 'f'),

  // --- Zoom ---
  zoomdynamic: (g) => lens(g, g.r(4.5, 4.5, 8.5, 8.5, 'fa') + g.l(4.5, 4.5, 8.5, 8.5, 'a')),
  zoomscale: (g) => lens(g, g.txt(5, 4, 'x', 'f')),
  zoomcenter: (g) => lens(g, g.l(4.5, 6.5, 8.5, 6.5, 'a') + g.l(6.5, 4.5, 6.5, 8.5, 'a') + g.box(6, 6, 7, 7, 'bg')),
  zoomobject: (g) => lens(g, g.box(5, 5, 8, 8, 'f')),
  zoomin: (g) => lens(g, g.l(4.5, 6.5, 8.5, 6.5, 'a') + g.l(6.5, 4.5, 6.5, 8.5, 'a')),
  zoomout: (g) => lens(g, g.l(4.5, 6.5, 8.5, 6.5, 'a')),
  zoomall: (g) => lens(g, g.txt(5, 4, 'A', 'f')),
  zoomextents: (g) => lens(g, g.p([4.5, 5.5, 4.5, 4.5, 5.5, 4.5], 'a') + g.p([7.5, 4.5, 8.5, 4.5, 8.5, 5.5], 'a') + g.p([4.5, 7.5, 4.5, 8.5, 5.5, 8.5], 'a') + g.p([7.5, 8.5, 8.5, 8.5, 8.5, 7.5], 'a')),

  // --- Layers ---
  layer: (g) => layers(g),
  laymcur: (g) => layersBadge(g, g.p([9, 11, 11, 13, 15, 9], 'a w')),
  layiso: (g) => layersBadge(g, g.c(12.5, 11.5, 3, 'a') + g.box(12, 11, 13, 12, 'f')),
  layuniso: (g) => layersBadge(g, cycle(g, 12.5, 11.5, 3)),
  layoff: (g) => layersBadge(g, g.c(12.5, 10.5, 2) + g.l(11.5, 13.5, 13.5, 13.5) + g.l(9.5, 8.5, 15.5, 14.5, 'a')),
  layon: (g) => layersBadge(g, g.c(12.5, 10.5, 2, 'fa') + g.l(11.5, 13.5, 13.5, 13.5)),
  layfrz: (g) => layersBadge(g, g.l(12.5, 8.5, 12.5, 14.5, 'a') + g.l(10.5, 9.5, 14.5, 13.5, 'a') + g.l(14.5, 9.5, 10.5, 13.5, 'a')),
  laythw: (g) =>
    layersBadge(g, g.c(12.5, 11.5, 2, 'f') + g.box(12, 8, 13, 9, 'f') + g.box(12, 14, 13, 15, 'f') + g.box(9, 11, 10, 12, 'f') + g.box(15, 11, 16, 12, 'f')),
  laylck: (g) => layersBadge(g, lock(g, false)),
  layulk: (g) => layersBadge(g, lock(g, true)),

  // --- Properties ---
  linetype: (g) => g.l(1.5, 2.5, 14.5, 2.5) + g.l(1.5, 6.5, 14.5, 6.5, 'a d') + g.l(1.5, 10.5, 14.5, 10.5, 'a cl') + g.l(2, 14, 14, 14, 'w'),

  // --- Object Snap ---
  snapend: (g) => g.l(2.5, 13.5, 11.5, 4.5) + g.r(9.5, 2.5, 13.5, 6.5, 'a'),
  snapmid: (g) => g.l(1.5, 11.5, 14.5, 11.5) + g.pg([7.5, 5.5, 11.5, 13.5, 3.5, 13.5], 'a'),
  snapint: (g) => g.l(1.5, 11.5, 13.5, 3.5) + g.l(1.5, 3.5, 13.5, 11.5) + g.l(4.5, 4.5, 10.5, 10.5, 'a') + g.l(10.5, 4.5, 4.5, 10.5, 'a'),
  snapapp: (g) => g.l(1.5, 13.5, 4.5, 10.5) + g.l(1.5, 1.5, 4.5, 4.5) + g.r(4.5, 4.5, 10.5, 10.5, 'a') + g.l(4.5, 4.5, 10.5, 10.5, 'a') + g.l(10.5, 4.5, 4.5, 10.5, 'a'),
  snapcen: (g) => g.c(7.5, 7.5, 6) + g.c(7.5, 7.5, 2, 'a') + g.box(7, 7, 8, 8, 'f'),
  snapgce: (g) => g.pg([7.5, 1.5, 13.5, 6.5, 11.5, 13.5, 3.5, 13.5, 1.5, 6.5]) + g.pg([7.5, 5, 8.6, 7.4, 10.9, 7.6, 9.1, 9.1, 9.7, 11.5, 7.5, 10.2, 5.3, 11.5, 5.9, 9.1, 4.1, 7.6, 6.4, 7.4], 'f'),
  snapqua: (g) => g.c(7.5, 9.5, 5) + g.pg([7.5, 1.5, 10.5, 4.5, 7.5, 7.5, 4.5, 4.5], 'a'),
  snaptan: (g) => g.d('M1.5 15.5 A6 6 0 0 1 13.5 15.5') + g.c(7.5, 9.5, 3, 'a') + g.l(3.5, 6.5, 11.5, 6.5, 'a'),
  snapper: (g) => g.l(1.5, 13.5, 14.5, 13.5) + g.l(5.5, 13.5, 5.5, 3.5, 'a') + g.p([5.5, 9.5, 9.5, 9.5, 9.5, 13.5], 'a'),
  snapnod: (g) => g.c(7.5, 7.5, 5, 'a') + g.l(4.5, 4.5, 10.5, 10.5, 'a') + g.l(10.5, 4.5, 4.5, 10.5, 'a'),
  snapnea: (g) => g.l(1.5, 13.5, 14.5, 13.5) + g.pg([4.5, 3.5, 10.5, 3.5, 4.5, 11.5, 10.5, 11.5], 'a'),
  osnap: (g) => g.d('M3.5 1.5 V8.5 A4 4 0 0 0 11.5 8.5 V1.5 H8.5 V8.5 A1 1 0 0 1 6.5 8.5 V1.5 Z', 'fa') + g.box(3, 1, 7, 4, 's') + g.box(8, 1, 12, 4, 's'),

  // --- UCS ---
  ucs: (g) => axes(g) + g.box(2, 13, 5, 16, 's') + (g.md ? g.txt(10, 8, 'X') + g.txt(5, 1, 'Y') : ''),
  ucsworld: (g) => axes(g) + g.c(10.5, 5.5, 3) + g.e(10.5, 5.5, 1, 3) + g.l(7.5, 5.5, 13.5, 5.5),
  ucsprevious: (g) => axes(g) + g.d('M14.5 2.5 V5.5 H9.5', 'a') + g.arrow(8.5, 5.5, 180),
  ucsface: (g) => g.pg([4.5, 6.5, 13.5, 2.5, 13.5, 9.5, 4.5, 13.5], 'fa') + axes(g, 2.5, 13.5, 6),
  ucsobject: (g) => g.c(10.5, 5.5, 3) + axes(g, 2.5, 13.5, 7),
  ucsview: (g) => g.r(1.5, 1.5, 14.5, 14.5, 'd') + axes(g, 4.5, 11.5, 5),
  ucs3point: (g) => axes(g, 2.5, 13.5, 9) + g.grip(2.5, 13.5) + g.grip(11.5, 13.5) + g.grip(2.5, 4.5),
  ucszaxis: (g) => g.l(2.5, 13.5, 11.5, 13.5) + g.l(2.5, 13.5, 8.5, 10.5) + g.l(2.5, 13.5, 2.5, 3.5, 'a') + g.arrow(2.5, 2.5, -90) + g.txt(9, 3, 'Z', 'f'),
  ucsx: (g) => axes(g) + g.d('M9.5 3.5 A2 3 0 1 1 9.5 9.5', 'a') + g.txt(12, 8, 'X'),
  ucsy: (g) => axes(g) + g.d('M5.5 6.5 A3 2 0 1 1 11.5 6.5', 'a') + g.txt(11, 8, 'Y'),
  ucsz: (g) => axes(g) + g.d('M6.5 9.5 A3 3 0 1 1 9.5 12.5', 'a') + g.txt(11, 1, 'Z'),
  ucsnamed: (g) => axes(g, 2.5, 13.5, 6) + g.l(8.5, 2.5, 14.5, 2.5, 'a') + g.l(8.5, 5.5, 14.5, 5.5, 'a') + g.l(8.5, 8.5, 14.5, 8.5, 'a'),

  // --- View ---
  views: (g) => frame(g, g.l(1.5, 4.5, 14.5, 4.5) + g.pg([7.5, 6.5, 10.5, 8, 10.5, 11, 7.5, 12.5, 4.5, 11, 4.5, 8], 'fa')),
  viewtop: (g) => viewIcon(g, TOP),
  viewbottom: (g) => viewIcon(g, BOTTOM, true),
  viewleft: (g) => viewIcon(g, BACK_LEFT, true),
  viewright: (g) => viewIcon(g, RIGHT),
  viewfront: (g) => viewIcon(g, LEFT),
  viewback: (g) => viewIcon(g, BACK_RIGHT, true),
  viewswiso: (g) => isoIcon(g, -1, 1),
  viewseiso: (g) => isoIcon(g, 1, 1),
  viewneiso: (g) => isoIcon(g, 1, -1),
  viewnwiso: (g) => isoIcon(g, -1, -1),

  // --- Visual Styles ---
  vs2d: (g) => g.r(1.5, 1.5, 14.5, 14.5) + g.c(7.5, 7.5, 4, 'a') + center(g, 7.5, 7.5),
  vs3d: (g) => cube(g, 'a') + hiddenEdges(g),
  vshidden: (g) => cube(g, 'a'),
  vsshaded: (g) => g.pg(TOP, 'f') + g.pg(LEFT, 'f o7') + g.pg(RIGHT, 'f o4'),
  vsedges: (g) => g.pg(TOP, 'f') + g.pg(LEFT, 'f o7') + g.pg(RIGHT, 'f o4') + cube(g),

  // --- Viewports ---
  vports: (g) => g.r(1.5, 1.5, 14.5, 14.5) + g.l(7.5, 1.5, 7.5, 14.5, 'a') + g.l(1.5, 7.5, 14.5, 7.5, 'a'),
  mview: (g) => sheet(g, g.r(4.5, 7.5, 11.5, 12.5, 'fa')),
  vpclip: (g) => g.r(1.5, 1.5, 14.5, 14.5) + g.pg([4.5, 4.5, 11.5, 4.5, 9.5, 7.5, 11.5, 11.5, 4.5, 11.5], 'a d'),
  vpmax: (g) => g.r(1.5, 1.5, 14.5, 14.5) + g.l(5.5, 5.5, 10.5, 10.5, 'a') + g.arrow(4.5, 4.5, 225) + g.arrow(11.5, 11.5, 45),
  vpmin: (g) => g.r(1.5, 1.5, 14.5, 14.5) + g.r(5.5, 5.5, 10.5, 10.5, 'fa') + g.l(2.5, 2.5, 4.5, 4.5, 'd') + g.l(13.5, 13.5, 11.5, 11.5, 'd'),
  vplayer: (g) => g.r(1.5, 1.5, 14.5, 14.5) + g.pg([8.5, 3.5, 12.5, 5.5, 8.5, 7.5, 4.5, 5.5], 'fa') + g.p([4.5, 8.5, 8.5, 10.5, 12.5, 8.5]) + g.p([4.5, 11.5, 8.5, 13.5, 12.5, 11.5]),

  // --- Layouts ---
  layoutnew: (g) => sheet(g, g.l(5.5, 8.5, 9.5, 8.5, 'a') + g.l(7.5, 6.5, 7.5, 10.5, 'a') + g.r(4.5, 12.5, 11.5, 12.5)),
  pagesetup: (g) => sheet(g, g.r(4.5, 7.5, 11.5, 10.5, 'a') + g.box(4, 12, 12, 13, 'f')),
  publish: (g) => g.d('M5.5 0.5 H11.5 L14.5 3.5 V11.5', 'd') + sheet(g, g.l(4.5, 9.5, 9.5, 9.5, 'a') + g.arrow(10.5, 9.5, 0)),

  // --- Modeling ---
  box: (g) => cube(g) + g.pg(TOP, 'fa'),
  cylinder: (g) => g.e(7.5, 4.5, 5, 2, 'fa') + g.l(2.5, 4.5, 2.5, 11.5) + g.l(12.5, 4.5, 12.5, 11.5) + g.d('M2.5 11.5 A5 2 0 0 0 12.5 11.5') + (g.md ? g.d('M2.5 11.5 A5 2 0 0 1 12.5 11.5', 'd') : ''),
  cone: (g) => g.e(7.5, 11.5, 5, 2) + g.l(2.5, 11.5, 7.5, 1.5, 'a') + g.l(12.5, 11.5, 7.5, 1.5, 'a'),
  sphere: (g) => g.c(7.5, 7.5, 6, 'fa') + g.e(7.5, 7.5, 6, 2) + (g.md ? g.e(7.5, 7.5, 2, 6, 'd') : ''),
  torus: (g) => g.e(7.5, 7.5, 7, 4, 'fa') + g.e(7.5, 7.5, 3, 1, 'bg') + g.d('M4.5 7.5 A3 1.5 0 0 0 10.5 7.5'),
  extrude: (g) =>
    g.pg([1.5, 12.5, 5.5, 10.5, 9.5, 12.5, 5.5, 14.5], 'fa') +
    g.l(1.5, 12.5, 1.5, 6.5) + g.l(9.5, 12.5, 9.5, 6.5) + g.l(5.5, 14.5, 5.5, 8.5) +
    g.pg([1.5, 6.5, 5.5, 4.5, 9.5, 6.5, 5.5, 8.5]) +
    g.l(13.5, 11.5, 13.5, 3.5, 'a') + g.arrow(13.5, 2.5, -90),
  revolve: (g) => g.l(3.5, 0.5, 3.5, 15.5, 'cl') + g.pg([3.5, 3.5, 7.5, 3.5, 7.5, 8.5, 9.5, 10.5, 9.5, 12.5, 3.5, 12.5], 'fa') + g.d('M11.5 3.5 A3 4 0 0 1 11.5 12.5', 'a') + g.arrow(10.5, 12.5, 180),
  align: (g) => g.r(1.5, 9.5, 6.5, 14.5) + g.pg([8.5, 3.5, 12.5, 1.5, 14.5, 5.5, 10.5, 7.5], 'a') + g.l(6.5, 9.5, 9.5, 7.5, 'd') + g.grip(6.5, 9.5) + g.grip(10.5, 7.5, 'f'),
  flatshot: (g) => g.pg([8.5, 0.5, 12.5, 2.5, 12.5, 6.5, 8.5, 8.5, 4.5, 6.5, 4.5, 2.5]) + g.p([4.5, 2.5, 8.5, 4.5, 12.5, 2.5]) + g.l(8.5, 4.5, 8.5, 8.5) + g.pg([1.5, 14.5, 4.5, 10.5, 14.5, 10.5, 11.5, 14.5], 'fa') + g.l(4.5, 7.5, 4.5, 10.5, 'd') + g.l(12.5, 7.5, 12.5, 10.5, 'd'),

  // --- Solid Editing ---
  union: (g) => g.d('M7.5 4.04 A4 4 0 1 0 7.5 10.96 A4 4 0 1 0 7.5 4.04 Z', 'fa') + (g.md ? g.d('M7.5 4.04 A4 4 0 0 1 7.5 10.96 A4 4 0 0 1 7.5 4.04', 'a d') : ''),
  subtract: (g) => g.d('M7.5 4.04 A4 4 0 1 0 7.5 10.96 A4 4 0 0 1 7.5 4.04 Z', 'fa') + g.c(9.5, 7.5, 4, 'd'),
  intersect: (g) => g.c(5.5, 7.5, 4, 'd') + g.c(9.5, 7.5, 4, 'd') + g.d('M7.5 4.04 A4 4 0 0 1 7.5 10.96 A4 4 0 0 1 7.5 4.04 Z', 'fa'),
  filletedge: (g) => g.pg([1.5, 5.5, 7.5, 2.5, 13.5, 5.5, 13.5, 11.5, 7.5, 14.5, 1.5, 11.5]) + g.l(7.5, 8.5, 7.5, 14.5) + g.p([1.5, 5.5, 4.5, 7], 'a') + g.d('M4.5 7 A3 3 0 0 0 10.5 7', 'a') + g.p([10.5, 7, 13.5, 5.5], 'a'),
  chamferedge: (g) => g.pg([1.5, 5.5, 7.5, 2.5, 13.5, 5.5, 13.5, 11.5, 7.5, 14.5, 1.5, 11.5]) + g.l(7.5, 9.5, 7.5, 14.5) + g.p([1.5, 5.5, 5.5, 7.5, 9.5, 7.5, 13.5, 5.5], 'a') + g.l(5.5, 7.5, 7.5, 9.5, 'a') + g.l(9.5, 7.5, 7.5, 9.5, 'a'),

  // --- Text ---
  field: (g) => g.r(1.5, 3.5, 14.5, 12.5, 'fa') + g.txt(5, 5, '#'),
  updatefield: (g) => g.r(0.5, 1.5, 9.5, 8.5, 'fa') + g.txt(3, 3, '#') + cycle(g, 11.5, 11.5, 3),

  // --- Multileader ---
  mleaderedit: (g) => g.arrow(1.5, 14.5, 135) + g.l(2.5, 13.5, 8.5, 6.5, 'a') + g.arrow(1.5, 7.5, 165) + g.l(2.5, 7.5, 8.5, 6.5, 'a') + g.l(8.5, 6.5, 11.5, 6.5) + g.l(13.5, 0.5, 13.5, 4.5, 'a') + g.l(11.5, 2.5, 15.5, 2.5, 'a'),
  mleaderalign: (g) => g.arrow(1.5, 5.5, 165) + g.l(2.5, 5.5, 7.5, 3.5) + g.arrow(1.5, 12.5, 165) + g.l(2.5, 12.5, 7.5, 10.5) + g.l(9.5, 3.5, 14.5, 3.5) + g.l(9.5, 10.5, 14.5, 10.5) + g.l(8.5, 0.5, 8.5, 15.5, 'a d'),
  mleaderstyle: (g) => g.arrow(1.5, 14.5, 135) + g.l(2.5, 13.5, 6.5, 7.5, 'a') + g.l(6.5, 7.5, 8.5, 7.5, 'a') + g.r(9.5, 1.5, 14.5, 7.5, 'fa') + g.l(11.5, 3.5, 12.5, 3.5) + g.l(11.5, 5.5, 12.5, 5.5),

  // --- Insert ---
  attdef: (g) => g.r(0.5, 3.5, 15.5, 11.5) + g.txt(2, 5, 'TAG', 'f'),
  import: (g) => sheet(g) + g.box(0, 8, 6, 12, 'bg') + g.l(0.5, 9.5, 6.5, 9.5, 'a') + g.arrow(8.5, 9.5, 0),

  // --- Inquiry ---
  dist: (g) => g.l(1.5, 14.5, 1.5, 8.5) + g.l(13.5, 7.5, 13.5, 1.5) + g.l(1.5, 11.5, 13.5, 4.5, 'a') + g.arrow(1.5, 11.5, 150) + g.arrow(13.5, 4.5, -30),

  // --- Drawing Views ---
  viewbase: (g) => sheet(g, g.r(4.5, 7.5, 8.5, 11.5, 'a') + g.pg([10.5, 9.5, 11.5, 9, 12.5, 9.5, 12.5, 11.5, 11.5, 12, 10.5, 11.5], 'fa')),
  viewproj: (g) => g.r(1.5, 8.5, 6.5, 13.5, 'fa') + g.r(9.5, 8.5, 14.5, 13.5) + g.r(1.5, 1.5, 6.5, 6.5) + g.l(7.5, 11.5, 8.5, 11.5, 'd') + g.l(4.5, 7.5, 4.5, 7.5, 'd'),
  viewedit: (g) => g.r(1.5, 1.5, 11.5, 9.5) + g.r(3.5, 3.5, 8.5, 7.5, 'a') + pencil(g),
  viewupdate: (g) => g.r(1.5, 1.5, 11.5, 9.5) + g.r(3.5, 3.5, 8.5, 7.5, 'a') + cycle(g, 11.5, 11.5, 3),
  viewstd: (g) => g.pg([1.5, 5.5, 6.5, 3.5, 6.5, 11.5, 1.5, 9.5], 'a') + g.l(0.5, 7.5, 7.5, 7.5, 'cl') + g.c(11.5, 7.5, 3) + g.c(11.5, 7.5, 1) + g.l(8.5, 7.5, 15.5, 7.5, 'cl'),
  solprof: (g) => g.pg([6.5, 0.5, 10.5, 2.5, 10.5, 6.5, 6.5, 8.5, 2.5, 6.5, 2.5, 2.5]) + g.p([2.5, 2.5, 6.5, 4.5, 10.5, 2.5]) + g.l(6.5, 4.5, 6.5, 8.5) + g.r(6.5, 10.5, 14.5, 14.5, 'a d') + g.l(4.5, 9.5, 7.5, 11.5, 'a'),

  // --- Vista de obra del celular (los demás botones usan los de arriba: layer, dist, pan) ---
  /**
   * Encuadrar todo: la pieza (un perfil en L, en el color del texto) y las esquinas del encuadre (lo que cambia) en
   * acento. Un rectángulo con agujero se leía como una cámara.
   */
  fit: (g) =>
    g.p([1.5, 4.5, 1.5, 1.5, 4.5, 1.5], 'a') + g.p([10.5, 1.5, 13.5, 1.5, 13.5, 4.5], 'a') + g.p([13.5, 10.5, 13.5, 13.5, 10.5, 13.5], 'a') + g.p([4.5, 13.5, 1.5, 13.5, 1.5, 10.5], 'a') +
    g.pg([4.5, 4.5, 7.5, 4.5, 7.5, 7.5, 10.5, 7.5, 10.5, 10.5, 4.5, 10.5]),
  /**
   * Vistas: el cubo desplegado del ViewNet (las seis vistas de Monge en cruz) con el alzado en acento. Celdas iguales:
   * se cuentan en píxeles reales (3, 4 o 5 px), como las piezas de `array`.
   */
  viewnet: (g) => {
    const c = g.v(3, 4, 5)
    const x0 = Math.floor((g.S - 4 * c - 1) / 2)
    const y0 = Math.floor((g.S - 3 * c - 1) / 2)
    const cell = (col: number, row: number, k?: string) => g.rpx(x0 + col * c, y0 + row * c, c + 1, c + 1, k)
    return cell(0, 1) + cell(2, 1) + cell(3, 1) + cell(1, 0) + cell(1, 2) + cell(1, 1, 'fa')
  },
  /**
   * Estilo visual: la esfera mitad en alambre (meridiano y ecuador) y mitad sombreada en acento. Un cubo sombreado
   * (`vsedges`) pesaba el doble que el resto de la barra y se confundía con la marca.
   */
  visualstyle: (g) =>
    g.c(7.5, 7.5, 6) + g.d('M7.5 1.5 A3 6 0 0 0 7.5 13.5') + g.l(1.5, 7.5, 7.5, 7.5) + g.d('M7.5 1.5 A6 6 0 0 1 7.5 13.5 Z', 'fa'),
  /** Órbita: el cubo y el anillo de la cámara en acento; la parte de atrás del anillo queda tapada por el cubo. */
  orbit: (g) =>
    g.d('M0.5 9.5 A7 4 0 0 1 3.5 6.22', 'a') +
    g.d('M11.5 6.22 A7 4 0 0 1 14.5 9.5', 'a') +
    g.pg([7.5, 2.5, 11.5, 4.5, 11.5, 9.5, 7.5, 11.5, 3.5, 9.5, 3.5, 4.5]) +
    g.p([3.5, 4.5, 7.5, 6.5, 11.5, 4.5]) +
    g.l(7.5, 6.5, 7.5, 11.5) +
    g.d('M0.5 9.5 A7 4 0 0 0 12.9 12.1', 'a') +
    g.arrow(13.8, 11.2, -50, 'f', true),
}

/**
 * Íconos cuyo dibujo es simétrico respecto del centro real (8) y no de la columna 7: marcos y hojas de lado a lado.
 * `[x, y]`; el resto usa 7.5 en los dos ejes.
 */
const CENTER: Record<string, [number, number]> = {
  rectangle: [8, 8],
  hatch: [8, 8],
  block: [8, 8],
  mtext: [8, 7.5],
  offset: [8, 8],
  dimspace: [8, 7.5],
  centerline: [8, 7.5],
  new: [8, 8],
  open: [8, 8],
  save: [8, 8],
  plot: [8, 8],
  properties: [8, 8],
  linetype: [8, 7.5],
  ucsview: [8, 8],
  views: [8, 8],
  vs2d: [8, 8],
  vports: [8, 8],
  vpclip: [8, 8],
  vpmax: [8, 8],
  vpmin: [8, 8],
  vplayer: [8, 8],
  mview: [8, 8],
  layoutnew: [8, 8],
  pagesetup: [8, 8],
  publish: [8, 8],
  field: [8, 8],
  attdef: [8, 7.5],
  import: [8, 8],
  viewbase: [8, 8],
}

/**
 * Íconos de la vista de obra del celular: botón → ícono del set. Van a 24 px (`lg`), no a 22: 24 es 16 × 1.5 (cada
 * dos columnas de diseño son tres píxeles exactos, frente a 16 × 1.375, que recién cierra cada ocho), es el grande de
 * las barras (ya revisado en los 170) y el tamaño estándar de ícono de una barra inferior de teléfono.
 */
export const MOBILE_ICONS = {
  fit: 'fit',
  views: 'viewnet',
  style: 'visualstyle',
  layers: 'layer',
  measure: 'dist',
  orbit: 'orbit',
  pan: 'pan',
} as const
export type MobileIconName = keyof typeof MOBILE_ICONS
export const MOBILE_ICON_SIZE: IconSize = 'lg'

const cache = new Map<string, string>()

/** Marcado del ícono `name` para el tamaño pedido (memorizado); '' si no existe. */
export function iconMarkup(name: string, size: IconSize = 'sm'): string {
  const key = `${size}:${name}`
  let s = cache.get(key)
  if (s === undefined) {
    const draw = ICONS[name]
    const [ax, ay] = CENTER[name] ?? [7.5, 7.5]
    s = draw ? draw(gridFor(size, ax, ay)) : ''
    cache.set(key, s)
  }
  return s
}

export { ICON_PX }
