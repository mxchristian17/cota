import type { ShadeProps } from '../document/types'
import type { Vec3 } from '../math'
import type { Mesh, ProjBasis } from './orthographic'

/**
 * Sombreado de las vistas de dibujo: las caras visibles de los sólidos proyectadas en la base de la
 * vista, con sombreado plano (luz desde el observador, arriba a la izquierda, como el estilo *Shaded* del
 * CAD clásico) sobre el color de su capa, ordenadas de atrás hacia adelante para pintarlas en orden.
 */

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
/** Escala de la profundidad guardada en z (unidades por unidad de modelo). */
const SHADE_DEPTH = 1e-3
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (v: Vec3): Vec3 => {
  const L = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / L, v[1] / L, v[2] / L]
}

/** `#rrggbb` → [r, g, b] en 0..1. */
export function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0xc0c0c0
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/**
 * Triángulos sombreados de las mallas vistas en `basis`, en coordenadas de la vista (u, v, 0). `colors` es el
 * color de cada malla. Un color casi blanco (la capa 0 en fondo oscuro) se toma gris claro, así el sombreado se
 * ve sobre el papel blanco.
 */
export function shadeViewTriangles(meshes: Mesh[], colors: string[], basis: ProjBasis): ShadeProps {
  const L = unit([basis.out[0] * 0.75 + basis.up[0] * 0.45 - basis.right[0] * 0.35, basis.out[1] * 0.75 + basis.up[1] * 0.45 - basis.right[1] * 0.35, basis.out[2] * 0.75 + basis.up[2] * 0.45 - basis.right[2] * 0.35])
  const faces: Array<{ d: number; p: number[]; c: [number, number, number] }> = []
  meshes.forEach((m, mi) => {
    let base = hexRgb(colors[mi] ?? '#c0c0c0')
    if (base[0] > 0.9 && base[1] > 0.9 && base[2] > 0.9) base = [0.78, 0.8, 0.84]
    for (const f of m.faces) {
      for (let k = 1; k + 1 < f.length; k++) {
        const [a, b, c] = [m.vertices[f[0]], m.vertices[f[k]], m.vertices[f[k + 1]]]
        const n = unit(cross(sub(b, a), sub(c, a)))
        const facing = dot(n, basis.out)
        if (facing <= 1e-9) continue // de espaldas: no se ve
        const lambert = Math.max(0, dot(n, L))
        const s = 0.35 + 0.65 * lambert
        const uv = (p: Vec3) => [dot(p, basis.right), dot(p, basis.up), dot(p, basis.out)]
        faces.push({ d: (dot(a, basis.out) + dot(b, basis.out) + dot(c, basis.out)) / 3, p: [...uv(a), ...uv(b), ...uv(c)], c: [base[0] * s, base[1] * s, base[2] * s] })
      }
    }
  })
  faces.sort((x, y) => x.d - y.d) // de atrás hacia adelante (orden del PDF)
  // La z guarda la profundidad, por debajo del plano del papel: en pantalla la prueba de profundidad resuelve
  // las piezas que se cruzan y las líneas de la vista (en z = 0) quedan siempre encima.
  let far = -Infinity
  for (const f of faces) for (let i = 2; i < 9; i += 3) far = Math.max(far, f.p[i])
  for (const f of faces) for (let i = 2; i < 9; i += 3) f.p[i] = (f.p[i] - far) * SHADE_DEPTH - SHADE_DEPTH
  const tris: number[] = []
  const rgb: number[] = []
  for (const f of faces) {
    tris.push(...f.p)
    rgb.push(...f.c)
  }
  return compactShade({ tris, colors: rgb })
}

/** Cantidad de triángulos de un sombreado (indexado o no). */
export const shadeTriangleCount = (p: ShadeProps): number => (p.index ? Math.floor(p.index.length / 3) : Math.floor(p.tris.length / 9))

/** Triángulos de un sombreado como 9 números cada uno (x, y, z de sus tres vértices), indexado o no. */
export function shadeTriangles(p: ShadeProps): number[] {
  if (!p.index) return p.tris
  const out = new Array<number>(p.index.length * 3)
  for (let i = 0; i < p.index.length; i++) {
    const k = p.index[i] * 3
    out[i * 3] = p.tris[k]
    out[i * 3 + 1] = p.tris[k + 1]
    out[i * 3 + 2] = p.tris[k + 2]
  }
  return out
}

/** Paso de redondeo: la potencia de 10 cercana a `ext`·`rel` (un número con ~7 cifras significativas en la vista). */
function quantum(ext: number, rel: number): number {
  return 10 ** Math.floor(Math.log10(Math.max(ext, 1e-9) * rel))
}

/** `x` redondeado a `q` (potencia de 10) sin el ruido binario de la división (12.300000000000001). */
function roundTo(x: number, q: number): number {
  const d = Math.max(0, -Math.round(Math.log10(q)))
  const r = Math.round(x / q) * q
  return d > 0 ? Number(r.toFixed(Math.min(20, d))) : r
}

/**
 * Sombreado compacto para guardarlo: vértices compartidos (`index`) y números redondeados a una diez millonésima de
 * la vista en el plano (x, y) y en la profundidad (z), y colores a la milésima (menos de un cuarto de nivel de 8 bits).
 * Nada visible cambia: una isométrica de un ensamble pasaba de 4,9 MB (cada triángulo con sus tres vértices de 17
 * cifras) a ~1 MB.
 */
export function compactShade(p: ShadeProps): ShadeProps {
  const t = shadeTriangles(p)
  if (!t.length) return { tris: [], index: [], colors: [] }
  let [x0, y0, z0, x1, y1, z1] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 2 < t.length; i += 3) {
    x0 = Math.min(x0, t[i])
    x1 = Math.max(x1, t[i])
    y0 = Math.min(y0, t[i + 1])
    y1 = Math.max(y1, t[i + 1])
    z0 = Math.min(z0, t[i + 2])
    z1 = Math.max(z1, t[i + 2])
  }
  const qxy = quantum(Math.max(x1 - x0, y1 - y0, Math.abs(x0), Math.abs(x1), Math.abs(y0), Math.abs(y1)), 1e-7)
  const qz = quantum(Math.max(z1 - z0, Math.abs(z0), Math.abs(z1)), 1e-7)
  const ids = new Map<string, number>()
  const tris: number[] = []
  const index: number[] = []
  for (let i = 0; i + 2 < t.length; i += 3) {
    const v = [roundTo(t[i], qxy), roundTo(t[i + 1], qxy), roundTo(t[i + 2], qz)]
    const key = `${v[0]},${v[1]},${v[2]}`
    let k = ids.get(key)
    if (k === undefined) {
      k = ids.size
      ids.set(key, k)
      tris.push(v[0], v[1], v[2])
    }
    index.push(k)
  }
  return { tris, index, colors: p.colors.map((c) => Math.round(c * 1000) / 1000) }
}

/** Vértices de un sombreado (los compartidos, una vez cada uno, si está indexado). */
export function shadePoints(p: ShadeProps): Vec3[] {
  const out: Vec3[] = []
  for (let i = 0; i + 2 < p.tris.length; i += 3) out.push([p.tris[i], p.tris[i + 1], p.tris[i + 2]])
  return out
}

/** Sombreado con sus vértices transformados (mover, rotar, insertar en un bloque). */
export function mapShade(p: ShadeProps, f: (v: Vec3) => Vec3): ShadeProps {
  const tris: number[] = []
  for (const v of shadePoints(p)) tris.push(...f(v))
  return p.index ? { tris, index: [...p.index], colors: [...p.colors] } : { tris, colors: [...p.colors] }
}

/** Zona de un sombreado: triángulos vecinos del mismo color, unidos en un solo relleno. */
export interface ShadeRegion {
  /** Color (r, g, b en 0..1). */
  rgb: [number, number, number]
  /** Contornos (el exterior y sus agujeros), cada uno cerrado implícitamente; rellenar con la regla par-impar. */
  loops: Vec3[][]
}

/**
 * Zonas de un sombreado para el PDF y el DXF: los triángulos que comparten un lado y tienen el mismo color (una cara
 * plana, partida en triángulos al teselar) se unen en un solo relleno con su contorno y sus agujeros, en el orden de
 * pintado (de atrás hacia adelante, por el orden medio de sus triángulos). Pintados por separado, los triángulos de una
 * cara dejaban vetas claras en el PDF (el suavizado de cada borde deja ver el papel) y cada uno era un SOLID del DXF.
 */
export function shadeRegions(p: ShadeProps): ShadeRegion[] {
  const s = p.index ? p : compactShade(p)
  const idx = s.index!
  const n = Math.floor(idx.length / 3)
  const V = (k: number): Vec3 => [s.tris[k * 3], s.tris[k * 3 + 1], s.tris[k * 3 + 2]]
  const col = (i: number): [number, number, number] => [p.colors[i * 3] ?? 0.7, p.colors[i * 3 + 1] ?? 0.7, p.colors[i * 3 + 2] ?? 0.7]
  const colorKey = (i: number): number => {
    const [r, g, b] = col(i).map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255))
    return (r << 16) | (g << 8) | b
  }
  // Triángulos en sentido antihorario en el plano de la vista (los degenerados no pintan nada).
  const tri: Array<[number, number, number] | null> = []
  for (let i = 0; i < n; i++) {
    const [a, b, c] = [idx[i * 3], idx[i * 3 + 1], idx[i * 3 + 2]]
    const [A, B, C] = [V(a), V(b), V(c)]
    const area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])
    tri.push(a === b || b === c || a === c || area === 0 ? null : area > 0 ? [a, b, c] : [a, c, b])
  }
  // Unión de los triángulos vecinos (por un lado compartido) del mismo color.
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]]
    return i
  }
  const firstOnEdge = new Map<number, number>()
  const nv = s.tris.length / 3
  const edgeKey = (a: number, b: number) => (a < b ? a * nv + b : b * nv + a)
  tri.forEach((t, i) => {
    if (!t) return
    const ck = colorKey(i)
    for (let e = 0; e < 3; e++) {
      const key = edgeKey(t[e], t[(e + 1) % 3])
      const j = firstOnEdge.get(key)
      if (j === undefined) firstOnEdge.set(key, i)
      else if (colorKey(j) === ck) parent[find(i)] = find(j)
    }
  })
  const groups = new Map<number, number[]>()
  tri.forEach((t, i) => {
    if (!t) return
    const r = find(i)
    const g = groups.get(r)
    if (g) g.push(i)
    else groups.set(r, [i])
  })
  const regions: Array<ShadeRegion & { at: number }> = []
  for (const members of groups.values()) {
    // Lados del contorno: los que usa un solo triángulo de la zona, con su sentido (exterior antihorario, agujeros al revés).
    const uses = new Map<number, number>()
    for (const i of members) {
      for (let e = 0; e < 3; e++) {
        const key = edgeKey(tri[i]![e], tri[i]![(e + 1) % 3])
        uses.set(key, (uses.get(key) ?? 0) + 1)
      }
    }
    const next = new Map<number, number[]>()
    let edges = 0
    for (const i of members) {
      const t = tri[i]!
      for (let e = 0; e < 3; e++) {
        const [a, b] = [t[e], t[(e + 1) % 3]]
        if (uses.get(edgeKey(a, b)) !== 1) continue
        const l = next.get(a)
        if (l) l.push(b)
        else next.set(a, [b])
        edges++
      }
    }
    const loops: Vec3[][] = []
    while (edges > 0) {
      const start = next.keys().next().value as number
      const loop: Vec3[] = []
      let at = start
      for (let guard = edges; guard > 0; guard--) {
        const out = next.get(at)
        if (!out?.length) break
        const to = out.pop()!
        if (!out.length) next.delete(at)
        edges--
        loop.push(V(at))
        at = to
        if (at === start) break
      }
      if (loop.length >= 3) loops.push(loop)
    }
    if (!loops.length) continue
    regions.push({ rgb: col(members[0]), loops, at: members.reduce((a, i) => a + i, 0) / members.length })
  }
  regions.sort((a, b) => a.at - b.at)
  return regions.map(({ rgb, loops }) => ({ rgb, loops }))
}

/** Contorno de un sombreado: el rectángulo que lo envuelve (en su plano XY). */
export function shadeOutline(p: ShadeProps): Vec3[] {
  const pts = shadePoints(p)
  if (!pts.length) return []
  const xs = pts.map((v) => v[0])
  const ys = pts.map((v) => v[1])
  const z = pts[0][2]
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  return [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [x0, y0, z]]
}
