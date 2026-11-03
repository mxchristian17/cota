import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { importCadInWorker } from './dwg'
import type { DxfImportResult } from './dxf'

/**
 * Muestras estándar de ACadSharp (MIT, ver `__fixtures__/acadsharp`): el mismo dibujo base con unos 40 tipos de
 * entidad, guardado en distintas versiones de DWG y DXF. Validan el camino real de apertura (lector de DWG, DXF
 * binario e importador). Cada tipo tiene su cantidad: un avance o un retroceso cambia estos números.
 */
const read = (name: string, kind: 'dwg' | 'dxf') => {
  const b = readFileSync(new URL(`./__fixtures__/acadsharp/${name}`, import.meta.url))
  return importCadInWorker(kind, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
}

const byType = (r: DxfImportResult) => {
  const out: Record<string, number> = {}
  for (const e of r.entities) out[e.type] = (out[e.type] ?? 0) + 1
  return out
}

const DWG_2018 = { POINT: 7, LINE: 98, POLYLINE: 39, CIRCLE: 17, ARC: 1, ELLIPSE: 1, MESH3D: 4, RECTANGLE: 16, HATCH: 25, TEXT: 81, SPLINE: 2, DIMENSION: 11 }

describe('muestras estándar de DWG/DXF (ACadSharp)', () => {
  it('DWG 2018: todas las entidades que Cota entiende, con tablas, caras 3D, mallas y rellenos', async () => {
    const r = await read('sample_AC1032.dwg', 'dwg')
    expect(byType(r)).toEqual(DWG_2018)
    expect(r.unsupported).toEqual([])
    expect(r.simplified).toEqual({ WIPEOUT: 1, SHAPE: 1, IMAGE: 1, PDFUNDERLAY: 1 })
    expect(r.wireSolids).toBe(3)
    expect(r.layouts?.map((l) => l.name)).toEqual(['Layout1', 'Layout2', 'MyLayout'])
  })

  it('DXF binario 2018: lo mismo que el DWG (antes entraba vacío)', async () => {
    const [dwg, bin] = await Promise.all([read('sample_AC1032.dwg', 'dwg'), read('sample_AC1032_binary.dxf', 'dxf')])
    expect(byType(bin)).toEqual(byType(dwg))
    expect(bin.layers.map((l) => l.name).sort()).toEqual(dwg.layers.map((l) => l.name).sort())
  })

  it('DWG 2000: mismas entidades (sin las tablas, que no existían)', async () => {
    const r = await read('sample_AC1015.dwg', 'dwg')
    expect(byType(r)).toEqual({ POINT: 7, LINE: 67, POLYLINE: 39, CIRCLE: 14, ARC: 1, ELLIPSE: 1, MESH3D: 4, RECTANGLE: 16, HATCH: 24, TEXT: 61, SPLINE: 2, DIMENSION: 11 })
    expect(r.unsupported).toEqual([])
  })

  it('DXF R12: polilíneas viejas, caras 3D, cotas y bloques', async () => {
    const r = await read('sample_AC1009_ascii.dxf', 'dxf')
    const t = byType(r)
    expect(t.DIMENSION).toBe(11)
    expect(t.MESH3D).toBe(2)
    expect(t.POLYLINE).toBeGreaterThan(200)
    expect(r.unsupported).toEqual(['INSERT'])
  })
})
