import { binaryDxfToDxfBytes, convertDwgToDxfBytes, dxfHasProxies, dxfProxyShapes, isBinaryDxf } from './dwgConvert'
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
    const raw = new Uint8Array(data)
    const text = kind === 'dxf' && !isBinaryDxf(raw) ? new TextDecoder().decode(raw) : null
    const conv = kind === 'dwg' ? convertDwgToDxfBytes(data) : !text ? binaryDxfToDxfBytes(data) : null
    const result = importDxf(conv ? new TextDecoder().decode(conv.bytes) : text!, { solidMeshes: conv?.solidMeshes, proxyShapes: text && dxfHasProxies(text) ? dxfProxyShapes(text) : undefined })
    ctx.postMessage({ ok: true, result: conv?.wireSolids ? { ...result, wireSolids: (result.wireSolids ?? 0) + conv.wireSolids } : result })
  } catch (err) {
    ctx.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
