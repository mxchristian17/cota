import type { Command, CommandContext } from '../types'
import type { GroupDef } from '../../document/types'
import { anonymousGroupName } from '../../document/groups'
import { sysvars } from '../sysvars'
import { endIsolation, hideIds } from '../../editing/isolation'

const findGroup = (ctx: CommandContext, name: string): GroupDef | undefined =>
  ctx.doc.groups.find((g) => g.name.toLowerCase() === name.trim().toLowerCase())

/** Grupos del objeto con ese id (el más reciente primero). */
const groupsOf = (ctx: CommandContext, id: string): GroupDef[] => ctx.doc.groups.filter((g) => g.ids.includes(id)).reverse()

function saveGroup(ctx: CommandContext, g: GroupDef): void {
  const rest = ctx.doc.groups.filter((x) => x.name.toLowerCase() !== g.name.toLowerCase())
  ctx.doc.setGroups([...rest, g])
}

async function askName(ctx: CommandContext, prompt: string): Promise<string | null> {
  for (;;) {
    const s = await ctx.getString(prompt)
    if (s === null) return null
    const n = s.trim()
    if (!n) return ''
    if (/[<>/\\":;?*|,=`]/.test(n)) {
      ctx.print('Invalid group name.')
      continue
    }
    return n
  }
}

/**
 * GROUP: agrupa los objetos elegidos (Name: con nombre; si no, uno sin nombre `*A1`). Con PICKSTYLE 1, elegir uno
 * toma el grupo entero, como el CAD clásico.
 */
export const groupCommand: Command = {
  name: 'GROUP',
  aliases: ['G'],
  description: 'Group the selected objects so they are selected together [Name/Description]; UNGROUP breaks a group',
  async run(ctx) {
    let name = ''
    let description: string | undefined
    let ids: string[]
    for (;;) {
      const r = await ctx.getSelectionOrKeyword('Select objects or [Name/Description]: ', ['Name', 'Description'])
      if (!r) return
      if (r.kind === 'selection') {
        ids = r.ids
        break
      }
      if (r.keyword === 'Name') {
        const n = await askName(ctx, 'Enter a group name: ')
        if (n === null) return
        if (n && findGroup(ctx, n)) {
          ctx.print(`A group named "${n}" already exists.`)
          continue
        }
        name = n
      } else {
        const d = await ctx.getString('Enter group description: ', { default: '' })
        if (d === null) return
        description = d.trim() || undefined
      }
    }
    if (!ids.length) {
      ctx.print('No objects selected: the group needs at least one object.')
      return
    }
    const g: GroupDef = { name: name || anonymousGroupName(ctx.doc.groups), ids: [...ids], selectable: true, ...(description ? { description } : {}) }
    saveGroup(ctx, g)
    ctx.print(name ? `Group "${g.name}" has been created.` : `Unnamed group has been created (${g.name}).`)
  },
}

/** UNGROUP: deshace el grupo del objeto elegido (o el que se nombre). */
export const ungroupCommand: Command = {
  name: 'UNGROUP',
  aliases: [],
  description: 'Break up the group of a picked object [Name]',
  async run(ctx) {
    for (;;) {
      const r = await ctx.getPoint('Select group or [Name]: ', { keywords: ['Name'], base: null })
      if (r.kind === 'cancel') return
      let g: GroupDef | undefined
      if (r.kind === 'keyword') {
        const n = await ctx.getString('Enter a group name: ')
        if (!n) return
        g = findGroup(ctx, n)
        if (!g) {
          ctx.print(`Group "${n.trim()}" not found.`)
          continue
        }
      } else {
        const id = r.pick?.id
        g = id ? groupsOf(ctx, id)[0] : undefined
        if (!g) {
          ctx.print(id ? 'That object is not in a group.' : 'No object found.')
          continue
        }
      }
      ctx.doc.setGroups(ctx.doc.groups.filter((x) => x.name !== g.name))
      ctx.print(`Group "${g.name}" has been ungrouped.`)
      return
    }
  },
}

/** -GROUP: grupos por línea de comandos (listar, crear, agregar, quitar, deshacer, renombrar, seleccionable). */
export const groupCliCommand: Command = {
  name: '-GROUP',
  aliases: ['-G'],
  description: 'Groups from the command line [?/Add/Remove/Explode/REName/Selectable/Create]',
  async run(ctx) {
    const r = await ctx.getPoint('Enter a group option [?/Add/Remove/Explode/REName/Selectable/Create] <Create>: ', {
      keywords: ['?', 'Add', 'Remove', 'Explode', 'REName', 'Selectable', 'Create'],
      enterKeyword: 'Create',
      base: null,
    })
    if (r.kind !== 'keyword') return
    const kw = r.keyword
    if (kw === '?') {
      const list = ctx.doc.groups
      if (!list.length) return ctx.print('No groups in the drawing.')
      for (const g of list) ctx.print(`"${g.name}": ${g.ids.length} object(s), ${g.selectable ? 'selectable' : 'not selectable'}${g.description ? ` — ${g.description}` : ''}`)
      return
    }
    if (kw === 'Create') {
      const n = await askName(ctx, 'Enter a group name or [?]: ')
      if (n === null) return
      if (n && findGroup(ctx, n)) return ctx.print(`A group named "${n}" already exists.`)
      const ids = await ctx.getSelection('Select objects: ')
      if (!ids?.length) return ctx.print('No objects selected: the group needs at least one object.')
      const g: GroupDef = { name: n || anonymousGroupName(ctx.doc.groups), ids: [...ids], selectable: true }
      saveGroup(ctx, g)
      return ctx.print(`Group "${g.name}" has been created.`)
    }
    const n = await ctx.getString('Enter the name of the group: ')
    if (!n) return
    const g = findGroup(ctx, n)
    if (!g) return ctx.print(`Group "${n.trim()}" not found.`)
    if (kw === 'Explode') {
      ctx.doc.setGroups(ctx.doc.groups.filter((x) => x.name !== g.name))
      return ctx.print(`Group "${g.name}" has been exploded.`)
    }
    if (kw === 'REName') {
      const to = await askName(ctx, `Enter a new name for group "${g.name}": `)
      if (!to) return
      if (findGroup(ctx, to)) return ctx.print(`A group named "${to}" already exists.`)
      ctx.doc.setGroups(ctx.doc.groups.map((x) => (x.name === g.name ? { ...x, name: to } : x)))
      return ctx.print(`Group "${g.name}" renamed to "${to}".`)
    }
    if (kw === 'Selectable') {
      const s = await ctx.getPoint(`This group is ${g.selectable ? '' : 'not '}selectable. Make it selectable? [Yes/No] <${g.selectable ? 'No' : 'Yes'}>: `, {
        keywords: ['Yes', 'No'],
        enterKeyword: g.selectable ? 'No' : 'Yes',
        base: null,
      })
      if (s.kind !== 'keyword') return
      return saveGroup(ctx, { ...g, selectable: s.keyword === 'Yes' })
    }
    // Add / Remove: con PICKSTYLE apagado, para poder elegir miembros sueltos.
    const before = sysvars.PICKSTYLE
    sysvars.PICKSTYLE = 0
    try {
      const ids = await ctx.getSelection(kw === 'Add' ? 'Select objects to add to the group: ' : 'Select objects to remove from the group: ')
      if (!ids?.length) return
      const next = kw === 'Add' ? [...new Set([...g.ids, ...ids])] : g.ids.filter((id) => !ids.includes(id))
      if (!next.length) {
        ctx.doc.setGroups(ctx.doc.groups.filter((x) => x.name !== g.name))
        return ctx.print(`Group "${g.name}" is empty and has been removed.`)
      }
      saveGroup(ctx, { ...g, ids: next })
      ctx.print(`Group "${g.name}" now has ${next.length} object(s).`)
    } finally {
      sysvars.PICKSTYLE = before
    }
  },
}

/** PICKSTYLE: selección de grupos (1, por defecto) o de objetos sueltos (0). Ctrl+Shift+A la alterna. */
export const pickstyleCommand: Command = {
  name: 'PICKSTYLE',
  aliases: [],
  description: 'Group selection: 1 = picking a grouped object selects its group, 0 = single objects (Ctrl+Shift+A toggles)',
  async run(ctx) {
    const r = await ctx.getString(`Enter new value for PICKSTYLE <${sysvars.PICKSTYLE}>: `, { default: String(sysvars.PICKSTYLE) })
    if (r === null) return
    if (r.trim() !== '0' && r.trim() !== '1') return ctx.print('Valid values: 0 or 1.')
    sysvars.PICKSTYLE = r.trim() === '1' ? 1 : 0
  },
}

/** QSELECT: selección rápida por tipo y propiedad (diálogo). */
export const qselectCommand: Command = {
  name: 'QSELECT',
  aliases: [],
  description: 'Quick Select: select objects by type and property (layer, linetype, length, radius, area, text…) in a dialog',
  async run(ctx) {
    if (!ctx.app.qselect) return ctx.print('Quick Select needs the drawing window.')
    ctx.app.qselect()
  },
}

/** ISOLATEOBJECTS: deja a la vista sólo los objetos elegidos (temporal, no se guarda con el dibujo). */
export const isolateObjectsCommand: Command = {
  name: 'ISOLATEOBJECTS',
  aliases: ['ISOLATE'],
  description: 'Temporarily hide everything except the selected objects (UNISOLATEOBJECTS shows them again)',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (!ids?.length) return
    const keep = new Set(ids)
    const others = ctx.doc.entities.filter((e) => !keep.has(e.id)).map((e) => e.id)
    hideIds(others)
    ctx.app.clearSelection()
    ctx.print(`${ids.length} object(s) isolated.`)
  },
}

/** HIDEOBJECTS: oculta los objetos elegidos (temporal). */
export const hideObjectsCommand: Command = {
  name: 'HIDEOBJECTS',
  aliases: [],
  description: 'Temporarily hide the selected objects (UNISOLATEOBJECTS shows them again)',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (!ids?.length) return
    hideIds(ids)
    ctx.app.clearSelection()
    ctx.print(`${ids.length} object(s) hidden.`)
  },
}

/** UNISOLATEOBJECTS: vuelve a mostrar lo oculto con ISOLATEOBJECTS o HIDEOBJECTS. */
export const unisolateObjectsCommand: Command = {
  name: 'UNISOLATEOBJECTS',
  aliases: ['UNISOLATE'],
  description: 'Show again the objects hidden by ISOLATEOBJECTS or HIDEOBJECTS',
  async run(ctx) {
    ctx.print(endIsolation() ? 'Object isolation ended.' : 'No objects are isolated or hidden.')
  },
}
