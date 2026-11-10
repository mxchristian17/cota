import { expect, it } from 'vitest'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { makeEngine } from '../../test/engineHarness'
import { CATEGORIES } from '../ui/menus'
import { VARIABLE_COMMANDS } from './registry'

/**
 * docs/commands.md se genera del registry (menús, comandos de línea y variables). Este test falla si la
 * referencia quedó desactualizada; `UPDATE_DOCS=1 npx vitest run commandsDoc` la regenera.
 */
const DOC = fileURLToPath(new URL('../../../../../docs/commands.md', import.meta.url))
const REF = fileURLToPath(new URL('../../../../../docs/reference/', import.meta.url))

/** Páginas de la referencia que no son de comandos (sus títulos son temas). */
const TOPIC_PAGES = new Set(['variables.md', 'object-snaps.md'])

/** Páginas de la referencia de comandos (`docs/reference/*.md`): archivo → contenido. */
function referencePages(): Map<string, string> {
  return new Map(readdirSync(REF).filter((f) => f.endsWith('.md') && !TOPIC_PAGES.has(f)).map((f) => [f, readFileSync(REF + f, 'utf8')]))
}

const variablesPage = (): string => readFileSync(REF + 'variables.md', 'utf8')

/** Menú y sección de cada comando, como se ven en la barra de menús. */
function menuPlaces(): Map<string, string> {
  const at = new Map<string, string>()
  for (const cat of CATEGORIES) {
    let section = ''
    for (const n of cat.names) {
      if (n.startsWith('§')) section = n.slice(1)
      else if (!at.has(n)) at.set(n, section ? `${cat.label} › ${section}` : cat.label)
    }
  }
  return at
}

/**
 * Línea de datos de cada sección `## NOMBRE` de la referencia: alias y menú salen del registry, así nunca quedan
 * desactualizados. `UPDATE_DOCS=1` la reescribe.
 */
function metaLine(c: { name: string; aliases: string[] }, places: Map<string, string>): string {
  const aliases = c.aliases.length ? c.aliases.map((a) => '`' + a + '`').join(', ') : 'none'
  const menu = places.get(c.name)
  return `**Aliases** ${aliases} · ${menu ? `**Menu** ${menu}` : '**Command line only**'}`
}

function syncReference(pages: Map<string, string>): Map<string, string> {
  const cmds = new Map(makeEngine().engine.getCommands().map((c) => [c.name, c]))
  const places = menuPlaces()
  const out = new Map<string, string>()
  for (const [f, md] of pages) {
    out.set(
      f,
      md.replace(/^## (\S+)\n\n([^\n]*\n(?:[^\n]+\n)*)\n\*\*Aliases\*\*[^\n]*$/gm, (m, name: string, summary: string) => {
        const c = cmds.get(name)
        return c ? `## ${name}\n\n${summary}\n${metaLine(c, places)}` : m
      }),
    )
  }
  return out
}

/** Sección de la referencia de cada comando: `draw.md#line`. */
function referenceAnchors(pages: Map<string, string>): Map<string, string> {
  const at = new Map<string, string>()
  for (const [f, md] of pages) for (const m of md.matchAll(/^## (\S+)$/gm)) at.set(m[1], `reference/${f}#${m[1].toLowerCase()}`)
  // Las variables: una fila por variable en las tablas de variables.md.
  for (const m of variablesPage().matchAll(/^\| `([A-Z0-9]+)` \|/gm)) if (!at.has(m[1])) at.set(m[1], `reference/variables.md#${m[1].toLowerCase()}`)
  return at
}

function commandsMarkdown(): string {
  const cmds = makeEngine().engine.getCommands()
  const ref = referenceAnchors(referencePages())
  const by = new Map(cmds.map((c) => [c.name, c]))
  const esc = (s: string) => s.replace(/\|/g, '\\|')
  const row = (c: (typeof cmds)[number]) => `| ${ref.has(c.name) ? `[\`${c.name}\`](${ref.get(c.name)})` : `\`${c.name}\``} | ${c.aliases.map((a) => '`' + a + '`').join(', ') || '—'} | ${esc(c.description)} |`
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
  md += `## System variables\n\nType the name to see or change the value. Each one is explained in [System variables](reference/variables.md).\n\n| Variable | What it controls |\n| --- | --- |\n${vars.map((c) => `| ${ref.has(c.name) ? `[\`${c.name}\`](${ref.get(c.name)})` : `\`${c.name}\``} | ${esc(c.description)} |`).join('\n')}\n`
  return md
}

it('docs/commands.md is up to date with the command registry', () => {
  const md = commandsMarkdown()
  if (process.env.UPDATE_DOCS) writeFileSync(DOC, md)
  expect(readFileSync(DOC, 'utf8')).toBe(md)
})

it('docs/reference: la línea de alias y menú de cada comando sale del registry', () => {
  const pages = referencePages()
  const synced = syncReference(pages)
  if (process.env.UPDATE_DOCS) for (const [f, md] of synced) writeFileSync(REF + f, md)
  else for (const [f, md] of synced) expect(pages.get(f), f).toBe(md)
  // Cada sección `## NOMBRE` es un comando registrado y tiene su línea de datos.
  const names = new Set(makeEngine().engine.getCommands().map((c) => c.name))
  for (const [f, md] of synced)
    for (const m of md.matchAll(/^## (\S+)\n\n(?:[^\n]+\n)+\n(\*\*Aliases\*\*[^\n]*)?/gm)) {
      expect(names.has(m[1]), `${f}: ${m[1]} no es un comando`).toBe(true)
      expect(m[2], `${f}: ${m[1]} sin línea **Aliases**`).toBeTruthy()
    }
})

it('docs/reference: todo comando tiene su sección (las variables van en la tabla de commands.md)', () => {
  const documented = new Set([...referencePages().values()].flatMap((md) => [...md.matchAll(/^## (\S+)$/gm)].map((m) => m[1])))
  const missing = makeEngine()
    .engine.getCommands()
    .filter((c) => !VARIABLE_COMMANDS.has(c.name) && !documented.has(c.name))
    .map((c) => c.name)
  expect(missing).toEqual([])
})

it('docs/reference/variables.md explica cada variable', () => {
  const md = variablesPage()
  const rows = new Set([...md.matchAll(/^\| `([A-Z0-9]+)` \|/gm)].map((m) => m[1]))
  const missing = makeEngine()
    .engine.getCommands()
    .filter((c) => VARIABLE_COMMANDS.has(c.name) && !rows.has(c.name))
    .map((c) => c.name)
  expect(missing).toEqual([])
})
