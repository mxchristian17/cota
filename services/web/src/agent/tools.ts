import type { DocumentModel } from '../core/document/DocumentModel'
import type { Entity } from '../core/document/types'
import type { Command } from '../core/commands/types'
import type { ScriptResult } from '../core/commands/CommandEngine'
import { CATEGORIES } from '../core/ui/menus'
import { GUIDES } from './docs'
import { box3, describe, n, objectLine, p3 } from './describe'

/**
 * Herramientas del agente: un único catálogo (JSON Schema) que usan el modo navegador y el modo Docker (AG-UI: el
 * backend las declara y el navegador las ejecuta). Todo devuelve texto corto: es lo que paga tokens.
 */
export interface ToolDef {
  name: string
  description: string
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

const ids = { type: 'array', items: { type: 'string' }, description: 'Object ids (from query_objects).' }
const vec = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 }

export const AGENT_TOOLS: ToolDef[] = [
  {
    name: 'run_commands',
    description:
      'Run a script of Cota commands and inputs (see the system prompt for the syntax). One undo step. Returns the transcript, the first rejected input if any, and the objects created, changed or deleted.',
    parameters: { type: 'object', properties: { script: { type: 'string' } }, required: ['script'] },
  },
  {
    name: 'get_drawing',
    description: 'Summary of the drawing: units, current space, UCS, layers, object counts by type and extents.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'query_objects',
    description: 'List objects (id, layer, 3D bounding box and a one-line parametric description), optionally only those inside a box, of some types or on a layer.',
    parameters: {
      type: 'object',
      properties: {
        box: { type: 'object', properties: { min: vec, max: vec }, required: ['min', 'max'], description: 'Only objects whose bounding box touches this box.' },
        types: { type: 'array', items: { type: 'string' }, description: 'e.g. ["CIRCLE","LINE"]' },
        layer: { type: 'string' },
        limit: { type: 'number', description: 'Default 100.' },
      },
    },
  },
  {
    name: 'describe_object',
    description: 'All parameters of some objects (JSON).',
    parameters: { type: 'object', properties: { ids }, required: ['ids'] },
  },
  {
    name: 'select',
    description: 'Set the current selection; the next command that asks for objects uses it. An empty list clears it.',
    parameters: { type: 'object', properties: { ids }, required: ['ids'] },
  },
  {
    name: 'set_properties',
    description: 'Change layer, color (#rrggbb or BYLAYER), linetype (name or BYLAYER) or lineweight (mm, -1 = ByLayer) of objects. One undo step.',
    parameters: {
      type: 'object',
      properties: { ids, layer: { type: 'string' }, color: { type: 'string' }, linetype: { type: 'string' }, lineweight: { type: 'number' } },
      required: ['ids'],
    },
  },
  {
    name: 'capture_view',
    description: 'An image of the active view, to check visually what was built.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'read_doc',
    description: 'Read a guide: coordinates, selection, draw-2d, modify-2d, annotate, properties, solids-3d, layouts, blocks-groups, inquiry, or commands/<menu> (draw, modify, dimension, view, insert, format, tools, edit, file).',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'undo',
    description: 'Undo the last steps (each run_commands or set_properties is one step).',
    parameters: { type: 'object', properties: { steps: { type: 'number' } } },
  },
]

/** Lo que el agente necesita de la app (el navegador lo implementa sobre el store; los tests, sobre el motor). */
export interface AgentHost {
  doc: DocumentModel
  runScript(text: string): Promise<ScriptResult>
  select(ids: string[]): void
  setProperties(ids: string[], patch: { layer?: string; color?: string; linetype?: string; lineweight?: number }): number
  undo(steps: number): void
  commands(): Command[]
  ucsName(): string | null
  /** PNG de la vista activa (data URL); null si no hay vista. */
  captureView?(): string | null
}

export interface ToolResult {
  text: string
  /** Imagen (data URL PNG) para los modelos que la aceptan. */
  image?: string
  isError?: boolean
}

const layerName = (doc: DocumentModel, id: string) => doc.layers.find((l) => l.id === id)?.name ?? id
const MAX_TRANSCRIPT = 60

/** Ejecuta una herramienta y devuelve su resultado en texto. */
export async function runTool(host: AgentHost, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const doc = host.doc
  switch (name) {
    case 'run_commands': {
      const before = new Map(doc.entities.map((e) => [e.id, JSON.stringify(e)]))
      const r = await host.runScript(String(args.script ?? ''))
      const after = doc.entities
      const created = after.filter((e) => !before.has(e.id))
      const changed = after.filter((e) => before.has(e.id) && before.get(e.id) !== JSON.stringify(e))
      const alive = new Set(after.map((e) => e.id))
      const deleted = [...before.keys()].filter((id) => !alive.has(id))
      const t = r.transcript.length > MAX_TRANSCRIPT ? ['…', ...r.transcript.slice(-MAX_TRANSCRIPT)] : r.transcript
      const out = [r.ok ? 'OK' : `STOPPED at input ${(r.failedAt ?? 0) + 1}: ${r.error ?? 'rejected'}`, ...(r.cancelledAt ? [`The last command was still waiting at "${r.cancelledAt.trim()}" and was cancelled.`] : []), 'Transcript:', ...t]
      if (created.length) out.push('Created:', ...created.slice(0, 50).map((e) => objectLine(e, layerName(doc, e.layer))), ...(created.length > 50 ? [`…and ${created.length - 50} more`] : []))
      if (changed.length) out.push('Changed:', ...changed.slice(0, 30).map((e) => objectLine(e, layerName(doc, e.layer))))
      if (deleted.length) out.push(`Deleted: ${deleted.join(', ')}`)
      return { text: out.join('\n'), isError: !r.ok }
    }
    case 'get_drawing': {
      const counts = new Map<string, number>()
      for (const e of doc.entities) counts.set(e.type, (counts.get(e.type) ?? 0) + 1)
      const all = doc.entities.map(box3)
      const ext = all.length ? [0, 1, 2].map((k) => [Math.min(...all.map((b) => b[0][k])), Math.max(...all.map((b) => b[1][k]))]) : null
      const space = doc.activeLayout ? `layout "${doc.activeLayout.name}" (paper mm)` : 'Model'
      return {
        text: [
          `Units: ${doc.units}`,
          `Space: ${space}`,
          `UCS: ${host.ucsName() ?? 'unnamed (not World)'}`,
          `Layers: ${doc.layers.map((l) => `${l.name}${l.id === doc.currentLayer ? ' (current)' : ''}${l.visible === false ? ' (off)' : ''}`).join(', ')}`,
          `Objects: ${counts.size ? [...counts].map(([k, v]) => `${k} ${v}`).join(', ') : 'none'}`,
          `Extents: ${ext ? `${p3([ext[0][0], ext[1][0], ext[2][0]])} .. ${p3([ext[0][1], ext[1][1], ext[2][1]])}` : 'empty'}`,
          `Layouts: ${doc.layouts.map((l) => l.name).join(', ') || 'none'}`,
        ].join('\n'),
      }
    }
    case 'query_objects': {
      const box = args.box as { min: number[]; max: number[] } | undefined
      const types = (args.types as string[] | undefined)?.map((t) => t.toUpperCase())
      const layer = args.layer as string | undefined
      const limit = Math.max(1, Math.min(500, Number(args.limit ?? 100)))
      const hit = doc.entities.filter((e) => {
        if (types?.length && !types.includes(e.type)) return false
        if (layer && layerName(doc, e.layer).toLowerCase() !== layer.toLowerCase()) return false
        if (!box) return true
        const [lo, hi] = box3(e)
        return [0, 1, 2].every((k) => hi[k] >= box.min[k] - 1e-9 && lo[k] <= box.max[k] + 1e-9)
      })
      const lines = hit.slice(0, limit).map((e) => objectLine(e, layerName(doc, e.layer)))
      return { text: [`${hit.length} object(s)${hit.length > limit ? `, first ${limit}` : ''}:`, ...lines].join('\n') }
    }
    case 'describe_object': {
      const list = ((args.ids as string[]) ?? []).map((id) => doc.getEntity(id))
      const out = list.map((e, i) => (e ? compact(e) : `${(args.ids as string[])[i]}: not found`))
      return { text: out.join('\n') }
    }
    case 'select': {
      const valid = ((args.ids as string[]) ?? []).filter((id) => doc.getEntity(id))
      host.select(valid)
      return { text: valid.length ? `${valid.length} object(s) selected.` : 'Selection cleared.' }
    }
    case 'set_properties': {
      const { ids: list, ...patch } = args as { ids: string[]; layer?: string; color?: string; linetype?: string; lineweight?: number }
      if (patch.layer && !doc.layers.some((l) => l.name.toLowerCase() === patch.layer!.toLowerCase())) return { text: `Layer "${patch.layer}" does not exist (create it with -LAYER M).`, isError: true }
      const k = host.setProperties(list ?? [], patch)
      return { text: `${k} object(s) changed.` }
    }
    case 'capture_view': {
      const img = host.captureView?.() ?? null
      return img ? { text: 'Image of the active view.', image: img } : { text: 'No view to capture.', isError: true }
    }
    case 'read_doc':
      return readDoc(host, String(args.id ?? ''))
    case 'undo': {
      const k = Math.max(1, Math.min(20, Number(args.steps ?? 1)))
      host.undo(k)
      return { text: `Undid ${k} step(s).` }
    }
    default:
      return { text: `Unknown tool ${name}.`, isError: true }
  }
}

/** Propiedades de un objeto en JSON compacto (números cortos). */
function compact(e: Entity): string {
  const round = (v: unknown): unknown =>
    typeof v === 'number' ? Number(n(v)) : Array.isArray(v) ? v.map(round) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'style').map(([k, x]) => [k, round(x)])) : v
  const s = JSON.stringify({ id: e.id, type: e.type, layer: e.layer, ...(e.color ? { color: e.color } : {}), props: round(e.props) })
  return s.length > 4000 ? `${describe(e)} (parameters too long to show: ${s.length} chars)` : s
}

/** Guía o listado de comandos de un menú. */
function readDoc(host: AgentHost, id: string): ToolResult {
  const key = id.trim().toLowerCase()
  if (GUIDES[key]) return { text: GUIDES[key] }
  const m = /^commands\/(.+)$/.exec(key)
  if (m) {
    const cat = CATEGORIES.find((c) => c.label.toLowerCase() === m[1])
    if (!cat) return { text: `No menu "${m[1]}". Menus: ${CATEGORIES.map((c) => c.label.toLowerCase()).join(', ')}.`, isError: true }
    const byName = new Map(host.commands().map((c) => [c.name, c]))
    const lines = cat.names
      .filter((x) => !x.startsWith('@'))
      .map((x) => (x.startsWith('§') ? (x.length > 1 ? `## ${x.slice(1)}` : '') : byName.get(x) ? `${x}${byName.get(x)!.aliases.length ? ` (${byName.get(x)!.aliases.join(', ')})` : ''} — ${byName.get(x)!.description}` : ''))
      .filter(Boolean)
    return { text: `# Commands: ${cat.label}\n${lines.join('\n')}` }
  }
  return { text: `No guide "${id}". Guides: ${Object.keys(GUIDES).join(', ')}, commands/<menu>.`, isError: true }
}
