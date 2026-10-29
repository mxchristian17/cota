import { DwgReader, DxfWriter } from '@node-projects/acad-ts'

/**
 * DWG → texto DXF con acad-ts (MIT, port a TypeScript de ACadSharp). Import estático a propósito: lo usan el hilo
 * aparte de lectura (`dwgWorker.ts`, un solo archivo) y, cargado bajo demanda, el hilo principal (`dwg.ts`).
 */
export function convertDwgToDxf(data: ArrayBuffer): string {
  const doc = DwgReader.readFromStream(data, null)
  const parts: string[] = []
  const sink = { write: (s: string) => void parts.push(s), flush: () => {}, close: () => {} }
  DxfWriter.writeToStream(sink as unknown as Parameters<typeof DxfWriter.writeToStream>[0], doc, false)
  return parts.join('')
}
