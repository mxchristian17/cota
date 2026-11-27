import type { Entity, SolidProps } from '../core/document/types'
import { brepBytes, brepFormat } from '../core/document/brepStore'
import { sysvars } from '../core/commands/sysvars'
import { acisRecords, kindOf } from '../core/io/acis'
import { sabWithTransform, satWithTransform } from '../core/io/acisWrite'
import { kernelAvailable, requestAcis } from './occtKernel'

/** Modelo ACIS de un sólido para el archivo: 3DSOLID, REGION o BODY. */
export interface AcisOut {
  kind: 'solid' | 'region' | 'body'
  /** SAB (DWG) o SAT (DXF). */
  data: Uint8Array | string
}

/**
 * Qué escribe un modelo ACIS leído de un archivo: un sólido, una región (caras planas de dos lados en un mismo plano) u
 * otra lámina (BODY).
 */
export function acisKind(data: Uint8Array | string): AcisOut['kind'] {
  const recs = acisRecords(data)
  const faces = recs.filter((r) => kindOf(r) === 'face')
  // Una cara de dos lados (lámina): `double` en SAT, verdadero en SAB (el segundo lógico del registro).
  const double = faces.some((f) => {
    const logic = f.items.filter((x) => x === 'double' || x === 'single' || x === 'T' || x === 'F' || x === 'forward' || x === 'reversed')
    return logic[1] === 'double' || logic[1] === 'T'
  })
  if (!double) return 'solid'
  const surfaces = recs.filter((r) => r.type.endsWith('-surface'))
  return surfaces.length && surfaces.every((s) => s.type === 'plane-surface') ? 'region' : 'body'
}

/**
 * El modelo original de una pieza importada para un archivo de este formato: el mismo (con su matriz, si se movió) si
 * ya está en ese formato; null si hay que pasarlo por el núcleo.
 */
export function originalAcis(p: SolidProps, format: 'sab' | 'sat'): AcisOut | null {
  if (p.op !== 'BREP' || brepFormat(p.ref) !== format) return null
  const bytes = brepBytes(p.ref)
  if (!bytes) return null
  const own: Uint8Array | string = format === 'sab' ? bytes : new TextDecoder('latin1').decode(bytes)
  const data = !p.m ? own : typeof own === 'string' ? satWithTransform(own, p.m) : sabWithTransform(own, p.m)
  if (!data) return null
  try {
    return { kind: acisKind(data), data }
  } catch {
    return null
  }
}

/**
 * Sólidos de un dibujo como modelos ACIS para un DWG (SAB) o un DXF (SAT): las piezas importadas sin cambios, con su
 * modelo original; los demás (editados o de Cota), con el núcleo exacto. Los que no se pueden escribir así quedan fuera
 * del mapa (salen como sus caras). `SOLIDEXPORT` 0: ninguno (todos como caras, como antes).
 */
export async function solidsAsAcis(entities: Entity[], format: 'sab' | 'sat', onProgress?: (done: number, total: number) => void): Promise<Map<Entity, AcisOut>> {
  const out = new Map<Entity, AcisOut>()
  if (sysvars.SOLIDEXPORT !== 1) return out
  const solids = entities.filter((e): e is Entity & { type: 'SOLID3D' } => e.type === 'SOLID3D')
  const viaKernel: Array<Entity & { type: 'SOLID3D' }> = []
  for (const e of solids) {
    const own = originalAcis(e.props as SolidProps, format)
    if (own) out.set(e, own)
    else viaKernel.push(e)
  }
  const total = solids.length
  let done = out.size
  onProgress?.(done, total)
  if (!viaKernel.length || sysvars.SOLIDKERNEL !== 'OCCT' || !kernelAvailable()) return out
  await Promise.all(
    viaKernel.map(async (e) => {
      const p = e.props as SolidProps
      const r = await requestAcis(JSON.stringify(p), p, format)
      if (r.ok) out.set(e, { kind: r.kind, data: r.data })
      onProgress?.(++done, total)
    }),
  )
  return out
}
