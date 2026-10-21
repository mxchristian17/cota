import type { Command, CommandContext } from '../types'
import type { VisualStyle } from '../../view'

const KEYWORDS = ['2Dwireframe', '3Dwireframe', 'Shaded', 'shadedEdges', 'Hidden']

function toStyle(kw: string): VisualStyle {
  switch (kw.toLowerCase()) {
    case '2dwireframe':
      return '2dwireframe'
    case '3dwireframe':
      return '3dwireframe'
    case 'shaded':
      return 'shaded'
    case 'hidden':
      return 'hidden'
    default:
      return 'shadedEdges'
  }
}

/** Keyword de VSCURRENT que corresponde a un estilo (para el `<actual>` del prompt). */
const vsKeyword = (s: VisualStyle): string => KEYWORDS.find((k) => toStyle(k) === s) ?? 'shadedEdges'

async function applyStyle(ctx: CommandContext, style: VisualStyle): Promise<void> {
  ctx.app.setVisualStyle(style)
  ctx.print(`Visual style: ${style}.`)
}

export const vscurrentCommand: Command = {
  name: 'VSCURRENT',
  aliases: ['VS'],
  description: 'Set the visual style of the active viewport [2Dwireframe/3Dwireframe/Shaded/shadedEdges/Hidden]',
  async run(ctx) {
    // Enter = el estilo actual (no cambia nada); ESC cancela.
    const cur = vsKeyword(ctx.app.visualStyle())
    const r = await ctx.getPoint(`Visual style [2Dwireframe/3Dwireframe/Shaded/shadedEdges/Hidden] <${cur}>: `, {
      keywords: KEYWORDS,
      enterKeyword: cur,
    })
    if (r.kind === 'point') {
      ctx.print('Type a visual style name.')
      return
    }
    if (r.kind === 'keyword') await applyStyle(ctx, toStyle(r.keyword))
  },
}

/**
 * SHADEMODE: las opciones del CAD clásico, mapeadas a los estilos visuales existentes. Flat y
 * Gouraud comparten el sombreado (`shaded`); con bordes, `shadedEdges`.
 */
const SHADE_OPTIONS: Array<[string, VisualStyle]> = [
  ['2Dwireframe', '2dwireframe'],
  ['3Dwireframe', '3dwireframe'],
  ['Hidden', 'hidden'],
  ['Flat', 'shaded'],
  ['Gouraud', 'shaded'],
  ['fLat+edges', 'shadedEdges'],
  ['gOuraud+edges', 'shadedEdges'],
]

export const shademodeCommand: Command = {
  name: 'SHADEMODE',
  aliases: ['SHA', '-SHADEMODE'],
  description: 'Set the shading of the active viewport [2D wireframe/3D wireframe/Hidden/Flat/Gouraud/fLat+edges/gOuraud+edges]',
  async run(ctx) {
    const style = ctx.app.visualStyle()
    const cur = (SHADE_OPTIONS.find(([, s]) => s === style) ?? SHADE_OPTIONS[0])[0]
    const keys = SHADE_OPTIONS.map(([k]) => k)
    const r = await ctx.getPoint(`Enter option [${keys.join('/')}] <${cur}>: `, { keywords: keys, enterKeyword: cur })
    if (r.kind === 'point') {
      ctx.print('Type a shade mode option.')
      return
    }
    if (r.kind !== 'keyword') return
    const next = SHADE_OPTIONS.find(([k]) => k === r.keyword)?.[1] ?? style
    await applyStyle(ctx, next)
  },
}
