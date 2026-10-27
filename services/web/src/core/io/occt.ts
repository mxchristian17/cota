import type { MeshProps } from '../document/types'
import type { Vec3 } from '../math'

/**
 * STEP e IGES con OpenCascade compilado a WebAssembly (`occt-import-js`, LGPL-2.1). Se carga sólo al abrir uno de
 * estos archivos: el resto de la app no lo descarga. Cada cuerpo del archivo llega como una malla triangulada.
 */
export async function readCadFile(buf: ArrayBuffer, kind: 'step' | 'iges'): Promise<Array<MeshProps & { name?: string }>> {
  const [{ default: factory }, { default: wasmUrl }] = await Promise.all([import('occt-import-js'), import('occt-import-js/dist/occt-import-js.wasm?url')])
  const occt = await factory({ locateFile: () => wasmUrl })
  const bytes = new Uint8Array(buf)
  const res = kind === 'step' ? occt.ReadStepFile(bytes, null) : occt.ReadIgesFile(bytes, null)
  if (!res?.success) throw new Error(`The ${kind.toUpperCase()} file could not be read.`)
  return res.meshes.map((m) => {
    const p = m.attributes.position.array
    const vertices: Vec3[] = []
    for (let i = 0; i + 2 < p.length; i += 3) vertices.push([p[i], p[i + 1], p[i + 2]])
    const ix = m.index.array
    const faces: number[][] = []
    for (let i = 0; i + 2 < ix.length; i += 3) faces.push([ix[i], ix[i + 1], ix[i + 2]])
    return { vertices, faces, name: m.name }
  })
}
