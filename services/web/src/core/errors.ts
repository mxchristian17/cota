/**
 * Errores inesperados: se muestran en un aviso cerrable y la app sigue funcionando. Sin dependencias de UI, para
 * poder avisar desde el motor de comandos.
 */
export interface AppError {
  id: number
  message: string
}

type Listener = (errors: AppError[]) => void

let errors: AppError[] = []
let next = 1
const listeners = new Set<Listener>()

/** Avisos del navegador que no son fallas de la app. */
const BENIGN = [/ResizeObserver loop/i]

export function reportError(context: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err ?? 'unknown error')
  if (BENIGN.some((r) => r.test(detail))) return
  const message = `${context}: ${detail}`
  console.error(message, err)
  // El mismo error repetido no apila avisos; como máximo quedan los tres últimos.
  if (errors.some((e) => e.message === message)) return
  errors = [...errors, { id: next++, message }].slice(-3)
  listeners.forEach((l) => l(errors))
}

export function dismissError(id: number): void {
  errors = errors.filter((e) => e.id !== id)
  listeners.forEach((l) => l(errors))
}

export function subscribeErrors(l: Listener): () => void {
  listeners.add(l)
  l(errors)
  return () => {
    listeners.delete(l)
  }
}

/** Errores fuera de React y de los comandos (eventos, promesas sin catch). */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (e) => reportError('Unexpected error', e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => reportError('Unexpected error', e.reason))
}
