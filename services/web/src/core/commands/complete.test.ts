import { describe, it, expect } from 'vitest'
import { suggestCommands } from './complete'
import type { Command } from './types'

const cmd = (name: string, aliases: string[], description = ''): Command =>
  ({ name, aliases, description, run: async () => {} }) as Command

const commands = [
  cmd('LINE', ['L'], 'Draw lines'),
  cmd('CIRCLE', ['C'], 'Draw a circle'),
  cmd('COPY', ['CO', 'CP'], 'Copy objects'),
  cmd('ELLIPSE', ['EL'], 'Draw an ellipse'),
  cmd('PLINE', ['PL'], 'Draw a polyline'),
]

describe('suggestCommands', () => {
  it('prioriza el prefijo del nombre sobre el alias y el substring', () => {
    expect(suggestCommands(commands, 'c').map((x) => x.name)).toEqual(['CIRCLE', 'COPY'])
    // LINE coincide por nombre (prefijo) y PLINE por substring: va después.
    expect(suggestCommands(commands, 'line').map((x) => x.name)).toEqual(['LINE', 'PLINE'])
  })

  it('encuentra por alias e informa cuál coincidió', () => {
    const s = suggestCommands(commands, 'pl')
    expect(s[0].name).toBe('PLINE')
    const byAlias = suggestCommands(commands, 'cp')
    expect(byAlias[0]).toMatchObject({ name: 'COPY', alias: 'CP' })
  })

  it('ignora mayúsculas y el prefijo _ de las macros', () => {
    expect(suggestCommands(commands, '_li')[0].name).toBe('LINE')
    expect(suggestCommands(commands, 'LiN')[0].name).toBe('LINE')
  })

  it('sin texto no sugiere nada y respeta el límite', () => {
    expect(suggestCommands(commands, '')).toEqual([])
    expect(suggestCommands(commands, '   ')).toEqual([])
    expect(suggestCommands(commands, 'l', 1)).toHaveLength(1)
  })
})
