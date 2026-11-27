import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DwgReader, DxfReader, ModelerGeometry } from '@node-projects/acad-ts'

/**
 * Modelos ACIS de los sólidos y regiones de un archivo de ejemplo de `core/io/__fixtures__/acadsharp` (públicos, de
 * ACadSharp): SAT en R2000 (`sample_AC1015.dwg`), SAB en 2018 (`sample_AC1032.dwg`, `sample_AC1032_binary.dxf`). Cada
 * uno trae dos 3DSOLID y una REGION.
 */
export function acisSamples(name: string): Array<{ type: string; data: Uint8Array }> {
  const b = readFileSync(fileURLToPath(new URL(`../core/io/__fixtures__/acadsharp/${name}`, import.meta.url)))
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
  const doc = name.endsWith('.dwg') ? DwgReader.readFromStream(ab, null) : DxfReader.readFromStream(new Uint8Array(ab))
  const out: Array<{ type: string; data: Uint8Array }> = []
  for (const br of doc.blockRecords ?? [])
    for (const e of br.entities) if (e instanceof ModelerGeometry && e.acisData?.length) out.push({ type: e.constructor.name, data: e.acisData as unknown as Uint8Array })
  return out
}
