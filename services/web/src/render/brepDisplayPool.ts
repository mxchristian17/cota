import { brepBytes, brepDisplay, brepFormat, brepSource, hasBrep, registerBrepDisplay } from '../core/document/brepStore'
import { acisDisplay } from '../core/io/importedBrep'
import type { BrepDisplayReply, BrepDisplayRequest } from '../core/io/brepDisplay.worker'
import { isPhone } from '../ui/appWindow'
import { maxWorkers } from './occtKernel'

/**
 * Lo que se dibuja de los sólidos importados que todavía no lo tienen (los de un dibujo guardado: la importación ya lo
 * trae), armado en hilos aparte. Lo que llega se avisa (`onBrepDisplays`) para volver a dibujar.
 */

/** Modelos por pedido (cada pedido se reparte a un hilo). */
const BATCH = 64
/** Un hilo sin trabajo se cierra pasado este tiempo. */
const IDLE_MS = 15_000

const queued = new Set<string>()
const pending: string[] = []
const listeners = new Set<(refs: string[]) => void>()
type Slot = { w: Worker; busy: boolean; idle: ReturnType<typeof setTimeout> | null }
const slots: Slot[] = []
let seq = 0
let scheduled = false
let failed = typeof Worker === 'undefined'

/** Avisa cuando llega lo que se dibuja de unos modelos. */
export function onBrepDisplays(fn: (refs: string[]) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const emit = (refs: string[]) => {
  if (refs.length) for (const fn of listeners) fn(refs)
}

/** Pide lo que se dibuja de un modelo (si no está ni se pidió ya). */
export function requestBrepDisplay(ref: string): void {
  if (brepDisplay(ref) || queued.has(ref) || !hasBrep(ref) || brepFormat(ref) === 'brep') return
  queued.add(ref)
  pending.push(ref)
  if (!scheduled) {
    scheduled = true
    setTimeout(pump, 0)
  }
}

/** Sin hilos (o si no arrancan): se arma acá, de a tandas para no trabar la pantalla. */
function local(): void {
  const refs = pending.splice(0, BATCH)
  for (const ref of refs) {
    const bytes = brepBytes(ref)
    const d = bytes ? acisDisplay(bytes, isPhone()) : null
    if (d) registerBrepDisplay(ref, d.display)
  }
  emit(refs.filter((r) => brepDisplay(r)))
  if (pending.length) setTimeout(local, 0)
}

function spawn(): Slot | null {
  try {
    const w = new Worker(new URL('../core/io/brepDisplay.worker.ts', import.meta.url), { type: 'module' })
    const slot: Slot = { w, busy: false, idle: null }
    w.onmessage = (e: MessageEvent<BrepDisplayReply>) => {
      slot.busy = false
      const got: string[] = []
      for (const { ref, display } of e.data.done) {
        if (display) {
          registerBrepDisplay(ref, display)
          got.push(ref)
        }
      }
      emit(got)
      pump()
    }
    w.onerror = (ev) => {
      ev.preventDefault()
      // El hilo no carga (sin conexión con una versión vieja en caché): lo que falta se arma acá.
      failed = true
      for (const s of slots.splice(0)) s.w.terminate()
      setTimeout(local, 0)
    }
    slots.push(slot)
    return slot
  } catch {
    failed = true
    return null
  }
}

function pump(): void {
  scheduled = false
  if (!pending.length) {
    for (const s of slots) if (!s.busy && !s.idle) s.idle = setTimeout(() => retire(s), IDLE_MS)
    return
  }
  if (failed) return void setTimeout(local, 0)
  while (pending.length) {
    let slot = slots.find((s) => !s.busy)
    if (!slot && slots.length < maxWorkers()) slot = spawn() ?? undefined
    if (!slot) {
      if (failed) setTimeout(local, 0)
      return
    }
    if (slot.idle) {
      clearTimeout(slot.idle)
      slot.idle = null
    }
    const refs = pending.splice(0, BATCH)
    const items = refs.flatMap((ref) => {
      const model = brepSource(ref)
      return model ? [{ ref, model }] : []
    })
    slot.busy = true
    slot.w.postMessage({ id: ++seq, items, light: isPhone() } satisfies BrepDisplayRequest)
  }
}

function retire(s: Slot): void {
  s.idle = null
  if (s.busy) return
  s.w.terminate()
  slots.splice(slots.indexOf(s), 1)
}
