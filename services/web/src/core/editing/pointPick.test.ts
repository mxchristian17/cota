import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../test/engineHarness'
import type { Entity, SolidProps } from '../document/types'
import type { Vec3 } from '../math'

/**
 * Chasis de perfiles 20×20 (como el de una impresora 3D): base, cuatro parantes y marco superior. Los largueros de
 * arriba son más cortos que los de la base (van entre las esquinas), así que en planta su caja es más chica.
 */
function chassis(h: ReturnType<typeof makeEngine>) {
  const box = (origin: Vec3, width: number, depth: number, height: number): Entity => h.add('SOLID3D', { op: 'BOX', origin, width, depth, height } satisfies SolidProps)
  return {
    baseLeft: box([0, 0, 0], 20, 440, 20), // X 0–20, Y 0–440, Z 0–20
    baseRight: box([400, 0, 0], 20, 440, 20),
    baseFront: box([20, 0, 0], 380, 20, 20),
    baseBack: box([20, 420, 0], 380, 20, 20),
    posts: [box([0, 0, 20], 20, 20, 420), box([400, 0, 20], 20, 20, 420), box([0, 420, 20], 20, 20, 420), box([400, 420, 20], 20, 20, 420)],
    topLeft: box([0, 20, 440], 20, 400, 20), // X 0–20, Y 20–420, Z 440–460
    topRight: box([400, 20, 440], 20, 400, 20),
    topFront: box([0, 0, 440], 420, 20, 20),
    topBack: box([0, 420, 440], 420, 20, 20),
  }
}

const listed = (h: ReturnType<typeof makeEngine>): string[] => h.prints.flatMap((l) => /Handle = (\S+)/.exec(l)?.[1] ?? [])

describe('Punto tecleado en "Select objects" con sólidos en 3D', () => {
  it('LIST 3,100,20 elige el perfil de la base (en ese punto), no el travesaño de arriba que lo tapa en planta', async () => {
    const h = makeEngine()
    const c = chassis(h)
    await h.run('LIST', '3,100,20', '')
    expect(listed(h)).toEqual([c.baseLeft.id])
  })

  it('COPY con un punto en la cara superior del perfil base copia ese perfil', async () => {
    const h = makeEngine()
    const c = chassis(h)
    const n = h.ofType('SOLID3D').length
    await h.run('COPY', '3,100,20', '', '0,0,0', '100,0,0', '')
    const solids = h.ofType('SOLID3D')
    expect(solids).toHaveLength(n + 1)
    const copy = solids.at(-1)!.props as { op: string; origin: Vec3 }
    expect(copy.op).toBe('BOX')
    expect(copy.origin).toEqual([100, 0, 0])
    expect((c.baseLeft.props as { origin: Vec3 }).origin).toEqual([0, 0, 0])
  })

  it('el punto elige el cuerpo que está en él: arriba el travesaño, adentro del volumen el perfil, en el aire nada', async () => {
    const h = makeEngine()
    const c = chassis(h)
    await h.run('LIST', '3,100,460', '')
    await h.run('LIST', '10,100,10', '')
    await h.run('LIST', '10,10,200', '')
    expect(listed(h)).toEqual([c.topLeft.id, c.baseLeft.id, c.posts[0].id])
    h.prints.length = 0
    await h.run('LIST', '10,100,200', '')
    expect(listed(h)).toEqual([])
    expect(h.prints.join('\n')).toContain('0 found')
  })

  it('un cilindro se elige con un punto de su superficie real (aunque la malla sea facetada)', async () => {
    const h = makeEngine()
    const r = 10
    const a = Math.PI / 48 // a mitad de una faceta: el punto más lejos de la malla
    const cyl = h.add('SOLID3D', { op: 'CYLINDER', base: [0, 0, 0], radius: r, height: 30, segments: 48 } satisfies SolidProps)
    h.add('SOLID3D', { op: 'BOX', origin: [-20, -20, 40], width: 40, depth: 40, height: 5 } satisfies SolidProps)
    await h.run('LIST', `${r * Math.cos(a)},${r * Math.sin(a)},15`, '')
    expect(listed(h)).toEqual([cyl.id])
  })

  it('una malla (MESH3D) se elige por un punto de una de sus caras, no por su caja en planta', async () => {
    const h = makeEngine()
    const low = h.add('MESH3D', { vertices: [[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]], faces: [[0, 1, 2, 3]] })
    const high = h.add('MESH3D', { vertices: [[10, 10, 50], [90, 10, 50], [90, 90, 50], [10, 90, 50]], faces: [[0, 1, 2, 3]] })
    await h.run('LIST', '50,50,0', '')
    await h.run('LIST', '50,50,50', '')
    expect(listed(h)).toEqual([low.id, high.id])
  })

  it('el clic sigue eligiendo el objeto clickeado', async () => {
    const h = makeEngine()
    const c = chassis(h)
    await h.run('LIST')
    await h.click(3, 100, c.topLeft.id)
    await h.run('')
    expect(listed(h)).toEqual([c.topLeft.id])
  })
})
