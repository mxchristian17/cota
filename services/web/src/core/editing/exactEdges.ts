import type { Vec3 } from '../math'
import type { ArcProps, BrepProps, SolidProps } from '../document/types'
import { affineDet, affinePoint, isSimilarity } from '../geom/affine'
import { arcBasis } from '../geom/arc'
import { cleanNumber } from '../geom/clean'
import { brepBytes, brepFormat } from '../document/brepStore'
import { acisExactEdges } from '../io/acis'
import { LruCache } from '../lru'

/**
 * Arista exacta de un sólido: su polilínea (cerrada: el último punto repite el primero) y qué curva es. En los círculos y
 * arcos, el arco exacto (centro, radio y normal del modelo, no ajustados a la malla). Sale del modelo ACIS de una pieza
 * importada o del resultado del núcleo exacto.
 */
export interface ExactEdge {
  pts: Vec3[]
  closed: boolean
  kind: 'line' | 'circle' | 'ellipse' | 'curve'
  arc?: ArcProps
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const clean = (v: Vec3): Vec3 => v.map(cleanNumber) as Vec3

/**
 * Arco exacto de un círculo (o la circunferencia, si es cerrada) con el sentido de su polilínea: del primer punto al
 * último pasando por el del medio, antihorario alrededor de la normal (como `fitArc`).
 */
export function arcOfCircle(center: Vec3, normal: Vec3, radius: number, pts: Vec3[], closed: boolean): ArcProps {
  const n = unit(normal)
  const c = clean(center)
  if (closed || pts.length < 2) return { center: c, radius: cleanNumber(radius), startAngle: 0, endAngle: 0, normal: n }
  const { u, v } = arcBasis(n)
  const ang = (q: Vec3): number => Math.atan2(dot(sub(q, c), v), dot(sub(q, c), u))
  const [a0, am, a1] = [ang(pts[0]), ang(pts[Math.floor(pts.length / 2)]), ang(pts[pts.length - 1])]
  const ccw = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  const r = cleanNumber(radius)
  // Con dos puntos (un arco muy corto) el del medio es un extremo: alcanza con el sentido corto.
  if (pts.length > 2 ? ccw(am - a0) > ccw(a1 - a0) : ccw(a1 - a0) > Math.PI) return { center: c, radius: r, startAngle: a1, endAngle: a0, normal: n }
  return { center: c, radius: r, startAngle: a0, endAngle: a1, normal: n }
}

/** Las aristas con una matriz afín: una escala distinta por eje vuelve curvas a los círculos. */
export function transformEdges(edges: ExactEdge[], m: number[] | undefined): ExactEdge[] {
  if (!m) return edges
  const similar = isSimilarity(m)
  // La orientación del arco (también reflejado) sale de la polilínea transformada.
  return edges.map((e) => {
    const pts = e.pts.map((p) => affinePoint(m, p))
    if (!e.arc || !similar) return { pts, closed: e.closed, kind: e.arc && !similar ? 'curve' : e.kind }
    const c = affinePoint(m, e.arc.center)
    const tip = affinePoint(m, [e.arc.center[0] + e.arc.normal[0], e.arc.center[1] + e.arc.normal[1], e.arc.center[2] + e.arc.normal[2]])
    const scale = Math.cbrt(Math.abs(affineDet(m)))
    return { pts, closed: e.closed, kind: e.kind, arc: arcOfCircle(c, sub(tip, c), e.arc.radius * scale, pts, e.closed) }
  })
}

/** Las del núcleo exacto, si ya calculó el árbol (lo registra quien conoce sus resultados: `render/csg.ts`). */
let kernelEdges: ((p: SolidProps) => ExactEdge[] | null) | null = null
export function registerKernelEdges(fn: (p: SolidProps) => ExactEdge[] | null): void {
  kernelEdges = fn
}

/** Aristas del modelo ACIS, sin la matriz de la hoja (leerlas cuesta lo que la malla: una vez por modelo). */
const acisCache = new LruCache<string, ExactEdge[]>(2000)
/** Con la matriz de la hoja (las copias de un bloque se consultan seguido al mover el cursor). */
const placedCache = new LruCache<string, ExactEdge[]>(4000)

function brepEdges(p: BrepProps): ExactEdge[] | null {
  let base = acisCache.get(p.ref)
  if (!base) {
    const fmt = brepFormat(p.ref)
    const bytes = fmt === 'sab' || fmt === 'sat' ? brepBytes(p.ref) : null
    if (!bytes) return null
    base = acisExactEdges(bytes).map((e) => ({ ...e, ...(e.circle ? { arc: arcOfCircle(e.circle.c, e.circle.n, e.circle.r, e.pts, e.closed) } : {}) }))
    for (const e of base) delete (e as { circle?: unknown }).circle
    acisCache.set(p.ref, base)
  }
  if (!p.m) return base
  const key = `${p.ref}|${p.m.join(',')}`
  let placed = placedCache.get(key)
  if (!placed) placedCache.set(key, (placed = transformEdges(base, p.m)))
  return placed
}

/**
 * Aristas exactas de un sólido: las del núcleo si ya lo calculó; las de su modelo ACIS si es una pieza importada sola
 * (sin convertir también); si no, null (quedan las que se derivan de la malla).
 */
export function exactEdges(p: SolidProps): ExactEdge[] | null {
  const k = kernelEdges?.(p)
  if (k) return k
  return p.op === 'BREP' ? brepEdges(p) : null
}
