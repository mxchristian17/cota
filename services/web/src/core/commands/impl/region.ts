import type { Entity, HatchLoop } from '../../document/types'
import type { Command } from '../types'
import { commonOf } from '../../document/common'
import { Curve, curveOf } from '../../geom/curve'
import { loopOfCurve } from '../../hatch/boundary'

/**
 * REGION (REG) como el CAD clásico: cada contorno cerrado de los objetos elegidos se convierte en una región. Sirven
 * los objetos cerrados (polilíneas, círculos, elipses, rectángulos, splines) y las cadenas de líneas, arcos y
 * polilíneas abiertas que se cierran punta con punta en un mismo plano. Los objetos de origen se borran (DELOBJ).
 * Trabaja en el plano XY de la UCS actual.
 */
export const regionCommand: Command = {
  name: 'REGION',
  planar: true,
  aliases: ['REG'],
  description: 'Convert closed objects and closed chains of lines and arcs into regions',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (!ids?.length) return
    const ents = ids.map((id) => ctx.doc.getEntity(id)).filter((e): e is Entity => !!e)
    const found = extractLoops(ents)
    ctx.print(`${found.length} loop${found.length === 1 ? '' : 's'} extracted.`)
    for (const f of found) {
      ctx.doc.addEntity({ type: 'REGION', layer: f.source.layer, props: { loops: [f.loop] }, ...commonOf(f.source) })
      for (const id of f.ids) ctx.doc.removeEntity(id)
    }
    ctx.print(`${found.length} Region${found.length === 1 ? '' : 's'} created.`)
    ctx.app.clearSelection()
    if (found.length) ctx.doc.touch()
  },
}

/** Lazo encontrado: su contorno, los objetos que lo forman y el que da capa y propiedades. */
interface FoundLoop {
  loop: HatchLoop
  ids: string[]
  source: Entity
}

/** Lazos cerrados de los objetos (en planta, a una misma altura cada uno). */
export function extractLoops(ents: Entity[]): FoundLoop[] {
  const out: FoundLoop[] = []
  const open: Array<{ e: Entity; c: Curve }> = []
  for (const e of ents) {
    const c = curveOf(e)
    if (!c || !flatCurve(c)) continue
    if (c.closed) {
      const loop = loopOfCurve(c)
      if (loop) out.push({ loop, ids: [e.id], source: e })
    } else open.push({ e, c })
  }
  out.push(...closedChains(open))
  return out
}

/** ¿Toda la curva a una misma altura? (sus extremos y puntos intermedios) */
function flatCurve(c: Curve): boolean {
  const pts = c.samples(8)
  const z = pts[0]?.[2] ?? 0
  const tol = 1e-6 * Math.max(1, ...pts.map((p) => Math.abs(p[0]) + Math.abs(p[1])))
  return pts.every((p) => Math.abs(p[2] - z) <= tol)
}

/** Cadenas de curvas abiertas que se cierran punta con punta (cada curva se usa una vez). */
function closedChains(items: Array<{ e: Entity; c: Curve }>): FoundLoop[] {
  if (!items.length) return []
  const span = Math.max(1, ...items.flatMap(({ c }) => [...c.start, ...c.end].map(Math.abs)))
  const tol = 1e-6 * span
  const same = (a: readonly number[], b: readonly number[]): boolean => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= tol
  const used = new Set<number>()
  const out: FoundLoop[] = []
  for (let s = 0; s < items.length; s++) {
    if (used.has(s)) continue
    // Una polilínea o spline abierta que vuelve a su punto de partida ya es un lazo.
    const first = items[s].c
    if (first.n > 1 && same(first.start, first.end)) {
      const loop = loopOfCurve(new Curve('POLYLINE', first.prims, true))
      if (loop) {
        used.add(s)
        out.push({ loop, ids: [items[s].e.id], source: items[s].e })
      }
      continue
    }
    const chain = [items[s].c]
    const idx = [s]
    let end = items[s].c.end
    // Sigue de punta en punta mientras haya una curva libre que empiece (o termine) donde terminó la anterior.
    for (;;) {
      if (same(end, items[s].c.start)) break
      const k = items.findIndex((it, i) => !used.has(i) && !idx.includes(i) && (same(it.c.start, end) || same(it.c.end, end)))
      if (k < 0) break
      const c = same(items[k].c.start, end) ? items[k].c : items[k].c.reverse()
      chain.push(c)
      idx.push(k)
      end = c.end
    }
    if (chain.length < 2 || !same(end, items[s].c.start)) continue
    const loop = loopOfCurve(new Curve('POLYLINE', chain.flatMap((c) => c.prims), true))
    if (!loop) continue
    for (const i of idx) used.add(i)
    out.push({ loop, ids: idx.map((i) => items[i].e.id), source: items[s].e })
  }
  return out
}
