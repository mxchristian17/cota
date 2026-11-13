import { describe, expect, it } from 'vitest'
import { agentVisible, backButtonPos } from './phone'

const size = { w: 140, h: 40 }

describe('backButtonPos', () => {
  it('sin zoom: abajo a la derecha del dibujo, con margen', () => {
    const vv = { offsetLeft: 0, offsetTop: 0, width: 412, height: 915, scale: 1 }
    const draw = { left: 53, top: 57, right: 390, bottom: 753 }
    expect(backButtonPos(draw, vv, size)).toEqual({ left: 390 - 10 - 140, top: 753 - 10 - 40, scale: 1 })
  })

  it('con zoom y corrido: queda dentro de lo visible y del mismo tamaño en la pantalla', () => {
    const vv = { offsetLeft: 100, offsetTop: 50, width: 206, height: 457.5, scale: 2 }
    const draw = { left: 53, top: 57, right: 390, bottom: 753 }
    const p = backButtonPos(draw, vv, size)
    expect(p.scale).toBe(0.5)
    // ancho en la página = 70 px: el borde derecho no pasa lo visible (menos el margen escalado)
    expect(p.left + 70).toBeLessThanOrEqual(vv.offsetLeft + vv.width - 5)
    expect(p.top + 20).toBeLessThanOrEqual(vv.offsetTop + vv.height - 5)
    expect(p.left).toBeGreaterThanOrEqual(vv.offsetLeft)
    expect(p.top).toBeGreaterThanOrEqual(vv.offsetTop)
  })

  it('el dibujo fuera de lo visible no lo saca de la pantalla', () => {
    const vv = { offsetLeft: 0, offsetTop: 0, width: 200, height: 300, scale: 1 }
    const p = backButtonPos({ left: 0, top: 0, right: 1000, bottom: 2000 }, vv, size)
    expect(p).toEqual({ left: 200 - 140 - 10, top: 300 - 40 - 10, scale: 1 })
  })

  it('sin dibujo: arriba a la izquierda de lo visible', () => {
    const vv = { offsetLeft: 30, offsetTop: 20, width: 400, height: 800, scale: 1 }
    expect(backButtonPos(null, vv, size)).toEqual({ left: 40, top: 30, scale: 1 })
  })
})

describe('agentVisible', () => {
  it('en escritorio sigue la preferencia', () => {
    expect(agentVisible({ agentOpen: true, agentShown: false }, false)).toBe(true)
    expect(agentVisible({ agentOpen: false, agentShown: true }, false)).toBe(false)
  })

  it('en el celular arranca cerrado hasta abrirlo a mano', () => {
    expect(agentVisible({ agentOpen: true, agentShown: false }, true)).toBe(false)
    expect(agentVisible({ agentOpen: true, agentShown: true }, true)).toBe(true)
    expect(agentVisible({ agentOpen: false, agentShown: true }, true)).toBe(false)
  })
})
