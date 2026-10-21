import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../test/engineHarness'
import { CATEGORIES, MENU_COMMANDS } from './menus'
import { VARIABLE_COMMANDS } from '../commands/registry'

describe('menús', () => {
  it('en el orden de la barra de menús del CAD clásico', () => {
    expect(CATEGORIES.map((c) => c.label)).toEqual(['File', 'Edit', 'View', 'Insert', 'Format', 'Tools', 'Draw', 'Dimension', 'Modify', 'Help'])
  })

  it('todo comando está en un menú, salvo las variables de sistema y las versiones de línea de comandos (-X)', () => {
    const h = makeEngine()
    const sueltos = h.engine.getCommands().map((c) => c.name).filter((n) => !MENU_COMMANDS.has(n) && !VARIABLE_COMMANDS.has(n) && !n.startsWith('-'))
    expect(sueltos).toEqual([])
  })
})
