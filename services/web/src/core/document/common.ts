import type { EntityCommon } from './types'
import { BYLAYER } from '../linetype/linetypes'

/**
 * Propiedades comunes explícitas de un objeto, para las copias y las piezas que salen de él
 * (COPY, ARRAY, MIRROR, TRIM, BREAK, OFFSET…): así no toman `CELTYPE`/`CELTSCALE` como un objeto nuevo.
 */
export function commonOf(e: EntityCommon): Required<Pick<EntityCommon, 'lineType' | 'ltScale' | 'color' | 'lineWeight'>> {
  return { lineType: e.lineType ?? BYLAYER, ltScale: e.ltScale ?? 1, color: e.color ?? BYLAYER, lineWeight: e.lineWeight ?? -1 }
}

/** Copia las propiedades comunes que el objeto tiene definidas (sin volverlas explícitas). */
export function keepCommon<T extends object>(out: T, e: EntityCommon): T & EntityCommon {
  const r = out as T & EntityCommon
  if (e.lineType !== undefined) r.lineType = e.lineType
  if (e.ltScale !== undefined) r.ltScale = e.ltScale
  if (e.color !== undefined) r.color = e.color
  if (e.lineWeight !== undefined) r.lineWeight = e.lineWeight
  return r
}
