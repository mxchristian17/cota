import type { Vec3 } from '../math'
import type { EllipseProps } from '../document/types'

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const mag = (v: Vec3): number => Math.hypot(v[0], v[1], v[2])
const normalize = (v: Vec3): Vec3 => {
  const L = mag(v) || 1
  return [v[0] / L, v[1] / L, v[2] / L]
}

/** Vector del semieje menor: `normal × major`, con longitud |major|·ratio. */
export function ellipseMinorVec(e: EllipseProps): Vec3 {
  const perp = normalize(cross(e.normal ?? [0, 0, 1], e.major))
  const len = mag(e.major) * e.ratio
  return [perp[0] * len, perp[1] * len, perp[2] * len]
}

const TAU = Math.PI * 2
const normParam = (a: number): number => ((a % TAU) + TAU) % TAU

/** ¿Es un **arco** de elipse (tiene parámetros de recorte) y no la elipse completa? */
export function isEllipseArc(e: EllipseProps): boolean {
  if (e.startParam === undefined || e.endParam === undefined) return false
  return Math.abs(ellipseParamSweep(e) - TAU) > 1e-9
}

/** Barrido en el espacio de parámetros, en (0, 2π]. La elipse completa devuelve 2π. */
export function ellipseParamSweep(e: EllipseProps): number {
  if (e.startParam === undefined || e.endParam === undefined) return TAU
  const d = normParam(e.endParam - e.startParam)
  return d < 1e-12 ? TAU : d
}

/** Punto de la elipse en el parámetro indicado. */
export function ellipsePointAt(e: EllipseProps, param: number): Vec3 {
  const c = e.center
  const M = e.major
  const m = ellipseMinorVec(e)
  const ca = Math.cos(param)
  const sa = Math.sin(param)
  return [c[0] + ca * M[0] + sa * m[0], c[1] + ca * M[1] + sa * m[1], c[2] + ca * M[2] + sa * m[2]]
}

/**
 * Puntos muestreados de la elipse en su plano (n segmentos). En una elipse completa `close` repite el
 * primer punto; en un **arco de elipse** se recorre de `startParam` a `endParam` y `close` se ignora
 * (el arco no se cierra).
 */
export function ellipsePoints(e: EllipseProps, n = 96, close = false): Vec3[] {
  const arc = isEllipseArc(e)
  const out: Vec3[] = []
  if (arc) {
    const p0 = e.startParam as number
    const sweep = ellipseParamSweep(e)
    for (let i = 0; i <= n; i++) out.push(ellipsePointAt(e, p0 + (i / n) * sweep))
    return out
  }
  for (let i = 0; i < n; i++) out.push(ellipsePointAt(e, (i / n) * TAU))
  if (close && out.length > 0) out.push(out[0])
  return out
}

/** ¿El parámetro cae dentro del barrido del arco de elipse? (una elipse completa siempre sí). */
export function ellipseContainsParam(e: EllipseProps, param: number, eps = 1e-9): boolean {
  if (!isEllipseArc(e)) return true
  return normParam(param - (e.startParam as number)) <= ellipseParamSweep(e) + eps
}

/** Extremos del arco de elipse (lista vacía si la elipse es completa). */
export function ellipseEndpoints(e: EllipseProps): Vec3[] {
  if (!isEllipseArc(e)) return []
  return [ellipsePointAt(e, e.startParam as number), ellipsePointAt(e, e.endParam as number)]
}

/**
 * Los cuatro extremos de los semiejes, **siempre** y en orden fijo
 * `[mayor+, mayor−, menor+, menor−]`. Los grips dependen de este orden.
 */
export function ellipseAxisPoints(e: EllipseProps): Vec3[] {
  // Se calculan algebraicamente (c ± M, c ± m) y no con cos/sin: así son exactos.
  const c = e.center
  const M = e.major
  const m = ellipseMinorVec(e)
  return [
    [c[0] + M[0], c[1] + M[1], c[2] + M[2]],
    [c[0] - M[0], c[1] - M[1], c[2] - M[2]],
    [c[0] + m[0], c[1] + m[1], c[2] + m[2]],
    [c[0] - m[0], c[1] - m[1], c[2] - m[2]],
  ]
}

/**
 * Puntos de cuadrante para el esnap. En un **arco** de elipse sólo se devuelven los que caen dentro
 * del barrido; en la elipse completa son los cuatro extremos de los semiejes.
 */
export function ellipseQuadrants(e: EllipseProps): Vec3[] {
  if (!isEllipseArc(e)) return ellipseAxisPoints(e)
  const out: Vec3[] = []
  for (const param of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
    if (ellipseContainsParam(e, normParam(param))) out.push(ellipsePointAt(e, param))
  }
  return out
}
