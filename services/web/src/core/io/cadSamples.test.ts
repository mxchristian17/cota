import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { importCadInWorker } from './dwg'
import type { DxfImportResult } from './dxf'

/**
 * Muestras estándar de ACadSharp (MIT, ver `__fixtures__/acadsharp`): el mismo dibujo base con unos 40 tipos de
 * entidad, guardado en distintas versiones de DWG y DXF. Validan el camino real de apertura (lector de DWG, DXF
 * binario e importador). Lo que todavía no se importa queda listado: un avance o un retroceso cambia la lista.
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

/** Pendientes: XLINE/RAY (no hay entidad infinita), MLINE, MULTILEADER, TOLERANCE, imágenes, PDF, WIPEOUT, SHAPE, los
 *  sólidos ACIS sin aristas guardadas y el espacio papel (VIEWPORT). */
const GAPS = ['3DSOLID', 'IMAGE', 'MLINE', 'MULTILEADER', 'PDFUNDERLAY', 'RAY', 'REGION', 'SHAPE', 'TOLERANCE', 'VIEWPORT', 'WIPEOUT', 'XLINE']

describe('muestras estándar de DWG/DXF (ACadSharp)', () => {
  it('DWG 2018: todas las entidades que Cota entiende, con tablas, caras 3D, mallas y rellenos', async () => {
    const r = await read('sample_AC1032.dwg', 'dwg')
    expect(byType(r)).toEqual({ POINT: 6, LINE: 59, POLYLINE: 9, CIRCLE: 15, ARC: 1, ELLIPSE: 1, MESH3D: 4, RECTANGLE: 16, HATCH: 10, TEXT: 58, SPLINE: 2, DIMENSION: 11 })
    expect([...r.unsupported].sort()).toEqual(GAPS)
  })

  it('DXF binario 2018: lo mismo que el DWG (antes entraba vacío)', async () => {
    const [dwg, bin] = await Promise.all([read('sample_AC1032.dwg', 'dwg'), read('sample_AC1032_binary.dxf', 'dxf')])
    expect(byType(bin)).toEqual(byType(dwg))
    expect(bin.layers.map((l) => l.name).sort()).toEqual(dwg.layers.map((l) => l.name).sort())
  })

  it('DWG 2000: mismas entidades (sin las tablas, que no existían)', async () => {
    const r = await read('sample_AC1015.dwg', 'dwg')
    expect(byType(r)).toEqual({ POINT: 6, LINE: 28, POLYLINE: 9, CIRCLE: 12, ARC: 1, ELLIPSE: 1, MESH3D: 4, RECTANGLE: 16, HATCH: 9, TEXT: 38, SPLINE: 2, DIMENSION: 11 })
    expect([...r.unsupported].sort()).toEqual(GAPS)
  })

  it('DXF R12: polilíneas viejas, caras 3D, cotas y bloques', async () => {
    const r = await read('sample_AC1009_ascii.dxf', 'dxf')
    const t = byType(r)
    expect(t.DIMENSION).toBe(11)
    expect(t.MESH3D).toBe(2)
    expect(t.POLYLINE).toBeGreaterThan(200)
    expect([...r.unsupported].sort()).toEqual(['INSERT', 'SHAPE', 'VIEWPORT'])
  })
})
