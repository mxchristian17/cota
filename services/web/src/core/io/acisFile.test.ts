import { beforeAll, describe, expect, it } from 'vitest'
import { OcctKernel } from 'occt-wasm'
import { readFileSync } from 'node:fs'
import type { BrepProps, Entity, Layer } from '../document/types'
import { registerImportedBreps } from '../document/brepStore'
import { brepToAcis } from '../occt/brepToAcis'
import { originalAcis } from '../../render/acisExport'
import { readCad } from './cadRead'
import { acisToStep } from './acisStep'
import { writeSab, writeSat } from './acisWrite'
import { exportDxf } from './dxf'
import { dxfTextToDwg } from './dwg'

/**
 * Sólidos guardados como sólidos ACIS en un DXF y en un DWG y vueltos a abrir con Cota: uno del núcleo exacto (una
 * caja con un agujero) y una pieza importada (el cubo del DWG de ejemplo público) movida, que va con su modelo.
 */
let k: OcctKernel
beforeAll(async () => {
  k = await OcctKernel.init()
}, 30_000)

const layers: Layer[] = [{ id: 'l0', name: '0', color: '#ffffff', lineWeight: 0.25, lineType: 'CONTINUOUS', visible: true, locked: false, frozen: false, printable: true } as Layer]
const buf = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

/** Volumen y caja de cada sólido importado de un resultado, como los lee el núcleo. */
function solidsOf(r: ReturnType<typeof readCad>) {
  const leaves = r.entities.filter((e) => e.type === 'SOLID3D').map((e) => e.props as BrepProps)
  return leaves.map((p) => {
    const step = acisToStep(r.breps![p.ref].bytes)
    const s = k.importStep(step!.step)
    const b = k.getBoundingBox(s)
    return { volume: k.getVolume(s), lo: [b.xmin, b.ymin, b.zmin], hi: [b.xmax, b.ymax, b.zmax], fmt: r.breps![p.ref].fmt }
  })
}

const solidEntity = (props: object): Entity => ({ id: 's', type: 'SOLID3D', layer: 'l0', props }) as Entity

describe('sólidos ACIS en archivos', () => {
  const holed = () => k.cut(k.makeBox(10, 20, 30), k.translate(k.makeCylinder(3, 40), 5, 10, -5))

  it('DXF: un 3DSOLID con su SAT, que Cota vuelve a abrir como el mismo sólido', () => {
    const s = holed()
    const model = brepToAcis(k.toBREP(s))
    const e = solidEntity({ op: 'BOX' })
    const dxf = exportDxf([e], layers, 'l0', undefined, { acis: new Map([[e, { kind: model.kind, sat: writeSat(model.recs) }]]) })
    expect(dxf).toContain('0\n3DSOLID\n100\nAcDbEntity\n8\n0\n100\nAcDbModelerGeometry\n70\n1\n1\n')
    const [back] = solidsOf(readCad('dxf', new TextEncoder().encode(dxf).buffer as ArrayBuffer))
    expect(back.fmt).toBe('sat')
    expect(back.volume).toBeCloseTo(k.getVolume(s), 6)
  })

  it('DWG: el SAB en el DWG 2018; Cota lo vuelve a abrir como el mismo sólido', async () => {
    const s = holed()
    const model = brepToAcis(k.toBREP(s))
    const e = solidEntity({ op: 'BOX' })
    const dxf = exportDxf([e], layers, 'l0', undefined, { acis: new Map([[e, { kind: model.kind, sat: 'cota-solid 0\n' }]]) })
    const dwg = await dxfTextToDwg(dxf, new Map([['0', writeSab(model.recs)]]))
    const [back] = solidsOf(readCad('dwg', dwg))
    expect(back.fmt).toBe('sab')
    expect(back.volume).toBeCloseTo(k.getVolume(s), 6)
  })

  it('DWG: cada sólido conserva su color (verdadero o de índice); sin color, por capa', async () => {
    const model = brepToAcis(k.toBREP(k.makeBox(1, 2, 3)))
    const colors = ['#b81c1c', '#ff0000', undefined]
    const es = colors.map((c, i) => ({ ...solidEntity({ op: 'BOX' }), id: `s${i}`, ...(c ? { color: c } : {}) }) as Entity)
    const marks = new Map(es.map((e, i) => [e, { kind: model.kind, sat: `cota-solid ${i}\n` }]))
    const sab = new Map(es.map((_, i) => [String(i), writeSab(model.recs)]))
    const back = readCad('dwg', await dxfTextToDwg(exportDxf(es, layers, 'l0', undefined, { acis: marks }), sab)).entities
    expect(back.map((e) => [e.type, e.color])).toEqual([
      ['SOLID3D', '#b81c1c'],
      ['SOLID3D', '#ff0000'],
      ['SOLID3D', undefined],
    ])
  })

  it('una pieza importada movida va con su modelo original y su nueva ubicación (DWG y DXF)', async () => {
    const sample = readFileSync(new URL('./__fixtures__/acadsharp/sample_AC1032.dwg', import.meta.url))
    const r = readCad('dwg', buf(sample))
    registerImportedBreps(r.breps)
    const cube = r.entities.find((e) => e.type === 'SOLID3D' && solidsOf({ ...r, entities: [e] })[0].volume > 124)!
    const before = solidsOf({ ...r, entities: [cube] })[0]
    const moved: BrepProps = { ...(cube.props as BrepProps), m: [1, 0, 0, 100, 0, 1, 0, 200, 0, 0, 1, 3] }
    // DWG: el SAB, tal cual salvo la transformación.
    const sab = originalAcis(moved, 'sab')!
    expect(sab.kind).toBe('solid')
    const e = solidEntity(moved)
    const dwg = await dxfTextToDwg(
      exportDxf([e], layers, 'l0', undefined, { acis: new Map([[e, { kind: 'solid', sat: 'cota-solid 0\n' }]]) }),
      new Map([['0', sab.data as Uint8Array]]),
    )
    const [back] = solidsOf(readCad('dwg', dwg))
    expect(back.volume).toBeCloseTo(before.volume, 9)
    expect(back.lo).toEqual(before.lo.map((v, i) => expect.closeTo(v + [100, 200, 3][i], 9)))
    // DXF: un SAB no va como SAT (pasa por el núcleo).
    expect(originalAcis(moved, 'sat')).toBeNull()
  })
})
