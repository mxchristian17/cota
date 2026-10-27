/**
 * DWG en el navegador, sin servidor: acad-ts (MIT, port a TypeScript de ACadSharp) lee el archivo y lo escribe como
 * DXF, que entra por el importador de siempre (capas, tipos de línea, cotas y bloques expandidos). La librería
 * pesa: se carga recién al abrir el primer .dwg.
 */
export async function dwgToDxfText(data: ArrayBuffer): Promise<string> {
  const { DwgReader, DxfWriter } = await import('@node-projects/acad-ts')
  const doc = DwgReader.readFromStream(data, null)
  const parts: string[] = []
  const sink = { write: (s: string) => void parts.push(s), flush: () => {}, close: () => {} }
  DxfWriter.writeToStream(sink as unknown as Parameters<typeof DxfWriter.writeToStream>[0], doc, false)
  return parts.join('')
}

/** El archivo empieza con la versión del formato (`AC1015` = 2000 … `AC1032` = 2018+). */
export function dwgVersion(data: ArrayBuffer): string | null {
  const head = new TextDecoder('ascii').decode(new Uint8Array(data, 0, Math.min(6, data.byteLength)))
  return /^AC\d{4}$/.test(head) ? head : null
}
