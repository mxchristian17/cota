import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../test/engineHarness'
import { matchOsnapOverride } from '../snap/osnap'
import { ICONS } from '../../ui/icons'
import { DEFAULT_TOOLBARS, findToolbar, itemTitle, TOOLBARS } from './toolbars'

describe('barras de herramientas clásicas', () => {
  const cmds = makeEngine().engine.getCommands()
  const known = new Set(cmds.flatMap((c) => [c.name, ...c.aliases]))
  const items = TOOLBARS.flatMap((t) => t.items.map((it) => ({ t: t.id, it })))

  it('hay 23 barras con ids y nombres únicos', () => {
    expect(TOOLBARS).toHaveLength(23)
    expect(new Set(TOOLBARS.map((t) => t.id)).size).toBe(23)
    expect(new Set(TOOLBARS.map((t) => t.name)).size).toBe(23)
  })

  it('cada botón ejecuta un comando existente (o una referencia a objetos de un uso)', () => {
    for (const { t, it } of items) {
      if (it.kind !== 'cmd') continue
      if (it.transparent) expect(matchOsnapOverride(it.run[0]), `${t}: ${it.run[0]}`).not.toBeNull()
      else expect(known.has(it.run[0]), `${t}: ${it.run[0]}`).toBe(true)
    }
  })

  it('cada botón tiene su ícono', () => {
    for (const { t, it } of items) if (it.kind === 'cmd') expect(ICONS[it.icon], `${t}: ${it.icon}`).toBeTruthy()
  })

  it('por defecto sólo Dimension está visible', () => {
    expect(Object.entries(DEFAULT_TOOLBARS).filter(([, s]) => s.visible).map(([id]) => id)).toEqual(['dimension'])
  })

  it('se encuentran por nombre tecleado', () => {
    expect(findToolbar('draw')?.id).toBe('draw')
    expect(findToolbar('Layers II')?.id).toBe('layers2')
    expect(findToolbar('object snap')?.id).toBe('osnap')
    expect(findToolbar('DIM')?.id).toBe('dimension')
    expect(findToolbar('nada')).toBeNull()
  })

  it('el tooltip muestra el comando', () => {
    const zw = TOOLBARS.find((t) => t.id === 'zoom')!.items[0]
    expect(zw.kind === 'cmd' && itemTitle(zw)).toBe('Zoom window (ZOOM W)')
  })
})
