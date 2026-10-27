import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import type { LoftProps, SweepProps } from '../../document/types'
import type { Vec3 } from '../../math'
import { solidGeometry } from '../../../render/csg'
import { polylinePoints } from '../../geom/polyline'

const rect = (h: ReturnType<typeof makeEngine>) => {
  const r = h.add('RECTANGLE', { corner: [0, 0, 0], width: 10, height: 10 })
  h.setSelection([r.id])
  return r
}

describe('EXTRUDE: opciones del CAD clásico', () => {
  it('Taper angle: los lados se desplazan hacia adentro la misma distancia', async () => {
    const h = makeEngine()
    rect(h)
    await h.run('EXTRUDE', 'T', '10', '10')
    const s = h.ofType('SOLID3D')[0].props as LoftProps
    expect(s.op).toBe('LOFT')
    const off = 10 * Math.tan(Math.PI / 18)
    const top = s.sections[1]
    expect(Math.min(...top.map((p) => p[0]))).toBeCloseTo(off, 9)
    expect(Math.max(...top.map((p) => p[1]))).toBeCloseTo(10 - off, 9)
    expect(top.every((p) => Math.abs(Math.abs(p[2]) - 10) < 1e-9)).toBe(true)
  })

  it('Taper angle demasiado grande: avisa y no crea nada', async () => {
    const h = makeEngine()
    rect(h)
    await h.run('EXTRUDE', 'T', '60', '10')
    expect(h.prints.join('\n')).toContain('the profile would vanish')
    expect(h.ofType('SOLID3D')).toHaveLength(0)
  })

  it('Direction: prisma oblicuo con el perfil en su plano', async () => {
    const h = makeEngine()
    rect(h)
    await h.run('EXTRUDE', 'D', '0,0,0', '5,0,10')
    const s = h.ofType('SOLID3D')[0].props as LoftProps
    expect(s.sections[1][0]).toEqual([5, 0, 10])
  })

  it('Path: barrido por una línea, desde el centroide del perfil', async () => {
    const h = makeEngine()
    const r = h.add('RECTANGLE', { corner: [0, 0, 0], width: 10, height: 10 })
    h.add('LINE', { start: [0, 0, 0], end: [0, 0, 30] })
    h.setSelection([r.id])
    await h.run('EXTRUDE', 'P', 'L', '')
    const s = h.ofType('SOLID3D')[0].props as SweepProps
    expect(s.op).toBe('SWEEP')
    expect(s.path).toEqual([[5, 5, 0], [5, 5, 30]])
  })
})

describe('EXTRUDE ▸ Path sobre una polilínea con curvas en S (caso pathtest)', () => {
  it('el sólido sigue el recorrido desde el extremo donde está el perfil, sin giros, con el volumen esperado', async () => {
    const h = makeEngine()
    const path = {
      vertices: [[-54.240718, -163.168312, 0], [-54.240718, -114.03477737891927, 0], [-25.15497854265405, -114.03477737891927, 0], [2.099415656899609, -114.03477737891927, 0], [50.25078259866104, -114.03477737891927, 0], [19.27433870902332, -183.16749577502856, 0], [-21.302448153194945, -193.67162643430206, 0]] as Vec3[],
      bulges: [0, -2.3235768706666815, 2.32357687066668, -2.3235768706666757, 0, 0, 0],
      closed: false,
    }
    // Círculo perpendicular al último tramo, en el extremo final del recorrido.
    const last = [path.vertices[6][0] - path.vertices[5][0], path.vertices[6][1] - path.vertices[5][1], 0]
    const L = Math.hypot(...last)
    const c = h.add('CIRCLE', { center: path.vertices[6], radius: 3, normal: [last[0] / L, last[1] / L, 0] })
    h.add('POLYLINE', path)
    h.setSelection([c.id])
    await h.run('EXTRUDE', 'P', 'L', '')
    const s = h.ofType('SOLID3D')[0]?.props as SweepProps
    expect(s?.op).toBe('SWEEP')
    s.path[0].forEach((v, i) => expect(v).toBeCloseTo(path.vertices[6][i], 9)) // arranca donde está el perfil
    const g = solidGeometry(s)
    const pos = g.getAttribute('position')
    let vol = 0
    for (let k = 0; k + 2 < pos.count; k += 3) {
      const [a, b, cc] = [k, k + 1, k + 2].map((i) => [pos.getX(i), pos.getY(i), pos.getZ(i)])
      vol += (a[0] * (b[1] * cc[2] - b[2] * cc[1]) - a[1] * (b[0] * cc[2] - b[2] * cc[0]) + a[2] * (b[0] * cc[1] - b[1] * cc[0])) / 6
    }
    const pts = polylinePoints(path)
    let len = 0
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    const sides = 48
    const area = 0.5 * sides * 9 * Math.sin((2 * Math.PI) / sides)
    expect(vol).toBeGreaterThan(0)
    expect(Math.abs(vol - area * len) / (area * len)).toBeLessThan(0.03)
    // Todos los vértices quedan a ≤ r (+ inglete) del recorrido: el tubo no se tuerce ni se sale.
    const dist = (p: number[]) => Math.min(...pts.slice(1).map((q, i) => segDist(p, pts[i], q)))
    for (let i = 0; i < pos.count; i += 7) expect(dist([pos.getX(i), pos.getY(i), pos.getZ(i)])).toBeLessThan(3.6)
  })
})

function segDist(p: number[], a: number[], b: number[]): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2)) : 0
  return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t)
}
