import type { InsertProps } from '../document/types'
import type { DxfBlockSpec, DxfEntitySpec, DxfImportResult } from './dxf'

/** Referencia externa de un dibujo abierto: el bloque que la representa y la ruta con que se guardó. */
export interface XrefRef {
  name: string
  path: string
  overlay?: boolean
}

/** Referencias externas del resultado de una importación que todavía no tienen contenido. */
export function xrefsOf(r: DxfImportResult): XrefRef[] {
  return (r.blocks ?? []).filter((b) => b.xref && !b.entities.length).map((b) => ({ name: b.name, path: b.xref!.path, ...(b.xref!.overlay ? { overlay: true } : {}) }))
}

/** Nombre del archivo de una ruta guardada (con barras de Windows o de Unix). */
export function xrefFileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? ''
}

/**
 * Dónde buscar el archivo de una referencia dentro de la carpeta del dibujo (`folder`, relativa a la carpeta de
 * trabajo): primero su ruta relativa, si se guardó así (`.\\piezas\\base.dwg`), y después sólo el nombre, junto al
 * dibujo. Una ruta absoluta (`C:\\…`, `/home/…`) es de otra computadora: sólo vale el nombre.
 */
export function xrefCandidates(path: string, folder: string): { folder: string; file: string }[] {
  const file = xrefFileName(path)
  if (!file) return []
  const out: { folder: string; file: string }[] = []
  const absolute = /^([a-z]:)?[\\/]/i.test(path) || /^\\\\/.test(path)
  if (!absolute) {
    const parts = folder ? folder.split('/').filter(Boolean) : []
    const segs = path.split(/[\\/]/).filter(Boolean)
    segs.pop()
    let ok = true
    for (const s of segs) {
      if (s === '.') continue
      if (s === '..') {
        if (!parts.length) ok = false
        else parts.pop()
      } else parts.push(s)
    }
    if (ok) out.push({ folder: parts.join('/'), file })
  }
  if (!out.some((c) => c.folder === folder)) out.push({ folder, file })
  return out
}

/**
 * Pone en el bloque `name` de `r` el modelo del archivo de la referencia (`x`), como el CAD clásico: las capas de la
 * referencia pasan a llamarse `NOMBRE|capa` (la 0 sigue siendo la 0), sus bloques `NOMBRE|bloque`, y sus estilos de cota
 * y tipos de línea se agregan si no existen. Las referencias anidadas en la referencia quedan vacías.
 */
export function attachXref(r: DxfImportResult, name: string, x: DxfImportResult): void {
  const block = r.blocks?.find((b) => b.name === name)
  if (!block) return
  const layer = (l: string) => (l === '0' ? '0' : `${name}|${l}`)
  const blockNames = new Set((x.blocks ?? []).map((b) => b.name))
  const moved = (e: DxfEntitySpec): DxfEntitySpec => {
    const props = e.type === 'INSERT' && blockNames.has((e.props as InsertProps).name) ? { ...(e.props as InsertProps), name: `${name}|${(e.props as InsertProps).name}` } : e.props
    return { ...e, layerName: layer(e.layerName), props }
  }
  const known = new Set(r.layers.map((l) => l.name.toLowerCase()))
  for (const l of x.layers) {
    const n = layer(l.name)
    if (known.has(n.toLowerCase())) continue
    known.add(n.toLowerCase())
    r.layers.push({ ...l, name: n })
  }
  const nested: DxfBlockSpec[] = (x.blocks ?? []).map((b) => ({ ...b, name: `${name}|${b.name}`, entities: b.entities.map(moved) }))
  r.blocks = [...(r.blocks ?? []).filter((b) => !nested.some((n) => n.name === b.name)), ...nested]
  block.entities = x.entities.map(moved)
  // Capas que usa la referencia sin definirlas en su tabla (un DXF sin TABLES): se crean, como al abrirla sola.
  for (const e of [...block.entities, ...nested.flatMap((b) => b.entities)]) {
    if (known.has(e.layerName.toLowerCase())) continue
    known.add(e.layerName.toLowerCase())
    r.layers.push({ name: e.layerName, color: '#ffffff', lineWeight: 0.25, lineType: 'CONTINUOUS', visible: true, locked: false, printable: true, frozen: false })
  }
  for (const d of x.dimStyles) if (!r.dimStyles.some((s) => s.name === d.name)) r.dimStyles.push(d)
  for (const t of x.linetypes) if (!r.linetypes.some((s) => s.name.toLowerCase() === t.name.toLowerCase())) r.linetypes.push(t)
}
