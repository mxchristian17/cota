import { convertDwgToDxfBytes } from './dwgConvert'
import { importDxf } from './dxf'

/**
 * Hilo aparte que lee un DWG o un DXF (ver `importCadInWorker`): la pantalla sigue respondiendo y el hilo principal
 * recibe sólo el dibujo ya interpretado (no el texto DXF, de decenas de MB).
 */
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<{ kind: 'dwg' | 'dxf'; data: ArrayBuffer }>) => void) | null
  postMessage: (m: unknown) => void
}

ctx.onmessage = (e) => {
  try {
    const { kind, data } = e.data
    const text = new TextDecoder().decode(kind === 'dwg' ? convertDwgToDxfBytes(data) : new Uint8Array(data))
    ctx.postMessage({ ok: true, result: importDxf(text) })
  } catch (err) {
    ctx.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
