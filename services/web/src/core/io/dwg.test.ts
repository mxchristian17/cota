import { describe, expect, it } from 'vitest'
import { ACadVersion, BlockRecord, CadDocument, Circle, DwgWriter, Insert, Layer, Line, XYZ } from '@node-projects/acad-ts'
import { dwgToDxfText, dwgVersion } from './dwg'
import { importDxf } from './dxf'

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
