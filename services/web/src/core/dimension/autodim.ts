/**
 * Acotación automática de una pieza (AUTODIM), con las reglas de acotación de dibujo técnico
 * (ISO 129 / IRAM 4513) sobre la geometría 2D de una vista:
 * - cotas totales (ancho y alto);
 * - posiciones de los escalones (aristas verticales u horizontales) y de los centros de los agujeros, en
 *   paralelo desde el borde inferior izquierdo (datum) o en cadena;
 * - el diámetro de cada círculo y el radio de cada arco, agrupando los iguales (`n× ⌀10`).
 * Las cotas van afuera de la vista: las horizontales debajo y las verticales a la izquierda, escalonadas.
 * Pura y testeable: devuelve "pedidos" de cota en las coordenadas 2D de la vista.
 */

export type P2 = [number, number]

export type Geo2D =
  | { kind: 'line'; a: P2; b: P2 }
  | { kind: 'circle'; c: P2; r: number }
  | { kind: 'arc'; c: P2; r: number; a0: number; a1: number }

export type DimRequest =
  | { kind: 'linear'; axis: 'x' | 'y'; p1: P2; p2: P2; at: P2 }
  | { kind: 'diameter' | 'radius'; c: P2; on: P2; at: P2; count: number }

export interface AutodimOptions {
  /** En paralelo desde el datum (por defecto) o en cadena. */
  type: 'baseline' | 'chain'
  /** Todo o sólo las cotas totales. */
  features: 'all' | 'overall'
  /** Qué ejes acotar. */
  axes: { x: boolean; y: boolean }
  /**
   * Posiciones ya acotadas en otra vista alineada (una proyectada comparte un eje con su madre): no se
   * repiten, pero lo que sólo se ve en esta vista (p. ej. los agujeros en la planta) sí se acota.
   */
  skip?: { x?: number[]; y?: number[] }
  /** Distancia de la primera línea de cota al contorno y entre líneas de cota (unidades de la vista). */
  offset: number
  step: number
  /** Tolerancia para considerar iguales coordenadas y radios. */
  tol: number
}

/** Extremos y cuadrantes que recorre un arco (su caja real: un empalme ocupa un cuarto, no el círculo). */
function arcExtremes(g: Extract<Geo2D, { kind: 'arc' }>): P2[] {
  const at = (a: number): P2 => [g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)]
  let sweep = g.a1 - g.a0
  while (sweep <= 0) sweep += 2 * Math.PI
  const out: P2[] = [at(g.a0), at(g.a0 + sweep)]
  for (let k = Math.ceil(g.a0 / (Math.PI / 2)); k * (Math.PI / 2) < g.a0 + sweep; k++) out.push(at(k * (Math.PI / 2)))
  return out
}

/** Valores distintos (con tolerancia), ordenados. */
function distinct(values: number[], tol: number): number[] {
  const out: number[] = []
  for (const v of [...values].sort((a, b) => a - b)) if (!out.length || v - out[out.length - 1] > tol) out.push(v)
  return out
}

export function autodim(geo: Geo2D[], o: AutodimOptions): DimRequest[] {
  const pts: P2[] = []
  for (const g of geo) {
    if (g.kind === 'line') pts.push(g.a, g.b)
    else if (g.kind === 'circle') pts.push([g.c[0] - g.r, g.c[1] - g.r], [g.c[0] + g.r, g.c[1] + g.r])
    else pts.push(...arcExtremes(g))
  }
  if (pts.length === 0) return []
  const x0 = Math.min(...pts.map((p) => p[0]))
  const x1 = Math.max(...pts.map((p) => p[0]))
  const y0 = Math.min(...pts.map((p) => p[1]))
  const y1 = Math.max(...pts.map((p) => p[1]))
  const tol = o.tol
  const out: DimRequest[] = []

  // Posiciones a acotar en X (aristas verticales y centros de círculos) y en Y (aristas horizontales y centros).
  const circles = geo.filter((g): g is Extract<Geo2D, { kind: 'circle' }> => g.kind === 'circle')
  const arcs = geo.filter((g): g is Extract<Geo2D, { kind: 'arc' }> => g.kind === 'arc')
  const lines = geo.filter((g): g is Extract<Geo2D, { kind: 'line' }> => g.kind === 'line')
  const vert = lines.filter((l) => Math.abs(l.a[0] - l.b[0]) <= tol && Math.abs(l.a[1] - l.b[1]) > tol)
  const horz = lines.filter((l) => Math.abs(l.a[1] - l.b[1]) <= tol && Math.abs(l.a[0] - l.b[0]) > tol)
  const xsAll = o.features === 'all' ? [...vert.map((l) => l.a[0]), ...circles.map((c) => c.c[0]), x1] : [x1]
  const ysAll = o.features === 'all' ? [...horz.map((l) => l.a[1]), ...circles.map((c) => c.c[1]), y1] : [y1]
  const done = (list: number[] | undefined, v: number) => !!list?.some((w) => Math.abs(w - v) <= tol)
  const xs = distinct(xsAll, tol).filter((x) => x > x0 + tol && !done(o.skip?.x, x))
  const ys = distinct(ysAll, tol).filter((y) => y > y0 + tol && !done(o.skip?.y, y))

  /** Punto de origen de la línea de referencia: lo más bajo (o lo más a la izquierda) de la geometría en esa posición. */
  const lowAt = (x: number): P2 => {
    let best: P2 | null = null
    for (const l of vert) if (Math.abs(l.a[0] - x) <= tol) for (const p of [l.a, l.b]) if (!best || p[1] < best[1]) best = p
    for (const c of circles) if (Math.abs(c.c[0] - x) <= tol && (!best || c.c[1] < best[1])) best = c.c
    for (const p of pts) if (Math.abs(p[0] - x) <= tol && (!best || p[1] < best[1])) best = p
    return best ?? [x, y0]
  }
  const leftAt = (y: number): P2 => {
    let best: P2 | null = null
    for (const l of horz) if (Math.abs(l.a[1] - y) <= tol) for (const p of [l.a, l.b]) if (!best || p[0] < best[0]) best = p
    for (const c of circles) if (Math.abs(c.c[1] - y) <= tol && (!best || c.c[0] < best[0])) best = c.c
    for (const p of pts) if (Math.abs(p[1] - y) <= tol && (!best || p[0] < best[0])) best = p
    return best ?? [x0, y]
  }

  if (o.axes.x && xs.length) {
    const base = lowAt(x0)
    let prev = base
    xs.forEach((x, i) => {
      const p = lowAt(x)
      const row = o.type === 'baseline' ? i : 0
      // La total, en paralelo, queda la más alejada (la última); en cadena, la total va en una fila aparte.
      out.push({ kind: 'linear', axis: 'x', p1: o.type === 'baseline' ? base : prev, p2: p, at: [(prev[0] + p[0]) / 2, y0 - o.offset - row * o.step] })
      prev = p
    })
    if (o.type === 'chain' && xs.length > 1) out.push({ kind: 'linear', axis: 'x', p1: base, p2: lowAt(x1), at: [(x0 + x1) / 2, y0 - o.offset - o.step] })
  }
  if (o.axes.y && ys.length) {
    const base = leftAt(y0)
    let prev = base
    ys.forEach((y, i) => {
      const p = leftAt(y)
      const col = o.type === 'baseline' ? i : 0
      out.push({ kind: 'linear', axis: 'y', p1: o.type === 'baseline' ? base : prev, p2: p, at: [x0 - o.offset - col * o.step, (prev[1] + p[1]) / 2] })
      prev = p
    })
    if (o.type === 'chain' && ys.length > 1) out.push({ kind: 'linear', axis: 'y', p1: base, p2: leftAt(y1), at: [x0 - o.offset - o.step, (y0 + y1) / 2] })
  }

  if (o.features === 'all') {
    // Diámetros y radios: uno por medida, con la cantidad (n×) de los iguales.
    const radial = (kind: 'diameter' | 'radius', list: Array<{ c: P2; r: number; mid?: number }>) => {
      const groups: Array<{ r: number; items: typeof list }> = []
      for (const g of list) {
        const grp = groups.find((x) => Math.abs(x.r - g.r) <= tol)
        if (grp) grp.items.push(g)
        else groups.push({ r: g.r, items: [g] })
      }
      for (const grp of groups) {
        // El de más arriba a la derecha (su cota sale hacia afuera de la pieza).
        const g = grp.items.reduce((a, b) => (b.c[0] + b.c[1] > a.c[0] + a.c[1] ? b : a))
        const ang = g.mid ?? Math.PI / 4
        const dir: P2 = [Math.cos(ang), Math.sin(ang)]
        const on: P2 = [g.c[0] + dir[0] * g.r, g.c[1] + dir[1] * g.r]
        const at: P2 = [g.c[0] + dir[0] * (g.r + o.offset), g.c[1] + dir[1] * (g.r + o.offset)]
        out.push({ kind, c: g.c, on, at, count: grp.items.length })
      }
    }
    radial('diameter', circles)
    radial(
      'radius',
      arcs.map((a) => {
        let sweep = a.a1 - a.a0
        while (sweep <= 0) sweep += 2 * Math.PI
        return { c: a.c, r: a.r, mid: a.a0 + sweep / 2 }
      }),
    )
  }
  return out
}

/** Coordenadas que acotan los pedidos lineales (para no repetirlas en las vistas alineadas). */
export function dimensionedPositions(reqs: DimRequest[]): { x: number[]; y: number[] } {
  const x: number[] = []
  const y: number[] = []
  for (const r of reqs) {
    if (r.kind !== 'linear') continue
    if (r.axis === 'x') x.push(r.p1[0], r.p2[0])
    else y.push(r.p1[1], r.p2[1])
  }
  return { x, y }
}
