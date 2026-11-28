/// <reference lib="webworker" />
/**
 * Hilo del núcleo de sólidos exacto (OpenCascade). El módulo LGPL (`occt-wasm.js` + `occt-wasm.wasm`) se carga por URL
 * desde `occt/<versión>/` recién con el primer pedido; cada pedido evalúa un árbol `SolidProps` (con los modelos de sus
 * sólidos importados) y devuelve la malla.
 */
import type { OcctKernel } from 'occt-wasm'
import { kernelInitMs, loadKernel } from './loadKernel'
import type { BrepSource, SolidProps } from '../document/types'
import { brepOfSolid, evalSolid, OcctEvalError, type OcctMesh, type OcctStats } from './occtEval'
import { brepToAcis, BrepToAcisError, type AcisModel } from './brepToAcis'
import { writeSab, writeSat } from '../io/acisWrite'

export interface KernelRequest {
  id: number
  props: SolidProps
  /** Modelos de las hojas `BREP` del árbol (sólidos importados), por `ref`. */
  models?: Record<string, BrepSource>
  /** Teselado fino de una pieza importada (para una vista). */
  fine?: boolean
  /** En vez de la malla, el modelo ACIS de la forma (para guardar un DWG o un DXF): SAB o SAT. */
  acis?: 'sab' | 'sat'
}

export type KernelReply =
  | { id: number; ok: true; mesh: OcctMesh; stats: OcctStats & { initMs: number } }
  | { id: number; ok: true; acis: Uint8Array | string; kind: AcisModel['kind'] }
  | { id: number; ok: false; op: string; message: string; size?: number; fatal?: boolean }

self.onmessage = async (ev: MessageEvent<KernelRequest>) => {
  const { id, props, models, fine, acis } = ev.data
  let k: OcctKernel
  try {
    k = await loadKernel()
  } catch (err) {
    // El navegador no puede compilar el módulo (le falta WASM SIMD, tail calls o excepciones) o no se pudo bajar.
    self.postMessage({ id, ok: false, op: 'INIT', message: err instanceof Error ? err.message : String(err), fatal: true } satisfies KernelReply)
    return
  }
  try {
    if (acis) {
      const { brep, sheet } = brepOfSolid(k, props, { models })
      const model = brepToAcis(brep, sheet)
      const data = acis === 'sab' ? writeSab(model.recs) : writeSat(model.recs)
      self.postMessage({ id, ok: true, acis: data, kind: model.kind } satisfies KernelReply, typeof data === 'string' ? [] : [data.buffer])
      return
    }
    const r = evalSolid(k, props, { models, fine })
    const m = r.mesh
    self.postMessage({ id, ok: true, mesh: m, stats: { ...r.stats, initMs: kernelInitMs } } satisfies KernelReply, [m.positions.buffer, m.indices.buffer, m.triGroup.buffer, ...(m.normals ? [m.normals.buffer] : [])])
  } catch (err) {
    const e = err instanceof OcctEvalError ? err : null
    const op = err instanceof BrepToAcisError ? 'ACIS' : (e?.op ?? props.op)
    self.postMessage({ id, ok: false, op, message: err instanceof Error ? err.message : String(err), size: e?.size } satisfies KernelReply)
  }
}
