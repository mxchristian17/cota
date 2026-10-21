import { describe, expect, it } from 'vitest'
import '../../render/csg'
import { solidMesh } from '../../render/csg'
import type { Vec3 } from '../math'
import type { SolidProps } from '../document/types'
import { flatshotEntities, flatshotItems, nextFlatshotName } from './flatshot'
import { solidCircleHints, type ProjBasis } from './orthographic'

const norm = (v: Vec3): Vec3 => {
  const L = Math.hypot(...v)
  return [v[0] / L, v[1] / L, v[2] / L]
}
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
/** Vista SE isométrica (desde +X, −Y, +Z), como la del CAD clásico. */
const SEISO: ProjBasis = (() => {
  const out = norm([1, -1, 1])
  const right = norm([1, 1, 0])
  return { right, up: cross(out, right), out }
})()
const TOP: ProjBasis = { right: [1, 0, 0], up: [0, 1, 0], out: [0, 0, 1] }

describe('FLATSHOT', () => {
  const box: SolidProps = { op: 'BOX', origin: [0, 0, 0], width: 20, depth: 10, height: 5 }

  it('una caja en isométrica: 9 aristas visibles y, con Show, 3 ocultas', () => {
    const m = solidMesh(box)
    const vis = flatshotItems([m], [], SEISO, { showObscured: false, tangential: false })
    expect(vis.filter((i) => i.kind === 'line')).toHaveLength(9)
    const all = flatshotItems([m], [], SEISO, { showObscured: true, tangential: false })
    expect(all.filter((i) => i.hidden)).toHaveLength(3)
  })

  it('un cilindro visto desde arriba es un círculo exacto', () => {
    const cyl: SolidProps = { op: 'CYLINDER', base: [5, 5, 0], radius: 4, height: 10, segments: 48 }
    const items = flatshotItems([solidMesh(cyl)], solidCircleHints(cyl), TOP, { showObscured: false, tangential: false })
    const c = items.find((i) => i.kind === 'circle')
    expect(c && c.kind === 'circle' && c.r).toBeCloseTo(4, 9)
  })

  it('el bloque: líneas en el plano XY, ocultas con su tipo de línea', () => {
    const items = flatshotItems([solidMesh(box)], [], SEISO, { showObscured: true, tangential: false })
    const es = flatshotEntities(items, { foregroundLinetype: 'BYBLOCK', obscuredLinetype: 'HIDDEN' })
    expect(es.every((e) => e.layer === '0')).toBe(true)
    expect(es.filter((e) => e.lineType === 'HIDDEN')).toHaveLength(3)
    for (const e of es) if (e.type === 'LINE') expect(e.props.start[2]).toBe(0)
  })

  it('nombres FLATSHOTn libres', () => {
    expect(nextFlatshotName(['FLATSHOT1', 'flatshot2', 'X'])).toBe('FLATSHOT3')
  })
})
