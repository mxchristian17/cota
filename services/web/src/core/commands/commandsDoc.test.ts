import { expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { makeEngine } from '../../test/engineHarness'
import { CATEGORIES } from '../ui/menus'
import { VARIABLE_COMMANDS } from './registry'

/**
 * docs/commands.md se genera del registry (menús, comandos de línea y variables). Este test falla si la
 * referencia quedó desactualizada; `UPDATE_DOCS=1 npx vitest run commandsDoc` la regenera.
 */
const DOC = fileURLToPath(new URL('../../../../../docs/commands.md', import.meta.url))

function commandsMarkdown(): string {
  const cmds = makeEngine().engine.getCommands()
  const by = new Map(cmds.map((c) => [c.name, c]))
  const esc = (s: string) => s.replace(/\|/g, '\\|')
  const row = (c: (typeof cmds)[number]) => `| \`${c.name}\` | ${c.aliases.map((a) => '`' + a + '`').join(', ') || '—'} | ${esc(c.description)} |`
  let md = '# Command reference\n\nEvery command can be typed in the command line (aliases too) or picked from the menus. Type `HELP` inside Cota for the same list.\n\n'
  const done = new Set<string>()
  for (const cat of CATEGORIES) {
    const rows: string[] = []
    for (const n of cat.names) {
      const c = by.get(n)
      if (!c || done.has(n)) continue
      done.add(n)
      rows.push(row(c))
    }
    if (rows.length) md += `## ${cat.label} menu\n\n| Command | Aliases | What it does |\n| --- | --- | --- |\n${rows.join('\n')}\n\n`
  }
  const rest = cmds.filter((c) => !done.has(c.name) && !VARIABLE_COMMANDS.has(c.name))
  md += `## Command-line versions\n\nDash versions run without dialogs, for scripts and power users.\n\n| Command | Aliases | What it does |\n| --- | --- | --- |\n${rest.map(row).join('\n')}\n\n`
  const vars = cmds.filter((c) => VARIABLE_COMMANDS.has(c.name))
  md += `## System variables\n\nType the name to see or change the value.\n\n| Variable | What it controls |\n| --- | --- |\n${vars.map((c) => `| \`${c.name}\` | ${esc(c.description)} |`).join('\n')}\n`
  return md
}

it('docs/commands.md is up to date with the command registry', () => {
  const md = commandsMarkdown()
  if (process.env.UPDATE_DOCS) writeFileSync(DOC, md)
  expect(readFileSync(DOC, 'utf8')).toBe(md)
})
