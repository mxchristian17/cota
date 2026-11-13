import { expandEntities, type ExpandOptions } from '../core/editing/block'
import type { BlockDef, Entity } from '../core/document/types'
import type { DxfEntitySpec, DxfImportResult } from '../core/io/dxf'

const asEntity = (s: DxfEntitySpec, i: number): Entity =>
  ({
    id: `e${i}`,
    type: s.type,
    layer: s.layerName,
    props: s.props,
    ...(s.color ? { color: s.color } : {}),
    ...(s.lineWeight !== undefined ? { lineWeight: s.lineWeight } : {}),
    ...(s.lineType ? { lineType: s.lineType } : {}),
  }) as Entity

/**
 * Lo que se ve de un DWG/DXF importado: las inserciones que pasaron a bloques de Cota, desarmadas como las dibuja Cota
 * (las capas por su nombre: la «0» es la que toma la de la inserción). Sirve para comprobar que la geometría queda en
 * el mismo lugar que cuando el importador desarmaba los bloques.
 */
export function importedView(r: DxfImportResult, opts: ExpandOptions = {}): DxfEntitySpec[] {
  const blocks: BlockDef[] = (r.blocks ?? []).map((b) => ({ name: b.name, entities: b.entities.map(asEntity) }))
  return expandEntities(r.entities.map(asEntity), blocks, opts).map((e) => ({
    type: e.type,
    layerName: e.layer,
    props: e.props,
    ...(e.color?.startsWith('#') ? { color: e.color } : {}),
    ...(e.lineWeight !== undefined && e.lineWeight >= 0 ? { lineWeight: e.lineWeight } : {}),
    ...(e.lineType ? { lineType: e.lineType } : {}),
  }))
}
