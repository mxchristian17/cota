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

/**
 * DXF → DWG en el navegador: el DXF que ya exporta Cota se lee con acad-ts y se escribe como DWG 2018 (AC1032), el
 * formato que abren los programas actuales.
 */
export async function dxfTextToDwg(dxf: string): Promise<ArrayBuffer> {
  const { ACadVersion, Color, DwgWriter, DxfReader } = await import('@node-projects/acad-ts')
  const doc = DxfReader.readFromStream(new TextEncoder().encode(dxf))
  doc.header!.version = ACadVersion.AC1032
  // acad-ts 3.6 escribe el color verdadero como R-G-B y el formato (y su propio lector) lo esperan B-G-R: se invierte
  // antes de escribir para que el DWG salga con los colores correctos.
  type Colored = { color: InstanceType<typeof Color> }
  const fix = (o: Colored) => {
    const c = o.color
    if (c?.isTrueColor) o.color = Color.fromTrueColor((c.b << 16) | (c.g << 8) | c.r)
  }
  for (const l of doc.layers ?? []) fix(l as unknown as Colored)
  for (const br of doc.blockRecords ?? []) for (const e of br.entities) fix(e as unknown as Colored)
  // Las tablas que el DWG exige (estilo de texto y de cota Standard…) aunque el DXF no las traiga.
  doc.createDefaults()
  const bytes = DwgWriter.writeToBuffer(doc)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/**
 * Mensaje útil cuando falla el DWG en el navegador: si el módulo no se pudo cargar (sin conexión, una versión vieja
 * en caché), se dice cómo resolverlo; si no, el motivo del lector o escritor.
 */
export function dwgErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/dynamically imported module|Importing a module script failed|Failed to fetch|error loading/i.test(msg)) {
    return 'the DWG converter could not be loaded. Check the connection and reload the page (Ctrl+F5), then try again.'
  }
  return msg
}
