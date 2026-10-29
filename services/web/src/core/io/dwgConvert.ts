import { DwgReader, DxfWriter, Line, ModelerGeometry, Polyline3D, XYZ, type CadDocument, type ModelerGeometryWire } from '@node-projects/acad-ts'

/**
 * DWG → DXF con acad-ts (MIT, port a TypeScript de ACadSharp). Import estático a propósito: lo usan el hilo aparte
 * de lectura (`cadWorker.ts`, un solo archivo) y, cargado bajo demanda, el hilo principal (`dwg.ts`).
 *
 * El DXF se escribe directo a bytes UTF-8: juntar los ~1,5 millones de pedacitos que manda el escritor como textos
 * costaba más de 400 MB para un DWG de 3,5 MB (en un teléfono el hilo se quedaba sin memoria y moría sin avisar).
 */
export function convertDwgToDxfBytes(data: ArrayBuffer): { bytes: Uint8Array; wireSolids: number } {
  const doc = DwgReader.readFromStream(data, null)
  const wireSolids = solidsAsWires(doc)
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
  return { bytes: buf.subarray(0, len), wireSolids }
}

export const convertDwgToDxf = (data: ArrayBuffer): string => new TextDecoder().decode(convertDwgToDxfBytes(data).bytes)

/** Punto de una arista guardada, con su transformación si la trae. */
function wirePoint(w: ModelerGeometryWire, p: XYZ): XYZ {
  if (!w.applyTransformPresent) return p
  const s = w.scale || 1
  const [x, y, z] = [p.x * s, p.y * s, p.z * s]
  const { xAxis: a, yAxis: b, zAxis: c, translation: t } = w
  return new XYZ(a.x * x + b.x * y + c.x * z + t.x, a.y * x + b.y * y + c.y * z + t.y, a.z * x + b.z * y + c.z * z + t.z)
}

/**
 * Sólidos, regiones y cuerpos ACIS (3DSOLID, REGION, BODY): Cota todavía no lee su geometría, pero el DWG guarda junto a
 * cada uno sus aristas e isolíneas como puntos (lo que el CAD clásico dibuja en alambre). Se reemplazan por esas líneas
 * y polilíneas 3D, en su capa, color y tipo de línea, también dentro de los bloques: la pieza se ve, sin caras. Los que
 * no las traen se omiten como antes. Devuelve cuántos se reemplazaron.
 */
export function solidsAsWires(doc: CadDocument): number {
  let n = 0
  for (const br of doc.blockRecords ?? []) {
    for (const e of [...br.entities]) {
      if (!(e instanceof ModelerGeometry) || !e.wires?.length) continue
      for (const w of e.wires) {
        const pts = (w.points ?? []).map((p) => wirePoint(w, p))
        if (pts.length < 2) continue
        let edge: Line | Polyline3D
        if (pts.length === 2) {
          edge = new Line()
          edge.startPoint = pts[0]
          edge.endPoint = pts[1]
        } else edge = new Polyline3D(pts)
        edge.layer = e.layer
        edge.color = e.color
        edge.lineType = e.lineType
        edge.lineTypeScale = e.lineTypeScale
        edge.lineWeight = e.lineWeight
        br.entities.add(edge)
      }
      br.entities.remove(e)
      n++
    }
  }
  return n
}
