import { binaryDxfToDxfBytes, convertDwgToDxfBytes, dxfHasProxies, dxfProxyShapes, isBinaryDxf } from './dwgConvert'
import { importDxf, type DxfImportResult } from './dxf'

/**
 * DWG o DXF (de texto o binario) → dibujo interpretado; los sólidos ACIS, como sólidos importados con sus modelos en
 * `breps`, y las mallas, empaquetadas (ver `packMeshes`). Lo usan el hilo aparte y, sin él, el hilo principal. `light`: mallas con menos triángulos (teléfonos).
 */
export function readCad(kind: 'dwg' | 'dxf', data: ArrayBuffer, light = false): DxfImportResult {
  const raw = new Uint8Array(data)
  const text = kind === 'dxf' && !isBinaryDxf(raw) ? new TextDecoder().decode(raw) : null
  const conv = kind === 'dwg' ? convertDwgToDxfBytes(data, light) : !text ? binaryDxfToDxfBytes(data, light) : null
  const result = importDxf(conv ? new TextDecoder().decode(conv.bytes) : text!, { light, solids: conv?.solids, proxyShapes: text && dxfHasProxies(text) ? dxfProxyShapes(text) : undefined })
  if (!conv) return result
  const empty = { ...result.empty }
  for (const [k, n] of Object.entries(conv.empty)) empty[k] = (empty[k] ?? 0) + n
  return {
    ...result,
    ...(conv.wireSolids ? { wireSolids: (result.wireSolids ?? 0) + conv.wireSolids } : {}),
    ...(Object.keys(empty).length ? { empty } : {}),
  }
}
