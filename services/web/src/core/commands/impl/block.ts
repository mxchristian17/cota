import { bulgeArc, bulgeAt, polylineSpans } from '../../geom/polyline'
import { hatchStrokes, isSolidHatch } from '../../hatch/geometry'
import { commonOf } from '../../document/common'
import { translateEntity } from '../../editing/edit'
import { defaultAttributes, expandEntities } from '../../editing/block'
import { askAttributeValues } from './attribs'
import type { Entity, EntityInput, PolylineProps } from '../../document/types'
import type { Vec3 } from '../../math'
import type { Command } from '../types'

/** BLOCK: crea (o redefine) una definición de bloque a partir de la selección y coloca una referencia. */
export const blockCommand: Command = {
  name: 'BLOCK',
  aliases: ['B'],
  description: 'Create a block definition from selected objects (and insert a reference)',
  async run(ctx) {
    const picked = await ctx.getSelection('Select objects: ')
    if (picked === null) return
    if (picked.length === 0) {
      ctx.print('No objects selected: a block needs at least one object.')
      return
    }
    // Los viewports de un layout no pueden formar parte de un bloque (como el CAD clásico): se descartan.
    const ids = picked.filter((id) => ctx.doc.getEntity(id)?.type !== 'VIEWPORT')
    if (ids.length < picked.length) ctx.print(`${picked.length - ids.length} viewport(s) excluded from the block.`)
    if (ids.length === 0) {
      ctx.print('Nothing left to make the block from.')
      return
    }
    const name = (await ctx.getString('Block name: '))?.trim()
    if (!name) {
      ctx.print('Block name required.')
      return
    }
    const base = await ctx.getPoint('Specify base point: ')
    if (base.kind !== 'point') return
    const bx = base.point.x
    const by = base.point.y
    const bz = base.point.z
    // Geometría de la definición: entidades relativas al punto base (base → origen del bloque).
    const defEntities: Entity[] = []
    for (const id of ids) {
      const e = ctx.doc.getEntity(id)
      if (!e) continue
      const clone = { id: e.id, type: e.type, layer: e.layer, props: structuredClone(e.props) } as Entity
      translateEntity(clone, -bx, -by, -bz)
      defEntities.push(clone)
    }
    if (defEntities.length === 0) return
    const redefining = ctx.doc.getBlock(name) !== undefined
    ctx.doc.setBlock({ name, entities: defEntities })
    for (const id of ids) ctx.doc.removeEntity(id) // reemplaza las fuentes por una referencia
    ctx.app.clearSelection()
    const attributes = defaultAttributes(ctx.doc.getBlock(name))
    ctx.doc.addEntity({
      type: 'INSERT',
      layer: ctx.currentLayerId(),
      props: { name, position: [bx, by, bz], scale: [1, 1, 1], rotation: 0, ...(attributes.length ? { attributes } : {}) },
    })
    ctx.print(
      redefining
        ? `Block "${name}" redefined (${defEntities.length} object(s)); all inserts updated.`
        : `Block "${name}" defined (${defEntities.length} object(s)).`,
    )
  },
}

/** INSERT: coloca una referencia a un bloque existente (punto de inserción, escala y rotación). */
export const insertCommand: Command = {
  name: 'INSERT',
  aliases: ['I', 'DDINSERT'],
  // En una UCS el bloque se apoya en su plano XY, con su X sobre la X de la UCS.
  planar: true,
  description: 'Insert a block reference',
  async run(ctx) {
    // Los bloques anónimos (`*VIEWn` de las vistas de dibujo) no se insertan a mano, como en el CAD clásico.
    const blocks = ctx.doc.blocks.filter((b) => !b.name.startsWith('*'))
    if (blocks.length === 0) {
      ctx.print('No blocks defined. Use BLOCK first.')
      return
    }
    const name = (await ctx.getString(`Block name [${blocks.map((b) => b.name).join(', ')}] <${blocks[0].name}>: `, { default: blocks[0].name }))?.trim()
    if (!name) return
    if (!ctx.doc.getBlock(name)) {
      ctx.print(`Block "${name}" not found.`)
      return
    }
    const ip = await ctx.getPoint('Specify insertion point: ')
    if (ip.kind !== 'point') return
    const sxStr = await ctx.getString('X scale factor <1>: ', { default: '1' })
    const sf = Number(sxStr)
    const scale = isFinite(sf) && sf !== 0 ? sf : 1
    const rotStr = await ctx.getString('Rotation angle <0>: ', { default: '0' })
    const deg = Number(rotStr)
    // Atributos del bloque: se piden antes de crear la referencia (ESC cancela la inserción).
    const attributes = await askAttributeValues(ctx, name)
    if (!attributes) return
    ctx.doc.addEntity({
      type: 'INSERT',
      layer: ctx.currentLayerId(),
      props: {
        name,
        position: [ip.point.x, ip.point.y, ip.point.z],
        scale: [scale, scale, scale],
        rotation: (isFinite(deg) ? deg : 0) * (Math.PI / 180),
        ...(attributes.length ? { attributes } : {}),
      },
    })
    ctx.print(`Inserted "${name}".`)
  },
}

/**
 * Piezas de una polilínea o un rectángulo (líneas y arcos, sin ancho) o las líneas de un sombreado de
 * patrón, como el EXPLODE del CAD clásico. null si no se descompone así.
 */
export function explodeCurveLike(e: Entity): EntityInput[] | null {
  const piece = (type: 'LINE' | 'ARC', props: EntityInput['props']): EntityInput => ({ type, layer: e.layer, props, ...commonOf(e) })
  if (e.type === 'POLYLINE' || e.type === 'RECTANGLE') {
    const p: PolylineProps =
      e.type === 'POLYLINE'
        ? e.props
        : (() => {
            const [x, y, z] = e.props.corner
            const { width: w, height: h } = e.props
            return { vertices: [[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]] as Vec3[], closed: true }
          })()
    return polylineSpans(p).map(([i, j]) => {
      const arc = bulgeArc(p.vertices[i], p.vertices[j], bulgeAt(p, i), p.normal)
      return arc ? piece('ARC', arc) : piece('LINE', { start: [...p.vertices[i]] as Vec3, end: [...p.vertices[j]] as Vec3 })
    })
  }
  if (e.type === 'HATCH') {
    if (isSolidHatch(e.props)) return null
    return hatchStrokes(e.props).segs.map(([a, b]) => piece('LINE', { start: a, end: b }))
  }
  return null
}

/** EXPLODE: bloques → sus objetos; polilíneas → líneas y arcos; sombreados → líneas. */
export const explodeCommand: Command = {
  name: 'EXPLODE',
  aliases: ['X'],
  description: 'Explode block references, polylines and hatches into their component objects',
  async run(ctx) {
    const ids = await ctx.getSelection('Select objects: ')
    if (ids === null || ids.length === 0) return
    let n = 0
    let failed = 0
    for (const id of ids) {
      const e = ctx.doc.getEntity(id)
      if (!e) continue
      if (e.type !== 'INSERT') {
        const parts = explodeCurveLike(e)
        if (!parts) {
          failed++
          continue
        }
        for (const p of parts) ctx.doc.addEntity(p)
        ctx.doc.removeEntity(id)
        n++
        continue
      }
      // Como el CAD clásico: los atributos vuelven a ser ATTDEF (se ve el tag; los valores se pierden).
      for (const child of expandEntities([e], ctx.doc.blocks, { attdefs: true, keepLayers: true })) {
        ctx.doc.addEntity({ type: child.type, layer: child.layer, props: structuredClone(child.props), ...commonOf(child) })
      }
      ctx.doc.removeEntity(id)
      n++
    }
    ctx.app.clearSelection()
    if (failed) ctx.print(`${failed} ${failed === 1 ? 'was' : 'were'} not able to be exploded.`)
    if (n) ctx.doc.touch()
    else if (!failed) ctx.print('No objects to explode.')
  },
}
