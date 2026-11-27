import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrepProps } from '../core/document/types'

/** Núcleo simulado: los resultados se cargan a mano y se avisan como lo hace el de verdad. */
const k = vi.hoisted(() => ({
  results: new Map<string, { ok: boolean }>(),
  listeners: [] as Array<(keys: string[]) => void>,
  requested: [] as Array<{ key: string; urgent: boolean }>,
  dropped: [] as string[][],
}))
vi.mock('./occtKernel', () => ({
  requestKernel: (key: string, _p: unknown, urgent = false) => k.requested.push({ key, urgent }),
  dropKernelRequests: (keys: Set<string>) => k.dropped.push([...keys]),
  kernelResult: (key: string) => k.results.get(key),
  onKernelResults: (fn: (keys: string[]) => void) => {
    k.listeners.push(fn)
    return () => (k.listeners = k.listeners.filter((f) => f !== fn))
  },
}))

const { brepWanted, convertAll, convertNow, unwantBreps } = await import('./brepConvert')

const piece = (ref: string, dx = 0): BrepProps => ({
  op: 'BREP',
  ref,
  box: [
    [0, 0, 0],
    [1, 1, 1],
  ],
  ...(dx ? { m: [1, 0, 0, dx, 0, 1, 0, 0, 0, 0, 1, 0] } : {}),
})
const arrive = (p: BrepProps, ok = true) => {
  k.results.set(JSON.stringify(p), { ok })
  for (const fn of k.listeners) fn([JSON.stringify(p)])
}

beforeEach(() => {
  k.results.clear()
  k.requested.length = 0
  k.dropped.length = 0
  unwantBreps(['a', 'b', 'c'])
})

describe('conversión de los sólidos importados al núcleo exacto', () => {
  it('modo mallas: al seleccionar, la pieza (todas sus copias) pasa al núcleo y adelante en la cola', () => {
    expect(brepWanted('a')).toBe(false)
    expect(convertNow([piece('a')])).toBe(true)
    expect(brepWanted('a')).toBe(true)
    expect(k.requested).toEqual([{ key: JSON.stringify(piece('a')), urgent: true }])
    expect(convertNow([piece('a')])).toBe(false) // ya se convertía
  })

  it('conversión completa: pide todas (cada copia con su matriz), avisa el avance y termina', async () => {
    const pieces = [piece('a'), piece('a', 5), piece('b')]
    const seen: number[] = []
    const c = convertAll(pieces, (p) => seen.push(p.done))
    expect(k.requested).toHaveLength(3)
    expect(['a', 'b'].every(brepWanted)).toBe(true)
    arrive(pieces[0])
    arrive(pieces[1], false)
    arrive(pieces[2])
    const r = await c.finished
    expect(r).toEqual({ done: 3, total: 3, failed: 1, cancelled: false })
    expect(seen).toEqual([0, 1, 2, 3])
  })

  it('cancelar: saca de la cola lo que falta y esos modelos vuelven a mallas (no los que ya tienen una copia hecha)', async () => {
    const pieces = [piece('a'), piece('a', 5), piece('b'), piece('c')]
    const c = convertAll(pieces, () => {})
    arrive(pieces[0])
    c.cancel()
    const r = await c.finished
    expect(r).toMatchObject({ done: 1, total: 4, cancelled: true })
    expect(k.dropped[0].sort()).toEqual([pieces[1], pieces[2], pieces[3]].map((p) => JSON.stringify(p)).sort())
    expect(brepWanted('a')).toBe(true)
    expect(brepWanted('b')).toBe(false)
    expect(brepWanted('c')).toBe(false)
  })
})
