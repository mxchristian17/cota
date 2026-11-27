import type { Vec3 } from '../math'
import type { BrepProps } from '../document/types'
import { affineOf, affinePoint, composeAffine, isIdentityAffine } from '../geom/affine'
import { brepBytes, brepDisplay, brepFormat } from '../document/brepStore'
import type { DocumentModel } from '../document/DocumentModel'
import { acisEdges } from '../io/acis'
import { acisMesh } from '../io/acisMesh'
import { acisFormat, boxOf, displayWire } from '../io/importedBrep'
import { LruCache } from '../lru'
import { cleanNumber } from '../geom/clean'

/**
 * Hoja `BREP` (sólido importado): no tiene puntos propios, así que toda transformación (mover, girar, escalar,
 * reflejar, insertar en un bloque) se compone en su matriz. `f` es la función de puntos de la transformación, que es
 * afín: su matriz sale de la imagen del origen y de los ejes.
 */
export function transformBrep(p: BrepProps, f: (v: Vec3) => Vec3): BrepProps {
  // Sin el ruido de punto flotante (el que quita `cleanNumbers`): limpiar el dibujo no cambia la matriz, que es parte de
  // la clave de la pieza en el núcleo (si no, una pieza ya convertida se volvía a calcular).
  const m = composeAffine(affineOf(f), p.m).map(cleanNumber)
  const { m: _old, ...rest } = p
  void _old
  return isIdentityAffine(m) ? rest : { ...rest, m }
}

/** Igual, en el lugar (para las transformaciones que modifican el árbol). */
export function transformBrepInPlace(p: BrepProps, f: (v: Vec3) => Vec3): void {
  const q = transformBrep(p, f)
  if (q.m) p.m = q.m
  else delete p.m
}

/** Las 8 esquinas de la caja del modelo, transformadas (límites, encuadre, boceto). */
export function brepCorners(p: BrepProps): Vec3[] {
  const [lo, hi] = p.box
  const out: Vec3[] = []
  for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) out.push(affinePoint(p.m, [x, y, z]))
  return out
}

/** Centro de la caja transformada (punto de referencia para mover o girar la pieza). */
export function brepCenter(p: BrepProps): Vec3 {
  const [lo, hi] = p.box
  return affinePoint(p.m, [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2])
}

/** Aristas del modelo sin transformar, por `ref` (leerlas cuesta lo que la malla). */
const wires = new LruCache<string, Vec3[][]>(2000)

/**
 * Alambre de la pieza (selección, snaps, vista previa, PDF): las aristas del ACIS con la matriz. Sin el modelo (o en
 * BREP binario, que sólo lee el núcleo), las aristas de su caja.
 */
export function brepWire(p: BrepProps): Vec3[][] {
  let w = wires.get(p.ref)
  if (!w) {
    // Las de lo que se dibuja (la importación ya las trae) o, si no, las del modelo.
    const d = brepDisplay(p.ref)
    const fmt = brepFormat(p.ref)
    const bytes = !d && (fmt === 'sab' || fmt === 'sat') ? brepBytes(p.ref) : null
    w = d ? displayWire(d) : bytes ? acisEdges(bytes) : []
    if (w.length) wires.set(p.ref, w)
    else {
      // Sin guardarla: el modelo puede registrarse después (al pegar, al terminar de abrir).
      const [lo, hi] = p.box
      const c = (i: number): Vec3 => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]]
      w = [
        [c(0), c(1), c(3), c(2), c(0)],
        [c(4), c(5), c(7), c(6), c(4)],
        [c(0), c(4)],
        [c(1), c(5)],
        [c(2), c(6)],
        [c(3), c(7)],
      ]
    }
  }
  return p.m ? w.map((pl) => pl.map((v) => affinePoint(p.m, v))) : w
}

/** Caja de un modelo ACIS (ver `boxOf`). */
export const acisBox = (bytes: Uint8Array): [Vec3, Vec3] | null => boxOf(acisEdges(bytes), acisMesh(bytes)?.vertices ?? [])

/**
 * Hoja `BREP` de un modelo ACIS (SAB, o SAT en texto), con su modelo agregado al dibujo; null si el modelo no tiene
 * nada que dibujar (ni caras ni aristas).
 */
export function brepLeafFromAcis(doc: DocumentModel, data: Uint8Array | string): BrepProps | null {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const box = acisBox(bytes)
  if (!box) return null
  return { op: 'BREP', ref: doc.addBrep(bytes, acisFormat(bytes)), box }
}

/** Caja transformada de la pieza (la de sus esquinas). */
export function brepBox(p: BrepProps): [Vec3, Vec3] {
  const lo: Vec3 = [Infinity, Infinity, Infinity]
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const c of brepCorners(p))
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], c[i])
      hi[i] = Math.max(hi[i], c[i])
    }
  return [lo, hi]
}

/**
 * ¿Puede una pieza importada sola estar bajo el rayo (o, sin dirección, cerca del punto)? Por su caja, agrandada en
 * `tol` y un 2 % de su diagonal: elegir una arista o una cara entre miles de piezas no arma la topología de todas. Los
 * demás sólidos (árboles propios) siempre pueden.
 */
export function mayHitSolid(props: { op: string }, origin: Vec3, dir: Vec3 | null, tol = 0): boolean {
  if (props.op !== 'BREP') return true
  const [lo, hi] = brepBox(props as BrepProps)
  const pad = tol + 0.02 * Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
  let t0 = -Infinity
  let t1 = Infinity
  for (let i = 0; i < 3; i++) {
    const a = lo[i] - pad
    const b = hi[i] + pad
    const d = dir ? dir[i] : 0
    if (Math.abs(d) < 1e-12) {
      if (origin[i] < a || origin[i] > b) return false
      continue
    }
    let ta = (a - origin[i]) / d
    let tb = (b - origin[i]) / d
    if (ta > tb) [ta, tb] = [tb, ta]
    t0 = Math.max(t0, ta)
    t1 = Math.min(t1, tb)
    if (t0 > t1) return false
  }
  return true
}
