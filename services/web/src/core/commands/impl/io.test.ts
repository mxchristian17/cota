import { describe, expect, it } from 'vitest'
import { DocumentModel } from '../../document/DocumentModel'
import { expandEntities } from '../../editing/block'
import { parseStl } from '../../io/stl'
import { makeEngine } from '../../../test/engineHarness'
import { blockNameFromFile } from './io'
import type { DocumentData, MeshProps } from '../../document/types'
import type { ImportedModel } from '../types'

/** STL ASCII de un triángulo desplazado (como el de los e2e de OPEN). */
const stl = (dx: number): string =>
  `solid t\nfacet normal 0 0 1\nouter loop\nvertex ${dx} 0 0\nvertex ${dx + 10} 0 0\nvertex ${dx} 10 0\nendloop\nendfacet\nendsolid t\n`

/** Lo que el selector de IMPORT devolvería al elegir un modelo (leído con el mismo lector que OPEN). */
const model = (file: string, meshes: MeshProps[], format = 'STEP'): ImportedModel => ({ file, format, meshes })
const twoBodies = (): MeshProps[] => [parseStl(new TextEncoder().encode(stl(0)).buffer as ArrayBuffer), parseStl(new TextEncoder().encode(stl(30)).buffer as ArrayBuffer)]

describe('IMPORT de modelos 3D al dibujo abierto (B04)', () => {
  it('Objects (Enter): cada cuerpo, una malla en la capa actual, en las coordenadas del archivo', async () => {
    const h = makeEngine({ importFile: async () => model('LM8UU.step', twoBodies()) })
    h.add('LINE', { start: [0, 0, 0], end: [100, 0, 0] }) // el dibujo abierto sigue ahí
    await h.run('IMPORT', '')
    expect(h.prints).toContain('Imported 2 mesh(es) from STEP.')
    expect(h.doc.entities.map((e) => e.type)).toEqual(['LINE', 'MESH3D', 'MESH3D'])
    const mesh = h.doc.entities[2]
    expect(mesh.type === 'MESH3D' && mesh.props.vertices[0]).toEqual([30, 0, 0])
  })

  it('Block: una definición con el modelo y una inserción en el origen; INSERT la repite; SAVE/OPEN la conserva', async () => {
    const h = makeEngine({ importFile: async () => model('NEMA-17_Stepper_Motor_40mm.step', twoBodies()) })
    await h.run('IMPORT', 'B', '')
    expect(h.prints).toContain(
      'Block "NEMA-17_Stepper_Motor_40mm" defined with 2 mesh(es) from STEP and inserted at 0,0,0. Use INSERT NEMA-17_Stepper_Motor_40mm to place more.',
    )
    const def = h.doc.getBlock('NEMA-17_Stepper_Motor_40mm')
    expect(def?.entities.map((e) => [e.type, e.layer])).toEqual([
      ['MESH3D', '0'],
      ['MESH3D', '0'],
    ])
    await h.run('INSERT', 'NEMA-17_Stepper_Motor_40mm', '100,0,0', '1', '0')
    expect(h.doc.entities.map((e) => (e.type === 'INSERT' ? e.props.position : e.type))).toEqual([
      [0, 0, 0],
      [100, 0, 0],
    ])
    const reopened = DocumentModel.fromJSON(JSON.parse(JSON.stringify(h.doc.toJSON())) as DocumentData)
    expect(expandEntities(reopened.entities, reopened.blocks).filter((e) => e.type === 'MESH3D')).toHaveLength(4)
  })

  it('Block con un nombre que ya existe: pregunta si lo redefine; No pide otro nombre', async () => {
    const h = makeEngine({ importFile: async () => model('LM8uu.stl', twoBodies(), 'STL') })
    await h.run('IMPORT', 'Block', 'LM8UU')
    await h.run('IMPORT', 'Block', 'LM8UU', 'No', 'LM8UU_2')
    expect(h.doc.blocks.map((b) => b.name)).toEqual(['LM8UU', 'LM8UU_2'])
    await h.run('IMPORT', 'Block', 'LM8UU', 'Yes')
    expect(h.prints.at(-1)).toMatch(/^Block "LM8UU" redefined with 2 mesh\(es\) from STL/)
    expect(h.doc.blocks).toHaveLength(2)
  })

  it('sin modelo (cancelado, DXF/DWG o un error ya avisado) no pregunta nada', async () => {
    const h = makeEngine({ importFile: async () => null })
    await h.run('IMPORT')
    expect(h.engine.pendingKind()).toBeNull()
    expect(h.doc.entities).toHaveLength(0)
  })

  it('nombre de bloque a partir del archivo', () => {
    expect(blockNameFromFile('NEMA-17_Stepper_Motor_40mm.step')).toBe('NEMA-17_Stepper_Motor_40mm')
    expect(blockNameFromFile('C:\\parts\\MK8.iges')).toBe('MK8')
    expect(blockNameFromFile('a:b|c.stl')).toBe('a_b_c')
    expect(blockNameFromFile('.stl')).toBe('MODEL')
  })
})
