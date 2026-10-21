import type { DocumentModel } from '../../document/DocumentModel'
import type { Entity } from '../../document/types'
import type { Command } from '../types'

/** Propiedades que copia `MATCHPROP` (sus *Property Settings*). */
export type MatchSetting = 'Layer' | 'Linetype' | 'LtScale' | 'Text' | 'Dimension' | 'Hatch' | 'Polyline'
const ALL: MatchSetting[] = ['Layer', 'Linetype', 'LtScale', 'Text', 'Dimension', 'Hatch', 'Polyline']

/** Ajustes activos de la sesión (en el CAD clásico se recuerdan entre usos del comando). */
const active = new Set<MatchSetting>(ALL)

/** Para tests: vuelve a los ajustes por defecto (todos activos). */
export function resetMatchSettings(): void {
  ALL.forEach((s) => active.add(s))
}

/**
 * Copia de `src` a `dst` las propiedades activas: capa; alto del texto (texto a texto); estilo de cota y
 * sus overrides (cota a cota). Devuelve true si cambió algo.
 */
export function matchProperties(doc: DocumentModel, src: Entity, dst: Entity, settings: Iterable<MatchSetting> = active): boolean {
  const on = new Set(settings)
  let changed = false
  if (on.has('Layer') && dst.layer !== src.layer) {
    dst.layer = src.layer
    changed = true
  }
  // Tipo de línea y su escala.
  if (on.has('Linetype') && dst.lineType !== src.lineType) {
    if (src.lineType === undefined) delete dst.lineType
    else dst.lineType = src.lineType
    changed = true
  }
  if (on.has('LtScale') && dst.ltScale !== src.ltScale) {
    if (src.ltScale === undefined) delete dst.ltScale
    else dst.ltScale = src.ltScale
    changed = true
  }
  // Sombreado: patrón, escala, ángulo, separación y estilo de islas (no el contorno).
  if (on.has('Hatch') && src.type === 'HATCH' && dst.type === 'HATCH') {
    const s = src.props
    Object.assign(dst.props, { pattern: s.pattern, scale: s.scale, angle: s.angle, spacing: s.spacing, double: s.double, island: s.island, custom: s.custom, imperial: s.imperial })
    for (const k of ['spacing', 'double', 'custom', 'imperial'] as const) if (dst.props[k] === undefined) delete dst.props[k]
    changed = true
  }
  // Polilínea: ancho y generación del tipo de línea (como el CAD clásico).
  if (on.has('Polyline') && src.type === 'POLYLINE' && dst.type === 'POLYLINE') {
    const w = src.props.widths
    const g = w?.[0]?.[0] ?? 0
    if (w && g > 0 && w.every(([a, b]) => a === g && b === g)) dst.props.widths = dst.props.vertices.map((): [number, number] => [g, g])
    else delete dst.props.widths
    if (src.props.ltGen) dst.props.ltGen = true
    else delete dst.props.ltGen
    changed = true
  }
  const isText = (e: Entity) => e.type === 'TEXT' || e.type === 'ATTDEF'
  if (on.has('Text') && isText(src) && isText(dst)) {
    const h = (src.props as { height: number }).height
    const d = dst.props as { height: number }
    if (d.height !== h) {
      d.height = h
      changed = true
    }
  }
  if (on.has('Dimension') && src.type === 'DIMENSION' && dst.type === 'DIMENSION') {
    doc.restyleDimension(dst.props, src.props.styleName ?? 'Standard', src.props.overrides ? { ...src.props.overrides } : undefined)
    changed = true
  }
  return changed
}

export const matchPropCommand: Command = {
  name: 'MATCHPROP',
  aliases: ['MA', 'PAINTER'],
  description: 'Copy properties (layer, linetype, linetype scale, text, dimension, hatch, polyline) from one object to others',
  async run(ctx) {
    let src: Entity | undefined
    while (!src) {
      const r = await ctx.getPoint('Select source object: ', { base: null })
      if (r.kind !== 'point') return
      src = r.pick?.id ? ctx.doc.getEntity(r.pick.id) : undefined
      if (!src) ctx.print('No object found.')
    }
    for (;;) {
      ctx.print(`Current active settings: ${ALL.filter((s) => active.has(s)).join(' ') || '(none)'}`)
      const r = await ctx.getSelectionOrKeyword('Select destination object(s) or [Settings]: ', ['Settings'])
      if (!r) return
      if (r.kind === 'keyword') {
        for (;;) {
          const t = await ctx.getString(`Toggle property [${ALL.map((s) => (active.has(s) ? s.toUpperCase() : s)).join('/')}] <done>: `, { default: '' })
          if (!t) break
          const k = ALL.find((s) => s.toLowerCase().startsWith(t.trim().toLowerCase()))
          if (!k) ctx.print('Invalid option.')
          else if (active.has(k)) active.delete(k)
          else active.add(k)
        }
        continue
      }
      let n = 0
      for (const id of r.ids) {
        const dst = ctx.doc.getEntity(id)
        if (dst && dst.id !== src.id && matchProperties(ctx.doc, src, dst)) n++
      }
      if (n) ctx.doc.touch()
      ctx.print(`${n} object(s) changed.`)
      return
    }
  },
}
