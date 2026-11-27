import type { BrepProps } from '../core/document/types'
import { sysvars } from '../core/commands/sysvars'
import { backgroundPending, cancelBackground, foregroundBusy, kernelAvailable, kernelResult, maxWorkers, requestKernelBackground, SPAWN_BACKLOG } from './occtKernel'

/**
 * Conversión en los ratos libres: lo que quedó como malla y se puede calcular exacto (las piezas importadas sin convertir)
 * se va calculando solo mientras el usuario no hace nada y Cota tampoco. Va por la cola de baja prioridad del núcleo
 * (`requestKernelBackground`), en tandas chicas; cualquier acción del usuario (`noteActivity`) la corta: lo que no
 * empezó sale de la cola y se retoma cuando vuelve la calma.
 */

/** Calma: sin teclas, clics, ruedita ni movimiento del cursor en este tiempo. */
export const IDLE_AFTER_MS = 2000
const TICK_MS = 500

let lastActivity = typeof performance !== 'undefined' ? performance.now() : 0
let source: () => BrepProps[] = () => []
/** ¿Cota está ocupada (un comando en curso, leyendo un archivo, convirtiendo todo)? La responde el store. */
let busy: () => boolean = () => false
let timer: ReturnType<typeof setInterval> | null = null
/** Lista de piezas de la última vuelta y por dónde iba (se rehace cuando cambia el dibujo). */
let pieces: BrepProps[] = []
let cursor = 0
let listRev = -1
let revision: () => number = () => 0
/** La lista entera ya tiene resultado (o se pidió): no se vuelve a recorrer hasta que cambie el dibujo o se corte. */
let exhausted = false

/** El usuario hizo algo: se corta lo de baja prioridad que no empezó. */
export function noteActivity(): void {
  lastActivity = performance.now()
  if (!backgroundPending()) return
  cancelBackground()
  // Lo que se sacó de la cola está detrás del cursor: la próxima vuelta empieza de nuevo (saltea lo ya calculado).
  cursor = 0
  exhausted = false
}

/** ¿El usuario está quieto hace rato? */
export const userIdle = (now = performance.now()): boolean => now - lastActivity >= IDLE_AFTER_MS

/**
 * Conecta el planificador: de dónde salen las piezas (las del dibujo, con las copias de los bloques), la revisión del
 * dibujo (para rehacer la lista) y si Cota está ocupada. Arranca el reloj.
 */
export function startIdleConversion(opts: { pieces: () => BrepProps[]; revision: () => number; busy: () => boolean }): void {
  source = opts.pieces
  revision = opts.revision
  busy = opts.busy
  timer ??= setInterval(tick, TICK_MS)
}

export function stopIdleConversion(): void {
  if (timer) clearInterval(timer)
  timer = null
  cancelBackground()
}

/** Cuántos pedidos de baja prioridad mantener en la cola: los que dan trabajo a todos los Workers. */
const target = (): number => SPAWN_BACKLOG * maxWorkers()

/** Una vuelta: si hay calma, se completa la tanda de baja prioridad con las próximas piezas sin resultado. */
export function tick(now = performance.now()): number {
  if (sysvars.SOLIDIDLE !== 1 || sysvars.SOLIDKERNEL !== 'OCCT') {
    if (backgroundPending()) cancelBackground() // se apagó (SOLIDIDLE): lo que esperaba sale de la cola
    return 0
  }
  if (!kernelAvailable() || !userIdle(now) || busy() || foregroundBusy()) return 0
  const rev = revision()
  if (rev !== listRev) {
    pieces = source()
    cursor = 0
    listRev = rev
    exhausted = false
  }
  if (exhausted) return 0
  let added = 0
  const want = target() - backgroundPending()
  while (added < want && cursor < pieces.length) {
    const p = pieces[cursor++]
    const key = JSON.stringify(p)
    if (kernelResult(key)) continue
    requestKernelBackground(key, p)
    added++
  }
  if (cursor >= pieces.length && !added) exhausted = true
  return added
}
