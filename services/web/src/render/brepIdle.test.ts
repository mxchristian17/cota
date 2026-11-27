import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrepProps } from '../core/document/types'

/** Núcleo simulado: cuenta lo pedido en la cola de baja prioridad. */
const k = vi.hoisted(() => ({ bg: [] as string[], fg: false, results: new Set<string>(), cancels: 0 }))
vi.mock('./occtKernel', () => ({
  SPAWN_BACKLOG: 8,
  maxWorkers: () => 1,
  kernelAvailable: () => true,
  kernelResult: (key: string) => (k.results.has(key) ? { ok: true } : undefined),
  foregroundBusy: () => k.fg,
  backgroundPending: () => k.bg.length,
  requestKernelBackground: (key: string) => k.bg.push(key),
  cancelBackground: () => {
    k.cancels++
    k.bg.length = 0
  },
}))

const { IDLE_AFTER_MS, noteActivity, startIdleConversion, stopIdleConversion, tick, userIdle } = await import('./brepIdle')
const { sysvars } = await import('../core/commands/sysvars')

const piece = (i: number): BrepProps => ({
  op: 'BREP',
  ref: `r${i}`,
  box: [
    [0, 0, 0],
    [1, 1, 1],
  ],
})
const pieces = Array.from({ length: 20 }, (_, i) => piece(i))
let busy = false
let rev = 1

beforeEach(() => {
  k.bg.length = 0
  k.fg = false
  k.results.clear()
  busy = false
  rev++
  sysvars.SOLIDIDLE = 1
  startIdleConversion({ pieces: () => pieces, revision: () => rev, busy: () => busy })
  stopIdleConversion() // sin reloj: las vueltas se dan a mano
  k.cancels = 0
})

describe('conversión en los ratos libres', () => {
  it('sólo con calma: sin actividad del usuario, sin comandos ni trabajo normal del núcleo', () => {
    const t = performance.now()
    noteActivity()
    expect(userIdle(t + 100)).toBe(false)
    expect(tick(t + 100)).toBe(0)
    busy = true
    expect(tick(t + IDLE_AFTER_MS + 10)).toBe(0)
    busy = false
    k.fg = true
    expect(tick(t + IDLE_AFTER_MS + 10)).toBe(0)
    k.fg = false
    // En tandas chicas: las que dan trabajo a los Workers (8 por Worker).
    expect(tick(t + IDLE_AFTER_MS + 10)).toBe(8)
    expect(k.bg).toEqual(pieces.slice(0, 8).map((p) => JSON.stringify(p)))
  })

  it('una acción del usuario la corta y después se retoma (salteando lo ya calculado)', () => {
    const t = performance.now() + IDLE_AFTER_MS + 10
    tick(t)
    k.results.add(JSON.stringify(pieces[0]))
    noteActivity()
    expect(k.cancels).toBe(1)
    expect(k.bg).toHaveLength(0)
    const later = performance.now() + IDLE_AFTER_MS + 10
    expect(tick(later)).toBe(8)
    expect(k.bg[0]).toBe(JSON.stringify(pieces[1]))
  })

  it('terminada la lista no la vuelve a recorrer; con SOLIDIDLE = 0 no pide nada y vacía la cola', () => {
    const t = performance.now() + IDLE_AFTER_MS + 10
    for (const p of pieces) k.results.add(JSON.stringify(p))
    expect(tick(t)).toBe(0)
    k.results.clear()
    expect(tick(t)).toBe(0) // agotada hasta que cambie el dibujo
    rev++
    expect(tick(t)).toBe(8)
    sysvars.SOLIDIDLE = 0
    expect(tick(t)).toBe(0)
    expect(k.bg).toHaveLength(0)
  })
})
