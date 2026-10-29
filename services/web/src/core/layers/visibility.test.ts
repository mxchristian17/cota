import { describe, expect, it } from 'vitest'
import type { Layer } from '../document/types'
import { hiddenLayerIds, layerEditable, layerShown, layerVisible } from './visibility'

const layer = (patch: Partial<Layer>): Layer => ({
  id: 'l',
  name: 'L',
  color: '#ffffff',
  lineWeight: 0.25,
  lineType: 'CONTINUOUS',
  locked: false,
  visible: true,
  printable: true,
  ...patch,
})

describe('estados de capa (como en el CAD clásico)', () => {
  it('congelada: no se ve, no da snaps, no se selecciona ni se imprime', () => {
    const f = layer({ frozen: true })
    expect(layerVisible(f)).toBe(false)
    expect(layerShown(f)).toBe(false)
    expect(layerEditable(f)).toBe(false)
    expect([...hiddenLayerIds([f, layer({ id: 'v' })])]).toEqual(['l'])
  })
  it('bloqueada: se ve pero no se edita; apagada: no se ve', () => {
    expect(layerVisible(layer({ locked: true }))).toBe(true)
    expect(layerEditable(layer({ locked: true }))).toBe(false)
    expect(layerVisible(layer({ visible: false }))).toBe(false)
  })
})
