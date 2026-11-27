import { readCad } from './cadRead'
import { packMeshes } from './meshTransfer'
import { encodeBrep } from '../document/brepStore'
import type { BrepModel } from '../document/types'

/**
 * Hilo aparte que lee un DWG o un DXF (ver `importCadInWorker`): la pantalla sigue respondiendo y el hilo principal
 * recibe sólo el dibujo ya interpretado (no el texto DXF, de decenas de MB).
 */
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<{ kind: 'dwg' | 'dxf'; data: ArrayBuffer; light?: boolean }>) => void) | null
  postMessage: (m: unknown, transfer?: Transferable[]) => void
}

ctx.onmessage = (e) => {
  try {
    const { kind, data, light } = e.data
    const out = readCad(kind, data, light)
    // Las mallas viajan como buffers transferidos (sin copia): ver `packMeshes`.
    const transfer = packMeshes(out)
    ctx.postMessage({ ok: true, result: out }, transfer)
    // Ya mandado el dibujo, los modelos de los sólidos comprimidos (lo que se guarda): comprimirlos antes demoraba la
    // apertura más de un segundo en un ensamble grande.
    if (out.breps) {
      const models: Record<string, BrepModel> = {}
      for (const [ref, b] of Object.entries(out.breps)) models[ref] = encodeBrep(b.bytes, b.fmt).model
      ctx.postMessage({ models })
    }
  } catch (err) {
    ctx.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
