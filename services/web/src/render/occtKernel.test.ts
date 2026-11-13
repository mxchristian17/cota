import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SolidProps } from '../core/document/types'

/** Worker de mentira: guarda lo que recibe y deja contestar a mano. */
class FakeWorker {
  static all: FakeWorker[] = []
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onerror: ((ev: { message: string; preventDefault: () => void }) => void) | null = null
  posted: Array<{ id: number; props: SolidProps }> = []
  terminated = false
  constructor() {
    FakeWorker.all.push(this)
  }
  postMessage(m: { id: number; props: SolidProps }): void {
    this.posted.push(m)
  }
  terminate(): void {
    this.terminated = true
  }
  reply(data: Record<string, unknown>): void {
    this.onmessage?.({ data })
  }
}

const box = (w: number): SolidProps => ({ op: 'FILLETEDGE', solid: { op: 'BOX', origin: [0, 0, 0], width: w, depth: 1, height: 1 }, edges: [{ at: [0.5, 0, 0] }], radius: 0.2 })
const okMesh = { positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2]), triGroup: new Uint32Array(1), spheres: [] }
const okStats = { ms: 1, attempts: 1, strategy: 'direct', volume: 1, faces: 1, initMs: 1 }

async function load() {
  vi.resetModules()
  FakeWorker.all = []
  vi.stubGlobal('Worker', FakeWorker)
  return import('./occtKernel')
}

describe('cliente del núcleo exacto', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('crea el Worker con el primer pedido, guarda el resultado y avisa', async () => {
    const k = await load()
    const seen: string[][] = []
    k.onKernelResults((keys) => seen.push(keys))
    expect(FakeWorker.all).toHaveLength(0)
    const p = box(1)
    const key = JSON.stringify(p)
    k.requestKernel(key, p)
    k.requestKernel(key, p) // el repetido no se vuelve a mandar
    const w = FakeWorker.all[0]
    expect(w.posted).toHaveLength(1)
    w.reply({ id: w.posted[0].id, ok: true, mesh: okMesh, stats: okStats })
    expect(k.kernelResult(key)?.ok).toBe(true)
    vi.advanceTimersByTime(60)
    expect(seen).toEqual([[key]])
  })

  it('manda dos a la vez y, de lo que espera, primero lo más nuevo', async () => {
    const k = await load()
    const [a, b, c, d] = [1, 2, 3, 4].map(box)
    for (const p of [a, b, c, d]) k.requestKernel(JSON.stringify(p), p)
    const w = FakeWorker.all[0]
    expect(w.posted.map((m) => m.props)).toEqual([a, b])
    w.reply({ id: w.posted[0].id, ok: true, mesh: okMesh, stats: okStats })
    expect(w.posted.map((m) => m.props)).toEqual([a, b, d])
  })

  it('si no contesta en 20 s, descarta el Worker, avisa y sigue con otro', async () => {
    const k = await load()
    const lines: string[] = []
    k.onKernelMessage((l) => lines.push(l))
    const [a, b] = [1, 2].map(box)
    k.requestKernel(JSON.stringify(a), a)
    k.requestKernel(JSON.stringify(b), b)
    vi.advanceTimersByTime(k.KERNEL_TIMEOUT_MS + 10)
    expect(FakeWorker.all[0].terminated).toBe(true)
    expect(k.kernelResult(JSON.stringify(a))).toMatchObject({ ok: false })
    expect(lines.some((l) => l.startsWith('FILLETEDGE: the exact solid kernel took more than 20 s'))).toBe(true)
    // El segundo se reenvía al Worker nuevo.
    expect(FakeWorker.all[1].posted.map((m) => m.props)).toEqual([b])
  })

  it('si el hilo principal estuvo trabado no lo da por colgado: espera a procesar la respuesta', async () => {
    const k = await load()
    const a = box(1)
    k.requestKernel(JSON.stringify(a), a)
    // El aviso del vigilante llega 5 s tarde (hilo principal ocupado): se vuelve a mirar en 1 s.
    vi.advanceTimersByTime(k.KERNEL_TIMEOUT_MS - 1)
    const now = performance.now.bind(performance)
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => now() + 5000)
    vi.advanceTimersByTime(2)
    spy.mockRestore()
    expect(FakeWorker.all[0].terminated).toBe(false)
    FakeWorker.all[0].reply({ id: FakeWorker.all[0].posted[0].id, ok: true, mesh: okMesh, stats: okStats })
    expect(k.kernelResult(JSON.stringify(a))?.ok).toBe(true)
  })

  it('si el navegador no puede con el módulo, queda la malla para todo', async () => {
    const k = await load()
    const lines: string[] = []
    k.onKernelMessage((l) => lines.push(l))
    const a = box(1)
    k.requestKernel(JSON.stringify(a), a)
    const w = FakeWorker.all[0]
    w.reply({ id: w.posted[0].id, ok: false, op: 'INIT', message: 'CompileError', fatal: true })
    expect(k.kernelAvailable()).toBe(false)
    expect(lines[0]).toContain('cannot run in this browser')
    k.requestKernel(JSON.stringify(box(2)), box(2))
    expect(FakeWorker.all).toHaveLength(1)
  })

  it('si el módulo no carga, avisa por los que esperaban (para dibujarlos con la malla)', async () => {
    const k = await load()
    const seen: string[] = []
    k.onKernelResults((keys) => seen.push(...keys))
    const [a, b, c] = [1, 2, 3].map(box)
    for (const p of [a, b, c]) k.requestKernel(JSON.stringify(p), p)
    const w = FakeWorker.all[0]
    w.reply({ id: w.posted[0].id, ok: false, op: 'INIT', message: 'CompileError', fatal: true })
    vi.advanceTimersByTime(60)
    expect(seen.sort()).toEqual([a, b, c].map((p) => JSON.stringify(p)).sort())
  })

  it('con muchos pedidos esperando suma Workers en paralelo, hasta el máximo', async () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 8, deviceMemory: 8 })
    const k = await load()
    const list = Array.from({ length: 30 }, (_, i) => box(i + 1))
    for (const p of list) k.requestKernel(JSON.stringify(p), p)
    expect(FakeWorker.all).toHaveLength(3)
    for (const w of FakeWorker.all) expect(w.posted).toHaveLength(2)
    // Cada uno sigue con lo que espera, el más nuevo primero.
    const w = FakeWorker.all[1]
    w.reply({ id: w.posted[0].id, ok: true, mesh: okMesh, stats: okStats })
    expect(w.posted[2].props).toEqual(list[29])
  })

  it('pocos pedidos usan un solo Worker; el máximo depende de núcleos y memoria', async () => {
    const k = await load()
    for (const p of [1, 2, 3, 4, 5].map(box)) k.requestKernel(JSON.stringify(p), p)
    expect(FakeWorker.all).toHaveLength(1)
    expect(k.maxWorkers(2, 8)).toBe(1)
    expect(k.maxWorkers(8, 2)).toBe(1)
    expect(k.maxWorkers(8, 4)).toBe(2)
    expect(k.maxWorkers(16, 8)).toBe(3)
    expect(k.maxWorkers(8, undefined)).toBe(3)
  })

  it('busca primero en el caché persistente: lo guardado no va al Worker y lo nuevo se guarda', async () => {
    const [a, b] = [1, 2].map(box)
    const saved: string[] = []
    vi.doMock('./kernelCache', () => ({
      persistentCacheAvailable: () => true,
      loadResults: async (keys: string[]) => new Map(keys.filter((x) => x === JSON.stringify(a)).map((x) => [x, { ok: true, mesh: okMesh, stats: okStats }])),
      saveResult: (key: string) => void saved.push(key),
    }))
    const k = await load()
    const seen: string[] = []
    k.onKernelResults((keys) => seen.push(...keys))
    k.requestKernel(JSON.stringify(a), a)
    k.requestKernel(JSON.stringify(b), b)
    k.requestKernel(JSON.stringify(b), b) // el repetido mientras se busca no se vuelve a pedir
    expect(FakeWorker.all).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(k.kernelResult(JSON.stringify(a))?.ok).toBe(true)
    const w = FakeWorker.all[0]
    expect(FakeWorker.all).toHaveLength(1)
    expect(w.posted.map((m) => m.props)).toEqual([b])
    w.reply({ id: w.posted[0].id, ok: true, mesh: okMesh, stats: okStats })
    expect(saved).toEqual([JSON.stringify(b)])
    vi.advanceTimersByTime(60)
    expect(seen.sort()).toEqual([a, b].map((p) => JSON.stringify(p)).sort())
    vi.doUnmock('./kernelCache')
  })
})
