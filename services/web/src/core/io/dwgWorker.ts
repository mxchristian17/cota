import { convertDwgToDxf } from './dwgConvert'

/** Hilo aparte que lee un DWG (ver `dwgToDxfInWorker`): la pantalla sigue respondiendo mientras tanto. */
const ctx = self as unknown as { onmessage: ((e: MessageEvent<ArrayBuffer>) => void) | null; postMessage: (m: unknown) => void }

ctx.onmessage = (e) => {
  try {
    ctx.postMessage({ ok: true, dxf: convertDwgToDxf(e.data) })
  } catch (err) {
    ctx.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
