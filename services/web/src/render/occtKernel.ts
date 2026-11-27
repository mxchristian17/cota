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
import { brepSourcesOf } from '../core/document/brepStore'
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
/** Pedidos en curso por Worker con mucha cola (en una conversión completa, una pieza importada tarda ~30 ms). */
const DEEP_INFLIGHT = 32
/** Un Worker de más sin trabajo se cierra pasado este tiempo (libera su memoria). */
const IDLE_MS = 30_000

// Alcanza para un ensamble importado entero convertido (miles de piezas, ver `brepConvert`).
const results = new LruCache<string, KernelResult>(10000)
const queue: Pending[] = []
const queued = new Set<string>()
interface Job {
  id: number
  key: string
  props: SolidProps
  /** Teselado fino de una pieza importada (para una vista). */
  fine?: boolean
  /** De la cola de baja prioridad (lo que se calcula en los ratos libres). */
  bg?: boolean
}

/** Un pedido que espera: su clave, el árbol y si va con el teselado fino o en la cola de baja prioridad. */
type Pending = { key: string; props: SolidProps; fine?: boolean; bg?: boolean }

/**
 * Cola de baja prioridad (ver `render/brepIdle.ts`): sólo sale con la cola normal vacía y de a un pedido por Worker
 * libre, así lo que pide el usuario espera a lo sumo un sólido. `cancelBackground` la vacía.
 */
const bgQueue: Pending[] = []
const bgQueued = new Set<string>()
/** Claves que resolvió la cola de baja prioridad, hasta que las lee `wasBackground`. */
const bgDone = new Set<string>()
/** Los de baja prioridad que se buscan en el caché (el mismo objeto que va en la tanda de la búsqueda). */
const lookingBg = new Map<string, Pending>()
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
/** Buscándose en el caché cuando se cancelaron: si no están, no se calculan. */
const dropped = new Set<string>()
let lookupBatch: Pending[] = []
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
export function requestKernel(key: string, props: SolidProps, urgent = false, fine = false): void {
  dropped.delete(key) // se vuelve a pedir después de cancelar
  if (bgQueued.has(key)) {
    // Lo pide el usuario: sale de la cola de baja prioridad y va a la normal.
    bgQueued.delete(key)
    bgQueue.splice(bgQueue.findIndex((q) => q.key === key), 1)
  }
  const bgLook = lookingBg.get(key)
  if (bgLook) {
    // Se busca en el caché como de baja prioridad: si no está, va a la cola normal.
    bgLook.bg = false
    lookingBg.delete(key)
  }
  if (urgent && queued.has(key)) {
    // Lo pide el usuario (seleccionó o editó la pieza): pasa adelante de lo que ya esperaba (la cola sale del final).
    const i = queue.findIndex((q) => q.key === key)
    if (i >= 0) queue.push(...queue.splice(i, 1))
    return
  }
  if (unavailable || results.get(key) || queued.has(key) || looking.has(key) || slots.some((s) => s.inflight.some((j) => j.key === key))) return
  if (!persistentCacheAvailable()) return enqueue({ key, props, ...(fine ? { fine } : {}) })
  looking.add(key)
  lookupBatch.push({ key, props, ...(fine ? { fine } : {}) })
  lookupTimer ??= setTimeout(() => void lookup(), 0)
}

/** Pide un sólido en la cola de baja prioridad (si nadie lo pidió ni está calculado). */
export function requestKernelBackground(key: string, props: SolidProps): void {
  if (unavailable || results.get(key) || queued.has(key) || bgQueued.has(key) || looking.has(key) || slots.some((s) => s.inflight.some((j) => j.key === key))) return
  if (!persistentCacheAvailable()) {
    bgQueue.push({ key, props, bg: true })
    bgQueued.add(key)
    return pump()
  }
  const job: Pending = { key, props, bg: true }
  looking.add(key)
  lookingBg.set(key, job)
  lookupBatch.push(job)
  lookupTimer ??= setTimeout(() => void lookup(), 0)
}

/** Vacía la cola de baja prioridad (el usuario hizo algo): lo que se calcula, termina. */
export function cancelBackground(): void {
  for (const q of bgQueue) bgQueued.delete(q.key)
  bgQueue.length = 0
  lookupBatch = lookupBatch.filter((b) => {
    if (!b.bg) return true
    looking.delete(b.key)
    lookingBg.delete(b.key)
    return false
  })
  // Los que ya se están buscando: si no están en el caché, no se calculan.
  for (const k of lookingBg.keys()) dropped.add(k)
  lookingBg.clear()
}

/** Pedidos de baja prioridad que esperan o se calculan. */
export const backgroundPending = (): number => bgQueue.length + slots.reduce((n, s) => n + s.inflight.filter((j) => j.bg).length, 0) + lookupBatch.filter((b) => b.bg).length

/** ¿Hay trabajo pedido por el usuario o por Cota (no de baja prioridad) esperando o en curso? */
export const foregroundBusy = (): boolean => queue.length > 0 || slots.some((s) => s.inflight.some((j) => !j.bg)) || lookupBatch.some((b) => !b.bg)

/** ¿La clave la resolvió la cola de baja prioridad? (una sola vez por clave). */
export function wasBackground(key: string): boolean {
  return bgDone.delete(key)
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
    lookingBg.delete(b.key)
    const r = found.get(b.key)
    if (r) {
      results.set(b.key, r)
      if (!r.ok && !b.bg) report(b.props, r)
      if (b.bg) bgDone.add(b.key)
      notify(b.key)
    } else if (dropped.has(b.key)) dropped.delete(b.key)
    else if (unavailable) continue
    else if (b.bg) {
      bgQueue.push(b)
      bgQueued.add(b.key)
    } else {
      queue.push(b)
      queued.add(b.key)
    }
  }
  pump()
}

function enqueue(job: Pending): void {
  queue.push(job)
  queued.add(job.key)
  pump()
}

/** Saca de la cola los pedidos que todavía esperan (cancelar una conversión); los que se calculan, terminan. */
export function dropKernelRequests(keys: ReadonlySet<string>): void {
  const keep = queue.filter((q) => !keys.has(q.key))
  for (const q of queue) if (keys.has(q.key)) queued.delete(q.key)
  queue.length = 0
  queue.push(...keep)
  lookupBatch = lookupBatch.filter((b) => {
    if (!keys.has(b.key)) return true
    looking.delete(b.key)
    return false
  })
  // Los que se están buscando en el caché: si no están, no van a los Workers.
  for (const k of keys) if (looking.has(k)) dropped.add(k)
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
  const backlog = queue.length + bgQueue.length + slots.reduce((n, s) => n + s.inflight.length, 0)
  const want = backlog ? Math.min(maxWorkers(), Math.ceil(backlog / SPAWN_BACKLOG)) : 0
  while (slots.length < want) spawn()
  // Con mucha cola (una conversión completa) cada Worker recibe más pedidos juntos (~1 s de trabajo): sigue trabajando
  // mientras el hilo principal redibuja, en vez de esperar a que conteste.
  const depth = queue.length > 4 * SPAWN_BACKLOG ? DEEP_INFLIGHT : 2
  for (const slot of slots) {
    while (slot.inflight.length < depth && queue.length) {
      const job = queue.pop()! // el más nuevo primero: lo que el usuario acaba de hacer
      queued.delete(job.key)
      const id = ++seq
      if (!slot.inflight.length) slot.headSince = performance.now()
      slot.inflight.push({ id, key: job.key, props: job.props, ...(job.fine ? { fine: true } : {}) })
      slot.w.postMessage({ id, props: job.props, models: brepSourcesOf([job.props]), ...(job.fine ? { fine: true } : {}) } satisfies KernelRequest)
    }
    // Baja prioridad: sólo con la cola normal vacía y de a uno por Worker libre.
    if (!queue.length && !slot.inflight.length && bgQueue.length) {
      const job = bgQueue.shift()!
      bgQueued.delete(job.key)
      const id = ++seq
      slot.headSince = performance.now()
      slot.inflight.push({ id, key: job.key, props: job.props, bg: true })
      slot.w.postMessage({ id, props: job.props, models: brepSourcesOf([job.props]) } satisfies KernelRequest)
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
    if (j.bg) {
      bgQueue.push({ key: j.key, props: j.props, bg: true })
      bgQueued.add(j.key)
      continue
    }
    queue.push({ key: j.key, props: j.props, ...(j.fine ? { fine: true } : {}) })
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
  if (job.bg) bgDone.add(job.key)
  // Lo de los ratos libres no se avisa en la línea de comandos (queda la malla, como estaba).
  if (!res.ok && !job.bg) report(job.props, res)
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
  else if (r.op === 'BREP') emitMessage(`Imported solid: ${r.message}; it is shown with its mesh.`)
  else emitMessage(`${r.op}: the exact solid kernel could not build this solid; it is shown with the mesh kernel.`)
}
