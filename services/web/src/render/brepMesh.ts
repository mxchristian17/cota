import * as THREE from 'three'
import type { BrepProps } from '../core/document/types'
import { brepBytes, brepDisplay, brepFormat } from '../core/document/brepStore'
import { affineDet } from '../core/geom/affine'
import { acisMesh } from '../core/io/acisMesh'
import { packDisplay, type BrepDisplay } from '../core/io/importedBrep'

/**
 * Malla de respaldo de un sólido importado (hoja `BREP`): la de la importación (o, en un dibujo guardado, la de sus
 * caras ACIS, `acisMesh`) con su matriz. Se usa sin núcleo exacto o mientras calcula. Lleva un grupo por cara del
 * modelo: la topología separa las caras del B-rep (aristas y vistas como las del modelo, no las de la triangulación).
 * null si el modelo no está o no es ACIS (un BREP binario sólo lo lee el núcleo). No se guarda: la geometría ya queda en
 * el caché de los sólidos, por árbol.
 */
export function brepMeshGeometry(p: BrepProps): THREE.BufferGeometry | null {
  let d: BrepDisplay | undefined = brepDisplay(p.ref)
  if (!d) {
    const fmt = brepFormat(p.ref)
    const bytes = fmt === 'sab' || fmt === 'sat' ? brepBytes(p.ref) : null
    const mesh = bytes ? acisMesh(bytes) : null
    if (!mesh) return null
    d = packDisplay(mesh, [])
  }
  const m = p.m
  // Reflejada, los triángulos quedan del revés: se dan vuelta para que miren afuera.
  const flip = !!m && affineDet(m) < 0
  const { pos: P, tri, faceOf } = d
  const pos = new Float32Array(tri.length * 3)
  let o = 0
  const put = (i: number) => {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]
    if (m) {
      pos[o++] = m[0] * x + m[1] * y + m[2] * z + m[3]
      pos[o++] = m[4] * x + m[5] * y + m[6] * z + m[7]
      pos[o++] = m[8] * x + m[9] * y + m[10] * z + m[11]
    } else {
      pos[o++] = x
      pos[o++] = y
      pos[o++] = z
    }
  }
  for (let t = 0; t < tri.length; t += 3) {
    put(tri[t])
    put(flip ? tri[t + 2] : tri[t + 1])
    put(flip ? tri[t + 1] : tri[t + 2])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  // Un grupo por cara del modelo (sus triángulos vienen seguidos).
  for (let t = 0, start = 0; t <= faceOf.length; t++) {
    if (t < faceOf.length && faceOf[t] === faceOf[start]) continue
    if (t > start) g.addGroup(start * 3, (t - start) * 3)
    start = t
  }
  g.computeVertexNormals()
  return g
}
