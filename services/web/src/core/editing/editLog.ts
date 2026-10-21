import { commonOf } from '../document/common'
import type { Entity, EntityInput } from '../document/types'
import type { DocumentModel } from '../document/DocumentModel'

/**
 * Registro de operaciones **dentro** de un comando (la opción `Undo` de TRIM, EXTEND, OFFSET,
 * LENGTHEN…). Cada paso guarda las entidades quitadas (con su id) y los ids agregados, de
 * modo que deshacer restaura exactamente el estado previo aunque los pasos se encadenen.
 */
interface Step {
  removed: Entity[]
  added: string[]
}

export class EditLog {
  private readonly steps: Step[] = []

  constructor(private readonly doc: DocumentModel) {}

  get size(): number {
    return this.steps.length
  }

  /** Reemplaza una entidad por otras (misma capa). Devuelve los ids nuevos. */
  replace(e: Entity, inputs: Array<Omit<EntityInput, 'layer'>>): string[] {
    const added = inputs.map((inp) => this.doc.addEntity({ ...commonOf(e), ...inp, layer: e.layer }).id)
    this.doc.removeEntity(e.id)
    this.steps.push({ removed: [structuredClone(e)], added })
    this.doc.touch()
    return added
  }

  /** Agrega entidades nuevas como un paso. */
  add(inputs: EntityInput[]): string[] {
    const added = inputs.map((inp) => this.doc.addEntity(inp).id)
    this.steps.push({ removed: [], added })
    this.doc.touch()
    return added
  }

  /** Borra entidades como un paso (eRase de TRIM, Erase de OFFSET). */
  erase(ids: string[]): number {
    const removed: Entity[] = []
    for (const id of ids) {
      const e = this.doc.getEntity(id)
      if (!e) continue
      removed.push(structuredClone(e))
      this.doc.removeEntity(id)
    }
    if (removed.length) {
      this.steps.push({ removed, added: [] })
      this.doc.touch()
    }
    return removed.length
  }

  /**
   * Agrupa en un solo paso todo lo hecho desde que el registro tenía `size` pasos (Fence/Crossing de
   * TRIM, OFFSET con Erase = crear + borrar el origen), para que `Undo` lo deshaga de una vez.
   */
  squash(size: number): void {
    while (this.steps.length > size + 1) {
      const last = this.steps.pop() as Step
      const prev = this.steps[this.steps.length - 1]
      // Una entidad creada y quitada dentro del mismo grupo no debe reaparecer al deshacer.
      for (const e of last.removed) {
        const i = prev.added.indexOf(e.id)
        if (i >= 0) prev.added.splice(i, 1)
        else prev.removed.push(e)
      }
      prev.added.push(...last.added)
    }
  }

  /** Deshace el último paso. False si no hay nada para deshacer. */
  undo(): boolean {
    const s = this.steps.pop()
    if (!s) return false
    for (const id of s.added) this.doc.removeEntity(id)
    for (const e of s.removed) this.doc.restoreEntity(e)
    this.doc.touch()
    return true
  }
}
