import type { SnapType } from './SnapService'

/** Tipos de object snap configurables (todos menos `grid` y el tracking, que tiene su propio toggle). */
export type OsnapKind = Exclude<SnapType, 'grid' | 'tracking'>

export type OsnapConfig = Record<OsnapKind, boolean>

/** Orden de presentación en el diálogo. */
export const OSNAP_KINDS: OsnapKind[] = [
  'endpoint',
  'midpoint',
  'center',
  'geometricCenter',
  'quadrant',
  'intersection',
  'apparentIntersection',
  'perpendicular',
  'tangent',
  'nearest',
  'node',
]

export const OSNAP_LABELS: Record<OsnapKind, string> = {
  endpoint: 'Endpoint',
  midpoint: 'Midpoint',
  center: 'Center',
  geometricCenter: 'Geometric center',
  quadrant: 'Quadrant',
  intersection: 'Intersection',
  apparentIntersection: 'Apparent intersection',
  perpendicular: 'Perpendicular',
  tangent: 'Tangent',
  nearest: 'Nearest',
  node: 'Node',
}

/** Defaults estilo CAD clásico: los más usados activos; GCEN/perp/tangent/nearest/node bajo demanda. */
export const DEFAULT_OSNAP: OsnapConfig = {
  endpoint: true,
  midpoint: true,
  center: true,
  geometricCenter: false,
  quadrant: true,
  intersection: true,
  apparentIntersection: false,
  perpendicular: false,
  tangent: false,
  nearest: false,
  node: false,
}

/** Config con un único snap activo (para overrides de un solo uso, estilo CAD clásico). */
export function singleOsnap(kind: OsnapKind): OsnapConfig {
  const out = {} as OsnapConfig
  for (const k of OSNAP_KINDS) out[k] = k === kind
  return out
}

/** Alias tecleables en el prompt para forzar un snap puntual (una sola captura). */
const OVERRIDE_ALIASES: Record<string, OsnapKind> = {
  end: 'endpoint',
  endp: 'endpoint',
  endpoint: 'endpoint',
  mid: 'midpoint',
  midp: 'midpoint',
  midpoint: 'midpoint',
  cen: 'center',
  center: 'center',
  gce: 'geometricCenter',
  gcen: 'geometricCenter',
  nod: 'node',
  node: 'node',
  qua: 'quadrant',
  quad: 'quadrant',
  quadrant: 'quadrant',
  int: 'intersection',
  inte: 'intersection',
  intersection: 'intersection',
  app: 'apparentIntersection',
  appint: 'apparentIntersection',
  apparent: 'apparentIntersection',
  per: 'perpendicular',
  perp: 'perpendicular',
  perpendicular: 'perpendicular',
  tan: 'tangent',
  tangent: 'tangent',
  nea: 'nearest',
  near: 'nearest',
  nearest: 'nearest',
}

/** Resuelve un texto (p. ej. "cen", "end") a un override de snap, o null. */
export function matchOsnapOverride(text: string): OsnapKind | null {
  return OVERRIDE_ALIASES[text.trim().toLowerCase()] ?? null
}

/** Normaliza un objeto arbitrario (config persistida) a un `OsnapConfig` válido. */
export function normalizeOsnap(raw: unknown): OsnapConfig {
  const r = (raw ?? {}) as Partial<Record<OsnapKind, unknown>>
  const out = {} as OsnapConfig
  for (const k of OSNAP_KINDS) {
    out[k] = typeof r[k] === 'boolean' ? (r[k] as boolean) : DEFAULT_OSNAP[k]
  }
  return out
}
