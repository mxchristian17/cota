import type { Vec3 } from '../../math'
import type { Entity } from '../../document/types'
import type { Command, CommandContext } from '../types'
import { Curve, boxesOverlap, curveOf, polylineCurve } from '../../geom/curve'
import { intersectCurves } from '../../geom/intersect'
import { cuttingCurves, extendCurve, nearestEnd, trimCurve, type EdgeOptions } from '../../editing/trim'
import { EditLog } from '../../editing/editLog'
import { pickCurve, ptVec } from '../../editing/pickCurve'
import { askKeyword } from '../ask'
import { sysvars } from '../sysvars'

type Mode = 'trim' | 'extend'

const edgeOptions = (): EdgeOptions => ({ extend: sysvars.EDGEMODE === 1, proj: sysvars.PROJMODE })
const other = (m: Mode): Mode => (m === 'trim' ? 'extend' : 'trim')

/**
 * Estado de una sesión de TRIM/EXTEND: aristas elegidas (null = todo el dibujo), registro
 * para `Undo` y el mapa de entidades reemplazadas, que permite seguir recortando con Fence/Crossing
 * los trozos que deja cada operación.
 */
class TrimSession {
  private readonly log: EditLog
  private readonly history: Array<string[] | null> = []
  private readonly replacedBy = new Map<string, string[]>()

  constructor(
    private readonly ctx: CommandContext,
    private edgeIds: string[] | null,
  ) {
    this.log = new EditLog(ctx.doc)
  }

  private edgeEntities(): Entity[] {
    if (!this.edgeIds) return this.ctx.doc.entities
    return this.edgeIds.map((id) => this.ctx.doc.getEntity(id)).filter((e): e is Entity => !!e)
  }

  /** Curvas de corte/contorno para `target`; al recortar sin prolongar, sólo las que la tocan. */
  private edgesFor(target: Entity, c: Curve, op: Mode, opt: EdgeOptions): Curve[] {
    const box = c.box()
    const out: Curve[] = []
    for (const e of this.edgeEntities()) {
      if (e.id === target.id) continue
      for (const cc of cuttingCurves(e)) if (op === 'extend' || opt.extend || boxesOverlap(box, cc.box())) out.push(cc)
    }
    return out
  }

  private replace(e: Entity, inputs: Array<{ type: string; props: unknown }>): void {
    const ids = this.log.replace(e, inputs as Parameters<EditLog['replace']>[1])
    this.replacedBy.set(e.id, ids)
    if (this.edgeIds?.includes(e.id)) this.edgeIds = this.edgeIds.flatMap((id) => (id === e.id ? ids : [id]))
  }

  /** Recorta o alarga `e` en el parámetro `t`. Devuelve false (con mensaje) si no se pudo. */
  apply(op: Mode, e: Entity, c: Curve, t: number, quiet = false): boolean {
    const opt = edgeOptions()
    const edges = this.edgesFor(e, c, op, opt)
    if (op === 'trim') {
      const pieces = trimCurve(c, edges, t, opt)
      if (!pieces) {
        if (!quiet) this.ctx.print('Object does not intersect an edge.')
        return false
      }
      this.replace(e, pieces.map((p) => p.toEntity()).filter((x) => x !== null))
      return true
    }
    if (c.closed) {
      if (!quiet) this.ctx.print('Cannot extend a closed object.')
      return false
    }
    const res = extendCurve(c, edges, nearestEnd(c, t), opt)?.toEntity()
    if (!res) {
      if (!quiet) this.ctx.print('No edge in that direction.')
      return false
    }
    this.replace(e, [res])
    return true
  }

  /** Ejecuta una operación (o un grupo, con Fence/Crossing) como un único paso deshacible. */
  step(fn: () => void): void {
    const size = this.log.size
    const snapshot = this.edgeIds ? [...this.edgeIds] : null
    fn()
    if (this.log.size > size) {
      this.log.squash(size)
      this.history.push(snapshot)
    }
  }

  undo(): void {
    if (!this.log.undo()) {
      this.ctx.print('All operations have been undone.')
      return
    }
    this.edgeIds = this.history.pop() ?? null
  }

  erase(ids: string[]): void {
    this.step(() => {
      this.log.erase(ids)
      if (this.edgeIds) this.edgeIds = this.edgeIds.filter((id) => !ids.includes(id))
    })
  }

  /** Trozo vigente (tras los reemplazos) de la entidad original `id` que pasa por `at`. */
  resolve(id: string, at: Vec3): { entity: Entity; curve: Curve } | null {
    const live = (x: string): string[] => (this.ctx.doc.getEntity(x) ? [x] : (this.replacedBy.get(x) ?? []).flatMap(live))
    for (const pid of live(id)) {
      const entity = this.ctx.doc.getEntity(pid) as Entity
      const curve = curveOf(entity)
      if (curve && curve.distanceTo(at) < 1e-6) return { entity, curve }
    }
    return null
  }
}

/** Opera sobre una lista de (entidad, punto) en orden, siguiendo los trozos que van quedando. */
function applyAll(s: TrimSession, op: Mode, items: Array<{ id: string; at: Vec3 }>): void {
  s.step(() => {
    for (const it of items) {
      const r = s.resolve(it.id, it.at)
      if (r) s.apply(op, r.entity, r.curve, r.curve.paramAt(it.at), true)
    }
  })
}

async function fence(ctx: CommandContext, s: TrimSession, op: Mode): Promise<void> {
  const first = await ctx.getPoint('Specify first fence point: ')
  if (first.kind !== 'point') return
  const pts: Vec3[] = [ptVec(first.point)]
  let last = first.point
  for (;;) {
    const r = await ctx.getPoint('Specify next fence point or [Undo]: ', { base: last, keywords: ['Undo'] })
    if (r.kind === 'keyword') {
      if (pts.length > 1) pts.pop()
      continue
    }
    if (r.kind !== 'point') break
    pts.push(ptVec(r.point))
    last = r.point
  }
  const f = polylineCurve(pts)
  if (!f) return
  const hits: Array<{ id: string; at: Vec3; s: number }> = []
  for (const e of ctx.doc.entities) {
    const c = curveOf(e)
    if (!c) continue
    for (const h of intersectCurves(c, f)) hits.push({ id: e.id, at: h.point, s: h.t2 })
  }
  applyAll(s, op, hits.sort((a, b) => a.s - b.s))
}

async function crossing(ctx: CommandContext, s: TrimSession, op: Mode): Promise<void> {
  const a = await ctx.getPoint('Specify first corner: ')
  if (a.kind !== 'point') return
  const b = await ctx.getPoint('Specify opposite corner: ', { base: a.point, corner: true })
  if (b.kind !== 'point') return
  const box = {
    minX: Math.min(a.point.x, b.point.x),
    maxX: Math.max(a.point.x, b.point.x),
    minY: Math.min(a.point.y, b.point.y),
    maxY: Math.max(a.point.y, b.point.y),
  }
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const items: Array<{ id: string; at: Vec3 }> = []
  for (const e of ctx.doc.entities) {
    const c = curveOf(e)
    if (!c || !boxesOverlap(box, c.box(), 0)) continue
    // El tramo afectado es el que pasa por la ventana: se toma su punto más cercano al centro.
    let best: Vec3 | null = null
    let bd = Infinity
    for (const p of c.samples(64)) {
      if (p[0] < box.minX || p[0] > box.maxX || p[1] < box.minY || p[1] > box.maxY) continue
      const d = Math.hypot(p[0] - cx, p[1] - cy)
      if (d < bd) {
        bd = d
        best = p
      }
    }
    if (best) items.push({ id: e.id, at: c.pointAt(c.paramAt(best)) })
  }
  applyAll(s, op, items)
}

async function setProjection(ctx: CommandContext): Promise<void> {
  const k = await askKeyword(ctx, `Enter a projection option [None/Ucs/View] <${sysvars.PROJMODE}>: `, ['None', 'Ucs', 'View'], sysvars.PROJMODE)
  if (k) sysvars.PROJMODE = k as typeof sysvars.PROJMODE
}

async function setEdgeMode(ctx: CommandContext): Promise<void> {
  const def = sysvars.EDGEMODE ? 'Extend' : 'No'
  const k = await askKeyword(ctx, `Enter an implied edge extension mode [Extend/No extend] <${def === 'No' ? 'No extend' : def}>: `, ['Extend', 'No'], def)
  if (k) sysvars.EDGEMODE = k === 'Extend' ? 1 : 0
}

/** Bucle común de TRIM y EXTEND (con shift-select cruzado, como el CAD clásico). */
async function runTrimExtend(ctx: CommandContext, mode: Mode): Promise<void> {
  ctx.print(`Current settings: Projection=${sysvars.PROJMODE.toUpperCase()}, Edge=${sysvars.EDGEMODE ? 'Extend' : 'None'}`)
  ctx.print(mode === 'trim' ? 'Select cutting edges ...' : 'Select boundary edges ...')
  const sel = await ctx.getSelection('Select objects or <select all>: ')
  if (sel === null) return
  ctx.app.clearSelection()
  const s = new TrimSession(ctx, sel.length ? sel : null)
  const prompt =
    mode === 'trim'
      ? 'Select object to trim or shift-select to extend or [Fence/Crossing/Project/Edge/eRase/Undo]: '
      : 'Select object to extend or shift-select to trim or [Fence/Crossing/Project/Edge/Undo]: '
  const keywords = mode === 'trim' ? ['Fence', 'Crossing', 'Project', 'Edge', 'eRase', 'Undo'] : ['Fence', 'Crossing', 'Project', 'Edge', 'Undo']
  for (;;) {
    const r = await ctx.getPoint(prompt, { keywords })
    if (r.kind === 'cancel') return
    if (r.kind === 'keyword') {
      if (r.keyword === 'Fence') await fence(ctx, s, mode)
      else if (r.keyword === 'Crossing') await crossing(ctx, s, mode)
      else if (r.keyword === 'Project') await setProjection(ctx)
      else if (r.keyword === 'Edge') await setEdgeMode(ctx)
      else if (r.keyword === 'Undo') s.undo()
      else if (r.keyword === 'eRase') {
        const ids = await ctx.getSelection('Select objects to erase: ')
        ctx.app.clearSelection()
        if (ids?.length) s.erase(ids)
      }
      continue
    }
    const pk = pickCurve(ctx.doc, r.point, r.pick)
    if (!pk) {
      ctx.print('No object found.')
      continue
    }
    const op = r.pick?.shift ? other(mode) : mode
    s.step(() => s.apply(op, pk.entity, pk.curve, pk.t))
  }
}

/**
 * TRIM: recorta cualquier curva 2D en sus aristas de corte, con las opciones del CAD clásico
 * (Fence/Crossing/Project/Edge/eRase/Undo). Shift+click alarga en vez de recortar.
 */
export const trimCommand: Command = {
  name: 'TRIM',
  planar: true,
  aliases: ['TR'],
  description: 'Trim objects to meet the edges of other objects (shift-select extends)',
  run: (ctx) => runTrimExtend(ctx, 'trim'),
}

/**
 * EXTEND: alarga curvas abiertas hasta los contornos, conservando su naturaleza (la línea
 * sigue recta, el arco su círculo, la polilínea su tramo extremo). Shift+click recorta.
 */
export const extendCommand: Command = {
  name: 'EXTEND',
  planar: true,
  aliases: ['EX'],
  description: 'Extend objects to meet the edges of other objects (shift-select trims)',
  run: (ctx) => runTrimExtend(ctx, 'extend'),
}
