import { describe, expect, it, vi } from 'vitest'
import { ACadVersion, BlockRecord, CadDocument, Circle, DwgWriter, DxfWriter, Insert, Layer, Line, ModelerGeometryWire, Solid3D, XY, XYZ } from '@node-projects/acad-ts'
import { CadTimeoutError, dwgToDxfText, dwgVersion, importCadInWorker } from './dwg'
import { importDxf } from './dxf'
import { solidsAsWires } from './dwgConvert'

/** Un DWG 2018 armado en el test: una línea y un círculo en una capa, y un bloque insertado dos veces. */
function sampleDwg(): ArrayBuffer {
  const doc = new CadDocument()
  doc.header!.version = ACadVersion.AC1032
  const ejes = new Layer('Ejes')
  doc.layers!.add(ejes)
  const line = new Line()
  line.startPoint = new XYZ(0, 0, 0)
  line.endPoint = new XYZ(100, 0, 0)
  line.layer = ejes
  doc.modelSpace!.entities.add(line)
  const circle = new Circle()
  circle.center = new XYZ(50, 50, 0)
  circle.radius = 10
  doc.modelSpace!.entities.add(circle)
  const br = new BlockRecord('Perno')
  const head = new Circle()
  head.center = new XYZ(0, 0, 0)
  head.radius = 3
  br.entities.add(head)
  doc.blockRecords!.add(br)
  for (const x of [200, 300]) {
    const ins = new Insert(br)
    ins.insertPoint = new XYZ(x, 20, 0)
    doc.modelSpace!.entities.add(ins)
  }
  const bytes = DwgWriter.writeToBuffer(doc)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

describe('DWG en el navegador (acad-ts)', () => {
  it('lee capas, entidades y bloques de un DWG sin servidor', async () => {
    const data = sampleDwg()
    expect(dwgVersion(data)).toBe('AC1032')
    const r = importDxf(await dwgToDxfText(data))
    expect(r.layers.map((l) => l.name)).toContain('Ejes')
    const line = r.entities.find((e) => e.type === 'LINE')!
    expect(line.layerName).toBe('Ejes')
    const circles = r.entities.filter((e) => e.type === 'CIRCLE').map((e) => e.props as unknown as { center: number[]; radius: number })
    expect(circles.find((c) => c.radius === 10)?.center.slice(0, 2)).toEqual([50, 50])
    // El bloque se expande en cada inserción.
    const heads = circles.filter((c) => c.radius === 3).map((c) => c.center[0]).sort((a, b) => a - b)
    expect(heads).toEqual([200, 300])
  })

  it('un archivo que no es DWG se reconoce antes de intentar leerlo', () => {
    expect(dwgVersion(new TextEncoder().encode('0\nSECTION').buffer as ArrayBuffer)).toBeNull()
  })
})

describe('guardar DWG en el navegador', () => {
  it('el DXF de Cota se escribe como DWG 2018 y se vuelve a leer igual', async () => {
    const { exportDxf } = await import('./dxf')
    const { dxfTextToDwg } = await import('./dwg')
    const layers = [{ id: 'L1', name: 'Ejes', color: '#ff8000', visible: true, locked: false, frozen: false, printable: true, lineWeight: 0.25, lineType: 'CONTINUOUS' }]
    const ents = [
      { id: 'a', type: 'LINE', layer: 'L1', props: { start: [0, 0, 0], end: [120, 40, 0] } },
      { id: 'b', type: 'CIRCLE', layer: 'L1', props: { center: [60, 20, 0], radius: 15, normal: [0, 0, 1] } },
    ]
    const dwg = await dxfTextToDwg(exportDxf(ents as never, layers as never, 'L1'))
    expect(dwgVersion(dwg)).toBe('AC1032')
    const r = importDxf(await dwgToDxfText(dwg))
    expect(r.layers.find((l) => l.name === 'Ejes')?.color).toBe('#ff8000') // color verdadero: sin invertir rojo y azul
    const line = r.entities.find((e) => e.type === 'LINE')!
    expect((line.props as unknown as { end: number[] }).end.slice(0, 2)).toEqual([120, 40])
    expect(line.layerName).toBe('Ejes')
    expect((r.entities.find((e) => e.type === 'CIRCLE')!.props as unknown as { radius: number }).radius).toBe(15)
  })
})

describe('mensajes de error de DWG', () => {
  it('un módulo que no carga dice cómo resolverlo; otro error se muestra tal cual', async () => {
    const { dwgErrorMessage } = await import('./dwg')
    expect(dwgErrorMessage(new TypeError('Failed to fetch dynamically imported module: https://x/assets/dist-1.js'))).toContain('reload the page')
    expect(dwgErrorMessage(new Error('Entry not found'))).toBe('Entry not found')
  })

  it('trae la vista con que se guardó (VPORT *Active) para abrir ahí, como el CAD clásico', async () => {
    const doc = new CadDocument()
    doc.header!.version = ACadVersion.AC1032
    const line = new Line()
    line.startPoint = new XYZ(0, 0, 0)
    line.endPoint = new XYZ(100, 0, 0)
    doc.modelSpace!.entities.add(line)
    const active = [...doc.vPorts!].find((v) => v.name.toUpperCase() === '*ACTIVE')!
    active.center = new XY(40, 5)
    active.viewHeight = 12
    active.aspectRatio = 2
    const bytes = DwgWriter.writeToBuffer(doc)
    // Sin Worker (Node) lee en el hilo principal: mismo resultado.
    const r = await importCadInWorker('dwg', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    expect(r.view).toMatchObject({ center: [40, 5], height: 12, aspect: 2, direction: [0, 0, 1] })
  })

  it('los textos con acentos y eñes llegan intactos (el DXF se escribe en bytes UTF-8)', async () => {
    const doc = new CadDocument()
    doc.header!.version = ACadVersion.AC1032
    const capa = new Layer('Caños y bocas — Ø20')
    doc.layers!.add(capa)
    const line = new Line()
    line.startPoint = new XYZ(0, 0, 0)
    line.endPoint = new XYZ(10, 0, 0)
    line.layer = capa
    doc.modelSpace!.entities.add(line)
    const bytes = DwgWriter.writeToBuffer(doc)
    const r = await importCadInWorker('dwg', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    expect(r.layers.map((l) => l.name)).toContain('Caños y bocas — Ø20')
    expect(r.entities.find((e) => e.type === 'LINE')?.layerName).toBe('Caños y bocas — Ø20')
  })
  it('un DXF también se lee aparte (mismo importador)', async () => {
    const dxf = '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n30\n0\n11\n5\n21\n0\n31\n0\n0\nENDSEC\n0\nEOF\n'
    const r = await importCadInWorker('dxf', new TextEncoder().encode(dxf).buffer as ArrayBuffer)
    expect(r.entities.map((e) => e.type)).toEqual(['LINE'])
  })
  it('un DWG que no termina de leerse se corta con un mensaje (no queda "leyendo" para siempre)', async () => {
    let terminated = false
    class Stuck {
      onmessage: unknown = null
      onerror: unknown = null
      postMessage() {}
      terminate() {
        terminated = true
      }
    }
    vi.stubGlobal('Worker', Stuck)
    try {
      await expect(importCadInWorker('dwg', new ArrayBuffer(8), 30)).rejects.toBeInstanceOf(CadTimeoutError)
      expect(terminated).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('los sólidos ACIS se traen por sus aristas guardadas (también dentro de bloques), en su capa', () => {
    const doc = new CadDocument()
    const capa = new Layer('Pieza')
    doc.layers!.add(capa)
    const solid = (pts: XYZ[][]) => {
      const s = new Solid3D()
      s.layer = capa
      s.wires = pts.map((p) => Object.assign(new ModelerGeometryWire(), { points: p, applyTransformPresent: false }))
      return s
    }
    doc.modelSpace!.entities.add(solid([[new XYZ(0, 0, 0), new XYZ(10, 0, 0)], [new XYZ(0, 0, 0), new XYZ(0, 5, 0), new XYZ(0, 5, 8)]]))
    const br = new BlockRecord('Perno')
    br.entities.add(solid([[new XYZ(0, 0, 0), new XYZ(0, 0, 20)]]))
    doc.blockRecords!.add(br)
    const ins = new Insert(br)
    ins.insertPoint = new XYZ(100, 0, 0)
    doc.modelSpace!.entities.add(ins)
    expect(solidsAsWires(doc)).toBe(2)
    const parts: string[] = []
    DxfWriter.writeToStream({ write: (t: string) => void parts.push(t), flush: () => {}, close: () => {} } as unknown as Parameters<typeof DxfWriter.writeToStream>[0], doc, false)
    const r = importDxf(parts.join(''))
    expect(r.unsupported).not.toContain('3DSOLID')
    const lines = r.entities.filter((e) => e.type === 'LINE')
    const polys = r.entities.filter((e) => e.type === 'POLYLINE')
    expect(lines).toHaveLength(2) // una del modelo y la del bloque insertado
    expect(polys).toHaveLength(1)
    expect((polys[0].props as unknown as { vertices: number[][] }).vertices).toEqual([[0, 0, 0], [0, 5, 0], [0, 5, 8]])
    expect(lines.every((e) => e.layerName === 'Pieza')).toBe(true)
    const inBlock = lines.find((e) => (e.props as unknown as { start: number[] }).start[0] === 100)
    expect((inBlock?.props as unknown as { end: number[] }).end).toEqual([100, 0, 20])
  })
})
