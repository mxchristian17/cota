import { profileOf, profileNormal } from '../../editing/extrude'
import type { SolidProps } from '../../document/types'
import type { Vec3 } from '../../math'
import type { Command } from '../types'
import { askDistance } from '../ask'
import { DEFAULT_SEGMENTS, viewZ } from './primitives'

/** Perfil extruible: un círculo se vuelve CYLINDER paramétrico (conserva su centro). */
type Extrudable = { id: string; profile?: Vec3[]; circle?: { center: Vec3; radius: number; normal: Vec3 } }

/** Orienta `axis` para que la extrusión positiva vaya hacia el lado de la vista actual (intuitivo). */
function orientAxis(axis: Vec3, towards: Vec3): Vec3 {
  const d = axis[0] * towards[0] + axis[1] * towards[1] + axis[2] * towards[2]
  return d < 0 ? [-axis[0], -axis[1], -axis[2]] : axis
}

export const extrudeCommand: Command = {
  name: 'EXTRUDE',
  planar: true,
  aliases: ['EXT'],
  description: 'Extrude a closed 2D profile into a solid (a circle becomes a parametric cylinder)',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects to extrude: ')
    if (ids === null || ids.length === 0) return

    const items: Extrudable[] = []
    for (const id of ids) {
      const e = ctx.doc.getEntity(id)
      if (!e) continue
      if (e.type === 'CIRCLE') {
        items.push({ id, circle: { center: e.props.center, radius: e.props.radius, normal: e.props.normal } })
        continue
      }
      const p = profileOf(e)
      if (p) items.push({ id, profile: p })
    }
    if (items.length === 0) {
      ctx.print('No closed profile selected (use RECTANGLE, closed PLINE or CIRCLE).')
      return
    }

    const height = await askDistance(ctx, 'EXTRUDE.height', 'Specify height of extrusion', {
      base: { x: 0, y: 0, z: 0 },
      valid: (v) => v !== 0,
    })
    if (height.kind !== 'distance') return
    if (height.value === 0) {
      ctx.print('Invalid height.')
      return
    }

    // La extrusión es perpendicular al plano del perfil (no siempre +Z), orientada hacia la vista actual.
    const view = viewZ(ctx) // hacia el observador: la altura positiva crece hacia quien mira
    for (const it of items) {
      // Un círculo extruido = cilindro paramétrico (centro conservado, render liso, sin facetado en snaps).
      const props: SolidProps = it.circle
        ? {
            op: 'CYLINDER',
            base: it.circle.center,
            radius: it.circle.radius,
            height: height.value,
            segments: DEFAULT_SEGMENTS,
            axis: orientAxis(it.circle.normal, view),
          }
        : { op: 'EXTRUDE', profile: it.profile as Vec3[], height: height.value, axis: orientAxis(profileNormal(it.profile as Vec3[]), view) }
      ctx.doc.addEntity({ type: 'SOLID3D', layer: ctx.currentLayerId(), props })
      ctx.doc.removeEntity(it.id) // el perfil se consume
    }
    ctx.app.clearSelection()
    ctx.print(`Extruded ${items.length} profile(s).`)
  },
}
