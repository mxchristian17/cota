import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import type { HatchProps, PolylineProps } from '../../document/types'
import { orthoUcs } from '../../ucs'
import { sysvars, resetSysvars } from '../sysvars'

const rect = async (h: ReturnType<typeof makeEngine>, x0: number, y0: number, x1: number, y1: number) => {
  await h.run('LINE', `${x0},${y0}`, `#${x1},${y0}`, `#${x1},${y1}`, `#${x0},${y1}`, 'C')
}

describe('HATCH', () => {
  it('un punto interno crea un sombreado asociativo con el patrón de HPNAME; otro punto lo agrega al mismo', async () => {
    const h = makeEngine()
    await rect(h, 0, 0, 100, 50)
    await rect(h, 200, 0, 300, 50)
    await h.run('HATCH')
    await h.click(10, 10)
    await h.click(250, 25)
    await h.run('')
    const hs = h.ofType('HATCH')
    expect(hs.length).toBe(1)
    const p = hs[0].props as HatchProps
    expect(p.pattern).toBe('ANSI31')
    expect(p.loops.length).toBe(2)
    expect(p.assoc?.ids.length).toBe(2) // LINE ▸ Close deja una polilínea cerrada por rectángulo
    expect(p.assoc?.seeds?.length).toBe(2)
  })

  it('fuera de un área cerrada: "Valid hatch boundary not found."; Undo quita el último', async () => {
    const h = makeEngine()
    await rect(h, 0, 0, 100, 50)
    await h.run('HATCH')
    await h.click(500, 500)
    expect(h.prints).toContain('Valid hatch boundary not found.')
    await h.click(10, 10)
    await h.run('U')
    await h.run('')
    expect(h.ofType('HATCH').length).toBe(0)
  })

  it('-HATCH Properties (SOLID / patrón con escala y ángulo) y Esc descarta', async () => {
    const h = makeEngine()
    await rect(h, 0, 0, 100, 50)
    await h.run('-HATCH', 'P', 'ANSI37', '2', '30')
    await h.click(10, 10)
    await h.run('')
    const p = h.ofType('HATCH')[0].props as HatchProps
    expect(p.pattern).toBe('ANSI37')
    expect(p.scale).toBe(2)
    expect(p.angle).toBeCloseTo(Math.PI / 6, 9)
    expect(h.doc.vars.HPNAME).toBe('ANSI37')
    await h.run('-HATCH')
    await h.click(10, 10)
    h.engine.cancel()
    await h.run()
    expect(h.ofType('HATCH').length).toBe(1)
  })

  it('en la UCS Front: el sombreado queda en el plano XZ', async () => {
    const h = makeEngine()
    h.setUcs(orthoUcs('FRONT'))
    await h.run('RECTANGLE', '0,0', '@40,20')
    await h.run('HATCH')
    await h.click3(10, 0, 10)
    await h.run('')
    const p = h.ofType('HATCH')[0].props as HatchProps
    expect(Math.abs(p.normal?.[1] ?? 0)).toBeCloseTo(1, 9)
    for (const l of p.loops) for (const v of l.vertices) expect(v[1]).toBeCloseTo(0, 9)
  })

  it('HATCHEDIT: Style, Properties y Disassociate; recreate Boundary crea la polilínea', async () => {
    const h = makeEngine()
    await rect(h, 0, 0, 100, 100)
    await h.run('CIRCLE', '50,50', '20')
    await h.run('HATCH')
    await h.click(5, 5)
    await h.run('')
    const id = h.ofType('HATCH')[0].id
    h.setSelection([id])
    await h.run('-HATCHEDIT', 'S', 'I')
    expect((h.ofType('HATCH')[0].props as HatchProps).loops.length).toBe(1)
    await h.run('P', 'S', 'D')
    const p = h.ofType('HATCH')[0].props as HatchProps
    expect(p.pattern).toBe('SOLID')
    expect(p.assoc).toBeUndefined()
    await h.run('B', 'P', 'N', '')
    expect(h.ofType('POLYLINE').length).toBe(2) // el rectángulo y el contorno recreado
  })

  it('EXPLODE de un sombreado de patrón: líneas', async () => {
    const h = makeEngine()
    await rect(h, 0, 0, 20, 20)
    await h.run('-HATCH', 'P', 'LINE', '1', '0')
    await h.click(5, 5)
    await h.run('')
    const id = h.ofType('HATCH')[0].id
    const before = h.ofType('LINE').length
    h.setSelection([id])
    await h.run('EXPLODE')
    expect(h.ofType('HATCH').length).toBe(0)
    expect(h.ofType('LINE').length).toBeGreaterThan(before + 3)
  })
})

describe('PEDIT', () => {
  it('una línea se convierte y Join le agrega las que tocan sus extremos: queda cerrada', async () => {
    resetSysvars()
    const h = makeEngine()
    await h.run('LINE', '0,0', '#10,0', '')
    await h.run('LINE', '10,0', '#10,5', '')
    await h.run('LINE', '10,5', '#0,5', '')
    await h.run('LINE', '0,5', '#0,0', '')
    const [a, ...rest] = h.ofType('LINE')
    await h.run('PEDIT')
    await h.click(5, 0, a.id)
    await h.run('Y', 'J')
    await h.click(10, 2, rest[0].id)
    await h.click(5, 5, rest[1].id)
    await h.click(0, 2, rest[2].id)
    await h.run('')
    expect(h.prints).toContain('3 segments added to polyline')
    await h.run('')
    const [p] = h.ofType('POLYLINE')
    expect((p.props as PolylineProps).closed).toBe(true)
    expect(h.ofType('LINE').length).toBe(0)
  })

  it('Multiple con fuzz y Jointype Add; Width, Fit, Decurve, Reverse y Undo', async () => {
    resetSysvars()
    const h = makeEngine()
    await h.run('LINE', '0,0', '#10,0', '')
    await h.run('LINE', '10.5,0.5', '#20,10', '')
    const ids = h.ofType('LINE').map((e) => e.id)
    h.setSelection(ids)
    await h.run('PEDIT', 'Y', 'J', 'J', 'A', '1')
    const [p] = h.ofType('POLYLINE')
    expect((p.props as PolylineProps).vertices.length).toBe(4)
    await h.run('W', '2')
    expect((h.ofType('POLYLINE')[0].props as PolylineProps).widths?.[0]).toEqual([2, 2])
    await h.run('F')
    expect((h.ofType('POLYLINE')[0].props as PolylineProps).fit).toBe('fit')
    await h.run('D')
    expect((h.ofType('POLYLINE')[0].props as PolylineProps).vertices.length).toBe(4)
    await h.run('R')
    expect((h.ofType('POLYLINE')[0].props as PolylineProps).vertices[0]).toEqual([20, 10, 0])
    await h.run('U', 'U', 'U', 'U')
    expect((h.ofType('POLYLINE')[0].props as PolylineProps).widths).toBeUndefined()
    await h.run('')
  })

  it('Edit vertex: Next, Move y Width del tramo; PEDITACCEPT convierte sin preguntar', async () => {
    resetSysvars()
    sysvars.PEDITACCEPT = 1
    const h = makeEngine()
    await h.run('PLINE', '0,0', '#10,0', '#20,0', '')
    const id = h.ofType('POLYLINE')[0].id
    h.setSelection([id])
    await h.run('PEDIT', 'E', 'N', 'M', '#10,5', 'W', '1', '3', 'X', '')
    const p = h.ofType('POLYLINE')[0].props as PolylineProps
    expect(p.vertices[1]).toEqual([10, 5, 0])
    expect(p.widths?.[1]).toEqual([1, 3])
    await h.run('LINE', '0,20', '#10,20', '')
    const l = h.ofType('LINE')[0]
    await h.run('PEDIT')
    await h.click(5, 20, l.id)
    await h.run('')
    expect(h.ofType('LINE').length).toBe(0)
    expect(h.ofType('POLYLINE').length).toBe(2)
    resetSysvars()
  })

  it('PLINE con Width y Halfwidth; EXPLODE la deja en líneas y arcos', async () => {
    resetSysvars()
    const h = makeEngine()
    await h.run('PLINE', '0,0', 'W', '0', '4', '#10,0', 'H', '1', '1', '#20,0', '')
    const p = h.ofType('POLYLINE')[0].props as PolylineProps
    expect(p.widths).toEqual([[0, 4], [2, 2], [0, 0]])
    h.setSelection([h.ofType('POLYLINE')[0].id])
    await h.run('EXPLODE')
    expect(h.ofType('LINE').length).toBe(2)
    resetSysvars()
  })
})

describe('tipos de línea en los comandos', () => {
  it('-LINETYPE Load y Set; los objetos nuevos toman CELTYPE; LTSCALE', async () => {
    const h = makeEngine()
    await h.run('-LINETYPE', 'L', 'CENTER,HIDDEN', 'S', 'CENTER', '')
    expect(h.doc.linetype('HIDDEN')).toBeTruthy()
    expect(h.doc.vars.CELTYPE).toBe('CENTER')
    await h.run('LINE', '0,0', '#10,0', '')
    expect(h.ofType('LINE')[0].lineType).toBe('CENTER')
    await h.run('LTSCALE', '5')
    expect(h.doc.vars.LTSCALE).toBe(5)
    await h.run('CELTYPE', 'BYLAYER')
    await h.run('LINE', '0,5', '#10,5', '')
    expect(h.ofType('LINE')[1].lineType).toBeUndefined()
  })

  it('COPY conserva el tipo de línea del original aunque CELTYPE sea otro; MATCHPROP lo copia', async () => {
    const h = makeEngine()
    await h.run('-LINETYPE', 'S', 'PHANTOM', '')
    await h.run('LINE', '0,0', '#10,0', '')
    await h.run('CELTYPE', 'HIDDEN')
    const src = h.ofType('LINE')[0]
    h.setSelection([src.id])
    await h.run('COPY', '0,0', '0,10', '')
    expect(h.ofType('LINE').map((e) => e.lineType)).toEqual(['PHANTOM', 'PHANTOM'])
    await h.run('CELTYPE', 'BYLAYER')
    await h.run('LINE', '0,30', '#10,30', '')
    const dst = h.ofType('LINE')[2]
    await h.run('MATCHPROP')
    await h.click(5, 0, src.id)
    await h.click(5, 30, dst.id)
    await h.run('')
    expect(h.doc.getEntity(dst.id)?.lineType).toBe('PHANTOM')
  })
})
