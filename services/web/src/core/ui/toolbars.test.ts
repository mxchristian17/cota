import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../test/engineHarness'
import { matchOsnapOverride } from '../snap/osnap'
import { ICONS, iconMarkup } from '../../ui/icons'
import { ICON_SIZES } from '../../ui/iconGrid'
import { DEFAULT_TOOLBARS, findToolbar, itemTitle, PHONE_TOOLBARS, TOOLBARS } from './toolbars'
import { dockedOn } from './toolbar'

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

  it('cada botón tiene su ícono, dibujado en los tres tamaños', () => {
    for (const { t, it } of items) {
      if (it.kind !== 'cmd') continue
      expect(ICONS[it.icon], `${t}: ${it.icon}`).toBeTruthy()
      for (const s of ICON_SIZES) expect(iconMarkup(it.icon, s), `${t}: ${it.icon} ${s}`).toMatch(/^</)
    }
  })

  it('al arrancar: Draw a la izquierda y Modify a la derecha; Dimension oculta, con su lugar al lado de Draw', () => {
    expect(Object.entries(DEFAULT_TOOLBARS).filter(([, s]) => s.visible).map(([id]) => id)).toEqual(['draw', 'modify'])
    expect(dockedOn(DEFAULT_TOOLBARS, 'left')).toEqual(['draw'])
    expect(dockedOn(DEFAULT_TOOLBARS, 'right')).toEqual(['modify'])
    // Al mostrarla, Dimension queda acoplada a la izquierda, después de Draw.
    const shown = { ...DEFAULT_TOOLBARS, dimension: { ...DEFAULT_TOOLBARS.dimension, visible: true } }
    expect(dockedOn(shown, 'left')).toEqual(['draw', 'dimension'])
  })

  it('en un teléfono no arranca ninguna barra, pero cada una conserva su borde y su orden', () => {
    expect(Object.values(PHONE_TOOLBARS).filter((s) => s.visible)).toEqual([])
    for (const [id, s] of Object.entries(PHONE_TOOLBARS)) expect({ ...s, visible: true }).toEqual({ ...DEFAULT_TOOLBARS[id], visible: true })
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
