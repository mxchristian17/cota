import { describe, expect, it } from 'vitest'
import { clampToolbar, DEFAULT_TOOLBAR, dockedOn, docksAt, dockToolbar, insertIndex, normalizeToolbar, normalizeToolbars, type ToolbarState } from './toolbar'

describe('barras de herramientas', () => {
  it('se acopla al soltarla junto al borde superior del dibujo', () => {
    expect(docksAt(80, 70)).toBe(true)
    expect(docksAt(120, 70)).toBe(false)
  })
  it('flotante queda dentro de la ventana', () => {
    expect(clampToolbar({ x: 2000, y: -50 }, 300, 1366, 768)).toEqual({ x: 1066, y: 0 })
  })
  it('normaliza el estado guardado', () => {
    expect(normalizeToolbar(null)).toEqual(DEFAULT_TOOLBAR)
    expect(normalizeToolbar({ visible: false, docked: false, x: 10, y: 'a' })).toEqual({ visible: false, docked: false, side: 'left', x: 10, y: DEFAULT_TOOLBAR.y, order: 0 })
  })
})

describe('varias barras por borde', () => {
  const hidden = (side: ToolbarState['side'], order: number): ToolbarState => ({ visible: false, docked: true, side, x: 0, y: 0, order })
  const defaults = { dim: { ...DEFAULT_TOOLBAR }, draw: hidden('left', 1), modify: hidden('right', 0), std: hidden('top', 0) }

  it('completa lo guardado con los valores por defecto de cada barra', () => {
    const st = normalizeToolbars({ draw: { visible: true }, otra: { visible: true } }, defaults)
    expect(Object.keys(st)).toEqual(['dim', 'draw', 'modify', 'std'])
    expect(st.draw).toEqual({ ...defaults.draw, visible: true })
    expect(normalizeToolbars('basura', defaults)).toEqual(defaults)
  })

  it('acopla en orden y renumera el borde', () => {
    let st = normalizeToolbars({ draw: { visible: true } }, defaults)
    expect(dockedOn(st, 'left')).toEqual(['dim', 'draw'])
    st = dockToolbar(st, 'std', 'left', 0)
    expect(dockedOn(st, 'left')).toEqual(['std', 'dim', 'draw'])
    expect([st.std.order, st.dim.order, st.draw.order]).toEqual([0, 1, 2])
    st = dockToolbar(st, 'std', 'left')
    expect(dockedOn(st, 'left')).toEqual(['dim', 'draw', 'std'])
    st = dockToolbar(st, 'dim', 'top')
    expect(dockedOn(st, 'left')).toEqual(['draw', 'std'])
    expect(dockedOn(st, 'top')).toEqual(['dim'])
  })

  it('una barra flotante u oculta no ocupa lugar en el borde', () => {
    const st = { ...defaults, dim: { ...defaults.dim, docked: false } }
    expect(dockedOn(st, 'left')).toEqual([])
  })

  it('el lugar de inserción sigue el orden de lectura del borde', () => {
    // Arriba: dos barras en la primera fila y una en la segunda.
    const top = [
      { left: 0, top: 0, right: 100, bottom: 30 },
      { left: 100, top: 0, right: 200, bottom: 30 },
      { left: 0, top: 30, right: 100, bottom: 60 },
    ]
    expect(insertIndex(top, 10, 10, 'top')).toBe(0)
    expect(insertIndex(top, 160, 10, 'top')).toBe(2)
    expect(insertIndex(top, 150, 45, 'top')).toBe(3)
    // A la izquierda: columnas.
    const left = [
      { left: 0, top: 0, right: 30, bottom: 300 },
      { left: 30, top: 0, right: 60, bottom: 200 },
    ]
    expect(insertIndex(left, 5, 100, 'left')).toBe(0)
    expect(insertIndex(left, 50, 50, 'left')).toBe(1)
    expect(insertIndex(left, 70, 50, 'left')).toBe(2)
  })
})
