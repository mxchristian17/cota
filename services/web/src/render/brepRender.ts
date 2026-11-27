import type { Vec3 } from '../core/math'
import type { BrepProps } from '../core/document/types'
import { brepDisplay } from '../core/document/brepStore'
import { affineDet } from '../core/geom/affine'
import type { BrepDisplay } from '../core/io/importedBrep'
import type { OcctMesh } from '../core/occt/occtEval'
import { meshRenderFlat, type MeshRender } from './meshBuffers'
import { requestBrepDisplay } from './brepDisplayPool'

/** Lo que se dibuja en los lotes de una hoja `BREP` sola: triángulos indexados con normales y sus aristas exactas. */
export interface BrepRender extends MeshRender {
  edges: Float32Array
}

/** Ángulo de quiebre del sombreado: el de las mallas importadas (dentro de cada cara del modelo; entre caras, siempre). */
const CREASE_DEG = 30

/** Vértices de la malla de la importación con la matriz de la hoja. */
function placedPositions(d: BrepDisplay, m: number[] | undefined): Float64Array {
  if (!m) return d.pos
  const P = d.pos
  const out = new Float64Array(P.length)
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i],
      y = P[i + 1],
      z = P[i + 2]
    out[i] = m[0] * x + m[1] * y + m[2] * z + m[3]
    out[i + 1] = m[4] * x + m[5] * y + m[6] * z + m[7]
    out[i + 2] = m[8] * x + m[9] * y + m[10] * z + m[11]
  }
  return out
}

/** Triángulos dados vuelta (una pieza reflejada: así siguen mirando hacia afuera). */
function flipped(tri: Uint32Array): Uint32Array {
  const out = new Uint32Array(tri.length)
  for (let t = 0; t < tri.length; t += 3) {
    out[t] = tri[t]
    out[t + 1] = tri[t + 2]
    out[t + 2] = tri[t + 1]
  }
  return out
}

/** Segmentos de las aristas del modelo (con la matriz de la hoja), relativos a `origin`. */
export function brepEdgeSegments(d: BrepDisplay, m: number[] | undefined, origin: Vec3): Float32Array {
  let n = 0
  for (const c of d.wireCounts) n += Math.max(0, c - 1)
  const out = new Float32Array(n * 6)
  const W = d.wirePts
  let o = 0
  let base = 0
  const put = (i: number) => {
    const x = W[i * 3],
      y = W[i * 3 + 1],
      z = W[i * 3 + 2]
    if (m) {
      out[o++] = m[0] * x + m[1] * y + m[2] * z + m[3] - origin[0]
      out[o++] = m[4] * x + m[5] * y + m[6] * z + m[7] - origin[1]
      out[o++] = m[8] * x + m[9] * y + m[10] * z + m[11] - origin[2]
    } else {
      out[o++] = x - origin[0]
      out[o++] = y - origin[1]
      out[o++] = z - origin[2]
    }
  }
  for (const c of d.wireCounts) {
    for (let k = 0; k + 1 < c; k++) {
      put(base + k)
      put(base + k + 1)
    }
    base += c
  }
  return out
}

/**
 * Lo que se dibuja de cada hoja `BREP` sola, por pasada de la escena: lo usado en una pasada sigue en la siguiente y
 * lo demás se olvida (la memoria queda en lo que está a la vista). La clave es el contenido (modelo, matriz, origen y
 * si es la malla del núcleo), así deshacer o rehacer, que copian el dibujo, no lo vuelven a calcular.
 */
export class BrepRenders {
  private cur = new Map<string, BrepRender>()
  private prev = new Map<string, BrepRender>()

  /** Empieza una pasada de la escena. */
  frame(): void {
    this.prev = this.cur
    this.cur = new Map()
  }

  /**
   * Malla y aristas de la pieza: la del núcleo exacto si ya la calculó (`kernel`) o la de la importación. null si
   * todavía no hay ninguna (un dibujo recién abierto: se pide aparte, ver `requestBrepDisplay`).
   */
  get(p: BrepProps, origin: Vec3, kernel: OcctMesh | null): BrepRender | null {
    const d = brepDisplay(p.ref)
    if (!d) requestBrepDisplay(p.ref)
    if (!d && !kernel) return null
    const key = `${kernel ? 'k' : 'm'}${d ? 'e' : ''}|${p.ref}|${p.m?.join(',') ?? ''}|${origin.join(',')}`
    let r = this.cur.get(key) ?? this.prev.get(key)
    if (!r) {
      const flip = !!p.m && affineDet(p.m) < 0
      const mesh = kernel
        ? meshRenderFlat(kernel.positions, kernel.indices, CREASE_DEG, origin)
        : meshRenderFlat(placedPositions(d!, p.m), flip ? flipped(d!.tri) : d!.tri, CREASE_DEG, origin)
      r = { ...mesh, edges: d ? brepEdgeSegments(d, p.m, origin) : new Float32Array(0) }
    }
    this.cur.set(key, r)
    return r
  }
}
