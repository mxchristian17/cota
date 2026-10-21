import type { DocumentModel } from '../document/DocumentModel'
import type { Entity, ViewportEntity } from '../document/types'
import { formatScale } from '../layout/scale'
import { evaluateFields, hasFields, type FieldContext } from './fields'

/** Contexto de campos para un espacio del dibujo (`MODEL` o id de layout). */
export function fieldContextFor(doc: DocumentModel, fileName: string, tab: string): FieldContext {
  const i = doc.layouts.findIndex((l) => l.id === tab)
  const layout = i >= 0 ? doc.layouts[i] : undefined
  const vp = layout?.entities.find((e): e is ViewportEntity => e.type === 'VIEWPORT')
  return {
    fileName,
    meta: doc.meta,
    layoutName: layout?.name ?? 'Model',
    sheetNumber: i + 1,
    sheetCount: doc.layouts.length,
    viewportScale: vp ? formatScale(vp.props.scale) : '',
  }
}

/** Copia de las entidades con los campos de sus textos ya evaluados (para PLOT/exportar). */
export function resolveFieldTexts(entities: Entity[], ctx: FieldContext): Entity[] {
  const dimField = (e: Entity): boolean => e.type === 'DIMENSION' && !!e.props.textOverride && hasFields(e.props.textOverride)
  if (!entities.some((e) => (e.type === 'TEXT' && hasFields(e.props.text)) || dimField(e))) return entities
  return entities.map((e) => {
    if (e.type === 'TEXT' && hasFields(e.props.text)) return { ...e, props: { ...e.props, text: evaluateFields(e.props.text, ctx) } }
    // Multileaders y cotas con texto manual también admiten campos.
    if (e.type === 'DIMENSION' && dimField(e)) return { ...e, props: { ...e.props, textOverride: evaluateFields(e.props.textOverride as string, ctx) } }
    return e
  })
}
