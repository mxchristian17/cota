import type { Entity, SolidProps } from '../document/types'
import type { Vec3 } from '../math'
import { solidWireframe } from '../editing/solid'

/**
 * Dibujo por tamaño en pantalla: una pieza que mide menos de `RENDERMINPX` píxeles se dibuja como
 * un punto y no se evalúa su CSG (lo caro). Su "firma de tamaño" (esfera envolvente) sale de las hojas
 * paramétricas, sin CSG; se guarda en el `.cota` (D3) con la clave del contenido, así un cambio la invalida.
 * Sólo aplica a sólidos y mallas: las líneas y los textos ya son baratos de dibujar.
 */
export interface SizeSig {
  c: Vec3
  r: number
  /** Clave del contenido con que se calculó (si las props cambian, se recalcula). */
  k: string
}

/** D2: con más de estos objetos (o con sólidos costosos) se activa. */
export const LOD_MIN_ENTITIES = 2000
/** Histéresis: entra a "punto" por debajo del umbral y vuelve a "completa" por encima de umbral × 4/3. */
export const LOD_HYSTERESIS = 4 / 3

const COSTLY = new Set(['UNION', 'SUBTRACT', 'INTERSECT', 'FILLETEDGE', 'CHAMFEREDGE', 'SHELL', 'SWEEP', 'LOFT'])

/** ¿Sólido cuya geometría cuesta (booleanas, empalmes, barridos)? */
export const isCostlySolid = (p: SolidProps): boolean => COSTLY.has(p.op)

const memo = new Map<string, { c: Vec3; r: number }>()
const MEMO_MAX = 50000

function sphereOf(points: Iterable<Vec3>): { c: Vec3; r: number } | null {
  let [x0, y0, z0, x1, y1, z1] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
  for (const p of points) {
    x0 = Math.min(x0, p[0])
    y0 = Math.min(y0, p[1])
    z0 = Math.min(z0, p[2])
    x1 = Math.max(x1, p[0])
    y1 = Math.max(y1, p[1])
    z1 = Math.max(z1, p[2])
  }
  if (!isFinite(x0)) return null
  return { c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], r: Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 }
}

/** Clave del contenido geométrico de una entidad 3D. */
export const sizeKey = (e: Entity): string => `${e.type}:${JSON.stringify(e.props)}`

/**
 * Firma de tamaño de un sólido o una malla (null para el resto). Usa la guardada si su clave coincide;
 * si no, la calcula (wireframe paramétrico, sin CSG) y la memoriza.
 */
export function sizeSignature(e: Entity): SizeSig | null {
  if (e.type !== 'SOLID3D' && e.type !== 'MESH3D') return null
  const k = sizeKey(e)
  const saved = (e as { size?: SizeSig }).size
  if (saved && saved.k === k) return saved
  let s = memo.get(k)
  if (!s) {
    const pts = e.type === 'MESH3D' ? e.props.vertices : solidWireframe(e.props).flat()
    s = sphereOf(pts) ?? { c: [0, 0, 0], r: Infinity }
    if (memo.size > MEMO_MAX) memo.clear()
    memo.set(k, s)
  }
  return { c: s.c, r: s.r, k }
}

/** ¿Se activa el dibujo por tamaño? (umbral > 0 y escena grande o con sólidos costosos). */
export function lodActive(entities: Entity[], minPx: number): boolean {
  if (!(minPx > 0)) return false
  if (entities.length > LOD_MIN_ENTITIES) return true
  return entities.some((e) => e.type === 'SOLID3D' && isCostlySolid(e.props))
}

/** Clase con histéresis: true = se dibuja como punto. */
export function isSmall(px: number, minPx: number, prev: boolean | undefined): boolean {
  if (px < minPx) return true
  if (px > minPx * LOD_HYSTERESIS) return false
  return prev ?? false
}
