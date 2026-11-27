import type { Vec3 } from '../math'

/**
 * Matriz afín 3×4 por filas: `[r00, r01, r02, tx, r10, r11, r12, ty, r20, r21, r22, tz]` (la de `transform` de
 * OpenCascade). La usan los sólidos importados (hoja `BREP`), que no tienen puntos propios que mover.
 */
export type Affine = number[]

export const IDENTITY_AFFINE: Affine = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]

export const affinePoint = (m: Affine | undefined, p: Vec3): Vec3 =>
  m ? [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]] : p

export const affineDir = (m: Affine | undefined, d: Vec3): Vec3 =>
  m ? [m[0] * d[0] + m[1] * d[1] + m[2] * d[2], m[4] * d[0] + m[5] * d[1] + m[6] * d[2], m[8] * d[0] + m[9] * d[1] + m[10] * d[2]] : d

/** La matriz de una transformación afín dada por su función de puntos (la imagen del origen y de los tres ejes). */
export function affineOf(f: (p: Vec3) => Vec3): Affine {
  const o = f([0, 0, 0])
  const x = f([1, 0, 0])
  const y = f([0, 1, 0])
  const z = f([0, 0, 1])
  return [x[0] - o[0], y[0] - o[0], z[0] - o[0], o[0], x[1] - o[1], y[1] - o[1], z[1] - o[1], o[1], x[2] - o[2], y[2] - o[2], z[2] - o[2], o[2]]
}

/** a ∘ b: primero `b` (ausente = identidad), después `a`. */
export function composeAffine(a: Affine, b: Affine | undefined): Affine {
  if (!b) return [...a]
  const out: Affine = new Array<number>(12)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) out[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c]
    out[r * 4 + 3] = a[r * 4] * b[3] + a[r * 4 + 1] * b[7] + a[r * 4 + 2] * b[11] + a[r * 4 + 3]
  }
  return out
}

/** Determinante de la parte lineal (negativo = refleja). */
export const affineDet = (m: Affine): number => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8])

/** ¿Es (casi) la identidad? Entonces no hace falta guardarla. */
export const isIdentityAffine = (m: Affine | undefined, tol = 1e-12): boolean =>
  !m || m.every((v, i) => Math.abs(v - IDENTITY_AFFINE[i]) <= tol * (i % 4 === 3 ? 1 + Math.abs(v) : 1))

/** ¿Rotación (o reflexión) con una sola escala? Lo único que el núcleo exacto puede aplicar a un sólido. */
export function isSimilarity(m: Affine, tol = 1e-9): boolean {
  const col = (c: number): Vec3 => [m[c], m[4 + c], m[8 + c]]
  const [x, y, z] = [col(0), col(1), col(2)]
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const s = dot(x, x)
  return (
    s > 0 &&
    Math.abs(dot(y, y) - s) <= tol * s &&
    Math.abs(dot(z, z) - s) <= tol * s &&
    Math.abs(dot(x, y)) <= tol * s &&
    Math.abs(dot(y, z)) <= tol * s &&
    Math.abs(dot(x, z)) <= tol * s
  )
}
