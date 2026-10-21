import type { DocumentModel } from '../document/DocumentModel'
import type { Layer } from '../document/types'

const DEFAULT_COLORS = ['#ffffff', '#ff0000', '#00ff00', '#00ffff', '#ffff00', '#ff00ff', '#ff8000']

/** Operaciones sobre la colección de layers del documento. */
export class LayerService {
  constructor(private readonly doc: DocumentModel) {}

  list(): Layer[] {
    return this.doc.layers
  }

  get(id: string): Layer | undefined {
    return this.doc.layers.find((l) => l.id === id)
  }

  private uid(): string {
    let max = 0
    for (const l of this.doc.layers) {
      const m = /^L(\d+)$/.exec(l.id)
      if (m) max = Math.max(max, Number(m[1]))
    }
    return 'L' + (max + 1)
  }

  private existsName(name: string, exceptId?: string): boolean {
    return this.doc.layers.some(
      (l) => l.id !== exceptId && l.name.toLowerCase() === name.toLowerCase(),
    )
  }

  create(name: string, opts: Partial<Layer> = {}): Layer {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Layer name cannot be empty')
    if (this.existsName(trimmed)) throw new Error(`Layer "${trimmed}" already exists`)
    const color = opts.color ?? DEFAULT_COLORS[this.doc.layers.length % DEFAULT_COLORS.length]
    const layer: Layer = {
      id: opts.id ?? this.uid(),
      name: trimmed,
      color,
      lineWeight: opts.lineWeight ?? 0.25,
      // El tipo se carga en la tabla del dibujo (de la biblioteca si hace falta).
      lineType: (opts.lineType && this.doc.loadLinetype(opts.lineType)?.name) || 'CONTINUOUS',
      locked: opts.locked ?? false,
      visible: opts.visible ?? true,
      printable: opts.printable ?? true,
      ...(opts.frozen ? { frozen: true } : {}),
      ...(opts.newVpFreeze ? { newVpFreeze: true } : {}),
    }
    this.doc.layers.push(layer)
    this.doc.touch()
    return layer
  }

  rename(id: string, name: string): void {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Layer name cannot be empty')
    if (this.existsName(trimmed, id)) throw new Error(`Layer "${trimmed}" already exists`)
    const l = this.get(id)
    if (l) {
      l.name = trimmed
      this.doc.touch()
    }
  }

  setColor(id: string, color: string): void {
    const l = this.get(id)
    if (l) {
      l.color = color
      this.doc.touch()
    }
  }

  setVisible(id: string, visible: boolean): void {
    const l = this.get(id)
    if (l) {
      l.visible = visible
      this.doc.touch()
    }
  }

  /** Freeze/Thaw. Quien llama verifica que no sea la capa actual. */
  setFrozen(id: string, frozen: boolean): void {
    const l = this.get(id)
    if (!l) return
    if (frozen) l.frozen = true
    else delete l.frozen
    this.doc.touch()
  }

  setLocked(id: string, locked: boolean): void {
    const l = this.get(id)
    if (l) {
      l.locked = locked
      this.doc.touch()
    }
  }

  /** *New VP Freeze*: congelada por defecto en los viewports de layout que se creen. */
  setNewVpFreeze(id: string, frozen: boolean): void {
    const l = this.get(id)
    if (!l) return
    if (frozen) l.newVpFreeze = true
    else delete l.newVpFreeze
    this.doc.touch()
  }

  setLineWeight(id: string, lineWeight: number): void {
    const l = this.get(id)
    if (l) {
      l.lineWeight = lineWeight
      this.doc.touch()
    }
  }

  remove(id: string): void {
    const i = this.doc.layers.findIndex((l) => l.id === id)
    if (i >= 0) {
      this.doc.layers.splice(i, 1)
      this.doc.touch()
    }
  }
}
