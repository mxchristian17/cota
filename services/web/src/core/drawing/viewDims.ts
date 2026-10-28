import type { BlockDef, DimensionProps, Entity } from '../document/types'
import { entityBounds } from '../editing/bounds'

/** Tipos de cota cuya medida es una longitud (la que se lleva a la escala de la pieza). */
const LENGTH_DIMS = new Set(['LINEAR', 'ALIGNED', 'RADIUS', 'DIAMETER', 'ORDINATE', 'ARC', 'JOGGED', 'ROTATED'])

/**
 * Cota dibujada en una hoja sobre una vista de dibujo: mide la pieza, no el papel (como el CAD clásico con las cotas
 * asociadas a la vista). Si su primer punto cae en una vista de escala `k`, el factor de medida es 1/k.
 */
export function viewDimFactor(entities: Entity[], blocks: BlockDef[], p: DimensionProps): number | null {
  if (!LENGTH_DIMS.has(String(p.dimType).toUpperCase()) || !p.points.length) return null
  const [x, y] = p.points[0]
  for (const e of entities) {
    if (e.type !== 'INSERT' || !e.props.view) continue
    const k = e.props.scale[0]
    const block = blocks.find((b) => b.name === e.props.name)
    if (!block || !(k > 0)) continue
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const g of block.entities) {
      const b = entityBounds(g)
      ;[x0, y0, x1, y1] = [Math.min(x0, b.minX), Math.min(y0, b.minY), Math.max(x1, b.maxX), Math.max(y1, b.maxY)]
    }
    const [px, py] = e.props.position
    const tol = 1e-6 + 0.5 // medio milímetro de hoja alrededor de la vista
    if (x >= px + k * x0 - tol && x <= px + k * x1 + tol && y >= py + k * y0 - tol && y <= py + k * y1 + tol) return 1 / k
  }
  return null
}
