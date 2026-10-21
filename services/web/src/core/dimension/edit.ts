import type { Vec3 } from '../math'
import type { DimensionProps } from '../document/types'
import { angularSector, dimDisplay, fixLinearRotation } from './dimGeometry'

/** Edición de cotas existentes: `DIMSPACE`, `DIMBREAK Manual`, `DIMJOGLINE`. */

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
const norm = (a: Vec3): Vec3 => scale(a, 1 / (len(a) || 1))
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** Línea de cota de una lineal/alineada: extremo, dirección, largo y normal; null para otros tipos. */
export function dimLine(p: DimensionProps): { e1: Vec3; dir: Vec3; L: number; n: Vec3 } | null {
  const d = dimDisplay(p)
  if (!d.handles) return null
  const v = sub(d.handles[1], d.handles[0])
  return { e1: d.handles[0], dir: norm(v), L: len(v), n: d.normal }
}

/** Desplaza toda la línea de cota (y el texto movido, si lo hay) en `delta`. */
function shift(p: DimensionProps, delta: Vec3): void {
  fixLinearRotation(p)
  p.textPos = add(p.textPos, delta)
  if (p.textAt) p.textAt = add(p.textAt, delta)
}

/** Orden de apilado: primero las del lado positivo (de la más cercana a la más lejana), después las del negativo. */
function stack<T>(items: Array<{ item: T; s: number }>, spacing: number, base: number): Array<{ item: T; to: number }> {
  const pos = items.filter((x) => x.s >= base - 1e-9).sort((a, b) => a.s - b.s)
  const neg = items.filter((x) => x.s < base - 1e-9).sort((a, b) => b.s - a.s)
  return [...pos.map((x, i) => ({ item: x.item, to: base + (i + 1) * spacing })), ...neg.map((x, i) => ({ item: x.item, to: base - (i + 1) * spacing }))]
}

/**
 * `DIMSPACE`: espacia parejo (o alinea, con 0) cotas paralelas respecto de una base. Lineales/alineadas
 * paralelas a la base y en su plano; angulares con el mismo vértice. Devuelve cuántas movió.
 */
export function spaceDimensions(base: DimensionProps, others: DimensionProps[], spacing: number): number {
  const bl = dimLine(base)
  if (bl) {
    const v = norm(cross(bl.n, bl.dir))
    const s0 = dot(bl.e1, v)
    const items: Array<{ item: DimensionProps; s: number }> = []
    for (const o of others) {
      const ol = dimLine(o)
      if (!ol || Math.abs(Math.abs(dot(ol.dir, bl.dir)) - 1) > 1e-6 || Math.abs(Math.abs(dot(ol.n, bl.n)) - 1) > 1e-6) continue
      items.push({ item: o, s: dot(ol.e1, v) })
    }
    // Las cotas se apilan alejándose de la geometría: el lado positivo es hacia donde está la base.
    const side = Math.sign(dot(sub(bl.e1, base.points[0]), v)) || 1
    const moved = stack(items.map((x) => ({ item: x.item, s: (x.s - s0) * side })), spacing, 0)
    for (const m of moved) shift(m.item, scale(v, (m.to - (dot(dimLine(m.item)!.e1, v) - s0) * side) * side))
    return moved.length
  }
  if (base.dimType !== 'ANGULAR' && base.dimType !== 'ARCLEN') return 0
  const bs = angularSector(base)
  const rOf = (p: DimensionProps) => len(sub(p.textPos, angularSector(p).c))
  const r0 = rOf(base)
  const items = others
    .filter((o) => (o.dimType === 'ANGULAR' || o.dimType === 'ARCLEN') && len(sub(angularSector(o).c, bs.c)) < 1e-6)
    .map((o) => ({ item: o, s: rOf(o) }))
  const moved = stack(items, spacing, r0).map((m) => ({ ...m, to: Math.max(m.to, spacing) }))
  for (const m of moved) {
    const c = angularSector(m.item).c
    const d = norm(sub(m.item.textPos, c))
    m.item.textPos = add(c, scale(d, m.to))
    delete m.item.textAt
  }
  return moved.length
}

/** `DIMBREAK Manual`: corta la línea de cota entre las proyecciones de `a` y `b`. */
export function addManualBreak(p: DimensionProps, a: Vec3, b: Vec3): boolean {
  const l = dimLine(p)
  if (!l) return false
  const t0 = dot(sub(a, l.e1), l.dir)
  const t1 = dot(sub(b, l.e1), l.dir)
  p.breaks = [...(p.breaks ?? []), [Math.min(t0, t1), Math.max(t0, t1)]]
  return true
}

/**
 * `DIMJOGLINE`: quiebre en la línea de cota, en la proyección de `at` o, sin punto, a mitad de camino
 * entre la primera línea de referencia y el texto (como el CAD clásico).
 */
export function setJog(p: DimensionProps, at?: Vec3): boolean {
  const l = dimLine(p)
  if (!l) return false
  const t = at ? dot(sub(at, l.e1), l.dir) : Math.min(Math.max(dot(sub(dimDisplay(p).text.pos, l.e1), l.dir), 0), l.L) / 2
  p.jog = Math.min(Math.max(t, 0), l.L)
  return true
}
