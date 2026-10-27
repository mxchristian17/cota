import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import { polylinePoints } from '../../geom/polyline'
import type { PolylineProps } from '../../document/types'

const S: PolylineProps = {
  vertices: [[-54.240718, -163.168312, 0], [-54.240718, -114.03477737891927, 0], [-25.15497854265405, -114.03477737891927, 0], [2.099415656899609, -114.03477737891927, 0], [50.25078259866104, -114.03477737891927, 0], [19.27433870902332, -183.16749577502856, 0], [-21.302448153194945, -193.67162643430206, 0]],
  bulges: [0, -2.3235768706666815, 2.32357687066668, -2.3235768706666757, 0, 0, 0],
  closed: false,
}

const distTo = (pts: number[][], p: number[]) =>
  Math.min(...pts.slice(1).map((q, i) => {
    const a = pts[i]
    const ab = [q[0] - a[0], q[1] - a[1]]
    const L = ab[0] ** 2 + ab[1] ** 2
    const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / L)) : 0
    return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t)
  }))

describe('OFFSET de una polilínea abierta con arcos', () => {
  for (const d of [2, 5, 15]) {
    it(`a ${d} hacia adentro: una sola polilínea, sin rulos, a la distancia pedida`, async () => {
      const h = makeEngine()
      h.add('POLYLINE', S)
      await h.run('OFFSET', String(d), '#-54.240718,-140,0', '#-50,-140,0', '')
      const out = h.ofType('POLYLINE').slice(1)
      expect(out).toHaveLength(1)
      const src = polylinePoints(S, 64)
      for (const p of polylinePoints(out[0].props as PolylineProps, 16)) expect(distTo(src, p)).toBeGreaterThan(d - 0.05)
    })
  }
})
