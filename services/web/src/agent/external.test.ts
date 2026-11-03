import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { makeEngine } from '../test/engineHarness'
import { parseScript } from '../core/commands/script'
import { runTool, type AgentHost } from './tools'
import { connectExternal, EXTERNAL_INSTRUCTIONS, externalTools, type ExternalStatus } from './external'

/**
 * El puente (`public/cota-mcp.mjs`) lleva una copia del catálogo de herramientas: este test la mantiene al día
 * (`UPDATE_DOCS=1 npx vitest run external` la regenera) y lo prueba de punta a punta como lo usa un agente externo.
 */
const BRIDGE = fileURLToPath(new URL('../../public/cota-mcp.mjs', import.meta.url))

function generatedBlock(): string {
  return [
    '// <generated> Tool catalog and instructions, copied from Cota (services/web/src/agent). Cota sends its own when it',
    '// connects, so an older copy of this file still offers the tools of a newer Cota.',
    `let TOOLS = ${JSON.stringify(externalTools(), null, 2)}`,
    `let INSTRUCTIONS = ${JSON.stringify(EXTERNAL_INSTRUCTIONS)}`,
    '// </generated>',
  ].join('\n')
}

it('el puente lleva el catálogo y la guía de Cota al día', () => {
  const src = readFileSync(BRIDGE, 'utf8')
  const next = src.replace(/\/\/ <generated>[\s\S]*?\/\/ <\/generated>/, generatedBlock())
  if (process.env.UPDATE_DOCS) writeFileSync(BRIDGE, next)
  expect(readFileSync(BRIDGE, 'utf8')).toBe(next)
})

/** El agente externo: arranca el puente y le habla MCP por stdin/stdout. */
function startBridge(port: number, ...extra: string[]) {
  const child = spawn(process.execPath, [BRIDGE, '--port', String(port), ...extra]) as ChildProcessWithoutNullStreams
  const replies = new Map<number, (m: Record<string, unknown>) => void>()
  const notes: string[] = []
  createInterface({ input: child.stdout }).on('line', (l) => {
    const m = JSON.parse(l) as { id?: number; method?: string }
    if (m.id !== undefined && replies.has(m.id)) replies.get(m.id)!(m)
    else if (m.method) notes.push(m.method)
  })
  let next = 1
  const rpc = (method: string, params?: unknown) =>
    new Promise<{ result?: Record<string, unknown>; error?: { message: string } }>((resolve) => {
      const id = next++
      replies.set(id, resolve as never)
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  const ready = new Promise<void>((resolve) => child.stderr.on('data', (d) => String(d).includes('listening') && resolve()))
  return { child, rpc, notes, ready }
}

/** Un pedido HTTP con el origen que manda un navegador (fetch de Node no lo deja poner). */
function http(port: number, method: string, path: string, origin: string, body?: unknown): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body)
    const req = request({ host: '127.0.0.1', port, method, path, headers: { origin, ...(data ? { 'content-type': 'application/json' } : {}) } }, (res) => {
      let b = ''
      res.on('data', (c) => (b += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b }))
    })
    req.on('error', reject)
    req.end(data)
  })
}

/** `fetch` del navegador en el puerto del puente: con el origen de la página. */
function browserFetch(origin: string) {
  return async (url: string, init: RequestInit = {}): Promise<Response> => {
    const u = new URL(url)
    const r = await http(Number(u.port), init.method ?? 'GET', u.pathname, origin, init.body ? JSON.parse(String(init.body)) : undefined)
    return new Response(r.status === 204 ? null : r.body, { status: r.status })
  }
}

let children: ChildProcessWithoutNullStreams[] = []
afterEach(() => {
  for (const c of children) c.kill()
  children = []
  vi.unstubAllGlobals()
})

describe('agente externo por el puente MCP', () => {
  it('un agente externo dibuja en Cota: initialize, tools/list y tools/call van y vuelven por el navegador', async () => {
    const port = 17468 + Math.floor(Math.random() * 500)
    const b = startBridge(port)
    children.push(b.child)
    await b.ready
    const init = await b.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    expect(init.result).toMatchObject({ protocolVersion: '2025-06-18', serverInfo: { name: 'cota' }, capabilities: { tools: {} } })
    expect(String(init.result!.instructions)).toContain('run_commands')
    b.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
    const list = await b.rpc('tools/list')
    const names = (list.result!.tools as Array<{ name: string; inputSchema: unknown }>).map((t) => t.name)
    expect(names).toEqual(externalTools().map((t) => t.name))
    // La guía se lee aunque Cota no esté conectada.
    const intro = await b.rpc('tools/call', { name: 'read_doc', arguments: { id: 'intro' } })
    expect((intro.result!.content as Array<{ text: string }>)[0].text).toContain('Script syntax')

    // Otra página no puede hablarle al puente.
    expect((await http(port, 'GET', '/cota/status', 'https://evil.example')).status).toBe(403)
    expect((await http(port, 'GET', '/cota/status', 'http://localhost:5173')).status).toBe(200)

    // Cota se conecta (como desde el navegador) y atiende con su motor.
    const h = makeEngine()
    const host: AgentHost = {
      doc: h.doc,
      runScript: (t) => h.engine.runScript(parseScript(t), { finish: 'cancel' }),
      select: (ids) => h.setSelection(ids),
      setProperties: () => 0,
      undo: () => {},
      commands: () => h.engine.getCommands(),
      ucsName: () => 'World',
      captureView: () => 'data:image/png;base64,iVBORw0KGgo=',
    }
    vi.stubGlobal('fetch', browserFetch('http://localhost:5173'))
    const status: ExternalStatus[] = []
    const stop = connectExternal(port, { onStatus: (s) => status.push(s), run: (name, args) => runTool(host, name, args) })
    try {
      const drawn = await b.rpc('tools/call', { name: 'run_commands', arguments: { script: 'CIRCLE 50,50 20' } })
      expect(drawn.result!.isError).toBeUndefined()
      expect((drawn.result!.content as Array<{ text: string }>)[0].text).toMatch(/^OK/)
      expect(h.doc.entities.map((e) => e.type)).toEqual(['CIRCLE'])
      expect(status).toContain('connected')
      // La imagen de la vista llega como contenido de imagen de MCP.
      const view = await b.rpc('tools/call', { name: 'capture_view', arguments: {} })
      expect((view.result!.content as Array<{ type: string; mimeType?: string }>).find((c) => c.type === 'image')).toMatchObject({ mimeType: 'image/png' })
      const bad = await b.rpc('tools/call', { name: 'nope', arguments: {} })
      expect(bad.result!.isError).toBe(true)
    } finally {
      stop()
    }
    expect(status.at(-1)).toBe('off')
  }, 30_000)

  it('sin Cota conectada responde qué hacer; con --text-only no manda imágenes', async () => {
    const port = 18068 + Math.floor(Math.random() * 500)
    const b = startBridge(port, '--text-only')
    children.push(b.child)
    await b.ready
    await b.rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {} })
    const t0 = Date.now()
    const r = await b.rpc('tools/call', { name: 'get_drawing', arguments: {} })
    expect(Date.now() - t0).toBeGreaterThan(14_000) // espera un rato a que Cota se conecte
    expect(r.result!.isError).toBe(true)
    expect((r.result!.content as Array<{ text: string }>)[0].text).toContain('External agent')

    vi.stubGlobal('fetch', browserFetch('https://mxchristian17.github.io'))
    const stop = connectExternal(port, { onStatus: () => {}, run: async () => ({ text: 'view', image: 'data:image/png;base64,AAAA' }) })
    try {
      const v = await b.rpc('tools/call', { name: 'capture_view', arguments: {} })
      const content = v.result!.content as Array<{ type: string; text?: string }>
      expect(content.map((c) => c.type)).toEqual(['text', 'text'])
      expect(content[1].text).toContain('--text-only')
    } finally {
      stop()
    }
  }, 40_000)
})
