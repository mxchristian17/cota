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
  /**
   * Lugar libre alrededor de la vista (hasta la vista vecina o el borde de la hoja), en unidades de la vista. Si las
   * filas de cotas no entran debajo (o a la izquierda) van del otro lado; si tampoco, en cadena; y si aún no entran,
   * sólo la total (B06, R19). Sin `room`, sin límite.
   */
  room?: { below: number; above: number; left: number; right: number }
  /** Ancho del texto de una cota que mide `span` (unidades de la vista): las de una cadena que se pisan se escalonan. */
  textWidth?: (span: number) => number
  /** Cómo quedó cada eje (para informar lo que no entró). */
  onPlan?: (axis: 'x' | 'y', plan: AxisPlan) => void
}

/** Cómo quedó un eje: lado, tipo y cuántas posiciones no entraron. */
export interface AxisPlan {
  side: 'near' | 'far'
  type: 'baseline' | 'chain'
  dropped: number
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

  /** Punto de origen de la línea de referencia: lo más bajo/alto (o lo más a la izquierda/derecha) de la geometría en esa posición. */
  const endAt = (x: number, high: boolean): P2 => {
    let best: P2 | null = null
    const better = (p: P2) => !best || (high ? p[1] > best[1] : p[1] < best[1])
    for (const l of vert) if (Math.abs(l.a[0] - x) <= tol) for (const p of [l.a, l.b]) if (better(p)) best = p
    for (const c of circles) if (Math.abs(c.c[0] - x) <= tol && better(c.c)) best = c.c
    for (const p of pts) if (Math.abs(p[0] - x) <= tol && better(p)) best = p
    return best ?? [x, high ? y1 : y0]
  }
  const sideAt = (y: number, right: boolean): P2 => {
    let best: P2 | null = null
    const better = (p: P2) => !best || (right ? p[0] > best[0] : p[0] < best[0])
    for (const l of horz) if (Math.abs(l.a[1] - y) <= tol) for (const p of [l.a, l.b]) if (better(p)) best = p
    for (const c of circles) if (Math.abs(c.c[1] - y) <= tol && better(c.c)) best = c.c
    for (const p of pts) if (Math.abs(p[1] - y) <= tol && better(p)) best = p
    return best ?? [right ? x1 : x0, y]
  }

  /** Filas que ocupa un tipo de acotación con `n` posiciones. */
  const rowsOf = (type: 'baseline' | 'chain', n: number) => (type === 'baseline' ? n : n > 1 ? 2 : 1)
  const fits = (rows: number, room: number | undefined) => room === undefined || o.offset + (rows - 1) * o.step + 0.6 * o.step <= room + 1e-9
  /** Lado, tipo y posiciones de un eje según el lugar libre (ver `room`). */
  const plan = (list: number[], near: number | undefined, far: number | undefined, total: number): { list: number[]; plan: AxisPlan } => {
    for (const type of o.type === 'baseline' ? (['baseline', 'chain'] as const) : (['chain'] as const)) {
      const rows = rowsOf(type, list.length)
      if (fits(rows, near)) return { list, plan: { side: 'near', type, dropped: 0 } }
      if (fits(rows, far)) return { list, plan: { side: 'far', type, dropped: 0 } }
    }
    // Sin lugar: sólo la total, del lado con más espacio.
    const side = (near ?? Infinity) >= (far ?? Infinity) ? 'near' : 'far'
    return { list: [total], plan: { side, type: o.type, dropped: list.length - 1 } }
  }

  if (o.axes.x && xs.length) {
    const { list, plan: px } = plan(xs, o.room?.below, o.room?.above, x1)
    o.onPlan?.('x', px)
    const far = px.side === 'far'
    const rowY = (row: number) => (far ? y1 + o.offset + row * o.step : y0 - o.offset - row * o.step)
    const base = endAt(x0, far)
    let prev = base
    const ends = [-Infinity, -Infinity] // fin del último texto en la fila y en la media fila (cadena)
    list.forEach((x, i) => {
      const p = endAt(x, far)
      let row = px.type === 'baseline' ? i : 0
      if (px.type === 'chain' && o.textWidth) {
        // En cadena, una cota cuyo texto pisaría el de la anterior pasa a media fila (textos escalonados).
        const w = o.textWidth(Math.abs(p[0] - prev[0]))
        const left = (prev[0] + p[0]) / 2 - w / 2
        const k = left >= ends[0] || left < ends[1] ? 0 : 1
        ends[k] = left + w
        row = k * 0.5
      }
      out.push({ kind: 'linear', axis: 'x', p1: px.type === 'baseline' ? base : prev, p2: p, at: [(prev[0] + p[0]) / 2, rowY(row)] })
      prev = p
    })
    if (px.type === 'chain' && list.length > 1) out.push({ kind: 'linear', axis: 'x', p1: base, p2: endAt(x1, far), at: [(x0 + x1) / 2, rowY(1)] })
  }
  if (o.axes.y && ys.length) {
    const { list, plan: py } = plan(ys, o.room?.left, o.room?.right, y1)
    o.onPlan?.('y', py)
    const far = py.side === 'far'
    const colX = (col: number) => (far ? x1 + o.offset + col * o.step : x0 - o.offset - col * o.step)
    const base = sideAt(y0, far)
    let prev = base
    list.forEach((y, i) => {
      const p = sideAt(y, far)
      const col = py.type === 'baseline' ? i : 0
      out.push({ kind: 'linear', axis: 'y', p1: py.type === 'baseline' ? base : prev, p2: p, at: [colX(col), (prev[1] + p[1]) / 2] })
      prev = p
    })
    if (py.type === 'chain' && list.length > 1) out.push({ kind: 'linear', axis: 'y', p1: base, p2: sideAt(y1, far), at: [colX(1), (y0 + y1) / 2] })
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
