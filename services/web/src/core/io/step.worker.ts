/// <reference lib="webworker" />
/**
 * Hilo de los STEP exactos: leer (árbol de ensamble, piezas como modelos exactos y lo que se dibuja de cada una) y
 * escribir (los sólidos del dibujo con sus formas exactas), con el núcleo exacto (OpenCascade).
 */
import type { LengthUnit } from 'occt-wasm'
import type { BrepSource } from '../document/types'
import { loadKernel } from '../occt/loadKernel'
import { displayBuffers } from './importedBrep'
import { readStepExact, type StepReadOptions, type StepReadResult } from './stepRead'
import { writeStepExact, type StepSolid } from './stepWrite'

export type StepRequest =
  | { id: number; kind: 'read'; data: ArrayBuffer; opts: StepReadOptions }
  | { id: number; kind: 'write'; solids: StepSolid[]; models: Record<string, BrepSource>; unit: LengthUnit; mmPerUnit: number }

export type StepReply =
  | { id: number; ok: true; kind: 'read'; result: StepReadResult }
  | { id: number; ok: true; kind: 'write'; step: string; written: number; failed: number }
  | { id: number; ok: false; message: string; init?: boolean }

self.onmessage = async (ev: MessageEvent<StepRequest>) => {
  const req = ev.data
  let k
  try {
    k = await loadKernel()
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, init: true, message: err instanceof Error ? err.message : String(err) } satisfies StepReply)
    return
  }
  try {
    if (req.kind === 'read') {
      const result = readStepExact(k, new TextDecoder().decode(req.data), req.opts)
      const transfer = Object.values(result.breps ?? {}).flatMap((b) => [b.bytes.buffer as ArrayBuffer, ...displayBuffers(b.display)])
      self.postMessage({ id: req.id, ok: true, kind: 'read', result } satisfies StepReply, transfer)
    } else {
      const out = writeStepExact(k, req.solids, { models: req.models, unit: req.unit, mmPerUnit: req.mmPerUnit })
      self.postMessage({ id: req.id, ok: true, kind: 'write', ...out } satisfies StepReply)
    }
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, message: err instanceof Error ? err.message : String(err) } satisfies StepReply)
  }
}
