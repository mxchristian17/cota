import type { Command } from '../types'
import type { Entity } from '../../document/types'
import type { Vec3 } from '../../math'
import { basisFromAzEl } from '../../drawing/views'
import { planeAngle } from '../../editing/rigid'
import { askKeyword } from '../ask'

/**
 * SOLPROF, como el CAD clásico: perfiles 2D de los sólidos elegidos vistos desde el viewport del layout en
 * el que se está trabajando (MSPACE). Las líneas visibles van en un bloque sobre la capa `PV-<viewport>` y,
 * si se pide, las ocultas en otro sobre `PH-<viewport>` (tipo HIDDEN); esas capas se congelan en los demás
 * viewports, así el perfil se ve sólo en el suyo. Con *Project = Yes* las líneas quedan en el plano
 * perpendicular a la vista que pasa por el origen de la UCS; con *No*, en 3D sobre las aristas.
 */
export const solprofCommand: Command = {
  name: 'SOLPROF',
  aliases: [],
  description: 'Create profile images of 3D solids for a layout viewport (visible and hidden lines)',
  async run(ctx) {
    const vpId = ctx.doc.msViewportId
    const vp = vpId ? ctx.doc.activeLayout?.entities.find((e) => e.id === vpId) : undefined
    if (!vp || vp.type !== 'VIEWPORT') {
      ctx.print('** Command only valid in a layout viewport (MSPACE).')
      return
    }
    const picked = await ctx.getSelection('Select objects: ')
    if (!picked || picked.length === 0) return
    const ids = picked.filter((id) => {
      const t = ctx.doc.getEntity(id)?.type
      return t === 'SOLID3D' || t === 'MESH3D' || t === 'INSERT'
    })
    if (ids.length === 0) {
      ctx.print('No 3D solids selected.')
      return
    }
    const yes = async (prompt: string) => {
      const k = await askKeyword(ctx, `${prompt} [Yes/No] <Y>: `, ['Yes', 'No'], 'Yes')
      return k === null ? null : k === 'Yes'
    }
    const separate = await yes('Display hidden profile lines on separate layer?')
    if (separate === null) return
    const project = await yes('Project profile lines onto a plane?')
    if (project === null) return
    const deleteTangent = await yes('Delete tangential edges?')
    if (deleteTangent === null) return

    const basis = basisFromAzEl(vp.props.az, vp.props.el)
    const pv = ctx.app.ensureLayer?.(`PV-${vpId}`) ?? ctx.currentLayerId()
    const ph = separate ? (ctx.app.ensureLayer?.(`PH-${vpId}`, 'HIDDEN') ?? pv) : pv
    const visible: Entity[] = []
    const hidden: Entity[] = []
    let n = 0
    const push = (list: Entity[], e: Omit<Entity, 'id'>) => list.push({ ...e, id: `p${++n}` } as Entity)

    if (project) {
      const items = ctx.app.projectModel?.(ids, basis, { showObscured: true, tangential: !deleteTangent }) ?? []
      const at = (p: [number, number]): Vec3 => [p[0], p[1], 0]
      for (const it of items) {
        const list = it.hidden && separate ? hidden : visible
        const layer = it.hidden && separate ? ph : pv
        if (it.kind === 'line') push(list, { type: 'LINE', layer, props: { start: at(it.a), end: at(it.b) } } as Omit<Entity, 'id'>)
        else if (it.kind === 'circle') push(list, { type: 'CIRCLE', layer, props: { center: at(it.c), radius: it.r, normal: [0, 0, 1] } } as Omit<Entity, 'id'>)
        else push(list, { type: 'ARC', layer, props: { center: at(it.c), radius: it.r, startAngle: it.a0, endAngle: it.a1, normal: [0, 0, 1] } } as Omit<Entity, 'id'>)
      }
    } else {
      for (const s of ctx.app.projectSegments?.(ids, basis, !deleteTangent) ?? []) {
        if (!s.a3 || !s.b3) continue
        const list = s.hidden && separate ? hidden : visible
        push(list, { type: 'LINE', layer: s.hidden && separate ? ph : pv, props: { start: s.a3, end: s.b3 } } as Omit<Entity, 'id'>)
      }
    }
    if (visible.length + hidden.length === 0) {
      ctx.print('Nothing to profile.')
      return
    }

    // Proyectadas: el bloque va en el plano perpendicular a la vista que pasa por el origen de la UCS, con su
    // X sobre la derecha de la vista (normal del bloque = hacia el observador).
    const o = ctx.app.getUcs?.()?.origin ?? { x: 0, y: 0, z: 0 }
    const d = o.x * basis.out[0] + o.y * basis.out[1] + o.z * basis.out[2]
    const place = project
      ? { position: [basis.out[0] * d, basis.out[1] * d, basis.out[2] * d] as Vec3, rotation: planeAngle(basis.out, basis.right), normal: basis.out }
      : { position: [0, 0, 0] as Vec3, rotation: 0 }
    const insert = (entities: Entity[], layer: string) => {
      if (!entities.length) return
      const used = new Set(ctx.doc.blocks.map((b) => b.name))
      let i = 1
      while (used.has(`*U${i}`)) i++
      ctx.doc.setBlock({ name: `*U${i}`, entities })
      ctx.doc.addEntity({ type: 'INSERT', layer, props: { name: `*U${i}`, scale: [1, 1, 1], ...place } })
    }
    insert(visible, pv)
    insert(hidden, ph)

    // Se ven sólo en este viewport: congeladas en los demás (como el CAD clásico).
    for (const l of ctx.doc.layouts) {
      for (const e of l.entities) {
        if (e.type !== 'VIEWPORT' || e.id === vpId) continue
        const fl = new Set(e.props.frozenLayers)
        for (const id of new Set([pv, ph])) fl.add(id)
        e.props.frozenLayers = [...fl]
      }
    }
    ctx.doc.touch()
    ctx.print(`Profile created: ${visible.length} visible and ${hidden.length} hidden line(s) on layers PV-${vpId}${separate ? ` / PH-${vpId}` : ''}.`)
    ctx.print('Freeze the layer of the solids in this viewport (VPLAYER) to see only the profile.')
  },
}
