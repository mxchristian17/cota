import type { Vec3 } from '../math'
import type { SolidProps } from '../document/types'

/**
 * Medidas negativas (altura de CYLINDER/CONE/EXTRUDE, lados de BOX): en el CAD clásico sólo invierten el sentido.
 * Three las convierte en geometría dada vuelta (caras hacia adentro) y la CSG con ella da basura: se
 * normalizan a medidas positivas con el eje o el ancla invertidos.
 */
export function positiveLeaf(p: SolidProps): SolidProps {
  switch (p.op) {
    case 'CYLINDER':
    case 'CONE':
    case 'EXTRUDE': {
      if (!(p.height < 0)) return p
      const a = p.axis ?? [0, 0, 1]
      return { ...p, height: -p.height, axis: [-a[0], -a[1], -a[2]] }
    }
    case 'BOX': {
      if (p.width >= 0 && p.depth >= 0 && p.height >= 0) return p
      const x = p.basis?.x ?? [1, 0, 0]
      const y = p.basis?.y ?? [0, 1, 0]
      const z: Vec3 = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]
      const o: Vec3 = [...p.origin]
      for (const [len, d] of [[p.width, x], [p.depth, y], [p.height, z]] as const) if (len < 0) for (let i = 0; i < 3; i++) o[i] += len * d[i]
      return { ...p, origin: o, width: Math.abs(p.width), depth: Math.abs(p.depth), height: Math.abs(p.height) }
    }
    default:
      return p
  }
}
