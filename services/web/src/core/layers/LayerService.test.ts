import { describe, it, expect } from 'vitest'
import { DocumentModel } from '../document/DocumentModel'
import { LayerService } from './LayerService'

const setup = () => {
  const doc = DocumentModel.createDefault()
  return new LayerService(doc)
}

describe('LayerService', () => {
  it('crea un layer nuevo con color por defecto asignado', () => {
    const svc = setup()
    const l = svc.create('Walls')
    expect(l.name).toBe('Walls')
    expect(l.color).toMatch(/^#/)
    expect(svc.list()).toHaveLength(2)
  })

  it('rechaza nombres duplicados (case-insensitive)', () => {
    const svc = setup()
    svc.create('Walls')
    expect(() => svc.create('walls')).toThrow(/already exists/)
  })

  it('rechaza nombre vacío', () => {
    const svc = setup()
    expect(() => svc.create('   ')).toThrow(/empty/)
  })

  it('actualiza color, visibilidad, bloqueo y line weight', () => {
    const svc = setup()
    const l = svc.create('Walls')
    svc.setColor(l.id, '#123456')
    svc.setVisible(l.id, false)
    svc.setLocked(l.id, true)
    svc.setLineWeight(l.id, 0.5)
    const got = svc.get(l.id)!
    expect(got.color).toBe('#123456')
    expect(got.visible).toBe(false)
    expect(got.locked).toBe(true)
    expect(got.lineWeight).toBe(0.5)
  })

  it('elimina un layer', () => {
    const svc = setup()
    const l = svc.create('Temp')
    expect(svc.list()).toHaveLength(2)
    svc.remove(l.id)
    expect(svc.list()).toHaveLength(1)
    expect(svc.get(l.id)).toBeUndefined()
  })

  it('renombra validando unicidad', () => {
    const svc = setup()
    const a = svc.create('A')
    svc.create('B')
    expect(() => svc.rename(a.id, 'B')).toThrow(/already exists/)
    svc.rename(a.id, 'C')
    expect(svc.get(a.id)!.name).toBe('C')
  })
})
