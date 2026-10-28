import { primPoint, type Curve } from './curve'

/** Área exacta con signo de una curva plana (líneas y arcos exactos; elipses y splines por muestreo fino). */
export function curveArea(c: Curve): number {
  let a = 0
  for (const p of c.prims) {
    if (p.k === 'L') a += (p.a[0] * p.b[1] - p.b[0] * p.a[1]) / 2
    else if (p.k === 'A') {
      const t0 = p.a0
      const t1 = p.a0 + p.sw
      a += (p.r * p.r * p.sw + p.r * (p.c[0] * (Math.sin(t1) - Math.sin(t0)) - p.c[1] * (Math.cos(t1) - Math.cos(t0)))) / 2
    } else {
      // Elipse o tramo de spline: por muestreo fino de la primitiva.
      const k = 'sw' in p ? Math.max(64, Math.ceil((1024 * Math.abs(p.sw)) / (2 * Math.PI))) : 256
      let q = primPoint(p, 0)
      for (let j = 1; j <= k; j++) {
        const r = primPoint(p, j / k)
        a += (q[0] * r[1] - r[0] * q[1]) / 2
        q = r
      }
    }
  }
  // Una curva abierta se mide como si se cerrara con una recta (como AREA ▸ Object del CAD clásico).
  if (!c.closed) {
    const s = c.pointAt(0)
    const e = c.pointAt(c.n)
    a += (e[0] * s[1] - s[0] * e[1]) / 2
  }
  return a
}
