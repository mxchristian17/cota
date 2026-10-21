/**
 * Ventana de la app: instalación como aplicación (PWA) y pantalla completa.
 *
 * - El navegador avisa que la app se puede instalar (`beforeinstallprompt`); se guarda el aviso para mostrar el
 *   botón *Install app* y abrir el diálogo de instalación con un clic.
 * - Pantalla completa total (sin barra de tareas): los navegadores la permiten sólo tras un gesto del usuario.
 *   Dentro de ella, Escape sigue llegando a la app (Keyboard Lock, Chromium): para salir se mantiene Escape o
 *   se usa el botón.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // el botón propio reemplaza al aviso automático
    deferred = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

/** ¿El navegador ofrece instalar la app ahora? */
export const canInstall = (): boolean => deferred !== null

export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Abre el diálogo de instalación del navegador; true si el usuario aceptó. */
export async function promptInstall(): Promise<boolean> {
  const ev = deferred
  if (!ev) return false
  deferred = null
  notify()
  await ev.prompt()
  return (await ev.userChoice).outcome === 'accepted'
}

/** ¿Corre como app instalada (ventana propia, sin barra de dirección)? */
export const isStandalone = (): boolean =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches)

export const isFullscreen = (): boolean => typeof document !== 'undefined' && !!document.fullscreenElement

type KeyboardLock = { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void }
const keyboard = (): KeyboardLock | undefined => (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard

/** Pasa a pantalla completa; false si el navegador no lo permite (sin gesto del usuario, iframe…). */
export async function enterFullscreen(): Promise<boolean> {
  if (isFullscreen()) return true
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
  } catch {
    return false
  }
  try {
    await keyboard()?.lock?.(['Escape']) // Escape cancela comandos, no sale de la pantalla completa
  } catch {
    /* navegador sin Keyboard Lock: Escape sale de la pantalla completa */
  }
  return true
}

export async function exitFullscreen(): Promise<void> {
  keyboard()?.unlock?.()
  if (isFullscreen()) await document.exitFullscreen().catch(() => {})
}
