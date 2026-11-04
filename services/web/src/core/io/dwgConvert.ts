import { CadDictionary, DimensionArc, DwgReader, Field, FieldList, DxfReader, DxfWriter, GraphicsType, Insert, ProxyGeometryReader, Line, Mesh, ModelerGeometry, MText, MultiLeader, Polyline3D, ProxyEntity, Solid, UnknownEntity, XYZ, type CadDocument, type Entity, type IProxyGeometry, type ModelerGeometryWire } from '@node-projects/acad-ts'

import { acisEdges } from './acis'
import { acisMesh, SOLID_MESH_REF } from './acisMesh'
import { packMesh, type PackedMesh } from './meshTransfer'

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
  solidMeshes: PackedMesh[]
}

export function convertDwgToDxfBytes(data: ArrayBuffer, light = false): CadConversion {
  const doc = DwgReader.readFromStream(data, null)
  const solidMeshes: PackedMesh[] = []
  const wireSolids = solidsAsWires(doc, solidMeshes, light)
  simplifyForDxf(doc)
  adoptOrphans(doc)
  return { bytes: writeDxfBytes(doc), wireSolids, solidMeshes }
}

/** ¿DXF binario? Empieza con "AutoCAD Binary DXF" (el importador lee el de texto). */
export const isBinaryDxf = (b: Uint8Array): boolean => b.length > 18 && new TextDecoder('latin1').decode(b.subarray(0, 18)) === 'AutoCAD Binary DXF'

/** DXF binario → DXF de texto (lo lee acad-ts y lo vuelve a escribir). */
export function binaryDxfToDxfBytes(data: ArrayBuffer, light = false): CadConversion {
  const doc = DxfReader.readFromStream(new Uint8Array(data))
  const solidMeshes: PackedMesh[] = []
  const wireSolids = solidsAsWires(doc, solidMeshes, light)
  simplifyForDxf(doc)
  adoptOrphans(doc)
  return { bytes: writeDxfBytes(doc), wireSolids, solidMeshes }
}

/**
 * Objetos sin dueño: el lector deja así algunos (los campos anidados de un FIELD, p. ej. el de un texto que muestra un
 * dato del dibujo) y el escritor de DXF escribe el dueño de cada objeto: con uno solo así fallaba todo el archivo. Cada
 * uno pasa a ser del objeto que lo contiene.
 */
export function adoptOrphans(doc: CadDocument): void {
  const seen = new Set<object>()
  type Node = { owner?: unknown; xDictionary?: unknown } | null | undefined
  const visit = (o: Node, parent: unknown): void => {
    if (!o || typeof o !== 'object' || seen.has(o)) return
    seen.add(o)
    if (o.owner == null && parent) o.owner = parent
    visit(o.xDictionary as Node, o)
    if (o instanceof CadDictionary) for (const e of o) visit(e as Node, o)
    if (o instanceof Field) for (const c of o.children ?? []) visit(c as Node, o)
    if (o instanceof FieldList) for (const f of o.fields ?? []) visit(f as Node, o)
  }
  visit(doc.rootDictionary as Node, null)
  for (const br of doc.blockRecords ?? []) {
    visit(br as Node, null)
    for (const e of br.entities) visit(e as Node, br)
  }
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
export function solidsAsWires(doc: CadDocument, meshes: PackedMesh[] = [], light = false): number {
  let n = 0
  for (const br of doc.blockRecords ?? []) {
    for (const e of [...br.entities]) {
      if (!(e instanceof ModelerGeometry)) continue
      const mesh = e.acisData?.length ? acisMesh(e.acisData, light) : null
      if (mesh) {
        const ref = new Mesh()
        ref.vertices = [new XYZ(meshes.length, SOLID_MESH_REF, SOLID_MESH_REF)]
        ref.faces = []
        meshes.push(packMesh(mesh))
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

/** ¿El DXF de texto tiene entidades proxy? (su dibujo de reemplazo lo interpreta la librería). */
export const dxfHasProxies = (text: string): boolean => /\n\s*ACAD_PROXY_ENTITY\s*\r?\n/.test(text)

/** Una forma del dibujo de reemplazo de una proxy: una polilínea o una malla. */
export type ProxyShape = { pts: Vec3[] } | { vertices: Vec3[]; faces: number[][] }
type Vec3 = [number, number, number]

/**
 * El dibujo de reemplazo de una entidad proxy (de las versiones verticales del CAD: mecánica, arquitectura, civil…), que
 * el archivo guarda para quien no tiene el programa que la creó: líneas, polilíneas, círculos, arcos y mallas, con sus
 * transformaciones. Los textos de ese dibujo no se traen.
 */
export function proxyShapes(geoms: IProxyGeometry[]): ProxyShape[] {
  const out: ProxyShape[] = []
  type M = number[]
  const stack: M[] = []
  let m: M | null = null
  const tp = (p: XYZ): Vec3 => (m ? [m[0] * p.x + m[1] * p.y + m[2] * p.z + m[3], m[4] * p.x + m[5] * p.y + m[6] * p.z + m[7], m[8] * p.x + m[9] * p.y + m[10] * p.z + m[11]] : [p.x, p.y, p.z])
  const poly = (pts: XYZ[], closed = false) => {
    if (pts.length < 2) return
    const q = pts.map(tp)
    if (closed) q.push(q[0])
    out.push({ pts: q })
  }
  const ring = (c: XYZ, r: number, n: XYZ, start: XYZ | null, sweep: number) => {
    const nl = Math.hypot(n.x, n.y, n.z) || 1
    const nn = [n.x / nl, n.y / nl, n.z / nl]
    let u = start ? [start.x, start.y, start.z] : Math.abs(nn[2]) < 0.9 ? [-nn[1], nn[0], 0] : [0, -nn[2], nn[1]]
    const d = u[0] * nn[0] + u[1] * nn[1] + u[2] * nn[2]
    u = [u[0] - d * nn[0], u[1] - d * nn[1], u[2] - d * nn[2]]
    const ul = Math.hypot(u[0], u[1], u[2]) || 1
    u = u.map((x) => x / ul)
    const v = [nn[1] * u[2] - nn[2] * u[1], nn[2] * u[0] - nn[0] * u[2], nn[0] * u[1] - nn[1] * u[0]]
    const steps = Math.max(4, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * 48))
    poly(
      Array.from({ length: steps + 1 }, (_, i) => {
        const t = (sweep * i) / steps
        return new XYZ(c.x + r * (u[0] * Math.cos(t) + v[0] * Math.sin(t)), c.y + r * (u[1] * Math.cos(t) + v[1] * Math.sin(t)), c.z + r * (u[2] * Math.cos(t) + v[2] * Math.sin(t)))
      }),
    )
  }
  for (const g of geoms as Array<IProxyGeometry & Record<string, any>>) {
    switch (g.graphicsType) {
      case GraphicsType.Circle:
        ring(g.center, g.radius, g.normal, null, 2 * Math.PI)
        break
      case GraphicsType.CircularArc:
        ring(g.center, g.radius, g.normal, g.startVectorDirection, g.sweepAngle)
        break
      case GraphicsType.Polyline:
      case GraphicsType.PolylineWithNormal:
      case GraphicsType.LwPolyine:
        poly(g.points ?? [])
        break
      case GraphicsType.Polygon:
        poly(g.points ?? [], true)
        break
      case GraphicsType.Shell: {
        const faces = (g.faces as number[][]).filter((f) => f.length >= 3)
        if (faces.length) out.push({ vertices: (g.vertices as XYZ[]).map(tp), faces })
        break
      }
      case GraphicsType.Mesh: {
        const [rows, cols] = [g.rowCount as number, g.columnCount as number]
        const faces: number[][] = []
        for (let i = 0; i + 1 < rows; i++) for (let j = 0; j + 1 < cols; j++) faces.push([i * cols + j, i * cols + j + 1, (i + 1) * cols + j + 1, (i + 1) * cols + j])
        if (faces.length) out.push({ vertices: (g.vertices as XYZ[]).map(tp), faces })
        break
      }
      case GraphicsType.PushModelTransform:
      case GraphicsType.PushModelTransform2: {
        const x = g.matrix
        if (!x) break
        const k: M = [x.m00, x.m01, x.m02, x.m03, x.m10, x.m11, x.m12, x.m13, x.m20, x.m21, x.m22, x.m23]
        const p = m ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]
        stack.push(p)
        const r: M = []
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) r[i * 4 + j] = p[i * 4] * k[j] + p[i * 4 + 1] * k[4 + j] + p[i * 4 + 2] * k[8 + j]
          r[i * 4 + 3] = p[i * 4] * k[3] + p[i * 4 + 1] * k[7] + p[i * 4 + 2] * k[11] + p[i * 4 + 3]
        }
        m = r
        break
      }
      case GraphicsType.PopModelTransform:
        m = stack.pop() ?? null
        break
    }
  }
  return out
}

/** Las formas de una proxy como entidades de la librería (camino del DWG). */
function proxyParts(geoms: IProxyGeometry[]): Entity[] {
  return proxyShapes(geoms).map((s): Entity => {
    if ('pts' in s) {
      const q = s.pts.map(([x, y, z]) => new XYZ(x, y, z))
      return q.length === 2 ? Object.assign(new Line(), { startPoint: q[0], endPoint: q[1] }) : new Polyline3D(q)
    }
    const mesh = new Mesh()
    mesh.vertices = s.vertices.map(([x, y, z]) => new XYZ(x, y, z))
    mesh.faces = s.faces
    return mesh
  })
}

/**
 * Proxies de un DXF de texto: el dibujo de reemplazo de cada ACAD_PROXY_ENTITY (los 310 que siguen al 92 o 160), por su
 * handle. El importador las trae con estas formas.
 */
export function dxfProxyShapes(text: string): Map<string, ProxyShape[]> {
  const out = new Map<string, ProxyShape[]>()
  const re = /\n\s*0\s*\r?\nACAD_PROXY_ENTITY\s*\r?\n/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = text.indexOf('\n  0', m.index + m[0].length)
    const body = text.slice(m.index + m[0].length, end < 0 ? undefined : end).split(/\r?\n/)
    let handle = ''
    const hex: string[] = []
    let inGraphics = false
    for (let i = 0; i + 1 < body.length; i += 2) {
      const code = body[i].trim()
      const v = body[i + 1].trim()
      if (code === '5' && !handle) handle = v.toUpperCase()
      if (code === '92' || code === '160') inGraphics = true // tamaño del dibujo (160 desde 2010)
      else if (code === '310' && inGraphics) hex.push(v)
      else if (inGraphics && code !== '310') inGraphics = false
    }
    if (!handle || !hex.length) continue
    const h = hex.join('')
    const bytes = new Uint8Array(h.length >> 1)
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.substr(i * 2, 2), 16)
    try {
      const shapes = proxyShapes(ProxyGeometryReader.readGeometries(bytes))
      if (shapes.length) out.set(handle, shapes)
    } catch {
      // Un dibujo de reemplazo ilegible: la proxy queda como no soportada.
    }
  }
  return out
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
      else if ((e instanceof ProxyEntity || e instanceof UnknownEntity) && e.proxyGeometries?.length) parts = proxyParts(e.proxyGeometries)
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
