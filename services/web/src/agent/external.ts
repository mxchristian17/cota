import { ABOUT } from '../core/about'
import { SYSTEM_PROMPT } from './systemPrompt'
import { AGENT_TOOLS, type ToolDef, type ToolResult } from './tools'

/**
 * Agente externo: un agente que corre en la computadora del usuario (OpenCode, Claude Code, Codex…) maneja el dibujo
 * a través del puente MCP (`public/cota-mcp.mjs`), que el agente arranca y escucha en 127.0.0.1. Cota le pide la
 * próxima llamada (long polling), la ejecuta con las mismas herramientas que su propio agente y le devuelve el
 * resultado. El puente sólo acepta pedidos de las páginas de Cota.
 */
export const EXTERNAL_PORT = 7468

/** Archivo del puente, servido junto a la app. */
export const BRIDGE_FILE = 'cota-mcp.mjs'

export type ExternalStatus = 'off' | 'searching' | 'connected' | 'blocked'

/** Lo que un agente externo lee primero (`read_doc` "intro" y las instrucciones del servidor MCP). */
export const EXTERNAL_INSTRUCTIONS = `These tools work on the CAD drawing the user has open in Cota (a CAD application in their browser). The user
sees every change live. What follows is the guide Cota gives its own agent; follow it.

${SYSTEM_PROMPT}`

/** Catálogo para el agente externo: el de Cota, con la guía de inicio en `read_doc`. */
export function externalTools(): ToolDef[] {
  return AGENT_TOOLS.map((t) =>
    t.name === 'read_doc' ? { ...t, description: t.description.replace('Read a guide: ', 'Read a guide: intro (start here: how Cota is operated and the script syntax), ') } : t,
  )
}

export interface ExternalHandlers {
  onStatus(s: ExternalStatus): void
  run(name: string, args: Record<string, unknown>): Promise<ToolResult>
}

/**
 * El navegador pregunta una vez si la página puede llegar a esta computadora (acceso a la red local); si el usuario
 * dijo que no, todo pedido al puente falla igual que si no estuviera corriendo: se distingue para avisarle.
 */
async function localAccessDenied(): Promise<boolean> {
  for (const name of ['loopback-network', 'local-network-access', 'local-network']) {
    try {
      const s = await navigator.permissions.query({ name } as unknown as PermissionDescriptor)
      return s.state === 'denied'
    } catch {
      /* el navegador no conoce ese permiso: el siguiente */
    }
  }
  return false
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true })
  })

/** Conecta con el puente y atiende sus llamadas hasta que se llama a la función devuelta. */
export function connectExternal(port: number, h: ExternalHandlers): () => void {
  const ctrl = new AbortController()
  const base = `http://127.0.0.1:${port}/cota`
  const post = (path: string, body: unknown) => fetch(`${base}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal })
  void (async () => {
    let fails = 0
    let greeted = false
    h.onStatus('searching')
    while (!ctrl.signal.aborted) {
      try {
        if (!greeted) {
          const r = await post('hello', { version: ABOUT.version, tools: externalTools(), instructions: EXTERNAL_INSTRUCTIONS })
          if (!r.ok) throw new Error(`bridge answered ${r.status}`)
          greeted = true
          h.onStatus('connected')
        }
        const r = await fetch(`${base}/poll`, { cache: 'no-store', signal: ctrl.signal })
        if (!r.ok && r.status !== 204) throw new Error(`bridge answered ${r.status}`)
        fails = 0
        h.onStatus('connected')
        if (r.status === 204) continue
        const call = (await r.json()) as { id: string; name: string; args?: Record<string, unknown> }
        let res: ToolResult
        try {
          res = await h.run(call.name, call.args ?? {})
        } catch (err) {
          res = { text: `Tool error: ${(err as Error).message}`, isError: true }
        }
        await post('result', { id: call.id, ...res })
      } catch {
        if (ctrl.signal.aborted) break
        // Sin puente (el agente no está abierto) o se cerró: se reintenta cada vez más espaciado, hasta 10 s.
        greeted = false
        h.onStatus((await localAccessDenied().catch(() => false)) ? 'blocked' : 'searching')
        await sleep(Math.min(10_000, 1000 * 2 ** fails++), ctrl.signal)
      }
    }
  })()
  return () => {
    ctrl.abort()
    h.onStatus('off')
  }
}
