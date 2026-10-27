import type { NamedView, ViewName, ViewState } from '../../view'
import type { Command, CommandContext } from '../types'
import { askKeyword } from '../ask'
import { matchKeyword } from '../keywords'
import { sysvars } from '../sysvars'
import { normalizeUcs, ucsToDef } from '../../ucs'

const STANDARD = ['Top', 'Bottom', 'Front', 'BAck', 'Left', 'Right', 'SWiso', 'SEiso', 'NEiso', 'NWiso']
/** Opciones de -VIEW del CAD clásico (van primero: `R` es Restore, como en el CAD clásico; las vistas, con su nombre). */
const OPTIONS = ['?', 'Delete', 'Orthographic', 'Restore', 'Save', 'Window']

/** Vista estándar por su nombre tecleado (o `Iso`, histórico de Cota = SEiso). */
function standardView(k: string): ViewName | null {
  const up = k.toUpperCase()
  if (up === 'SEISO' || up === 'ISO') return 'ISO'
  return (['TOP', 'BOTTOM', 'FRONT', 'BACK', 'LEFT', 'RIGHT', 'SWISO', 'NEISO', 'NWISO'] as const).find((v) => v === up) ?? null
}

/** Guarda la vista actual (o la de una ventana) con su UCS (UCSVIEW = 1). */
function saveView(ctx: CommandContext, name: string, view: ViewState): void {
  const u = ctx.app.getUcs?.()
  const nv: NamedView = { name, view }
  if (sysvars.UCSVIEW && u) nv.ucs = ucsToDef(u)
  const existed = !!ctx.doc.getNamedView(name)
  ctx.doc.saveNamedView(nv)
  ctx.print(existed ? `View "${name}" replaced.` : `View "${name}" saved.`)
}

/** Restaura una vista guardada (y su UCS, si la guardó). */
function restoreView(ctx: CommandContext, nv: NamedView): void {
  ctx.app.restoreViewState?.(nv.view)
  if (nv.ucs) ctx.app.setUcs(normalizeUcs(nv.ucs))
  ctx.print(`Restoring view "${nv.name}".`)
}

async function askName(ctx: CommandContext, prompt: string): Promise<string | null> {
  const s = (await ctx.getString(prompt))?.trim()
  if (!s) return null
  if (!/^[\w\- $]{1,255}$/.test(s)) {
    ctx.print('Invalid view name.')
    return null
  }
  return s
}

/**
 * VIEW / -VIEW: vistas estándar y vistas guardadas, como el `-VIEW` del CAD clásico
 * (`?/Delete/Orthographic/Restore/Save/Window`). Una vista guardada también se restaura tecleando su nombre.
 */
export const viewCommand: Command = {
  name: 'VIEW',
  aliases: ['V', '-VIEW', '-V'],
  description: 'Views: standard (Top/Front/…/NWiso) and named views (?/Delete/Orthographic/Restore/Save/Window)',
  async run(ctx) {
    const s = await ctx.getString(`Enter an option [${OPTIONS.join('/')}] or a view [${STANDARD.join('/')}]: `)
    if (!s?.trim()) return
    const text = s.trim()
    const k = matchKeyword(text, [...OPTIONS, ...STANDARD, 'Iso'])
    const std = k && !OPTIONS.includes(k) ? standardView(k) : null
    if (std) {
      ctx.app.setView(std)
      ctx.print(`View: ${k}`)
      return
    }
    if (!k) {
      const nv = ctx.doc.getNamedView(text)
      if (nv) restoreView(ctx, nv)
      else ctx.print(`Could not find view "${text}".`)
      return
    }
    switch (k) {
      case '?': {
        const list = ctx.doc.namedViews()
        if (!list.length) ctx.print('No named views.')
        for (const v of list) ctx.print(`${v.name.padEnd(24)} ${v.view.mode === 'persp' ? 'Perspective' : 'Parallel'}${v.ucs ? '  (with UCS)' : ''}`)
        return
      }
      case 'Delete': {
        const names = (await ctx.getString('Enter view name(s) to delete: '))?.split(',').map((x) => x.trim()).filter(Boolean) ?? []
        for (const n of names) if (!ctx.doc.deleteNamedView(n)) ctx.print(`Could not find view "${n}".`)
        return
      }
      case 'Orthographic': {
        const o = await askKeyword(ctx, 'Enter an option [Top/Bottom/Front/BAck/Left/Right] <Top>: ', STANDARD.slice(0, 6), 'Top')
        const v = o ? standardView(o) : null
        if (v) ctx.app.setView(v)
        return
      }
      case 'Restore': {
        const name = (await ctx.getString('Enter view name to restore: '))?.trim()
        if (!name) return
        const nv = ctx.doc.getNamedView(name)
        if (nv) restoreView(ctx, nv)
        else ctx.print(`Could not find view "${name}".`)
        return
      }
      case 'Save': {
        const name = await askName(ctx, 'Enter view name to save: ')
        const view = ctx.app.getViewState?.()
        if (name && view) saveView(ctx, name, view)
        return
      }
      case 'Window': {
        const name = await askName(ctx, 'Enter view name to save: ')
        if (!name) return
        const a = await ctx.getPoint('Specify first corner: ', { base: null })
        if (a.kind !== 'point') return
        const b = await ctx.getPoint('Specify opposite corner: ', { base: a.point, corner: true })
        if (b.kind !== 'point') return
        // La vista de la ventana se guarda sin cambiar la actual (como el CAD clásico).
        const view = ctx.app.windowViewState?.(a.point, b.point)
        if (view) saveView(ctx, name, view)
        return
      }
    }
  },
}

export const perspectiveCommand: Command = {
  name: 'PERSPECTIVE',
  aliases: [],
  description: 'Perspective projection',
  async run(ctx) {
    ctx.app.setCameraMode('persp')
    ctx.print('Perspective projection.')
  },
}

export const orthographicCommand: Command = {
  name: 'ORTHOGRAPHIC',
  aliases: [],
  description: 'Orthographic projection',
  async run(ctx) {
    ctx.app.setCameraMode('ortho')
    ctx.print('Orthographic projection.')
  },
}
