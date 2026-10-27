import { commonOf } from '../../document/common'
import { layerShown } from '../../layers/visibility'
import { toVec3, type Pt, type Vec3 } from '../../math'
import type { Entity } from '../../document/types'
import { entityPreviewShapes } from '../../editing/entityPreview'
import { applyStretch, stretchBox, stretchEntity, type StretchBox } from '../../editing/stretch'
import type { PreviewShape } from '../../preview'
import type { Command, CommandContext } from '../types'

/** Rectángulo de la ventana de cruce, como preview mientras se indica la segunda esquina. */
function boxPreview(a: Pt, c: Pt): PreviewShape[] {
  return [
    {
      kind: 'polyline',
      points: [a, { x: c.x, y: a.y, z: a.z }, c, { x: a.x, y: c.y, z: a.z }, a],
    },
  ]
}

/** Fantasma del resultado estirado (misma lógica que el commit, sin mutar el documento). */
function stretchPreview(ctx: CommandContext, ids: string[], box: StretchBox, base: Pt, cursor: Pt): PreviewShape[] {
  const d: Vec3 = [cursor.x - base.x, cursor.y - base.y, cursor.z - base.z]
  const shapes: PreviewShape[] = [{ kind: 'line', a: base, b: cursor }]
  for (const id of ids) {
    const e = ctx.doc.getEntity(id)
    if (!e) continue
    const outcome = stretchEntity(e, box, d)
    if (outcome.kind === 'none') continue
    if (outcome.kind === 'move') {
      shapes.push(...entityPreviewShapes(e, d[0], d[1], d[2]))
    } else {
      shapes.push(...entityPreviewShapes({ ...outcome.input, id: e.id } as Entity, 0, 0, 0))
    }
  }
  return shapes
}

export const stretchCommand: Command = {
  name: 'STRETCH',
  aliases: ['S'],
  description: 'Stretch objects crossed by a window (vertices inside the window move)',
  async run(ctx) {
    // El CAD clásico exige una ventana de CRUCE: acá se indica con sus dos esquinas (click o coordenadas),
    // así el comando es determinista en cualquier vista.
    const c1 = await ctx.getPoint('Specify first corner of crossing window: ')
    if (c1.kind !== 'point') return
    const c2 = await ctx.getPoint('Specify opposite corner: ', {
      base: c1.point,
      corner: true,
      preview: (c) => boxPreview(c1.point, c),
    })
    if (c2.kind !== 'point') return
    const box = stretchBox(toVec3(c1.point), toVec3(c2.point))

    // Entidades tocadas por la ventana: `stretchEntity` devuelve 'none' cuando ningún punto de la
    // entidad cae dentro, así que sirve como test de cruce (el desplazamiento de prueba es irrelevante).
    // Se excluyen las capas bloqueadas u ocultas, como en el resto de la edición.
    const editable = new Set(ctx.doc.layers.filter((l) => layerShown(l) && !l.locked).map((l) => l.id))
    const ids: string[] = []
    for (const e of ctx.doc.entities) {
      if (!editable.has(e.layer)) continue
      if (stretchEntity(e, box, [1, 1, 0]).kind !== 'none') ids.push(e.id)
    }
    if (ids.length === 0) {
      ctx.print('No objects found inside the crossing window.')
      return
    }
    ctx.print(`${ids.length} object(s) found.`)
    ctx.highlight(ids)

    const basePt = await ctx.getPoint('Specify base point: ')
    if (basePt.kind !== 'point') return
    const dest = await ctx.getPoint('Specify second point: ', {
      base: basePt.point,
      preview: (c) => stretchPreview(ctx, ids, box, basePt.point, c),
    })
    if (dest.kind !== 'point') return
    const d: Vec3 = [dest.point.x - basePt.point.x, dest.point.y - basePt.point.y, dest.point.z - basePt.point.z]
    if (Math.hypot(d[0], d[1], d[2]) < 1e-12) {
      ctx.print('Zero displacement: nothing changed.')
      return
    }

    let stretched = 0
    let movedCount = 0
    for (const id of ids) {
      const e = ctx.doc.getEntity(id)
      if (!e) continue
      const outcome = stretchEntity(e, box, d)
      const applied = applyStretch(e, outcome, d)
      if (applied === 'moved') movedCount++
      else if (applied === 'stretched') stretched++
      else if (applied === 'replaced' && outcome.kind === 'replace') {
        // Cambió de tipo (p. ej. RECTANGLE deformado → POLYLINE): se reemplaza la entidad.
        ctx.doc.removeEntity(id)
        ctx.doc.addEntity({ ...outcome.input, ...commonOf(e) })
        stretched++
      }
    }
    ctx.doc.touch()
    ctx.app.clearSelection()
    ctx.print(`Stretched ${stretched} object(s), moved ${movedCount}.`)
  },
}
