import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import { solidViewHooks } from '../../../test/solidViews'
import type { DocumentModel } from '../../document/DocumentModel'
import type { HatchProps } from '../../document/types'
import { resetViewbaseMemory } from './viewbase'

describe('HATCH sobre vistas de dibujo (R16)', () => {
  it('un punto dentro del corte raya la sección (con el agujero como isla), no la hoja ni un trozo entre líneas ocultas', async () => {
    resetViewbaseMemory()
    let d: DocumentModel | null = null
    const h = makeEngine(solidViewHooks(() => d!))
    d = h.doc
    // Placa 80 × 30 × 100 con un agujero vertical y un tubo transversal más abajo; se corta a z = 50 (queda la parte de abajo).
    const plate = h.add('SOLID3D', { op: 'BOX', origin: [0, 0, 0], width: 80, depth: 30, height: 100 })
    const hole = h.add('SOLID3D', { op: 'CYLINDER', base: [40, 15, -1], radius: 8, height: 102 })
    const tube = h.add('SOLID3D', { op: 'CYLINDER', base: [-5, 15, 20], radius: 4, height: 90, axis: [1, 0, 0] })
    await h.run('SUBTRACT')
    await h.click(0, 0, plate.id)
    await h.run('')
    await h.click(0, 0, hole.id)
    await h.click(0, 0, tube.id)
    await h.run('')
    h.setSelection([h.ofType('SOLID3D')[0].id])
    await h.run('SLICE', 'XY', '0,0,50', '#10,10,10')
    // Vista superior 1:1 en (150, 150): la sección va de 110 a 190 en x y de 135 a 165 en y; el tubo queda oculto.
    await h.run('VIEWBASE', '', 'Layout1', 'O', 'Top', 'S', '1:1', '#150,150', '')
    await h.run('-HATCH', 'P', 'ANSI31', '0.5', '0', '#115,140', '')
    const hs = h.ofType('HATCH')
    expect(hs).toHaveLength(1)
    const loops = (hs[0].props as HatchProps).loops
    expect(loops).toHaveLength(2) // contorno + agujero
    const xs = loops[0].vertices.map((v) => v[0])
    const ys = loops[0].vertices.map((v) => v[1])
    expect(Math.min(...xs)).toBeCloseTo(110, 3)
    expect(Math.max(...xs)).toBeCloseTo(190, 3)
    expect(Math.min(...ys)).toBeCloseTo(135, 3)
    expect(Math.max(...ys)).toBeCloseTo(165, 3)
  })
})
