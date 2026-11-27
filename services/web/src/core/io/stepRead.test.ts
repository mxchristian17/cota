import { beforeAll, describe, expect, it } from 'vitest'
import { OcctKernel } from 'occt-wasm'
import type { BrepProps, InsertProps } from '../document/types'
import type { Vec3 } from '../math'
import { pointMap } from '../editing/block'
import type { Affine } from '../geom/affine'
import type { DxfEntitySpec } from './dxf'
import { insertOfMatrix, readStepExact, type StepReadResult } from './stepRead'
import { writeStepExact } from './stepWrite'
import type { SolidProps } from '../document/types'

let k: OcctKernel
beforeAll(async () => {
  k = await OcctKernel.init()
}, 30_000)

/** Matriz de una inserción (por sus puntos). */
function insertMatrix(ins: InsertProps): Affine {
  const P = pointMap(ins)
  const o = P([0, 0, 0])
  const [x, y, z] = (
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as Vec3[]
  ).map((d) => P(d).map((v, i) => v - o[i]))
  return [x[0], y[0], z[0], o[0], x[1], y[1], z[1], o[1], x[2], y[2], z[2], o[2]]
}

const mul = (a: Affine, b: Affine): Affine => {
  const out: number[] = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) out[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c]
    out[r * 4 + 3] = a[r * 4] * b[3] + a[r * 4 + 1] * b[7] + a[r * 4 + 2] * b[11] + a[r * 4 + 3]
  }
  return out as Affine
}
const I: Affine = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]

/** Cada sólido del resultado en el mundo: su caja (del núcleo), su volumen, su color y el bloque que lo contiene. */
function placed(r: StepReadResult) {
  const out: Array<{ box: number[]; volume: number; color?: string; block?: string }> = []
  const walk = (list: DxfEntitySpec[], m: Affine, block?: string, color?: string) => {
    for (const e of list) {
      if (e.type === 'INSERT') {
        const ins = e.props as InsertProps
        // Como al dibujar: «por bloque» toma el color de la inserción de afuera; sin color, por capa.
        const own = e.color === 'BYBLOCK' ? color : e.color
        walk(r.blocks!.find((b) => b.name === ins.name)!.entities, mul(m, insertMatrix(ins)), ins.name, own)
      } else if (e.type === 'SOLID3D') {
        const leaf = e.props as BrepProps
        const s = k.transform(k.fromBREPBinary(r.breps![leaf.ref].bytes), leaf.m ? mul(m, leaf.m as Affine) : m)
        const b = k.getBoundingBox(s)
        out.push({ box: [b.xmin, b.ymin, b.zmin, b.xmax, b.ymax, b.zmax], volume: k.getVolume(s), color: e.color === 'BYBLOCK' ? color : e.color, block })
      }
    }
  }
  walk(r.entities, I)
  return out.sort((a, b) => a.box[0] - b.box[0] || a.box[1] - b.box[1] || a.box[2] - b.box[2])
}

const boxOf = (s: ReturnType<OcctKernel['makeBox']>) => {
  const b = k.getBoundingBox(s)
  return [b.xmin, b.ymin, b.zmin, b.xmax, b.ymax, b.zmax]
}

describe('STEP exacto', () => {
  it('una inserción por cada semejanza: vuelve la misma matriz (con giro fuera de planta y con simetría)', () => {
    const c = Math.cos(0.7)
    const s = Math.sin(0.7)
    for (const m of [
      [1, 0, 0, 5, 0, 1, 0, 6, 0, 0, 1, 7],
      [c, -s, 0, 1, s, c, 0, 2, 0, 0, 1, 3],
      [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0],
      [c, 0, s, 4, 0, 1, 0, 0, -s, 0, c, 9],
      [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
      [0, 0, 2, 1, 2, 0, 0, 1, 0, 2, 0, 1],
    ] as Affine[]) {
      const ins = insertOfMatrix(m)!
      const back = insertMatrix({ name: 'x', ...ins })
      back.forEach((v, i) => expect(v, `${m} [${i}]`).toBeCloseTo(m[i], 12))
    }
    expect(insertOfMatrix([2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0])).toBeNull()
  })

  it('un ensamble con un subensamble, piezas repetidas y giradas: bloques con sus nombres, una pieza = un modelo', () => {
    const doc = k.createXCAFDocument()
    const caja = k.makeBox(10, 20, 30)
    const eje = k.makeCylinder(3, 40)
    const root = doc.addShape(k.makeCompound([]), { name: 'Maquina' })
    const sub = doc.addChild(root, k.makeCompound([]), { name: 'Soporte', location: { tx: 100 } })
    const subDef = doc.getReferredLabel(sub)!
    doc.addChild(subDef, caja, { name: 'Caja', color: [1, 0, 0] })
    doc.addChild(subDef, eje, { name: 'Eje', location: { tx: 5, ty: 10, rx: Math.PI / 2 } })
    doc.addChild(root, caja, { name: 'Caja', location: { tx: -50, rz: Math.PI / 2 } })
    doc.addChild(root, caja, { name: 'Caja', location: { ty: 200, ry: 0.3 } })
    const step = doc.exportSTEP()
    // Lo que se espera: cada pieza en su lugar, leída del mismo STEP como una sola forma.
    const whole = k.importStep(step)
    const want = k.getSubShapes(whole, 'solid').map((s) => ({ box: boxOf(s), volume: k.getVolume(s) }))
    doc.close()

    const r = readStepExact(k, step)
    // La caja repetida es un solo modelo (y un solo bloque), el eje otro.
    expect(r.stats).toEqual({ models: 2, solids: 4, inserts: 5 })
    expect(Object.keys(r.breps!)).toHaveLength(2)
    expect(Object.values(r.breps!).every((b) => b.fmt === 'brep' && b.display.tri.length > 0 && b.display.wireCounts.length > 0)).toBe(true)
    const names = r.blocks!.map((b) => b.name).sort()
    expect(names).toEqual(['Caja', 'Eje', 'Soporte'])
    expect(r.entities.filter((e) => e.type === 'INSERT')).toHaveLength(3)
    const got = placed(r)
    expect(got).toHaveLength(want.length)
    want.sort((a, b) => a.box[0] - b.box[0] || a.box[1] - b.box[1] || a.box[2] - b.box[2])
    got.forEach((g, i) => {
      g.box.forEach((v, j) => expect(v, `sólido ${i} caja ${j}`).toBeCloseTo(want[i].box[j], 6))
      expect(g.volume).toBeCloseTo(want[i].volume, 6)
    })
    // El color de la caja del soporte (dado en la instancia) llega a su sólido: los sólidos sin color propio van «por
    // bloque» y toman el de su inserción; las demás piezas, sin color, quedan por capa.
    expect(got.filter((g) => g.color === '#ff0000')).toHaveLength(1)
    expect(got.filter((g) => g.color === undefined)).toHaveLength(3)
  })

  it('una sola pieza: suelta, sin bloque, con su caja', () => {
    const box = k.makeBox(10, 20, 30)
    const s = k.fillet(box, k.getSubShapes(box, 'edge').slice(0, 2), 2)
    const r = readStepExact(k, k.exportStep(s))
    expect(r.blocks).toBeUndefined()
    expect(r.entities.map((e) => e.type)).toEqual(['SOLID3D'])
    const [g] = placed(r)
    expect(g.volume).toBeCloseTo(k.getVolume(s), 6)
    g.box.forEach((v, j) => expect(v).toBeCloseTo(boxOf(s)[j], 6))
    // La caja de la hoja es la de la pieza.
    const leaf = r.entities[0].props as BrepProps
    expect(leaf.box.flat()).toEqual(boxOf(s).map((v) => expect.closeTo(v, 6)))
  })

  it('EXPORT STEP: cada sólido (de Cota o importado, movido) con su forma, su nombre y su color; vuelve igual', () => {
    const box: SolidProps = { op: 'BOX', origin: [0, 0, 0], width: 10, depth: 20, height: 30 }
    const holed: SolidProps = { op: 'SUBTRACT', operands: [box, { op: 'CYLINDER', base: [5, 10, -5], radius: 3, height: 40 } as SolidProps] }
    const bytes = k.toBREPBinary(k.makeTorus(10, 2))
    const torus: SolidProps = {
      op: 'BREP',
      ref: 'toro',
      box: [
        [-12, -12, -2],
        [12, 12, 2],
      ],
      m: [0, -1, 0, 100, 1, 0, 0, 0, 0, 0, 1, 5],
    }
    const out = writeStepExact(
      k,
      [
        { props: holed, name: 'Bloque', color: [0, 0.5, 1] },
        { props: torus, name: 'Aro' },
      ],
      { models: { toro: { fmt: 'brep', bytes } } },
    )
    expect(out).toMatchObject({ written: 2, failed: 0 })
    expect(out.step).toContain('AUTOMOTIVE_DESIGN')
    const r = readStepExact(k, out.step)
    expect(r.blocks!.map((b) => b.name).sort()).toEqual(['Aro', 'Bloque'])
    const got = placed(r)
    expect(got.map((g) => g.block)).toEqual(['Bloque', 'Aro'])
    expect(got[0].volume).toBeCloseTo(10 * 20 * 30 - Math.PI * 9 * 30, 4)
    expect(got[0].color).toBe('#0080ff')
    expect(got[1].volume).toBeCloseTo(2 * Math.PI ** 2 * 10 * 4, 4)
    expect(got[1].box).toEqual([88, -12, 3, 112, 12, 7].map((v) => expect.closeTo(v, 6)))
  })

  it('en un dibujo en metros, un STEP en mm se escala al ubicarlo (y se escribe en metros)', () => {
    const out = writeStepExact(k, [{ props: { op: 'BOX', origin: [0, 0, 0], width: 1, depth: 2, height: 3 }, name: 'Caja' }], { unit: 'm', mmPerUnit: 1000 })
    expect(out.step).toMatch(/SI_UNIT\(\.MILLI\.,\.METRE\.\)|SI_UNIT\(\$,\.METRE\.\)/)
    const r = readStepExact(k, out.step, { scale: 1 / 1000 })
    expect(placed(r)[0].box).toEqual([0, 0, 0, 1, 2, 3].map((v) => expect.closeTo(v, 9)))
  })

  it('una pieza que llega como un ensamble de un solo sólido (un compuesto) es la pieza, con su nombre y su color', () => {
    const doc = k.createXCAFDocument()
    const root = doc.addShape(k.makeCompound([]), { name: 'Cuadro' })
    const sub = doc.getReferredLabel(doc.addChild(root, k.makeCompound([]), { name: 'Delantero' }))!
    // Lo que devuelve una booleana: un compuesto con un sólido.
    const tubo = k.makeCompound([k.cut(k.makeCylinder(10, 100), k.makeCylinder(9, 100))])
    doc.addChild(sub, tubo, { name: 'Tubo', color: [0.5, 0, 0] })
    doc.addChild(sub, tubo, { name: 'Tubo', color: [0.5, 0, 0], location: { tx: 50 } })
    const step = doc.exportSTEP()
    doc.close()
    const r = readStepExact(k, step)
    expect(r.blocks!.map((b) => [b.name, b.entities.map((e) => e.type)])).toEqual([
      ['Tubo', ['SOLID3D']],
      ['Delantero', ['INSERT', 'INSERT']],
    ])
    expect(r.blocks!.flatMap((b) => b.entities).every((e) => e.type !== 'INSERT' || e.color === '#800000')).toBe(true)
    // Las dos instancias con el mismo color: va en el sólido (explotado, lo conserva).
    expect(r.blocks![0].entities[0].color).toBe('#800000')
    expect(placed(r).map((g) => g.color)).toEqual(['#800000', '#800000'])
    expect(r.stats).toEqual({ models: 1, solids: 2, inserts: 3 })
  })
})
