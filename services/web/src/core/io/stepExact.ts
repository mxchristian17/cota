import type { BrepSource } from '../document/types'
import type { StepReply, StepRequest } from './step.worker'
import type { StepReadOptions, StepReadResult } from './stepRead'
import type { StepSolid } from './stepWrite'
import type { LengthUnit } from 'occt-wasm'

/** Unidad del STEP para las unidades del dibujo (`DocumentData.units`); desconocida = mm. */
const STEP_UNIT: Record<string, LengthUnit> = { mm: 'mm', cm: 'cm', m: 'm', in: 'inch', ft: 'ft' }

/**
 * STEP exacto en un hilo aparte (`step.worker.ts`): se abre con el primer pedido y se cierra al terminar (el núcleo
 * ocupa memoria y un STEP se lee o se escribe de vez en cuando). Si el navegador no puede con el núcleo, la promesa
 * falla con `StepKernelError` (quien llama puede usar el camino de las mallas).
 */
export class StepKernelError extends Error {}

let seq = 0
/** Un pedido sin su número (lo pone `run`). */
type Request = StepRequest extends infer T ? (T extends unknown ? Omit<T, 'id'> : never) : never

function run<R extends StepReply & { ok: true }>(req: Request, transfer: Transferable[] = []): Promise<R> {
  return new Promise((resolve, reject) => {
    let w: Worker
    try {
      w = new Worker(new URL('./step.worker.ts', import.meta.url), { type: 'module' })
    } catch (err) {
      reject(new StepKernelError(err instanceof Error ? err.message : String(err)))
      return
    }
    const id = ++seq
    w.onmessage = (e: MessageEvent<StepReply>) => {
      if (e.data.id !== id) return
      w.terminate()
      if (e.data.ok) resolve(e.data as R)
      else reject(e.data.init ? new StepKernelError(e.data.message) : new Error(e.data.message))
    }
    w.onerror = (ev) => {
      ev.preventDefault()
      w.terminate()
      reject(new StepKernelError(ev.message || 'the STEP worker did not start'))
    }
    w.postMessage({ ...req, id } as StepRequest, transfer)
  })
}

/** Lee un STEP con su árbol y sus piezas exactas (el resultado de un DWG: bloques, inserciones, sólidos `BREP`). */
export async function readStepFile(data: ArrayBuffer, opts: StepReadOptions = {}): Promise<StepReadResult> {
  const r = await run<Extract<StepReply, { kind: 'read' }>>({ kind: 'read', data, opts }, [data])
  return r.result
}

/** STEP de unos sólidos con sus formas exactas, en las unidades del dibujo. */
export async function writeStepFile(
  solids: StepSolid[],
  models: Record<string, BrepSource>,
  units: string,
  mmPerUnit: number,
): Promise<{ step: string; written: number; failed: number }> {
  return run<Extract<StepReply, { kind: 'write' }>>({ kind: 'write', solids, models, unit: STEP_UNIT[units] ?? 'mm', mmPerUnit })
}
