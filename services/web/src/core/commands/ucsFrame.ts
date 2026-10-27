import { keepCommon } from '../document/common'
import type { DocumentModel } from '../document/DocumentModel'
import type { Entity, EntityInput, SolidProps } from '../document/types'
import { fromVec3, type Pt, type Vec3 } from '../math'
import type { PreviewShape } from '../preview'
import { invertRigid, rigidDir, rigidFromUcs, rigidPoint, transformEntity, type Rigid } from '../editing/rigid'
import { WORLD_UCS, type Ucs } from '../ucs'
import type { CommandContext, GetAngleOptions, GetDistanceOptions, GetPointOptions, PointResult } from './types'

/**
 * Comandos 2D en el marco de la UCS. El CAD clásico dibuja y edita en el plano XY de la UCS con los
 * ángulos medidos desde su X; los algoritmos de Cota (arcos, polígonos, FILLET, TRIM, OFFSET…) están
 * escritos en el XY del mundo. Este contexto los corre en coordenadas de la UCS: el documento entrega
 * copias de las entidades llevadas al marco local, los puntos del usuario llegan en coordenadas locales
 * y lo que el comando agrega o modifica vuelve al mundo. Con la UCS universal no se usa.
 */
const FLUSH = Symbol('flushFrame')

export function frameContext(ctx: CommandContext, ucs: Ucs): CommandContext {
  const toWorld = rigidFromUcs(ucs)
  const toLocal = invertRigid(toWorld)
  const L = (p: Pt): Pt => fromVec3(rigidPoint(toLocal, [p.x, p.y, p.z]))
  const W = (p: Pt): Pt => fromVec3(rigidPoint(toWorld, [p.x, p.y, p.z]))
  const LV = (v: Vec3): Vec3 => rigidPoint(toLocal, v)
  const doc = frameDocument(ctx.doc, toLocal, toWorld)

  const shapeToWorld = (s: PreviewShape): PreviewShape =>
    s.kind === 'line'
      ? { kind: 'line', a: W(s.a), b: W(s.b) }
      : s.kind === 'polyline'
        ? { kind: 'polyline', points: s.points.map(W) }
        : s.kind === 'solid'
          ? solidToWorld(s.props)
          : { kind: 'circle', center: W(s.center), radius: s.radius, normal: rigidDir(toWorld, s.normal ?? [0, 0, 1]) }
  const solidToWorld = (props: SolidProps): PreviewShape => {
    const w = transformEntity({ id: '', type: 'SOLID3D', layer: '', props } as Entity, toWorld)
    return { kind: 'solid', props: (w?.props as SolidProps | undefined) ?? props }
  }
  const preview = <T extends { preview?: (c: Pt) => PreviewShape[] }>(o: T): T['preview'] =>
    o.preview && ((c: Pt) => o.preview!(L(c)).map(shapeToWorld))

  const pointOpts = (o?: GetPointOptions): GetPointOptions | undefined =>
    o && { ...o, ...(o.base ? { base: W(o.base) } : {}), preview: preview(o) }

  const pointResult = (r: PointResult): PointResult => {
    if (r.kind !== 'point') return r
    const pick = r.pick && {
      ...r.pick,
      raw: L(r.pick.raw),
      ...(r.pick.deferred ? { deferred: { ...r.pick.deferred, hint: LV(r.pick.deferred.hint), obj: deferredObj(r.pick.deferred.obj, LV, (d) => rigidDir(toLocal, d)) } } : {}),
    }
    return { kind: 'point', point: L(r.point), ...(pick ? { pick } : {}) }
  }

  const app = new Proxy(ctx.app, {
    get(target, prop) {
      // En el marco local la UCS es la universal: el plano de dibujo es XY y su normal +Z.
      if (prop === 'constructionNormal' || prop === 'facingNormal') return () => [0, 0, 1]
      if (prop === 'getUcs') return () => ({ ...WORLD_UCS })
      if (prop === 'viewRay')
        return (p: Pt) => {
          const r = target.viewRay?.(W(p))
          return r && { origin: rigidPoint(toLocal, r.origin), dir: rigidDir(toLocal, r.dir), tol: r.tol }
        }
      const v = Reflect.get(target, prop, target)
      return typeof v === 'function' ? v.bind(target) : v
    },
  })

  return {
    ...ctx,
    app,
    doc,
    getPoint: async (prompt, opts) => pointResult(await ctx.getPoint(prompt, pointOpts(opts))),
    getDistance: (prompt, opts: GetDistanceOptions) =>
      ctx.getDistance(prompt, { ...opts, base: W(opts.base), preview: preview(opts), measure: opts.measure ? (p) => opts.measure!(L(p)) : undefined }),
    getAngle: (prompt, opts: GetAngleOptions) =>
      ctx.getAngle(prompt, { ...opts, base: W(opts.base), ...(opts.relativeTo ? { relativeTo: W(opts.relativeTo) } : {}), preview: preview(opts) }),
  }
}

function deferredObj<T extends { kind: string }>(o: T, LV: (v: Vec3) => Vec3, LD: (v: Vec3) => Vec3): T {
  const x = o as unknown as { kind: string; a?: Vec3; b?: Vec3; c?: Vec3; n?: Vec3; p?: Vec3 }
  if (x.kind === 'line') return { ...o, a: LV(x.a!), b: LV(x.b!) }
  if (x.kind === 'circle') return { ...o, c: LV(x.c!), ...(x.n ? { n: LD(x.n) } : {}) }
  return { ...o, p: LV(x.p!) }
}

/**
 * Documento visto en el marco local: `entities`/`getEntity` entregan copias transformadas (las mismas
 * mientras dure el comando, así una mutación en el lugar + `touch()` funciona), `addEntity` lleva lo
 * nuevo al mundo y `touch()` devuelve al mundo las copias que cambiaron.
 */
function frameDocument(doc: DocumentModel, toLocal: Rigid, toWorld: Rigid): DocumentModel {
  const slots = new Map<string, { local: Entity; snap: string }>()
  const key = (e: Entity) => e.type + JSON.stringify(e.props)
  const localOf = (e: Entity): Entity => {
    const s = slots.get(e.id)
    if (s) return s.local
    const t = transformEntity(e, toLocal)
    if (!t) return e // no transformable (p. ej. un INSERT fuera de su plano): se ve tal cual
    const local = { ...t, id: e.id } as Entity
    slots.set(e.id, { local, snap: key(local) })
    return local
  }
  const flush = (): boolean => {
    let changed = false
    for (const [id, s] of slots) {
      const k = key(s.local)
      if (k === s.snap) continue
      const real = doc.getEntity(id)
      if (!real) {
        slots.delete(id)
        continue
      }
      const w = transformEntity(s.local, toWorld)
      if (!w) continue
      ;(real as { type: string }).type = w.type
      ;(real as { props: unknown }).props = w.props
      s.snap = k
      changed = true
    }
    return changed
  }
  const overrides: Record<string | symbol, unknown> = {
    getEntity: (id: string) => {
      const e = doc.getEntity(id)
      return e && localOf(e)
    },
    addEntity: (input: EntityInput) => {
      const w = transformEntity({ ...input, id: '' } as Entity, toWorld)
      const real = doc.addEntity(w ? keepCommon(w, input) : input)
      return localOf(real)
    },
    removeEntity: (id: string) => {
      slots.delete(id)
      return doc.removeEntity(id)
    },
    touch: () => {
      flush()
      doc.touch()
    },
    [FLUSH]: () => {
      if (flush()) doc.touch()
    },
  }
  return new Proxy(doc, {
    get(target, prop) {
      if (prop in overrides) return overrides[prop]
      if (prop === 'entities') return target.entities.map(localOf)
      if (prop === 'modelEntities') return target.modelEntities.map(localOf)
      const v = Reflect.get(target, prop, target)
      return typeof v === 'function' ? v.bind(target) : v
    },
  })
}

/** Al terminar un comando en el marco: vuelca lo que haya quedado modificado sin `touch()`. */
export function flushFrame(ctx: CommandContext): void {
  ;(ctx.doc as unknown as Record<symbol, (() => void) | undefined>)[FLUSH]?.()
}
