import type { Vec3 } from '../math'
import type { ArcProps, PolylineProps } from '../document/types'
import { arcBasis, arcFromLocal, arcFromStartEndAngle, arcMidpoint, arcSegmentCount, tessellateArc } from './arc'

/**
 * Tramos curvos de polilínea (*bulge*).
 *
 * `bulges[i]` describe el tramo `i → i+1` y vale `tan(θ/4)`, con θ el ángulo incluido del arco y el
 * signo indicando el sentido (positivo = antihorario). Es la convención de la `LWPOLYLINE` del DXF.
 * Un bulge 0 o ausente deja el tramo recto.
 */

/** ¿La polilínea tiene al menos un tramo curvo? */
export function hasBulges(p: PolylineProps): boolean {
  return (p.bulges ?? []).some((b) => Math.abs(b) > 1e-12)
}

/** Bulge del tramo `i` (0 si no hay). */
export function bulgeAt(p: PolylineProps, i: number): number {
  const b = p.bulges?.[i]
  return b === undefined || !isFinite(b) ? 0 : b
}

/** Ángulo incluido (radianes, con signo) que corresponde a un bulge. */
export const bulgeAngle = (bulge: number): number => 4 * Math.atan(bulge)

/** Bulge que corresponde a un ángulo incluido con signo. */
export const angleBulge = (included: number): number => Math.tan(included / 4)

/**
 * Arco del tramo `a → b` con ese bulge (null si el tramo es recto o degenerado). `normal` es la de la
 * polilínea: el arco se calcula en su plano; ausente = planta (+Z).
 */
export function bulgeArc(a: Vec3, b: Vec3, bulge: number, normal?: Vec3): ArcProps | null {
  if (Math.abs(bulge) < 1e-12) return null
  if (!normal || (Math.abs(normal[0]) < 1e-12 && Math.abs(normal[1]) < 1e-12 && normal[2] > 0)) return arcFromStartEndAngle(a, b, bulgeAngle(bulge))
  const { u, v, n } = arcBasis(normal)
  const dot = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2]
  const loc = (p: Vec3): Vec3 => [dot(p, u), dot(p, v), 0]
  const arc = arcFromStartEndAngle(loc(a), loc(b), bulgeAngle(bulge))
  return arc && arcFromLocal(arc, u, v, n, dot(a, n))
}

/** Índices de los tramos de la polilínea: `[i, j]` con `j = i+1` (y el de cierre si es cerrada). */
export function polylineSpans(p: PolylineProps): Array<[number, number]> {
  const n = p.vertices.length
  const out: Array<[number, number]> = []
  for (let i = 0; i + 1 < n; i++) out.push([i, i + 1])
  if (p.closed && n > 2) out.push([n - 1, 0])
  return out
}

/**
 * Puntos de la polilínea con los tramos curvos ya tesselados. Los vértices se conservan exactos;
 * sólo se insertan puntos intermedios en los tramos con bulge.
 *
 * En una polilínea **cerrada** el recorrido incluye el tramo de cierre, por lo que el último punto
 * coincide con el primero: el resultado ya es un anillo y quien lo use no debe volver a cerrarlo.
 */
export function polylinePoints(p: PolylineProps, segmentsPerArc?: number): Vec3[] {
  const v = p.vertices
  if (v.length === 0) return []
  const out: Vec3[] = [v[0]]
  for (const [i, j] of polylineSpans(p)) {
    const arc = bulgeArc(v[i], v[j], bulgeAt(p, i), p.normal)
    if (!arc) {
      out.push(v[j])
      continue
    }
    const pts = tessellateArc(arc, segmentsPerArc ?? arcSegmentCount(Math.abs(bulgeAngle(bulgeAt(p, i)))))
    // El primer punto del arco ya está en `out`; el último se reemplaza por el vértice exacto.
    for (let k = 1; k < pts.length - 1; k++) out.push(pts[k])
    out.push(v[j])
  }
  return out
}

/** Segmentos (ya tesselados) de la polilínea, para intersecar/capturar. */
export function polylineSegments(p: PolylineProps, segmentsPerArc?: number): Array<[Vec3, Vec3]> {
  const pts = polylinePoints(p, segmentsPerArc)
  const out: Array<[Vec3, Vec3]> = []
  for (let i = 0; i + 1 < pts.length; i++) out.push([pts[i], pts[i + 1]])
  return out
}

/**
 * Punto medio **real** de cada tramo: el del arco en los tramos con bulge y el de la cuerda en los
 * rectos. Es lo que debe ofrecer el esnap `midpoint`.
 */
export function polylineMidpoints(p: PolylineProps): Vec3[] {
  const out: Vec3[] = []
  for (const [i, j] of polylineSpans(p)) {
    const a = p.vertices[i]
    const b = p.vertices[j]
    const arc = bulgeArc(a, b, bulgeAt(p, i), p.normal)
    out.push(arc ? arcMidpoint(arc) : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])
  }
  return out
}

/** Arcos de los tramos curvos (para FILLET/OFFSET y para exportar a DXF). */
export function polylineArcs(p: PolylineProps): Array<{ span: [number, number]; arc: ArcProps }> {
  const out: Array<{ span: [number, number]; arc: ArcProps }> = []
  for (const [i, j] of polylineSpans(p)) {
    const arc = bulgeArc(p.vertices[i], p.vertices[j], bulgeAt(p, i), p.normal)
    if (arc) out.push({ span: [i, j], arc })
  }
  return out
}

/**
 * Normaliza el array de bulges al largo que corresponde a los vértices (uno por tramo, incluido el
 * de cierre). Devuelve `undefined` cuando quedan todos en cero, para no guardar ruido en el `.cota`.
 */
export function normalizeBulges(vertices: Vec3[], bulges?: number[]): number[] | undefined {
  if (!bulges || bulges.length === 0) return undefined
  const out = vertices.map((_, i) => {
    const b = bulges[i]
    return b === undefined || !isFinite(b) ? 0 : b
  })
  return out.some((b) => Math.abs(b) > 1e-12) ? out : undefined
}

/**
 * Centroide **de área** de una polilínea cerrada, con sus tramos curvos (snap `GCEN`).
 * Polígono de los vértices por la fórmula del área de Gauss más el segmento circular de cada bulge
 * (área `r²/2·(θ − sen θ)` con signo y centroide sobre la bisectriz, a `4r·sen³(θ/2) / 3(θ − sen θ)`
 * del centro). Null si la polilínea es abierta o no encierra área.
 */
export function polylineCentroid(p: PolylineProps): Vec3 | null {
  const v = p.vertices
  if (!p.closed || v.length < 3) return null
  let area = 0
  let mx = 0
  let my = 0
  for (const [i, j] of polylineSpans(p)) {
    const a = v[i]
    const b = v[j]
    const cr = a[0] * b[1] - b[0] * a[1]
    area += cr / 2
    mx += ((a[0] + b[0]) * cr) / 6
    my += ((a[1] + b[1]) * cr) / 6
    const arc = bulgeArc(a, b, bulgeAt(p, i), p.normal)
    if (!arc) continue
    const th = Math.abs(bulgeAngle(bulgeAt(p, i)))
    const segArea = Math.sign(bulgeAt(p, i)) * ((arc.radius * arc.radius) / 2) * (th - Math.sin(th))
    const m = arcMidpoint(arc)
    const k = (4 * Math.sin(th / 2) ** 3) / (3 * (th - Math.sin(th)))
    const gx = arc.center[0] + (m[0] - arc.center[0]) * k
    const gy = arc.center[1] + (m[1] - arc.center[1]) * k
    area += segArea
    mx += segArea * gx
    my += segArea * gy
  }
  if (Math.abs(area) < 1e-12) return null
  const z = v.reduce((s, q) => s + q[2], 0) / v.length
  return [mx / area, my / area, z]
}
