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
  return { tris, colors: rgb }
}

/** Vértices de un sombreado. */
export function shadePoints(p: ShadeProps): Vec3[] {
  const out: Vec3[] = []
  for (let i = 0; i + 2 < p.tris.length; i += 3) out.push([p.tris[i], p.tris[i + 1], p.tris[i + 2]])
  return out
}

/** Sombreado con sus vértices transformados (mover, rotar, insertar en un bloque). */
export function mapShade(p: ShadeProps, f: (v: Vec3) => Vec3): ShadeProps {
  const tris: number[] = []
  for (const v of shadePoints(p)) tris.push(...f(v))
  return { tris, colors: [...p.colors] }
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
