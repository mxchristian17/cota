import type { MeshProps } from '../document/types'
import type { Vec3 } from '../math'

/**
 * STL (ASCII o binario) a una malla con los vértices soldados. Un STL binario empieza con 80 bytes de cabecera
 * (que a veces también dice "solid"), así que se decide por el tamaño exacto: 84 + 50 bytes por triángulo.
 */
export function parseStl(buf: ArrayBuffer): MeshProps {
  const dv = new DataView(buf)
  const n = buf.byteLength >= 84 ? dv.getUint32(80, true) : -1
  const binary = n >= 0 && 84 + n * 50 === buf.byteLength
  const tris: Vec3[] = []
  if (binary) {
    for (let t = 0; t < n; t++) {
      const o = 84 + t * 50 + 12 // salta la normal
      for (let k = 0; k < 3; k++) tris.push([dv.getFloat32(o + k * 12, true), dv.getFloat32(o + k * 12 + 4, true), dv.getFloat32(o + k * 12 + 8, true)])
    }
  } else {
    const text = new TextDecoder().decode(buf)
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g
    for (let m = re.exec(text); m; m = re.exec(text)) tris.push([Number(m[1]), Number(m[2]), Number(m[3])])
    if (tris.length % 3 !== 0 || tris.some((p) => p.some((x) => !Number.isFinite(x)))) throw new Error('Invalid STL file.')
  }
  if (tris.length === 0) throw new Error('The STL file has no triangles.')
  return weld(tris)
}

/** Une los vértices repetidos (misma posición) de una sopa de triángulos. */
export function weld(tris: Vec3[]): MeshProps {
  const vertices: Vec3[] = []
  const index = new Map<string, number>()
  const faces: number[][] = []
  for (let i = 0; i + 2 < tris.length; i += 3) {
    const f = [tris[i], tris[i + 1], tris[i + 2]].map((p) => {
      const k = p.join(',')
      let id = index.get(k)
      if (id === undefined) {
        id = vertices.length
        vertices.push(p)
        index.set(k, id)
      }
      return id
    })
    if (f[0] !== f[1] && f[1] !== f[2] && f[0] !== f[2]) faces.push(f)
  }
  return { vertices, faces }
}
