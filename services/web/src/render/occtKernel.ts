/**
 * Cliente del núcleo de sólidos exacto (OpenCascade en un Worker, PRD082). El Worker y el módulo (~4,7 MB comprimido)
 * se crean recién con el primer sólido que lo necesita. Los pedidos se atienden de a uno, el más nuevo primero; si
 * uno no vuelve en 20 s (OCCT puede colgarse en casos límite), el Worker se descarta y se crea otro.
 *
 * Los resultados quedan en un caché por árbol (`JSON.stringify(props)`); quien dibuja muestra la malla de siempre
 * mientras tanto y, cuando llega el resultado, `onKernelResults` avisa para reemplazarla.
 */
import type { SolidProps } from '../core/document/types'
import type { OcctMesh, OcctStats } from '../core/occt/occtEval'
import type { KernelReply, KernelRequest } from '../core/occt/occt.worker'
import { LruCache } from '../core/lru'

export type KernelResult = { ok: true; mesh: OcctMesh; stats: OcctStats & { initMs: number } } | { ok: false; op: string; message: string; size?: number }

export const KERNEL_TIMEOUT_MS = 20_000
const TIMEOUT_MESSAGE = `no answer in ${KERNEL_TIMEOUT_MS / 1000} s`

const results = new LruCache<string, KernelResult>(600)
const queue: Array<{ key: string; props: SolidProps }> = []
const queued = new Set<string>()
let worker: Worker | null = null
interface Job {
  id: number
  key: string
  props: SolidProps
}
/**
 * Pedidos ya enviados al Worker (como mucho 2: el que calcula y el siguiente, así no espera al hilo principal). El
 * primero es el que está calculando desde `headSince`.
 */
const inflight: Job[] = []
let headSince = 0
let watchdog: ReturnType<typeof setTimeout> | null = null
let seq = 0
let unavailable = typeof Worker === 'undefined' || typeof WebAssembly === 'undefined'

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

/** Pide el árbol al núcleo (si no está ya pedido o resuelto). */
export function requestKernel(key: string, props: SolidProps): void {
  if (unavailable || results.get(key) || queued.has(key) || inflight.some((j) => j.key === key)) return
  queue.push({ key, props })
  queued.add(key)
  pump()
}

/** Olvida los resultados (al cambiar de núcleo). */
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

function spawn(): Worker {
  const w = new Worker(new URL('../core/occt/occt.worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (ev: MessageEvent<KernelReply>) => finish(ev.data)
  w.onerror = (ev) => {
    ev.preventDefault()
    const head = inflight[0]
    if (head) finish({ id: head.id, ok: false, op: 'INIT', message: ev.message || 'worker error', fatal: true })
  }
  return w
}

function pump(): void {
  while (!unavailable && inflight.length < 2 && queue.length) {
    const job = queue.pop()! // el más nuevo primero: lo que el usuario acaba de hacer
    queued.delete(job.key)
    worker ??= spawn()
    const id = ++seq
    if (!inflight.length) headSince = performance.now()
    inflight.push({ id, key: job.key, props: job.props })
    worker.postMessage({ id, props: job.props } satisfies KernelRequest)
  }
  arm(KERNEL_TIMEOUT_MS)
}

/**
 * Vigila que el pedido en curso no pase de `KERNEL_TIMEOUT_MS`. Si el hilo principal estuvo trabado (el aviso llega
 * tarde), no se decide nada: se vuelve a mirar en un rato, así la respuesta que quedó en cola se procesa antes.
 */
function arm(ms: number): void {
  if (watchdog) clearTimeout(watchdog)
  watchdog = null
  if (!inflight.length) return
  const due = performance.now() + ms
  watchdog = setTimeout(() => {
    watchdog = null
    const now = performance.now()
    if (!inflight.length) return
    if (now - due > 1000) return arm(1000)
    const elapsed = now - headSince
    if (elapsed < KERNEL_TIMEOUT_MS) return arm(KERNEL_TIMEOUT_MS - elapsed)
    hang()
  }, ms)
}

function hang(): void {
  const head = inflight.shift()
  if (!head) return
  worker?.terminate()
  worker = null
  // El que seguía vuelve a la cola; el colgado queda como falla (malla).
  for (const j of inflight.splice(0)) {
    queue.push({ key: j.key, props: j.props })
    queued.add(j.key)
  }
  settle(head, { id: head.id, ok: false, op: head.props.op, message: TIMEOUT_MESSAGE })
  pump()
}

function finish(r: KernelReply): void {
  const i = inflight.findIndex((j) => j.id === r.id)
  if (i < 0) return
  const [job] = inflight.splice(i, 1)
  headSince = performance.now()
  if (!r.ok && r.fatal) {
    // Sin núcleo en este navegador (o no se pudo bajar el módulo): queda la malla para todos los sólidos.
    unavailable = true
    worker?.terminate()
    worker = null
    inflight.length = 0
    queue.length = 0
    queued.clear()
    arm(0)
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
