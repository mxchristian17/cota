#!/usr/bin/env node
/**
 * Cota MCP bridge: lets an agent that runs on your computer (OpenCode, Claude Code, Codex or any MCP client) work on
 * the drawing open in Cota, in your browser. The agent starts this script (MCP over stdio); Cota connects to it on
 * http://127.0.0.1 when you turn on "External agent" in its agent panel, and runs the same tools as its own agent.
 *
 *   node cota-mcp.mjs [--port 7468] [--origin https://your-cota.example] [--text-only]
 *
 * --port       Port on this computer where Cota connects (the same one set in Cota). Default 7468.
 * --origin     Address of a self-hosted Cota allowed to connect (repeatable). The public Cota and any localhost page are
 *              always allowed; no other web page can talk to the bridge.
 * --text-only  Leave the pictures out of the results (for models that read text only, such as DeepSeek).
 *
 * No dependencies: Node 18+ (or Bun). It only listens on 127.0.0.1 and sends nothing anywhere else.
 */
import http from 'node:http'
import readline from 'node:readline'
import { randomUUID } from 'node:crypto'

const BRIDGE_VERSION = '1.0.0'
const PROTOCOL = 1
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const values = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []))
const PORT = Number(values('--port')[0] ?? process.env.COTA_MCP_PORT ?? 7468)
const TEXT_ONLY = flag('--text-only')
const ORIGINS = new Set(['https://mxchristian17.github.io', ...values('--origin').map((o) => o.replace(/\/+$/, ''))])
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/
const allowed = (origin) => !!origin && (ORIGINS.has(origin) || LOCAL.test(origin))
/** How long a tool call waits for Cota (a heavy 3D script can take a while on a slow computer). */
const CALL_TIMEOUT_MS = 10 * 60_000
/** How long a tool call waits for Cota to connect before answering that it is not connected. */
const CONNECT_WAIT_MS = 15_000
const POLL_HOLD_MS = 20_000

// <generated> Tool catalog and instructions, copied from Cota (services/web/src/agent). Cota sends its own when it
// connects, so an older copy of this file still offers the tools of a newer Cota.
let TOOLS = [
  {
    "name": "run_commands",
    "description": "Run a script of Cota commands and inputs (see the system prompt for the syntax). One undo step. Returns the transcript, the first rejected input if any, and the objects created, changed or deleted.",
    "parameters": {
      "type": "object",
      "properties": {
        "script": {
          "type": "string"
        }
      },
      "required": [
        "script"
      ]
    }
  },
  {
    "name": "get_drawing",
    "description": "Summary of the drawing: units, current space, UCS, layers, object counts by type and extents.",
    "parameters": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "query_objects",
    "description": "List objects (id, layer, 3D bounding box and a one-line parametric description), optionally only those inside a box, of some types or on a layer.",
    "parameters": {
      "type": "object",
      "properties": {
        "box": {
          "type": "object",
          "properties": {
            "min": {
              "type": "array",
              "items": {
                "type": "number"
              },
              "minItems": 3,
              "maxItems": 3
            },
            "max": {
              "type": "array",
              "items": {
                "type": "number"
              },
              "minItems": 3,
              "maxItems": 3
            }
          },
          "required": [
            "min",
            "max"
          ],
          "description": "Only objects whose bounding box touches this box."
        },
        "types": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "e.g. [\"CIRCLE\",\"LINE\"]"
        },
        "layer": {
          "type": "string"
        },
        "limit": {
          "type": "number",
          "description": "Default 100."
        }
      }
    }
  },
  {
    "name": "describe_object",
    "description": "All parameters of some objects (JSON).",
    "parameters": {
      "type": "object",
      "properties": {
        "ids": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Object ids (from query_objects)."
        }
      },
      "required": [
        "ids"
      ]
    }
  },
  {
    "name": "select",
    "description": "Set the current selection. The next command that asks for objects takes it WITHOUT showing its \"Select objects\" prompt, so your script must go straight to the prompt that follows (e.g. after select: MOVE 0,0 @10,0). An empty list clears it.",
    "parameters": {
      "type": "object",
      "properties": {
        "ids": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Object ids (from query_objects)."
        }
      },
      "required": [
        "ids"
      ]
    }
  },
  {
    "name": "set_properties",
    "description": "Change layer, color (#rrggbb or BYLAYER), linetype (name or BYLAYER) or lineweight (mm, -1 = ByLayer) of objects. One undo step.",
    "parameters": {
      "type": "object",
      "properties": {
        "ids": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Object ids (from query_objects)."
        },
        "layer": {
          "type": "string"
        },
        "color": {
          "type": "string"
        },
        "linetype": {
          "type": "string"
        },
        "lineweight": {
          "type": "number"
        }
      },
      "required": [
        "ids"
      ]
    }
  },
  {
    "name": "capture_view",
    "description": "An image of the active view, to check visually what was built.",
    "parameters": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "read_doc",
    "description": "Read a guide: intro (start here: how Cota is operated and the script syntax), coordinates, selection, draw-2d, modify-2d, annotate, properties, solids-3d, layouts, blocks-groups, inquiry, or commands/<menu> (draw, modify, dimension, view, insert, format, tools, edit, file).",
    "parameters": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        }
      },
      "required": [
        "id"
      ]
    }
  },
  {
    "name": "undo",
    "description": "Undo the last steps (each run_commands or set_properties is one step).",
    "parameters": {
      "type": "object",
      "properties": {
        "steps": {
          "type": "number"
        }
      }
    }
  }
]
let INSTRUCTIONS = "These tools work on the CAD drawing the user has open in Cota (a CAD application in their browser). The user\nsees every change live. What follows is the guide Cota gives its own agent; follow it.\n\nYou are the modeling agent of Cota, a CAD application running in the user's browser: 2D drafting, 3D solid\nmodeling and drawing sheets, driven by a command line like classic CAD programs. You change the user's open\ndrawing only through your tools. Lengths are in drawing units (millimetres unless get_drawing says otherwise);\nangles are in degrees, counterclockwise from +X.\n\n# How Cota is operated\nEverything is done with commands (CIRCLE, LINE, EXTRUDE…). A command asks for its inputs one prompt at a time;\neach input answers the current prompt. You send commands and inputs as a script with run_commands.\n\nScript syntax: inputs separated by spaces or new lines; each one answers the next prompt, and when a command ends\nthe next input starts a new command. \"\" is an empty Enter (accepts the default shown in <…> or ends a command\nsuch as LINE). Text with spaces goes in double quotes. One command per line is easier to read.\n  CIRCLE 50,50 20\n  LINE 0,0 @100,0 @0,60 \"\"\nIf an input is rejected, the script stops there, the command is cancelled and the result tells you which input\nfailed. Nothing after it runs. A command still waiting when the script ends is cancelled. Each run_commands call\nis one undo step.\n\nInputs:\n- Point: x,y or x,y,z (absolute, current UCS) · @dx,dy[,dz] (relative to the last point) · @dist<angle (polar)\n  · *x,y,z (world coordinates, ignoring the UCS). A typed point lying on an object also picks that object where a\n  command asks for one (\"Select object…\", \"Select circle…\").\n- Number: distance, radius, angle or count.\n- Option: prompts list options in brackets, e.g. [Close/Undo]; answer with the word or its capital letters.\n- Selection (\"Select objects:\"): ALL · L (last created) · P (previous) · W x1,y1 x2,y2 (window: fully inside)\n  · C x1,y1 x2,y2 (crossing) · a point on an object · then \"\" to finish. To act on specific objects, call\n  select(ids) first: the next command that asks for objects uses that selection without prompting.\n\nThe UCS (user coordinate system) defines the XY plane where typed points and new 2D objects go; World is the\ndefault. 3D work needs it; 2D work normally stays in World.\n\n# Tools\n- run_commands(script): run a script. Returns the transcript (prompts and answers), the rejected input if any,\n  and the ids, bounding boxes and one-line descriptions of the objects created, changed or deleted.\n- get_drawing(): units, current space (Model or a layout), UCS, layers, object counts by type and extents.\n- query_objects(box?, types?, layer?, limit?): objects with id, layer, bounding box and a one-line parametric\n  description (e.g. \"CIRCLE center 30,30,0 r 10\"). Use a box to look only at one region.\n- describe_object(ids): all parameters of those objects.\n- select(ids): set the current selection (empty list clears it).\n- set_properties(ids, layer?, color?, linetype?, lineweight?): change properties of existing objects.\n- capture_view(): an image of the active view, to check visually what you built.\n- read_doc(id): a guide from the list below.\n- undo(steps): undo your last steps.\n\n# Guides (read_doc). Read only what the task needs, before using commands you have not used in this conversation.\n- coordinates: points, relative and polar input, UCS\n- selection: selection options, picking objects by point, ids and preselection\n- draw-2d: LINE, PLINE, CIRCLE, ARC, RECTANGLE, POLYGON, ELLIPSE, SPLINE, POINT\n- modify-2d: MOVE, COPY, ROTATE, SCALE, MIRROR, ERASE, OFFSET, FILLET, CHAMFER, TRIM, EXTEND, ARRAY, EXPLODE, JOIN\n- annotate: TEXT, MTEXT, dimensions, leaders, THREAD, hatches\n- properties: layers, color, linetype, lineweight\n- solids-3d: BOX, CYLINDER, CONE, SPHERE, TORUS, EXTRUDE, REVOLVE, booleans, 3D UCS and views, visual styles\n- layouts: sheets, viewports, drawing views (VIEWBASE), PLOT\n- blocks-groups: BLOCK, INSERT, attributes, GROUP\n- inquiry: DIST, ID, AREA, LIST, MASSPROP\n- commands/<menu>: every command of a menu with a one-line description (draw, modify, dimension, view, insert,\n  format, tools, edit, file). Use it only when no guide covers what you need.\n\n# Working rules\n- Compute the geometry yourself and type exact values; do not estimate positions.\n- Save requests: send each step as ONE run_commands script with all of its commands (dozens of lines are fine),\n  never one command per call, and ask for all the guides you need in the same reply (you can call several tools at\n  once). Then check the result (the returned objects, query_objects, capture_view) before the next step.\n- When something fails, read the transcript and the guide of that command; do not repeat the same input.\n- Do not touch objects you were not asked to change. Never run NEW, OPEN, SAVE, PURGE, ERASE ALL or anything that\n  closes or replaces the drawing unless the user asks for it.\n- If the user rejects a script (approval mode), do not run it again: ask what to change.\n- Reply briefly: what you did and anything the user must decide."
// </generated>

const log = (...a) => process.stderr.write(`[cota-mcp] ${a.join(' ')}\n`)

// ── Cota side (HTTP on 127.0.0.1) ─────────────────────────────────────────────────────────────────────────────────
/** Calls waiting to be taken by Cota, and the ones it took and has not answered yet. */
const queue = []
const waiting = new Map()
/** The request Cota keeps open waiting for the next call (long polling). */
let held = null
let lastSeen = 0
let listening = false
let listenError = ''
const connected = () => !!held || Date.now() - lastSeen < POLL_HOLD_MS + 10_000
const onConnect = []

function cors(req, res) {
  const origin = req.headers.origin
  if (!allowed(origin)) return false
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
  res.setHeader('Access-Control-Max-Age', '600')
  return true
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

function readBody(req, limit = 32 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const parts = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('too large'))
        req.destroy()
      } else parts.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')))
    req.on('error', reject)
  })
}

function deliver() {
  if (!held || !queue.length) return
  const { res, timer } = held
  held = null
  clearTimeout(timer)
  const call = queue.shift()
  waiting.set(call.id, call)
  json(res, 200, { id: call.id, name: call.name, args: call.args })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  // Sólo las páginas de Cota (el navegador manda su origen y una página no lo puede falsear).
  if (!cors(req, res)) return json(res, 403, { error: 'origin not allowed' })
  if (req.method === 'OPTIONS') return json(res, 204)
  try {
    if (req.method === 'GET' && url.pathname === '/cota/status') return json(res, 200, { name: 'cota-mcp', version: BRIDGE_VERSION, protocol: PROTOCOL })
    if (req.method === 'POST' && url.pathname === '/cota/hello') {
      const h = JSON.parse(await readBody(req))
      if (Array.isArray(h.tools) && h.tools.length) {
        const changed = JSON.stringify(h.tools) !== JSON.stringify(TOOLS)
        TOOLS = h.tools
        if (typeof h.instructions === 'string' && h.instructions) INSTRUCTIONS = h.instructions
        if (changed && initialized) send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' })
      }
      lastSeen = Date.now()
      log(`Cota ${h.version ?? ''} connected`)
      return json(res, 200, { ok: true, protocol: PROTOCOL })
    }
    if (req.method === 'GET' && url.pathname === '/cota/poll') {
      lastSeen = Date.now()
      if (held) {
        clearTimeout(held.timer)
        json(held.res, 204)
      }
      const timer = setTimeout(() => {
        if (held?.res === res) held = null
        lastSeen = Date.now()
        json(res, 204)
      }, POLL_HOLD_MS)
      held = { res, timer }
      req.on('close', () => {
        if (held?.res === res) {
          clearTimeout(timer)
          held = null
        }
      })
      while (onConnect.length) onConnect.shift()()
      return deliver()
    }
    if (req.method === 'POST' && url.pathname === '/cota/result') {
      const r = JSON.parse(await readBody(req))
      const call = waiting.get(r.id)
      if (call) {
        waiting.delete(r.id)
        call.done({ text: String(r.text ?? ''), image: typeof r.image === 'string' ? r.image : undefined, isError: !!r.isError })
      }
      return json(res, 200, { ok: !!call })
    }
    return json(res, 404, { error: 'not found' })
  } catch (err) {
    return json(res, 400, { error: String(err?.message ?? err) })
  }
})
server.on('error', (err) => {
  listenError = err?.code === 'EADDRINUSE' ? `port ${PORT} is already in use (another bridge or program); start this one with --port and set the same port in Cota` : String(err?.message ?? err)
  log(listenError)
})
server.listen(PORT, '127.0.0.1', () => {
  listening = true
  log(`listening on http://127.0.0.1:${PORT}: in Cota, open the agent panel (⚙) and turn on "External agent" with this port`)
})

const NOT_CONNECTED = () =>
  listenError
    ? `The Cota bridge could not start: ${listenError}.`
    : `Cota is not connected. Ask the user to open Cota in the browser (https://mxchristian17.github.io/cota/), open the agent panel, press ⚙ and turn on "External agent" (port ${PORT}). Then try again.`

/** Hands a tool call to Cota and waits for its answer. */
async function callCota(name, args) {
  if (!listening) return { text: NOT_CONNECTED(), isError: true }
  if (!connected()) {
    await new Promise((resolve) => {
      const t = setTimeout(resolve, CONNECT_WAIT_MS)
      onConnect.push(() => {
        clearTimeout(t)
        resolve()
      })
    })
    if (!connected()) return { text: NOT_CONNECTED(), isError: true }
  }
  return new Promise((resolve) => {
    const id = randomUUID()
    const timer = setTimeout(() => {
      const i = queue.findIndex((c) => c.id === id)
      if (i >= 0) queue.splice(i, 1)
      waiting.delete(id)
      resolve({ text: 'Cota did not answer in time (the page was closed or reloaded?). Check the drawing before trying again.', isError: true })
    }, CALL_TIMEOUT_MS)
    queue.push({ id, name, args, done: (r) => (clearTimeout(timer), resolve(r)) })
    deliver()
  })
}

// ── Agent side (MCP over stdio: one JSON-RPC message per line) ─────────────────────────────────────────────────────
const SUPPORTED = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25']
let initialized = false

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function toolList() {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.parameters ?? { type: 'object', properties: {} } }))
}

async function callTool(name, args) {
  if (!TOOLS.some((t) => t.name === name)) return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
  // La guía de inicio está en este archivo: se puede leer antes de que Cota se conecte.
  const r = name === 'read_doc' && args?.id === 'intro' ? { text: INSTRUCTIONS } : await callCota(name, args ?? {})
  const content = [{ type: 'text', text: r.text }]
  const m = !TEXT_ONLY && r.image ? /^data:([^;]+);base64,(.*)$/s.exec(r.image) : null
  if (m) content.push({ type: 'image', mimeType: m[1], data: m[2] })
  else if (r.image) content.push({ type: 'text', text: '(A picture of the drawing was left out: this bridge runs with --text-only.)' })
  return { content, ...(r.isError ? { isError: true } : {}) }
}

async function handle(msg) {
  if (!msg || typeof msg !== 'object' || msg.id === undefined || msg.id === null) {
    if (msg?.method === 'notifications/initialized') initialized = true
    return
  }
  const ok = (result) => send({ jsonrpc: '2.0', id: msg.id, result })
  const fail = (code, message) => send({ jsonrpc: '2.0', id: msg.id, error: { code, message } })
  try {
    switch (msg.method) {
      case 'initialize': {
        const asked = msg.params?.protocolVersion
        return ok({
          protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[SUPPORTED.length - 1],
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: 'cota', title: 'Cota CAD', version: BRIDGE_VERSION },
          instructions: INSTRUCTIONS,
        })
      }
      case 'ping':
        return ok({})
      case 'tools/list':
        return ok({ tools: toolList() })
      case 'tools/call':
        return ok(await callTool(msg.params?.name, msg.params?.arguments))
      case 'resources/list':
        return ok({ resources: [] })
      case 'prompts/list':
        return ok({ prompts: [] })
      default:
        return fail(-32601, `Method not found: ${msg.method}`)
    }
  } catch (err) {
    return fail(-32603, String(err?.message ?? err))
  }
}

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  if (!line.trim()) return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
  }
  if (Array.isArray(msg)) for (const m of msg) void handle(m)
  else void handle(msg)
})
rl.on('close', () => {
  server.close()
  process.exit(0)
})
