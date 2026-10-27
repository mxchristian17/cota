/**
 * Ruido de punto flotante: las cuentas de rotar, escalar, proyectar o pasar por una UCS dejan valores como
 * 0.9999999999995453 donde el dibujo dice 1. Un valor a menos de 1e-9 de un número con 6 decimales se lleva a ese
 * número; los valores reales (√2, π/2, 1.2345678…) quedan intactos.
 */
const GRID = 1e6
const TOL = 1e-9

export function cleanNumber(v: number): number {
  if (!Number.isFinite(v)) return v
  const r = Math.round(v * GRID) / GRID
  return r !== v && Math.abs(r - v) <= TOL * Math.max(1, Math.abs(v)) ? r + 0 : v
}

/** Limpia en el lugar todos los números de un objeto o arreglo (sin entrar en arreglos tipados). Devuelve cuántos cambió. */
export function cleanNumbersDeep(o: unknown, depth = 0): number {
  if (depth > 8 || o === null || typeof o !== 'object' || ArrayBuffer.isView(o)) return 0
  let n = 0
  const rec = o as Record<string, unknown>
  for (const k of Object.keys(rec)) {
    const v = rec[k]
    if (typeof v === 'number') {
      const c = cleanNumber(v)
      if (c !== v) {
        rec[k] = c
        n++
      }
    } else if (v && typeof v === 'object') n += cleanNumbersDeep(v, depth + 1)
  }
  return n
}
