import { describe, expect, it } from 'vitest'
import { isDoubleTap, isTap, pinchStep } from './touchGesture'

describe('pinchStep', () => {
  it('separar los dedos acerca (zoom < 1) y juntarlos aleja', () => {
    expect(pinchStep({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: -50, y: 0 }, { x: 150, y: 0 }).zoom).toBeCloseTo(0.5)
    expect(pinchStep({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 25, y: 0 }, { x: 75, y: 0 }).zoom).toBeCloseTo(2)
  })
  it('acota el paso y no hace zoom con los dedos juntos', () => {
    expect(pinchStep({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }).zoom).toBe(2)
    expect(pinchStep({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 0 }).zoom).toBe(1)
  })
  it('mover los dos dedos juntos desplaza el centro', () => {
    const r = pinchStep({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 10, y: 20 }, { x: 110, y: 20 })
    expect(r.zoom).toBeCloseTo(1)
    expect(r.pan).toEqual({ x: 10, y: 20 })
    expect(r.mid).toEqual({ x: 60, y: 20 })
  })
})

describe('toques', () => {
  it('un toque es corto y casi sin moverse', () => {
    expect(isTap({ x: 0, y: 0, t: 0 }, { x: 4, y: 3, t: 120 })).toBe(true)
    expect(isTap({ x: 0, y: 0, t: 0 }, { x: 30, y: 0, t: 120 })).toBe(false)
    expect(isTap({ x: 0, y: 0, t: 0 }, { x: 0, y: 0, t: 900 })).toBe(false)
  })
  it('doble toque: dos toques cerca y seguidos', () => {
    expect(isDoubleTap({ x: 0, y: 0, t: 0 }, { x: 10, y: 5, t: 250 })).toBe(true)
    expect(isDoubleTap({ x: 0, y: 0, t: 0 }, { x: 10, y: 5, t: 600 })).toBe(false)
    expect(isDoubleTap(null, { x: 0, y: 0, t: 0 })).toBe(false)
  })
})
