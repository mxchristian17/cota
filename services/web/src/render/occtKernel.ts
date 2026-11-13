/**
 * Cliente del núcleo de sólidos exacto (OpenCascade en Workers, PRD082). Los Workers y el módulo (~4,7 MB comprimido)
 * se crean recién con el primer sólido que lo necesita. Los pedidos se atienden el más nuevo primero; si uno no vuelve
 * en 20 s (OCCT puede colgarse en casos límite), su Worker se descarta y se crea otro.
 *
 * Con muchos pedidos esperando (abrir un modelo con cientos de sólidos) se suman Workers, hasta `maxWorkers()` según
 * los núcleos y la memoria del equipo; los de más se cierran tras un rato sin trabajo.
 *
 * Los resultados quedan en un caché por árbol (`JSON.stringify(props)`) en memoria y, si se puede, en IndexedDB
 * (`kernelCache`): antes de mandar un árbol al Worker se busca ahí, así reabrir o recargar no recalcula. Quien dibuja
 * muestra un boceto mientras tanto y, cuando llega el resultado, `onKernelResults` avisa para reemplazarlo.
 */
import type { SolidProps } from '../core/document/types'
import type { OcctMesh, OcctStats } from '../core/occt/occtEval'
import type { KernelReply, KernelRequest } from '../core/occt/occt.worker'
import { LruCache } from '../core/lru'
import { loadResults, persistentCacheAvailable, saveResult } from './kernelCache'

export type KernelResult = { ok: true; mesh: OcctMesh; stats: OcctStats & { initMs: number } } | { ok: false; op: string; message: string; size?: number }

export const KERNEL_TIMEOUT_MS = 20_000
const TIMEOUT_MESSAGE = `no answer in ${KERNEL_TIMEOUT_MS / 1000} s`
/** Pedidos esperando a partir de los cuales conviene sumar otro Worker (bajar y compilar el módulo cuesta ~1-2 s). */
export const SPAWN_BACKLOG = 8
/** Un Worker de más sin trabajo se cierra pasado este tiempo (libera su memoria). */
const IDLE_MS = 30_000

const results = new LruCache<string, KernelResult>(1000)
const queue: Array<{ key: string; props: SolidProps }> = []
const queued = new Set<string>()
interface Job {
  id: number
  key: string
  props: SolidProps
}
interface Slot {
  w: Worker
  /**
   * Pedidos ya enviados (como mucho 2: el que calcula y el siguiente, así no espera al hilo principal). El primero es
   * el que está calculando desde `headSince`.
   */
  inflight: Job[]
  headSince: number
  watchdog: ReturnType<typeof setTimeout> | null
  idle: ReturnType<typeof setTimeout> | null
}
const slots: Slot[] = []
let seq = 0
let unavailable = typeof Worker === 'undefined' || typeof WebAssembly === 'undefined'

/** Árboles que se están buscando en el caché persistente. */
const looking = new Set<string>()
let lookupBatch: Array<{ key: string; props: SolidProps }> = []
let lookupTimer: ReturnType<typeof setTimeout> | null = null

type ResultsListener = (keys: string[]) => void
type MessageListener = (line: string) => void
const resultsListeners = new Set<ResultsListener>()
const messageListeners = new Set<MessageListener>()
let pendingKeys: string[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

/** Avisa (agrupado cada ~50 ms) qué árboles tienen resultado nuevo. Devuelve la función para dejar de escuchar. */
export function onKernelResults(fn: ResultsListener): () => void {
  resultsListeners.add(fn)
  return () => resultsListeners.delete(fn)
}

/** Mensajes para la línea de comandos (fallas del núcleo exacto). */
export function onKernelMessage(fn: MessageListener): () => void {
  messageListeners.add(fn)
  return () => messageListeners.delete(fn)
}

/** ¿Se puede usar el núcleo exacto en este navegador? (false también si su módulo no compiló). */
export function kernelAvailable(): boolean {
  return !unavailable
}

export function kernelResult(key: string): KernelResult | undefined {
  return results.get(key)
}

/** Cuántos Workers se usan como mucho: la mitad de los núcleos, hasta 3, y menos con poca memoria (celulares). */
export function maxWorkers(cores = navigatorCores(), memoryGb = navigatorMemory()): number {
  const byMemory = memoryGb === undefined ? 3 : memoryGb < 4 ? 1 : memoryGb < 8 ? 2 : 3
  return Math.max(1, Math.min(3, Math.floor(cores / 2), byMemory))
}
const navigatorCores = (): number => (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2
const navigatorMemory = (): number | undefined => (typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined)

/** Pide el árbol al núcleo (si no está ya pedido o resuelto). Primero lo busca en el caché persistente. */
export function requestKernel(key: string, props: SolidProps): void {
  if (unavailable || results.get(key) || queued.has(key) || looking.has(key) || slots.some((s) => s.inflight.some((j) => j.key === key))) return
  if (!persistentCacheAvailable()) return enqueue(key, props)
  looking.add(key)
  lookupBatch.push({ key, props })
  lookupTimer ??= setTimeout(() => void lookup(), 0)
}

/** Busca juntos en IndexedDB los árboles pedidos en un mismo dibujado; lo que no está va a los Workers. */
async function lookup(): Promise<void> {
  lookupTimer = null
  const batch = lookupBatch
  lookupBatch = []
  let found = new Map<string, KernelResult>()
  try {
    found = await loadResults(batch.map((b) => b.key))
  } catch {
    /* sin caché: se calcula todo */
  }
  for (const b of batch) {
    looking.delete(b.key)
    const r = found.get(b.key)
    if (r) {
      results.set(b.key, r)
      if (!r.ok) report(b.props, r)
      notify(b.key)
    } else if (!unavailable) {
      queue.push(b)
      queued.add(b.key)
    }
  }
  pump()
}

function enqueue(key: string, props: SolidProps): void {
  queue.push({ key, props })
  queued.add(key)
  pump()
}

/** Olvida los resultados en memoria (al cambiar de núcleo). */
export function clearKernelResults(): void {
  results.clear()
}

function emitMessage(line: string): void {
  for (const fn of messageListeners) fn(line)
}

function notify(key: string): void {
  pendingKeys.push(key)
  flushTimer ??= setTimeout(() => {
    const keys = pendingKeys
    pendingKeys = []
    flushTimer = null
    for (const fn of resultsListeners) fn(keys)
  }, 50)
}

function spawn(): Slot {
  const w = new Worker(new URL('../core/occt/occt.worker.ts', import.meta.url), { type: 'module' })
  const slot: Slot = { w, inflight: [], headSince: 0, watchdog: null, idle: null }
  w.onmessage = (ev: MessageEvent<KernelReply>) => finish(slot, ev.data)
  w.onerror = (ev) => {
    ev.preventDefault()
    const head = slot.inflight[0]
    if (head) finish(slot, { id: head.id, ok: false, op: 'INIT', message: ev.message || 'worker error', fatal: true })
  }
  slots.push(slot)
  return slot
}

function pump(): void {
  if (unavailable) return
  // Un Worker cada `SPAWN_BACKLOG` pedidos pendientes, hasta el máximo (en paralelo, cada uno con su módulo).
  const backlog = queue.length + slots.reduce((n, s) => n + s.inflight.length, 0)
  const want = backlog ? Math.min(maxWorkers(), Math.ceil(backlog / SPAWN_BACKLOG)) : 0
  while (slots.length < want) spawn()
  for (const slot of slots) {
    while (slot.inflight.length < 2 && queue.length) {
      const job = queue.pop()! // el más nuevo primero: lo que el usuario acaba de hacer
      queued.delete(job.key)
      const id = ++seq
      if (!slot.inflight.length) slot.headSince = performance.now()
      slot.inflight.push({ id, key: job.key, props: job.props })
      slot.w.postMessage({ id, props: job.props } satisfies KernelRequest)
    }
    arm(slot, KERNEL_TIMEOUT_MS)
    idleCheck(slot)
  }
}

/** Los Workers de más que quedan sin trabajo se cierran después de un rato (el primero queda, con su módulo listo). */
function idleCheck(slot: Slot): void {
  if (slot.idle) clearTimeout(slot.idle)
  slot.idle = null
  if (slot.inflight.length || slots.indexOf(slot) === 0) return
  slot.idle = setTimeout(() => {
    slot.idle = null
    if (!slot.inflight.length) drop(slot)
  }, IDLE_MS)
}

function drop(slot: Slot): void {
  slot.w.terminate()
  if (slot.watchdog) clearTimeout(slot.watchdog)
  if (slot.idle) clearTimeout(slot.idle)
  slot.watchdog = slot.idle = null
  const i = slots.indexOf(slot)
  if (i >= 0) slots.splice(i, 1)
}

/**
 * Vigila que el pedido en curso no pase de `KERNEL_TIMEOUT_MS`. Si el hilo principal estuvo trabado (el aviso llega
 * tarde), no se decide nada: se vuelve a mirar en un rato, así la respuesta que quedó en cola se procesa antes.
 */
function arm(slot: Slot, ms: number): void {
  if (slot.watchdog) clearTimeout(slot.watchdog)
  slot.watchdog = null
  if (!slot.inflight.length) return
  const due = performance.now() + ms
  slot.watchdog = setTimeout(() => {
    slot.watchdog = null
    const now = performance.now()
    if (!slot.inflight.length) return
    if (now - due > 1000) return arm(slot, 1000)
    const elapsed = now - slot.headSince
    if (elapsed < KERNEL_TIMEOUT_MS) return arm(slot, KERNEL_TIMEOUT_MS - elapsed)
    hang(slot)
  }, ms)
}

function hang(slot: Slot): void {
  const head = slot.inflight.shift()
  if (!head) return
  // El que seguía vuelve a la cola; el colgado queda como falla (malla).
  for (const j of slot.inflight.splice(0)) {
    queue.push({ key: j.key, props: j.props })
    queued.add(j.key)
  }
  drop(slot)
  settle(head, { id: head.id, ok: false, op: head.props.op, message: TIMEOUT_MESSAGE })
  pump()
}

function finish(slot: Slot, r: KernelReply): void {
  const i = slot.inflight.findIndex((j) => j.id === r.id)
  if (i < 0) return
  const [job] = slot.inflight.splice(i, 1)
  slot.headSince = performance.now()
  if (!r.ok && r.fatal) {
    // Sin núcleo en este navegador (o no se pudo bajar el módulo): queda la malla para todos los sólidos. Se avisa
    // por los que esperaban, para que se dibujen con la malla.
    unavailable = true
    const waiting = [job.key, ...queue.map((q) => q.key), ...slots.flatMap((s) => s.inflight.map((j) => j.key))]
    for (const s of [...slots]) drop(s)
    queue.length = 0
    queued.clear()
    for (const key of waiting) notify(key)
    emitMessage('The exact solid kernel cannot run in this browser; solids are shown with the mesh kernel.')
    console.warn('Cota: exact solid kernel unavailable.', r.message)
    return
  }
  settle(job, r)
  pump()
}

function settle(job: Job, r: KernelReply): void {
  const res: KernelResult = r.ok ? { ok: true, mesh: r.mesh, stats: r.stats } : { ok: false, op: r.op, message: r.message, size: r.size }
  results.set(job.key, res)
  if (!res.ok) report(job.props, res)
  // Las fallas por tiempo pueden ser circunstanciales (el equipo estaba ocupado): ésas no se guardan.
  if (persistentCacheAvailable() && (res.ok || res.message !== TIMEOUT_MESSAGE)) saveResult(job.key, res)
  notify(job.key)
}

const fmt = (n: number | undefined): string => (n === undefined ? '' : String(Math.round(n * 1e6) / 1e6))
let reported = 0
let reportWindow = 0

/** Explica en la línea de comandos por qué un sólido queda con la malla (como mucho 5 avisos cada 10 s). */
function report(props: SolidProps, r: Extract<KernelResult, { ok: false }>): void {
  const now = Date.now()
  if (now - reportWindow > 10_000) {
    reportWindow = now
    reported = 0
  }
  if (++reported > 5) {
    if (reported === 6) emitMessage('More solids could not be built exactly; they are shown with the mesh kernel.')
    return
  }
  console.warn('Cota: exact solid kernel failed.', r.op, r.message, props.op)
  if (r.message === TIMEOUT_MESSAGE)
    emitMessage(`${r.op}: the exact solid kernel took more than ${KERNEL_TIMEOUT_MS / 1000} s; this solid is shown with the mesh kernel.`)
  else if (r.op === 'FILLETEDGE')
    emitMessage(`FILLETEDGE: radius ${fmt(r.size)} cannot round those edges (it is probably too large for them). The approximate mesh result is shown; undo and try a smaller radius.`)
  else if (r.op === 'CHAMFEREDGE')
    emitMessage(`CHAMFEREDGE: distance ${fmt(r.size)} cannot chamfer those edges (it is probably too large for them). The approximate mesh result is shown; undo and try a smaller distance.`)
  else if (r.op === 'SHELL') emitMessage(`SHELL: a wall of ${fmt(r.size)} cannot be built exactly. The approximate mesh result is shown.`)
  else emitMessage(`${r.op}: the exact solid kernel could not build this solid; it is shown with the mesh kernel.`)
}
