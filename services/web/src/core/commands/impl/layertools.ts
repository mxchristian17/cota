import type { Layer } from '../../document/types'
import { LayerService } from '../../layers/LayerService'
import { aciToHex } from '../../io/dxfColor'
import { askKeyword } from '../ask'
import type { Command, CommandContext } from '../types'

/**
 * Capas desde la línea de comandos: `-LAYER` y las herramientas del CAD clásico `LAYFRZ`, `LAYOFF`,
 * `LAYTHW`, `LAYON`, `LAYLCK`, `LAYULK`, `LAYISO`, `LAYUNISO`, `LAYMCUR`.
 */

const svc = (ctx: CommandContext) => new LayerService(ctx.doc)
const byId = (ctx: CommandContext, id: string) => ctx.doc.layers.find((l) => l.id === id)
const isCurrent = (ctx: CommandContext, l: Layer) => l.id === ctx.currentLayerId()

/** Capas que coinciden con una lista `a,b*,c?` (comodines `*` y `?`, sin distinguir mayúsculas). */
export function matchLayers(layers: Layer[], list: string): Layer[] {
  const pats = list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i'))
  return layers.filter((l) => pats.some((re) => re.test(l.name)))
}

const NAMED: Record<string, string> = { red: '#ff0000', yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', blue: '#0000ff', magenta: '#ff00ff', white: '#ffffff' }

/** Color del CAD clásico: índice ACI, nombre, `#rrggbb` o truecolor `r,g,b`. */
export function parseColor(text: string): string | null {
  const t = text.trim().toLowerCase()
  if (NAMED[t]) return NAMED[t]
  if (/^#[0-9a-f]{6}$/.test(t)) return t
  const rgb = /^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/.exec(t)
  if (rgb) {
    const c = rgb.slice(1).map(Number)
    return c.every((v) => v <= 255) ? '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('') : null
  }
  const n = Number(t)
  return Number.isInteger(n) && n >= 1 && n <= 255 ? aciToHex(n) : null
}

/** Capa del objeto tocado (o un nombre de opción). null si se cancela. */
async function pickLayer(ctx: CommandContext, prompt: string, keywords: string[] = []): Promise<Layer | string | null> {
  for (;;) {
    const r = await ctx.getPoint(prompt, { base: null, keywords })
    if (r.kind === 'keyword') return r.keyword
    if (r.kind !== 'point') return null
    const e = r.pick?.id ? ctx.doc.getEntity(r.pick.id) : undefined
    const l = e ? byId(ctx, e.layer) : undefined
    if (l) return l
    ctx.print('Nothing found.')
  }
}

/** Congela una capa; la actual no se puede. Devuelve true si la congeló. */
function freeze(ctx: CommandContext, l: Layer): boolean {
  if (isCurrent(ctx, l)) {
    ctx.print(`Cannot freeze layer "${l.name}". It is the CURRENT layer.`)
    return false
  }
  if (!l.frozen) {
    svc(ctx).setFrozen(l.id, true)
    ctx.app.clearSelection()
  }
  return true
}

/** Apaga una capa; si es la actual, pregunta (como el CAD clásico). */
async function turnOff(ctx: CommandContext, l: Layer): Promise<boolean> {
  if (isCurrent(ctx, l)) {
    const yes = await askKeyword(ctx, `Really want layer "${l.name}" (the CURRENT layer) off? [Yes/No] <No>: `, ['Yes', 'No'], 'No')
    if (yes !== 'Yes') return false
  }
  svc(ctx).setVisible(l.id, false)
  return true
}

/** Hace actual una capa (si no está congelada). */
function makeCurrent(ctx: CommandContext, l: Layer): boolean {
  if (l.frozen) {
    ctx.print(`Cannot set frozen layer "${l.name}" current.`)
    return false
  }
  ctx.app.setCurrentLayer?.(l.id)
  return true
}

const onOff = (b: boolean, on: string, off: string) => (b ? on : off)

function listLayers(ctx: CommandContext, list: string): void {
  const rows = matchLayers(ctx.doc.layers, list || '*')
  ctx.print('Layer name         State                  Color    Linetype     Lineweight')
  for (const l of rows) {
    const state = [onOff(l.visible, 'On', 'Off'), onOff(!!l.frozen, 'Frozen', 'Thawed'), onOff(l.locked, 'Locked', ''), onOff(l.printable, '', 'No plot')].filter(Boolean).join(' ')
    ctx.print(`${(isCurrent(ctx, l) ? '*' : ' ') + l.name.padEnd(18)} ${state.padEnd(22)} ${l.color.padEnd(8)} ${l.lineType.padEnd(12)} ${l.lineWeight.toFixed(2)} mm`)
  }
  ctx.print(`Current layer: "${byId(ctx, ctx.currentLayerId())?.name ?? '0'}"`)
}

const OPTIONS = ['?', 'Make', 'Set', 'New', 'Rename', 'ON', 'OFF', 'Color', 'Ltype', 'LWeight', 'Plot', 'Freeze', 'Thaw', 'LOck', 'Unlock']

/** Pide una lista de capas; Enter = `def`. Avisa si no coincide ninguna. */
async function askLayers(ctx: CommandContext, prompt: string, def?: string): Promise<Layer[] | null> {
  const s = await ctx.getString(prompt, def !== undefined ? { default: def } : undefined)
  if (s === null || s.trim() === '') return null
  const found = matchLayers(ctx.doc.layers, s)
  if (!found.length) ctx.print(`No matching layer(s) for "${s}".`)
  return found
}

export const layerCmdlineCommand: Command = {
  name: '-LAYER',
  aliases: ['-LA'],
  description: 'Layers from the command line: ?/Make/Set/New/Rename/ON/OFF/Color/Ltype/LWeight/Plot/Freeze/Thaw/LOck/Unlock',
  async run(ctx) {
    ctx.print(`Current layer: "${byId(ctx, ctx.currentLayerId())?.name ?? '0'}"`)
    for (;;) {
      const kw = await askKeyword(ctx, `Enter an option [${OPTIONS.join('/')}]: `, OPTIONS)
      if (!kw) return
      const curName = byId(ctx, ctx.currentLayerId())?.name ?? '0'
      switch (kw) {
        case '?': {
          const s = await ctx.getString('Enter layer name(s) to list <*>: ', { default: '*' })
          if (s !== null) listLayers(ctx, s)
          break
        }
        case 'Make':
        case 'Set': {
          const s = await ctx.getString(kw === 'Make' ? `Enter name for new layer (becomes the current layer) <${curName}>: ` : 'Enter layer name to make current: ', { default: kw === 'Make' ? curName : '' })
          if (!s) break
          let l = matchLayers(ctx.doc.layers, s.replace(/[*?,]/g, ''))[0]
          if (!l && kw === 'Make') l = svc(ctx).create(s)
          if (!l) ctx.print(`Cannot find layer "${s}".`)
          else makeCurrent(ctx, l)
          break
        }
        case 'New': {
          const s = await ctx.getString('Enter name list for new layer(s): ')
          for (const name of (s ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
            if (ctx.doc.layers.some((l) => l.name.toLowerCase() === name.toLowerCase())) ctx.print(`Layer "${name}" already exists.`)
            else svc(ctx).create(name)
          }
          break
        }
        case 'Rename': {
          const from = await ctx.getString('Enter old layer name: ')
          const l = from ? ctx.doc.layers.find((x) => x.name.toLowerCase() === from.trim().toLowerCase()) : undefined
          if (!l) {
            if (from) ctx.print(`Cannot find layer "${from}".`)
            break
          }
          const to = await ctx.getString('Enter new layer name: ')
          if (!to) break
          try {
            svc(ctx).rename(l.id, to)
          } catch (err) {
            ctx.print((err as Error).message)
          }
          break
        }
        case 'ON':
        case 'OFF':
        case 'Thaw':
        case 'LOck':
        case 'Unlock':
        case 'Freeze': {
          const verb = { ON: 'turn On', OFF: 'turn Off', Thaw: 'thaw', LOck: 'lock', Unlock: 'unlock', Freeze: 'freeze' }[kw]
          const ls = await askLayers(ctx, `Enter name list of layer(s) to ${verb}: `)
          for (const l of ls ?? []) {
            if (kw === 'ON') svc(ctx).setVisible(l.id, true)
            else if (kw === 'OFF') await turnOff(ctx, l)
            else if (kw === 'Thaw') svc(ctx).setFrozen(l.id, false)
            else if (kw === 'Freeze') freeze(ctx, l)
            else svc(ctx).setLocked(l.id, kw === 'LOck')
          }
          break
        }
        case 'Color': {
          const c = await ctx.getString('New color [index 1-255, name, #rrggbb or r,g,b]: ')
          const color = c ? parseColor(c) : null
          if (!color) {
            if (c) ctx.print('Invalid color.')
            break
          }
          for (const l of (await askLayers(ctx, `Enter name list of layer(s) for color ${c} <${curName}>: `, curName)) ?? []) svc(ctx).setColor(l.id, color)
          break
        }
        case 'Ltype': {
          const t = await ctx.getString('Enter a loaded linetype name or [?] <Continuous>: ', { default: 'CONTINUOUS' })
          if ((t ?? '').trim() === '?') {
            ctx.print(ctx.doc.linetypes.map((d) => d.name).join(', '))
            break
          }
          // Uno de la biblioteca métrica se carga solo.
          const lt = ctx.doc.loadLinetype((t ?? '').trim())?.name
          if (!lt) {
            ctx.print(`Linetype "${t}" not found. Use the LINETYPE command to load it.`)
            break
          }
          for (const l of (await askLayers(ctx, `Enter name list of layer(s) for linetype "${lt}" <${curName}>: `, curName)) ?? []) {
            l.lineType = lt
            ctx.doc.touch()
          }
          break
        }
        case 'LWeight': {
          const w = await ctx.getString('Enter lineweight (0.0mm - 2.11mm): ')
          const v = Number((w ?? '').replace(',', '.').replace(/mm$/i, ''))
          if (!(v >= 0 && v <= 2.11)) {
            if (w) ctx.print('Invalid lineweight.')
            break
          }
          for (const l of (await askLayers(ctx, `Enter name list of layers(s) for lineweight ${v.toFixed(2)}mm <${curName}>: `, curName)) ?? []) svc(ctx).setLineWeight(l.id, v)
          break
        }
        case 'Plot': {
          const p = await askKeyword(ctx, 'Enter a plotting preference [Plot/No plot] <Plot>: ', ['Plot', 'No'], 'Plot')
          if (!p) break
          for (const l of (await askLayers(ctx, `Enter layer name(s) for this plot preference <${curName}>: `, curName)) ?? []) {
            l.printable = p === 'Plot'
            ctx.doc.touch()
          }
          break
        }
      }
    }
  },
}

/** Herramienta que actúa sobre la capa del objeto tocado, repitiendo hasta Enter, con `Undo`. */
function pickTool(name: string, alias: string[], description: string, prompt: string, act: (ctx: CommandContext, l: Layer) => Promise<boolean> | boolean, undo: (ctx: CommandContext, l: Layer) => void, done: (l: Layer) => string): Command {
  return {
    name,
    aliases: alias,
    description,
    async run(ctx) {
      const doneList: Layer[] = []
      for (;;) {
        const r = await pickLayer(ctx, `${prompt} or [Undo]: `, ['Undo'])
        if (r === null) return
        if (r === 'Undo') {
          const last = doneList.pop()
          if (last) undo(ctx, last)
          else ctx.print('Nothing to undo.')
          continue
        }
        if (typeof r === 'string') continue
        if (await act(ctx, r)) {
          doneList.push(r)
          ctx.print(done(r))
        }
      }
    },
  }
}

export const layFrzCommand = pickTool(
  'LAYFRZ',
  [],
  'Freeze the layer of the selected objects',
  'Select an object on the layer to be frozen',
  (ctx, l) => freeze(ctx, l),
  (ctx, l) => svc(ctx).setFrozen(l.id, false),
  (l) => `Layer "${l.name}" has been frozen.`,
)

export const layOffCommand = pickTool(
  'LAYOFF',
  [],
  'Turn off the layer of the selected objects',
  'Select an object on the layer to be turned off',
  (ctx, l) => turnOff(ctx, l),
  (ctx, l) => svc(ctx).setVisible(l.id, true),
  (l) => `Layer "${l.name}" has been turned off.`,
)

export const layLckCommand = pickTool(
  'LAYLCK',
  [],
  'Lock the layer of the selected object',
  'Select an object on the layer to be locked',
  (ctx, l) => (svc(ctx).setLocked(l.id, true), true),
  (ctx, l) => svc(ctx).setLocked(l.id, false),
  (l) => `Layer "${l.name}" has been locked.`,
)

export const layUlkCommand = pickTool(
  'LAYULK',
  [],
  'Unlock the layer of the selected object',
  'Select an object on the layer to be unlocked',
  (ctx, l) => (svc(ctx).setLocked(l.id, false), true),
  (ctx, l) => svc(ctx).setLocked(l.id, true),
  (l) => `Layer "${l.name}" has been unlocked.`,
)

export const layThwCommand: Command = {
  name: 'LAYTHW',
  aliases: [],
  description: 'Thaw all layers',
  async run(ctx) {
    for (const l of ctx.doc.layers) if (l.frozen) svc(ctx).setFrozen(l.id, false)
    ctx.print('All layers have been thawed.')
  },
}

export const layOnCommand: Command = {
  name: 'LAYON',
  aliases: [],
  description: 'Turn on all layers',
  async run(ctx) {
    for (const l of ctx.doc.layers) if (!l.visible) svc(ctx).setVisible(l.id, true)
    ctx.print('All layers have been turned on.')
  },
}

export const layMcurCommand: Command = {
  name: 'LAYMCUR',
  aliases: [],
  description: 'Make the layer of a selected object current',
  async run(ctx) {
    const l = await pickLayer(ctx, 'Select object whose layer will become current: ')
    if (l && typeof l !== 'string' && makeCurrent(ctx, l)) ctx.print(`"${l.name}" is now the current layer.`)
  },
}

export const layIsoCommand: Command = {
  name: 'LAYISO',
  aliases: [],
  description: 'Isolate the layers of the selected objects: the other layers are turned off (LAYUNISO restores)',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects on the layer(s) to be isolated: ')
    const ents = (ids ?? []).map((id) => ctx.doc.getEntity(id)).filter((e) => !!e)
    if (!ents.length) return
    const keep = new Set(ents.map((e) => e!.layer))
    // Guarda el estado previo (sólo el del primer LAYISO, como el CAD clásico hasta un LAYUNISO).
    if (!ctx.doc.layIso) ctx.doc.setLayIso(ctx.doc.layers.map((l) => ({ id: l.id, visible: l.visible, locked: l.locked })))
    for (const l of ctx.doc.layers) svc(ctx).setVisible(l.id, keep.has(l.id))
    if (!keep.has(ctx.currentLayerId())) {
      const first = byId(ctx, ents[0]!.layer)
      if (first && makeCurrent(ctx, first)) ctx.print(`Layer "${first.name}" has been made current.`)
    }
    ctx.app.clearSelection()
    const names = [...keep].map((id) => byId(ctx, id)?.name).filter(Boolean)
    ctx.print(`Layer${names.length > 1 ? 's' : ''} ${names.join(', ')} ${names.length > 1 ? 'have' : 'has'} been isolated.`)
  },
}

export const layUnisoCommand: Command = {
  name: 'LAYUNISO',
  aliases: [],
  description: 'Restore the layers turned off by the last LAYISO',
  async run(ctx) {
    const saved = ctx.doc.layIso
    if (!saved) {
      ctx.print('No layers have been isolated by LAYISO.')
      return
    }
    for (const st of saved) {
      if (!byId(ctx, st.id)) continue
      svc(ctx).setVisible(st.id, st.visible)
      svc(ctx).setLocked(st.id, st.locked)
    }
    ctx.doc.setLayIso(null)
    ctx.print('Layers isolated by LAYISO command have been restored.')
  },
}

export const layerToolCommands: Command[] = [
  layerCmdlineCommand,
  layFrzCommand,
  layOffCommand,
  layThwCommand,
  layOnCommand,
  layLckCommand,
  layUlkCommand,
  layIsoCommand,
  layUnisoCommand,
  layMcurCommand,
]
