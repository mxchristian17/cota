import { readCad } from './cadRead'
import { packMeshes } from './meshTransfer'

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
  } catch (err) {
    ctx.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
