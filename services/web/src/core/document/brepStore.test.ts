import { describe, expect, it } from 'vitest'
import { acisSamples } from '../../test/acisSamples'
import { brepLeafFromAcis } from '../editing/brepLeaf'
import { makeClip, pasteClip } from '../editing/clipData'
import { makeTemplate } from '../io/drawingTemplate'
import { DocumentModel } from './DocumentModel'
import { brepBytes, brepModel, brepRef, brepSource, brepsOf, decodeBrep, encodeBrep, fromBase64, hasBrep, registerBreps, registerImportedBreps, toBase64, uncompressedBreps, usedBrepRefs, withoutBreps, withUsedBreps } from './brepStore'
import type { ImportedBrep } from '../io/importedBrep'
import type { BrepProps, Entity } from './types'

const [solidA, region, solidB] = acisSamples('sample_AC1032.dwg').map((s) => s.data)

const addSolid = (doc: DocumentModel, data: Uint8Array): { id: string; leaf: BrepProps } => {
  const leaf = brepLeafFromAcis(doc, data)!
  const e = doc.addEntity({ type: 'SOLID3D', layer: doc.firstLayerId, props: leaf })
  return { id: e.id, leaf }
}

describe('modelos exactos de los sólidos importados', () => {
  it('se comprimen y vuelven iguales; el ref depende del contenido y del formato', () => {
    const { ref, model } = encodeBrep(solidA, 'sab')
    expect(model.fmt).toBe('sab')
    expect(model.data.length).toBeLessThan(solidA.length) // comprimido, aun en base64
    expect(decodeBrep(model)).toEqual(solidA)
    expect(encodeBrep(solidA, 'sab').ref).toBe(ref)
    expect(brepRef(solidB, 'sab')).not.toBe(ref)
    expect(brepRef(solidA, 'brep')).not.toBe(ref)
    expect(fromBase64(toBase64(new Uint8Array([0, 255, 1, 128])))).toEqual(new Uint8Array([0, 255, 1, 128]))
  })

  it('la hoja BREP lleva la caja del modelo y el dibujo su modelo, registrado para dibujarlo', () => {
    const doc = DocumentModel.createDefault('t')
    const { leaf } = addSolid(doc, solidA)
    expect(leaf.op).toBe('BREP')
    expect(leaf.box[0].every((v, i) => v < leaf.box[1][i])).toBe(true)
    expect(doc.toJSON().breps?.[leaf.ref]?.fmt).toBe('sab')
    expect(brepModel(leaf.ref)).toBeDefined()
    expect(brepBytes(leaf.ref)).toEqual(solidA)
    // El mismo modelo dos veces se guarda una sola.
    addSolid(doc, solidA)
    expect(Object.keys(doc.toJSON().breps ?? {})).toHaveLength(1)
  })

  it('las copias del dibujo (deshacer) comparten el texto del modelo, no lo copian', () => {
    const doc = DocumentModel.createDefault('t')
    const { leaf } = addSolid(doc, solidA)
    const a = doc.toJSON()
    const b = doc.toJSON()
    expect(a.breps).not.toBe(b.breps)
    expect(Object.is(a.breps![leaf.ref].data, b.breps![leaf.ref].data)).toBe(true)
    // Deshacer (swap) y abrir (load) siguen teniendo el modelo.
    doc.swap(a)
    expect(doc.toJSON().breps?.[leaf.ref]).toBeDefined()
    const reopened = DocumentModel.createDefault('otro')
    reopened.load(JSON.parse(JSON.stringify(doc.toFileJSON())))
    expect(reopened.toJSON().breps?.[leaf.ref]?.data).toBe(a.breps![leaf.ref].data)
  })

  it('al guardar quedan sólo los modelos que usa alguna entidad (del modelo, un bloque o un layout)', () => {
    const doc = DocumentModel.createDefault('t')
    const a = addSolid(doc, solidA)
    const r = addSolid(doc, region)
    const b = addSolid(doc, solidB)
    doc.removeEntity(r.id)
    // Uno pasa a un bloque: sigue en uso.
    doc.removeEntity(b.id)
    const data = doc.toJSON()
    data.blocks = [...(data.blocks ?? []), { name: 'PIEZA', entities: [{ id: 'k1', type: 'SOLID3D', layer: doc.firstLayerId, props: b.leaf } as Entity] }]
    expect([...usedBrepRefs(data)].sort()).toEqual([a.leaf.ref, b.leaf.ref].sort())
    const saved = withUsedBreps(data)
    expect(Object.keys(saved.breps ?? {}).sort()).toEqual([a.leaf.ref, b.leaf.ref].sort())
    expect(data.breps?.[r.leaf.ref]).toBeDefined() // el dibujo en memoria no cambia (deshacer puede volver a usarlo)
    expect(withoutBreps(data).breps).toBeUndefined()
    // Una plantilla no lleva las entidades del modelo: sólo el modelo del bloque.
    expect(Object.keys(makeTemplate(data, {}).drawing.breps ?? {})).toEqual([b.leaf.ref])
  })

  it('copiar y pegar en otro dibujo lleva los modelos de lo copiado', () => {
    const src = DocumentModel.createDefault('a')
    const { id, leaf } = addSolid(src, solidA)
    addSolid(src, solidB)
    const clip = makeClip(src, [src.getEntity(id)!], { x: 0, y: 0, z: 0 })
    expect(Object.keys(clip.breps ?? {})).toEqual([leaf.ref])
    const dst = DocumentModel.createDefault('b')
    // La copia pasa por IndexedDB entre pestañas: se pega una copia serializada.
    const rep = pasteClip(dst, JSON.parse(JSON.stringify(clip)), { x: 10, y: 0, z: 0 })
    expect(rep.ids).toHaveLength(1)
    expect(dst.toJSON().breps?.[leaf.ref]).toBeDefined()
    const pasted = dst.getEntity(rep.ids[0])!.props as BrepProps
    expect(pasted.ref).toBe(leaf.ref)
    expect(pasted.m?.[3]).toBeCloseTo(10, 9) // pegado 10 en X: la matriz lo lleva
  })

  it('lo importado entra sin comprimir: se comprime al guardar (o al llegar comprimido del hilo de lectura)', () => {
    // Modelos de prueba únicos (el registro es de la sesión).
    const fake = (n: number): { ref: string; brep: ImportedBrep } => {
      const bytes = new Uint8Array([9, 9, 9, n, n, n])
      return { ref: brepRef(bytes, 'sab'), brep: { fmt: 'sab', bytes, box: [[0, 0, 0], [1, 1, 1]], display: {} as ImportedBrep['display'] } }
    }
    const [a, b] = [fake(1), fake(2)]
    registerImportedBreps({ [a.ref]: a.brep, [b.ref]: b.brep })
    expect(hasBrep(a.ref)).toBe(true)
    expect(uncompressedBreps()).toEqual(expect.arrayContaining([a.ref, b.ref]))
    // El núcleo los recibe tal cual (sin comprimirlos en el hilo principal).
    expect(brepSource(a.ref)).toEqual({ fmt: 'sab', bytes: a.brep.bytes })
    expect(brepBytes(a.ref)).toEqual(a.brep.bytes)
    // Guardar: el dibujo lleva el modelo comprimido aunque no estuviera en `breps`.
    const doc = DocumentModel.createDefault('t')
    doc.addEntity({ type: 'SOLID3D', layer: doc.firstLayerId, props: { op: 'BREP', ref: a.ref, box: a.brep.box } })
    const saved = withUsedBreps(doc.toJSON())
    expect(decodeBrep(saved.breps![a.ref])).toEqual(a.brep.bytes)
    expect(uncompressedBreps()).not.toContain(a.ref)
    expect(brepsOf([{ op: 'BREP', ref: a.ref, box: a.brep.box }])).toEqual({ [a.ref]: saved.breps![a.ref] })
    // El comprimido que llega del hilo de lectura reemplaza a los bytes.
    registerBreps({ [b.ref]: encodeBrep(b.brep.bytes, 'sab').model })
    expect(uncompressedBreps()).not.toContain(b.ref)
    expect(brepBytes(b.ref)).toEqual(b.brep.bytes)
  })
})
