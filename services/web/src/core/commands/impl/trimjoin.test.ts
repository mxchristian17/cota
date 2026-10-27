import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import { orthonormal } from '../../ucs'
import { pt, type Vec3 } from '../../math'
import { resolveDeferredLine } from '../../geom/tangency'
import type { PolylineProps } from '../../document/types'

describe('perfil de biela: dos círculos, tangentes, TRIM y JOIN', () => {
  for (const vertical of [false, true]) {
    it(`queda una polilínea cerrada de dos arcos y dos rectas${vertical ? ' (en una UCS vertical)' : ''}`, async () => {
      const h = makeEngine()
      const P = (x: number, y: number): Vec3 => (vertical ? [x, 4, y] : [x, y, 0])
      const n: Vec3 = vertical ? [0, -1, 0] : [0, 0, 1]
      if (vertical) h.setUcs(orthonormal(pt(0, 4, 0), [1, 0, 0], [0, 0, 1])!)
      const [B, S] = [[11, 89.0526], [109.1682, 70]]
      const big = h.add('CIRCLE', { center: P(B[0], B[1]), radius: 14, normal: n })
      const small = h.add('CIRCLE', { center: P(S[0], S[1]), radius: 10, normal: n })
      for (const side of [1, -1]) {
        const tan = (c: number[], r: number) => ({ kind: 'tangent' as const, obj: { kind: 'circle' as const, c: P(c[0], c[1]), r, n }, hint: P(c[0], c[1] + r * side) })
        const seg = resolveDeferredLine(tan(B, 14), tan(S, 10))!
        h.add('LINE', { start: seg[0], end: seg[1] })
      }
      const al = Math.atan2(S[1] - B[1], S[0] - B[0])
      await h.run('TRIM', '')
      const q1 = P(B[0] + 14 * Math.cos(al), B[1] + 14 * Math.sin(al))
      const q2 = P(S[0] - 10 * Math.cos(al), S[1] - 10 * Math.sin(al))
      await h.click3(q1[0], q1[1], q1[2], big.id)
      await h.click3(q2[0], q2[1], q2[2], small.id) // lo que queda del chico pasa por su ángulo 0: sigue siendo un arco
      await h.run('')
      expect(h.ofType('ARC')).toHaveLength(2)
      h.setSelection(h.doc.entities.map((e) => e.id))
      await h.run('JOIN')
      const pl = h.ofType('POLYLINE')
      expect(pl).toHaveLength(1)
      expect((pl[0].props as PolylineProps).closed).toBe(true)
      expect(h.doc.entities).toHaveLength(1)
    })
  }
})

describe('TRIM ▸ select all', () => {
  it('una capa apagada no corta (no interactúa con el modelo)', async () => {
    const h = makeEngine()
    await h.run('-LAYER', 'M', 'Oculta', '')
    h.add('LINE', { start: [-20, 0, 0], end: [20, 0, 0] }, h.doc.layers.find((l) => l.name === 'Oculta')!.id)
    await h.run('-LAYER', 'S', '0', 'OFF', 'Oculta', '')
    const c = h.add('CIRCLE', { center: [0, 0, 0], radius: 10, normal: [0, 0, 1] })
    h.add('LINE', { start: [-20, 5, 0], end: [20, 5, 0] })
    await h.run('TRIM', '')
    await h.click(0, -10, c.id) // abajo: con la oculta cortando, sólo se iría el tramo entre las dos y = 0
    await h.run('')
    const arcs = h.ofType('ARC')
    expect(arcs).toHaveLength(1)
    const { startAngle, endAngle } = arcs[0].props as { startAngle: number; endAngle: number }
    for (const a of [startAngle, endAngle]) expect(10 * Math.sin(a)).toBeCloseTo(5, 6) // termina en la línea visible
    expect(h.ofType('CIRCLE')).toHaveLength(0)
  })
})
