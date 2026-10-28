import type { Command } from '../types'
import type { DocumentModel } from '../../document/DocumentModel'
import type { Entity } from '../../document/types'
import { LayerService } from '../../layers/LayerService'
import { BYBLOCK, BYLAYER, CONTINUOUS } from '../../linetype/linetypes'

/** Todas las listas de objetos del dibujo: modelo, cada layout y cada definición de bloque. */
const allLists = (doc: DocumentModel): Entity[][] => [doc.modelEntities, ...doc.layouts.map((l) => doc.layoutEntities(l.id)), ...doc.blocks.map((b) => b.entities)]

/** Lo que se puede purgar (sin uso), como el PURGE del CAD clásico. Los bloques internos (`*…`) no se tocan. */
export function purgeable(doc: DocumentModel, currentLayer: string): { blocks: string[]; layers: string[]; linetypes: string[]; dimstyles: string[] } {
  const lists = allLists(doc)
  const usedBlocks = new Set<string>()
  const usedLayers = new Set<string>([currentLayer])
  const usedDims = new Set<string>([doc.currentDimStyle])
  for (const list of lists) {
    for (const e of list) {
      usedLayers.add(e.layer)
      if (e.type === 'INSERT') usedBlocks.add(e.props.name)
      if (e.type === 'DIMENSION' && e.props.styleName) usedDims.add(e.props.styleName)
    }
  }
  const fixed = new Set([CONTINUOUS, BYLAYER, BYBLOCK].map((n) => n.toUpperCase()))
  return {
    blocks: doc.blocks.map((b) => b.name).filter((n) => !n.startsWith('*') && !usedBlocks.has(n)),
    layers: doc.layers.filter((l) => l.name !== '0' && l.name.toUpperCase() !== 'DEFPOINTS' && !usedLayers.has(l.id)).map((l) => l.name),
    linetypes: doc.linetypes.map((l) => l.name).filter((n) => !fixed.has(n.toUpperCase()) && !doc.linetypeInUse(n)),
    dimstyles: doc.dimStyles.map((s) => s.name).filter((n) => n !== 'Standard' && !usedDims.has(n)),
  }
}

const wildcard = (list: string) => {
  const pats = list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i'))
  return (name: string) => pats.some((re) => re.test(name))
}

type Kind = 'Blocks' | 'Dimstyles' | 'LAyers' | 'LTypes'
const LABEL: Record<Kind, [string, string]> = { Blocks: ['block', 'blocks'], Dimstyles: ['dimension style', 'dimension styles'], LAyers: ['layer', 'layers'], LTypes: ['linetype', 'linetypes'] }

/**
 * PURGE: borra lo que no se usa (bloques, estilos de cota, capas, tipos de línea), con nombres o comodines y
 * confirmación opcional de cada uno. `All` repite hasta que no quede nada, así caen también los bloques anidados.
 */
export const purgeCommand: Command = {
  name: 'PURGE',
  aliases: ['PU', '-PURGE', '-PU'],
  description: 'Remove unused blocks, dimension styles, layers and linetypes [Blocks/Dimstyles/LAyers/LTypes/All]',
  async run(ctx) {
    const t = await ctx.getPoint('Enter type of unused objects to purge [Blocks/Dimstyles/LAyers/LTypes/All] <All>: ', {
      keywords: ['Blocks', 'Dimstyles', 'LAyers', 'LTypes', 'All'],
      enterKeyword: 'All',
      base: null,
    })
    if (t.kind !== 'keyword') return
    const names = await ctx.getString('Enter name(s) to purge <*>: ', { default: '*' })
    if (names === null) return
    const v = await ctx.getPoint('Verify each name to be purged? [Yes/No] <No>: ', { keywords: ['Yes', 'No'], enterKeyword: 'No', base: null })
    if (v.kind !== 'keyword') return
    const verify = v.keyword === 'Yes'
    const match = wildcard(names || '*')
    const kinds: Kind[] = t.keyword === 'All' ? ['Blocks', 'Dimstyles', 'LAyers', 'LTypes'] : [t.keyword as Kind]
    const count: Record<Kind, number> = { Blocks: 0, Dimstyles: 0, LAyers: 0, LTypes: 0 }
    const skipped = new Set<string>()
    for (let pass = 0; pass < 20; pass++) {
      let any = false
      const free = purgeable(ctx.doc, ctx.currentLayerId())
      const lists: Record<Kind, string[]> = { Blocks: free.blocks, Dimstyles: free.dimstyles, LAyers: free.layers, LTypes: free.linetypes }
      for (const k of kinds) {
        for (const name of lists[k].filter(match)) {
          if (skipped.has(`${k}:${name}`)) continue
          if (verify) {
            const a = await ctx.getPoint(`Purge ${LABEL[k][0]} "${name}"? [Yes/No] <No>: `, { keywords: ['Yes', 'No'], enterKeyword: 'No', base: null })
            if (a.kind === 'cancel') return
            if (a.kind !== 'keyword' || a.keyword !== 'Yes') {
              skipped.add(`${k}:${name}`)
              continue
            }
          }
          ctx.print(`Deleting ${LABEL[k][0]} "${name}".`)
          if (k === 'Blocks') ctx.doc.removeBlock(name)
          else if (k === 'Dimstyles') ctx.doc.deleteDimStyle(name)
          else if (k === 'LTypes') ctx.doc.deleteLinetype(name)
          else {
            const l = ctx.doc.layers.find((x) => x.name === name)
            if (l) new LayerService(ctx.doc).remove(l.id)
          }
          count[k]++
          any = true
        }
      }
      // Sólo los bloques liberan otros (anidados); lo demás se resuelve en una pasada.
      if (!any || (kinds.length === 1 && kinds[0] !== 'Blocks')) break
    }
    for (const k of kinds) {
      const n = count[k]
      ctx.print(n ? `${n} ${LABEL[k][n === 1 ? 0 : 1]} deleted.` : `No unreferenced ${LABEL[k][1]} found.`)
    }
    if (Object.values(count).some(Boolean)) ctx.doc.touch()
  },
}
