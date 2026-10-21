import { viewZ } from './primitives'
import type { AttdefProps, InsertEntity } from '../../document/types'
import { blockAttdefs, syncAttributes } from '../../editing/block'
import { matchKeyword } from '../keywords'
import { sysvars } from '../sysvars'
import type { Command, CommandContext } from '../types'
import { askAngle, askDistance, textSizeStore } from '../ask'

const yn = (b: boolean | undefined) => (b ? 'Y' : 'N')

/** ATTDEF (ATT): define un atributo (tag, prompt, valor por defecto, modos, posición y texto). . */
export const attdefCommand: Command = {
  name: 'ATTDEF',
  planar: true,
  aliases: ['ATT', '-ATTDEF'],
  description: 'Define a block attribute (tag, prompt, default value, Invisible/Constant/Preset)',
  async run(ctx) {
    const modes = { invisible: false, constant: false, preset: false }
    for (;;) {
      ctx.print(`Current attribute modes: Invisible=${yn(modes.invisible)} Constant=${yn(modes.constant)} Preset=${yn(modes.preset)}`)
      const t = await ctx.getString('Enter an option to change [Invisible/Constant/Preset] <done>: ', { default: '' })
      if (t === null) return
      if (!t.trim()) break
      const k = matchKeyword(t, ['Invisible', 'Constant', 'Preset'])
      if (!k) ctx.print('Invalid option.')
      else if (k === 'Invisible') modes.invisible = !modes.invisible
      else if (k === 'Constant') modes.constant = !modes.constant
      else modes.preset = !modes.preset
    }
    const tag = (await ctx.getString('Enter attribute tag name: '))?.trim().toUpperCase()
    if (!tag) return
    if (/\s/.test(tag)) return ctx.print('Tag names cannot contain spaces.')
    let prompt = tag
    if (!modes.constant) {
      const p = await ctx.getString(`Enter attribute prompt <${tag}>: `, { default: '' })
      if (p === null) return
      prompt = p.trim() || tag
    }
    const value = await ctx.getString(modes.constant ? 'Enter attribute value: ' : 'Enter default attribute value: ', { default: '' })
    if (value === null) return
    let justify: AttdefProps['justify'] = 'left'
    let r = await ctx.getPoint('Specify start point of text or [Justify]: ', { keywords: ['Justify'] })
    if (r.kind === 'keyword') {
      const j = await ctx.getString('Enter an option [Left/Center/Right] <Left>: ', { default: '' })
      if (j === null) return
      justify = (matchKeyword(j || 'Left', ['Left', 'Center', 'Right']) ?? 'Left').toLowerCase() as AttdefProps['justify']
      r = await ctx.getPoint('Specify start point of text: ')
    }
    if (r.kind !== 'point') return
    // Alto = TEXTSIZE del dibujo y la última rotación de texto: Enter los repite.
    const h = await askDistance(ctx, 'TEXTSIZE', 'Specify text height', { base: r.point, store: textSizeStore(ctx), valid: (v) => v > 0 })
    if (h.kind !== 'distance') return
    const rot = await askAngle(ctx, 'TEXT.rotation', 'Specify rotation angle of text', { base: r.point, initial: 0 })
    if (rot.kind !== 'angle') return
    ctx.doc.addEntity({
      type: 'ATTDEF',
      layer: ctx.currentLayerId(),
      props: {
        position: [r.point.x, r.point.y, r.point.z],
        height: h.value > 0 ? h.value : ctx.doc.textSize,
        rotation: (rot.deg * Math.PI) / 180,
        justify,
        normal: viewZ(ctx),
        tag,
        prompt,
        value,
        ...(modes.invisible ? { invisible: true } : {}),
        ...(modes.constant ? { constant: true } : {}),
        ...(modes.preset ? { preset: true } : {}),
      },
    })
  },
}

/**
 * Valores de los atributos variables de un bloque al insertarlo: diálogo (ATTDIA=1) o línea de comandos;
 * con ATTREQ=0, o en los *Preset*, el valor por defecto. null si se cancela.
 */
export async function askAttributeValues(ctx: CommandContext, blockName: string): Promise<{ tag: string; value: string }[] | null> {
  const defs = blockAttdefs(ctx.doc.getBlock(blockName)).filter((a) => !a.constant)
  const values = defs.map((a) => ({ tag: a.tag, value: a.value }))
  const ask = defs.filter((a) => !a.preset)
  if (!ask.length || sysvars.ATTREQ === 0) return values
  const set = (tag: string, value: string) => {
    const v = values.find((x) => x.tag === tag)
    if (v) v.value = value
  }
  if (sysvars.ATTDIA === 1) {
    const res = await ctx.app.editAttributes(`Edit Attributes — ${blockName}`, ask.map((a) => ({ tag: a.tag, prompt: a.prompt, value: a.value })))
    if (!res) return null
    ask.forEach((a, i) => set(a.tag, res[i] ?? a.value))
    return values
  }
  ctx.print('Enter attribute values')
  for (const a of ask) {
    const v = await ctx.getString(`${a.prompt || a.tag} <${a.value}>: `, { default: a.value })
    if (v === null) return null
    set(a.tag, v)
  }
  return values
}

/** Inserción con atributos bajo un clic (o null con el mensaje correspondiente). */
async function pickAttributedInsert(ctx: CommandContext, prompt: string): Promise<InsertEntity | null> {
  const r = await ctx.getPoint(prompt)
  if (r.kind !== 'point') return null
  const e = r.pick?.id ? ctx.doc.getEntity(r.pick.id) : undefined
  if (e?.type !== 'INSERT') {
    ctx.print('That object is not a block.')
    return null
  }
  if (!e.props.attributes?.length) {
    ctx.print('That block has no editable attributes.')
    return null
  }
  return e
}

/** Prompt de cada atributo (de su ATTDEF; el tag si ya no existe en la definición). */
function promptOf(ctx: CommandContext, ins: InsertEntity, tag: string): string {
  return blockAttdefs(ctx.doc.getBlock(ins.props.name)).find((a) => a.tag === tag)?.prompt || tag
}

/** ATTEDIT: edita los valores de los atributos de una inserción por línea de comandos. */
export const atteditCommand: Command = {
  name: 'ATTEDIT',
  aliases: ['ATE', '-ATTEDIT'],
  description: 'Edit the attribute values of a block reference (command line)',
  async run(ctx) {
    const ins = await pickAttributedInsert(ctx, 'Select block reference: ')
    if (!ins) return
    for (const a of ins.props.attributes ?? []) {
      const v = await ctx.getString(`${promptOf(ctx, ins, a.tag)} <${a.value}>: `, { default: a.value })
      if (v === null) return
      a.value = v
    }
    ctx.doc.touch()
  },
}

/** EATTEDIT: editor de atributos en diálogo (también con doble clic sobre un bloque con atributos). */
export const eatteditCommand: Command = {
  name: 'EATTEDIT',
  aliases: [],
  description: 'Enhanced Attribute Editor: edit the attributes of a block reference in a dialog',
  async run(ctx) {
    const ins = await pickAttributedInsert(ctx, 'Select a block: ')
    if (!ins) return
    const attrs = ins.props.attributes ?? []
    const res = await ctx.app.editAttributes(
      `Enhanced Attribute Editor — ${ins.props.name}`,
      attrs.map((a) => ({ tag: a.tag, prompt: promptOf(ctx, ins, a.tag), value: a.value })),
    )
    if (!res) return
    attrs.forEach((a, i) => (a.value = res[i] ?? a.value))
    ctx.doc.touch()
  },
}

/** Todas las inserciones del dibujo (modelo, papeles y definiciones de bloque). */
function allInserts(ctx: CommandContext): InsertEntity[] {
  const lists = [ctx.doc.modelEntities, ...ctx.doc.layouts.map((l) => l.entities), ...ctx.doc.blocks.map((b) => b.entities)]
  return lists.flat().filter((e): e is InsertEntity => e.type === 'INSERT')
}

/** ATTSYNC: actualiza los atributos de las inserciones de un bloque redefinido, conservando valores. */
export const attsyncCommand: Command = {
  name: 'ATTSYNC',
  aliases: [],
  description: 'Synchronize block references with their redefined attributes [?/Name/Select]',
  async run(ctx) {
    const t = await ctx.getString('Enter an option [?/Name/Select] <Select>: ', { default: '' })
    if (t === null) return
    const opt = t.trim() ? matchKeyword(t, ['?', 'Name', 'Select']) : 'Select'
    const withAttrs = ctx.doc.blocks.filter((b) => blockAttdefs(b).length > 0).map((b) => b.name)
    let name: string | undefined
    if (opt === '?') return ctx.print(withAttrs.length ? `Blocks with attributes: ${withAttrs.join(', ')}` : 'No blocks with attributes.')
    if (opt === 'Name') {
      name = (await ctx.getString('Enter name of block to synchronize: '))?.trim()
      const b = name ? ctx.doc.blocks.find((x) => x.name.toLowerCase() === name!.toLowerCase()) : undefined
      if (!b) return ctx.print(`Block "${name ?? ''}" not found.`)
      name = b.name
    } else if (opt === 'Select') {
      const r = await ctx.getPoint('Select a block: ')
      const e = r.kind === 'point' && r.pick?.id ? ctx.doc.getEntity(r.pick.id) : undefined
      if (e?.type !== 'INSERT') return ctx.print('That object is not a block.')
      name = e.props.name
    } else return ctx.print('Invalid option.')
    const def = ctx.doc.getBlock(name)
    if (!blockAttdefs(def).length && !allInserts(ctx).some((i) => i.props.name === name && i.props.attributes?.length)) {
      return ctx.print(`Block "${name}" has no attributes.`)
    }
    let n = 0
    for (const ins of allInserts(ctx)) {
      if (ins.props.name !== name) continue
      ins.props.attributes = syncAttributes(ins.props.attributes, def)
      n++
    }
    ctx.doc.touch()
    ctx.print(`ATTSYNC block ${name}: ${n} block reference(s) synchronized.`)
  },
}

/** ATTDISP: visibilidad de los atributos [Normal/ON/OFF]. */
export const attdispCommand: Command = {
  name: 'ATTDISP',
  aliases: [],
  description: 'Attribute visibility [Normal/ON/OFF]',
  async run(ctx) {
    const cur = ctx.doc.attdisp
    const label = cur === 'normal' ? 'Normal' : cur.toUpperCase()
    const t = await ctx.getString(`Enter attribute visibility setting [Normal/ON/OFF] <${label}>: `, { default: '' })
    if (t === null) return
    const k = t.trim() ? matchKeyword(t, ['Normal', 'ON', 'OFF']) : label
    if (!k) return ctx.print('Invalid option.')
    ctx.doc.setAttdisp(k.toLowerCase() as 'normal' | 'on' | 'off')
  },
}
