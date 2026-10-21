import type { Layer, ViewportEntity } from '../../document/types'
import { LayerService } from '../../layers/LayerService'
import { layoutViewports } from '../../layout/layouts'
import { matchKeyword } from '../keywords'
import type { Command, CommandContext } from '../types'
import { ensurePaperSpace } from './mview'
import { pickViewport } from './vpclip'

const OPTIONS = ['?', 'Freeze', 'Thaw', 'Reset', 'Newfrz', 'Vpvisdflt']

/** Capas que coinciden con una lista `a,b*,c?` (comodines `*` y `?`, sin distinguir mayúsculas). */
export function matchLayers(layers: Layer[], text: string): { found: Layer[]; missing: string[] } {
  const found = new Set<Layer>()
  const missing: string[] = []
  for (const raw of text.split(',').map((t) => t.trim()).filter(Boolean)) {
    const re = new RegExp(`^${raw.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i')
    const hits = layers.filter((l) => re.test(l.name))
    if (hits.length) hits.forEach((l) => found.add(l))
    else missing.push(raw)
  }
  return { found: [...found], missing }
}

async function askLayers(ctx: CommandContext, prompt: string): Promise<Layer[] | null> {
  const text = await ctx.getString(prompt)
  if (!text?.trim()) return null
  const { found, missing } = matchLayers(ctx.doc.layers, text)
  for (const m of missing) ctx.print(`Layer "${m}" not found.`)
  return found.length ? found : null
}

/** `[All/Select/Current]`: viewports del layout a los que se aplica (Current = el de MSPACE). */
async function askViewports(ctx: CommandContext): Promise<ViewportEntity[] | null> {
  const text = await ctx.getString('Enter an option [All/Select/Current] <Current>: ', { default: '' })
  if (text === null) return null
  const opt = text.trim() ? matchKeyword(text, ['All', 'Select', 'Current']) : 'Current'
  if (opt === 'All') return layoutViewports(ctx.doc)
  if (opt === 'Current') {
    const id = ctx.doc.msViewportId
    if (!id) {
      ctx.print('No current viewport (you are in paper space): use Select or All.')
      return null
    }
    return layoutViewports(ctx.doc).filter((v) => v.id === id)
  }
  if (opt !== 'Select') {
    ctx.print('Invalid option.')
    return null
  }
  if (!ensurePaperSpace(ctx)) return null
  const ids = await ctx.getSelection('Select viewports: ')
  const vps = (ids ?? []).map((id) => ctx.doc.getEntity(id)).filter((e): e is ViewportEntity => e?.type === 'VIEWPORT')
  return vps.length ? vps : null
}

const freeze = (v: ViewportEntity, ids: string[]) => {
  v.props.frozenLayers = [...new Set([...v.props.frozenLayers, ...ids])]
}
const thaw = (v: ViewportEntity, ids: string[]) => {
  v.props.frozenLayers = v.props.frozenLayers.filter((id) => !ids.includes(id))
}

/**
 * VPLAYER: congela/descongela capas en viewports del layout (*VP Freeze*), lista las congeladas y fija
 * la visibilidad por defecto en viewports nuevos (*New VP Freeze*), como el CAD clásico.
 */
export const vplayerCommand: Command = {
  name: 'VPLAYER',
  aliases: [],
  description: 'Layer visibility per layout viewport [?/Freeze/Thaw/Reset/Newfrz/Vpvisdflt]',
  async run(ctx) {
    const doc = ctx.doc
    const text = await ctx.getString(`Enter an option [${OPTIONS.join('/')}]: `)
    if (!text?.trim()) return
    const opt = matchKeyword(text, OPTIONS)
    if (!opt) return ctx.print('Invalid option.')
    if (opt === 'Vpvisdflt') {
      const layers = await askLayers(ctx, 'Enter layer name(s) to change viewport visibility default: ')
      if (!layers) return
      const vis = await ctx.getString('Enter a viewport visibility option [Frozen/Thawed] <Thawed>: ', { default: '' })
      if (vis === null) return
      const frozen = matchKeyword(vis || 'Thawed', ['Frozen', 'Thawed']) === 'Frozen'
      const svc = new LayerService(doc)
      layers.forEach((l) => svc.setNewVpFreeze(l.id, frozen))
      return
    }
    if (opt === 'Newfrz') {
      const names = await ctx.getString('Enter name(s) of new layers frozen in all viewports: ')
      if (!names?.trim()) return
      const svc = new LayerService(doc)
      for (const name of names.split(',').map((n) => n.trim()).filter(Boolean)) {
        try {
          const l = svc.create(name, { newVpFreeze: true })
          for (const layout of doc.layouts) {
            for (const e of layout.entities) if (e.type === 'VIEWPORT') freeze(e, [l.id])
          }
        } catch (err) {
          ctx.print(err instanceof Error ? err.message : String(err))
        }
      }
      return
    }
    if (!doc.activeLayout) return ctx.print('** Command not allowed in Model Tab **')
    if (opt === '?') {
      const vp = doc.msViewportId
        ? layoutViewports(doc).find((v) => v.id === doc.msViewportId) ?? null
        : await pickViewport(ctx, 'Select a viewport: ')
      if (!vp) return
      const names = doc.layers.filter((l) => vp.props.frozenLayers.includes(l.id)).map((l) => l.name)
      ctx.print(names.length ? `Layers frozen in this viewport: ${names.join(', ')}` : 'No layers are frozen in this viewport.')
      return
    }
    const verb = opt === 'Freeze' ? 'freeze' : opt === 'Thaw' ? 'thaw' : 'reset'
    const layers = await askLayers(ctx, `Enter layer name(s) to ${verb}: `)
    if (!layers) return
    const vps = await askViewports(ctx)
    if (!vps) return
    const ids = layers.map((l) => l.id)
    for (const v of vps) {
      if (opt === 'Freeze') freeze(v, ids)
      else if (opt === 'Thaw') thaw(v, ids)
      else {
        // Reset: vuelve a la visibilidad por defecto de cada capa (New VP Freeze).
        thaw(v, ids)
        freeze(v, layers.filter((l) => l.newVpFreeze).map((l) => l.id))
      }
    }
    doc.touch()
  },
}
