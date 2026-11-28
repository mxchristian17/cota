import { expect, it } from 'vitest'
import { OcctKernel } from 'occt-wasm'
import { evalSolid } from '../occt/occtEval'
import { projectHidden } from './orthographic'
import type { SolidProps } from '../document/types'
import type { Vec3 } from '../math'

/**
 * Un tubo con agujeros e ingleteado (el inferior de un cuadro): el núcleo teselea su cara de forma irregular y la arista
 * de silueta no cae justo en el borde. Su propia superficie no debe tapar el contorno (salía medio contorno punteado).
 */
it('el contorno de un tubo con agujeros e ingletes se ve entero en una vista de costado', async () => {
  const k = await OcctKernel.init()
  // Tubo Ø34,9 × 0,8 a lo largo de un eje inclinado en XZ (como el inferior), de 600 mm.
  const ax: Vec3 = [Math.cos(0.8), 0, Math.sin(0.8)]
  const up: Vec3 = [-ax[2], 0, ax[0]]
  const hole = (t: number): SolidProps => ({ op: 'CYLINDER', base: [ax[0] * t, 0, ax[2] * t], radius: 4, height: 30, segments: 32, axis: up }) as SolidProps
  const tubo: SolidProps = {
    op: 'SUBTRACT',
    operands: [
      { op: 'CYLINDER', base: [0, 0, 0], radius: 17.45, height: 600, segments: 48, axis: ax } as SolidProps,
      { op: 'CYLINDER', base: [-ax[0], 0, -ax[2]], radius: 16.65, height: 602, segments: 48, axis: ax } as SolidProps,
      hole(330),
      hole(394),
      { op: 'CYLINDER', base: [600 * ax[0] - 30, -40, 600 * ax[2] - 60], radius: 18, height: 80, segments: 48, axis: [0, 1, 0] } as SolidProps,
      { op: 'CYLINDER', base: [0, -40, 0], radius: 20, height: 80, segments: 48, axis: [0, 1, 0] } as SolidProps,
    ],
  }
  {
    const r = evalSolid(k, tubo)
    const { positions: P, indices: I, triGroup } = r.mesh
    const vertices: Vec3[] = []
    for (let i = 0; i < P.length; i += 3) vertices.push([P[i], P[i + 1], P[i + 2]])
    const faces: number[][] = []
    for (let t = 0; t < I.length; t += 3) faces.push([I[t], I[t + 1], I[t + 2]])
    const surf = Array.from(triGroup)
    const segs = projectHidden([{ vertices, faces, surf } as never], { right: [1, 0, 0], up: [0, 0, 1], out: [0, -1, 0] })
    // Contorno: segmentos paralelos al eje a ±r de él.
    const nrm: [number, number] = [-ax[2], ax[0]]
    const dist = (p: [number, number]) => p[0] * nrm[0] + p[1] * nrm[1]
    const sil = segs.filter((s) => Math.abs(Math.abs(dist(s.a)) - 17.45) < 0.3 && Math.abs(Math.abs(dist(s.b)) - 17.45) < 0.3)
    const len = (s: { a: number[]; b: number[] }) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    const vis = sil.filter((s) => !s.hidden).reduce((a, s) => a + len(s), 0)
    const hid = sil.filter((s) => s.hidden).reduce((a, s) => a + len(s), 0)
    // Los dos contornos (2 × 600 mm menos lo que se llevan los ingletes y los agujeros) se ven; oculto, sólo junto a los agujeros.
    expect(vis).toBeGreaterThan(1100)
    expect(hid).toBeLessThan(10)
  }
})
