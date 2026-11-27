import { decodeBrep } from '../document/brepStore'
import type { BrepSource } from '../document/types'
import { acisDisplay, displayBuffers, type BrepDisplay } from './importedBrep'

/**
 * Hilo aparte que arma lo que se dibuja de los sólidos importados de un dibujo guardado (la malla de sus caras ACIS y
 * sus aristas): al abrir un `.cota` con miles de piezas, hacerlo en el hilo principal trababa la pantalla segundos.
 */
export interface BrepDisplayRequest {
  id: number
  items: Array<{ ref: string; model: BrepSource }>
  light: boolean
}

export interface BrepDisplayReply {
  id: number
  done: Array<{ ref: string; display: BrepDisplay | null }>
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<BrepDisplayRequest>) => void) | null
  postMessage: (m: BrepDisplayReply, transfer?: Transferable[]) => void
}

ctx.onmessage = (e) => {
  const { id, items, light } = e.data
  const done: BrepDisplayReply['done'] = []
  const transfer: ArrayBuffer[] = []
  for (const { ref, model } of items) {
    let display: BrepDisplay | null
    try {
      const bytes = 'bytes' in model ? model.bytes : decodeBrep(model)
      display = model.fmt === 'brep' ? null : (acisDisplay(bytes, light)?.display ?? null)
    } catch {
      display = null
    }
    if (display) transfer.push(...displayBuffers(display))
    done.push({ ref, display })
  }
  ctx.postMessage({ id, done }, transfer)
}
