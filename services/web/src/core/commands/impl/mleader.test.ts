import { describe, it, expect } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import { dimDisplay } from '../../dimension/dimGeometry'
import type { DimensionProps } from '../../document/types'
import { resolveFieldTexts } from '../../fields/context'

type H = ReturnType<typeof makeEngine>
const dims = (h: H) => h.ofType('DIMENSION').map((e) => e.props as DimensionProps)

describe('multileaders y líneas de centro', () => {
  it('criterio 10: MLEADER con texto de dos renglones y un campo', async () => {
    const h = makeEngine()
    await h.run('MLEADER', '#0,0', '#20,10', 'Ver detalle A', '%<\\AcVar Filename>%', '')
    const [m] = dims(h)
    expect(m.dimType).toBe('MLEADER')
    expect(m.textOverride).toBe('Ver detalle A\n%<\\AcVar Filename>%')
    const d = dimDisplay(m)
    expect(d.fills.length).toBe(1) // flecha
    // Campo evaluado en salida (PDF) como en los TEXT.
    const out = resolveFieldTexts(h.doc.entities, { fileName: 'plano.cota', meta: {}, layoutName: 'Model', sheetNumber: 1, sheetCount: 1, viewportScale: '' })
    const t = (out[0].props as DimensionProps).textOverride
    expect(t).toContain('plano.cota')
  })

  it('MLEADEREDIT agrega y quita líderes; MLEADERALIGN alinea los apoyos', async () => {
    const h = makeEngine()
    await h.run('MLEADER', '#0,0', '#20,10', 'A', '')
    await h.run('MLEADER', '#0,-20', '#25,-12', 'B', '')
    const [a, b] = h.ofType('DIMENSION')
    await h.run('MLEADEREDIT')
    await h.click(20, 10, a.id)
    await h.run('', '#5,5', '#8,0', '')
    expect((a.props as DimensionProps).leaderSizes).toEqual([1, 1, 1])
    await h.run('MLEADEREDIT')
    await h.click(20, 10, a.id)
    await h.run('R', '#5,5', '')
    expect((a.props as DimensionProps).leaderSizes).toEqual([1, 1])
    h.setSelection([b.id])
    await h.run('MLEADERALIGN')
    await h.click(20, 10, a.id)
    await h.run('#20,-50')
    expect((b.props as DimensionProps).textPos[0]).toBeCloseTo(20, 9)
  })

  it('QLEADER: puntos y texto → multileader con el último punto como apoyo', async () => {
    const h = makeEngine()
    await h.run('QLEADER', '#0,0', '#10,10', '#30,10', '', 'Nota', '')
    const [m] = dims(h)
    expect(m.points).toEqual([[0, 0, 0], [10, 10, 0]])
    expect(m.textPos).toEqual([30, 10, 0])
  })

  it('CENTERLINE entre dos líneas: trazo de centro entre los puntos medios, asociativa', async () => {
    const h = makeEngine()
    const a = h.add('LINE', { start: [0, 0, 0], end: [0, 40, 0] })
    const b = h.add('LINE', { start: [10, 40, 0], end: [10, 0, 0] }) // sentido opuesto
    await h.run('CENTERLINE')
    await h.click(0, 20, a.id)
    await h.click(10, 20, b.id)
    const [c] = dims(h)
    expect(c.dimType).toBe('CENTERLINE')
    const d = dimDisplay(c)
    expect(d.lines.length).toBeGreaterThan(3) // trazo largo-corto
    for (const [p, q] of d.lines) {
      expect(p[0]).toBeCloseTo(5, 9)
      expect(q[0]).toBeCloseTo(5, 9)
    }
    expect(c.assoc).toHaveLength(4)
  })
})
