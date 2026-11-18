import type { DocumentModel } from '../document/DocumentModel'
import type { Entity, ViewportEntity } from '../document/types'
import { formatScale } from '../layout/scale'
import { evaluateFields, hasFields, type FieldContext } from './fields'
import { fitToWidth } from '../geom/text'
import { isDrawingView } from '../drawing/views'

/** Contexto de campos para un espacio del dibujo (`MODEL` o id de layout). */
export function fieldContextFor(doc: DocumentModel, fileName: string, tab: string): FieldContext {
  const i = doc.layouts.findIndex((l) => l.id === tab)
  const layout = i >= 0 ? doc.layouts[i] : undefined
  const vp = layout?.entities.find((e): e is ViewportEntity => e.type === 'VIEWPORT')
  // Sin viewport, la escala de la hoja es la de su primera vista base de dibujo (VIEWBASE), como el CAD clásico
  // toma la de su primera ventana (B07).
  const view = vp ? undefined : (layout?.entities.find((e) => isDrawingView(e) && !e.props.view.parent) ?? layout?.entities.find(isDrawingView))
  return {
    fileName,
    meta: doc.meta,
    layoutName: layout?.name ?? 'Model',
    sheetNumber: i + 1,
    sheetCount: doc.layouts.length,
    viewportScale: vp ? formatScale(vp.props.scale) : view?.type === 'INSERT' ? formatScale(view.props.scale[0]) : '',
  }
}

/** Copia de las entidades con los campos de sus textos ya evaluados (para PLOT/exportar). */
export function resolveFieldTexts(entities: Entity[], ctx: FieldContext): Entity[] {
  const dimField = (e: Entity): boolean => e.type === 'DIMENSION' && !!e.props.textOverride && hasFields(e.props.textOverride)
  if (!entities.some((e) => (e.type === 'TEXT' && (hasFields(e.props.text) || e.props.fitWidth)) || dimField(e))) return entities
  return entities.map((e) => {
    // Los textos con celda (rótulo) se encajan con su valor ya evaluado, igual que en pantalla.
    if (e.type === 'TEXT' && (hasFields(e.props.text) || e.props.fitWidth)) return { ...e, props: fitToWidth({ ...e.props, text: evaluateFields(e.props.text, ctx) }) }
    // Multileaders y cotas con texto manual también admiten campos.
    if (e.type === 'DIMENSION' && dimField(e)) return { ...e, props: { ...e.props, textOverride: evaluateFields(e.props.textOverride as string, ctx) } }
    return e
  })
}
