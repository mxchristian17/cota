import { describe, expect, it } from 'vitest'
import type { MeshProps } from '../document/types'
import type { DxfImportResult } from './dxf'
import { packMeshes, unpackMeshes } from './meshTransfer'

describe('mallas entre el lector y la pantalla', () => {
  it('empaquetadas y armadas de nuevo quedan iguales, y las caras de un bloque siguen compartidas', () => {
    const faces = [[0, 1, 2], [0, 2, 3, 1]]
    const a: MeshProps = { vertices: [[0, 0, 0], [1, 0, 0], [1, 1, 0.5], [0, 1, 0]], faces }
    const b: MeshProps = { vertices: [[5, 0, 0], [6, 0, 0], [6, 1, 0.5], [5, 1, 0]], faces }
    const r = {
      entities: [{ type: 'MESH3D', layerName: '0', props: a }, { type: 'LINE', layerName: '0', props: { start: [0, 0, 0], end: [1, 0, 0] } }],
      layouts: [{ entities: [{ type: 'MESH3D', layerName: '0', props: b }] }],
    } as unknown as DxfImportResult
    const before = structuredClone(r)
    const transfer = packMeshes(r)
    expect(transfer).toHaveLength(3) // dos de vértices y uno de caras
    const copy = structuredClone(r, { transfer })
    unpackMeshes(copy)
    expect(copy).toEqual(before)
    const [ma, mb] = [copy.entities[0].props, copy.layouts![0].entities[0].props] as MeshProps[]
    expect(ma.faces).toBe(mb.faces)
  })
})
