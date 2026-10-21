import { describe, it, expect } from 'vitest'
import { expandEntities, transformEntity } from './block'
import type { BlockDef, Entity, InsertProps } from '../document/types'

const lineDef = (): Entity => ({ id: 'a', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [10, 0, 0] } })
const ins = (over: Partial<InsertProps> = {}): InsertProps => ({ name: 'L', position: [0, 0, 0], scale: [1, 1, 1], rotation: 0, ...over })

describe('block transform / expand', () => {
  it('escala + traslada una línea (escala uniforme)', () => {
    const out = transformEntity(lineDef(), ins({ position: [5, 5, 0], scale: [2, 2, 2] }))
    expect(out.type).toBe('LINE')
    const p = out.props as { start: number[]; end: number[] }
    expect(p.start).toEqual([5, 5, 0])
    expect(p.end).toEqual([25, 5, 0])
  })

  it('rota 90° alrededor de Z', () => {
    const out = transformEntity(lineDef(), ins({ position: [5, 5, 0], scale: [2, 2, 2], rotation: Math.PI / 2 }))
    const p = out.props as { start: number[]; end: number[] }
    expect(p.start[0]).toBeCloseTo(5, 6)
    expect(p.start[1]).toBeCloseTo(5, 6)
    expect(p.end[0]).toBeCloseTo(5, 6)
    expect(p.end[1]).toBeCloseTo(25, 6)
  })

  it('un rectángulo rotado pasa a POLILÍNEA cerrada', () => {
    const rect: Entity = { id: 'r', type: 'RECTANGLE', layer: '0', props: { corner: [0, 0, 0], width: 4, height: 2 } }
    const out = transformEntity(rect, ins({ rotation: Math.PI / 2 }))
    expect(out.type).toBe('POLYLINE')
    expect((out.props as { closed: boolean }).closed).toBe(true)
  })

  it('expandEntities reemplaza el INSERT por la geometría de mundo, con id de la inserción', () => {
    const blocks: BlockDef[] = [{ name: 'L', entities: [lineDef()] }]
    const entities: Entity[] = [{ id: 'ins1', type: 'INSERT', layer: '0', props: ins({ position: [0, 100, 0] }) }]
    const out = expandEntities(entities, blocks)
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('LINE')
    expect(out[0].id).toBe('ins1') // hereda el id de la inserción (pick/selección como un solo objeto)
    expect((out[0].props as { start: number[] }).start).toEqual([0, 100, 0])
  })

  it('expande bloques anidados (INSERT dentro de un bloque)', () => {
    const blocks: BlockDef[] = [
      { name: 'L', entities: [lineDef()] },
      { name: 'A', entities: [{ id: 'na', type: 'INSERT', layer: '0', props: ins({ name: 'L', position: [1, 0, 0] }) }] },
    ]
    const entities: Entity[] = [{ id: 'top', type: 'INSERT', layer: '0', props: ins({ name: 'A', position: [0, 10, 0] }) }]
    const out = expandEntities(entities, blocks)
    expect(out).toHaveLength(1)
    const p = out[0].props as { start: number[]; end: number[] }
    expect(p.start).toEqual([1, 10, 0]) // L(+1 en x) dentro de A(+10 en y)
    expect(p.end).toEqual([11, 10, 0])
  })

  it('sin inserciones devuelve la misma lista (fast path)', () => {
    const entities = [lineDef()]
    expect(expandEntities(entities, [])).toBe(entities)
  })

  it('inserción a un bloque inexistente se ignora', () => {
    const entities: Entity[] = [{ id: 'x', type: 'INSERT', layer: '0', props: ins({ name: 'ghost' }) }]
    expect(expandEntities(entities, [{ name: 'L', entities: [lineDef()] }])).toEqual([])
  })
})

describe('capas en bloques', () => {
  const def: BlockDef = {
    name: 'B',
    base: [0, 0, 0],
    entities: [
      { id: 'c1', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [1, 0, 0] } },
      { id: 'c2', type: 'LINE', layer: 'X', props: { start: [0, 1, 0], end: [1, 1, 0] } },
    ],
  } as unknown as BlockDef
  const ins = (layer: string): Entity => ({ id: 'i', type: 'INSERT', layer, props: { name: 'B', position: [0, 0, 0], scale: [1, 1, 1], rotation: 0 } as unknown as InsertProps })

  it('lo de la capa 0 toma la capa de la inserción; el resto conserva la suya', () => {
    expect(expandEntities([ins('A')], [def]).map((e) => e.layer)).toEqual(['A', 'X'])
    // EXPLODE: cada objeto vuelve a su capa.
    expect(expandEntities([ins('A')], [def], { keepLayers: true }).map((e) => e.layer)).toEqual(['0', 'X'])
  })

  it('congelar la capa de la inserción oculta todo el bloque; congelar X sólo lo suyo', () => {
    expect(expandEntities([ins('A')], [def], { skipLayers: new Set(['A']) })).toEqual([])
    expect(expandEntities([ins('A')], [def], { skipLayers: new Set(['X']) }).map((e) => e.layer)).toEqual(['A'])
  })
})
