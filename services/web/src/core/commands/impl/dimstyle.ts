import { DIM_VAR_INFO, formatDimVar, parseDimVar, type DimVarName, type DimVars } from '../../dimension/style'
import { askKeyword } from '../ask'
import { formatScale, parseScale } from '../../layout/scale'
import type { Command, CommandContext } from '../types'

/**
 * Variables de cota como comandos: `DIMTXT`, `DIMASZ`… muestran el valor vigente y el valor
 * tecleado queda como **override del estilo actual** para las cotas nuevas (en el CAD clásico: `<style overrides>`).
 */
export const dimVarCommands: Command[] = DIM_VAR_INFO.filter((v) => v.name.startsWith('DIM')).map((info) => ({
  name: info.name,
  aliases: [],
  description: `Dimension variable: ${info.label}`,
  async run(ctx) {
    const cur = ctx.doc.currentDimVars[info.name]
    for (;;) {
      const text = await ctx.getString(`Enter new value for ${info.name} <${formatDimVar(info.name, cur)}>: `, { default: '' })
      if (text === null || text.trim() === '') return
      const r = parseDimVar(info.name as DimVarName, text)
      if (!r) {
        ctx.print(`Invalid value for ${info.name}.`)
        continue
      }
      ctx.doc.setDimOverride(info.name, r.value as never)
      ctx.print(`${info.name} = ${formatDimVar(info.name, r.value)} (override of "${ctx.doc.currentDimStyle}")`)
      return
    }
  },
}))

/** DIMSTYLE (`D`, `DST`, `DDIM`): administrador de estilos de cota. */
export const dimStyleCommand: Command = {
  name: 'DIMSTYLE',
  aliases: ['D', 'DST', 'DDIM', 'DIMSTY'],
  description: 'Dimension Style Manager: create, modify, override and set the current dimension style',
  async run(ctx) {
    ctx.app.openDimStyle()
  },
}

/** Nombre de estilo pedido por línea de comandos (`?` lista; Enter = el de una cota elegida). */
async function askStyleName(ctx: CommandContext, prompt: string): Promise<string | null> {
  for (;;) {
    const t = await ctx.getString(prompt, { default: '' })
    if (t === null) return null
    const name = t.trim()
    if (name === '?') {
      ctx.print(`Dimension styles: ${ctx.doc.dimStyles.map((s) => s.name).join(', ')}`)
      continue
    }
    if (name === '') {
      const ids = await ctx.getSelection('Select dimension: ')
      const e = ids?.length ? ctx.doc.getEntity(ids[0]) : undefined
      if (e?.type !== 'DIMENSION') return null
      return e.props.styleName ?? 'Standard'
    }
    const def = ctx.doc.dimStyleDef(name)
    if (def) return def.name
    ctx.print(`Dimension style "${name}" not found.`)
  }
}

function printVars(ctx: CommandContext, title: string, vars: DimVars): void {
  ctx.print(title)
  for (const info of DIM_VAR_INFO) ctx.print(`  ${info.name.padEnd(10)} ${formatDimVar(info.name, vars[info.name]).padEnd(16)} ${info.label}`)
}

/** -DIMSTYLE: `[ANnotative/Save/Restore/STatus/Variables/Apply/?] <Restore>`. */
export const dimStyleCmdlineCommand: Command = {
  name: '-DIMSTYLE',
  aliases: [],
  description: 'Dimension styles from the command line [ANnotative/Save/Restore/STatus/Variables/Apply/?]',
  async run(ctx) {
    const cur = ctx.doc.currentDimStyle
    ctx.print(`Current dimension style: ${cur}${Object.keys(ctx.doc.dimOverrides).length ? ' (with overrides)' : ''}`)
    const opt = await askKeyword(ctx, 'Enter a dimension style option [ANnotative/Save/Restore/STatus/Variables/Apply/?] <Restore>: ', ['ANnotative', 'Save', 'Restore', 'STatus', 'Variables', 'Apply', '?'], 'Restore')
    if (!opt) return
    switch (opt) {
      case '?':
        ctx.print(`Dimension styles: ${ctx.doc.dimStyles.map((s) => s.name).join(', ')}`)
        return
      case 'STatus':
        printVars(ctx, `Dimension variables of "${cur}" (with overrides):`, ctx.doc.currentDimVars)
        return
      case 'Variables': {
        const name = await askStyleName(ctx, 'Enter a dimension style name, [?] or <select dimension>: ')
        const def = name ? ctx.doc.dimStyleDef(name) : undefined
        if (def) printVars(ctx, `Dimension variables of "${def.name}":`, def.vars)
        return
      }
      case 'Restore': {
        const name = await askStyleName(ctx, 'Enter a dimension style name, [?] or <select dimension>: ')
        if (name && ctx.doc.setCurrentDimStyle(name)) ctx.print(`Current dimension style: ${name}`)
        return
      }
      case 'Save': {
        const name = (await ctx.getString('Enter name for new dimension style or [?]: '))?.trim()
        if (!name) return
        if (ctx.doc.dimStyleDef(name)) {
          const yes = await askKeyword(ctx, 'That name is already in use, redefine it? [Yes/No] <N>: ', ['Yes', 'No'], 'No')
          if (yes !== 'Yes') return
        }
        ctx.doc.saveDimStyle({ name, vars: ctx.doc.currentDimVars })
        ctx.doc.setCurrentDimStyle(name)
        ctx.print(`Dimension style "${name}" saved and made current.`)
        return
      }
      case 'Apply': {
        const ids = await ctx.getSelection('Select objects: ')
        let n = 0
        for (const id of ids ?? []) {
          const e = ctx.doc.getEntity(id)
          if (e?.type !== 'DIMENSION') continue
          ctx.doc.restyleDimension(e.props, cur, { ...ctx.doc.dimOverrides })
          n++
        }
        ctx.print(`${n} dimension(s) updated to "${cur}".`)
        return
      }
      case 'ANnotative': {
        const def = ctx.doc.dimStyleDef(cur)
        if (!def) return
        ctx.doc.saveDimStyle({ name: def.name, vars: { ...def.vars, ANNOTATIVE: !def.vars.ANNOTATIVE } })
        ctx.print(`Dimension style "${cur}" is ${def.vars.ANNOTATIVE ? 'annotative' : 'not annotative'}.`)
      }
    }
  },
}

/** CANNOSCALE: escala de anotación del modelo; las cotas anotativas se dibujan a ella. */
export const cannoscaleCommand: Command = {
  name: 'CANNOSCALE',
  aliases: [],
  description: 'Annotation scale of model space (annotative dimensions keep their paper size): 1:1, 1:50, 1:100…',
  async run(ctx) {
    const cur = formatScale(ctx.doc.cannoscale)
    const s = await ctx.getString(`Enter new value for CANNOSCALE <${cur}>: `, { default: cur })
    if (s === null) return
    const v = parseScale(s)
    if (!v) return ctx.print('Invalid scale. Use 1:50, 1/100, 2:1…')
    ctx.doc.setCannoscale(v)
    ctx.print(`Annotation scale: ${formatScale(v)}`)
  },
}
