import { describe, it, expect } from 'vitest'
import { DEFAULT_PALETTE, clampToViewport, clampWidth, dockFromDrop, normalizePalette } from './palette'

describe('dockFromDrop', () => {
  it('se acopla a la izquierda cerca del borde izquierdo', () => {
    expect(dockFromDrop(10, 260, 1280)).toBe('left')
    expect(dockFromDrop(96, 260, 1280)).toBe('left')
  })

  it('se acopla a la derecha cuando su borde derecho roza el borde de la ventana', () => {
    expect(dockFromDrop(1280 - 260, 260, 1280)).toBe('right')
    expect(dockFromDrop(960, 260, 1280)).toBe('right') // 960+260 = 1220 ≥ 1280−96
  })

  it('queda flotante en el medio', () => {
    expect(dockFromDrop(500, 260, 1280)).toBeNull()
  })
})

describe('clampToViewport', () => {
  it('no deja que la paleta salga de la ventana', () => {
    expect(clampToViewport({ x: -40, y: -20, width: 260 }, 1280, 800)).toEqual({ x: 0, y: 0 })
    expect(clampToViewport({ x: 2000, y: 2000, width: 260 }, 1280, 800)).toEqual({ x: 1020, y: 772 })
  })

  it('respeta una posición válida', () => {
    expect(clampToViewport({ x: 300, y: 200, width: 260 }, 1280, 800)).toEqual({ x: 300, y: 200 })
  })
})

describe('normalizePalette', () => {
  it('completa los valores faltantes con los defaults', () => {
    expect(normalizePalette(undefined)).toEqual(DEFAULT_PALETTE)
    expect(normalizePalette({ open: false })).toEqual({ ...DEFAULT_PALETTE, open: false })
  })

  it('acepta flotante (dock null) y acota el ancho', () => {
    expect(normalizePalette({ dock: null }).dock).toBeNull()
    expect(normalizePalette({ width: 10_000 }).width).toBe(560)
    expect(normalizePalette({ width: 10 }).width).toBe(180)
  })

  it('descarta basura', () => {
    const p = normalizePalette({ dock: 'arriba', x: 'nope', minimized: 'sí' })
    expect(p.dock).toBe(DEFAULT_PALETTE.dock)
    expect(p.x).toBe(DEFAULT_PALETTE.x)
    expect(p.minimized).toBe(DEFAULT_PALETTE.minimized)
  })

  it('clampWidth acota a los límites', () => {
    expect(clampWidth(300)).toBe(300)
    expect(clampWidth(0)).toBe(180)
  })
})
