import { DimensionArc, DwgReader, DxfReader, DxfWriter, Insert, Line, Mesh, ModelerGeometry, MText, MultiLeader, Polyline3D, Solid, XYZ, type CadDocument, type Entity, type ModelerGeometryWire } from '@node-projects/acad-ts'

import { acisEdges } from './acis'
import { acisMesh, SOLID_MESH_REF } from './acisMesh'
import type { MeshProps } from '../document/types'

/**
 * DWG → DXF con acad-ts (MIT, port a TypeScript de ACadSharp). Import estático a propósito: lo usan el hilo aparte
 * de lectura (`cadWorker.ts`, un solo archivo) y, cargado bajo demanda, el hilo principal (`dwg.ts`).
 *
 * El DXF se escribe directo a bytes UTF-8: juntar los ~1,5 millones de pedacitos que manda el escritor como textos
 * costaba más de 400 MB para un DWG de 3,5 MB (en un teléfono el hilo se quedaba sin memoria y moría sin avisar).
 */
export interface CadConversion {
  bytes: Uint8Array
  /** Sólidos que quedaron como sus aristas (sin caras legibles). */
  wireSolids: number
  /** Mallas de los sólidos leídos con sus caras: el DXF las nombra por su posición acá (ver `SOLID_MESH_REF`). */
  solidMeshes: MeshProps[]
}

export function convertDwgToDxfBytes(data: ArrayBuffer): CadConversion {
  const doc = DwgReader.readFromStream(data, null)
  const solidMeshes: MeshProps[] = []
  const wireSolids = solidsAsWires(doc, solidMeshes)
  simplifyForDxf(doc)
  return { bytes: writeDxfBytes(doc), wireSolids, solidMeshes }
}

/** ¿DXF binario? Empieza con "AutoCAD Binary DXF" (el importador lee el de texto). */
export const isBinaryDxf = (b: Uint8Array): boolean => b.length > 18 && new TextDecoder('latin1').decode(b.subarray(0, 18)) === 'AutoCAD Binary DXF'

/** DXF binario → DXF de texto (lo lee acad-ts y lo vuelve a escribir). */
export function binaryDxfToDxfBytes(data: ArrayBuffer): CadConversion {
  const doc = DxfReader.readFromStream(new Uint8Array(data))
  const solidMeshes: MeshProps[] = []
  const wireSolids = solidsAsWires(doc, solidMeshes)
  simplifyForDxf(doc)
  return { bytes: writeDxfBytes(doc), wireSolids, solidMeshes }
}

function writeDxfBytes(doc: CadDocument): Uint8Array {
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
 * Sólidos, regiones y cuerpos ACIS (3DSOLID, REGION, BODY): se leen sus caras del modelo ACIS y cada uno pasa a ser una
 * malla (en `meshes`; en el dibujo queda una MESH que la nombra, así también se ubica dentro de los bloques). Los que no
 * tienen caras legibles se reemplazan por sus aristas: las guardadas como puntos (lo que el CAD clásico dibuja en
 * alambre) o las del modelo. Todo en su capa, color y tipo de línea. Devuelve cuántos quedaron como aristas.
 */
export function solidsAsWires(doc: CadDocument, meshes: MeshProps[] = []): number {
  let n = 0
  for (const br of doc.blockRecords ?? []) {
    for (const e of [...br.entities]) {
      if (!(e instanceof ModelerGeometry)) continue
      const mesh = e.acisData?.length ? acisMesh(e.acisData) : null
      if (mesh) {
        const ref = new Mesh()
        ref.vertices = [new XYZ(meshes.length, SOLID_MESH_REF, SOLID_MESH_REF)]
        ref.faces = []
        meshes.push({ vertices: mesh.vertices, faces: mesh.faces })
        ref.layer = e.layer
        ref.color = e.color
        ref.lineType = e.lineType
        ref.lineTypeScale = e.lineTypeScale
        ref.lineWeight = e.lineWeight
        br.entities.add(ref)
        br.entities.remove(e)
        continue
      }
      // Sin aristas guardadas se leen del modelo ACIS.
      const wires = e.wires?.length
        ? e.wires.map((w) => (w.points ?? []).map((p) => wirePoint(w, p)))
        : e.acisData?.length
          ? acisEdges(e.acisData).map((poly) => poly.map(([x, y, z]) => new XYZ(x, y, z)))
          : []
      if (!wires.length) continue
      for (const pts of wires) {
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

/**
 * Entidades que el escritor de DXF no vuelca completas y que el DWG sí trae: se cambian acá por sus piezas. Una
 * multidirectriz, por sus líneas, flechas y texto; una cota de arco, por el bloque con el que ya viene dibujada.
 */
export function simplifyForDxf(doc: CadDocument): void {
  for (const br of doc.blockRecords ?? []) {
    for (const e of [...br.entities]) {
      let parts: Entity[] | null = null
      if (e instanceof MultiLeader) parts = multiLeaderParts(e)
      else if (e instanceof DimensionArc) parts = e.block ? [new Insert(e.block)] : []
      if (!parts) continue
      for (const part of parts) {
        part.layer = e.layer
        part.color = e.color
        part.lineType = e.lineType
        part.lineTypeScale = e.lineTypeScale
        part.lineWeight = e.lineWeight
        br.entities.add(part)
      }
      br.entities.remove(e)
    }
  }
}

function multiLeaderParts(m: MultiLeader): Entity[] {
  const ctx = m.contextData
  if (!ctx) return []
  const out: Entity[] = []
  const size = ctx.arrowheadSize || m.arrowheadSize || 0
  for (const root of ctx.leaderRoots ?? []) {
    for (const leader of root.lines ?? []) {
      const pts = [...(leader.points ?? []), root.connectionPoint].filter(Boolean)
      if (pts.length < 2) continue
      out.push(new Polyline3D(pts))
      const [tip, next] = pts
      const [dx, dy] = [next.x - tip.x, next.y - tip.y]
      const l = Math.hypot(dx, dy)
      if (size > 0 && l > 1e-9) {
        const [ux, uy] = [dx / l, dy / l]
        const [bx, by] = [tip.x + ux * size, tip.y + uy * size]
        const w = size / 6
        const a = new XYZ(bx - uy * w, by + ux * w, tip.z)
        const b = new XYZ(bx + uy * w, by - ux * w, tip.z)
        out.push(new Solid(tip, a, b, b))
      }
    }
  }
  if (ctx.hasTextContents && ctx.textLabel?.trim()) {
    const t = new MText(ctx.textLabel)
    t.insertPoint = ctx.textLocation
    t.height = ctx.textHeight || 2.5
    out.push(t)
  }
  if (ctx.hasContentsBlock && ctx.blockContent) {
    const ins = new Insert(ctx.blockContent)
    ins.insertPoint = ctx.blockContentLocation
    out.push(ins)
  }
  return out
}
