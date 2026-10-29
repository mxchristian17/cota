import { DwgReader, DxfWriter } from '@node-projects/acad-ts'

/**
 * DWG → DXF con acad-ts (MIT, port a TypeScript de ACadSharp). Import estático a propósito: lo usan el hilo aparte
 * de lectura (`cadWorker.ts`, un solo archivo) y, cargado bajo demanda, el hilo principal (`dwg.ts`).
 *
 * El DXF se escribe directo a bytes UTF-8: juntar los ~1,5 millones de pedacitos que manda el escritor como textos
 * costaba más de 400 MB para un DWG de 3,5 MB (en un teléfono el hilo se quedaba sin memoria y moría sin avisar).
 */
export function convertDwgToDxfBytes(data: ArrayBuffer): Uint8Array {
  const doc = DwgReader.readFromStream(data, null)
  const enc = new TextEncoder()
  let buf = new Uint8Array(1 << 22)
  let len = 0
  const sink = {
    write: (s: string) => {
      // Un carácter UTF-16 ocupa a lo sumo 3 bytes en UTF-8.
      if (len + s.length * 3 > buf.length) {
        const grown = new Uint8Array(Math.max(buf.length * 2, len + s.length * 3))
        grown.set(buf.subarray(0, len))
        buf = grown
      }
      len += enc.encodeInto(s, buf.subarray(len)).written
    },
    flush: () => {},
    close: () => {},
  }
  DxfWriter.writeToStream(sink as unknown as Parameters<typeof DxfWriter.writeToStream>[0], doc, false)
  return buf.subarray(0, len)
}

export const convertDwgToDxf = (data: ArrayBuffer): string => new TextDecoder().decode(convertDwgToDxfBytes(data))
