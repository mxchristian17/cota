import { beforeEach, describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import { resetSysvars } from '../sysvars'

/** Cada comando de edición confirma lo que hizo en la línea de comandos, como BOX, UNION o ARRAY (R04). */
describe('confirmaciones de FILLET, CHAMFER, FILLETEDGE, BREAK, EXPLODE y PEDIT (R04)', () => {
  let h: ReturnType<typeof makeEngine>
  beforeEach(() => {
    resetSysvars()
    h = makeEngine()
  })
  const corner = () => {
    h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    h.add('LINE', { start: [10, 0, 0], end: [10, 10, 0] })
  }

  it('FILLET y CHAMFER', async () => {
    corner()
    await h.run('FILLET', 'R', '2', '#5,0', '#10,5')
    expect(h.prints.at(-1)).toBe('Fillet created (radius 2.0000).')
    h.doc.entities.splice(0)
    corner()
    await h.run('CHAMFER', 'D', '1', '1.5', '#5,0', '#10,5')
    expect(h.prints.at(-1)).toBe('Chamfer created (Dist1 = 1.0000, Dist2 = 1.5000).')
  })

  it('FILLETEDGE al aceptar', async () => {
    h.add('SOLID3D', { op: 'BOX', origin: [0, 0, 0], width: 10, depth: 10, height: 10 })
    await h.run('FILLETEDGE', 'R', '2', '5,0,10', '', '')
    expect(h.prints.at(-1)).toBe('1 edge(s) filleted (Radius = 2.0000).')
  })

  it('BREAK y EXPLODE', async () => {
    h.add('LINE', { start: [0, 0, 0], end: [10, 0, 0] })
    await h.run('BREAK', '#2,0', '#4,0')
    expect(h.prints.at(-1)).toBe('The line was broken into 2 pieces.')
    h.add('POLYLINE', { vertices: [[0, 20, 0], [10, 20, 0], [10, 30, 0]], closed: false })
    await h.run('EXPLODE', '#5,20', '')
    expect(h.prints.at(-1)).toBe('1 object(s) exploded into 2 object(s).')
  })

  it('PEDIT: cada opción', async () => {
    h.add('POLYLINE', { vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 0]], closed: false })
    await h.run('PEDIT', '#5,0', 'W', '2')
    expect(h.prints.at(-1)).toBe('1 polyline set to width 2.0000.')
    await h.run('C')
    expect(h.prints.at(-1)).toBe('1 polyline closed.')
    await h.run('F')
    expect(h.prints.at(-1)).toBe('1 polyline fitted with arcs.')
    await h.run('D', '')
    expect(h.prints.at(-2)).toBe('1 polyline decurved.')
  })
})
