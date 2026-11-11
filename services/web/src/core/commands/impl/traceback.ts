import { ABOUT } from '../../about'
import { formatTrace, traceLog } from '../../session/traceLog'
import { askKeyword, askNumber } from '../ask'
import type { Command } from '../types'

/** Descarga un texto como archivo (sólo en el navegador). */
function downloadText(text: string, name: string): boolean {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return false
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

/**
 * TRACEBACK: exporta el registro de la sesión de los últimos n minutos o n líneas, con el dibujo como estaba al empezar,
 * para que un agente pueda repetir exactamente lo que pasó (ver `core/session/traceLog`).
 */
export const tracebackCommand: Command = {
  name: 'TRACEBACK',
  aliases: [],
  description: 'Export the session log (last n minutes or lines) with the drawing, so an agent can replay it',
  async run(ctx) {
    const mode = await askKeyword(ctx, 'Export the session log by [Lines/Minutes] <Minutes>: ', ['Lines', 'Minutes'], 'Minutes')
    if (!mode) return
    const def = mode === 'Lines' ? 200 : 10
    const r = await askNumber(ctx, `Number of ${mode.toLowerCase()} <${def}>: `, { def, check: (v) => (v > 0 ? null : 'Requires a positive value.') })
    if (r?.kind !== 'number') return
    const w = traceLog.window(mode as 'Lines' | 'Minutes', r.value)
    if (!w) {
      ctx.print('The session log is empty.')
      return
    }
    const screen = typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}` : 'n/a'
    const text = formatTrace(w, {
      cota: ABOUT.version,
      drawing: ctx.doc.name,
      exported: new Date().toISOString(),
      requested: `last ${r.value} ${mode.toLowerCase()}`,
      browser: typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a',
      screen,
    })
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
    const saved = downloadText(text, `traceback-${ctx.doc.name || 'drawing'}-${stamp}.txt`)
    if (typeof navigator !== 'undefined' && text.length < 2_000_000) void navigator.clipboard?.writeText(text).catch(() => undefined)
    ctx.print(
      `${w.events.length} event(s) exported${saved ? ' to a .txt file (also copied to the clipboard when it fits)' : ''}. ` +
        'It contains your drawing: share it only with whom you trust.',
    )
  },
}
