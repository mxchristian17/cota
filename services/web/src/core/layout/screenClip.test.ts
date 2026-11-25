import { describe, expect, it } from 'vitest'
import { SCREEN_MARGIN, clipToScreen, frameOf } from './screenClip'

describe('recorte del layout a la pantalla', () => {
  const m = SCREEN_MARGIN

  it('lo que entra entero vuelve igual (mismo objeto) y no tiene recorte de vista', () => {
    const r = { left: 10, top: 20, width: 300, height: 200 }
    expect(clipToScreen(r, 800, 600)).toBe(r)
    expect(frameOf(r, r)).toBeNull()
    // También pegado al margen.
    const edge = { left: -m, top: -m, width: 800 + 2 * m, height: 600 + 2 * m }
    expect(clipToScreen(edge, 800, 600)).toBe(edge)
  })

  it('una hoja millones de px más grande que la pantalla queda del tamaño de la pantalla más el margen', () => {
    const r = { left: -6_000_000, top: -3_000_000, width: 13_000_000, height: 9_000_000 }
    const c = clipToScreen(r, 393, 727)!
    expect(c).toEqual({ left: -m, top: -m, width: 393 + 2 * m, height: 727 + 2 * m })
    expect(frameOf(r, c)).toEqual({ fullWidth: 13_000_000, fullHeight: 9_000_000, offsetX: 6_000_000 - m, offsetY: 3_000_000 - m })
  })

  it('recorta sólo los lados que se salen; lo que no se ve da null', () => {
    const r = { left: 100, top: -500, width: 2000, height: 700 }
    expect(clipToScreen(r, 800, 600)).toEqual({ left: 100, top: -m, width: 800 + m - 100, height: 200 + m })
    expect(frameOf(r, clipToScreen(r, 800, 600)!)).toEqual({ fullWidth: 2000, fullHeight: 700, offsetX: 0, offsetY: 500 - m })
    expect(clipToScreen({ left: 900, top: 0, width: 50, height: 50 }, 800, 600)).toBeNull()
    expect(clipToScreen({ left: 0, top: -200, width: 50, height: 100 }, 800, 600)).toBeNull()
  })
})
