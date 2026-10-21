import { describe, it, expect } from 'vitest'
import { entitiesInBox, entitiesInScreenBox, entityBounds, type Projector } from './bounds'
import type { CircleEntity, LineEntity } from '../document/types'

const line: LineEntity = { id: 'l1', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [10, 0, 0] } }
const circle: CircleEntity = {
  id: 'c1',
  type: 'CIRCLE',
  layer: '0',
  props: { center: [50, 50, 0], radius: 5, normal: [0, 0, 1] },
}

describe('entityBounds', () => {
  it('caja de una línea', () => {
    expect(entityBounds(line)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 0 })
  })
  it('caja de un círculo', () => {
    expect(entityBounds(circle)).toEqual({ minX: 45, minY: 45, maxX: 55, maxY: 55 })
  })
})

describe('entitiesInBox', () => {
  const ents = [line, circle]

  it('ventana (window) selecciona sólo lo contenido', () => {
    const ids = entitiesInBox(ents, { minX: -5, minY: -5, maxX: 20, maxY: 20 }, false)
    expect(ids).toEqual(['l1'])
  })

  it('cruce (crossing) selecciona lo que toca', () => {
    const ids = entitiesInBox(ents, { minX: 5, minY: -5, maxX: 8, maxY: 5 }, true)
    expect(ids).toContain('l1') // la caja cruza la línea
  })

  it('ventana grande selecciona todo', () => {
    const ids = entitiesInBox(ents, { minX: -100, minY: -100, maxX: 100, maxY: 100 }, false)
    expect(ids.sort()).toEqual(['c1', 'l1'])
  })
})

describe('entitiesInScreenBox', () => {
  const ents = [line, circle]
  // Proyección con "profundidad": ignora Z, así funciona igual que en una vista TOP.
  const project: Projector = (p) => [p.x, p.y]

  it('window (contenido) NO selecciona una entidad parcialmente fuera del rectángulo', () => {
    const ids = entitiesInScreenBox(ents, { minX: -1, minY: -1, maxX: 5, maxY: 5 }, false, project)
    expect(ids).toEqual([]) // la línea llega hasta x=10, se sale del rectángulo
  })

  it('window selecciona la entidad totalmente contenida', () => {
    const ids = entitiesInScreenBox(ents, { minX: -1, minY: -1, maxX: 11, maxY: 5 }, false, project)
    expect(ids).toEqual(['l1'])
  })

  it('crossing (toca) selecciona una entidad que sólo cruza un borde', () => {
    const ids = entitiesInScreenBox(ents, { minX: 5, minY: -2, maxX: 8, maxY: 2 }, true, project)
    expect(ids).toContain('l1') // el rectángulo cruza la línea horizontal
  })

  it('crossing selecciona el círculo si el rectángulo toca su contorno', () => {
    const ids = entitiesInScreenBox(ents, { minX: 48, minY: 44, maxX: 52, maxY: 46 }, true, project)
    expect(ids).toContain('c1')
  })

  it('ignora entidades no visibles en pantalla (proyección null)', () => {
    const ids = entitiesInScreenBox(ents, { minX: -100, minY: -100, maxX: 100, maxY: 100 }, false, () => null)
    expect(ids).toEqual([])
  })
})
