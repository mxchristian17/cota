import { describe, it, expect } from 'vitest'
import { entitiesInBox, entitiesInScreenBox, entityBounds, type Projector } from './bounds'
import type { BlockDef, CircleEntity, Entity, LineEntity } from '../document/types'
import { expandEntities } from './block'

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

  it('los bloques entran en la caja por su geometría (antes no tenían contorno y nunca se seleccionaban)', () => {
    const blocks: BlockDef[] = [{ name: 'B', entities: [line] }]
    const ins = { id: 'i1', type: 'INSERT', layer: '0', props: { name: 'B', position: [100, 0, 0], scale: [1, 1, 1], rotation: 0 } } as Entity
    const expand = (e: Entity): Entity[] => expandEntities([e], blocks)
    // Ventana: la línea del bloque va de x=100 a x=110.
    expect(entitiesInScreenBox([ins], { minX: 99, minY: -1, maxX: 111, maxY: 1 }, false, project, expand)).toEqual(['i1'])
    expect(entitiesInScreenBox([ins], { minX: 99, minY: -1, maxX: 105, maxY: 1 }, false, project, expand)).toEqual([])
    // Captura: alcanza con tocarla.
    expect(entitiesInScreenBox([ins], { minX: 104, minY: -1, maxX: 106, maxY: 1 }, true, project, expand)).toEqual(['i1'])
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

describe('entitiesInScreenBox con mallas (cada vértice se proyecta una vez)', () => {
  let seed = 3
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const mesh = (id: string, x: number, y: number): Entity => ({
    id,
    type: 'MESH3D',
    layer: '0',
    props: { vertices: Array.from({ length: 12 }, () => [x + rnd() * 6, y + rnd() * 6, rnd() * 4]), faces: Array.from({ length: 16 }, () => [0, 1, 2].map(() => Math.floor(rnd() * 12))) },
  })
  // Proyección con perspectiva simple (los puntos con z > 3.5 quedan "detrás" y no se ven).
  const project: Projector = (p) => (p.z > 3.5 ? null : [p.x * 10 + p.z, p.y * 10 - p.z * 2])
  const def: BlockDef = { name: 'M', entities: [mesh('a', 0, 0), mesh('b', 8, 1)] }
  const ents: Entity[] = [mesh('m1', 10, 10), mesh('m2', 30, 5), { id: 'i1', type: 'INSERT', layer: '0', props: { name: 'M', position: [20, 20, 0], scale: [1, 1, 1], rotation: 0.4 } }, line]
  const expand = (e: Entity) => expandEntities([e], [def])

  it('selecciona igual que proyectando el contorno arista por arista', () => {
    // Referencia: cada malla como sus aristas sueltas (líneas) dentro de una inserción falsa por objeto.
    const asLines = (e: Entity): Entity[] =>
      (e.type === 'INSERT' ? expand(e) : [e]).flatMap((x) => {
        if (x.type !== 'MESH3D') return [x]
        const seen = new Set<string>()
        const out: Entity[] = []
        for (const f of x.props.faces)
          for (let i = 0; i < f.length; i++) {
            const [a, b] = [f[i], f[(i + 1) % f.length]]
            const k = a < b ? `${a}_${b}` : `${b}_${a}`
            if (a === b || seen.has(k)) continue
            seen.add(k)
            out.push({ id: e.id, type: 'LINE', layer: '0', props: { start: x.props.vertices[a], end: x.props.vertices[b] } })
          }
        return out
      })
    const lineDefs: BlockDef[] = ents.map((e) => ({ name: `R${e.id}`, entities: asLines(e) }))
    const asRefs: Entity[] = ents.map((e) => ({ id: e.id, type: 'INSERT', layer: '0', props: { name: `R${e.id}`, position: [0, 0, 0], scale: [1, 1, 1], rotation: 0 } }))
    const expandRef = (e: Entity) => expandEntities([e], lineDefs)
    let picked = 0
    for (let k = 0; k < 300; k++) {
      const x0 = rnd() * 400 - 20
      const y0 = rnd() * 300 - 40
      const rect = { minX: x0, minY: y0, maxX: x0 + rnd() * 250, maxY: y0 + rnd() * 200 }
      for (const crossing of [false, true]) {
        const got = entitiesInScreenBox(ents, rect, crossing, project, expand)
        expect(got).toEqual(entitiesInScreenBox(asRefs, rect, crossing, project, expandRef))
        picked += got.length
      }
    }
    expect(picked).toBeGreaterThan(100)
  })
})
