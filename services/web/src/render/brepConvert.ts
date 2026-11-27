import type { BrepProps, SolidProps } from '../core/document/types'
import { dropKernelRequests, kernelResult, onKernelResults, requestKernel } from './occtKernel'

/**
 * Cuándo un sólido importado (hoja `BREP` sola) pasa por el núcleo exacto. En modo mallas se dibuja con la malla de la
 * importación hasta que se lo selecciona o se lo edita; la conversión completa los pide todos de entrada. Las piezas
 * que ya armaron un árbol (una resta, un empalme) van siempre al núcleo: lo decide `wantsKernel` en `csg.ts`.
 */

/** Modelos que ya se convierten (por `ref`: todas sus copias, en bloques o movidas, también). */
const wanted = new Set<string>()

/** ¿El modelo pasa por el núcleo exacto? */
export const brepWanted = (ref: string): boolean => wanted.has(ref)

/** Marca modelos para convertir; devuelve los que no lo estaban. */
export function wantBreps(refs: Iterable<string>): string[] {
  const added: string[] = []
  for (const r of refs) {
    if (wanted.has(r)) continue
    wanted.add(r)
    added.push(r)
  }
  return added
}

/** Vuelve modelos al modo mallas (cancelar una conversión: lo que no llegó queda como estaba). */
export function unwantBreps(refs: Iterable<string>): void {
  for (const r of refs) wanted.delete(r)
}

/** Clave del sólido en el núcleo (la misma de `csg.ts`: el árbol en texto). */
const keyOf = (p: SolidProps): string => JSON.stringify(p)

/**
 * Convierte ya las piezas indicadas (las elegidas o editadas, en modo mallas): pasan adelante en la cola del núcleo.
 * Devuelve si había alguna nueva.
 */
export function convertNow(leaves: BrepProps[]): boolean {
  const added = wantBreps(leaves.map((l) => l.ref))
  for (const l of leaves) requestKernel(keyOf(l), l, true)
  return added.length > 0
}

export interface ConvertProgress {
  done: number
  total: number
  /** Las que el núcleo no pudo leer (quedan con su malla). */
  failed: number
}

/** Una conversión completa en curso. */
export interface Conversion {
  cancel(): void
  /** Se resuelve al terminar o al cancelar, con lo que llegó. */
  finished: Promise<ConvertProgress & { cancelled: boolean }>
}

/**
 * Conversión completa: pide al núcleo todas las piezas (cada copia de un bloque, con su matriz) y avisa el avance.
 * Cancelar saca de la cola lo que no empezó y deja esos modelos en modo mallas.
 */
export function convertAll(leaves: BrepProps[], onProgress: (p: ConvertProgress) => void): Conversion {
  const byKey = new Map<string, BrepProps>()
  // Las copias de un mismo modelo, seguidas: van juntas al mismo Worker, que ya lo tiene traducido.
  for (const l of [...leaves].sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0))) byKey.set(keyOf(l), l)
  const pending = new Set(byKey.keys())
  const progress: ConvertProgress = { done: 0, total: byKey.size, failed: 0 }
  let settle!: (r: ConvertProgress & { cancelled: boolean }) => void
  const finished = new Promise<ConvertProgress & { cancelled: boolean }>((res) => (settle = res))
  let over = false
  const count = (key: string) => {
    const r = kernelResult(key)
    if (!r || !pending.delete(key)) return
    progress.done++
    if (!r.ok) progress.failed++
  }
  const end = (cancelled: boolean) => {
    if (over) return
    over = true
    off()
    settle({ ...progress, cancelled })
  }
  const off = onKernelResults((keys) => {
    for (const k of keys) count(k)
    onProgress({ ...progress })
    if (!pending.size) end(false)
  })
  wantBreps([...byKey.values()].map((l) => l.ref))
  for (const [key, l] of byKey) requestKernel(key, l)
  // Las que ya estaban calculadas (en memoria) cuentan de entrada.
  for (const key of [...pending]) count(key)
  onProgress({ ...progress })
  if (!pending.size) end(false)
  return {
    finished,
    cancel: () => {
      if (over) return
      dropKernelRequests(pending)
      // Los modelos que no llegaron a convertirse en ninguna de sus copias vuelven al modo mallas.
      const done = new Set<string>()
      for (const [key, l] of byKey) if (!pending.has(key)) done.add(l.ref)
      unwantBreps([...pending].map((k) => byKey.get(k)!.ref).filter((r) => !done.has(r)))
      end(true)
    },
  }
}
