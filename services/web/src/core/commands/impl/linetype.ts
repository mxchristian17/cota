import type { Command, CommandContext } from '../types'
import type { DrawingVars } from '../../document/types'
import { askKeyword, askNumber, fmt } from '../ask'
import { BYBLOCK, BYLAYER, linetypeLabel, linetypeLibrary } from '../../linetype/linetypes'

/**
 * Tipos de línea: `LINETYPE` abre el administrador; `-LINETYPE` es la versión de línea de
 * comandos (`?/Create/Load/Set`), y las variables `LTSCALE`, `CELTYPE`, `CELTSCALE`, `PSLTSCALE`,
 * `MSLTSCALE` y `PLINEGEN` se cambian tecleando su nombre, como en el CAD clásico.
 */

export const linetypeCommand: Command = {
  name: 'LINETYPE',
  aliases: ['LT', 'LTYPE', 'DDLTYPE'],
  description: 'Linetype Manager: load linetypes, set the current one and the scale factors',
  async run(ctx) {
    if (ctx.app.openLinetypes) ctx.app.openLinetypes()
    else await dashLinetypeCommand.run(ctx)
  },
}

/** Valor de CELTYPE tal como lo muestra el CAD clásico. */
const current = (ctx: CommandContext): string => linetypeLabel(ctx.doc.vars.CELTYPE)

function listLoaded(ctx: CommandContext): void {
  ctx.print('Linetype           Description')
  for (const d of ctx.doc.linetypes) ctx.print(`${linetypeLabel(d.name).padEnd(18)} ${d.description}`)
}

/** Parsea un patrón `A,12.7,-6.35,0,-6.35` (el `A,` es opcional). null si no es válido. */
export function parsePattern(text: string): number[] | null {
  const parts = text.trim().replace(/^A\s*,/i, '').split(',').map((s) => s.trim()).filter((s) => s !== '')
  if (!parts.length) return null
  const nums = parts.map(Number)
  if (nums.some((n) => !isFinite(n))) return null
  // El CAD clásico exige que el patrón empiece con un trazo o un punto.
  return nums[0] >= 0 ? nums : null
}

export const dashLinetypeCommand: Command = {
  name: '-LINETYPE',
  aliases: ['-LT'],
  description: 'Linetypes from the command line: ?, Create, Load, Set',
  async run(ctx) {
    for (;;) {
      ctx.print(`Current line type: "${current(ctx)}"`)
      const k = await askKeyword(ctx, 'Enter an option [?/Create/Load/Set]: ', ['?', 'Create', 'Load', 'Set'])
      if (!k) return
      if (k === '?') listLoaded(ctx)
      else if (k === 'Load') {
        const s = await ctx.getString('Enter linetype(s) to load: ')
        if (!s) continue
        const lib = linetypeLibrary(ctx.doc.units)
        const wanted = s.trim() === '*' ? lib.map((d) => d.name) : s.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean)
        for (const name of wanted) {
          if (!lib.some((x) => x.name === name)) {
            ctx.print(`Linetype ${name} not found in the linetype library.`)
            continue
          }
          const already = !!ctx.doc.linetype(name)
          ctx.doc.loadLinetype(name, undefined, true)
          ctx.print(already ? `Linetype ${name} reloaded.` : `Linetype ${name} loaded.`)
        }
      } else if (k === 'Set') {
        const s = await ctx.getString(`Specify linetype name or [?] <${current(ctx)}>: `, { default: current(ctx) })
        if (s === null) continue
        if (s.trim() === '?') {
          listLoaded(ctx)
          continue
        }
        const up = s.trim().toUpperCase()
        if (up === BYLAYER || up === BYBLOCK) ctx.doc.setVar('CELTYPE', up)
        else if (ctx.doc.loadLinetype(up)) ctx.doc.setVar('CELTYPE', up)
        else ctx.print(`Linetype ${s.trim()} not found. Use the Load option to load it.`)
      } else if (k === 'Create') {
        const name = (await ctx.getString('Enter name of linetype to create: '))?.trim().toUpperCase()
        if (!name) continue
        const desc = (await ctx.getString('Descriptive text: ', { default: '' })) ?? ''
        const pat = await ctx.getString('Enter linetype pattern (on next line):\nA,')
        const pattern = pat ? parsePattern(pat) : null
        if (!pattern) {
          ctx.print('Invalid linetype pattern: it must start with a dash or a dot (e.g. 12.7,-6.35,0,-6.35).')
          continue
        }
        ctx.doc.loadLinetype(name, { name, description: desc, pattern }, true)
        ctx.print(`Linetype ${name} created and loaded.`)
      }
    }
  },
}

/** Variable numérica positiva del dibujo (LTSCALE, CELTSCALE). */
function scaleVar(name: 'LTSCALE' | 'CELTSCALE', description: string): Command {
  return {
    name,
    aliases: name === 'LTSCALE' ? ['LTS'] : [],
    description,
    async run(ctx) {
      const cur = ctx.doc.vars[name]
      const r = await askNumber(ctx, `Enter new ${name === 'LTSCALE' ? 'linetype scale factor' : 'value for CELTSCALE'} <${fmt(cur)}>: `, {
        def: cur,
        check: (v) => (v > 0 ? null : 'Requires a positive number.'),
      })
      if (r?.kind !== 'number' || r.value === cur) return
      ctx.doc.setVar(name, r.value)
      if (name === 'LTSCALE') ctx.print('Regenerating model.')
    },
  }
}

function switchVar(name: 'PSLTSCALE' | 'MSLTSCALE' | 'PLINEGEN', description: string): Command {
  return {
    name,
    aliases: [],
    description,
    async run(ctx) {
      const cur = ctx.doc.vars[name]
      const r = await askNumber(ctx, `Enter new value for ${name} <${cur}>: `, { def: cur, check: (v) => (v === 0 || v === 1 ? null : 'Requires 0 or 1.') })
      if (r?.kind === 'number') ctx.doc.setVar(name, r.value as DrawingVars[typeof name])
    },
  }
}

const celtypeCommand: Command = {
  name: 'CELTYPE',
  aliases: [],
  description: 'Linetype of new objects (ByLayer, ByBlock or a loaded linetype)',
  async run(ctx) {
    const s = await ctx.getString(`Enter new value for CELTYPE <"${current(ctx)}">: `, { default: current(ctx) })
    if (s === null) return
    const up = s.trim().replace(/^"|"$/g, '').toUpperCase()
    if (up === BYLAYER || up === BYBLOCK) ctx.doc.setVar('CELTYPE', up)
    else if (ctx.doc.loadLinetype(up)) ctx.doc.setVar('CELTYPE', up)
    else ctx.print(`Linetype ${s.trim()} not found. Use the LINETYPE command to load it.`)
  },
}

export const linetypeVarCommands: Command[] = [
  scaleVar('LTSCALE', 'Global linetype scale factor'),
  scaleVar('CELTSCALE', 'Linetype scale of new objects'),
  celtypeCommand,
  switchVar('PSLTSCALE', 'Paper space linetype scaling in layout viewports (0/1)'),
  switchVar('MSLTSCALE', 'Scale model space linetypes by the annotation scale (0/1)'),
  switchVar('PLINEGEN', 'Linetype pattern continuous around polyline vertices (0/1)'),
]
